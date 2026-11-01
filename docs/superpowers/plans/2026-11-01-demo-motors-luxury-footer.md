# Demo Motors Luxury Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Replace the current boxed footer CTA with the approved luxury automotive footer.

**Architecture:** Keep the existing `createPremiumDealerDraft` structure and `premiumDealerStyle` stylesheet. Change only footer markup and footer-specific CSS; preserve all other template output.

**Tech Stack:** TypeScript, Vitest, static HTML/CSS template.

**Spec:** `docs/superpowers/specs/2026-11-01-demo-motors-luxury-footer-design.md`

## Global Constraints
- No paid AI/model/media calls.
- No push/deploy.
- No changes outside the premium footer.
- Existing interactions and demo disclosures remain unchanged.

## Review Focus
- Desktop footer must not contain a separate CTA panel.
- Tablet layout must not overlap or create an orphaned CTA column.
- Mobile must stack cleanly with readable hierarchy.
- Footer links must remain keyboard-focusable.
- Template must remain under the existing artifact limit.

### Task 1: Luxury automotive footer

**Files:**
- Modify: `apps/web/lib/website-build/templates/premium-dealer.ts`
- Modify: `apps/web/lib/website-build/templates/premium-dealer-style.ts`
- Modify: `apps/web/lib/website-build/templates/premium-dealer.test.ts`

**Interfaces:**
- Consumes: `createPremiumDealerDraft(input: PremiumDealerInput): WebsiteDraft`
- Produces: same API and behavior contract; footer markup/style only changes.

- [x] Step 1: Add failing assertions requiring a wide editorial footer statement/action and forbidding the old `footer-cta` panel.
- [x] Step 2: Run `premium-dealer.test.ts`; expect the new test to fail against the current boxed footer.
- [x] Step 3: Replace footer markup with brand, link groups, editorial statement and integrated action.
- [x] Step 4: Replace footer panel CSS with restrained luxury grid and responsive rules.
- [x] Step 5: Run premium template tests and relevant paid-step tests; expect all green.
- [x] Step 6: Render local preview and verify HTTP 200.
- [x] Step 7: Commit locally; do not push.
