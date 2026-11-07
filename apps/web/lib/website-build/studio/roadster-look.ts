import * as THREE from 'three'

/** Roadster-only evening reflections; no remote HDRI or generated texture. */
export function applyRoadsterLook(scene:THREE.Scene,model:THREE.Object3D){
 const card=document.createElement('canvas');card.width=1024;card.height=512
 const g=card.getContext('2d')!
 const sky=g.createLinearGradient(0,0,0,512)
 for(const [stop,color] of [[0,'#a6bdd4'],[.32,'#8197ad'],[.5,'#485665'],[.54,'#494743'],[1,'#1b2026']] as const)sky.addColorStop(stop,color)
 g.fillStyle=sky;g.fillRect(0,0,1024,512);g.filter='blur(18px)'
 for(const [x,y,w,h,color] of [[90,100,320,65,'#d3e0ed'],[520,130,240,45,'#f0d3ad'],[860,180,160,28,'#b0c7da']] as const){
  g.fillStyle=color;g.fillRect(x,y,w,h)
 }
 const environment=new THREE.CanvasTexture(card)
 environment.mapping=THREE.EquirectangularReflectionMapping
 environment.colorSpace=THREE.SRGBColorSpace
 scene.environment=environment;scene.environmentIntensity=.85
 const seen=new Set<THREE.Material>()
 model.traverse(object=>{
  if(!(object instanceof THREE.Mesh))return
  for(const material of (Array.isArray(object.material)?object.material:[object.material])){
   if(!(material instanceof THREE.MeshStandardMaterial)||seen.has(material))continue
   seen.add(material)
   if(material.name.startsWith('tripo_material_')){
    material.normalScale.set(.10,.10)
    // The atlas contains paint, tires and trim: refine red paint only.
    material.onBeforeCompile=shader=>{
     shader.fragmentShader=shader.fragmentShader
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
       float roadsterPaint = smoothstep(0.06,0.18,diffuseColor.r-max(diffuseColor.g,diffuseColor.b));
       roughnessFactor=mix(roughnessFactor,0.30,roadsterPaint);`)
      .replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
       metalnessFactor=mix(metalnessFactor,0.42,roadsterPaint);`)
    }
    material.customProgramCacheKey=()=> 'roadster-evening-paint-v1'
   }
   if(material.name==='Röktonat vindruteglas'){
    material.color.setRGB(.025,.04,.055);material.metalness=.06
    material.roughness=.18;material.envMapIntensity=.6;material.opacity=.66
    if(material instanceof THREE.MeshPhysicalMaterial){material.clearcoat=.45;material.clearcoatRoughness=.16}
   }
   material.needsUpdate=true
  }
 })
 return ()=>{scene.environment=null;environment.dispose()}
}
