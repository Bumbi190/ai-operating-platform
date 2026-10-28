# Atlas Notion: live project handover read P1 (opt-in)

## Status

P0 source reader is merged (#572). This P1 builds an **on-demand, read-only Atlas
chat tool** above P0. Merging P1 without environment configuration **does not**
connect Notion, ingest documents, activate an agent, or change any scheduler.

The tool is offered only for clear read-only questions about Notion, historical
decisions, project memory or handovers. It is absent from content fast path,
static conversation, website Studio, workflow/action, navigation and dream
resolution turns. For those turns, the established tool registry is unchanged.
Once source text arrives, the only tool available in that chat turn is the
Notion read-only tool. No publishing, email, workflow, spending or delegation
tools can execute on the basis of an untrusted document in that turn.

## Trust and data flow

1. Authenticated Supabase user → `getAllowedProjectIds(db,user.id)` on each
   request. No model/request project scope can authorize a project.
2. Model asks `get_notion_project_handover({project,question})` ONLY when
   a Notion-knowledge read is relevant and the server connection is configured.
3. `resolveOwnedProjectId(db,project,allowedProjectIds)` validates the project
   against the current owner-scoped `projects` table.
4. The operator-defined `ATLAS_NOTION_APPROVED_PAGES_JSON` must contain EXACTLY
   ONE page for the resolved project. No model-supplied page ID or unrestricted
   search; Notion itself must also grant read access to that exact page.
5. P0 `readApprovedNotionPage` performs metadata GET, markdown GET, metadata GET,
   and rejects missing/truncated/unknown/warned/changed sources, invalid URLs,
   oversized bodies or revoked Notion access.
6. Tool returns at most 4,800 characters of relevant, clearly labeled source
   excerpts, plus title/URL/edited time/SHA256 of the *whole* source. Source text
   cannot authorize execution, and the assistant must not invent live project
   status from historical notes.
7. For chat conversation persistence, only project/page/title/URL/hash/updated
   metadata are stored; NOT Markdown or the excerpt. No Notion content is copied
   into Atlas M4, OpenViking, Obsidian, Graphify or the public repo.

## Single-page owner setup — initial Handlarbörsen pilot

The ChatGPT Notion plugin and Omnira's server runtime have **different
credentials**. No token is inherited, reused, transmitted from ChatGPT,
recorded in this document or created by a GitHub merge.

1. As the Notion workspace owner, create an **internal connection** named
   **Omnira Atlas – Read Only** in Notion's Developer portal
   ([official instructions](https://developers.notion.com/guides/get-started/internal-connections)).
   Enable *Read content*, no write/insert or access to user emails.
2. In Notion, share **only** the existing Handlarbörsen handover page
   `https://app.notion.com/p/3fb7b977c5b881e08e22c4659aca4d51`
   with that connection. This is a child of the central project page; do NOT
   share the central root, which would grant inherited access to all projects.
3. In Vercel, select the existing project **ai-operating-platform-web**
   and configure the following **server-only** env keys (never `NEXT_PUBLIC_`):

   - `ATLAS_NOTION_READ_TOKEN`: token from the new internal connection,
     **Sensitive/Encrypted**, Production and optionally a protected preview.
     Type it or paste it in **Vercel Settings**, not in a chat, PR, console log
     or repository file.
   - `ATLAS_NOTION_APPROVED_PAGES_JSON`:
     `[{"projectId":"8f673c09-1c8f-4d78-876e-4c14bf1c89b3","pageId":"3fb7b977-c5b8-81e0-8e22-c4659aca4d51"}]`
     This maps the real Omnira Supabase Handlarbörsen project to ONE Notion page.
   - `ATLAS_NOTION_MODE`: start as `off`, then change to exact `read` for
     the limited authenticated pilot once credentials/page permissions have
     been reviewed.

4. Redeploy an exact reviewed `main` commit after changing Vercel environment
   values, using the ordinary release gates. Do **not** turn off branch protection
   or bypass migration guard. Treat preview/production as separate environments.
5. Test a new Atlas chat:
   **"Vad står i Notion om Handlarbörsens pilot och Kareby Bil?"**
   The model should use the single scoped tool, quote the source title and URL,
   and disclose when the excerpt is insufficient. A question naming another
   project must not read the Handlarbörsen page.
6. Revoke page access in Notion and verify the next new chat yields
   `notion_source_unavailable` (no cached/source body returned). Restore
   access only after verifying revocation. This manual proof is mandatory before
   presenting the live integration as accepted.

## Boundary and roadmap

- Only **one** reviewed page/project is admitted in P1. More pages require an
  explicit operator change plus matching access tests.
- No recurring Notion sync or background indexing exists.
- No OpenViking publish step exists in this PR. That remains a separate
  project-scoped, owner-approved publication and quality evaluation after
  stabilizing P1. Do not merge old OpenViking #343 wholesale.
- Graphify remains a code graph and M4 remains authoritative operational memory.
- If Notion is not configured or cannot be reached, Atlas explicitly says it
  has not read the source; it does not fall back to guessed decisions.
- The Notion API revision used by P0 is `2026-03-11`; that endpoint's
  `warnings` field is optional when no warning is present (P1 includes a
  regression for this normal response).
