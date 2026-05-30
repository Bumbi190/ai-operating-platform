"""
main.py — Hermes Worker (FastAPI)

Three endpoints:
  POST /scrape   — autonomously browse the web and find the best AI news story
  POST /research — deep-dive research on a specific topic
  POST /read     — fetch a URL and extract clean article text (no Gemini, just Playwright)

Authentication: Bearer token via HERMES_SECRET env var.
"""

import json
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from web_agent import WebAgent
from article_reader import read_article
from trends_reader import fetch_trends

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
HERMES_SECRET  = os.getenv("HERMES_SECRET", "")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is required")

# ── Auth helper ───────────────────────────────────────────────────────────────

def require_auth(request: Request):
    if not HERMES_SECRET:
        return  # no secret configured → open (dev mode)
    auth = request.headers.get("authorization", "")
    if auth != f"Bearer {HERMES_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Request / Response schemas ────────────────────────────────────────────────

class ScrapeRequest(BaseModel):
    exclude_urls: list[str] = []  # URLs already in DB, to avoid duplicates
    max_turns: int = 25

class ResearchRequest(BaseModel):
    topic: str
    depth: str = "standard"       # "quick" | "standard" | "deep"
    max_turns: int = 30

class ReadRequest(BaseModel):
    url: str
    timeout_ms: int = 15_000


# ── Prompts ───────────────────────────────────────────────────────────────────

SCRAPE_PROMPT_TEMPLATE = """
You are a news researcher for "The Prompt" — a daily AI insider news channel.
Your job: find the single most compelling AI news story published in the last 48 hours.

SOURCES to check (in order of priority):
1. https://techcrunch.com/category/artificial-intelligence/
2. https://theverge.com/ai-artificial-intelligence
3. https://venturebeat.com/ai/
4. https://www.wired.com/tag/artificial-intelligence/
5. https://news.ycombinator.com (search for top AI stories)

EXCLUDED URLs (already published — skip these):
{exclude_list}

CRITERIA for the best story:
- Breaking news or major announcements (new model releases, funding rounds, policy changes)
- High virality potential for a developer/tech audience
- Concrete facts: numbers, company names, model names

When you find the best story, return ONLY a JSON object — no markdown, no explanation:
{{
  "title": "Short punchy headline (max 10 words)",
  "url": "https://...",
  "source_name": "TechCrunch",
  "summary": "2-3 sentence summary of the key development",
  "key_insight": "The single most surprising or important takeaway",
  "virality_score": 85,
  "content_angle": "educational"
}}

virality_score: 0-100
content_angle: "educational" | "controversial" | "inspiring" | "practical"
"""

RESEARCH_PROMPT_TEMPLATE = """
You are a research analyst for "The Prompt" — a daily AI insider news channel.
Your task: do a thorough research deep-dive on the following topic.

TOPIC: {topic}

DEPTH: {depth}
- "quick": Check 2-3 sources, 5-minute research
- "standard": Check 4-6 sources, 10-minute research
- "deep": Check 8+ sources, 20-minute research

Start with a Google search, then visit the most relevant pages.
Gather: key facts, recent developments, notable companies/people, controversies, numbers.

When finished, return ONLY a JSON object — no markdown, no explanation:
{{
  "topic": "{topic}",
  "summary": "3-5 sentence overview",
  "key_facts": ["fact 1", "fact 2", "fact 3"],
  "key_players": ["Company A", "Person B"],
  "recent_developments": ["development 1", "development 2"],
  "sources_visited": ["https://...", "https://..."],
  "virality_score": 72,
  "suggested_angle": "educational",
  "script_hook_idea": "One punchy opening line for a video script"
}}
"""

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Hermes Worker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "hermes"}


@app.post("/scrape")
async def scrape(payload: ScrapeRequest, request: Request):
    """
    Autonomously browse the web and find the best AI news story.
    Returns structured JSON ready to feed into Omnira's step1 pipeline.
    """
    require_auth(request)

    exclude_list = (
        "\n".join(f"- {u}" for u in payload.exclude_urls)
        if payload.exclude_urls
        else "(none)"
    )
    prompt = SCRAPE_PROMPT_TEMPLATE.format(exclude_list=exclude_list)

    agent  = WebAgent(api_key=GEMINI_API_KEY)
    result = await agent.run(prompt, max_turns=payload.max_turns)

    # Try to parse the JSON the agent returns
    try:
        # Agent may wrap JSON in markdown fences — strip them
        clean = result.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        data  = json.loads(clean)
    except json.JSONDecodeError:
        # Return raw text if parsing fails — caller can handle
        return {"raw": result, "parsed": False}

    return {"data": data, "parsed": True}


@app.post("/research")
async def research(payload: ResearchRequest, request: Request):
    """
    Deep-dive research on a specific topic.
    Returns structured findings ready to feed into Omnira's script pipeline.
    """
    require_auth(request)

    prompt = RESEARCH_PROMPT_TEMPLATE.format(
        topic=payload.topic,
        depth=payload.depth,
    )

    agent  = WebAgent(api_key=GEMINI_API_KEY)
    result = await agent.run(prompt, max_turns=payload.max_turns)

    try:
        clean = result.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        data  = json.loads(clean)
    except json.JSONDecodeError:
        return {"raw": result, "parsed": False}

    return {"data": data, "parsed": True}


@app.post("/read")
async def read(payload: ReadRequest, request: Request):
    """
    Fetch a URL with Playwright and return clean article text.
    No Gemini needed — pure DOM extraction. Fast (~3-5 seconds).

    Use this to get full article content before feeding it to Claude
    for script writing — much better quality than RSS summaries.
    """
    require_auth(request)

    result = await read_article(payload.url, timeout_ms=payload.timeout_ms)

    if not result.success:
        return {
            "success": False,
            "url":     payload.url,
            "error":   result.error,
            "text":    "",
            "title":   "",
            "word_count": 0,
        }

    return {
        "success":    True,
        "url":        result.url,
        "title":      result.title,
        "text":       result.text,
        "word_count": result.word_count,
    }


@app.get("/trends")
async def trends(request: Request):
    """
    Fetch trending AI topics from Google Trends, Reddit, and HackerNews.
    No Gemini — pure Playwright DOM scraping. Takes ~15-20 seconds.

    Returns a ranked list of trending topics to guide editorial news selection.
    """
    require_auth(request)

    result = await fetch_trends()

    return {
        "fetched_at": result.fetched_at,
        "count":      len(result.topics),
        "topics": [
            {
                "topic":            t.topic,
                "source":           t.source,
                "search_volume":    t.search_volume,
                "engagement_score": t.engagement_score,
                "context":          t.context,
                "url":              t.url,
            }
            for t in result.topics
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
