# Next increment prerequisites — 2026-10-17

The current23h preview host remains connected; it is not a permanent installation. No management grant, new migration, mailbox credential, SMTP/IMAP login, inbox read or email send was activated while preparing the plans.

The Windows host reached smtp.strato.de:465 and imap.strato.de:993 with verified certificates and TLS1.3. SMTP EHLO advertised PLAIN/LOGIN; IMAP CAPABILITY advertised AUTH=PLAIN/AUTH=LOGIN. This public unauthenticated capability probe sent no credential, selected no mailbox and read/sent no message. It proves reachability/TLS, not the actual account login.

A throwaway Node22.22.3 RSA3072/OAEP-SHA256 + AES256-GCM roundtrip passed using synthetic text. The one generated PKCS8 private key was2392base64 bytes, below the2560byte Credential Manager limit, and was not persisted. The real implementation must still test browser interoperability, bounds, context tampering, secret isolation and OS persistence; this is not product code or a passed end-to-end setup.

Two independent implementation plans follow the already approved overall design. They preserve inline execution but require review before implementation: ../plans/2026-10-17-sales-managed-host.md and ../plans/2026-10-17-sales-strato-connection.md (paths relative to docs/superpowers). Plan1 adds a lasting, revocable, narrowly scoped host-management grant and owned after-login startup. Plan2 adds encrypted mailbox setup and login-only proof; durable inbox/checkpoints and sending remain separate.

Read-only prerequisite checks found pg_cron and pg_net already installed in Omnira; no cron was added. Plugin Management search for Strato IMAP SMTP returned no matching plugin. Published Windows startup patterns from the parallel local-text branch were inspected as reference only; no files, keys, running services or workspaces from that track were modified.

No new tests of product implementation are claimed. Plans were checked inline for scope coverage, exact type/function/path consistency, crash/replay boundaries, new authority, metadata/secret separation and the five review-focus input classes per plan. No implementer/reviewer subagent was spawned for planning.
