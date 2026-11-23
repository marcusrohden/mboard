# Development

mboard is built with Electron Forge 8 (Vite plugin), Electron 45, React 19 and TypeScript 6, using pnpm with the hoisted node linker. `docs/spec/v1.md` holds the behaviour; this page covers the commands.

## Layout

| Folder               | Holds                                                                                                                   | May import                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `src/domain/`        | pure model, file codec and rules                                                                                        | `yaml` only                             |
| `src/shared/`        | the `window.mboard` contract and IPC channel names                                                                      | `src/domain` types                      |
| `src/main/`          | Electron main: composition root (`index.ts`), `ports.ts`, launch config, board backend, IPC, `platform/`, `app-update/` | domain, shared, node, electron          |
| `src/preload/`       | `contextBridge` exposing `window.mboard`                                                                                | shared, `electron`                      |
| `src/renderer/`      | React UI                                                                                                                | domain, shared (never node or electron) |
| `tests/e2e/`         | Playwright Electron tests against the built app                                                                         | anything                                |
| `.github/workflows/` | `pr.yml` checks pull requests; `release.yml` releases every feature or fix merged into `main` (`scripts/release/`)      |                                         |

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

Main reads these at launch (`src/main/launch-config.ts`, spec section 7): `MBOARD_USER_DATA`, `MBOARD_BOARD_PATH`, `MBOARD_FAKE_NOW`, `MBOARD_NOTIFIER_LOG`, `MBOARD_NOTIFIER_FAIL`, `MBOARD_TRASH_DIR`, `MBOARD_DISABLE_LOGIN_ITEM` and `MBOARD_DISABLE_APP_UPDATE_CHECK`. The e2e fixtures (`tests/e2e/fixtures.ts`) set `MBOARD_USER_DATA` and `MBOARD_DISABLE_APP_UPDATE_CHECK` for every test. They don't yet set `MBOARD_TRASH_DIR` or `MBOARD_DISABLE_LOGIN_ITEM`, which spec section 7 asks for.

Automatic app update checks only run in a packaged build, so `pnpm start` never reaches GitHub by itself. **Check for updates** in Settings still works there, and offers **Download from GitHub**, because a copy run from source can't replace itself.

## VS Code tasks

Starting mboard from VS Code runs it from source with `pnpm start`: **F5** (`.vscode/launch.json`) and **Cmd+Shift+B** (the default build task) both run **mboard: dev**. The other tasks are under **Terminal › Run Task…** (`.vscode/tasks.json`).

| Task                   | Does                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| mboard: build          | `pnpm run package`                                                                                                  |
| mboard: open           | quits a running mboard, then opens `out/mboard-darwin-arm64/mboard.app`                                             |
| mboard: build and open | quits, packages, then opens the new build                                                                           |
| mboard: dev            | quits, then `pnpm start` with `MBOARD_DISABLE_LOGIN_ITEM=1` so a dev run never registers Electron as the login item |

mboard keeps running in the menu bar after its window closes, so `open` on its own would only bring back the old process. `scripts/quit-mboard.sh` quits it first through AppleScript; the first run asks macOS to let VS Code control mboard. Stop a running **mboard: dev** before opening the packaged app, because both share one single-instance lock.

The packaged and dev apps share `~/Library/Application Support/mboard/settings.json` (board folder, Open at Login, window bounds, the agent) and `agent-prompts.json` (the saved agent prompts and their versions), so every build starts with the existing settings and prompts. Nothing here deletes that folder.

## Releasing

Every feature or fix merged into `main` is released by itself: one pull request, one merge (ADR 0008).

1. Open a pull request into `main`. Its title must be a [conventional commit](https://www.conventionalcommits.org/) such as `feat: add settings and app updates` or `fix: keep the drawer open after a rename`. `pr.yml` checks the title, and runs typecheck, oxlint, the oxfmt check and the tests on `macos-latest`.
2. Squash-merge it. The squash commit takes the PR title, and that decides the release:
   - `fix` releases a patch version and `feat` a minor one. A breaking change (`feat!:`, or a `BREAKING CHANGE:` footer) releases a major version, or a minor one before 1.0.
   - Anything else, such as `chore`, `docs`, `ci` or `refactor`, releases nothing. It goes out with the next feature or fix.
3. `release.yml` runs `scripts/release/release.mts plan`, which counts every commit since the last `vX.Y.Z` tag and writes the release notes.
4. On `macos-latest` it installs, runs typecheck, oxlint, the oxfmt check and the tests, sets the version in `package.json`, runs `pnpm run make`, and checks the app was built as that version.
5. It publishes the GitHub release, tagging the merged commit `vX.Y.Z`, with `mboard-darwin-arm64-X.Y.Z.zip` attached.
6. Last, it commits the version and the new `CHANGELOG.md` entry to `main` as `chore(release): X.Y.Z`. Pushes made with the workflow's own token don't start workflows, so this doesn't release again.
7. Copies of mboard find the new version within 6 hours, or straight away with **Check for updates** in Settings. Until the zip is attached, the release doesn't count.

Merges are released one at a time, in order. A merge made while an earlier one is still releasing waits, and goes out with any merge after it.

**When a run fails:**

- **Before publishing:** nothing was tagged. Fix the cause and re-run the workflow, or merge the fix: the next run counts every commit since the last tag.
- **While publishing:** if a release or a `vX.Y.Z` tag was left behind without its zip, delete them (`gh release delete vX.Y.Z --cleanup-tag`), then re-run the workflow.
- **Only the push to `main` failed:** the release stands. Bring `main` in line by hand: `node scripts/release/release.mts apply X.Y.Z --notes-file <the notes from the release>`, then commit `chore(release): X.Y.Z`.

### One-off repository settings

- Make the repository public, so the app can read releases without a token.
- Leave `main` without branch protection that blocks pushes, or let GitHub Actions bypass it, so the release workflow can commit the version back.
- **Settings › General › Pull Requests:** allow only **squash merging**, and set the default commit message to **Pull request title**.

### Installing

- **First install:** download the zip from the latest release, unzip it, move `mboard.app` to `/Applications`, then run `xattr -dr com.apple.quarantine /Applications/mboard.app` once before opening it. The build is ad-hoc signed (re-signed after packaging, so `codesign --verify --deep --strict` passes) but not notarised, so macOS refuses a quarantined copy as from an unidentified developer until the quarantine flag is removed, or until you allow it under System Settings › Privacy & Security › Open Anyway.
- **Later versions:** **Install and restart** in the new version notice or in Settings downloads, checks and installs the release, then reopens mboard. mboard needs to be able to write to the folder it's in, and mustn't be running from a translocated copy (one opened straight from Downloads while quarantined).

## Daily use from source

1. Run `pnpm run package`.
2. Copy `out/mboard-darwin-arm64/mboard.app` to `/Applications` and launch it from Finder.
3. The build is ad-hoc signed and not notarised. A local build isn't quarantined. If a copy ever is, run `xattr -dr com.apple.quarantine /Applications/mboard.app`.
