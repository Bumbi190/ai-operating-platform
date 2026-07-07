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
import httpx


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


async def _fetch_hackernews_api() -> list[TrendingTopic]:
    """
    Fetch top AI-related stories from HackerNews via the official Firebase API.
    No Playwright needed — direct HTTP calls, ~3x faster and 100% reliable.
    """
    ai_keywords = ["ai", "gpt", "llm", "claude", "gemini", "openai", "anthropic",
                   "machine learning", "neural", "chatgpt", "robot", "deepmind",
                   "language model", "diffusion", "transformer", "agent"]
    topics = []
    base = "https://hacker-news.firebaseio.com/v0"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Get top story IDs
            r = await client.get(f"{base}/topstories.json")
            r.raise_for_status()
            top_ids: list[int] = r.json()[:50]  # check top 50 for AI relevance

            # Fetch stories concurrently in batches of 10
            async def fetch_item(sid: int) -> dict:
                resp = await client.get(f"{base}/item/{sid}.json")
                return resp.json() if resp.is_success else {}

            for i in range(0, len(top_ids), 10):
                batch = top_ids[i:i + 10]
                items = await asyncio.gather(*[fetch_item(sid) for sid in batch])
                for item in items:
                    if not item:
                        continue
                    title = (item.get("title") or "").strip()
                    if not title or not any(kw in title.lower() for kw in ai_keywords):
                        continue
                    score = item.get("score", 0)
                    url   = item.get("url") or f"https://news.ycombinator.com/item?id={item.get('id', '')}"
                    topics.append(TrendingTopic(
                        topic=title,
                        source="hackernews",
                        engagement_score=score,
                        context=f"Hacker News · {score} points · {item.get('descendants', 0)} comments",
                        url=url,
                    ))
                if len(topics) >= 10:
                    break

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

            # Block images/media for speed
            async def block_media(route):
                if route.request.resource_type in ("image", "media", "font"):
                    await route.abort()
                else:
                    await route.continue_()

            # Google Trends + Reddit use Playwright; HN uses direct Firebase API
            pages = await asyncio.gather(
                context.new_page(),
                context.new_page(),
            )

            for page in pages:
                await page.route("**/*", block_media)

            # All three run in parallel — HN via API, no browser page needed
            google_topics, reddit_topics, hn_topics = await asyncio.gather(
                _fetch_google_trends(pages[0]),
                _fetch_reddit_hot(pages[1]),
                _fetch_hackernews_api(),   # ← Firebase API, no Playwright
            )
        finally:
            try:
                await browser.close()
            except Exception:
                pass

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
