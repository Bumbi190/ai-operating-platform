# AI Media Automation — MVP Architecture

**Project:** AI Media Automation (`ai-media-automation`)  
**Inside:** AI Operating Platform  
**Goal:** Lean, human-in-the-loop content pipeline for AI news → short-form video scripts  
**Date:** 2026-05-20

---

## Core philosophy

> Build the smallest loop that produces real value.  
> Reuse everything that already exists. Add only what's truly missing.

The platform already has: agents, workflows, runs, approvals, outputs, chat.  
We add only two domain tables and two agents. Nothing else for MVP.

---

## The content loop (MVP)

```
[Run: Fetch News] → media_news_items → [Run: Generate Script] → media_scripts → [Approval Queue] → Published
```

1. User runs **News Hunter workflow** (or schedules it daily)
2. News items land in `media_news_items`
3. User picks an interesting item, runs **Script Writer workflow** with it
4. Generated script lands in `media_scripts` with status `pending_review`
5. User reviews in Approvals → approve / reject / regenerate
6. Approved scripts marked `approved` → ready to publish manually

---

## Agent 1: News Hunter

### Purpose
Fetch, analyze, and normalize AI news from a given source or topic into structured data.

### System prompt

```
Du är en News Hunter Agent specialiserad på AI-industrinyheter.

Ditt jobb är att analysera och sammanfatta AI-nyheter för skapande av kortformat-innehåll.

Givet en nyhetskälla eller ämne ska du:
1. Identifiera den viktigaste historien eller tillkännagivandet
2. Lyfta fram vad som är genuint intressant eller nytt
3. Betygsätta viral potential (0–100) baserat på: nyhet, påverkan, kontrovers, tillgänglighet för nybörjare
4. Skriva en ren 2–3 meningars sammanfattning

Svara ENBART med giltig JSON i exakt detta format:
{
  "title": "Tydlig, engagerande rubrik",
  "summary": "2–3 meningar om vad som hänt och varför det spelar roll",
  "key_insight": "Den enda mest intressanta/överraskande saken",
  "virality_score": 75,
  "target_audience": "beginners|intermediate|advanced",
  "content_angle": "educational|controversial|inspiring|practical",
  "source_url": "https://...",
  "source_name": "anthropic_blog|openai_blog|hackernews|reddit|github_trending"
}

Regler:
- Var faktabaserad, inte sensationell
- Fokusera på vad som genuint är nytt eller överraskande
- Om inget intressant finns, sätt virality_score under 30
- Hitta aldrig på information
- Om input är på engelska, skriv output på engelska
```

### Workflow steps
| Step | Agent | Input template | Output key |
|------|-------|----------------|------------|
| 1 | News Hunter | `Analysera och sammanfatta denna AI-nyhet:\n\nKälla: {{source}}\n\nURL/text: {{content}}` | `news_json` |

### Input variables
- `source` — e.g. "Anthropic Blog", "Hacker News", "Reddit r/MachineLearning"
- `content` — pasted article text or URL description

---

## Agent 2: Script Writer

### Purpose
Transform a news item into a complete short-form video script package (hook, script, captions, CTA).

### System prompt

```
You are a Script Writer Agent for AI-focused short-form video content (TikTok, Instagram Reels, YouTube Shorts).

Target audience: People curious about AI, ages 18–35, mostly beginners to intermediate level.

Given a news item, generate a complete short-form video script package.

Respond ONLY with valid JSON in this exact format:
{
  "hook": "First 3–5 seconds. Must stop the scroll. Start with a question or a bold statement. Max 15 words.",
  "script": "Full 45–60 second voiceover script. Conversational, punchy. Max 150 words. No academic language.",
  "captions": [
    "Caption option 1 — short + punchy",
    "Caption option 2 — question-based",
    "Caption option 3 — controversial/bold"
  ],
  "hashtags": ["#ai", "#artificialintelligence", "#chatgpt"],
  "cta": "Single clear call to action to drive comments (e.g. 'What do you think? Drop it below 👇')",
  "estimated_duration": "45s",
  "tone": "educational|entertaining|inspiring",
  "difficulty": "beginner|intermediate"
}

Rules:
- Hook MUST grab attention in the first 3 seconds — this is everything
- Script must be conversational, never academic
- No jargon without immediate plain-language explanation
- Short sentences only — max 12 words per sentence
- End with a comment-driving question or CTA
- Write scripts in English for global reach
- Never start sentences with "I"
- Never use corporate buzzwords (leverage, synergy, paradigm, etc.)
```

### Workflow steps
| Step | Agent | Input template | Output key |
|------|-------|----------------|------------|
| 1 | Script Writer | `Generate a complete short-form video script for this AI news item:\n\nTitle: {{news_title}}\nSummary: {{news_summary}}\nKey insight: {{key_insight}}\nContent angle: {{content_angle}}` | `script_json` |

### Input variables
- `news_title` — from approved news item
- `news_summary` — 2–3 sentence summary
- `key_insight` — the single most interesting fact
- `content_angle` — educational / controversial / inspiring / practical

---

## Supabase schema

Two new tables. Everything else reuses existing platform tables.

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- media_news_items: stores fetched and normalized AI news
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE media_news_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  run_id        uuid REFERENCES runs(id),          -- the run that fetched this item

  title         text NOT NULL,
  summary       text,
  key_insight   text,
  url           text,
  source_name   text,                              -- 'anthropic_blog', 'hackernews', etc.
  target_audience text,
  content_angle text,
  virality_score int DEFAULT 0,                   -- 0–100

  status        text DEFAULT 'new',               -- 'new' | 'approved' | 'rejected' | 'scripted'
  raw_output    jsonb,                             -- full JSON from News Hunter agent

  fetched_at    timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- media_scripts: generated scripts linked to news items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE media_scripts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  news_item_id  uuid REFERENCES media_news_items(id),
  run_id        uuid REFERENCES runs(id),          -- the run that generated this script

  hook          text,
  script        text,
  captions      jsonb,                             -- array of caption options
  hashtags      jsonb,                             -- array of hashtags
  cta           text,
  tone          text,
  estimated_duration text,
  raw_output    jsonb,                             -- full JSON from Script Writer agent

  status        text DEFAULT 'pending_review',    -- 'pending_review' | 'approved' | 'rejected' | 'published'
  feedback      text,                             -- reviewer notes on rejection/edit
  version       int DEFAULT 1,                    -- increments on regeneration

  generated_at  timestamptz DEFAULT now(),
  reviewed_at   timestamptz,
  published_at  timestamptz
);

-- Indexes for common queries
CREATE INDEX idx_media_news_status ON media_news_items(project_id, status);
CREATE INDEX idx_media_scripts_status ON media_scripts(project_id, status);
CREATE INDEX idx_media_scripts_news ON media_scripts(news_item_id);
```

---

## Approval states

```
media_news_items:
  new → approved (user selects for scripting)
  new → rejected (not interesting)
  approved → scripted (script has been generated)

media_scripts:
  pending_review → approved (ready to publish)
  pending_review → rejected (needs regeneration)
  approved → published (manually published)
  rejected → pending_review (after regeneration, version++)
```

---

## Dashboard views (MVP)

For absolute MVP: **use existing platform views** (Outputs + Approvals).  
These custom views are the first meaningful frontend addition after MVP:

| View | Route | Data source | Priority |
|------|-------|-------------|----------|
| News Feed | `/projects/ai-media-automation/news` | `media_news_items` | Phase 2 |
| Script Queue | `/projects/ai-media-automation/scripts` | `media_scripts` | Phase 2 |
| Approval Queue | Already exists in platform | `media_scripts WHERE status='pending_review'` | Exists |
| Agent Status | Already exists (runs/logs) | `runs` | Exists |

---

## Implementation order

### Phase 0 — Zero code, works today (Day 1)
1. Create **News Hunter** agent in platform UI with system prompt above
2. Create **Script Writer** agent in platform UI with system prompt above
3. Create **Fetch AI News** workflow (1 step: News Hunter)
4. Create **Generate Script** workflow (1 step: Script Writer)
5. Run manually, review outputs in existing Outputs tab

**This gives you a working loop today. No code written.**

---

### Phase 1 — Domain tables (Day 2–3)
6. Apply migration: add `media_news_items` and `media_scripts` tables
7. Update workflow runner to detect JSON output and insert into domain tables
   - After News Hunter runs: parse `news_json` → insert row in `media_news_items`
   - After Script Writer runs: parse `script_json` → insert row in `media_scripts`

---

### Phase 2 — Custom dashboard views (Week 2)
8. `/projects/ai-media-automation/news` — card grid with virality score, approve/reject buttons
9. `/projects/ai-media-automation/scripts` — script review with edit + regenerate
10. Link news items → scripts visually

---

### Phase 3 — Automation (Month 2)
11. Daily cron job for News Hunter (Vercel cron or scheduled task)
12. Auto-trigger Script Writer for approved news items
13. Analytics: track which hooks/angles get most engagement

---

## Where NOT to overengineer

| Temptation | Why to skip it (MVP) |
|------------|----------------------|
| Redis queue | Supabase `status` column is a queue. Use it. |
| LangGraph | Two sequential agents don't need a graph framework |
| n8n | Existing workflow runner handles this |
| Opportunity Scoring Agent | Just use virality_score from News Hunter initially |
| Voice/video pipeline | Only after scripts are proving value |
| Multi-source news fetcher | Start with manual paste → automate later |
| Semantic search on news | pgvector is ready when you need it, not before |
| Separate microservice | Everything lives in the existing Next.js app |

---

## Future upgrade paths (when you actually need them)

- **Auto-fetch news:** Vercel cron hitting News Hunter for each source daily
- **Voice:** Add ElevenLabs step to workflow after script approval
- **Video:** Remotion or simple FFmpeg assembly step
- **Publishing:** Meta/TikTok API integration as a workflow step
- **Analytics feedback loop:** Store engagement data → feed back into Script Writer prompt
- **Virality prediction:** Train on your own performance data over time
