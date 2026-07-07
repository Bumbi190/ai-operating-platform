# Mark-XXXIX — Browser Automation Architecture Analysis

_Read-only analysis of `actions/browser_control.py` (892 lines). Cross-referenced with `main.py` (tool wiring) and the desktop layer (`actions/computer_control.py`) for contrast. No files modified. Written to be self-contained for handing to another model/advisor._

---

## 0. TL;DR

Mark's browser layer is **real browser-native automation** — async **Playwright** driving the actual browser engine, on the user's **real logged-in profiles**. This is a completely different and much better-engineered subsystem than the desktop layer (which is blind PyAutoGUI + vision). No pixels, no OCR, no `_screen_find` here — it's DOM and Playwright semantic locators end to end.

But it has one architectural flaw that caps its reliability: **the model targets elements blind.** Nothing ever snapshots the page and hands the LLM a list of real, interactable elements. The model (Gemini) must _guess_ a CSS selector or a natural-language description from its training prior, fire it once, and hope it matches the live DOM. There's a fuzzy fallback cascade (`smart_click`/`smart_type`) that softens this, but there is **no observe-the-DOM step, no screenshot feedback, no retry/replan, no iframe handling, and no post-action verification.** That makes it solid on stable, semantic, server-rendered sites and fragile on dynamic SPAs.

Predicted reliability: **GitHub good · Vercel medium · Meta Ads Manager poor.**

---

## 1. Is it browser-native, or desktop automation pretending to be browser automation?

**Genuinely browser-native.** Evidence, all from `browser_control.py`:

- Imports and drives Playwright's async API: `from playwright.async_api import async_playwright, BrowserContext, Page, ...` (`:14`).
- Launches via `engine_obj.launch_persistent_context(...)` per engine — chromium / firefox / webkit (`_launch`, `:410-512`).
- Every action is a Playwright page/locator call: `page.goto` (`:530`), `page.click(selector)` (`:566`), `page.get_by_role/get_by_text/get_by_label/get_by_placeholder` (`smart_click`/`smart_type`, `:642-705`), `page.mouse.wheel` (`:595`), `page.keyboard.press` (`:603`), `page.inner_text("body")` (`:610`).

There is **zero** PyAutoGUI, zero screen-coordinate clicking, zero `_screen_find` in this file. Contrast the desktop layer, which is the opposite (pixels + vision). So the codebase deliberately runs **two different automation paradigms**: DOM-native for the web, pixel/vision for the desktop. The web path is the more mature of the two.

One nuance: it's "native" but **not headless and not isolated** — `headless=False`, real windows, real user profiles, anti-automation flags (`--disable-blink-features=AutomationControlled`), real per-OS user-agent strings. It behaves like a human's actual browser, not a sandbox. That's a deliberate choice (keeps the user's logins) with real trade-offs (§9, §11).

---

## 2. Selectors, DOM, screenshots, OCR, or vision?

**DOM + Playwright semantic locators. No screenshots-as-input, no OCR, no vision.**

Targeting methods available to the model:

| Method | Mechanism | File |
|---|---|---|
| `click(selector)` | raw CSS selector → `page.click` | `:566` |
| `click(text=...)` | `page.get_by_text(text, exact=False)` | `:563` |
| `type_text(selector)` | `page.locator(selector)` or `:focus` → `.type(delay=50)` | `:575` |
| `fill_form({selector: value})` | loop of `locator(sel).clear().type()` | `:625` |
| **`smart_click(description)`** | cascade: `get_by_role` over **button/link/searchbox/textbox/menuitem/tab** → `get_by_text` → `get_by_placeholder` → CSS `[alt*],[title*],[aria-label*]` | `:642` |
| **`smart_type(description, text)`** | cascade: placeholder → label → role=textbox → role=searchbox → role=combobox | `:672` |
| `get_text()` | `page.inner_text("body")[:4000]` (read-only) | `:608` |

Key facts:

- **A `screenshot()` action exists (`:730`) but its output is only saved to disk** — it is never fed back to a model. So screenshots are a user-facing artifact, **not** a perception input. The LLM is functionally blind to the rendered page.
- **No OCR anywhere.**
- **No vision-based element location** (unlike the desktop layer's `_screen_find`). The browser path never sends the page to a vision model.
- **No DOM snapshot to the model.** `get_text()` returns up to 4,000 chars of `body` inner-text — flat text, no element handles, no indices, no roles, no coordinates. It can tell the model _what words are on the page_ but not _what is clickable or how to address it_.

**Net:** the model picks selectors/descriptions from its prior knowledge of how sites are built, then fires them at the live DOM. The "smart" cascade leans on Playwright's **semantic/ARIA locators** (role+name, label, placeholder) — which is the most robust class of selector available — but the model still chooses the _name_ string blind.

---

## 3. How robust is it against UI changes?

**Medium — better than CSS/XPath scripting, worse than a grounded agent.**

What helps robustness:
- **Semantic-first locators.** `smart_click` tries ARIA roles and accessible names before falling back to attributes. Role+name and label/placeholder locators survive cosmetic refactors (renamed classes, moved nodes) far better than CSS/XPath. Playwright also auto-pierces open shadow DOM and auto-waits for actionability.
- **Fuzzy text matching** (`exact=False`) tolerates minor copy changes.
- **Real profiles** mean auth state usually persists, avoiding login-flow brittleness.
- **Timeouts** are bounded (8 s click, 30 s nav, 60 s per action).

What hurts robustness:
- **Blind targeting.** No observe step → the model guesses the accessible name. If the real button says "Publish changes" and the model guesses "Submit", every locator in the cascade misses and the action returns "Could not find element." There's no recovery.
- **Open loop.** After a click, nothing verifies the intended effect happened (no wait-for-condition, no DOM re-read, no assertion). A click that "succeeded" in Playwright terms but did nothing useful is reported as success.
- **No retry / no replan at this layer.** One pass through the cascade, then give up. (And `core/prompt.txt`'s global "One-Call Policy: no retries" discourages the model from re-trying.)
- **No iframe handling.** The code never uses `frame_locator`. Any content inside an `<iframe>` is invisible to every locator. This is fatal on sites that iframe their tools.
- **No popup/new-window adoption.** If a click opens a new tab/window, `self._page` isn't updated unless `new_tab` is explicitly called — the session keeps acting on the old page.
- **No virtualized-list / lazy-load handling.** No scroll-until-found; elements below the fold or not-yet-rendered read as absent.
- **`networkidle` is never awaited** — navigation waits only for `domcontentloaded`, so SPA content that hydrates after first paint may not be present when the next action fires.

So: robust against _cosmetic_ change (class renames, copy tweaks), fragile against _structural/dynamic_ behavior (iframes, late hydration, virtualization, ambiguous repeated names, popups).

---

## 4. How would it perform on Meta Ads Manager?

**Poorly — likely fails on anything past navigation.** Meta Ads Manager is close to the worst case for this design:

- **Heavy React SPA with obfuscated, hashed class names** → CSS selectors are useless; only ARIA/role/text locators have a chance, and many controls have generic or duplicated accessible names ("Edit", "Save", "Continue", dozens of identical row actions) → the blind `smart_click` cascade picks the first match, often the wrong one.
- **Iframes** are used in parts of the ad-creation/embed flows → the no-`frame_locator` gap means those regions are simply unreachable.
- **Virtualized tables** (campaigns/ad sets/ads grids) render only visible rows → targets off-screen are "not found" with no scroll-to-find.
- **Aggressive async loading + skeleton states** → with only `domcontentloaded` (no `networkidle`/explicit waits), actions fire before controls exist.
- **Login/2FA/checkpoint + bot detection** → real-profile login _helps_ (cookies persist), but Meta's automation detection is strong; `--disable-blink-features=AutomationControlled` is a weak defense and may trigger checkpoints.
- **Ambiguity with no disambiguation** → no way to say "the Save in the budget panel."

Verdict: navigation and reading text might work; reliably creating/editing a campaign end-to-end is very unlikely without a grounded, iframe-aware, verify-and-retry loop.

## 5. How would it perform on Vercel?

**Medium — partial success on simple flows, risky on multi-step ones.** Vercel's dashboard is a cleaner Next.js app with reasonably semantic markup and accessible controls:

- **Better-named, more accessible controls** → `smart_click`/`smart_type` on roles/labels has a decent hit rate (e.g. project search, settings toggles, env-var fields).
- **Real-profile auth** → already logged in, avoiding the GitHub-OAuth/login dance.
- Still an **SPA**: route transitions and dialogs render async, and the missing `networkidle`/verification step makes multi-step flows (create project → configure env → deploy → confirm) error-prone — a step can fire before the next view is ready, and nothing checks the deploy actually started.
- **Confirmation modals / destructive-action guards** (delete project typing the name, production-deploy confirmations) → the agent has no notion of "confirm and verify," so it may stall or half-complete.

Verdict: good for single, well-labeled actions and reading state; unreliable for chained deploy/config workflows without a verify-and-wait loop.

## 6. How would it perform on GitHub?

**Best of the three — genuinely usable for many tasks.** GitHub is close to the best case:

- **Largely server-rendered, stable, semantic HTML** with consistent ARIA labels, `data-testid`s, and predictable roles/link text → `smart_click`/`get_by_text`/`get_by_role` land reliably (e.g. "New issue", "Create repository", "Merge pull request", file navigation).
- **Durable accessible names** that rarely change → blind targeting actually works most of the time.
- **Real-profile session** → logged in, avoiding 2FA each run.
- Some flows are React (PR review, new code-view, Projects) with async panels → those hit the same late-render/iframe-free limits, but most core actions are within reach.

Verdict: navigation, issues/PR creation, comments, repo operations, reading content — mostly reliable. The advanced React surfaces (Projects boards, new file editor) are where the open-loop/no-wait gaps bite.

**Pattern across all three:** reliability tracks _how server-rendered, semantic, and iframe-free_ the site is. Stable+semantic (GitHub) → works. Dynamic+obfuscated+iframed (Meta) → fails. This is the signature of a DOM-native tool that lacks grounding, waiting, and verification.

---

## 7. Comparison to Playwright, Browser Use, and Stagehand

| Dimension | **Mark `browser_control`** | **Playwright (raw)** | **Browser Use** | **Stagehand** |
|---|---|---|---|---|
| Engine | Playwright (native) | Playwright | Playwright/CDP | Playwright |
| Who picks the target | **LLM guesses** selector/name blind | **Human/codegen** authors exact selectors | LLM picks from an **indexed list of real DOM elements** | LLM via `observe()/act()` grounded in live DOM |
| Page perception | `get_text` only (flat text, no handles) | N/A (author knows the page) | **DOM extraction + numbered interactive elements + screenshot** | **DOM/a11y snapshot → candidate actions** |
| Feedback loop | **Open** (no verify) | Test author adds waits/asserts | **Closed** (re-observe each step) | **Closed** (`act` → observe → verify), with action caching |
| Self-healing | Fuzzy cascade only | None (brittle if DOM shifts) | Re-derives from fresh DOM each step | **Self-healing selectors** + cache by intent |
| Determinism | Mechanism deterministic, targeting not | **High** | Medium-high | Medium-high (deterministic replay via cache) |
| Iframes/shadow/popups | **Not handled** | Fully (author's job) | Handled | Handled |
| Structured extraction | `inner_text[:4000]` | Manual | Schema-based | **`extract()` with schema (Zod)** |
| Cost/latency per action | ~0 (one Playwright call) | 0 | 1 LLM call + DOM serialize | LLM on miss; cached on hit |
| Best at | Stable semantic sites, logged-in | Known, scripted flows | Exploratory cross-site tasks | Reliable LLM automation w/ determinism |

**Where Mark sits:** it is **"raw Playwright driven by an LLM that can't see the page."** It borrows Playwright's _best feature_ (semantic ARIA locators) but discards the thing that makes Playwright reliable in practice — a human/recorder authoring selectors against a known DOM — and replaces it with a blind guess. It reaches toward Stagehand's `act("click the X")` ergonomics via `smart_click`, but without Stagehand's **observe-then-act grounding, self-healing, and action caching**, and without Browser Use's **indexed-element + screenshot perception**. The single biggest differentiator: **Browser Use and Stagehand both let the model see the real interactable elements before choosing; Mark does not.**

---

## 8. Strengths (worth keeping)

1. **True browser-native Playwright core** — the right foundation; nothing pixel-based to inherit.
2. **Real-profile persistent context** — logged-in sessions, cookies, extensions; huge practical value vs. cold sandboxes.
3. **Semantic/ARIA-first locator cascade** (`smart_click`/`smart_type`) — the most change-resistant selector class, exposed via natural language.
4. **Multi-browser, multi-session registry** — chrome/edge/firefox/brave/opera/vivaldi/safari, several alive at once, thread-per-session.
5. **Robust browser discovery** — per-OS profile paths, registry/`which`/`.app` resolution, JARVIS-profile fallback.
6. **Anti-automation hardening + real UA** — reduces (not eliminates) bot detection.
7. **Bounded timeouts and graceful error strings** — no hard crashes; the agent always gets a message back.

## 9. Weaknesses (the reliability ceiling)

1. **Blind targeting — no DOM/a11y observation before acting.** The root cause of most failures.
2. **No screenshot/vision feedback** in the browser path (ironically the desktop path _has_ vision).
3. **Open loop — no post-action verification** (no wait-for-condition, no assert, no DOM re-read).
4. **No retry/replan** (compounded by the global "one-call" policy).
5. **No iframe (`frame_locator`) support** — entire regions unreachable.
6. **No popup/new-window adoption** — session loses the page after target-`_blank` clicks.
7. **Only `domcontentloaded`, never `networkidle`/explicit waits** — races SPA hydration.
8. **No virtualized-list / scroll-until-found.**
9. **Ambiguity unresolved** — first match wins, no scoping/disambiguation.
10. **Not isolated / not multi-tenant-safe** — real profile, real window; can't run N per server, profile-lock conflicts, security blast radius.

## 10. Failure modes (concrete)

- **Wrong-name miss:** model guesses "Submit", button says "Publish" → whole cascade fails → "Could not find element."
- **Iframe blindness:** target inside `<iframe>` → never found.
- **Race on hydration:** action fires after `domcontentloaded` but before React renders the control → not found / wrong state.
- **Ambiguous repeat:** ten identical "Edit" buttons → clicks the first, edits the wrong row, reports success.
- **Lost popup:** click opens new tab → agent keeps driving the old page silently.
- **Phantom success:** Playwright click resolves but the app rejected it (disabled, overlay) → no verification → reported done.
- **Detection checkpoint:** Meta/Google flags automation → 2FA/checkpoint wall the agent can't resolve.

## 11. Scalability limits

- **1 agent : 1 desktop session.** `headless=False` real windows on the user's machine; not server-runnable at scale, not isolated, profile-locked (can't open same profile twice).
- **Thread-per-session** with a 60 s blocking `future.result()` — fine for one user, not for concurrency.
- **No pooling/lifecycle management** — sessions live until explicitly closed.
- **Per-action cost is ~0** (no LLM in the locator itself) — cheaper than Browser Use/Stagehand, but that's exactly because it skips the perception that makes them reliable.

---

## 12. Design: "Omnira Browser Agent" (reliability-first)

**Thesis:** keep Mark's native-Playwright + real-profile foundation, and bolt on the three things it lacks that Browser Use and Stagehand have proven: **(1) observe before act, (2) act in a closed verify-and-retry loop, (3) deterministic caching/self-healing.** Reliability comes from grounding and verification, not from a cleverer single guess.

### Targeting stack — deterministic first, vision last

```
Intent from Atlas: "publish the draft campaign"
        │
        ▼
┌─ OBSERVE (always, before acting) ───────────────────────────────┐
│  Snapshot the live page → accessibility tree + interactive-      │
│  element inventory (role, name, testid, bbox, frame path),       │
│  INCLUDING iframes and open shadow DOM. Optionally render a      │
│  Set-of-Marks screenshot. Hand the model REAL candidates, not    │
│  a blank page. (Browser Use / Stagehand observe pattern.)        │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─ RESOLVE (cheap & deterministic first) ─────────────────────────┐
│  1. Cached selector for this intent?  → use it (deterministic).  │
│  2. Stable handle: data-testid / role+accessible-name / label.   │
│  3. LLM picks from the observed candidate list (index or name),  │
│     scoped to the right region/frame to kill ambiguity.          │
│  4. Vision/Set-of-Marks fallback ONLY if DOM resolution fails.   │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─ ACT → VERIFY (closed loop) ────────────────────────────────────┐
│  act via Playwright (native) → wait for expected condition       │
│  (networkidle / element state / URL / extracted value) → VERIFY  │
│  the intended effect with a schema-based extract() → success |   │
│  bounded retry (re-observe, re-resolve) | escalate to Atlas.     │
│  On success, CACHE the resolved selector keyed by intent.        │
└─────────────────────────────────────────────────────────────────┘
```

### Core decisions

1. **Observe-before-act, always.** Never let the model guess into a blank page. Serialize the accessibility tree + interactive inventory (this is Browser Use's and Stagehand's central idea, and Mark's missing half).
2. **Deterministic-first resolution with intent-keyed caching** (Stagehand-style). First run: LLM resolves against observed candidates. Subsequent runs: replay the cached `data-testid`/role+name selector with **no LLM call** → fast, cheap, repeatable. LLM re-engages only on cache miss (self-healing).
3. **Stable-handle priority.** Prefer `data-testid` → `role + accessible name` → `label/placeholder` → text → (last) vision. Encode the same semantic-first instinct Mark already shows, but grounded in observation.
4. **Closed verify loop.** Every action declares an expected post-condition; wait for it (`networkidle`/element-state/URL/extracted value) and verify before reporting success. Kills "phantom success."
5. **First-class iframes, shadow DOM, popups.** Resolve across `frame_locator`; adopt new pages on target-`_blank`/window.open. Directly removes Mark's biggest structural failure modes (Meta).
6. **Schema-based extraction** (Pydantic/Zod) for reading state — not `inner_text[:4000]`. Structured, verifiable, feedable back into the loop.
7. **Bounded retry + replan, not one-shot.** Re-observe and re-resolve on miss, with a budget; escalate to Atlas for a new plan after N failures. The opposite of the "one-call" rule.
8. **Isolation & multi-tenancy for scale.** Default to **isolated contexts / containerized browsers** with injected, vaulted auth (reuse Omnira's `g1_multitenant_platform_tokens`/`token_health`), so it runs server-side at scale. Offer Mark's **real-profile mode** only as an opt-in "act as me on my machine" edge path, behind explicit consent.
9. **Consent + audit by construction.** Confirmation gating for destructive/spend actions (ad spend, deploys, deletes); stream per-step observation + action + screenshot to Omnira for the observability Mark lacks.
10. **Deterministic-first, LLM-second, vision-last** — the same governing principle as the desktop agent, so both share one execution/verification spine.

### Phasing

- **v1.0** — native Playwright core (lift from Mark) + **observe step** (a11y/interactive inventory incl. iframes) + closed verify loop + bounded retry + structured `extract()`. Isolated contexts + vaulted auth. _No vision yet._
- **v1.1** — **intent-keyed selector caching + self-healing** (Stagehand parity): deterministic replay, LLM only on miss.
- **v1.2** — **Set-of-Marks vision fallback** for the rare DOM-opaque control (canvas/obfuscated), shared with the Desktop Agent's vision module.
- **v1.3** — real-profile "act as me" edge mode + consent gating for high-stakes flows (Meta ad spend, Vercel prod deploys).

**Expected outcome on the three test sites:** GitHub → high reliability (deterministic replay after first observe). Vercel → reliable multi-step (verify loop fixes the race/confirm gaps). Meta Ads Manager → from "fails" to "workable," because observe+iframe support+verify+disambiguation target exactly its failure modes.

**One-line summary:** Mark proves the foundation (native Playwright on real profiles) and the ergonomic goal (`smart_click("the thing")`); Omnira's job is to make that reliable by letting the agent **see the page, verify the result, and remember what worked** — the three things Browser Use and Stagehand added and Mark left out.

---

### Files referenced

`actions/browser_control.py` — `_BrowserSession` (`launch_persistent_context`, `_launch`, `go_to`, `click`, `type_text`, `fill_form`, `smart_click`, `smart_type`, `get_text`, `screenshot`), `_SessionRegistry`, `browser_control` dispatcher · `actions/computer_control.py` (vision/pixel contrast) · `core/prompt.txt` (one-call policy) · `main.py` (`browser_control` tool schema + `_execute_tool` wiring).
