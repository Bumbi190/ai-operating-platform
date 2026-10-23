/**
 * Instagram Agent Skill - curated editorial rules for Omnira's existing flows.
 *
 * Based on concepts from Jakeschincariol/instagram-agent-skill (MIT license,
 * copyright 2026 Jake Schincariol). The upstream Python scripts are installed
 * LOCALLY for operator-assisted work; they are not invoked from the web app.
 * No network, model calls, account access, metrics collection or publishing.
 */
export const INSTAGRAM_AGENT_SOURCE = {
  repository: 'https://github.com/Jakeschincariol/instagram-agent-skill',
  revision: 'd03c56bb598be770c60b201f94237e5d1a4268a6',
  license: 'MIT',
  mode: 'editorial-only',
} as const

/** Creative direction only. The approved source and editorial contract win. */
export const INSTAGRAM_AGENT_PROMPT_GUIDANCE = [
  'INSTAGRAM HOOK LAB (inspired by the MIT Instagram Agent skill pack; editorial only):',
  '- Before choosing the final hook, privately consider three DIFFERENT truthful structures: the verified result first; the concrete real-world problem or stake first; and the surprising documented contrast first. No fictional receipts, invented numbers, customer stories, or fake urgency.',
  '- Pick the strongest angle based on source evidence, not a synthetic "viral" score. The winning hook must still satisfy the existing named-actor/verified-fact rules and duration limits.',
  '- Keep the first on-screen card instantly readable (ideally at most six words); show it at frame 0 inside mobile safe zones. Write speech and on-screen copy for the same fact, but not necessarily the same words.',
  '- One idea per video. After each beat, ask whether a viewer learns or sees something new; cut filler. Deliver the promised payoff and use only the existing approved single CTA.',
  '- Distinguish hook rubric scores and creative hypotheses from platform performance. NEVER label a hook as proven or viral unless actual account-specific post insights support the claim.',
  '- Do not change the existing JSON schema, voice lock, visual provenance, publication gate, or production cost limits.',
].join('\n')

export const INSTAGRAM_AGENT_FAMILY_GUIDANCE = [
  'INSTAGRAM REEL IDÉTEST (endast Familje-Stunden; svensk copy):',
  '- Pröva internt tre olika inledningar innan du väljer en: konkret vardagsnytta, välbekant föräldrasituation och nyfiken detalj från en godkänd aktivitet eller saga.',
  '- Välj en sann, varm och begriplig hook; använd inte påhittade utvecklingsresultat, tidsvinster, statistik eller pressande clickbait för barnfamiljer.',
  '- Första skärmrutan ska fungera utan ljud, helst högst sex korta ord, och synas omedelbart. Scener och rörelse kräver redan godkänt bildmaterial och karaktärer.',
  '- En idé per Reel: direkt nytta, ett tydligt ögonblick och en enda CTA som följer briefen. Skriv talad text och text i bild separat om det förbättrar läsbarheten.',
  '- Engelskspråkiga Python-verktyg för hookscore och humanizer är inte tillförlitliga betygssättare för svenska. Ingen automatisk omskrivning baserad på dessa poäng.',
  '- Behåll godkänd kanon, språk, röster, scenformat, publiceringsgrind och alla befintliga JSON-fält.',
].join('\n')

export const INSTAGRAM_AGENT_REVIEW_GUIDANCE = [
  'INSTAGRAM EDITORIAL CHECK (script-level only; do not pretend to watch finished video):',
  '- Evaluate whether the hook is a verifiable claim, appears from frame 0 in the planned on-screen text, and is short enough to grasp before viewers scroll.',
  '- Flag any missing consequence/payoff, generic filler, copied competitor material, fabricated performance, or unsupported promise. Do not silently rewrite copy.',
  '- A hook-score heuristic is NOT an engagement probability. Use real watch-time, shares/reach and saves/reach from the SAME account to judge posted material later.',
  '- Never alter the existing six QA dimensions, thresholds, factual safeguards or JSON contract.',
].join('\n')
