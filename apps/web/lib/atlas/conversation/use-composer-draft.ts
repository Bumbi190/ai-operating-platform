'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
type Source='text'|'voice'
export function useComposerDraft({draftKey,capture,captureError}:{draftKey:string;capture:((onTranscript:(text:string)=>void)=>()=>void)|null;captureError?:string|null}){
 const activeKey=useRef(draftKey),generation=useRef(0),cancel=useRef<(()=>void)|null>(null),captureRef=useRef(capture)
 if(activeKey.current!==draftKey){activeKey.current=draftKey;generation.current++}
 captureRef.current=capture
 const [draft,setDraft]=useState({key:draftKey,text:'',inputSource:'text' as Source,hydrated:false}),[capturing,setCapturing]=useState(false)
 useEffect(()=>{
  const key=draftKey;cancel.current?.();cancel.current=null;generation.current++;setCapturing(false)
  let text='',inputSource:Source='text'
  try{const saved=JSON.parse(sessionStorage.getItem(key)??'null');if(saved?.version===1&&typeof saved.text==='string'&&['text','voice'].includes(saved.inputSource)){text=saved.text;inputSource=saved.inputSource}}catch{}
  setDraft({key,text,inputSource,hydrated:true})
  return()=>{generation.current++;cancel.current?.();cancel.current=null}
 },[draftKey])
 useEffect(()=>{if(!draft.hydrated||draft.key!==draftKey)return;try{if(draft.text)sessionStorage.setItem(draftKey,JSON.stringify({version:1,text:draft.text,inputSource:draft.inputSource}));else sessionStorage.removeItem(draftKey)}catch{}},[draft,draftKey])
 useEffect(()=>{if(captureError){generation.current++;cancel.current?.();cancel.current=null;setCapturing(false)}},[captureError])
 const setText=useCallback((text:string,source?:Source)=>setDraft(old=>({key:draftKey,text,inputSource:source??(old.key===draftKey?old.inputSource:'text'),hydrated:true})),[draftKey])
 const toggleCapture=useCallback(()=>{
  if(cancel.current){generation.current++;cancel.current();cancel.current=null;setCapturing(false);return}
  if(!captureRef.current)return
  const key=draftKey,token=++generation.current;setCapturing(true)
  try{cancel.current=captureRef.current(text=>{if(activeKey.current!==key||generation.current!==token)return;cancel.current=null;setCapturing(false);setDraft({key,text,inputSource:'voice',hydrated:true})})}catch{cancel.current=null;setCapturing(false)}
 },[draftKey])
 const clear=useCallback(()=>{setDraft({key:draftKey,text:'',inputSource:'text',hydrated:true});try{sessionStorage.removeItem(draftKey)}catch{}},[draftKey])
 return {text:draft.key===draftKey?draft.text:'',inputSource:draft.key===draftKey?draft.inputSource:'text' as Source,capturing:draft.key===draftKey&&capturing,setText,toggleCapture,clear}
}
