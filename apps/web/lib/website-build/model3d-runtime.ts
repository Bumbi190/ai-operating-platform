import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'

export type Model3DRuntimeAsset={glb:string;poster:string;truthClass:'fictional_concept'|'real_vehicle_verified'}
export type Model3DRuntimeBehavior={kind:'model3d';triggerId:string;targetIds:string[];assetId:string}
export type Model3DRuntimeConfig={vehicle3dAssets?:Record<string,Model3DRuntimeAsset>;behaviors?:Model3DRuntimeBehavior[]}

const GLB_PATH=/^assets\/3d\/[a-f0-9]{64}\.glb$/
const POSTER_PATH=/^assets\/3d\/[a-f0-9]{64}\.(?:webp|png|jpe?g)$/

export function resolveModel3DAsset(config:Model3DRuntimeConfig,behavior:Model3DRuntimeBehavior):Model3DRuntimeAsset{
 const asset=config?.vehicle3dAssets?.[behavior.assetId]
 if(!asset||!GLB_PATH.test(asset.glb)||!POSTER_PATH.test(asset.poster)||(asset.truthClass!=='fictional_concept'&&asset.truthClass!=='real_vehicle_verified'))throw Error('INVALID_MODEL3D_RUNTIME_ASSET')
 return asset
}

export function model3DControlPolicy(reducedMotion:boolean){
 return {
  autoRotate:false,
  enablePan:false,
  enableDamping:!reducedMotion,
  dampingFactor:reducedMotion?0:.07,
  minDistanceFactor:1.15,
  maxDistanceFactor:4.2,
  minPolarAngle:Math.PI*.12,
  maxPolarAngle:Math.PI*.82
 } as const
}

function fallback(root:HTMLElement,targets:HTMLElement[],reason:string){
 root.dataset.model3dState='fallback'
 root.dataset.model3dReason=reason
 root.hidden=true
 for(const target of targets)target.hidden=false
}

export async function mountVehicle3DViewer(root:HTMLElement,asset:Model3DRuntimeAsset,targets:HTMLElement[]):Promise<()=>void>{
 if(typeof window==='undefined'||typeof document==='undefined')throw Error('MODEL3D_BROWSER_REQUIRED')
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true
 const policy=model3DControlPolicy(reduced)
 root.dataset.model3dState='loading'
 root.hidden=false
 const poster=document.createElement('img')
 poster.src=asset.poster
 poster.alt=''
 poster.setAttribute('aria-hidden','true')
 poster.className='model3d-poster'
 const canvas=document.createElement('canvas')
 canvas.className='model3d-canvas'
 canvas.tabIndex=0
 const status=document.createElement('span')
 status.className='model3d-status'
 status.setAttribute('role','status')
 status.textContent='Laddar 3D-vy…'
 root.replaceChildren(poster,canvas,status)

 let renderer:THREE.WebGLRenderer
 try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'})
 }catch{
  fallback(root,targets,'webgl')
  return ()=>{}
 }
 renderer.outputColorSpace=THREE.SRGBColorSpace
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2))

 const scene=new THREE.Scene()
 const camera=new THREE.PerspectiveCamera(34,16/9,.05,200)
 const controls=new OrbitControls(camera,canvas)
 controls.enablePan=policy.enablePan
 controls.autoRotate=policy.autoRotate
 controls.enableDamping=policy.enableDamping
 controls.dampingFactor=policy.dampingFactor
 controls.minPolarAngle=policy.minPolarAngle
 controls.maxPolarAngle=policy.maxPolarAngle
 controls.listenToKeyEvents(window)

 scene.add(new THREE.HemisphereLight(0xffffff,0x18202a,2.25))
 const key=new THREE.DirectionalLight(0xffffff,3.4);key.position.set(4,6,5);scene.add(key)
 const rim=new THREE.DirectionalLight(0xefb563,1.5);rim.position.set(-4,3,-5);scene.add(rim)

 let frame=0,disposed=false
 const render=()=>{if(!disposed)renderer.render(scene,camera)}
 const resize=()=>{
  const rect=root.getBoundingClientRect()
  const width=Math.max(280,Math.round(rect.width||640))
  const height=Math.max(180,Math.round(rect.height||width*.56))
  renderer.setSize(width,height,false)
  camera.aspect=width/height
  camera.updateProjectionMatrix()
  render()
 }
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null
 observer?.observe(root)
 window.addEventListener('resize',resize,{passive:true})
 resize()

 const dispose=()=>{
  if(disposed)return
  disposed=true
  if(frame)cancelAnimationFrame(frame)
  observer?.disconnect()
  window.removeEventListener('resize',resize)
  controls.stopListenToKeyEvents()
  controls.dispose()
  renderer.dispose()
  scene.traverse(object=>{
   if(object instanceof THREE.Mesh){
    object.geometry?.dispose()
    const materials=Array.isArray(object.material)?object.material:[object.material]
    for(const material of materials)material?.dispose()
   }
  })
 }
 const loader=new GLTFLoader()
 await new Promise<void>((resolve)=>{
  loader.load(asset.glb,gltf=>{
   if(disposed){resolve();return}
   const model=gltf.scene
   scene.add(model)
   const initial=new THREE.Box3().setFromObject(model)
   const center=initial.getCenter(new THREE.Vector3())
   model.position.x-=center.x
   model.position.z-=center.z
   model.position.y-=initial.min.y
   const box=new THREE.Box3().setFromObject(model)
   const size=box.getSize(new THREE.Vector3())
   const extent=Math.max(size.x,size.y,size.z,.5)
   const target=new THREE.Vector3(0,size.y*.42,0)
   controls.target.copy(target)
   controls.minDistance=extent*policy.minDistanceFactor
   controls.maxDistance=extent*policy.maxDistanceFactor
   camera.near=Math.max(.02,extent/100)
   camera.far=Math.max(100,extent*20)
   camera.position.set(extent*1.55,extent*.72,extent*1.85)
   camera.updateProjectionMatrix()
   controls.update()
   for(const targetNode of targets)targetNode.hidden=true
   poster.remove()
   status.textContent='3D-vy redo. Dra för att rotera och scrolla eller nyp för att zooma.'
   root.dataset.model3dState='ready'
   render()
   if(policy.enableDamping){
    const tick=()=>{if(disposed)return;controls.update();render();frame=requestAnimationFrame(tick)}
    frame=requestAnimationFrame(tick)
   }else controls.addEventListener('change',render)
   resolve()
  },undefined,()=>{
   dispose()
   fallback(root,targets,'load')
   resolve()
  })
 })
 return dispose
}

export async function bootModel3D(doc:Document=document):Promise<void>{
 const raw=doc.getElementById('__atlas_config')?.textContent
 if(!raw)return
 let config:Model3DRuntimeConfig
 try{config=JSON.parse(raw)}catch{return}
 for(const behavior of config.behaviors??[]){
  if(behavior.kind!=='model3d')continue
  const root=doc.getElementById(behavior.triggerId)
  const targets=behavior.targetIds.map(id=>doc.getElementById(id)).filter((node):node is HTMLElement=>node instanceof HTMLElement)
  if(!(root instanceof HTMLElement)){continue}
  try{
   const asset=resolveModel3DAsset(config,behavior)
   await mountVehicle3DViewer(root,asset,targets)
  }catch{
   fallback(root,targets,'config')
  }
 }
}

if(typeof document!=='undefined')void bootModel3D()
