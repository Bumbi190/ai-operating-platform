import base64,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from workers.sales.mailbox.probe import probe_strato
from workers.sales.mailbox.setup import process_mailbox_setup
from workers.sales.journal import Journal
from workers.sales.tests import test_mailbox_probe as fixtures
SMTP=fixtures.SMTP
IMAP=fixtures.IMAP

class ChallengeSMTP(SMTP):
 def __init__(self,final=235):super().__init__();self.final=final
 def docmd(self,command,value=''):
  self.calls.append((command,value))
  if command=='AUTH':return (334,b'') if value=='PLAIN' else (500,b'initial AUTH line refused')
  if command=='*':return (501,b'cancelled')
  return self.final,b'PRIVATE_RESPONSE_CANARY'

class ProtocolTests(unittest.TestCase):
 def run_probe(self,smtp,password='unicode🔐å',**kwargs):
  imap=IMAP()
  result=probe_strato('info@example.se',password,{'smtp':lambda *a,**k:smtp,'imap':lambda *a,**k:imap},**kwargs)
  return result,imap
 def test_maximum_unicode_password_uses_one_bounded_plain_exchange(self):
  s=ChallengeSMTP();password='å'*1024;r,i=self.run_probe(s,password)
  self.assertIsNone(r['reasonCode']);self.assertIsNotNone(r['imapAuthenticatedAt'])
  auth=[c for c in s.calls if c[0]=='AUTH'];self.assertEqual(auth,[('AUTH','PLAIN')])
  response=s.calls[3][0]
  self.assertEqual(base64.b64decode(response),b'\0info@example.se\0'+password.encode())
  self.assertLessEqual(len('AUTH PLAIN\r\n'.encode()),512)
  self.assertEqual([c[0] for c in s.calls[-1:]],['QUIT'])
 def test_bad_credentials_are_not_retried_or_fallback_to_login(self):
  s=ChallengeSMTP(535);r,i=self.run_probe(s)
  self.assertEqual(r['reasonCode'],'SMTP_AUTH_FAILED');self.assertIsNone(r['smtpAuthenticatedAt']);self.assertEqual(i.calls,[])
  self.assertEqual(len([c for c in s.calls if c[0]=='AUTH']),1)
  self.assertEqual(len(s.calls),5)
 def test_repeated_challenge_is_cancelled_without_another_password_response(self):
  s=ChallengeSMTP(334);r,i=self.run_probe(s)
  self.assertEqual(r['reasonCode'],'SMTP_AUTH_FAILED');self.assertEqual(s.calls[-2:],[('*',''),('QUIT',)])
  self.assertEqual(len([c for c in s.calls if c[0]=='AUTH']),1);self.assertEqual(i.calls,[])
 def test_continuation_keeps_original_total_deadline(self):
  clock=[0]
  class SlowChallenge(ChallengeSMTP):
   def docmd(self,command,value=''):
    result=super().docmd(command,value)
    if command=='AUTH':clock[0]=11
    return result
  s=SlowChallenge()
  with patch('workers.sales.mailbox.probe.time.monotonic',side_effect=lambda:clock[0]):r,i=self.run_probe(s)
  self.assertEqual(r['reasonCode'],'CONNECTION_FAILED');self.assertEqual([c[0] for c in s.calls],['debug','EHLO','AUTH','*','QUIT']);self.assertEqual(i.calls,[])
 def test_diagnostic_distinguishes_reply_without_response_text_or_credentials(self):
  events=[];s=ChallengeSMTP(535);r,i=self.run_probe(s,diagnostic=events.append)
  self.assertEqual(len(events),1);self.assertEqual(events[0]['smtpReplyCode'],535);self.assertEqual(events[0]['phase'],'smtp_auth_response')
  self.assertEqual(events[0]['reasonCode'],'SMTP_AUTH_FAILED')
  self.assertEqual(set(events[0]),{'phase','smtpReplyCode','reasonCode','observedAt'})
  self.assertNotIn('PRIVATE_RESPONSE_CANARY',str(events));self.assertNotIn('unicode',str(events))
 def test_local_exception_message_never_reaches_diagnostic(self):
  class Broken(ChallengeSMTP):
   def docmd(self,*args):raise RuntimeError('PRIVATE_PASSWORD_CANARY')
  events=[];r,i=self.run_probe(Broken(),diagnostic=events.append)
  self.assertEqual(r['reasonCode'],'SMTP_AUTH_FAILED');self.assertEqual(events[0]['phase'],'smtp_auth_start');self.assertIsNone(events[0]['smtpReplyCode']);self.assertNotIn('PRIVATE_PASSWORD',str(events)+str(r))
 def test_diagnostic_io_failure_cannot_change_authentication_result(self):
  def fail(_):raise OSError('PRIVATE_PASSWORD_CANARY')
  r,i=self.run_probe(ChallengeSMTP(),diagnostic=fail);self.assertIsNone(r['reasonCode']);self.assertIsNotNone(r['imapAuthenticatedAt'])

class DiagnosticSetupTests(unittest.TestCase):
 def test_diagnostic_is_tied_to_setup_and_excluded_from_server_receipt(self):
  fixture=fixtures.MailboxTests();fixture.setUp();self.addCleanup(fixture.doCleanups)
  client,crypto,store,journal,_,_=fixture.setup_fixture();events=[]
  def probe(email,password,diagnostic=None):
   diagnostic({'phase':'smtp_auth_response','smtpReplyCode':535,'reasonCode':'SMTP_AUTH_FAILED','observedAt':'2026-10-17T18:40:00Z'})
   return {'smtpAuthenticatedAt':None,'imapAuthenticatedAt':None,'localStored':False,'reasonCode':'SMTP_AUTH_FAILED'}
  process_mailbox_setup(client,crypto,store,journal,probe_fn=probe,diagnostic=events.append)
  self.assertEqual(events[0]['setupId'],'s');self.assertNotIn('smtpReplyCode',str(client.commits));self.assertIsNone(journal.load().get('active'));self.assertNotIn('PRIVATE_PASSWORD',str(events))
