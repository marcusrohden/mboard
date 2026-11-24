# 16. Descriptions, comments and prompts show rendered markdown, and open their source on a click

- Status: accepted (chosen by the user, 2026-11-24)
- Qualifies: ADR 0001, ADR 0012

## Context

Task files are markdown that the user also reads in Obsidian, and descriptions, comments and agent prompts are written as markdown: headings, lists, checklists, bold, links. mboard showed all of them as plain text in textareas, so the formatting only showed in Obsidian. The user asked for every text area to show markdown as formatted text.

Three ways were weighed:

- **Rendered, click to edit:** the text shows formatted, and a click opens its markdown source in the same place. The text is saved exactly as typed.
- **Write and Preview tabs**, as GitHub has: an extra click to see the result, and saved text still shows as source unless it is rendered elsewhere too.
- **A WYSIWYG editor** (TipTap, Milkdown): no markdown syntax on screen, but the editor writes its own markdown back on every save. That would rewrite text written in Obsidian, such as list markers, spacing, wikilinks and callouts, and is a much larger dependency.

## Decision

- **Rendered, click to edit**, chosen by the user, for the drawer's Description, the New task dialog's description, the drawer's new comment box, the Add comment and Move comment dialogs, and the Open agent dialog's prompt text. Comments in the drawer and in Previous comments always show rendered.
- **The text never changes.** The rendered view is display only. What is typed is what is saved, byte for byte, so files stay as the user and Obsidian wrote them, and the file format, ledger and history are untouched (ADR 0001, ADR 0005).
- **Rendering:** `react-markdown` with GitHub-flavoured markdown (tables, task lists, strikethrough) and `remark-breaks`, so a single line break shows as one, as Obsidian shows it by default. Raw HTML is left out. Task-list checkboxes are shown but can't be ticked. Wikilinks show as typed.
- **Images aren't loaded.** The policy only lets the page load images from the app (ADR 0012), and mboard reaches the network only for app updates, so an image shows as a link to its source instead.
- **Switching:** a click on the rendered text, other than on a link or to select text, or Enter or Space while it has focus, opens the source with the caret at the end. Focus alone doesn't, so a dialog can focus the field and still show it rendered. Losing focus switches back. An empty field shows its textarea and placeholder. A read-only field, such as an archived task's description, only shows rendered.
- **A press must land where it was aimed.** Focus moves on mousedown, and the rendered view is usually a different height from the textarea, so switching at once would move the controls below before mouseup and the click would be lost. The switch waits until the press is released and its click has been dispatched. Losing focus because the window did keeps the source open, so switching apps keeps the caret.
- **Links** open outside the app, through a new `openLink(url)` command. Main checks the link again and hands only http, https, mailto and obsidian links to `shell.openExternal`. Any other link, such as a relative path, `file:` or `javascript:`, shows as plain text and is refused by main. The window itself still never navigates.

## Consequences

- Tab into a field with text now stops on its rendered view. Enter opens the source, where before typing could start at once.
- The Open agent dialog opens with the prompt rendered and focused, instead of in the textarea.
- A composer box shows its text rendered for a moment between losing focus and the post finishing.
- Clicking a link hands a URL from a task file to the browser, mail app or Obsidian. It is limited to those schemes, and every click comes from the user.
- The renderer gains `react-markdown`, `remark-gfm` and `remark-breaks`, pinned to exact versions, all MIT. They render to React elements and inject no styles, so the content security policy needs no change.
- e2e covers rendering under the policy, link opening, and a click on **Mark complete** right after editing the description (`tests/e2e/markdown.spec.ts`).
