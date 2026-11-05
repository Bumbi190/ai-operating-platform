// Recovered historical media DDL, restricted to the offline replay executor.
import {sha256} from './migration-replay-preflight.mjs';
const SPECS=[
  {
    "pin": {
      "kind": "synthetic",
      "path": "synthetic/20260605071529_media_insights_multiplatform",
      "sourcePath": "docs/verification/web-studio/recovered-history/20260605071529_media_insights_multiplatform.sql",
      "sourceLfSha256": "bd29b60044d8214d87ca435412c82d8784c52488800248ff0d1865786ca4b4d0",
      "extractedLfSha256": "bd29b60044d8214d87ca435412c82d8784c52488800248ff0d1865786ca4b4d0",
      "lfSha256": "a125644d225d8c4dde956906aab9a6fdbd4ca6828d5bd6ea465f7f3411b1ded9",
      "limitation": "Recovered historical DDL on an empty disposable local table only; no canonical migration or hosted readiness claim."
    },
    "guard": "LOCK TABLE ONLY public.media_insights IN ACCESS EXCLUSIVE MODE;\nDO $guard$\nBEGIN\n IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) OR EXISTS (SELECT 1 FROM ONLY public.media_insights) OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.media_insights'::regclass AND NOT attisdropped AND attname IN ('youtube_video_id','facebook_post_id')) OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.media_insights'::regclass AND attname='platform' AND atttypid='text'::regtype AND attnotnull AND NOT attisdropped) THEN\n RAISE EXCEPTION 'media fixture requires privileged empty table with BI platform and absent target columns';\n END IF;\nEND\n$guard$;\n",
    "columns": [
      "youtube_video_id",
      "facebook_post_id"
    ],
    "name": "20260605071529_media_insights_multiplatform.sql"
  },
  {
    "pin": {
      "kind": "synthetic",
      "path": "synthetic/20260605213648_media_insights_retention",
      "sourcePath": "docs/verification/web-studio/recovered-history/20260605213648_media_insights_retention.sql",
      "sourceLfSha256": "390846a61efd21ab9156320d7cd298c1c2c8b2031f98a0580adc49cd76873ef9",
      "extractedLfSha256": "390846a61efd21ab9156320d7cd298c1c2c8b2031f98a0580adc49cd76873ef9",
      "lfSha256": "7193e9ab10432eb36f206428aed0dec4c7777184e524315ea5cbbdd11aa36a23",
      "limitation": "Recovered historical DDL on an empty disposable local table only; no canonical migration or hosted readiness claim."
    },
    "guard": "LOCK TABLE ONLY public.media_insights IN ACCESS EXCLUSIVE MODE;\nDO $guard$\nBEGIN\n IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) OR EXISTS (SELECT 1 FROM ONLY public.media_insights) OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.media_insights'::regclass AND NOT attisdropped AND attname IN ('avg_view_pct')) OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.media_insights'::regclass AND attname='platform' AND atttypid='text'::regtype AND attnotnull AND NOT attisdropped) THEN\n RAISE EXCEPTION 'media fixture requires privileged empty table with BI platform and absent target columns';\n END IF;\nEND\n$guard$;\n",
    "columns": [
      "avg_view_pct"
    ],
    "name": "20260605213648_media_insights_retention.sql"
  }
];
export const MEDIA_FIXTURES=Object.freeze(SPECS.map(s=>Object.freeze(s.pin)));
export function extractMediaFixture(step,source){
 const s=SPECS.find(s=>s.pin.path===step.path);
 if(!s)throw Error('Unknown media fixture');
 const extracted=source.replace(/\r\n/g,'\n');
 if(sha256(extracted)!==s.pin.sourceLfSha256||sha256(extracted)!==s.pin.extractedLfSha256)throw Error('Recovered media source SHA mismatch');
 const body=s.guard+extracted;
 if(sha256(body)!==s.pin.lfSha256)throw Error('Recovered media executable SHA mismatch');
 return {extracted,body};
}
