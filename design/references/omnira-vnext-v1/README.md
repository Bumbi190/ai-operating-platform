# Omnira Design vNext v1 — frozen reference

Frozen 2026-09-07. Copied verbatim from the Claude Design export that lived only
outside version control, so the visual source of truth now has a commit behind
it and cannot drift silently.

**Everything in this directory is reference material. None of it is application
code, and none of it is built, bundled, imported or served.**

## What is here

| File | What it is |
|---|---|
| `HANDOFF.md` | The designer's implementation handoff, frozen |
| `Omnira OS.dc.html` | The full interactive prototype (single Design Component) |
| `Omnira Design System v1.dc.html` | The token / type / surface specification |
| `support.js` | Claude Design's generated `dc-runtime` — a React shim the prototype needs to run |
| `assets/` | `atlas-face.png`, `omnira-mark.svg` |
| `refs/` | Rendered reference screenshots of every prototype surface |

## The import ban

`support.js` and the `.dc.html` files are **generated Claude Design runtime code**.
They must never be imported into `apps/web`, in any form:

- no `import` / `require` of `support.js`
- no copying `dc-runtime` source into the app
- no `.dc.html` parsed, inlined, or served as an application asset

Omnira has its own React runtime. Pulling a second one in — even partially —
would create a parallel rendering path beside the real one, which is exactly the
class of duplication the vNext plan exists to prevent.

This ban is enforced by a test, not by convention:
`apps/web/lib/qa/atlas-vnext-visual-lock.test.ts`.

## How to use it

Read the values, read the screenshots, and express them through the repo's
existing token vocabulary in `apps/web/app/globals.css`. Prefer an existing
`--omnira-*` / `--os-*` token over a value copied out of the prototype CSS; the
prototype was generated, and its constants carry no meaning the repo has to
inherit.

Where design and runtime disagree, **runtime wins functionally**. The prototype
may change presentation only.

## Provenance

The original external export remains untouched at:

```
Design/references/Design system audit Omnira/
```

SHA-256 verified identical at copy time for `HANDOFF.md`, `Omnira OS.dc.html`,
`Omnira Design System v1.dc.html` and `support.js`.
