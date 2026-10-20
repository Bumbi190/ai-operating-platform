# Docker Desktop per-user → all-users migration (Hultgren)

**Status:** Draft for André's approval, 2026-10-19 ~19:55 Europe/Stockholm. Only read-only inventory and a non-disruptive logical image export (Gate 0) have been done. No stop, uninstall, install, ACL, policy or profile change has been made.

**Why:** The host qualification correctly refuses `acl_writable`: `C:\Users\Andre\AppData` (and inherited `AppData\Local`) grant Full control, including rename/delete-child, to capability SID `S-1-15-3-3557520199-…-3692855932`. That allows swapping a path component above `AppData\Local\Programs\DockerDesktop`. The ACE persisted with `CodexSandboxService.OpenAI.Codex` stopped (4/4 observations 19:39–19:42). An all-users install under `C:\Program Files\Docker\Docker` removes the user-profile chain from the trust path without changing AppData ACLs or the policy.

**Constraints:** no AppData ACL change, no trusted capability SID, no `HostPolicy` change, no `docker system prune`/reset/`volume rm`, no image pull/build, no Docker version change. Worktrees, the c435e423 source-proof, old evidence and native tombstones are preserved; old evidence keeps describing the old environment. Real attempts A–D stay blocked until Gate 4 passes.

## 1. Inventory (observed 2026-10-19 19:46–19:52)

| Item | Observed |
|---|---|
| Docker Desktop | 4.95.0.242831, per-user, `C:\Users\Andre\AppData\Local\Programs\DockerDesktop` (HKCU uninstall entry only; `C:\Program Files\Docker` absent) |
| Engine / API | 29.8.2 / 1.56, Linux, overlayfs, kernel 6.18.33.2-microsoft-standard-WSL2 |
| Backend | WSL 2 (`wslEngineEnabled:true`); distros `docker-desktop` (running) and `Ubuntu` (stopped, 1.5 GB, not Docker-owned) |
| Data disk | `C:\Users\Andre\AppData\Local\Docker\wsl\disk\docker_data.vhdx` 64.77 GB; `…\wsl\main\ext4.vhdx` 0.09 GB |
| Free space | C: 265 GB free of 951.6 GB; no other fixed drive |
| Containers | 40 (29–30 running; restart policy `unless-stopped` 27, `no` 3) |
| Volumes / images | 48 volumes (11.13 GB) / 46 images (41.15 GB); build cache 4.9 GB |
| Proof-critical images | `sha256:354e46f6…acd0` (enrolled Node toolchain), `sha256:ca0bd484…641d` (`postgres:16`) |
| PATH | user PATH `C:\Users\Andre\AppData\Local\Programs\DockerDesktop\resources\bin`; context `desktop-linux`; `credsStore: desktop` |

Affected projects (downtime during Gates 1 and 2): Handlarborsen Supabase stack (12 containers), `handlarborsen-atlas-test-data-local` (5), `omnira-stt-local` (12), Omnira sales Postgres containers (3 running, 6 exited), `omnira-openviking-pilot-20261015` (2 exited). The main checkout (`Code/ai-operating-platform`) and any other branch that pins the old Docker paths will fail host qualification after migration until it receives the same reviewed profile update; that checkout is not touched here.

Repo references to the old install (this branch): `HostProfile.cs` docker/backend targets and pins; `sdf-execution-lease-postgres.ts` (Docker path, binary hash, backend/daemon identity pins); `sdf-native-stop-process.test.ts` (Docker path); historical scripts `provision-windows-toolchain.mjs`, `recover-windows-fixture.mjs`, `resume-windows-toolchain-build.mjs` (buildx path) — these remain unchanged as historical records. `docs/verification/*` stays unchanged.

## 2. Backup and restore path

Gate 0 (done, non-disruptive): `C:\DockerMigrationBackup\2026-10-19\`
- `images/354e46f6c5d5.tar` 370 982 912 B sha256 `373f8ea6…2d31`; `images/ca0bd484cb98.tar` 166 104 064 B sha256 `bc02e58e…cf47` (`docker image save` from the running daemon; not yet restore-tested).
- `inventory/` containers/volumes/images JSONL and `system df -v`; `config/` Docker Desktop `settings-store.json`, `install-settings.json`, user `.docker/config.json`, `daemon.json`.

Gate 1 (needs approval; stops all containers for ~10–20 min):
1. Record `docker ps -a` states and engine `ID` (daemon identity) to the backup folder.
2. Stop Docker Desktop fully (`docker desktop stop`; fallback: quit from tray). Verify: no `Docker Desktop`/`com.docker.*` processes, `wsl -l -v` shows `docker-desktop` Stopped. Only if it does not stop: `wsl --terminate docker-desktop` (never `--unregister`).
3. `robocopy /J` both VHDX files to `C:\DockerMigrationBackup\2026-10-19\vm\`; SHA-256 of source and copy must match (expected ~65 GB, leaving ~199 GB free).
4. Restart the existing per-user Docker Desktop. Verify same engine/API version, same daemon identity, 46 images incl. both proof images, 48 volumes, 40 containers with `unless-stopped` ones running again.

Gate 1 result (approved by André 19:57, executed 19:58–20:12):
- Pre-stop state recorded in `inventory/pre-stop-state.jsonl`: 25 running `unless-stopped`, 2 restarting `unless-stopped` (`supabase_vector_*`), 3 running with policy `no` (`omnira-sales-sending-20261018`, `omnira-atlas-local-text-test-20261017`, `omnira-website-build-test-20261014`), 10 already exited; engine ID `d52dbb12-c312-46d1-a084-22b61f250c01`, 29.8.2. Stale `supabase migration new` host processes from other sessions were observed and not touched (they do not use the engine).
- `docker desktop stop` succeeded normally in 29 s; no forced termination was needed. The WSL VM exited on its own ~40 s later; both VHDX files were then verified unlocked.
- Copies (robocopy /J, no errors) and SHA-256 recorded in `vm/sha256-verification.json`:
  - `docker_data.vhdx` 69 530 025 984 B, sha256 `21558953f5d2b5f11a9f530a5955213cc5855697bc39b996cc9586e2c811fa80`, original = copy.
  - `main/ext4.vhdx` 100 663 296 B, sha256 `7af9202a851188ad2a3a543cf744b9ee027d428921b2fc5ce4870cc762bfa079`, original = copy.
  - Hashed while Docker was still stopped. C: free afterwards 201.7 GB.
- Restart of the existing per-user install (`docker desktop start`): same engine ID, version and kernel; 40 containers, 46 images incl. both proof images, identical 48-volume set. Only the three policy-`no` containers that had been running were started again by ID; already exited containers were not started. Post-restart state (`inventory/post-restart-state.jsonl`) has 0 state differences and the same health distribution (healthy 22, unhealthy 3, starting 3).
- This proves a verified byte-identical copy. A restore from the copy has NOT been tested; the original disk was reused on restart.

**Freshness rule:** Docker has been used again since this copy, so the copy is not current. At the final stop immediately before the per-user uninstall, root repeats the same procedure (state record, normal stop, unlock check, new copy to a new dated folder, SHA-256 original = copy while still stopped). Only that final copy is the restore source for Gate 2; the Gate 1 copy is kept as an older fallback.

Restore path (per Docker's backup guide: stop Docker Desktop, put the file back at the same location): put `docker_data.vhdx` back at `%LOCALAPPDATA%\Docker\wsl\disk\` before the first start of the reinstalled app; if images are still missing, `docker image load -i` the two tars. Full rollback: uninstall all-users, reinstall the same 4.95.0 build per-user (`install --user`), restore the VHDX; the unchanged old `HostProfile` then applies again.

## 3. Installation method (official, same version)

Per Docker's Windows install docs: per-user and all-users modes cannot be switched in place — uninstall and reinstall; `install` without `--user` is all-users into `C:\Program Files\Docker\Docker`, needs admin, uses HKLM.

Gate 2 (needs approval, after Gate 1 verified):
1. Download exactly 4.95.0 build 242831: `https://desktop.docker.com/win/main/amd64/242831/Docker%20Desktop%20Installer.exe` and `…/242831/checksums.txt`. Require SHA-256 = checksums entry, Authenticode Valid, signer Docker Inc. (The Downloads copy is 4.92.0 and is NOT used.)
2. Take the fresh final backup per the freshness rule above (normal stop, new SHA-256-verified copy); then, with Docker still stopped, run the existing per-user uninstaller (`"…\Programs\DockerDesktop\Docker Desktop Installer.exe" uninstall`). Then check whether `docker_data.vhdx` still exists; do not delete anything by hand.
3. Elevated: `"Docker Desktop Installer.exe" install --quiet --accept-license --backend=wsl-2 --no-windows-containers --installation-dir="C:\Program Files\Docker\Docker"`. No `--always-run-service`, no proxy/admin-settings flags, default WSL data root (same `%LOCALAPPDATA%\Docker\wsl`).
4. If the VHDX is missing, restore it from the final Gate 2 copy (verify its SHA-256 again after restoring) before first start; then start Docker Desktop once and verify as in Gate 1 step 4.

Gate 2 result (approved by André 20:16, executed 20:16–20:45):
- Installer downloaded from the official build URL: 636 811 696 B, 4.95.0.242831, sha256 `73431db38491f770543880366228a23c993f84d1e8e045f56d83b8a98940cf76` = `checksums.txt`, Authenticode Valid, CN=Docker Inc (thumbprint B6BD29272B07AD4D0F1322A739499D67CA3BAC3F). The session shell is not elevated; one UAC-approved PowerShell (PID 44496) ran the fixed script `installer/elevated-install.ps1`, which waited for a go signal, re-verified hash and signer, ran exactly the approved command and exited (exit code 0, ~30 s).
- Final pre-stop state identical to Gate 1 (25/2/3/10, engine `d52dbb12…`, 46 image IDs, 48 volumes) in `C:\DockerMigrationBackup\2026-10-19-final\inventory\`. Normal stop 19 s; unlocked ~40 s later.
- Final copy `2026-10-19-final/vm/`: `docker_data.vhdx` 69 563 580 416 B sha256 `dc325160309277b234b18383e92dc4f2866fdcc24586ea9e1d51eb88407c8840`; `ext4.vhdx` sha256 `853e158730ddfaedff85496acbe2ad8ee7e0b95bf03dbf65f703997f1d96499e`; both original = copy. Gate 1 copy kept.
- Per-user uninstall (`uninstall --quiet`, exit 0, 18 s) removed the HKCU entry, the `docker-desktop` WSL distro and BOTH VHDX files; residue left untouched: `Programs\DockerDesktop\tmp-delete` (4 files), logs in `Local\Docker`, `Roaming\Docker` settings. Ubuntu briefly showed Running and was Stopped again afterwards.
- All-users install: `C:\Program Files\Docker\Docker` 4.95.0.242831, HKLM entry, `com.docker.service` Stopped/Manual/LocalSystem, machine PATH entry; the old user PATH entry is gone; the installer itself added Andre to `docker-users` (no manual change). It created no data disk (`wsl\disk` empty) and did not start Docker.
- Restore before first start: `docker_data.vhdx` copied from the final copy; sha256 of the restored file = final copy (`dc325160…`), 69 563 580 416 B, owner Andre. `main\ext4.vhdx` was not restored; Docker Desktop recreated it on start.
- First start (`docker desktop start`, 13 s, no sign-out needed): same engine ID `d52dbb12-c312-46d1-a084-22b61f250c01`, 29.8.2, same kernel. After restoring the three policy-`no` containers by ID: identical container ID set, identical container→image ID mapping, 0 state differences, same health distribution (22/3/3), identical 46 image IDs and 48 volume names, both proof images present. This is a tested restore of the final copy (the data came back only from the copy).

What the installation changes: removes the per-user app and HKCU uninstall entry; adds files under `C:\Program Files\Docker\Docker`, an HKLM uninstall entry, the `com.docker.service` service (installer default), the `docker-users` local group with Andre as member (may require sign-out/in before the engine pipe is accessible), a machine PATH entry `C:\Program Files\Docker\Docker\resources\bin` (the old user PATH entry may remain and is then left as a dangling entry, not edited by me), and re-registers the `docker-desktop` WSL distro. Windows containers stay disabled. Ubuntu, AppData ACLs, Codex and the repo are not changed by the installer.

## 4. Host profile update (code, separate reviewed commit; Gate 3)

- `HostProfile.cs`: targets `docker` → `C:/Program Files/Docker/Docker/resources/bin/docker.exe`, `backend` → `C:/Program Files/Docker/Docker/resources/com.docker.backend.exe`; pins = SHA-256 of those installed files. `HostPolicy.cs`, the trusted-SID list, reasons and all other targets unchanged.
- New identities are not trusted automatically: root first records candidates (both file hashes with Authenticode signer, installer checksum, observed backend process identity and daemon identity hash, qualification output) in a candidate file and shows them to André. The code commit happens only after André approves those exact values.
- Tests RED→GREEN: a qualification test fails with the old pins against the new paths, passes with the approved pins; an old-path target is refused. Update `sdf-execution-lease-postgres.ts` (Docker path/hash, backend/daemon pins) and `sdf-native-stop-process.test.ts` (Docker path) to the approved values. Rebuild `OmniraBrokerHost` offline.
- Class N proof bindings gain the Docker path/hash so evidence records which environment it ran on. Old docs/evidence are not edited.

## 5. Verification after migration (Gate 4)

- Data: 46 images incl. `354e46f6…` and `ca0bd484…` by exact ID, 48 volumes by name, 40 containers, `unless-stopped` stacks running; daemon identity compared with Gate 1 (a change is reported, not silently accepted).
- ACL chain `C:\Program Files\Docker\Docker\…` has no writable untrusted principal (qualification `ok` for docker and backend).
- Stability with Codex running: service `CodexSandboxService.OpenAI.Codex` Running and Codex app started; ≥4 qualifications ≥60 s apart all `qualified_for_health_probe` with identical approved identities, plus one more immediately before PG-GREEN and each of A–D. Any `acl_writable` or identity drift stops the sequence and is reported.
- Then resume the cooperative-native-stop plan: PG-GREEN, A–D once each, final gate, independent review, handoff.

## Approvals requested

1. Gate 1 backup window (stops all containers temporarily).
2. Gate 2 uninstall/reinstall as above (download of the exact official 4.95.0 installer, elevation required — André may need to confirm UAC).
3. Gate 3 candidate pins — approved separately after they are observed.
