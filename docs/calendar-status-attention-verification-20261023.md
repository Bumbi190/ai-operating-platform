# Calendar status and attention first slice

The user's approved calendar direction now has its first local product slice:
blue waiting/in-progress, orange review, green completed work and red failed or
blocked entries. Project colors remain on the event border. A separate neutral
state handles cancelled and unknown data. Dots are present on timed and all-day
entries, with a text legend, hover label and readable event accessible name.

A week-local attention list deduplicates event identities, prioritizes errors,
and opens the original event panel. A later completed duplicate replaces an
earlier alert. The panel shows existing human/workflow/publication responsibility
and directs the person to the source for next steps. No new assignment is
persisted or inferred from unscheduled content.

The current source projection exposes job status but no authenticated Meta
receipt field. Therefore raw `published` becomes orange "Publicering behöver
bekräftas", not green. Human-completed work blocks and completed workflows may
be green. Pending changes remain orange without hiding the already approved
publication time; cancellation takes precedence over a pending change.

## Fresh verification

- Vitest: 29/29 cases across status projection, rendered UI and existing layout.
  New tests initially failed with missing implementation; four extra tests then
  reproduced prototype-key handling and stale duplicate attention, and passed
  after correction. The calendar Vitest include now covers both TS and TSX so
  rendered tests cannot be silently omitted.
- Playwright: all 21 existing/new calendar browser cases passed, including
  390px/1280px status dots, opening an attention item, no horizontal overflow,
  approved/proposed social times, account changes, logout, delayed responses,
  recurrence, UTC preservation and DST refusal. Responses are local fixtures.
- Mobile screenshot visually inspected. Screenshots are synthetic local views,
  including the fixture's account-switch controls; they are not production.
- Full TypeScript check continues to report the three known unrelated Remotion
  errors in `lib/media/lambda-render.ts` (missing `@remotion/lambda/client` and
  two unknown `region` accesses). No calendar errors appeared in that check.
- React review: no new network effects or dependencies, native buttons/details,
  stable entry keys, CSS module styling, keyboard opening and existing panel
  focus restoration; status conveyed by text as well as color.

## Remaining scope

These are in-calendar attention items for the loaded, filtered week. They are
not a persisted notification inbox, background detector, unread history, push,
email, or notifications while the calendar is closed. Responsibility labels
describe existing sources; a real user-controlled André/Atlas assignment and
delegation contract still needs persistence and authorization. No new job is
created or run by this UI. Trusted provider receipt projection is still needed
before any social event can be shown as verified published/green.

The failed hosted staging baseline and all existing production activation gates
remain open. No migration, production grant, external notification, push, CI,
deployment or live provider call was made by this change.
