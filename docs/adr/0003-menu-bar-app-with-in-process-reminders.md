# 3. A menu-bar app delivers reminders from its own process

- Status: accepted (decided by the orchestrator under the user's delegation, 2026-11-16)

## Context

Electron can't hand macOS a notification to deliver later. From Electron 42, `Notification` fails for apps that aren't properly signed, and code signing for distribution is out of scope.

## Decision

mboard keeps running in the menu bar when its window closes, and opens at login by default.

- **When it checks:** every minute, on wake and at launch, comparing due dates with the wall clock.
- **What it sends:** one reminder per task at 09:00 local time on the due date. Missed reminders are caught up once.
- **Fallback:** if a notification fails, the menu-bar count and an in-app banner carry the reminder instead.

## Consequences

- After Cmd+Q, reminders arrive late, at the next launch, not on time.
- Whether ad-hoc signing is enough for notifications is a manual check. The design holds either way.
- Reminders that macOS delivers while mboard is quit would need native code and a signed app. That is the upgrade path if signing ever comes into scope.
