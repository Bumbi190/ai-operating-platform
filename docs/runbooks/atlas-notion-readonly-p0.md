# Atlas ↔ Notion: P0 source reader (disabled by default)

**Status:** isolated reviewed code candidate. **Not a live Atlas memory integration.**
The source reader is deliberately not registered as an Atlas chat tool, OpenViking
publisher, M4 writer, cron job or UI endpoint. No production configuration changes
are made by merging this code. Nothing is indexed or copied automatically.

## Reason for a separate boundary

- Atlas Memory M4 is the canonical operational event history.
- Obsidian is curated technical knowledge.
- OpenViking (separate draft PR #343) may *later* retrieve approved publications.
- Notion holds owner-maintained project decisions and handovers. It is a **source**
  to read, never an authority to execute actions, approve spending or set permissions.
- Graphify is a code-relationship graph, not another independent memory authority.

A ChatGPT Notion plugin connection does **not** give credentials to Omnira's own
server. This module therefore uses a separately created Notion internal connection,
held only in the server environment; do not copy a ChatGPT OAuth session or token.

## The exact Notion contract

As checked against Notion's documented **2026-03-11** API:

- GET `https://api.notion.com/v1/pages/{page_id}` for metadata.
- GET `https://api.notion.com/v1/pages/{page_id}/markdown` for original Markdown.
- GET the same metadata again to detect concurrent changes.
- Always `Authorization: Bearer ...`, `Notion-Version: 2026-03-11`.
- No search, no child-page crawl, no Notion mutations, no automatic retries.
- Strict UUID page IDs; a trusted, server-managed exact page/project allowlist
  AND fresh user project authorization are both required before network reads.
- Reject inaccessible, archived, trashed, oversized, truncated, warned, unknown
  or concurrently edited sources entirely. Never inject partial source text.
- Keep URL and SHA256 of the exact Markdown as provenance. Source text is
  **untrusted reference data** and can NEVER create execution authority.

Read-only source code:
`apps/web/lib/atlas/notion/read-only.ts`
and `apps/web/lib/atlas/notion/server-config.ts`.

## Operator setup — user action required for a live pilot

1. In the Notion Developer portal, create a new **internal connection** named
   `Omnira Atlas – Read Only`. Select **Read content** only; disable content
   insert/update, comments and user-email access. This is a Notion workspace
   owner action, not something to infer from the ChatGPT connector.
2. Share only the individual pilot project handover page with this connection.
   **Do not share the project-central/root page if its child pages are out of
   scope:** Notion access to a parent implicitly extends to its children.
3. Put the generated token in the Omnira server's protected secret store as
   `ATLAS_NOTION_READ_TOKEN`. NEVER paste it into ChatGPT or commit it to Git.
4. Configure `ATLAS_NOTION_APPROVED_PAGES_JSON` as server-only JSON array of
   exact UUID pairs, e.g.
   `[{"projectId":"<canonical project uuid>","pageId":"<approved Notion page uuid>"}]`.
   Maximum 16 explicit pairs. These are server settings, not request fields.
5. Default `ATLAS_NOTION_MODE` is **off**. Setting `read` merely prepares the
   library for use by a trusted server caller; at P0 no route or model tools
   invoke it. The first authorized caller must receive allowedProjectIds from
   fresh Supabase authentication, not from the browser payload.
6. Before any runtime connection, independently verify: permitted page returns
   the expected title/hash; a second page is denied without a request; a revoked
   page returns no data; loss of Notion access/expired token returns no data;
   logs never contain page bodies or tokens.

**No token was configured by this PR.** As shipped, there is no Atlas chat
consumer and no external Notion request. Turning a server flag on alone does not
enable Atlas chat recall.

## Next phase (separate review/approval)

- Choose one owner-approved, bounded pilot project page and add a server-only,
  authenticated and project-authorized operator read endpoint or reviewed
  publication pipeline. Expose only attribution and an explicitly bounded text
  excerpt to Atlas's existing knowledge seam, never arbitrary Notion text as
  system instructions.
- Prove exact project isolation, anonymous/foreign-user denial, source drift
  detection, token revocation, and prompt-injection resilience.
- Compare relevance to the existing Obsidian lexical provider. Only after
  evidence of improved recall should approved Notion snapshots be published
  into OpenViking with source revision/hash and manual revocation semantics.
- Do not merge PR #343 wholesale: its older chat/provider/cost code must first
  be reconciled against current main and tested separately.

## Official references

- [Notion internal connections](https://developers.notion.com/guides/get-started/internal-connections)
- [Connection capabilities](https://developers.notion.com/reference/capabilities)
- [Retrieve page](https://developers.notion.com/reference/retrieve-a-page)
- [Retrieve page as Markdown](https://developers.notion.com/reference/retrieve-page-markdown)
- [OpenViking documentation](https://docs.openviking.ai/en/)
