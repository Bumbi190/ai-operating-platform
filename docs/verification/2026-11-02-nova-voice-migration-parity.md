# Nova Preview: reconcile two already applied SQL sources

Work ID NOVA-VOICE-RECOVERY-20261101, existing PR578. Vercel bf3db2b failed its mandatory migration guard on two unknown names. This is a source inventory mismatch, not a request to apply SQL.

Read-only inspection found the same repair in existing Draft PR368 commit8a137379075df2a82bc6ffa9e7a08a38fba2dd6f, originating from owner-applied Harvey PR386. Root read its source-parity report and independent review evidence. Actual Supabase migration metadata was read again for iboepohjwrhtgshrqaol:194unique names, with exact stored digests matching that prior reviewed observation. No business data, keys or SQL bodies were returned.

- SCB source20261102064659:1293bytes, SHA256cf12468800265c9b54f42fdaa5f27f2eadb9357eb6ede833d95b5f3a0a3f26b7. Applied version20261102070352 stores1292bytes, digest4afd7939f23b79e820a7aca974f0abcab6e44f5244677ed388d0a082f3862efc; adding only its final LF gives the exact source digest.
- Editorial source20261102090200:15250LFbytes, SHA256072897c68f1ed2d85b0f84bed1f5214bb56f9290170b58e8d3c284012e5d7ec1. Applied version20261102095321 stores15461bytes, digest3526aa5c4f066a4c790b8bb23663b766a0aa1469a5f52ebac29e458b2b71ef4d. This is byte-identical to the independently reviewed CRLF-plus-two-timeout representation in PR368.

Imported only those two exact Git blobs; -text pins their bytes. Counts169/155 become171/157. Frozen14/30 histories, guard hashes/algorithms, actual database, flags and credentials remain unchanged. Reused the reviewed migration-guard-v2 fixture updates; kept the Nov1 ledger evidence historical and byte-identical. Added six actual source/ledger parity cases to required CI with an anti-skip check. No other Studio/Harvey application code or active worktree was changed.

RED:5failed/1passed before source reconciliation (missing files, unknown/missing-enforced ledger entries). GREEN figures recorded in the final review report. This file grants no production release or SQL execution authority.
