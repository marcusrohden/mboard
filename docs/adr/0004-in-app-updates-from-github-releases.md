# 4. App updates come from public GitHub releases, installed by mboard itself

- Status: accepted (decided by the user, 2026-11-17)

## Context

mboard is ad-hoc signed and not notarised, and signing for distribution is out of v1 (ADR 0003). New versions should still reach the Mac without a manual download each time.

- **Squirrel doesn't fit:** Electron's `autoUpdater` on macOS is Squirrel.Mac, which only installs an update signed with the same Developer ID as the running app. It can't update an ad-hoc-signed app.
- **Releases:** release-please cut them from conventional squash-merge titles on `main`. Since ADR 0008, every feature or fix merged into `main` is released by itself, without a release PR. Each GitHub release is tagged `vX.Y.Z` and carries `mboard-darwin-arm64-X.Y.Z.zip`.
- **Network:** the v1 spec ruled out any network access. This decision reopens it for app updates only.
- **The build's signature:** as packaged, the top-level signature didn't verify. On the 0.1.0 build, `codesign --verify --deep --strict mboard.app` reported `invalid Info.plist (plist or signature have been modified)`, and `codesign -dv` showed `Identifier=com.github.Electron` and `Info.plist=not bound`, because packaging changes the Info.plist after Electron's own ad-hoc signature was made. A `postPackage` hook in `forge.config.mts` now re-signs the bundle ad hoc (`codesign --force --deep --sign -`) and fails the build unless `codesign --verify --deep --strict` passes; the identifier becomes `com.electron.mboard`.

## Decision

- **Where new versions come from:** the latest release of the public repository `marcusrohden/mboard`, read anonymously from GitHub's REST API. A release counts only once its zip for this Mac has finished uploading.
- **Only main touches the network,** through Electron's `net.fetch`. The renderer's Content Security Policy still blocks every request. The browser only ever opens pages under `https://github.com/marcusrohden/mboard/releases/`.
- **When it checks:** in a packaged build, 10 seconds after launch and every 6 hours. Any build can check on request from Settings.
- **Installing** uses mboard's own installer, not Squirrel:
  1. Download the zip into a fresh staging folder under the system temp folder, and check its size and the SHA-256 digest GitHub reports for the file.
  2. Unpack it with `ditto` and delete the zip.
  3. Check that the bundle id matches the running app's and that the version matches the release.
  4. A detached shell helper waits for mboard to quit. It moves the running bundle aside, moves the new one into its place, and puts the old one back if that fails. Then it removes the backup and the staging folder and opens mboard.
- **Cleanup:** the staging folder is removed when the process ends, on success and on every failure. Leftover staging folders and backups are swept at the next launch.
- **When mboard can't replace itself** (run from source, translocated by macOS, or in a folder it can't write to), it offers the release page instead.
- **No code signature check.** An ad-hoc signature proves nothing about who built the app, so it adds nothing the digest doesn't already prove. (It was first left out because the signature didn't verify at all; the re-signing hook has since fixed that, so the check could be added back cheaply.)

## Consequences

- **Trust:** anyone who can publish a release in the repository can put code on the Mac. The digest proves the zip is the one GitHub holds, not who built it.
- **First install is manual:** download the zip, move `mboard.app` to `/Applications`, then run `xattr -dr com.apple.quarantine /Applications/mboard.app` once. A browser download is quarantined, and an ad-hoc signed app that isn't notarised is refused as from an unidentified developer until the flag is removed or it's allowed under System Settings › Privacy & Security. Later versions install from inside the app.
- **Silent rollback:** when the swap fails, the helper puts the old version back and reopens it, but mboard doesn't say that the install failed.
- **Untested permission:** whether macOS lets the helper replace a bundle in `/Applications` without asking can only be checked with a real install. That is manual check M4.
- **Rate limit:** unauthenticated API calls are limited to 60 an hour per IP address, far more than mboard uses.
- **Visibility:** the repository must stay public. A private one answers the anonymous check with a 404, which mboard shows as a failed check, never as up to date. Up to 0.2.1, mboard read that 404 as "nothing released" and said it was up to date. That hid the problem while the repository was still private.
- **Upgrade path:** with a Developer ID signature and notarisation, either switch to Squirrel, or keep this installer and add `codesign --verify --deep --strict` plus a check that the new bundle's Team ID matches the running one.
