# Releasing Huetype

Windows installers are built by GitHub Actions (`.github/workflows/release.yml`) on `windows-latest`.

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

4. The **Release** workflow checks that the tag matches the app version, runs the tests, builds both installers and attaches them to a **draft** release named "Huetype v0.2.0".
5. Open the draft under Releases, add release notes, and publish it.

To build installers without releasing, open Actions, pick **Release**, then **Run workflow**. The `.exe` and `.msi` are attached to the run as the `huetype-installers` artifact.

## What gets built

| File | Installs for | Admin needed | Notes |
| --- | --- | --- | --- |
| `Huetype_<version>_x64-setup.exe` (NSIS) | the current user, in `%LOCALAPPDATA%` | no | Recommended. Closes a running Huetype first. |
| `Huetype_<version>_x64_en-US.msi` (WiX) | all users, in Program Files | yes | For managed installs. |

Both installers download the WebView2 runtime if it is missing (Windows 11 and up-to-date Windows 10 already have it). Uninstalling removes the launch-at-startup entry. The user's data (`huetype.db` in the app config dir) is kept unless they tick the delete-data box in the NSIS uninstaller.

## Unsigned builds

The installers are not code-signed yet (decided 2026-11-01). On first run, Windows SmartScreen shows "Windows protected your PC". The user chooses **More info**, then **Run anyway**. The release notes template says this. Signing is roadmap step 5.4.

## Version rules

MSI needs a plain `major.minor.patch` version (no `-beta` suffix), so `scripts/version.mjs` accepts only that. The tag is the version with a `v` in front.
