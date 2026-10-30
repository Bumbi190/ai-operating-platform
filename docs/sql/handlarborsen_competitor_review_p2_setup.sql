-- Isolated integration fixture only. No real user credentials or production IDs.
CREATE TABLE public.projects (
  id uuid PRIMARY KEY, slug text NOT NULL, owner_id uuid NOT NULL
);
CREATE TABLE public.omnira_organization_memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('owner','collaborator')),
  revoked_at timestamptz
);
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at) VALUES
 ('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fixture.owner@example.invalid',now(),now()),
 ('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fixture.collaborator@example.invalid',now(),now());
INSERT INTO public.projects(id,slug,owner_id)
 VALUES('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','handlarborsen','11111111-1111-4111-8111-111111111111');
INSERT INTO public.omnira_organization_memberships(user_id,role,revoked_at) VALUES
 ('11111111-1111-4111-8111-111111111111','owner',null),
 ('22222222-2222-4222-8222-222222222222','collaborator',null);
