"""
article_reader.py — Fast article text extractor using Playwright.

No Gemini needed — just navigates to a URL and pulls out the main
article content using a priority list of CSS selectors.

Strips: nav, header, footer, aside, ads, scripts, styles.
Returns: clean plain text, word count, and title.
"""

import asyncio
import re
from dataclasses import dataclass
from playwright.async_api import async_playwright

# CSS selectors tried in priority order to find the article body
ARTICLE_SELECTORS = [
    "article",
    "[role='main']",
    "main article",
    ".article-body",
    ".article-content",
    ".post-content",
    ".post-body",
    ".entry-content",
    ".story-body",
    ".story-content",
    ".news-article",
    ".article__body",
    ".article__content",
    ".article-text",
    ".content-body",
    ".body-content",
    "#article-body",
    "#story-body",
    "main",
]

# Elements to remove before extracting text
NOISE_SELECTORS = [
    "nav", "header", "footer", "aside",
    ".ad", ".ads", ".advertisement", ".sponsored",
    ".related", ".recommended", ".newsletter",
    ".social", ".share", ".comments",
    "script", "style", "noscript",
    "[aria-label='advertisement']",
]

# Patterns that indicate low-value lines (nav leftovers, etc.)
NOISE_PATTERNS = re.compile(
    r"^(subscribe|sign in|log in|cookie|privacy policy|terms|advertisement|"
    r"follow us|share this|read more|related:|click here|\d+ min read)$",
    re.IGNORECASE,
)


@dataclass
class ArticleResult:
    url: str
    title: str
    text: str           # Clean article text
    word_count: int
    success: bool
    error: str = ""


async def read_article(url: str, timeout_ms: int = 15_000) -> ArticleResult:
    """
    Fetch a URL with Playwright and extract the main article text.
    Uses a 15-second timeout by default — fast enough for news sites.
    """
    async with async_playwright() as p:
        # Memory-lean flags for small containers (Render Free = 512MB).
        # --disable-dev-shm-usage is critical: avoids /dev/shm exhaustion crashes.
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-extensions",
            ],
        )
        try:
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            )
            page = await context.new_page()

            # Block images, fonts, media — we only need text
            await page.route(
                "**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,mp4,mp3}",
                lambda route: route.abort(),
            )

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            except Exception as e:
                return ArticleResult(url=url, title="", text="", word_count=0, success=False, error=str(e))

            # Get page title
            title = await page.title()
            title = title.split(" | ")[0].split(" - ")[0].strip()

            # Remove noise elements before extracting text
            for selector in NOISE_SELECTORS:
                try:
                    elements = await page.query_selector_all(selector)
                    for el in elements:
                        await el.evaluate("el => el.remove()")
                except Exception:
                    pass

            # Try each article selector in priority order
            text = ""
            for selector in ARTICLE_SELECTORS:
                try:
                    el = await page.query_selector(selector)
                    if el:
                        raw = await el.inner_text()
                        raw = raw.strip()
                        if len(raw) > 200:  # Ignore tiny matches
                            text = raw
                            break
                except Exception:
                    continue

            # Fallback: grab body text
            if not text:
                try:
                    text = await page.inner_text("body")
                except Exception as e:
                    return ArticleResult(url=url, title=title, text="", word_count=0, success=False, error=str(e))
        finally:
            # Always tear down the browser, even on early return or error.
            try:
                await browser.close()
            except Exception:
                pass

    # Clean up the text
    text = _clean_text(text)
    word_count = len(text.split())

    # Truncate to ~4000 words to stay within LLM context limits
    if word_count > 4000:
        words = text.split()
        text = " ".join(words[:4000]) + "\n\n[truncated]"
        word_count = 4000

    return ArticleResult(
        url=url,
        title=title,
        text=text,
        word_count=word_count,
        success=True,
    )


def _clean_text(raw: str) -> str:
    """Remove noise lines and normalise whitespace."""
    lines = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        if len(line) < 20 and NOISE_PATTERNS.match(line):
            continue
        lines.append(line)

    # Collapse runs of blank lines to a single blank
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


# ── Quick test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else "https://techcrunch.com"
    result = asyncio.run(read_article(url))
    print(f"Title: {result.title}")
    print(f"Words: {result.word_count}")
    print(f"Success: {result.success}")
    if result.error:
        print(f"Error: {result.error}")
    print("\n--- TEXT PREVIEW (first 500 chars) ---")
    print(result.text[:500])
