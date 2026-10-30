#!/usr/bin/env node
// Offline source staging for the owner's preview. Never uploads, publishes or calls paid APIs.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'
const project = path.join(os.homedir(), 'Projects', 'Familje-Stunden')
const remotion = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destRoot = path.join(remotion, 'public', 'content-studio-local', 'family-november')
const filesIn = (folder) => fs.readdirSync(folder)
const monthRoot = filesIn(project).find((s) => s.normalize('NFC') === 'Månads Teman 2026')
if (!monthRoot) throw new Error('HISTORICAL_MONTH_FOLDER_MISSING')
const themes = path.join(project, monthRoot)
const emotion = filesIn(themes).find((s) => s.normalize('NFC').toLowerCase() === 'känslomånaden-v2')
if (!emotion) throw new Error('HISTORICAL_APPROVED_AUDIO_MISSING')
const assets = [
  {name:'hero.png', sha256:'5789a09f28ad95334d5d1a3a08af3cc3d3201468d28f66f310da860db0815a76',
   source:path.join(project,'Worktrees','content-studio-nova-pling-20261017','public','images','months','november-preview.png'),
   role:'November approved Nova and Pling hero art'},
  {name:'activity.png', sha256:'ffd12c414aba2b71e2c39965c22e5c71f1028905eb5ed64217c054893604b31b',
   source:path.join(project,'00_Canonical','Game assets','November_Lov-och-Skuggmanaden_Activity_04_Board_Hjalp-Pling-genom-skogen.png'),
   role:'November canonical activity board'},
  {name:'music-bed.wav', sha256:'595fc8ea398d92bc0d2c6b0664fd9447da6e645a742a2116f90339bc6de21908',
   source:path.join(themes,emotion,'Social-content','Final','FINAL-v3-bygge','audio','music_bed_v2.wav'),
   role:'Instrumental from editor-approved September social master; preview use only'},
]
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
for (const a of assets) {
  const st = fs.lstatSync(a.source)
  if (!st.isFile() || st.isSymbolicLink()) throw new Error('INVALID_SOURCE_FILE: '+a.name)
  if (sha(a.source) !== a.sha256) throw new Error('SOURCE_HASH_CHANGED: '+a.name)
}
fs.mkdirSync(destRoot,{recursive:true})
const receipt = assets.map((a)=>{
  const dest=path.join(destRoot,a.name)
  if (fs.existsSync(dest) && sha(dest)!==a.sha256) throw new Error('STAGED_FILE_CHANGED: '+a.name)
  fs.copyFileSync(a.source,dest)
  if (sha(dest)!==a.sha256) throw new Error('COPY_HASH_MISMATCH: '+a.name)
  return {name:a.name,sha256:a.sha256,bytes:fs.statSync(dest).size,role:a.role}
})
fs.writeFileSync(path.join(destRoot,'source-manifest.json'),JSON.stringify({
  project:'familje-stunden',month:'2026-11',publishingEnabled:false,
  intendedUse:'Offline creative owner preview only; no generated Nova/Pling speech.',assets:receipt,
},null,2)+'\n')
console.log(JSON.stringify({status:'STAGED',destRoot,receipt},null,2))
