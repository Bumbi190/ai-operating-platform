import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJob, runPilotJob, PILOT_OPERATIONS } from './local-broker.mjs';

test('only named pilot recipes are offered', () => {
  assert.deepEqual(PILOT_OPERATIONS, ['photocraft.convert-webp', 'filmcraft.demo-export-mp4']);
  assert.equal(validateJob({id:'sample123',operation:'photocraft.convert-webp',
    inputName:'image01.png',quality:82}).quality, 82);
});

test('cannot inject paths, shell strings or unknown commands', () => {
  for (const bad of [
    {id:'bad', operation:'photocraft.convert-webp', inputName:'../secret.png', quality:80},
    {id:'bad', operation:'photocraft.convert-webp', inputName:'sub\\secret.png', quality:80},
    {id:'bad', operation:'photocraft.convert-webp', inputName:'bad.png', quality:30},
    {id:'bad', operation:'filmcraft.demo-export-mp4', extra:'--shell'},
    {id:'bad', operation:'filmcraft.run-command'},
    {id:'../bad', operation:'filmcraft.demo-export-mp4'},
    {id:'bad', operation:'photocraft.convert-webp', inputName:'safe.png',
      quality:80, output:'C:\\production'},
  ]) assert.throws(() => validateJob(bad));
});

test('no execution without an explicit local pilot switch', async () => {
  await assert.rejects(
    runPilotJob({id:'blocked123',operation:'filmcraft.demo-export-mp4'}),
    /explicit operator approval/,
  );
  await assert.rejects(
    runPilotJob({id:'blocked123',operation:'photocraft.convert-webp',
      inputName:'test.png',quality:82}),
    /explicit operator approval/,
  );
});
