"""Read-only private Unreal adapter; fixtures are synthetic, not live agents."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('office_presence.py')
if SOURCE.exists():
    import office_presence as presence
else:
    presence = None

PROJECT = '11111111-1111-4111-8111-111111111111'
AGENT = '22222222-2222-4222-8222-222222222222'
OTHER = '33333333-3333-4333-8333-333333333333'
NOW = datetime(2026, 11, 12, 14, 50, tzinfo=timezone.utc).timestamp()
STAMP = '2026-11-12T14:50:00.000Z'


def fixtures():
    binding = {
        'schemaVersion': 1, 'source': 'AUTHENTICATED_PROJECT_AGENT_MATCH_V036',
        'verifiedIdentity': True, 'verifiedAt': STAMP,
        'project': {'id': PROJECT, 'slug': 'synthetic-project', 'name': 'Testprojekt'},
        'agent': {'id': AGENT, 'name': 'Testagent', 'description': 'Private description'},
        'character': 'pling', 'executionStatus': 'not_verified', 'public3dBinding': 'none',
    }
    snapshot = {
        'schemaVersion': 2, 'dataSource': 'authorized_organisation_read',
        'generatedAt': STAMP, 'liveData': True,
        'availability': {'projects': True, 'agents': True, 'activity': True, 'stepEvidence': True},
        'projects': [{'id': PROJECT, 'slug': 'synthetic-project', 'name': 'Testprojekt',
            'runningRuns': 7, 'agents': [{'id': AGENT, 'name': 'Testagent',
                'membershipEvidence': 'unavailable', 'executionEvidence': 'unavailable',
                'stepRequest': None}]}],
    }
    return binding, snapshot


class PresenceTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(presence, 'Private Office presence receiver is missing')
        self.receiver = presence.PresenceReceiver(
            presence.AvatarBinding('office-test-pling', PROJECT, AGENT))
        self.binding, self.snapshot = fixtures()

    def accept(self, **kwargs):
        return self.receiver.accept(self.binding, self.snapshot, now=kwargs.get('now', NOW))

    def test_no_data_means_unknown_and_never_idle_or_working(self):
        view = self.receiver.view(now=NOW)
        self.assertEqual((view['data_state'], view['identity'], view['execution']),
                         ('unavailable', 'unknown', 'not_verified'))
        self.assertEqual(view['status_text'], 'Ingen verifierad anslutning')
        self.assertFalse(view['work_verified'])
        self.assertEqual(view['animation'], 'ambient')

    def test_exact_registered_identity_binds_only_the_selected_avatar(self):
        view = self.accept()
        self.assertEqual((view['avatar_id'], view['identity'], view['data_state']),
                         ('office-test-pling', 'verified', 'fresh'))
        self.assertEqual((view['project_text'], view['agent_text']), ('Testprojekt', 'Testagent'))
        self.assertEqual(view['status_text'], 'Identitet verifierad · arbetsstatus okänd')

    def test_running_workflow_and_live_data_never_prove_agent_execution(self):
        self.snapshot['projects'][0]['agents'][0]['working'] = True
        self.snapshot['projects'][0]['agents'][0]['executionEvidence'] = 'running'
        view = self.accept()
        self.assertEqual(view['execution'], 'not_verified')
        self.assertFalse(view['work_verified'])
        self.assertEqual(view['animation'], 'ambient')

    def test_fresh_step_request_is_only_a_log_indication(self):
        self.snapshot['projects'][0]['agents'][0]['stepRequest'] = {
            'kind': 'step_request_waiting_for_reply', 'runId': OTHER,
            'stepOrder': 2, 'observedAt': STAMP, 'label': 'caller label ignored',
        }
        view = self.accept()
        self.assertEqual(view['status_text'], 'Stegbegäran registrerad · körning ej verifierad')
        self.assertEqual(view['step_reference'], {'run_id': OTHER, 'step_order': 2})
        self.assertFalse(view['work_verified'])

    def test_snapshot_expires_without_another_message(self):
        self.accept()
        view = self.receiver.view(now=NOW + 20)
        self.assertEqual((view['data_state'], view['identity']), ('stale', 'unknown'))
        self.assertEqual(view['status_text'], 'Anslutning inaktuell · arbetsstatus okänd')
        self.assertIsNone(view['step_reference'])

    def test_replayed_snapshot_cannot_extend_its_expiration(self):
        first = self.accept()
        again = self.accept(now=NOW + 19)
        self.assertEqual(first['expires_at_unix'], again['expires_at_unix'])
        self.assertEqual(self.receiver.view(now=NOW + 20)['data_state'], 'stale')

    def test_future_stale_or_naive_timestamps_do_not_verify_identity(self):
        for stamp in ['2026-11-12T14:49:00Z', '2026-11-12T15:50:00Z',
                      '2026-11-12T14:50:00', 'not a date']:
            with self.subTest(stamp=stamp):
                binding, snapshot = fixtures()
                snapshot['generatedAt'] = stamp
                view = self.receiver.accept(binding, snapshot, now=NOW)
                self.assertEqual(view['identity'], 'unknown')

    def test_wrong_project_agent_or_slug_disconnects_instead_of_choosing_first(self):
        for part, field in [('project', 'id'), ('agent', 'id'), ('project', 'slug')]:
            with self.subTest(part=part, field=field):
                binding, snapshot = fixtures()
                binding[part][field] = OTHER
                self.accept()
                view = self.receiver.accept(binding, snapshot, now=NOW)
                self.assertEqual(view['identity'], 'unknown')
                self.assertEqual(view['project_text'], '')

    def test_duplicate_project_or_agent_identity_is_ambiguous(self):
        for duplicate in ['project', 'agent']:
            with self.subTest(duplicate=duplicate):
                binding, snapshot = fixtures()
                if duplicate == 'project': snapshot['projects'].append(deepcopy(snapshot['projects'][0]))
                else: snapshot['projects'][0]['agents'].append(deepcopy(snapshot['projects'][0]['agents'][0]))
                self.assertEqual(self.receiver.accept(binding, snapshot, now=NOW)['identity'], 'unknown')

    def test_unavailable_sources_remove_positive_identity_evidence(self):
        for key in ['projects', 'agents']:
            with self.subTest(key=key):
                self.accept()
                self.snapshot['availability'][key] = False
                self.assertEqual(self.accept()['identity'], 'unknown')
                self.snapshot['availability'][key] = True

    def test_unknown_version_source_and_non_pling_binding_fail_closed(self):
        for key, value in [('schemaVersion', True), ('source', 'mock'),
                           ('character', 'nova'), ('verifiedIdentity', 1), ('public3dBinding', 'public')]:
            with self.subTest(key=key):
                binding, snapshot = fixtures()
                binding[key] = value
                self.assertEqual(self.receiver.accept(binding, snapshot, now=NOW)['identity'], 'unknown')

    def test_private_content_commands_and_control_characters_never_reach_unreal(self):
        self.binding['agent']['name'] = 'Agent\n\u202eSafe'
        self.binding['agent']['system_prompt'] = 'private prompt must never leave adapter'
        self.snapshot['command'] = 'delete something'
        view = self.accept()
        self.assertEqual(view['agent_text'], 'Agent Safe')
        text = json.dumps(view)
        self.assertNotIn('private prompt', text)
        self.assertNotIn('Private description', text)
        self.assertNotIn('delete something', text)

    def test_output_file_contains_only_safe_projection_and_can_be_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'avatar.json'
            self.accept()
            presence.write_presence(target, self.receiver, now=NOW)
            self.assertEqual(json.loads(target.read_text())['identity'], 'verified')
            presence.write_presence(target, self.receiver, now=NOW + 25)
            self.assertEqual(json.loads(target.read_text())['data_state'], 'stale')
            self.assertEqual(sorted(p.name for p in Path(directory).iterdir()), ['avatar.json'])

    def test_expired_step_indication_does_not_outlive_its_ninety_seconds(self):
        self.snapshot['projects'][0]['agents'][0]['stepRequest'] = {
            'kind': 'step_request_waiting_for_reply', 'runId': OTHER,
            'stepOrder': 2, 'observedAt': '2026-11-12T14:48:31Z',
        }
        self.accept()
        view = self.receiver.view(now=NOW + 2)
        self.assertEqual(view['identity'], 'verified')
        self.assertIsNone(view['step_reference'])

    def test_malformed_optional_step_does_not_replace_confirmed_identity(self):
        self.snapshot['projects'][0]['agents'][0]['stepRequest'] = {'observedAt': 'bad'}
        self.assertEqual(self.accept()['identity'], 'verified')

    def test_returned_state_cannot_mutate_the_receivers_cached_projection(self):
        view = self.accept()
        view['work_verified'] = True
        view['agent_text'] = 'tampered'
        self.assertFalse(self.receiver.view(now=NOW)['work_verified'])
        self.assertEqual(self.receiver.view(now=NOW)['agent_text'], 'Testagent')

    def test_writer_rejects_caller_dicts_instead_of_serializing_private_data(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'avatar.json'
            forged = self.accept()
            forged.update(system_prompt='secret', work_verified=True)
            with self.assertRaises(TypeError):
                presence.write_presence(target, forged, now=NOW)
            self.assertFalse(target.exists())

    def test_file_carries_separate_deadline_for_old_step_evidence(self):
        self.snapshot['projects'][0]['agents'][0]['stepRequest'] = {
            'kind': 'step_request_waiting_for_reply', 'runId': OTHER,
            'stepOrder': 2, 'observedAt': '2026-11-12T14:48:31Z',
        }
        self.accept()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'avatar.json'
            presence.write_presence(target, self.receiver, now=NOW)
            frame = json.loads(target.read_text())
            self.assertEqual(frame['step_expires_at_unix'], NOW + 1)
            self.assertEqual(frame['expires_at_unix'], NOW + 20)

    def test_step_newer_than_snapshot_is_ignored_without_hiding_identity(self):
        self.snapshot['generatedAt'] = '2026-11-12T14:49:46Z'
        self.snapshot['projects'][0]['agents'][0]['stepRequest'] = {
            'kind': 'step_request_waiting_for_reply', 'runId': OTHER,
            'stepOrder': 2, 'observedAt': STAMP,
        }
        view = self.accept()
        self.assertEqual(view['identity'], 'verified')
        self.assertIsNone(view['step_reference'])

    def test_expired_frame_cannot_revive_after_clock_rollback_or_same_replay(self):
        self.accept()
        self.assertEqual(self.receiver.view(now=NOW + 21)['data_state'], 'stale')
        self.assertEqual(self.receiver.view(now=NOW + 10)['data_state'], 'stale')
        self.assertEqual(self.accept(now=NOW + 10)['data_state'], 'stale')

    def test_monotonic_deadline_expires_data_even_when_wall_clock_stalls(self):
        with patch.object(presence.time, 'monotonic', return_value=100):
            self.accept()
        with patch.object(presence.time, 'monotonic', return_value=121):
            self.assertEqual(self.receiver.view(now=NOW)['data_state'], 'stale')

    def test_older_but_correctly_scoped_snapshot_does_not_erase_fresher_identity(self):
        self.accept()
        old = deepcopy(self.snapshot)
        old['generatedAt'] = '2026-11-12T14:49:30Z'
        view = self.receiver.accept(self.binding, old, now=NOW + 5)
        self.assertEqual(view['identity'], 'verified')
        self.assertEqual(view['expires_at_unix'], NOW + 20)


if __name__ == '__main__':
    unittest.main()
