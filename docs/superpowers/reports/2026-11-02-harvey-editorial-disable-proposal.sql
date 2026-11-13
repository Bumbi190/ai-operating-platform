-- Operational forward rollback proposal. Never auto-applied; preserve all records and labels.
begin;
create or replace function public.sales_prepare_editorial_job(p_principal jsonb,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin raise exception 'EDITORIAL_MODE_DISABLED' using errcode='55000';end$$;
create or replace function public.sales_editorial_contact_review(pid uuid,cid uuid,at timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin raise exception 'EDITORIAL_MODE_DISABLED' using errcode='55000';end$$;
commit;
