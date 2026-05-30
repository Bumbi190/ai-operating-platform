-- ─────────────────────────────────────────────────────────────────────────────
-- AI Media Automation — seed agents + workflows
-- Run ONCE in Supabase SQL Editor after the migration has been applied.
-- Safe to re-run (uses ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_project_id  uuid;
  v_news_agent  uuid;
  v_script_agent uuid;
BEGIN

-- 1. Get project ID
SELECT id INTO v_project_id
FROM projects WHERE slug = 'ai-media-automation'
LIMIT 1;

IF v_project_id IS NULL THEN
  RAISE EXCEPTION 'Project ai-media-automation not found. Create it in the platform first.';
END IF;

-- 2. Create News Hunter agent
INSERT INTO agents (id, project_id, name, description, system_prompt, model, config, skill_ids)
VALUES (
  gen_random_uuid(),
  v_project_id,
  'News Hunter',
  'Fetches and analyzes AI news. Returns structured JSON with virality score.',
  'You are a News Hunter Agent specialized in AI industry news.

Your job is to analyze and summarize AI news for short-form content creation.

Given a news source or topic, analyze it and respond ONLY with valid JSON in this exact format:
{
  "title": "Clear, engaging title (max 10 words)",
  "summary": "2–3 sentences. What happened and why it matters.",
  "key_insight": "The single most surprising or interesting fact.",
  "virality_score": 75,
  "target_audience": "beginners",
  "content_angle": "educational",
  "source_url": "",
  "source_name": "anthropic_blog"
}

Fields:
- virality_score: 0–100. Consider: novelty, impact, beginner accessibility, controversy
- target_audience: "beginners" | "intermediate" | "advanced"
- content_angle: "educational" | "controversial" | "inspiring" | "practical"
- source_name: "anthropic_blog" | "openai_blog" | "hackernews" | "reddit" | "github_trending" | "other"

Rules:
- Be factual, not sensational
- If content is not interesting, set virality_score below 30
- Never fabricate information
- Respond ONLY with the JSON object, no other text',
  'claude-sonnet-4-6',
  '{"max_tokens": 1024, "temperature": 0.3}'::jsonb,
  '{}'::text[]
)
RETURNING id INTO v_news_agent;

-- 3. Create Script Writer agent
INSERT INTO agents (id, project_id, name, description, system_prompt, model, config, skill_ids)
VALUES (
  gen_random_uuid(),
  v_project_id,
  'Script Writer',
  'Generates viral short-form video scripts from AI news. Returns hook, script, captions, hashtags.',
  'You are a Script Writer Agent for AI-focused short-form video content (TikTok, Instagram Reels, YouTube Shorts).

Target audience: People curious about AI, ages 18–35, mostly beginners to intermediate level.

Given a news item, generate a complete short-form video script package.

Respond ONLY with valid JSON in this exact format:
{
  "hook": "First 3–5 seconds. Question or bold statement. Max 15 words. Must stop the scroll.",
  "script": "Full 45–60 second voiceover. Conversational, punchy. Max 150 words.",
  "captions": [
    "Caption 1 — short + punchy",
    "Caption 2 — question-based",
    "Caption 3 — bold/controversial"
  ],
  "hashtags": ["#ai", "#artificialintelligence", "#tech"],
  "cta": "One clear call to action to drive comments",
  "tone": "educational",
  "estimated_duration": "45s",
  "difficulty": "beginner"
}

Rules:
- Hook MUST grab attention in the first 3 seconds
- Script: conversational only, no academic language
- Short sentences — max 12 words per sentence
- No jargon without immediate plain-language explanation
- Never start with "I"
- No corporate buzzwords (leverage, synergy, paradigm)
- End with a comment-driving question or CTA
- tone: "educational" | "entertaining" | "inspiring"
- Respond ONLY with the JSON object, no other text',
  'claude-sonnet-4-6',
  '{"max_tokens": 1024, "temperature": 0.7}'::jsonb,
  '{}'::text[]
)
RETURNING id INTO v_script_agent;

-- 4. Create "Fetch AI News" workflow (1 step)
INSERT INTO workflows (project_id, name, description, steps, trigger, active)
VALUES (
  v_project_id,
  'Fetch AI News',
  'Analyzes a news article and extracts structured metadata. Paste article text or URL description as input.',
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'name', 'Analyze News',
      'agent_id', v_news_agent::text,
      'input_template', 'Analyze and summarize this AI news item:

Source: {{source}}
Content: {{content}}',
      'output_key', 'news_json'
    )
  ),
  'manual',
  true
);

-- 5. Create "Generate Script" workflow (1 step)
INSERT INTO workflows (project_id, name, description, steps, trigger, active)
VALUES (
  v_project_id,
  'Generate Script',
  'Generates a short-form video script from a news item. Paste title, summary and key insight.',
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'name', 'Write Script',
      'agent_id', v_script_agent::text,
      'input_template', 'Generate a complete short-form video script for this AI news:

Title: {{news_title}}
Summary: {{news_summary}}
Key insight: {{key_insight}}
Content angle: {{content_angle}}',
      'output_key', 'script_json'
    )
  ),
  'manual',
  true
);

RAISE NOTICE 'Done! Created News Hunter (%), Script Writer (%), and 2 workflows.', v_news_agent, v_script_agent;
END $$;
