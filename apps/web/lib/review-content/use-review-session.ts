'use client';
import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
/** Parent server page supplies the authenticated owner; the UI clears on session notifications. */
export function useReviewSession(userId:string|undefined):boolean{
 const [state,setState]=useState({owner:userId,allowed:true});
 useEffect(()=>{
  if(!userId)return;
  let active=true;
  const {data}=createClient().auth.onAuthStateChange((_event,session)=>{if(active)setState({owner:userId,allowed:session?.user.id===userId});});
  return()=>{active=false;data.subscription.unsubscribe();};
 },[userId]);
 return state.owner===userId&&state.allowed;
}
