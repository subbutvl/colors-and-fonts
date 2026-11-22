# Releasing Huetype

Installers are built by GitHub Actions (`.github/workflows/release.yml`): the Windows `.exe` and `.msi` on `windows-latest`, the macOS `.dmg` on `macos-latest` (Apple silicon).

## Make a release

1. On `main`, set the new version everywhere (package.json, package-lock.json, tauri.conf.json, Cargo.toml):

   ```sh
   npm run release:version set 0.2.0
   cd src-tauri && cargo check   # updates Cargo.lock
   ```

2. Commit ("Release 0.2.0"), open a PR, and merge it once CI is green.
3. Tag the merge commit and push the tag:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. The **Release** workflow checks that the tag matches the app version, runs the tests, builds the installers and the `.dmg` and attaches them to a **draft** release named "Huetype v0.2.0".
5. Open the draft under Releases, add release notes, and publish it.

To build installers without releasing, open Actions, pick **Release**, then **Run workflow**. The `.exe` and `.msi` are attached to the run as the `huetype-installers` artifact, the `.dmg` as `huetype-macos`.

## What gets built

| File | Installs for | Admin needed | Notes |
| --- | --- | --- | --- |
| `Huetype_<version>_x64-setup.exe` (NSIS) | the current user, in `%LOCALAPPDATA%` | no | Recommended. Closes a running Huetype first. |
| `Huetype_<version>_x64_en-US.msi` (WiX) | all users, in Program Files | yes | For managed installs. |

| `Huetype_<version>_aarch64.dmg` | macOS 11 or later on Apple silicon; drag to Applications | no | Intel Macs are not built yet. |

Both Windows installers download the WebView2 runtime if it is missing (Windows 11 and up-to-date Windows 10 already have it). Uninstalling removes the launch-at-startup entry. The user's data (`huetype.db` in the app config dir) is kept unless they tick the delete-data box in the NSIS uninstaller.

## Unsigned builds

The installers are not code-signed yet (decided 2026-11-01). On first run, Windows SmartScreen shows "Windows protected your PC". The user chooses **More info**, then **Run anyway**. The release notes template says this. Signing is roadmap step 5.4.

## Unsigned Mac builds

The `.dmg` is ad-hoc signed (`signingIdentity: "-"` in `tauri.macos.conf.json`), not signed with an Apple Developer ID and not notarized. The first launch is blocked: open **System Settings > Privacy & Security**, scroll down and choose **Open Anyway**. Each build has a new identity, so macOS may ask again for permissions such as Screen Recording after an update. An Apple Developer account fixes both; not planned yet.

## Version rules

MSI needs a plain `major.minor.patch` version (no `-beta` suffix), so `scripts/version.mjs` accepts only that. The tag is the version with a `v` in front.
