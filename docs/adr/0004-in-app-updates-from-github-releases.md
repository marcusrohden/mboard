# 4. App updates come from public GitHub releases, installed by mboard itself

- Status: accepted (decided by the user, 2026-11-17)

## Context

mboard is ad-hoc signed and not notarised, and signing for distribution is out of v1 (ADR 0003). New versions should still reach the Mac without a manual download each time.

- **Squirrel doesn't fit:** Electron's `autoUpdater` on macOS is Squirrel.Mac, which only installs an update signed with the same Developer ID as the running app. It can't update an ad-hoc-signed app.
- **Releases:** release-please cuts them from conventional squash-merge titles on `main`. Each GitHub release is tagged `vX.Y.Z` and carries `mboard-darwin-arm64-X.Y.Z.zip`.
- **Network:** the v1 spec ruled out any network access. This decision reopens it for app updates only.
- **The build's signature:** the top-level signature of the packaged app doesn't verify. On the 0.1.0 build, `codesign --verify --deep --strict mboard.app` reports `invalid Info.plist (plist or signature have been modified)`, and `codesign -dv` shows `Identifier=com.github.Electron` and `Info.plist=not bound`. Packaging changes the Info.plist after Electron's own ad-hoc signature was made.

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
- **No code signature check.** The build's top-level signature doesn't verify, and an ad-hoc signature proves nothing the digest doesn't already prove.

## Consequences

- **Trust:** anyone who can publish a release in the repository can put code on the Mac. The digest proves the zip is the one GitHub holds, not who built it.
- **First install is manual:** download the zip, move `mboard.app` to `/Applications`, then run `xattr -dr com.apple.quarantine /Applications/mboard.app` once. A browser download is quarantined, and with a signature that doesn't verify, macOS calls the app damaged rather than offering to open it. Later versions install from inside the app.
- **Silent rollback:** when the swap fails, the helper puts the old version back and reopens it, but mboard doesn't say that the install failed.
- **Untested permission:** whether macOS lets the helper replace a bundle in `/Applications` without asking can only be checked with a real install. That is manual check M4.
- **Rate limit:** unauthenticated API calls are limited to 60 an hour per IP address, far more than mboard uses.
- **Upgrade path:** with a Developer ID signature and notarisation, either switch to Squirrel, or keep this installer and add `codesign --verify --deep --strict` plus a check that the new bundle's Team ID matches the running one.
