# 8. Every feature or fix merged into main is released by itself

- Status: accepted (decided by the user, 2026-11-17)
- Qualifies: ADR 0004

## Context

ADR 0004 had release-please cut releases. Each change then took two pull requests: the change itself, then the release PR that release-please opened. The release PR is opened by GitHub Actions, so GitHub held its checks until the user approved them. The user wants one pull request, approved and merged, to make the release.

## Decision

- **When:** every push to `main` runs `release.yml`. In practice that is a squash merge, whose commit takes the pull request's title.
- **What it counts:** `scripts/release/release.mts` reads every commit since the last `vX.Y.Z` tag. A `fix` calls for a patch version, a `feat` for a minor one, and a breaking change (`!` after the type, or a `BREAKING CHANGE:` footer) for a major one, or a minor one before 1.0. The highest call wins. Other types release nothing.
- **Tags are the source of truth** for the current version, not `package.json`.
- **Order:** install, check and test; set the version; build; check that the app was built as that version; publish the release on the merged commit with its zip; then commit `package.json` and `CHANGELOG.md` back to `main` as `chore(release): X.Y.Z`.
- **Credentials:** the workflow's own token, given only to the publish and push steps. The checkout keeps no credentials, so `pnpm install` and the build never run with a write token available.
- **One at a time:** runs share a concurrency group, so a running release is never cancelled. GitHub keeps only the newest waiting run, but that run counts every commit since the last tag, so the merges of any run it replaced still go out.

## Consequences

- **No holding back or batching:** every feature or fix goes out as soon as it's merged. To hold a change back, keep its PR open, or merge it under a title that doesn't release, such as `chore`.
- **No approvals:** nothing is opened by GitHub Actions, so there are no held checks.
- **Pushes to `main`:** the workflow commits to `main` directly, so `main` must allow that. Pushes made with the workflow's own token don't start workflows, so the commit doesn't release again.
- **Recovery:** if a run fails before publishing, nothing is tagged and the next run picks the commits up again. If it fails while publishing, delete the release and tag (`gh release delete vX.Y.Z --cleanup-tag`), then re-run. If only the push to `main` fails, the release stands and `main` is brought in line by hand. `docs/development.md` has the steps.
- **First real run:** the workflow is only proven by its first release. Watch it with `gh run watch`.
