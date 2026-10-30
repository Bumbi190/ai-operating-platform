# Calendar status and attention design

The user approved one calendar for personal work now and Atlas workflows later,
with blue waiting, orange review, green completed/published and red failed
indicators, explanatory text and a calendar notice linking to the affected job.
Scheduling an event must not create execution permission. Ambiguous publication
must not become green or retry automatically.

Build on the existing calendar rather than a separate Gantt view. The immediate
slice is a source-aware status dot on timed/all-day posts and an in-calendar
attention list. Preserve the existing project-colored border independently.
Cancelled/unknown states are neutral. Human-marked done work and completed
workflows can be green; the current social model has no authenticated provider
receipt field, so raw published state requires orange confirmation. Content
proposals without jobs never imply automatic execution. Existing manual work
is labelled as the user's work; workflow and scheduled publication sources
are labelled by their existing flow, with no new delegation control.

Alternatives considered: a separate Gantt contradicts the chosen single-calendar
approach; a color-only status hides meaning; a stored global notification system
would require new authorization/storage/delivery contracts. Use text plus dots
and a week-local attention list first. This last sequencing choice is an
implementation decision, not a claim that the user asked to omit real alerts.

Remaining slices: persisted explicit responsibility/delegation, trusted receipt
projection, and durable notifications outside the visible calendar. The current
slice does not implement browser/push/email delivery or execute new jobs. The
staging baseline and existing approval/release gates remain in force.
