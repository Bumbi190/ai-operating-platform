# Reviewed manual social publication — design 2026-10-16

## Intent
Complete a small usable path from an exactly reviewed post to one project's own Facebook/Instagram account, with a durable receipt and no blind duplicate retry. André approved this next step; Familje-Stunden has those accounts. Implement/test without connecting real accounts or issuing live provider calls. Actual account connection and first public post remain a joint later action. Preserve The Prompt's independent pipeline and all budgets.

## Scope
Manual operator action only. Facebook text/link or a single JPEG image; Instagram a single JPEG image. Existing video and other-channel drafts remain preparable, with truthful unsupported notices. No automatic calendar worker, autonomous publication policy, paid generation or subscription. A dated draft must be edited to remove its calendar time and reviewed again before this first manual-now path. The calendar remains planning-only.
The selected canonical image must be an active owned JPEG, <=8MiB; verify downloaded bytes/SHA and actual dimensions before dispatch. Conservative initial image support: width320..1440, aspect0.8..1.91, valid JPEG. No silent crop, conversion, caption truncation or link insertion after review. Image caption is exact saved text; any desired URL must already be in that reviewed text (a separate linkUrl on image drafts must be present in text). Instagram caption <=2200; Facebook text <=5000. No invented tracking parameters after approval.

## Human and account authority
Only the platform operator who owns the project may request publication. POST is same-origin with a bounded closed body: operation=publish/check, projectId,postId,revisionId,sha256,decisionId,bindingId,idempotencyKey,confirmed=true for a publish. Client cannot provide caption, account, credential, URL or provider receipt.
Recheck the exact current post revision, positive editorial decision, current approved channel plan, active matching binding and media before accepting and before each provider write. Reuse canonical credential resolvers, which attest the actual provider identity; no default account or The Prompt fallback. Account/plan/media change or project/platform stop blocks a new side effect. An admitted external request cannot be recalled by a later stop.

## Durable state and idempotency
Server-only tables social_publications and social_publication_events (append-only). One record per post, with original client request, exact post/decision/plan/account references, requested_by, closed state, phase/version and bounded provider ids/permalink. No credentials/raw provider responses or media capability tokens in audit/read models.
States: requested(no provider write begun), creating(Instagram container write admitted), processing(known container; publish not yet admitted), publishing(public write admitted), published, failed(explicit provider rejection), uncertain(response/receipt lost or expired in-flight state).
A prepare RPC serializes by project/post and returns existing matching intent; changed intent/key cannot overwrite it. A compare-and-swap step RPC grants a specific phase once. Persist the phase BEFORE an outbound POST. HTTP repeats/double clicks do not reissue writes.
Instagram: claim create; POST /media; persist container; bounded GET status. FINISHED permits one claim_publish followed by POST /media_publish. IN_PROGRESS returns processing; operator can choose Kontrollera och slutför. Lost publish response NEVER permits another publish. A later GET status PUBLISHED may confirm published with link unavailable, without fabricating a media id. Unknown/expired container remains uncertain.
Facebook: claim publishing, one POST /feed or /photos; store provider id and safe receipt. Lost response => uncertain, no retry. A success followed by a DB failure leaves an in-flight record, never an automatic second POST.
Read-only views and exact replay may return prior receipts after stop. A check that would issue a new write still revalidates all authority.

## Private image delivery
Meta needs an image URL. Use a bounded-lived random32-byte capability tied to the publication, image id/hash and max15-minute expiry. Store SHA256 of capability only. The generated URL goes only to the fixed provider endpoint; never return it to the browser or audit it.
Public media GET validates opaque id/key, hashes key server-side, checks allowed publication phase/expiry, current active owned image and project stop. Download and verify actual bytes again, then stream JPEG/no-store/nosniff/no-referrer in bounded chunks. No arbitrary URL fetching or redirects. Published/failed capability is closed; unknown in-flight copy may remain available until expiry. All failures indistinguishable404, no sensitive path metadata.

## UI
Nested publication review below the saved post, keyed by project/post/revision. GET has no provider calls. Show exact account/channel and preparation blockers. An explicit checkbox plus Publicera nu på <kanal> is required; no automatic action on approval, mounting, calendar time or reconnect.
Keep unsaved edits from being published. Pending/succeeded/uncertain state replaces the send action, with a provider link only when known. Uncertain explains that the account must be checked before any new post. Processing offers Kontrollera och slutför naming the potential write. Abort/sequence-fence late responses after post/project switch.
Do not register a model publishing tool. Atlas's existing read/propose authority remains unchanged.

## Evidence and release
Real SQL ownership/conversation/decision/stop/account/media/concurrency/idempotency checks; fixture-provider tests inspect exact caption, fixed hosts and header credentials. Reproduce timeout/response-loss/receipt-store failure and concurrent attempts with exactly one write. API tests prove anonymous/nonoperator/foreign/extra authority fields make zero provider calls. Capability tests cover wrong/expired tokens, changed bytes, inactive assets, stop and bounded streaming.
Rendered mobile/desktop tests cover exact confirmation, failed preflight, processing/uncertain receipts and switched-post responses. Relevant existing suites/type/security checks; one independent review of both plans, fix important findings, exact migration verification/CI/locked merge/production. No real account or public post claimed.

## Primary references verified
Meta-owned SDK facebook/facebook-python-business-sdk main: facebook_business/adobjects/page.py create_photo defines POST /photos with message,url,published; iguser.py create_media defines POST /media with image_url/caption and create_media_publish defines POST /media_publish with creation_id. Existing canonical identity resolvers stay in use. Meta docs were not retrievable; source verification used the official SDK rather than third-party mirrors.
