"""
competitor_reader.py — AI Content Competitor Intelligence

Sources (all public, no login required):
  1. YouTube search  — "AI news" sorted by upload date → recent video titles + view counts
  2. TLDR AI         — tldr.tech/ai → today's featured AI stories
  3. The Rundown AI  — therundownai.com → top stories of the day
  4. Ben's Bites     — bensbites.co → trending AI topics

Returns structured intelligence:
  - Top-performing hooks and titles (what's getting views NOW)
  - Recurring topics and angles across competitors
  - Patterns: what format/style drives the most engagement

This feeds into the script-writing prompt so Claude can learn from
what's actually working in the market right now.
"""

import asyncio
import re
from dataclasses import dataclass, field
from playwright.async_api import async_playwright, Page


@dataclass
class CompetitorPost:
    title: str
    source: str           # "youtube" | "tldr_ai" | "rundown_ai" | "bens_bites"
    views: str = ""       # e.g. "2.3M views" (YouTube only)
    hook: str = ""        # First sentence / headline hook
    topic: str = ""       # Inferred topic category
    url: str = ""


@dataclass
class CompetitorResult:
    posts:           list[CompetitorPost] = field(default_factory=list)
    top_hooks:       list[str]           = field(default_factory=list)
    trending_topics: list[str]           = field(default_factory=list)
    pattern_summary: str                 = ""
    fetched_at:      str                 = ""


# ── YouTube AI news search ────────────────────────────────────────────────────

async def _fetch_youtube(page: Page) -> list[CompetitorPost]:
    """Scrape recent AI news videos from YouTube — title + view count."""
    posts = []
    try:
        # Search for AI news videos uploaded this week
        await page.goto(
            "https://www.youtube.com/results?search_query=AI+news+today&sp=EgQIBBAB",
            wait_until="domcontentloaded",
            timeout=15_000,
        )
        await asyncio.sleep(3)

        # YouTube renders video cards as ytd-video-renderer
        cards = await page.query_selector_all("ytd-video-renderer, ytd-compact-video-renderer")

        for card in cards[:20]:
            try:
                title_el = await card.query_selector("#video-title, .ytd-video-renderer #title")
                if not title_el:
                    continue
                title = (await title_el.inner_text()).strip()
                if not title or len(title) < 10:
                    continue

                # View count
                views = ""
                meta_els = await card.query_selector_all(".inline-metadata-item, #metadata-line span")
                for el in meta_els:
                    text = (await el.inner_text()).strip()
                    if "view" in text.lower() or re.match(r"[\d,.]+[KMB]", text):
                        views = text
                        break

                href = await title_el.get_attribute("href") or ""
                url  = f"https://youtube.com{href}" if href.startswith("/") else href

                posts.append(CompetitorPost(
                    title=title,
                    source="youtube",
                    views=views,
                    hook=title[:100],
                    url=url,
                ))
            except Exception:
                continue

    except Exception:
        pass

    return posts[:15]


# ── TLDR AI newsletter ────────────────────────────────────────────────────────

async def _fetch_tldr_ai(page: Page) -> list[CompetitorPost]:
    """Scrape today's stories from TLDR AI newsletter."""
    posts = []
    try:
        await page.goto("https://tldr.tech/ai", wait_until="domcontentloaded", timeout=12_000)
        await asyncio.sleep(2)

        # TLDR renders article cards with h3 headings
        headings = await page.query_selector_all("h3, .story-title, article h2, .newsletter-item h3")
        for h in headings[:12]:
            title = (await h.inner_text()).strip()
            if len(title) < 15:
                continue
            posts.append(CompetitorPost(
                title=title,
                source="tldr_ai",
                hook=title[:120],
                url="https://tldr.tech/ai",
            ))
    except Exception:
        pass

    return posts[:8]


# ── The Rundown AI ────────────────────────────────────────────────────────────

async def _fetch_rundown(page: Page) -> list[CompetitorPost]:
    """Scrape The Rundown AI's featured stories."""
    posts = []
    try:
        await page.goto("https://www.therundownai.com", wait_until="domcontentloaded", timeout=12_000)
        await asyncio.sleep(2)

        headings = await page.query_selector_all("h1, h2, h3, .post-title, .entry-title")
        for h in headings[:10]:
            title = (await h.inner_text()).strip()
            if len(title) < 15 or len(title) > 200:
                continue
            posts.append(CompetitorPost(
                title=title,
                source="rundown_ai",
                hook=title[:120],
                url="https://www.therundownai.com",
            ))
    except Exception:
        pass

    return posts[:6]


# ── Ben's Bites ───────────────────────────────────────────────────────────────

async def _fetch_bens_bites(page: Page) -> list[CompetitorPost]:
    """Scrape Ben's Bites latest stories."""
    posts = []
    try:
        await page.goto("https://bensbites.com", wait_until="domcontentloaded", timeout=12_000)
        await asyncio.sleep(2)

        headings = await page.query_selector_all("h1, h2, h3, .post-title")
        for h in headings[:10]:
            title = (await h.inner_text()).strip()
            if len(title) < 15 or len(title) > 200:
                continue
            posts.append(CompetitorPost(
                title=title,
                source="bens_bites",
                hook=title[:120],
                url="https://bensbites.com",
            ))
    except Exception:
        pass

    return posts[:6]


# ── Pattern analysis ──────────────────────────────────────────────────────────

def _analyse_patterns(posts: list[CompetitorPost]) -> tuple[list[str], list[str], str]:
    """
    Extract top hooks, recurring topics, and a pattern summary
    from the collected competitor posts.
    """
    # Top hooks = YouTube titles with high-performing structures
    yt_posts   = [p for p in posts if p.source == "youtube"]
    top_hooks  = [p.hook for p in yt_posts[:8] if p.hook]

    # Recurring topic keywords across all sources
    all_text   = " ".join(p.title.lower() for p in posts)
    topic_keywords = [
        "openai", "anthropic", "google", "meta ai", "mistral", "gemini",
        "gpt", "claude", "llama", "agent", "reasoning", "robotics",
        "regulation", "job", "chip", "nvidia", "microsoft", "apple",
        "search", "video", "image generation", "voice", "coding",
    ]
    topics = [kw for kw in topic_keywords if kw in all_text][:10]

    # Pattern summary
    hook_patterns = []
    for hook in top_hooks[:5]:
        h = hook.lower()
        if any(w in h for w in ["just", "breaking", "announces", "releases", "drops"]):
            hook_patterns.append("breaking-news")
        elif any(w in h for w in ["how", "why", "what happens", "explained"]):
            hook_patterns.append("educational")
        elif any(w in h for w in ["beats", "destroys", "surpasses", "vs"]):
            hook_patterns.append("competitive")
        elif any(w in h for w in ["could", "might", "will", "future"]):
            hook_patterns.append("forward-looking")

    from collections import Counter
    dominant = Counter(hook_patterns).most_common(1)
    pattern  = dominant[0][0] if dominant else "mixed"

    summary = (
        f"Dominant format this week: {pattern}. "
        f"Top topics: {', '.join(topics[:5])}. "
        f"YouTube hooks studied: {len(yt_posts)}."
    )

    return top_hooks, topics, summary


# ── Main entry point ──────────────────────────────────────────────────────────

async def fetch_competitors() -> CompetitorResult:
    """
    Fetch competitor intelligence from all sources in parallel.
    Returns structured insights ready to feed into script writing.
    """
    from datetime import datetime, timezone
    result = CompetitorResult(fetched_at=datetime.now(timezone.utc).isoformat())

    async with async_playwright() as p:
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

            pages = await asyncio.gather(*[context.new_page() for _ in range(4)])

            # Block images/media for speed
            for page in pages:
                await page.route(
                    "**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,mp4,mp3}",
                    lambda route: route.abort(),
                )

            yt, tldr, rundown, bites = await asyncio.gather(
                _fetch_youtube(pages[0]),
                _fetch_tldr_ai(pages[1]),
                _fetch_rundown(pages[2]),
                _fetch_bens_bites(pages[3]),
            )
        finally:
            try:
                await browser.close()
            except Exception:
                pass

    all_posts = yt + tldr + rundown + bites
    top_hooks, trending_topics, pattern_summary = _analyse_patterns(all_posts)

    result.posts           = all_posts
    result.top_hooks       = top_hooks
    result.trending_topics = trending_topics
    result.pattern_summary = pattern_summary
    return result


# ── Quick test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = asyncio.run(fetch_competitors())
    print(f"\nPattern summary: {result.pattern_summary}")
    print(f"\nTop hooks ({len(result.top_hooks)}):")
    for h in result.top_hooks[:5]:
        print(f"  • {h}")
    print(f"\nTrending topics: {', '.join(result.trending_topics)}")
    print(f"\nAll posts ({len(result.posts)}):")
    for p in result.posts:
        print(f"  [{p.source:12}] {p.title[:80]}")
