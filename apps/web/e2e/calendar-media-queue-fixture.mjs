const projectId='10000000-0000-4000-8000-000000000020',owner='20000000-0000-4000-8000-000000000001';
let enabled=false,version=0;
const channel=(channel,success=false,video=false)=>({channel,tone:success?'success':'waiting',bindingWarning:null,label:success?'Publicerat · sparat kvitto':video?'Godkänd · video förbereds':'Godkänd · väntar på publicering'});
const item=(scriptId,title,partial=false,video=false)=>({scriptId,title,tone:'waiting',label:video?'Godkänd · video förbereds':'Godkänd · väntar på publicering',href:'/projects/ai-media-automation/scripts',channels:[channel('facebook',partial,video),channel('instagram',partial,video),channel('youtube',false,video)]});
export const mediaQueueFixture={reset(on){enabled=on;version=0},change(value){version=value},model(user,model){
 if(!enabled)return model;
 const owned=user===owner;
 return {...model,projects:owned?[...model.projects,{id:projectId,name:'The Prompt',color:'#70b6ff'}]:[],mediaQueue:{projectId:owned?projectId:null,available:true,truncated:false,readAt:'2026-10-26T10:00:00.000Z',items:owned?[...(version===2?Array.from({length:8},(_,i)=>({...item('old'+i,'Äldre film '+i),tone:'review',label:'Publiceringen behöver kontrolleras'})):[]),...(version!==1?[item('ready','Godkänd film')]:[]),item('preparing','Video förbereds',false,true),item('partial','YouTube väntar',true)]:[]}};
}};
