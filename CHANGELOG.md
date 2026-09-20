# Changelog

## 0.1.1

- Rename the display name to `Telegram Notify (Send-only)` and clarify the independent community-plugin identity.
- Keep the author-scoped ID `nephilus.telegram-notify`, configuration path, and runtime behavior unchanged.
- No credential migration is needed when upgrading from 0.1.0.

## 0.1.0

Initial experimental public release under Apache-2.0.

- Send-only private Telegram notifications for Herdr `done` and `blocked` events.
- Toast-style title/context with explicit workspace, pane, and tab names/IDs.
- Best-effort event-specific metadata lookup with visible incomplete-context and truncation indicators.
- Local configuration status, explicit test action, owner-only credentials outside the checkout, and redacted delivery diagnostics.
- No inbound polling, buttons, remote approvals, background service, persisted queue, cooldown, or automatic retry.
- Linux, Node.js 22+, and Herdr 0.9.1+; dependency-free tests and Node 22/24 CI.

Known limits: seen-pane `idle` does not notify; `finished` does not imply success;
Telegram API acceptance does not confirm phone display; custom toasts are not mirrored.
Marketplace discovery remains deferred.
