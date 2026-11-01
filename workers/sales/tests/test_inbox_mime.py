import base64,unittest
from workers.sales.mailbox.mime_text import decode_text_part,select_text_part
class InboxMimeTests(unittest.TestCase):
 def test_unicode_plain_text_and_declared_transfer_encoding(self):
  r=decode_text_part(b'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n',base64.b64encode('Tack åäö'.encode()));self.assertEqual(r,{'text':'Tack åäö','textState':'complete'})
 def test_html_discards_active_content_and_never_fetches_links(self):
  r=decode_text_part(b'Content-Type: text/html; charset=utf-8\r\n\r\n',b'<script>steal()</script><p>Hej</p><img src="https://private.example/pixel"><style>hidden</style><p>Tack</p>');self.assertIn('Hej',r['text']);self.assertNotIn('steal',r['text']);self.assertNotIn('private.example',r['text']);self.assertNotIn('hidden',r['text']);self.assertNotIn('<',r['text'])
 def test_decoded_utf8_bound_is_visible_and_never_splits_a_character(self):
  r=decode_text_part(b'Content-Type: text/plain; charset=utf-8\r\n\r\n',('å'*5000).encode());self.assertEqual(r['textState'],'truncated');self.assertLessEqual(len(r['text'].encode()),8192)
 def test_unknown_charset_and_invalid_base64_are_fixed_unsupported_results(self):
  for headers,body in [(b'Content-Type: text/plain; charset=no-such-codec\r\n\r\n',b'x'),(b'Content-Transfer-Encoding: base64\r\n\r\n',b'%%%')]:self.assertEqual(decode_text_part(headers,body),{'text':None,'textState':'unsupported'})
 def test_tree_limits_and_attachment_exclusion(self):
  plain=[b'TEXT',b'PLAIN',[b'CHARSET',b'UTF-8'],None,None,b'8BIT',12,1]
  attachment=plain+[None,[b'ATTACHMENT',[b'FILENAME',b'x.txt']]]
  self.assertEqual(select_text_part([attachment,plain,b'MIXED']),{'section':'2','size':12});self.assertIsNone(select_text_part(attachment));deep=plain
  for _ in range(9):deep=[deep,b'MIXED']
  self.assertIsNone(select_text_part(deep));self.assertIsNone(select_text_part([*[plain]*51,b'MIXED']))

 def test_case_insensitive_bodystructure_type_names_still_select_text(self):
  self.assertEqual(select_text_part([b'text',b'plain',None,None,None,b'8bit',12,1]),{'section':'1','size':12})

class AttachmentContainerTests(unittest.TestCase):
 def test_multipart_attachment_cannot_expose_its_unlabelled_text_child(self):
  text=[b'TEXT',b'PLAIN',[b'CHARSET',b'UTF-8'],None,None,b'8BIT',12,1]
  attached=[text,b'MIXED',None,[b'ATTACHMENT',[b'FILENAME',b'private.mime']]]
  self.assertIsNone(select_text_part(attached))
 def test_inline_named_multipart_also_keeps_children_private(self):
  text=[b'TEXT',b'PLAIN',[b'CHARSET',b'UTF-8'],None,None,b'8BIT',12,1]
  named=[text,b'MIXED',[b'NAME',b'private.mime'],[b'INLINE',[b'FILENAME',b'private.mime']]]
  self.assertIsNone(select_text_part(named))
 def test_rfc2231_filename_families_exclude_entire_multipart_subtree(self):
  text=[b'TEXT',b'PLAIN',[b'CHARSET',b'UTF-8'],None,None,b'8BIT',12,1]
  for name in (b'NAME*',b'NAME*0*',b'FILENAME*',b'FILENAME*0*',b'filename*1'):
   with self.subTest(name=name):
    for container in ([text,b'MIXED',[name,b"utf-8''private.mime"],None],[text,b'MIXED',None,[b'INLINE',[name,b"utf-8''private.mime"]]]):
     self.assertIsNone(select_text_part(container))
