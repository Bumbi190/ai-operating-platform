"""Integration check: actual TS producer DTOs -> private projection -> JSON file."""
from pathlib import Path
from datetime import datetime, timezone
import json
import sys
from office_presence import AvatarBinding, PresenceReceiver, write_presence

out = Path(sys.argv[1])
now = datetime(2026, 11, 12, 14, 50, tzinfo=timezone.utc).timestamp()
receiver = PresenceReceiver(AvatarBinding('office-test-pling',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'))
binding = json.loads((out/'binding.json').read_text(encoding='utf-8'))
snapshot = json.loads((out/'snapshot.json').read_text(encoding='utf-8'))
frame = receiver.accept(binding, snapshot, now=now)
assert frame['identity'] == 'verified' and frame['data_state'] == 'fresh', frame
assert frame['work_verified'] is False and frame['animation'] == 'ambient'
assert frame['status_text'] == 'Stegbegäran registrerad · körning ej verifierad'
assert frame['step_reference']['step_order'] == 2
write_presence(out/'unreal-presence-test.json', receiver, now=now)
text = (out/'unreal-presence-test.json').read_text(encoding='utf-8')
assert 'voiceId' not in text and 'system_prompt' not in text and 'description' not in text
expired = receiver.view(now=now+21)
assert expired['identity'] == 'unknown' and expired['data_state'] == 'stale'
write_presence(out/'unreal-presence-expired-test.json', receiver, now=now+21)
(out/'contract-proof.json').write_text(json.dumps({
    'synthetic': True, 'actual_typescript_producers': True, 'binding': 'verified',
    'execution': 'not_verified', 'expired_after_seconds': 20,
    'private_payload_fields_omitted': True
}), encoding='utf-8')
print('PASS: existing TS producer DTOs -> Python receiver -> private JSON file; expiry and privacy checked.')
