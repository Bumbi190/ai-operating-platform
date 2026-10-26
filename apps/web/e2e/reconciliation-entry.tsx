import React from 'react';
import {createRoot} from 'react-dom/client';
import {SocialReconciliationPanel} from '../components/social-launch/SocialReconciliationPanel';
const channel=new URLSearchParams(location.search).get('channel')==='facebook'?'facebook':'instagram';
createRoot(document.getElementById('root')!).render(<SocialReconciliationPanel projectId="project" postId="post" receipt={{id:'receipt',channel,version:3} as any} disabled={false} onComplete={()=>{document.body.dataset.completed='true'}}/>);
