"""
web_agent.py — Hermes Web Agent
Adapted from ADA v2 by Nazir Louis.

Uses Gemini 2.5 Computer Use to autonomously navigate the web
and extract structured information.
"""

import asyncio
import base64
import os
from playwright.async_api import async_playwright
from google import genai
from google.genai import types

SCREEN_WIDTH  = 1440
SCREEN_HEIGHT = 900
MODEL_ID      = "gemini-2.5-computer-use-preview-10-2025"

# Keep screenshot bytes in conversation history for only the most recent N turns.
# A long autonomous run can take 25–30 turns; holding every full-page PNG in RAM
# simultaneously is the main per-run memory growth on a 512MB instance.
KEEP_SCREENSHOTS = 3

# Memory-lean Chromium launch flags for small containers (Render Free = 512MB).
# --disable-dev-shm-usage is the critical one: without it Chromium uses /dev/shm
# (often tiny in containers) and can crash or balloon. The rest trim baseline RSS.
CHROMIUM_ARGS = [
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-default-apps",
    "--mute-audio",
    "--no-first-run",
]


class WebAgent:
    def __init__(self, api_key: str):
        self.client  = genai.Client(api_key=api_key)
        self.browser = None
        self.context = None
        self.page    = None

    # ── Coordinate helpers ────────────────────────────────────────────────────

    def _dx(self, x: int) -> int:
        return int((x / 1000) * SCREEN_WIDTH)

    def _dy(self, y: int) -> int:
        return int((y / 1000) * SCREEN_HEIGHT)

    # ── Action executor ───────────────────────────────────────────────────────

    async def _execute(self, function_calls: list) -> list:
        results = []
        for call in function_calls:
            call_id = getattr(call, "id", None)
            fn      = call.name
            args    = call.args
            result  = {}

            try:
                if fn == "navigate":
                    await self.page.goto(args["url"])
                elif fn == "go_back":
                    await self.page.go_back()
                elif fn == "go_forward":
                    await self.page.go_forward()
                elif fn == "search":
                    await self.page.goto("https://www.google.com")
                elif fn == "wait_5_seconds":
                    await asyncio.sleep(5)
                elif fn == "click_at":
                    await self.page.mouse.click(self._dx(args["x"]), self._dy(args["y"]))
                elif fn == "type_text_at":
                    x, y = self._dx(args["x"]), self._dy(args["y"])
                    await self.page.mouse.click(x, y)
                    if args.get("clear_before_typing", True):
                        await self.page.keyboard.press("Control+A")
                        await self.page.keyboard.press("Backspace")
                    await self.page.keyboard.type(args["text"])
                    if args.get("press_enter", False):
                        await self.page.keyboard.press("Enter")
                elif fn == "hover_at":
                    await self.page.mouse.move(self._dx(args["x"]), self._dy(args["y"]))
                elif fn == "drag_and_drop":
                    sx, sy = self._dx(args["x"]), self._dy(args["y"])
                    ex, ey = self._dx(args["destination_x"]), self._dy(args["destination_y"])
                    await self.page.mouse.move(sx, sy)
                    await self.page.mouse.down()
                    await self.page.mouse.move(ex, ey)
                    await self.page.mouse.up()
                elif fn == "key_combination":
                    await self.page.keyboard.press(args.get("keys"))
                elif fn in ("scroll_document", "scroll_at"):
                    magnitude = args.get("magnitude", 800)
                    direction = args.get("direction", "down")
                    if fn == "scroll_at":
                        await self.page.mouse.move(self._dx(args["x"]), self._dy(args["y"]))
                    dx = magnitude if direction == "right" else -magnitude if direction == "left" else 0
                    dy = magnitude if direction == "down"  else -magnitude if direction == "up"   else 0
                    await self.page.mouse.wheel(dx, dy)
                # open_web_browser and unknown functions are silently ignored
            except Exception as e:
                result = {"error": str(e)}

            await asyncio.sleep(0.8)
            results.append((call_id, fn, result))

        return results

    async def _state_snapshot(self, results: list):
        screenshot = await self.page.screenshot(type="png")
        url        = self.page.url
        responses  = []
        for call_id, name, data in results:
            responses.append(
                types.FunctionResponse(
                    name=name,
                    id=call_id,
                    response={"url": url, **data},
                    parts=[types.FunctionResponsePart(
                        inline_data=types.FunctionResponseBlob(
                            mime_type="image/png",
                            data=screenshot,
                        )
                    )],
                )
            )
        return responses, screenshot

    # ── History pruning ─────────────────────────────────────────────────────────

    @staticmethod
    def _prune_history(history: list, keep: int = KEEP_SCREENSHOTS) -> None:
        """Bound memory: keep screenshot bytes only for the most recent `keep`
        function-response turns. Older turns keep their textual response (url +
        any data) but drop the heavy PNG blob, so history doesn't grow to hold
        25–30 full screenshots in RAM at once. Best-effort: never raises into the
        run loop, so a pruning hiccup can't break a request.
        """
        if keep <= 0:
            return
        fr_indices = [
            i for i, c in enumerate(history)
            if getattr(c, "role", None) == "user"
            and any(getattr(p, "function_response", None) for p in (c.parts or []))
        ]
        for i in fr_indices[:-keep]:
            for part in history[i].parts:
                try:
                    fr = getattr(part, "function_response", None)
                    if fr is not None and getattr(fr, "parts", None):
                        fr.parts = []  # drop screenshot blob, keep name/id/response
                except Exception:
                    pass

    # ── Main run loop ─────────────────────────────────────────────────────────

    async def run(self, prompt: str, max_turns: int = 25) -> str:
        """
        Execute a task described by `prompt`.
        Returns the agent's final text response.
        """
        final_response = "Agent finished without a final summary."

        async with async_playwright() as p:
            self.browser = await p.chromium.launch(
                headless=True,
                args=CHROMIUM_ARGS,
            )
            try:
                self.context = await self.browser.new_context(
                    viewport={"width": SCREEN_WIDTH, "height": SCREEN_HEIGHT},
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                )
                self.page = await self.context.new_page()
                await self.page.goto("https://www.google.com")

                config = types.GenerateContentConfig(
                    tools=[types.Tool(
                        computer_use=types.ComputerUse(
                            environment=types.Environment.ENVIRONMENT_BROWSER
                        )
                    )],
                    thinking_config=types.ThinkingConfig(include_thoughts=True),
                )

                initial_screenshot = await self.page.screenshot(type="png")
                history = [
                    types.Content(
                        role="user",
                        parts=[
                            types.Part(text=prompt),
                            types.Part.from_bytes(data=initial_screenshot, mime_type="image/png"),
                        ],
                    )
                ]

                for turn in range(max_turns):
                    try:
                        response = await self.client.aio.models.generate_content(
                            model=MODEL_ID,
                            contents=history,
                            config=config,
                        )
                    except Exception as e:
                        print(f"[hermes] API error on turn {turn + 1}: {e}")
                        break

                    if not response.candidates:
                        break

                    content = response.candidates[0].content
                    history.append(content)

                    agent_text     = ""
                    function_calls = []

                    for part in content.parts:
                        if part.thought:
                            pass  # internal reasoning, skip
                        elif part.text:
                            agent_text = part.text
                        if part.function_call:
                            function_calls.append(part.function_call)

                    if agent_text:
                        final_response = agent_text

                    if not function_calls:
                        break  # task complete

                    results    = await self._execute(function_calls)
                    responses, _ = await self._state_snapshot(results)

                    history.append(types.Content(
                        role="user",
                        parts=[types.Part(function_response=fr) for fr in responses],
                    ))

                    # Drop screenshot bytes from older turns to bound memory.
                    self._prune_history(history)
            finally:
                # Guarantee the browser is torn down even if the loop raises,
                # so a failed run can't leak a Chromium process and stack memory.
                try:
                    await self.browser.close()
                except Exception:
                    pass

        return final_response
