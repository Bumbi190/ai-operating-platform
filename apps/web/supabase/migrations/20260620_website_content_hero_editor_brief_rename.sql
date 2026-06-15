-- Hero Image V2 — Commit B: rename hero_image_brief → hero_editor_brief.
--
-- The column was added empty in Commit A (ec133df) under the working name
-- `hero_image_brief`. Phase 1 spec calls it `hero_editor_brief` to reflect that
-- it stores the editor agent's reasoning, not just an image prompt. The column
-- holds zero rows of data, so the rename is purely cosmetic / contractual.
--
-- The brief itself (story / visual_metaphor / shot / avoid / editorial_style +
-- metadata { generated_at, model }) lives inside the jsonb value — no schema
-- change needed for those fields.

ALTER TABLE public.website_content
  RENAME COLUMN hero_image_brief TO hero_editor_brief;
