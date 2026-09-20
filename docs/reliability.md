# Reliability and event fidelity

Herdr Telegram Notify is a notification bridge, not a second agent state machine. It consumes Herdr’s `pane.agent_status_changed` event and sends one short, best-effort message for `done` or `blocked`, and optionally `idle`.

### The seen-pane boundary

Herdr 0.9.1 maps internal `Idle` to public `done` only when the pane is **unseen**. If it is already seen, the public state is `idle`. This was reproduced against the real server: the selected validation pane completed as `idle`; the same pane completed as `done` after focus moved to another workspace.

By default, the plugin sends only `done` and `blocked`. Set `"notifyOnIdle": true` to forward `idle` too, including seen-pane completions. These messages say “agent is idle,” not “finished”: idle can also arise on startup or when a finished pane is viewed. There is no persisted state machine to distinguish those causes, so this option can produce extra alerts. Missing or `false` preserves the default behavior. It does not override the master `enabled` flag or create events Herdr has not emitted.

Source: [`pane_agent_status`](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/app/api_helpers.rs). See [validation evidence](validation.md).

## What counts as done or blocked

The OMP integration that supplies the state event tracks a root session and ignores nested OMP sessions. Its `agent_end` handling has several guards:

- An end event is ignored when the root agent is not active. This prevents a duplicate or late end event from falsely publishing idle while an automatic retry is still working.
- An end event with `willContinue === true` is ignored because a continuation is already scheduled.
- A normal end schedules idle after a **250 ms default idle debounce**.
- A recognized retryable provider or transport error holds the pane in working for a **2,500 ms default retry grace**. If no recovery arrives, the state becomes blocked.
- Explicit `ask` interactions and tool-approval requests set the state to blocked until they resolve.

The source used for this behavior is pinned at [`065ef9d6a531c49fb8bee7e818ef837065b21ee9`](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/integration/assets/omp/herdr-agent-state.ts), `src/integration/assets/omp/herdr-agent-state.ts`. These rules explain why a Telegram `done` alert means “Herdr observed a settled state,” not “the requested work was verified successful.”

Other agents have different integrations. Explicit lifecycle reporting is preferable to screen-pattern detection, but this notifier accepts Herdr's result rather than implementing its own classifier. Unrecognized errors or cancellation can still end in idle: `finished` never means successful. Provider safety approvals remain in the original interactive flow, not Telegram.

## Context lookup and fidelity

The plugin may query Herdr independently for workspace, pane, and tab context. It trusts event context only when the workspace ID and focused pane ID match the records it is using. It does not infer a pane name from an agent or tab name: pane naming prefers the actual pane label, then event or pane title, then the terminal title, and finally `(unnamed)`.

The message can include:

- the workspace label and number, when known;
- a tab label in the toast-style body only when the workspace has more than one tab; the separate tab metadata row can appear for a single tab;
- the pane name and identifiers;
- the configured source label.

Names are sanitized plain text, with control and bidirectional-format characters removed, whitespace collapsed, and bounded lengths. The complete message is kept below Telegram’s normal message-size limit. Identifiers are preserved rather than replaced by display names.

This is intentionally not exact toast replication. The event contains state and identifiers, while Herdr’s toast may include presentation details that are not present in the event. The plugin does not read terminal output, transcripts, selected text, tool arguments, or agent responses.

Each context query is independent. A failed query degrades the names or toast context but does not discard an otherwise eligible alert. The message then includes:

> Context: incomplete; names or toast context may be unavailable.

## Delivery behavior

- A configured plugin makes a single send attempt for each notifying event; it does not maintain a queue, cooldown, background service, or automatic retry loop.
- Delivery failures are fail-open to the main Herdr agent: a Telegram timeout or rejection must not block or alter the agent state.
- Herdr’s plugin log is for operational diagnostics. It must not be treated as proof that a phone displayed the message.
- The `status` action is local-only. The `test` action intentionally sends one explicit test message.
- Missing or disabled configuration skips context metadata lookup and network access.
- No event replay after downtime, exactly-once guarantee, or persisted deduplication. Concurrent event hooks and network timing can reorder messages.
- Context queries have a one-second timeout each and run concurrently. The Telegram request, including response-body parsing, has a five-second deadline. Redirects are rejected and HTTP 429 is reported without retrying.

For setup and command examples, see the [README](../README.md). For the data and trust model, see [SECURITY.md](../SECURITY.md).
