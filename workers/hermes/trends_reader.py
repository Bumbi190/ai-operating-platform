"""
trends_reader.py — AI Trend Scanner using Playwright (no Gemini needed).

Sources:
  1. Google Trends — Science & Tech trending searches (trends.google.com)
  2. Reddit hot   — r/artificial + r/MachineLearning + r/singularity rising posts
  3. HackerNews   — front-page AI stories right now

Returns a structured list of trending topics with context,
ready to feed into the news-hunter as editorial guidance.
"""

import asyncio
import json
import re
from dataclasses import dataclass, field
from playwright.async_api import async_playwright, Page


@dataclass
class TrendingTopic:
    topic: str                       # e.g. "GPT-5", "Anthropic funding"
    source: str                      # "google_trends" | "reddit" | "hackernews"
    search_volume: str = ""          # e.g. "50K+" (Google Trends)
    engagement_score: int = 0        # upvotes / points
    context: str = ""                # Short description or top comment
    url: str = ""


@dataclass
class TrendsResult:
    topics: list[TrendingTopic] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    fetched_at: str = ""


async def _fetch_google_trends(page: Page) -> list[TrendingTopic]:
    """Scrape Google Trends 'Science & Tech' trending searches."""
    topics = []
    try:
        # Use the daily trends page filtered to Science & Tech (category 5)
        await page.goto(
            "https://trends.google.com/trending?geo=US&category=5&hours=24",
            wait_until="domcontentloaded",
            timeout=15_000,
        )
        await asyncio.sleep(3)  # Let JS render

        # Extract trending items — Google Trends renders table rows
        rows = await page.query_selector_all("table tbody tr, feed-item, .trending-searches-item")

        for row in rows[:15]:  # Top 15
            try:
                text = await row.inner_text()
                lines = [l.strip() for l in text.splitlines() if l.strip()]
                if not lines:
                    continue

                topic = lines[0]
                volume = next((l for l in lines if "K+" in l or "M+" in l or re.match(r"[\d,]+\+?$", l)), "")

                # Filter to AI-relevant topics
                ai_keywords = ["ai", "gpt", "llm", "claude", "gemini", "openai", "anthropic",
                               "model", "robot", "machine learning", "neural", "deep learning",
                               "chatbot", "artificial", "tech", "google", "microsoft", "meta ai"]
                if any(kw in topic.lower() for kw in ai_keywords):
                    topics.append(TrendingTopic(
                        topic=topic,
                        source="google_trends",
                        search_volume=volume,
                        context=lines[1] if len(lines) > 1 else "",
                    ))
            except Exception:
                continue

    except Exception as e:
        return []  # Non-fatal — other sources still run

    return topics[:10]


async def _fetch_reddit_hot(page: Page) -> list[TrendingTopic]:
    """Fetch hot/rising posts from AI subreddits via JSON API."""
    topics = []
    subreddits = [
        ("r/artificial",        "https://www.reddit.com/r/artificial/hot.json?limit=10"),
        ("r/MachineLearning",   "https://www.reddit.com/r/MachineLearning/hot.json?limit=10"),
        ("r/singularity",       "https://www.reddit.com/r/singularity/hot.json?limit=10"),
        ("r/OpenAI",            "https://www.reddit.com/r/OpenAI/hot.json?limit=10"),
    ]

    for label, url in subreddits:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=10_000)
            content = await page.inner_text("pre, body")
            data = json.loads(content)
            posts = data.get("data", {}).get("children", [])

            for post in posts[:5]:
                p = post.get("data", {})
                title  = p.get("title", "").strip()
                score  = p.get("score", 0)
                permalink = p.get("permalink", "")

                if not title or score < 50:
                    continue

                topics.append(TrendingTopic(
                    topic=title,
                    source="reddit",
                    engagement_score=score,
                    context=f"{label} · {score} upvotes",
                    url=f"https://reddit.com{permalink}",
                ))
        except Exception:
            continue

    # Sort by engagement and deduplicate similar topics
    topics.sort(key=lambda t: t.engagement_score, reverse=True)
    return topics[:15]


async def _fetch_hackernews(page: Page) -> list[TrendingTopic]:
    """Fetch top AI-related stories from HackerNews front page."""
    topics = []
    ai_keywords = ["ai", "gpt", "llm", "claude", "gemini", "openai", "anthropic",
                   "machine learning", "neural", "chatgpt", "robot", "deepmind",
                   "language model", "diffusion", "transformer"]
    try:
        await page.goto("https://news.ycombinator.com", wait_until="domcontentloaded", timeout=10_000)

        # Each story is a .athing row
        story_rows = await page.query_selector_all(".athing")

        for row in story_rows[:30]:
            try:
                title_el = await row.query_selector(".titleline a")
                if not title_el:
                    continue
                title = (await title_el.inner_text()).strip()

                # Check for AI relevance
                if not any(kw in title.lower() for kw in ai_keywords):
                    continue

                href = await title_el.get_attribute("href") or ""

                # Get score from the next sibling row
                score = 0
                try:
                    row_id = await row.get_attribute("id")
                    if row_id:
                        score_el = await page.query_selector(f"#score_{row_id}")
                        if score_el:
                            score_text = await score_el.inner_text()
                            score = int(re.search(r"\d+", score_text).group())
                except Exception:
                    pass

                topics.append(TrendingTopic(
                    topic=title,
                    source="hackernews",
                    engagement_score=score,
                    context=f"Hacker News · {score} points",
                    url=href if href.startswith("http") else f"https://news.ycombinator.com/{href}",
                ))
            except Exception:
                continue

    except Exception:
        pass

    topics.sort(key=lambda t: t.engagement_score, reverse=True)
    return topics[:10]


# ── Main entry point ──────────────────────────────────────────────────────────

async def fetch_trends() -> TrendsResult:
    """
    Fetch trending AI topics from all sources in parallel.
    Returns a TrendsResult with deduplicated, sorted topics.
    """
    from datetime import datetime, timezone
    result = TrendsResult(fetched_at=datetime.now(timezone.utc).isoformat())

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )

        # Block images/media for speed
        async def block_media(route):
            if route.request.resource_type in ("image", "media", "font"):
                await route.abort()
            else:
                await route.continue_()

        # Run all three sources with separate pages (parallel)
        pages = await asyncio.gather(
            context.new_page(),
            context.new_page(),
            context.new_page(),
        )

        for page in pages:
            await page.route("**/*", block_media)

        google_topics, reddit_topics, hn_topics = await asyncio.gather(
            _fetch_google_trends(pages[0]),
            _fetch_reddit_hot(pages[1]),
            _fetch_hackernews(pages[2]),
        )

        await browser.close()

    # Merge and deduplicate
    all_topics = google_topics + reddit_topics + hn_topics

    # Simple dedup: skip topics whose keywords overlap with an already-added one
    seen_words: set[str] = set()
    deduped: list[TrendingTopic] = []
    for t in all_topics:
        words = set(re.findall(r"\b\w{4,}\b", t.topic.lower()))
        if not words.intersection(seen_words):
            deduped.append(t)
            seen_words.update(words)

    # Sort: Google Trends first (real search intent), then by engagement
    source_priority = {"google_trends": 0, "hackernews": 1, "reddit": 2}
    deduped.sort(key=lambda t: (source_priority.get(t.source, 9), -t.engagement_score))

    result.topics = deduped[:20]
    return result


# ── Quick test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = asyncio.run(fetch_trends())
    print(f"Fetched {len(result.topics)} trending topics at {result.fetched_at}\n")
    for i, t in enumerate(result.topics, 1):
        print(f"{i:2}. [{t.source:14}] {t.topic}")
        if t.context:
            print(f"       {t.context}")
