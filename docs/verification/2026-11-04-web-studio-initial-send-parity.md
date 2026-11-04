# Studio preview: already-applied initial-send source parity

The preview for core-flow commit 629c87a5f5374c41efb6034781b37fc1fe2466b4 (deployment dpl_Ew18RZK4ru4amGLCpqJ1XMTNtMSN) failed before Next build because the ledger name sales_initial_sending was unknown in this branch. Main did not yet contain its source. Existing Harvey PR386 contains original commit c85617642cd5abfd2e208d137b536f1c6efbe400.

Read-only inspection of project AI Operating Platform (iboepohjwrhtgshrqaol) found exactly one applied row, version20261103082558, with one38811-byte statement. The first68bytes are precisely two timeout settings; removing only those bytes leaves38743bytes and SHA2569fc16dd5406ed097cd6bbcb2740c9a6eb235202a3aa5cb9433d45a436f32658c, identical to the original Git blob. Source filename20261103074241_sales_initial_sending.sql is preserved, with -text to retain bytes. Stored SHA2563751874fd82242ef63755253e157dd2afe9bcc2af30bcff4154853cb0831ce4d is also reproduced from the exact prefix and source in regression tests.

The metadata-only observation is2026-11-04-web-studio-initial-send-observation.json, timestamp2026-11-04T06:26:08.425418Z:195unique names, exactly the historical194-name capture plus sales_initial_sending. Historical captures remain unchanged.

Canonical/enforced inventory moves171/157 to172/158. Frozen14grandfathered/30legacy names, policy version and guard algorithms remain unchanged. Missing, duplicate and unknown names still fail. No database write, production setting, send policy, worker activation, outreach or Harvey application code is introduced.

Local required guard command passes79/79 across7files (0skipped). First run exposed stale hypothetical count/list assertions; those were corrected while preserving historical160/170/190/191/192/194-name evidence and its rejection by the current inventory. CodeQL policy and analysis passed on629c87a. Final preview readiness requires inspection of the deployment for the subsequent source-parity commit.

Author second-pass review verified the exact upstream blob/hash, timeout representation, original filename, unchanged historical JSON, unchanged frozen policy lists and negative cases. No independent reviewer was used.
