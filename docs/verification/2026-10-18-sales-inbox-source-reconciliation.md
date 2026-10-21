# Source-only reconciliation of already-applied sales inbox

Production ledger read-only: sales_strato_inbox, version20261017191904, one statement,36094characters, SHA2561013142706f4fc1ebd60c31f64cc3f38d6d0d9082c58610487ddc46a4bc606a1. Frozen source gitf28f83f1f49831fff3315f154f96df4af9da0bdd in parallel PR386 has the exact same bytes. No SQL has been applied, rolled back or repaired by this change.

Four public sales_inbox tables observed with RLS on/FORCE off, zero policies and zero anon/authenticated table or column privileges; service SELECT. Registry adds only those four entries,152 to156; prior entries and capture notes retained. Ledger160. Guard canonical136 to137/enforced122 to123; frozen grandfathered14/legacy30 unchanged. Missing, duplicate and unknown names still fail closed. The normal actual Vercel guard must pass before release.

No sales application code, workers, mailboxes, account permissions, environment flags, outreach or send behavior are included. PR386 remains separate. This repairs repository/ledger source drift that independently blocks unrelated deployments, including weekly report PR400.
