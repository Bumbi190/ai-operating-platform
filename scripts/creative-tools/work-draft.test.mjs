import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCreativeWorkDraft } from '../../apps/web/lib/media/creative-work-draft.ts';
import { planCreativeTask } from '../../apps/web/lib/media/creative-routing.ts';

const sha='a'.repeat(64);
const image={id:'00000000-0000-4000-8000-000000000001',projectId:'familje-stunden',
  kind:'image',status:'active',checksumSha256:sha};
const video={...image,kind:'video',id:'00000000-0000-4000-8000-000000000002'};
const make=(asset=image,intent='image-retouch')=>({
  workId:'creative001',projectId:'familje-stunden',intent,asset,editingGoal:'Improve title readability',
});

test('Atlas can propose a PhotoCraft operation but cannot execute or publish',()=>{
  const x=prepareCreativeWorkDraft(make(),planCreativeTask('image-retouch',['photocraft']));
  assert.equal(x.suggestedEngine,'photocraft');
  assert.equal(x.sourceAssetId,image.id);
  assert.equal(x.sourceChecksumSha256,sha);
  assert.equal(x.status,'draft');
  assert.equal(x.assetVisibility,'internal');
  assert.equal(x.remoteToolCall,null);
  assert.equal(x.executionAuthorized,false);
  assert.equal(x.publishAuthorized,false);
  assert.equal(x.requiresHumanApproval,true);
});

test('Video edit draft selects fallback when FilmCraft not discovered',()=>{
  const task=make(video,'video-timeline-edit');
  assert.equal(prepareCreativeWorkDraft(task,planCreativeTask(task.intent)).suggestedEngine,'remotion');
  assert.equal(prepareCreativeWorkDraft(task,planCreativeTask(task.intent,['filmcraft'])).suggestedEngine,'filmcraft');
});

test('Project scope, kind, integrity, status, goal and route are checked',()=>{
  const good=make(), route=planCreativeTask('image-retouch');
  for(const input of [
    {...good,asset:{...image,projectId:'handlarborsen'}},
    {...good,asset:video},
    {...good,asset:{...image,checksumSha256:'bad'}},
    {...good,asset:{...image,status:'archived'}},
    {...good,editingGoal:'X'},
    {...good,workId:'../unsafe'},
  ]) assert.throws(()=>prepareCreativeWorkDraft(input,route));
  assert.throws(()=>prepareCreativeWorkDraft(good,planCreativeTask('video-timeline-edit')));
  assert.throws(()=>prepareCreativeWorkDraft(good,{...route,executionAuthorized:true}));
});
