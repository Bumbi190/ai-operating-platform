-- platform_tokens: lagrar Instagram och Facebook access tokens med utgångsdatum.
--
-- Syfte: ersätter manuell rotation av env-variabler på Vercel.
-- En månatlig cron (/api/media/cron/refresh-tokens) förlänger Instagram-tokenet
-- automatiskt och skriver det nya värdet hit.
--
-- Läsning sker via service-role (adminClient) i cron-routes.
-- Ingen anonym- eller auth-åtkomst tillåts.

CREATE TABLE IF NOT EXISTS platform_tokens (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  platform     TEXT        NOT NULL,   -- 'instagram' | 'facebook'
  token_type   TEXT        NOT NULL DEFAULT 'user',  -- 'user' | 'page'
  access_token TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ,            -- NULL = anses inte gå ut (t.ex. page-token)
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (platform, token_type)
);

COMMENT ON TABLE platform_tokens IS
  'Lagrar långlivade access tokens för sociala medieplattformar (Instagram, Facebook). '
  'Uppdateras automatiskt av /api/media/cron/refresh-tokens en gång i månaden.';

COMMENT ON COLUMN platform_tokens.expires_at IS
  'Tidpunkt när tokenet löper ut. NULL = tokenet har ingen känd utgångstid.';

COMMENT ON COLUMN platform_tokens.refreshed_at IS
  'När tokenet senast förnyades via Meta:s refresh-API.';

-- Aktivera RLS — endast service-role kan nå dessa rader
ALTER TABLE platform_tokens ENABLE ROW LEVEL SECURITY;

-- Ingen publik åtkomst: service-role kringgår RLS automatiskt,
-- alla andra nekade via avsaknad av policy.
