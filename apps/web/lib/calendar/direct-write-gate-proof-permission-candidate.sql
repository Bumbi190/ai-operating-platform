-- ISOLATED REVIEW CANDIDATE ONLY. DO NOT APPLY AS A PRODUCTION MIGRATION.
-- Load after direct-write-gate-proof-inspect-hardened-candidate.sql.
-- The function owner must be a trusted migration owner with table access.
-- This removes the direct table write path for service_role, while retaining
-- the existing service-role-only RPC grant. It does not authenticate Facebook.
revoke insert on public.social_publication_reconciliation_proofs from service_role;
alter function public.social_publication_reconciliation_inspect(jsonb,jsonb)
 security definer;
