-- ═══════════════════════════════════════════════════════════════════
--  Seed data for local development
--  Replace <YOUR_USER_ID> with your Supabase Auth user ID
--  (found in Supabase Dashboard → Authentication → Users)
-- ═══════════════════════════════════════════════════════════════════

-- Create Familje-Stunden project
INSERT INTO projects (owner_id, name, slug, color) VALUES
  ('<YOUR_USER_ID>', 'Familje-Stunden', 'familje-stunden', '#ec4899')
ON CONFLICT DO NOTHING;

-- Create GainPilot project
INSERT INTO projects (owner_id, name, slug, color) VALUES
  ('<YOUR_USER_ID>', 'GainPilot', 'gainpilot', '#6366f1')
ON CONFLICT DO NOTHING;

-- Create StoryAgent for Familje-Stunden
INSERT INTO agents (project_id, name, description, system_prompt, model, config)
SELECT
  id,
  'StoryAgent',
  'Skapar barnvänliga berättelser baserat på tema och åldersgrupp',
  'Du är en kreativ barnboksförfattare som skriver på svenska.
Du skapar engagerande, åldersanpassade berättelser med:
- Tydlig handling (början, mitten, slut)
- Positiva värderingar och lärdomar
- Levande karaktärer som barn kan identifiera sig med
- Enkelt men rikt språk

Format: Returnera berättelsen som ren text med rubrik överst.
Längd: 300–500 ord om inget annat anges.',
  'claude-sonnet-4-6',
  '{"max_tokens": 1500, "temperature": 0.8}'
FROM projects WHERE slug = 'familje-stunden';

-- Create ActivityAgent for Familje-Stunden
INSERT INTO agents (project_id, name, description, system_prompt, model, config)
SELECT
  id,
  'ActivityAgent',
  'Skapar barnaktiviteter kopplade till berättelsens tema',
  'Du skapar praktiska familjeaktiviteter kopplade till en berättelse.
Varje aktivitet ska:
- Ta 15–45 minuter
- Kräva enkelt material (finns hemma)
- Passa barn 4–8 år
- Ha tydliga steg-för-steg-instruktioner

Returnera ett JSON-objekt med nyckeln "activities" som innehåller en lista aktiviteter.
Varje aktivitet har: title, duration_minutes, materials (lista), steps (lista), learning_goal.',
  'claude-haiku-4-5',
  '{"max_tokens": 2000, "temperature": 0.7}'
FROM projects WHERE slug = 'familje-stunden';

-- Create Månadspaket workflow
INSERT INTO workflows (project_id, name, description, steps, trigger)
SELECT
  p.id,
  'Månadspaket Generator',
  'Genererar ett komplett aktivitetspaket för en månad',
  json_build_array(
    json_build_object(
      'order', 1,
      'name', 'Skriv berättelse',
      'agent_id', (SELECT id::text FROM agents WHERE project_id = p.id AND name = 'StoryAgent'),
      'input_template', 'Skriv en berättelse med temat ''{{theme}}'' för barn i åldern {{age_range}}.',
      'output_key', 'story'
    ),
    json_build_object(
      'order', 2,
      'name', 'Skapa aktiviteter',
      'agent_id', (SELECT id::text FROM agents WHERE project_id = p.id AND name = 'ActivityAgent'),
      'input_template', 'Baserat på denna berättelse:\n\n{{story}}\n\nSkapa 3 familjeaktiviteter kopplade till temat ''{{theme}}''.',
      'output_key', 'activities'
    )
  )::jsonb,
  'manual'
FROM projects p WHERE p.slug = 'familje-stunden';
