#!/usr/bin/env bash
# Isolated end-to-end test of the website-article jobs: the REAL repo.ts /
# store.ts / runArticleJob against PostgreSQL 17 + PostgREST in throwaway
# containers. Writer, reviewer, reviser and Hermes are fakes (no spend).
#
# Isolation:
#  - images must already be local (--pull never); nothing is downloaded;
#  - the database has NO published port and sits on an --internal network;
#  - only PostgREST is published, on 127.0.0.1 at a random port;
#  - random password and JWT secret per run; both containers removed on exit;
#  - the real website_content migrations from apps/web/supabase/migrations are
#    applied to the throwaway database, then the PROPOSED job migration.
# No shared, local-dev, Preview or production database is touched.
#
# Usage: bash ...integration.sh [migration.sql]
set -euo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
WEB="$REPO/apps/web"
MIGRATION="${1:-$HERE/20261028150000_website_article_jobs.sql}"
PG_IMAGE="${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.004}"
REST_IMAGE="${REST_IMAGE:-public.ecr.aws/supabase/postgrest:v14.5}"
TAG="omnira-articlejobs-it-$$"
PW="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
JWT_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"

for img in "$PG_IMAGE" "$REST_IMAGE"; do
  docker image inspect "$img" >/dev/null 2>&1 || { echo "image $img not present locally (refusing to pull)"; exit 2; }
done
cleanup() {
  docker rm -f "$TAG-rest" "$TAG-db" >/dev/null 2>&1 || true
  docker network rm "$TAG-net" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create --internal "$TAG-net" >/dev/null
docker run -d --rm --pull never --network "$TAG-net" --network-alias db --name "$TAG-db" \
  -e POSTGRES_PASSWORD="$PW" "$PG_IMAGE" >/dev/null
psql_in() { docker exec -i -e PGPASSWORD="$PW" "$TAG-db" psql -h localhost -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
for _ in $(seq 1 120); do
  psql_in -tAc "select 1 from pg_roles where rolname = 'authenticator'" 2>/dev/null | grep -q 1 && break
  sleep 1
done

# Existing tables the workflow reads, as minimal stand-ins, and the real website_content schema.
psql_in >/dev/null <<'SQL'
create table public.projects (id uuid primary key default gen_random_uuid(), owner_id uuid, slug text);
insert into public.projects (slug) values ('ai-media-automation');
create table public.media_news_items (
  id uuid primary key, project_id uuid not null, title text, summary text, key_insight text, url text,
  source_name text, content_angle text, created_at timestamptz not null default now());
create table public.media_scripts (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, news_item_id uuid,
  status text, created_at timestamptz not null default now());
SQL
for f in 20260608110948_create_website_content_system_a.sql 20260618_website_content_hero_image.sql \
         20260619_website_content_hero_image_brief.sql 20260620_website_content_hero_editor_brief_rename.sql \
         20260621_website_content_hero_image_observability.sql; do
  psql_in < "$WEB/supabase/migrations/$f" >/dev/null
done
psql_in < "$MIGRATION" >/dev/null 2>&1 || { echo "migration failed:"; psql_in < "$MIGRATION"; exit 1; }
psql_in -c "alter role authenticator with login password '$PW'" >/dev/null   # throwaway DB only
psql_in >/dev/null <<'SQL'
grant all on public.projects, public.media_news_items, public.media_scripts, public.website_content to service_role;
grant select, insert, update, delete on public.website_article_jobs to service_role;
SQL

# PostgREST joins the internal network to reach the database; its port is published on loopback only.
docker create --pull never --name "$TAG-rest" -p 127.0.0.1::3000 \
  -e PGRST_DB_URI="postgres://authenticator:$PW@db:5432/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" "$REST_IMAGE" >/dev/null
docker start "$TAG-rest" >/dev/null   # start on the default bridge first: an internal network attached before start drops the published port
docker network connect --alias rest "$TAG-net" "$TAG-rest"
PORT="$(docker port "$TAG-rest" 3000/tcp | head -1 | sed 's/.*://')"
READY=0
for _ in $(seq 1 60); do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && { READY=1; break; }; sleep 1; done
if [ "$READY" != 1 ]; then echo "PostgREST did not become ready:"; docker logs --tail 30 "$TAG-rest" 2>&1; exit 1; fi
echo "isolated stack: $(psql_in -tAc 'select version()' | cut -c1-40) + $(basename "$REST_IMAGE") on 127.0.0.1:$PORT"

cd "$WEB"
ARTICLE_JOBS_IT_REST="http://127.0.0.1:$PORT" ARTICLE_JOBS_IT_JWT_SECRET="$JWT_SECRET" \
  npx vitest run lib/qa/article-jobs-isolated-db.test.ts
