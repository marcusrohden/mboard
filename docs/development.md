# Development

mboard is built with Electron Forge 8 (Vite plugin), Electron 45, React 19 and TypeScript 6, using pnpm with the hoisted node linker. `docs/spec/v1.md` holds the behaviour; this page covers the commands.

## Layout

| Folder | Holds | May import |
| --- | --- | --- |
| `src/domain/` | pure model, file codec and rules | `yaml` only |
| `src/shared/` | the `window.mboard` contract and IPC channel names | `src/domain` types |
| `src/main/` | Electron main: composition root (`index.ts`), `ports.ts`, launch config, board backend, IPC, `platform/`, `app-update/` | domain, shared, node, electron |
| `src/preload/` | `contextBridge` exposing `window.mboard` | shared, `electron` |
| `src/renderer/` | React UI | domain, shared (never node or electron) |
| `tests/e2e/` | Playwright Electron tests against the built app | anything |
| `.github/workflows/` | `pr.yml` checks pull requests; `release.yml` runs release-please and attaches the macOS zip | |

Unit tests sit beside the code as `*.test.ts` and run in node (see `vitest.config.mts`).

## Commands

```bash
pnpm install --frozen-lockfile --store-dir "$TMPDIR/pnpm-store" --package-import-method copy
pnpm run typecheck      # tsc -b over main, preload, renderer, domain, shared and tests
pnpm test               # vitest, unit and integration
pnpm start              # dev: Forge with the Vite dev server
pnpm run package        # out/mboard-darwin-arm64/mboard.app, ad-hoc signed
pnpm run make           # out/make/zip/darwin/arm64/mboard-darwin-arm64-<version>.zip, the release asset
pnpm exec playwright test   # e2e against the built output (.vite/build), run package first
pnpm run test:e2e       # package, then e2e
```

Packaging and e2e need the Electron download cache somewhere writable:

```bash
export electron_config_cache="$TMPDIR/electron-cache"
```

## Running inside the Claude Code sandbox

- **Install:** `pnpm install` must run with the sandbox disabled, because the seatbelt refuses writes to `.vscode/` folders inside `node_modules`. With `--package-import-method copy` it reuses the store and takes seconds.
- **Packaging:** `pnpm run package` runs sandboxed once `electron_config_cache` points into `$TMPDIR`.
- **e2e:** Playwright e2e (`pnpm exec playwright test`) must run with the sandbox disabled, because Electron can't start inside the seatbelt.
- **Dev server:** `pnpm start` binds a local port, which the sandbox may refuse. e2e never depends on it.
- **No `open`:** never use `open` to launch the app, and never point tests at the real Obsidian vault.

## Test hooks

Main reads these at launch (`src/main/launch-config.ts`, spec section 7): `MBOARD_USER_DATA`, `MBOARD_BOARD_PATH`, `MBOARD_FAKE_NOW`, `MBOARD_NOTIFIER_LOG`, `MBOARD_NOTIFIER_FAIL`, `MBOARD_TRASH_DIR`, `MBOARD_DISABLE_LOGIN_ITEM` and `MBOARD_DISABLE_APP_UPDATE_CHECK`. e2e fixtures always set the user-data, trash, login-item and app-update-check hooks.

Automatic app update checks only run in a packaged build, so `pnpm start` never reaches GitHub by itself. **Check for updates** in Settings still works there, and offers **Download from GitHub**, because a copy run from source can't replace itself.

## VS Code tasks

Starting mboard from VS Code runs it from source with `pnpm start`: **F5** (`.vscode/launch.json`) and **Cmd+Shift+B** (the default build task) both run **mboard: dev**. The other tasks are under **Terminal › Run Task…** (`.vscode/tasks.json`).

| Task | Does |
| --- | --- |
| mboard: build | `pnpm run package` |
| mboard: open | quits a running mboard, then opens `out/mboard-darwin-arm64/mboard.app` |
| mboard: build and open | quits, packages, then opens the new build |
| mboard: dev | quits, then `pnpm start` with `MBOARD_DISABLE_LOGIN_ITEM=1` so a dev run never registers Electron as the login item |

mboard keeps running in the menu bar after its window closes, so `open` on its own would only bring back the old process. `scripts/quit-mboard.sh` quits it first through AppleScript; the first run asks macOS to let VS Code control mboard. Stop a running **mboard: dev** before opening the packaged app, because both share one single-instance lock.

The packaged and dev apps share `~/Library/Application Support/mboard/settings.json` (board folder, Open at Login, window bounds), so every build starts with the existing settings. Nothing here deletes that folder.

## Releasing

Releases are cut by [release-please](https://github.com/googleapis/release-please) from what lands on `main` (ADR 0004).

1. Open a pull request into `main`. Its title must be a [conventional commit](https://www.conventionalcommits.org/) such as `feat: add settings and app updates` or `fix: keep the drawer open after a rename`. `pr.yml` checks the title, and runs typecheck, oxlint, the oxfmt check and the tests on `macos-latest`.
2. Squash-merge it. The squash commit takes the PR title, which is what release-please reads. Before 1.0, `feat` bumps the minor version and `fix` the patch version, so the first release is v0.2.0.
3. `release.yml` opens or updates the release PR, `chore(main): release X.Y.Z`, which bumps `package.json` and `.release-please-manifest.json` and adds to `CHANGELOG.md`.
4. Merge the release PR when you want to release. release-please tags `vX.Y.Z` and creates the GitHub release. A macOS job then checks out the tag, runs typecheck and the tests, runs `pnpm run make` and attaches `mboard-darwin-arm64-X.Y.Z.zip` to the release.
5. Copies of mboard find the new version within 6 hours, or straight away with **Check for updates** in Settings. Until the zip is attached, the release doesn't count.

Workflows started with `GITHUB_TOKEN` don't trigger other workflows, so `pr.yml` doesn't run on the release PR. That's fine: it only changes the version and the changelog.

### One-off repository settings

- Make the repository public, so the app can read releases without a token.
- **Settings › Actions › General › Workflow permissions:** tick **Allow GitHub Actions to create and approve pull requests**, so release-please can open its PR.
- **Settings › General › Pull Requests:** allow only **squash merging**, and set the default commit message to **Pull request title**.

### Installing

- **First install:** download the zip from the latest release, unzip it, move `mboard.app` to `/Applications`, then run `xattr -dr com.apple.quarantine /Applications/mboard.app` once before opening it. The build is ad-hoc signed and its top-level signature doesn't verify, so expect macOS to call a quarantined copy damaged rather than offer to open it, and right-click › Open won't help.
- **Later versions:** **Install and restart** in the new version notice or in Settings downloads, checks and installs the release, then reopens mboard. mboard needs to be able to write to the folder it's in, and mustn't be running from a translocated copy (one opened straight from Downloads while quarantined).

## Daily use from source

1. Run `pnpm run package`.
2. Copy `out/mboard-darwin-arm64/mboard.app` to `/Applications` and launch it from Finder.
3. The build is ad-hoc signed and not notarised. A local build isn't quarantined. If a copy ever is, run `xattr -dr com.apple.quarantine /Applications/mboard.app`.
