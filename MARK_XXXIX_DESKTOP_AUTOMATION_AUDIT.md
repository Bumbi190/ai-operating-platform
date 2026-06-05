# Mark-XXXIX — Deep Technical Audit: Desktop Automation Layer

_Read-only audit of the desktop-control subsystem in `Mark-XXXIX-main`. Primary file: `actions/computer_control.py` (500 lines). Supporting: `actions/screen_processor.py` (vision/screenshot), `core/prompt.txt` (the "One-Call Policy"), `main.py` (tool wiring). No files modified._

---

## 0. TL;DR

Mark's desktop layer is **PyAutoGUI for the hands, Gemini for the eyes, and nothing for the spine.** Mouse and keyboard actions are blind OS-level events. There is no accessibility tree, no DOM, no element model — when the agent needs to find something it can't be told the coordinates of, it screenshots the whole screen, asks `gemini-2.5-flash-lite` "where is X? reply `x,y`", regex-parses two integers, and clicks them. It is, in effect, **a one-shot, open-loop version of Claude/OpenAI Computer Use** — same idea (pixels in, coordinates out), but with the feedback loop, the resolution discipline, and the verification step all removed.

It is impressively simple and genuinely cross-platform. It is also fragile in exactly the ways you'd predict: a single coordinate guess, no re-check that the click landed, no retry when the UI shifts, and a latent HiDPI/Retina coordinate-scaling bug. For Omnira the lesson is to **copy the vision-as-locator idea but rebuild it as a closed loop with an accessibility-first locator stack and normalized coordinates.**

---

## 1. How mouse actions are executed

All mouse I/O is **PyAutoGUI**, configured once at import (`computer_control.py:12-16`):

```python
pyautogui.FAILSAFE = True   # slam mouse to a corner → abort
pyautogui.PAUSE    = 0.05   # 50 ms global delay after every call
```

- **Click** — `_click()` (`:169`): `pyautogui.click(x, y, button, clicks)`. If `x/y` are `None` it clicks at the current cursor position. Double-click = same function with `clicks=2` (`:418`); right-click = `button="right"` (`:421`).
- **Move** — `_move()` (`:198`): `pyautogui.moveTo(x, y, duration=0.3)` — a 0.3 s human-ish glide.
- **Drag** — `_drag()` (`:204`): `moveTo(x1,y1,0.2)` then `dragTo(x2,y2,0.5, button="left")`.
- **Scroll** — `_scroll()` (`:190`): `pyautogui.scroll(±amount)` vertical, `hscroll` horizontal.

Every mouse action takes **absolute screen pixel coordinates** and fires an OS input event. There is no notion of "the button element" — only "the pixel." Coordinates come from one of two sources: (a) the LLM/plan supplied them directly, or (b) `_screen_find` produced them from a screenshot (§5).

**Determinism:** the _mechanism_ is deterministic (a click at (x,y) always clicks (x,y)); the _targeting_ is not, whenever (x,y) came from vision.

---

## 2. How keyboard actions are executed

Also pure PyAutoGUI:

- **Type** — `_type()` (`:146`): `time.sleep(0.3)` then `pyautogui.typewrite(text, interval=0.03)` — character-by-character key events at 30 ms spacing.
- **Smart type** — `_smart_type()` (`:153`): optionally clears the field first, then **for text > 20 chars uses the clipboard** (`pyperclip.copy` + `ctrl+v`) instead of typing, falling back to `typewrite(interval=0.04)`. This is a deliberate reliability/speed trick — paste is atomic and immune to per-key timing races and IME issues.
- **Hotkey / press** — `_hotkey(*keys)` → `pyautogui.hotkey()`; `_press(key)` → `pyautogui.press()`. The dispatcher splits `"ctrl+c"` on `+` (`:435`).
- **Clear field** — `_clear_field()` (`:237`): `ctrl+a` then `delete`.

Keyboard events are **global** — they go to whatever window currently has OS focus. There is no per-element typing; correctness depends entirely on `focus_window` (§7) having put the right window in front first. There's also a form-filling helper set — `_random_data()` (fake names/emails/passwords) and `_user_data()` (pulls real identity from `memory/long_term.json`) — clearly built for automated signup/login flows.

---

## 3. How screenshots are captured

There are **three** distinct capture paths, and they don't share resolution conventions — this matters for coordinates:

| Path | Function | Method | Output |
|---|---|---|---|
| Save-to-disk screenshot tool | `_screenshot()` `:229` | `pyautogui.screenshot()` | Full-res PNG saved under `~` (path sandboxed to home, `_safe_screenshot_path` `:53`) |
| **Element finder** | `_screen_find()` `:299` | `pyautogui.screenshot()` → in-memory PNG | **Full-resolution PNG, _not_ downscaled**, sent to Gemini |
| Conversational vision | `screen_processor._capture_screen()` `:122` | **`mss`** grab of monitor[1] | **Downscaled to 640×360 JPEG q60** (`_compress` `:96`) |

Two things stand out. First, the conversational "what's on my screen" path (`screen_processor.py`) uses **mss** (faster, multi-monitor aware) and aggressively compresses to 640×360 — fine for "describe the screen," useless for pixel-accurate clicking. Second, the element-finder path uses **pyautogui** at **full resolution with no downscale**, because it needs coordinate fidelity. So the system already implicitly understands the tradeoff — but never reconciles the coordinate spaces (see §6, the DPI bug).

---

## 4. How screen understanding works

There are two completely separate "understanding" systems:

1. **Conversational understanding** (`screen_processor.py`): opens its _own_ Gemini Live native-audio session, streams a compressed screen/webcam frame plus the user's question, and **speaks the answer directly** (the main agent goes silent — `main.py:638`). System prompt: _"Analyze the provided image… maximum two sentences."_ This is descriptive ("there's a login form with an error") — it produces **speech, not actions or coordinates**.

2. **Actionable understanding** (`_screen_find`): a single, stateless `generate_content` call to `gemini-2.5-flash-lite` that returns coordinates. This is the only path that converts pixels into something the hands can use.

Critically, **there is no structured screen model anywhere** — no Windows UI Automation tree, no macOS AX API, no Linux AT-SPI, no OCR, no element inventory. The agent's "understanding" of an actionable screen is exactly one (x,y) pair per question.

---

## 5. How Gemini is used to identify UI elements

This is the heart of the system — `_screen_find()` (`:299-343`):

```python
w, h = pyautogui.size()                 # logical screen size
img  = pyautogui.screenshot()           # full-res capture
prompt = (f"This is a screenshot of a {w}×{h} pixel screen. "
          f"Locate the UI element described as: '{description}'. "
          f"Reply with ONLY the center coordinates as: x,y "
          f"If the element is not visible, reply: NOT_FOUND")
response = client.models.generate_content(
    model="gemini-2.5-flash-lite",
    contents=[Part.from_bytes(data=png, mime_type="image/png"), prompt])
text = response.text.strip()
if "NOT_FOUND" in text.upper(): return None
match = re.search(r"(\d+)\s*,\s*(\d+)", text)   # grab first two ints
return (int(m[1]), int(m[2])) if match else None
```

`screen_click` (`:460`) then does `_screen_find` → `sleep(0.2)` → `_click(x,y)`. That's the whole element-identification pipeline:

- **Model:** the cheapest vision model (`flash-lite`) — chosen for latency/cost.
- **Output contract:** free text, coerced by regex. No JSON, no schema, no confidence, no bounding box — just a **single center point**.
- **One element per call.** No element inventory, no "list all clickables."
- **Coordinate-regression, not Set-of-Marks.** The model is asked to _regress raw pixel coordinates from a description_ — the hardest possible ask for a vision model, and the one most prone to being tens of pixels off.

---

## 6. How coordinates are calculated (and the latent bug)

The pipeline is: model returns two integers → those integers are passed **unmodified** to `pyautogui.click()`. There is **no normalization, no scaling, no origin correction**.

This is fine on a 1:1 display. It **breaks on HiDPI/Retina**, and that's a real, shippable bug:

- `pyautogui.size()` reports the **logical** resolution (e.g. 1512×982 on a Retina Mac).
- `pyautogui.screenshot()` often captures at the **physical** resolution (e.g. 3024×1964, a 2× scale).
- The prompt tells Gemini the screen is `w×h` (**logical**), but hands it an image that is physically **2× larger**. Gemini, being a good vision model, returns coordinates in the **image's** pixel space (physical).
- `pyautogui.click()` expects **logical** coordinates.

Result on a 2× display: clicks land at roughly **double the intended offset** — i.e. off-screen or on the wrong element. The code has no DPI/scale-factor handling anywhere, so accuracy is display-dependent and untested across scaling factors. Even on a 1:1 display, raw-coordinate regression from a full-res screenshot is inherently imprecise (small targets, dense toolbars).

**Bottom line:** coordinates are "calculated" by trusting the model's pixel guess verbatim. No grounding, no verification, no DPI math.

---

## 7. How errors are handled when the UI changes

Essentially **not at all**, and this is by design — `core/prompt.txt` literally states a **"One-Call Policy: Never guess. Call tools exactly once. No retries."**

- `_screen_find` returns `None` on `NOT_FOUND` or any exception → `screen_click` returns the string `"Element not found on screen: '<desc>'"` and **stops**. No retry, no scroll-and-look-again, no replan at this layer.
- After a click, **nothing verifies it worked.** No before/after screenshot diff, no "did the dialog open?" check. The loop is **fully open** — fire and forget.
- `focus_window` (`:244`) is best-effort per-OS (PowerShell `AppActivate` / AppleScript / `wmctrl`→`xdotool`) and returns a string on failure; the caller doesn't react to it. If focus silently fails, subsequent keystrokes go to the wrong window with no detection.
- All exceptions are swallowed into return strings (`:498`). The model _sees_ the failure text and could, in principle, choose to retry — but the system prompt actively discourages it.

So when the UI changes between "look" and "act" (a spinner finishes, a layout reflows, a modal appears), the stale coordinate is clicked blindly and the error surfaces only if something downstream happens to complain.

---

## 8. Deterministic or vision-driven?

**Hybrid, leaning blind:**

- **Deterministic / blind** for `click/type/hotkey/scroll/drag` when coordinates or focus are already known — the model emits explicit (x,y) or relies on current focus. Fast, zero extra cost, zero grounding.
- **Vision-driven** only via `screen_find`/`screen_click` — and even then it's **single-shot vision**, not the iterative screenshot→act→screenshot loop that defines true Computer-Use agents.

There is **no accessibility/DOM/deterministic-selector path for the desktop at all.** (Notably, the _browser_ tool `browser_control.py` _does_ use deterministic Playwright DOM locators — so the codebase knows the pattern; it just isn't available off-web.)

---

## 9. Comparison to the four reference approaches

| Dimension | **Mark `_screen_find`** | **Playwright** | **Browser Use** | **Claude Computer Use** | **OpenAI Computer Use (CUA)** |
|---|---|---|---|---|---|
| Target surface | Any desktop app (OS events) | Web DOM only | Web DOM only | Any desktop/app (pixels) | Any desktop/app (pixels) |
| Element model | **None** — one (x,y) per call | Accessibility/DOM selectors | DOM → indexed interactive elements | Pixels + screenshot loop | Pixels + screenshot loop |
| How it targets | LLM regresses raw pixel coords | CSS/text/role/XPath, exact | LLM picks an **element index** | LLM emits actions, sees result | LLM emits actions, sees result |
| Feedback loop | **Open loop** (no re-check) | Auto-wait + assertions | Per-step DOM re-read | **Closed loop** (screenshot after each act) | **Closed loop** (`computer_call` iter) |
| Retry / recovery | None ("one-call policy") | Built-in waits/retries | Re-plans on new DOM | Model re-observes & retries | Model re-observes & retries |
| Coordinate handling | Raw, **no scaling** (DPI bug) | N/A (selectors) | N/A (DOM) | Recommended resolution scaling | Normalized display + scaling |
| Determinism | Mechanism yes, targeting no | **High** | Medium-high | Low (vision) | Low (vision) |
| Latency/cost per action | 1 cheap vision call | ~0 (no LLM) | 1 LLM call + DOM | 1 frontier-model call/loop step | 1 frontier-model call/loop step |
| Robustness to UI change | **Low** | High | Medium-high | Medium | Medium |

**Where Mark sits:** it's "Computer Use minus the loop." It shares the universality of Claude/OpenAI CU (works on any app via pixels) but throws away the two things that make CU usable in practice — the **iterative screenshot feedback loop** and **resolution normalization** — and it shares none of the determinism of Playwright/Browser Use because it has no structured element model. Browser Use's key insight (give the model an _indexed list of real elements_ and let it pick an index, instead of regressing coordinates) is exactly the upgrade Mark is missing.

---

## 10. Strengths

1. **Radical simplicity** — the entire desktop layer is one 500-line file with no native deps beyond PyAutoGUI; trivially auditable.
2. **True OS-agnostic reach** — operates _any_ application (native, Electron, games, legacy) because it works at the input/pixel level, not via integrations.
3. **Vision-as-locator is the right primitive** — "describe it, get coordinates" is a genuinely powerful escape hatch when no selector exists.
4. **Cheap and fast per call** — `flash-lite` + a single screenshot keeps latency and cost low.
5. **Clipboard-backed typing** — pasting long text sidesteps per-key timing/IME failures; a pragmatic, hard-won trick.
6. **Real cross-platform focus handling** — genuine Win/Mac/Linux branches for window activation.
7. **Sane safety defaults** — `FAILSAFE=True` and screenshot paths sandboxed to the home directory.

## 11. Weaknesses

1. **Raw coordinate regression** — asking a model for exact pixels is the least reliable targeting method available.
2. **HiDPI/Retina coordinate bug** — logical-vs-physical resolution mismatch (§6) makes accuracy display-dependent.
3. **Open loop** — no post-action verification; the agent never knows if a click worked.
4. **"One-call, no-retry" policy** — guarantees brittleness against any timing/layout change.
5. **No structured screen model** — no a11y tree/OCR/element inventory; one point per question.
6. **Global-focus dependence** — keystrokes hit whatever's frontmost; silent focus failures mistype into the wrong app.
7. **Single-threaded & serial** — 50 ms global pause; long sequences crawl.
8. **No confidence/disambiguation** — if two "Submit" buttons exist, the model silently picks one.
9. **Free-text → regex contract** — brittle parsing; a chatty model response can yield wrong/empty coords.

## 12. Failure modes (concrete)

- **Stale-coordinate click:** UI reflows between `screen_find` and `click` → clicks empty space / wrong control. No detection.
- **Retina double-offset:** on 2× displays, every vision click lands at ~2× the offset → systematic misses.
- **Wrong-window typing:** `focus_window` silently fails → `type` dumps text/passwords into the wrong app.
- **Small-target miss:** dense toolbars/menus → coordinate off by 10–30 px → adjacent control triggered.
- **NOT_FOUND dead-end:** element below the fold (needs scroll) → returns NOT_FOUND, no scroll-and-retry → task aborts.
- **Ambiguous match:** multiple identical labels → arbitrary pick, no error.
- **Model chattiness:** response like "It's around 540, 320 I think" still regex-parses to (540,320) but with no guarantee it's the first/right pair.

## 13. Scalability limits

- **Per machine:** one user, one foreground app, serial actions (~50 ms floor). Not parallelizable — there's a single shared cursor/keyboard/focus.
- **Per task:** every "find" is a full-screen vision round-trip (0.5–2 s + quota). A 20-step UI flow = 20 sequential vision calls with compounding failure probability (if each step is 90% reliable, 20 steps ≈ 12% end-to-end).
- **Per fleet:** no headless/remote mode (PyAutoGUI needs a real display/session), no sandbox, no concurrency — you cannot run N of these per server. It is intrinsically a **1 agent : 1 desktop** model.
- **Cost:** no caching of screen state; identical screens re-analyzed every call.

## 14. What Omnira should copy

1. **Vision-as-locator as a fallback primitive** — keep the "describe → coordinates" escape hatch for when no selector/a11y node exists.
2. **The cheap-model-for-grounding instinct** — use a small vision model for locating, reserve frontier models for planning.
3. **Clipboard-backed text entry** for long/secret strings.
4. **Sandboxed paths + FAILSAFE** as baseline safety.
5. **The descriptive-vision-speaks-directly sub-agent pattern** (from `screen_processor.py`) for "explain what's on screen" UX.

## 15. What Omnira should avoid

1. **Raw pixel-coordinate regression** as the _primary_ targeting method — use Set-of-Marks (numbered overlays → model picks an index) instead.
2. **Open-loop acting** — never click without a verify step.
3. **The "no-retry" policy** — desktop UIs demand observe→act→re-observe.
4. **Ignoring DPI** — always normalize capture resolution and map coordinates through a known scale factor.
5. **Global-focus blind typing** — bind input to a verified target window/element.
6. **Free-text→regex tool contracts** — use structured/JSON tool outputs.
7. **Assuming it scales server-side** — treat desktop control as an edge/companion capability, not a cloud worker.

---

## 16. Proposed architecture — "Omnira Desktop Agent v1"

**Goal:** give Omnira's cloud brain (Atlas) a reliable pair of hands on the user's machine — closing the gap your own CTO analysis names (_"Atlas reports/suggests but doesn't close the loop to an executed action"_) — without inheriting Mark's brittleness.

**Shape:** a small, signed **local companion** (Python) that connects outbound to Omnira and exposes desktop control as remote tools. Atlas plans in the cloud; the companion executes at the edge. One agent : one desktop.

### Layered locator stack (try cheap & deterministic first, vision last)

```
            ┌─────────────────────────────────────────────┐
   Atlas →  │  Intent: "click the Save button in Word"     │
 (cloud)    └───────────────────────┬─────────────────────┘
                                     ▼
   ┌────────────── Omnira Desktop Agent (local, signed) ──────────────┐
   │ 1. ACCESSIBILITY FIRST  (deterministic, free, no LLM)            │
   │    Win UI Automation / macOS AX / Linux AT-SPI → element by      │
   │    name+role. If browser is frontmost → Playwright DOM locator.  │
   │                                                                  │
   │ 2. SET-OF-MARKS VISION  (fallback when no a11y node)             │
   │    capture → enumerate candidate elements → draw numbered boxes  │
   │    → ask vision model for an INDEX (not raw x,y) → look up the   │
   │    box's true center.                                            │
   │                                                                  │
   │ 3. RAW-COORDINATE VISION (last resort only, with DPI mapping)    │
   └───────────────────────────────┬─────────────────────────────────┘
                                    ▼
   ┌───────────────── Action Executor (closed loop) ─────────────────┐
   │  pre-screenshot → focus+verify target window → act → POST-       │
   │  screenshot → verify expected change → success | retry(backoff)  │
   │  | re-observe & re-locate. Bounded retries, idempotency guards.  │
   └─────────────────────────────────────────────────────────────────┘
```

### Core design decisions

1. **Accessibility tree before pixels.** Most desktop targets have a real a11y node (Win UIA via `pywinauto`/`uiautomation`, macOS AX, Linux AT-SPI). This gives deterministic, fast, DPI-free targeting and disambiguation by name+role — the thing Mark lacks entirely. Pixels become the _fallback_, not the default.
2. **Set-of-Marks over coordinate regression.** When vision is needed, overlay numbered boxes on detected candidates and have the model return an **index**. This converts "guess exact pixels" (hard) into "pick #7" (easy) and inherits Browser Use's reliability on the desktop. Raw (x,y) regression is the absolute last resort.
3. **Closed loop, always.** Every action is `observe → act → observe → verify`. Capture before and after; confirm the expected state change (window appeared, field now contains text). No blind clicks — directly fixes Mark's biggest weakness.
4. **Normalized coordinate pipeline.** Capture at a known DPI/scale, downscale to a fixed canonical width (e.g. 1280px), have the model work in normalized 0–1000 space, then map back through the real scale factor. Kills the Retina bug class permanently.
5. **Structured tool contracts.** Tools return JSON `{status, observed_state, confidence}` — never free text parsed by regex.
6. **Bounded recovery, not "one-call."** Per action: N retries with backoff; on repeated miss, re-locate (re-observe) before re-acting; escalate to Atlas for replan after a budget. The opposite of Mark's no-retry rule.
7. **Safety & trust by construction.** Explicit per-action user confirmation for destructive/financial steps; app allowlist; `FAILSAFE` kill-switch; full action audit log streamed to Omnira (the observability Mark has none of); secrets never typed into unverified windows.
8. **Edge-not-cloud execution model.** The companion runs where the display is; Omnira treats it as a per-user capability with health/heartbeat (reuse Omnira's existing `token_health`/`cron_heartbeat` patterns), never as a horizontally-scaled server worker.

### Phased build

- **v1.0** — companion skeleton + closed-loop executor + accessibility-first locator (Win UIA + macOS AX) + structured tools + confirmation gating + audit stream. _Vision off._ Ships deterministic desktop control.
- **v1.1** — Set-of-Marks vision fallback with normalized coordinates (the safe successor to `_screen_find`).
- **v1.2** — Playwright real-profile browser path folded in as a first-class locator when a browser is frontmost (lift directly from Mark's `browser_control.py`).
- **v1.3** — voice loop (port Mark's native-audio quartet) so the desktop agent can narrate/confirm actions hands-free.

**One-line summary:** keep Mark's _idea_ (let the model find things by description), discard its _implementation_ (one blind, unscaled, unverified pixel), and wrap it in an accessibility-first, closed-loop, DPI-normalized executor that Omnira can trust to actually click the right thing.

---

### Files referenced

`actions/computer_control.py` (mouse/keyboard/screenshot/`_screen_find`/`_focus_window`/dispatcher) · `actions/screen_processor.py` (`_capture_screen`, `_compress`, Live vision session) · `core/prompt.txt` (One-Call Policy) · `main.py` (tool declarations + `_execute_tool` wiring) · `actions/browser_control.py` (the deterministic-locator counter-example).
