/**
 * Pure read-intent detector for the protected Handlarbörsen Strato inbox.
 *
 * FastPath and "visa" navigation must NOT intercept a clearly requested
 * real-inbox read. This is deliberately narrow: ambiguous requests use the
 * existing Atlas classifier, and this function cannot grant tool authority.
 *
 * Important: caller must separately check HB_STRATO_INBOX_READ_ENABLED and
 * whether the exact read-only tool exists in the active tool set. The actual
 * tool verifies the authenticated conversation, owner and project.
 */
const B='(?<![\\p{L}\\p{N}_])'
const E='(?![\\p{L}\\p{N}_])'
const STRATO = new RegExp(B+'strato(?:mail|mejl|mailen|mejlen|s)?'+E,'iu')
const HANDEL = new RegExp(B+'handlarb[öo]rsen(?:s)?'+E,'iu')
const MAILBOX = new RegExp(B+
  '(?:inkorg(?:en|s)?|inbox|mailbox|mejl(?:en|et|s)?|mail(?:en|et|s)?|e-?post(?:en)?|e-?mail(?:s)?|email(?:s)?|svar(?:en|et)?|repl(?:y|ies))'+E,'iu')
const READ = new RegExp(B+
  '(?:visa|visar|show|läs|läsa|läsning|read|hämta|fetch|kolla|kontrollera|check|sammanfatta|summera|summarize|summarise|översikt|overview|lista|list|senaste|nyaste|nya|new|latest|recent|hur\\s+många|how\\s+many|har\\s+det\\s+kommit|finns\\s+det)'+E,'iu')
// A write-first message is not a request to read the inbox, even when its
// eventual wording mentions earlier mail. Other messages still use the normal
// Atlas action policy; this route never forces sending.
const WRITE_FIRST = /^(?:(?:kan du|skulle du kunna|please|could you|can you)\s+)?(?:skicka|sänd|sända|radera|ta bort|svara på|reply to|send|delete|approve|godkänn|publicera|posta)(?![\p{L}\p{N}_])/iu

export function isHandlarborsenInboxReadIntent(text:unknown):boolean{
 if(typeof text!=='string'||text.length>1500)return false
 const value=text.normalize('NFC').trim()
 if(!value||WRITE_FIRST.test(value))return false
 if(!MAILBOX.test(value))return false
 return (STRATO.test(value)||HANDEL.test(value))&&READ.test(value)
}
