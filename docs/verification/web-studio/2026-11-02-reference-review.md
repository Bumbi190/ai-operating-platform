# Reference review and cinematic demo entry — 2026-11-02

User shared five Instagram reels, approved using the newly generated dealership clip in the hero and asked what can be brought into the preview. Existing cinematic media, credit use and safety boundaries remain as documented in cinematic-pilot-proof.md. No new media generation or external outreach.

## Direct observation
All five public reels were opened with Playwright through Desktop Commander on Hultgren. Caption/body text and four representative decoded video frames per reel were inspected; this is a sampled visual review, not a complete audio transcript. No accounts were logged into and no comments/DMs were sent.

| Reference | Observed | Application |
|---|---|---|
| https://www.instagram.com/reel/DfNcipPOKez/ — gomore.studio, 25.12s | SOLIDA construction concept moves from foundation to completed lit home, handover/project section and closing quote/contact area. | A staged narrative: dealership -> car -> cabin/details -> inventory. Save construction-from-foundation as a future building-sector template; use original media. |
| https://www.instagram.com/reel/DfOnojTRLbF/ — rahuliyer.ai, 45.84s | Agent-browser discussion; on-screen GitHub project is Obscura. | Candidate browser backend for Atlas extraction and controlled web tasks. Research only; no integration/installation claimed. |
| https://www.instagram.com/reel/DfOM_MXgxrr/ — hamzahbuilds, 23.70s | Garage floor transforms through a service process; ShowFloor page has process labels, quote action, booking UI and apparent confirmation. Caption claims booking/SMS/lead behavior and AI-search impact. | Show the service/result while explaining it; clear next action after the visual. Booking/SMS and sales/AI-search results are creator claims, not independently verified integrations or promised outcomes for us. |
| https://www.instagram.com/reel/Db3YtNHAU9w/ — siterabbits, 74.97s | Website-upgrade advice, visual presentation of services, before/after imagery, review section and contact/call invitation. | Explain the offer with concrete visuals, show relevant facts, use authentic social proof only when it exists and keep contact action obvious. No invented reviews/clients/ratings. |
| https://www.instagram.com/reel/DcWStBDAw83/ — olli.rasmussen, 32.43s | Claude/Higgsfield property-content workflow, property images with a marked camera path, image references and a cinematic-video prompt, resulting property presentation. | Plan scenes/keyframes and camera route before generation. Our current clip stays in the hero; future transitions can use controlled own start/end frames. No claim of full guide/prompts obtained from a comment-gated offer. |

## Obscura primary-source verification
Official project: https://github.com/h4ckf0r0day/obscura
README: https://raw.githubusercontent.com/h4ckf0r0day/obscura/main/README.md
MCP guide: https://github.com/h4ckf0r0day/obscura/blob/main/docs/Use-the-MCP-server.md

The current project describes its own Rust browser engine using V8, CDP/Playwright/Puppeteer support and MCP tools for navigation, text snapshots, screenshots, clicking and form entry. README lists Windows releases and Apache-2.0 licensing. Its author benchmark figures are not measurements on Hultgren. Documentation explicitly notes differences from Chromium in some Web APIs, media playback and rendering; keep actual Chromium for the final cinematic/3D quality checks.

Assessment: potentially useful for scoped source research/site extraction within Atlas. It must be explicitly wired into Atlas's execution environment/project authority and measured against current Playwright on representative pages. A local install would not automatically add a tool to this ChatGPT session. It does not itself grant account access or make every site usable. No binary downloaded, no server started, no MCP config or Atlas permissions changed.

## Implemented entry behavior
- /build/demo-motors now redirects through its unchanged owner check to /build/demo-motors/cinematic, making the accepted filmic hero the default demo entry.
- StudioEmptyPreview labels that entry clearly and keeps a separate direct index.html link for the classic GLB/360 showroom.
- Reference assertions updated first: RED showed old index.html redirect versus expected cinematic; then actual redirect changed.
- Only link/copy and default target changed. Existing media, runtime, catalog, auth, data and static asset rules unchanged.
- Clarified that opening demos consumes no new AI credits; the historic 9-credit creation remains recorded.

## Next layout direction (planned, not newly implemented here)
Cinematic hero + short value proposition -> selected vehicles / searchable facts -> service/ownership advantages -> authentic proof when available -> explicit offer/contact step.
Offer skip-to-inventory/contact throughout; avoid requiring long scrolling to get useful information.
Keep construction/epoxy/property-content references as future sector workflows. No new house/epoxy build in this car-dealer task.

## Verification
Route regression is observed RED-to-GREEN; final unit/TypeScript results and commit are recorded in the handoff.
Existing cinematic pilot has 7 Chromium checks and55 targeted cases from the preceding commit. Current host/public preview still needs its own verified release; no merge or production change performed.

Final local verification:17/17 route/cinematic tests PASS, full web TypeScript PASS; redirect test observed failing against the old target before the change. Small link/redirect diff reviewed separately by the author; no independent review claimed for this entry-only adjustment. Existing cinematic pilot's ui,reference-auth andstudio-journey jobs all completed successfully in GitHub run41464412637.
Preflight receipt: same local branch/worktree, no new branch/PR. References are documented direction, not new installed integrations or completed sector products.
