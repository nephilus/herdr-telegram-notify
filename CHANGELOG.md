# Changelog

## 0.1.4

- Clarify that the notifier is agent-neutral and consumes Herdr's generic status event.
- Document installation and status checks for every Herdr 0.9.1 integration target.
- Distinguish lifecycle-authority integrations from session-only integrations whose state still comes from screen detection.
- No sender, config, or alert-format changes.

## 0.1.3

- Compact alerts to status, workspace, pane, and source; retain names and stable workspace/pane IDs.
- Add 🏁 / ⚠️ / ⏸️ state icons and 🧪 for the manual test.
- Remove the navigation footer, duplicated toast-context line, separate tab row, and unnecessary tab metadata query.
- Preserve incomplete-context warnings and the `notifyOnIdle` flag.

## 0.1.2

- Add optional boolean `notifyOnIdle` (default `false`) to forward idle events, including seen-pane completions, as “agent is idle.”
- Changing the flag takes effect on the next event without a restart. `enabled: false` still disables every send.
- Reject non-boolean flag values and show whether idle alerts are enabled in the local status action.
- Document possible startup/acknowledgement alerts; no second state tracker or deduplication is added.

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
