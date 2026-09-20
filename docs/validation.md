# Validation for 0.1.0

Validated on Linux/WSL2 with Herdr 0.9.1 and Node.js 22.23.2.
This is an experimental release, not a claim of lossless notification delivery.

## Automated checks

`node --test notify.test.mjs` passed all 15 behavioral subtests (16 reported tests including the parent).
The suite uses a local HTTP server and a temporary Herdr CLI fixture. It covers:

- done/blocked publication and silence for working, idle, unknown/unrelated events;
- workspace position versus stable ID, correct event-pane selection, explicit pane-label precedence, title fallbacks, and tab cardinality;
- failed metadata lookup with matching-context fallback and an explicit incomplete-context warning;
- plain text, bounded names, preserved IDs, and exclusion of selected text, working-directory, session and transcript fields;
- rapid status changes without cooldown suppression;
- absent/disabled config and unsafe/group config rejection;
- Telegram rejection, rate limiting, redirect refusal, a stalled request deadline, non-JSON responses, and redacted network errors.

The GitHub workflow repeats the suite on Node 22 and 24 without installing dependencies.
Workflow run results, rather than this document, are authoritative for each commit.

## Real Herdr and Telegram smoke test

A disposable Herdr server used isolated home, config, data, state, and socket paths.
It linked the package with the real manifest. Existing Herdr sessions and agents were not altered.
The test used a workspace named `Notifier validation` and a pane named `Test agent`.

With the operator's explicit permission, exactly three messages were accepted by Telegram:

| Input | Observed result |
| --- | --- |
| Invoke the manifest's `test` action | Plugin log `succeeded`, exit 0, Telegram API accepted |
| Report working, then blocked on the validation pane | Event hook ran; Telegram API accepted needs-attention alert |
| Report idle while that pane was selected/seen | Herdr exposed `idle`; hook ignored it; no Telegram send |
| Move focus to a second validation workspace, report working then idle | Herdr exposed `done`; hook ran; Telegram API accepted finished alert |

The state inputs came from `herdr pane report-agent`, not a live model turn.
This exercises the real daemon, status mapping, plugin event dispatch, metadata queries,
Node entrypoint, and Telegram transport. It does not prove that every agent integration emits
correct lifecycle events. Completion alerts deliberately retain Herdr's seen/unseen semantics.

After the three acceptances, the disposable config was disabled and its credentials removed.
No bot token, destination ID, private project name, or raw operational log is included here.

## Limits before marketplace promotion

- Confirm actual phone rendering, notification permissions, mute settings, and lock-screen disclosure.
- Exercise real OMP question, approval, continuation, retry, cancellation, and normal completion workflows.
- Observe concurrent agents, multiple Herdr sessions, disconnect/reconnect, and prolonged operation.
- Verify release installation/update from a clean user profile; keep the supported platform list honest.
- Do not broaden idle handling without testing startup/focus/acknowledgement false positives.

The public repository is intentionally not tagged `herdr-plugin` yet. See [marketplace status](marketplace.md).
