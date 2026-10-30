# Calendar inline content verification — 2026-10-26

Approved scope: small dated The Prompt calendar cards replace the current-queue box. Selected film, Family revision image/caption and stored review content are inspectable in the existing side panel. Explicit email draft contract is tested; no live mail producer/artifacts were found or created.

## Behavior and boundaries

- One stable film identity uses first publication timestamp with a saved receipt, otherwise labelled reported publication, approval date or creation date. Untimed entries do not invent a publication hour. Missing dates remain a small undated notice.
- Channel receipts remain separate. Existing daily analysis/approval/publish jobs are unchanged.
- GET details require session, allowed project and actual owner; social content is pinned to the saved job revision/hash. Registered media bytes use the existing owner/hash checked endpoint. Historical S3 films require exact producer region/bucket/render/script path.
- Full script, existing Meta caption builder and YouTube metadata builder are shown as inert text. Pinned social destination link is visible without remote preview fetching. Email headers/body/attachment metadata are plain text; each attachment retains its own exact hash.
- Changing source/account clears old content; requests abort and late responses are ignored. No autoplay, render, send, generic approval or publishing control is added to calendar preview.

## Verification

- Calendar/review-content/review queue combined run:281 cases passed; one Docker-backed source case exceeded its5s timeout under parallel load. Isolated source suite5/5 passed with30s environment timeout. All282 cases passed across these runs.
- Following review fixes:77 relevant cases passed, including all63 existing review queue cases and the three reproduced regression failures now GREEN. One new duplicate-reference case raises the covered total to283.
- Chromium:27 existing calendar flows +6 new calendar/review inspector flows passed. Native image/video controls, complete synthetic email fields, no active HTML or preview writes, selection races, logout, local errors, mobile/Escape and project filtering verified. Desktop/mobile screenshots visually inspected.
- Separate TypeScript check passed before review fixes; final check and rebuilt production artifact recorded in release evidence when complete.
- Locked-dependency production build passed before review fixes; final rebuild running. No schema migration or new dependencies.
- Independent whole-branch reviewer found3 P2 completeness/identity issues; all fixed with RED→GREEN regressions and verified by the same reviewer. No remaining finding. Ledger records the two explicit scope rulings.

## Read-only real-source baseline

Owned The Prompt film6f134897-0884-4617-95e6-001ef2ff18d3 has a ready video and three saved channel receipts; first publication2026-10-26T08:00:15.602Z (09:00:15 Stockholm). Family Nov2–8 retains four queued jobs, version1: Facebook+Instagram at20:30 Stockholm Nov4 and Nov8. No draft/job/provider writes were used for preview verification.

Production SHA, deployment, CI and live read-only confirmation will be recorded in the external release evidence file after deployment. Email preview remains synthetic until a real owned draft-review artifact exists.
