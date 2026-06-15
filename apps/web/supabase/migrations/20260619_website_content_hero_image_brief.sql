-- Hero Image V2 — Commit A: editor brief column on website_content.
--
-- Stores the magazine-photo-editor's reasoning that produced the hero image:
--   { story_in_one_sentence, editorial_tension, cover_concept,
--     subject_anchors[], style_references[], extra_negatives[] }
--
-- Purpose: when a generated hero misses the editorial mark, this column tells
-- us WHICH stage failed — bad editor reasoning (brief is wrong) vs Ideogram
-- rendering the right brief poorly. The brief is also surfaced in the Atlas
-- review UI (Commit D) so operators see the editor's three-sentence rationale
-- before approving or regenerating.
--
-- Additive, nullable, idempotent. Behavior-neutral until Commit C wires the
-- new photo-editor function to persist into it.

ALTER TABLE public.website_content
  ADD COLUMN IF NOT EXISTS hero_image_brief jsonb;
