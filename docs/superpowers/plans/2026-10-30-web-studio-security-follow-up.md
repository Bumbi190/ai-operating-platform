# Web Studio: CodeQL follow-up in PR 368

Scope: continue the existing private reference Studio draft branch from f975acc. No scanner dismissal/exclusion, main merge/release, flag activation, SQL application, real customer data or paid model calls.

Preflight: reuse_existing / explicit_existing_pr368. Current observed main d0efe26; none of the four flagged helper files changed between the feature head and that main. Receipt .superpowers/security-pr-preflight-20261030.json.

## Findings and intended behavior

1. FileList/blob preview (js/xss-through-dom): React text escaping and image-only rendering do not establish an exploit, but local MIME is not content verification. Remove the unverified byte-display path. Show filename/status during upload; show a preview only after ready, via the existing authenticated project/conversation/ticket/asset/hash image boundary.
2. Navigation regex: the reported all-whitespace suffix is already removed by trim and did not time out. Remove redundant optional prepositions and adjacent whitespace quantifiers without changing the accepted language; any first non-whitespace token already satisfied the old destination branch.
3. Calendar regex: ordered repeated vad/jag with no final match times out. Search the earliest vad, then earliest following jag, then the remaining weekday/week suffix with bounded alternatives.
4. Plan punctuation regex: a long punctuation run followed by a non-confirmation times out. Strip trailing punctuation with a backwards linear scan; preserve the exact confirmation allowlist and required displayed revision.
5. View filter property writes: prototype/inherited keys can become unexpected output columns. Iterate only domain-registry columns, resolve a trusted alias, read own input values, and accumulate into a null-prototype object. Existing fetchRecords value/project/PII enforcement remains.
6-7. Client-selected referenceSave and content fastPath: reported sensitive action was a pure server email-policy predicate in optional shadow instrumentation. No proven bypass of reference owner/project/manifest checks. Derive that immutable server authority once after authenticated user and before request-body branching, then pass it to shadow. No client authority field or new privilege.

## Verification sequence

- RED: real bundled exports in bounded subprocesses; both calendar attacks and punctuation attack exceeded 3s. Navigation adversarial case passed before change. Unknown/prototype filter test failed with unexpected columns.
- RED: two actual upload-component browser cases failed because an image existed before finish was accepted.
- GREEN: 63 initial helper tests; 13/13 browser tests including upload acceptance/rejection, immutable retry, scope/signout and desktop/mobile.
- Run relevant full reference/controller/security regression, scoped types and project test command. Report inherited suite failures explicitly.
- Fresh read-only security source review; address Critical/Important findings.
- Push same draft PR, then verify exact-SHA CodeQL/build/deployment. Do not call scan clearance before new analysis completes.

## Boundaries

Browser storage/HTTP is synthetic and substitutes only the external boundary; it does not prove real Supabase Auth/Storage integration. No image analysis is connected. The full project suite was already red at mission-brief-v1 source-text type extraction, with additional previously observed stale assertions in atlas-latency and design-skill-chat. Real authenticated local integration remains the next functional gate after security verification.

## Completed local evidence

- Final relevant reference/controller/chat/isolation/migration/helper regression: **417/417 PASS, 35 files, no skips**. First run was 415pass/2fail: an owned-conversation test exceeded its 5s budget and its unfinished request contaminated the following assertion. The unchanged 25-test ownership file then passed alone/in the policy run, and the complete final 417 selection passed serially with the original timeouts. No timeout assertions were weakened.
- Browser: **13/13 PASS**, actual React/controller/upload component with synthetic external HTTP/storage only.
- Scoped TypeScript including route and imported graph, UI, fixture and new helper tests: **PASS**, 1024MiB heap.
- Broad project npm test -- --maxWorkers=1 --minWorkers=1 --bail=1: **2pass/1fail then stopped** at mission-brief-v1.test.ts / supports all sixteen §20.98 statuses in the public type. Not a full-suite pass.
- Additional architecture-knowledge/executive-knowledge plus ownership run: **61pass/20fail, 3 files**. Ownership25/25 passed; architecture-knowledge.test.ts has8 failures, executive-knowledge.test.ts12. Failures concern immutable artifact loading, golden retrieval/citations/version-policy, and Executive artifact eligibility/retrieval: expected retrieval/policy results are replaced by artifact_invalid/checksum errors. Read-only diagnosis confirms sources.json, sections.jsonl and chunks.jsonl working-tree CRLF bytes fail manifest hashes while their normalized LF bytes AND exact HEAD Git-object bytes match. Those artifact/source/test files are unchanged by this diff. No manifest hash, artifact bytes or loader checks weakened. Large lexical-index byte verification was not completed (diagnostic buffer cap), so no all-artifact checksum claim.
- Fresh read-only source review found **0Critical,0Important,0Minor requiring change**. Reviewer verified regex compatibility, filter boundary, authenticated image read chain and pure server-policy lookup. Declined gates: fresh scan clearance, authentic Supabase session/upload/storage runtime, broad app correctness and production activation. Those remain explicit gates; source review is not runtime proof.
- Previously observed unrelated stale source assertions remain recorded in the main-reconciliation plan: atlas-latency / keeps visible reply fed only by text events; atlas-latency / does not touch reply from timing branch; design-skill-chat / wired into authenticated chat and retains tool-free fast paths. Not rerun or counted as pass here.

Implementation addresses all seven reported patterns; only fresh exact-SHA CodeQL may establish scanner clearance. PR remains Draft. No scanner exclusions/dismissals, feature-flag changes, database writes, paid model calls, main merge or production release.
