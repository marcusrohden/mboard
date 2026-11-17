# mboard

A personal Kanban board for macOS, kept as markdown files in your Obsidian vault.

Every task is one markdown file in a board folder, so you can read and edit tasks in Obsidian, in any editor, or with a script or an AI agent. mboard picks up those outside edits as they happen. There is no other data store.

- Five columns: To do, In progress, Internal, With client and Done.
- Lives in the menu bar, with a reminder at 09:00 on each task's due date.
- Every task shows how many working days have passed since its last update, coloured by age. You choose the thresholds in Settings.
- Projects can have a colour, and a task can be reverted to an earlier point in its history.
- Every button and action has a Command shortcut, shown faded on the button.
- Updates itself from GitHub releases.

## Install

You need a Mac with Apple silicon. An Obsidian vault is recommended, but not required.

### From a release

1. Open the [latest release](https://github.com/marcusrohden/mboard/releases/latest) and download `mboard-darwin-arm64-<version>.zip`.
2. Unzip it and drag **mboard** into your **Applications** folder. mboard can only update itself from a folder it's allowed to change, and not from the temporary copy macOS makes when an app is opened straight from Downloads.
3. Open mboard. It isn't notarised by Apple, so the first time macOS refuses to open it:
   1. Close the warning.
   2. Open **System Settings › Privacy & Security**, scroll to **Security**, and click **Open Anyway** next to the message about mboard.
   3. Open mboard again and confirm with **Open Anyway** and your password or Touch ID.

   Alternatively, clear the quarantine flag in Terminal, then open mboard as usual:

   ```bash
   xattr -dr com.apple.quarantine /Applications/mboard.app
   ```

If there's no release yet, build mboard from source.

### From source

You need Node.js 22.17 or later and pnpm 10.

```bash
git clone https://github.com/marcusrohden/mboard.git
cd mboard
pnpm install --frozen-lockfile
pnpm run package
```

Then move `out/mboard-darwin-arm64/mboard.app` into your **Applications** folder. A copy you built yourself opens without the warning, and updates itself from releases like a downloaded one.

## First run

1. Click **Choose folder…** and pick where the board lives:
   - an **empty folder** starts a new board. mboard creates `tasks/`, `archive/` and a `README.md` that explains the file format to people and agents.
   - a folder that already has a `tasks/` folder opens that board.
   - a folder outside an Obsidian vault works too, after you confirm it.
2. Allow notifications when macOS asks, so that due-date reminders can reach you. If they can't, reminders show in a banner on the board instead.

mboard keeps running in the menu bar when you close its window, so reminders still arrive. Quit it from the menu bar icon or with ⌘Q. It opens at login unless you turn that off in Settings (⌘,).

## Updating

mboard checks for a new version every 6 hours and shows a notice when one is out. Click **Install and restart**, or use **Check for updates** in Settings at any time.

## Uninstalling

1. Turn off **Open at login** in Settings, then quit mboard.
2. Move `/Applications/mboard.app` to the Bin.
3. To remove its settings too, delete `~/Library/Application Support/mboard`.

Your board folder and its task files are never touched.

## Documentation

- [Development](docs/development.md): commands, layout, testing and releasing.
- [Specification](docs/spec/v1.md): how mboard behaves, including the full list of keyboard shortcuts.
- [Glossary](GLOSSARY.md) and [architecture decisions](docs/adr/).

## Licence

MIT
