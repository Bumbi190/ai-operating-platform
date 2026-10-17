import unittest
from workers.sales.mailbox.inbox import read_inbox_batch,InboxReadError
from workers.sales.tests.inbox_socket_fixture import inbox_server
CONFIG={'folder':'INBOX','since':'2026-10-07T22:00:00Z','email':'info@example.se','selectedAddresses':[]}
CURSOR={'uidValidity':None,'scannedThroughUid':0,'epoch':0}
class InboxReaderTests(unittest.TestCase):
 def read(self,factory,config=None,cursor=None,selected=None):return read_inbox_batch(config or CONFIG,cursor or CURSOR,selected or [],'PRIVATE_PASSWORD_CANARY',client_factory=factory)
 def test_real_imaplib_examines_and_peeks_headers_without_using_seen(self):
  with inbox_server() as (state,factory):
   result=self.read(factory);self.assertEqual(result['uidValidity'],'10');self.assertEqual(result['records'][0]['uid'],12);self.assertEqual(result['records'][0]['header']['from'],'dealer@example.se');self.assertIsNone(result['records'][0]['text'])
   commands=str(state['commands']);self.assertIn('EXAMINE',commands);self.assertIn('BODY.PEEK[HEADER.FIELDS',commands);self.assertNotIn('UNSEEN',commands);self.assertNotIn('BODYSTRUCTURE',commands);self.assertNotIn('STORE',commands);self.assertNotIn('PRIVATE_PASSWORD',commands)
 def test_selected_contact_reads_only_eligible_text_with_plain_auth(self):
  with inbox_server() as (state,factory):
   result=self.read(factory,{**CONFIG,'selectedAddresses':['dealer@example.se']});r=result['records'][0]
   self.assertEqual(r['text'],'Tack åäö');self.assertEqual(r['textState'],'complete');self.assertRegex(r['contentSha256'],'^[a-f0-9]{64}$');self.assertEqual(state['authCount'],1);self.assertIn('BODY.PEEK[1]',str(state['commands']));self.assertNotIn('APPEND',str(state['commands']))
 def test_uid_outside_requested_range_is_never_persisted(self):
  with inbox_server(extraIds=[3,99],next=20) as (_,factory):
   result=self.read(factory,cursor={'uidValidity':'10','scannedThroughUid':10,'epoch':1});self.assertEqual([x['uid'] for x in result['records']],[12]);self.assertEqual(result['throughUid'],19)
 def test_more_than_twenty_results_leave_the_unprocessed_backlog(self):
  with inbox_server({uid:{} for uid in range(1,25)}) as (_,factory):
   result=self.read(factory);self.assertEqual(len(result['records']),20);self.assertEqual(result['throughUid'],20)
 def test_vanished_uid_has_explicit_status_without_invented_metadata(self):
  with inbox_server({12:{'vanished':True}}) as (_,factory):
   r=self.read(factory)['records'][0];self.assertEqual(r['textState'],'vanished');self.assertIsNone(r['header']);self.assertIsNone(r['internalDate'])
 def test_epoch_change_restarts_only_bounded_selected_history(self):
  with inbox_server(validity=11) as (state,factory):
   result=self.read(factory,cursor={'uidValidity':'10','scannedThroughUid':2000,'epoch':1});self.assertEqual(result['uidValidity'],'11');self.assertIn('UID 1:29',str(state['commands']));self.assertEqual(result['records'][0]['uid'],12)
 def test_explicit_old_text_request_does_not_move_scan_cursor(self):
  with inbox_server() as (_,factory):
   result=self.read(factory,cursor={'uidValidity':'10','scannedThroughUid':25,'epoch':1},selected=[{'messageId':'m','uid':12,'uidValidity':'10'}]);self.assertEqual(result['mode'],'selected_text');self.assertEqual(result['throughUid'],25);self.assertEqual(result['records'][0]['textState'],'complete')
 def test_date_boundary_excludes_older_internal_date(self):
  with inbox_server({12:{'date':b'07-Oct-2026 22:00:00 +0200'},13:{}}) as (state,factory):
   result=self.read(factory);self.assertEqual([x['uid'] for x in result['records']],[13]);self.assertIn('SINCE 06-Oct-2026',str(state['commands']))
 def test_attachment_text_parts_are_not_fetched(self):
  structure=b'("TEXT" "PLAIN" ("CHARSET" "UTF-8" "NAME" "secret.txt") NIL NIL "8BIT" 12 1 NIL ("ATTACHMENT" ("FILENAME" "secret.txt")))'
  with inbox_server({12:{'structure':structure}}) as (state,factory):
   r=self.read(factory,{**CONFIG,'selectedAddresses':['dealer@example.se']})['records'][0];self.assertEqual(r['textState'],'unsupported');self.assertIsNone(r['text']);self.assertNotIn('.MIME',str(state['commands']))
 def test_bad_auth_is_a_fixed_code_without_secret_or_raw_server_reply(self):
  with inbox_server(badAuth=True) as (state,factory):
   with self.assertRaises(InboxReadError) as caught:self.read(factory)
   self.assertEqual(str(caught.exception),'AUTH_FAILED');self.assertEqual(state['authCount'],1)

 def test_total_payload_budget_leaves_large_selected_mail_for_next_batch(self):
  import json
  with inbox_server({uid:{'body':b'A'*8192} for uid in range(1,10)}) as (_,factory):
   result=self.read(factory,{**CONFIG,'selectedAddresses':['dealer@example.se']});self.assertLess(len(result['records']),9);self.assertLessEqual(len(json.dumps(result,ensure_ascii=False).encode()),50000);self.assertEqual(result['throughUid'],result['records'][-1]['uid'])
 def test_invalid_uidvalidity_is_reconciling_instead_of_resetting_the_cursor(self):
  with inbox_server(validity=0) as (_,factory):
   with self.assertRaises(InboxReadError) as caught:self.read(factory)
   self.assertEqual(str(caught.exception),'RECONCILING')

 def test_total_deadline_interrupts_a_slow_but_continuously_active_literal(self):
  import time
  from unittest.mock import patch
  with inbox_server(slowLiteral=True) as (_,factory):
   started=time.monotonic()
   with patch('workers.sales.mailbox.inbox.TOTAL_TIMEOUT',0.2,create=True):
    with self.assertRaises(InboxReadError) as caught:self.read(factory)
   self.assertEqual(str(caught.exception),'CONNECTION_FAILED');self.assertLess(time.monotonic()-started,1)
