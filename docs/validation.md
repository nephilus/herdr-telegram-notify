# Validation evidence

Validated on Linux/WSL2 with Herdr 0.9.1 and Node.js 22.23.2.
This is an experimental release, not a claim of lossless notification delivery.

The live transport results below were obtained with `0.1.0`. Release `0.1.1`
changes only naming, package-version metadata, and documentation; the sender
and its tests are unchanged. It does not claim another live Telegram trial.

## 0.1.5 tab-context validation

The behavioral suite verifies workspace → event tab → event pane ordering,
rejects focused-tab substitution, exercises matching event-context fallback,
and keeps incomplete-context diagnostics. A real CLI smoke check used a local
HTTP receiver only; no external Telegram message was sent.

## 0.1.4 documentation verification

The notifier runtime is unchanged. The manifest still subscribes to the generic
`pane.agent_status_changed` event and has no agent-name filter. Herdr 0.9.1's
installed CLI help and first-party integration documentation were checked for
the complete per-agent install target list and lifecycle-versus-session status
authority model. Markdown links/fences and the unchanged behavioral suite were
verified before publication.

## 0.1.3 compact-format validation

All 16 behavioral subtests passed with the updated compact-format contract.
An additional smoke check ran the real CLI entrypoint for done, blocked, idle,
and manual test through a local HTTP receiver. State alerts were four lines
with the expected icons and both workspace/pane IDs; the manual test was two
lines. None included the navigation footer or a tab row. No external Telegram
test messages were sent, and temporary receiver/files were removed.

## 0.1.2 idle-option validation

All 16 behavioral subtests passed (17 reported tests including the parent).
The new regression failed before implementation and passes afterward. It
covers false → true → false toggling, accurate idle wording, retained
done/blocked alerts, ignored working/unknown states, non-boolean rejection,
and the master disabled flag preventing metadata lookup and publication.

A separate smoke check launched the real `node notify.mjs event` entrypoint
three times with false → true → false. Only the middle invocation sent a
request to a local HTTP receiver, with an “omp is idle” title. It queried the
real Herdr metadata CLI but redirected transport locally; no extra Telegram
test message was sent. Temporary files and the receiver were removed.

## Automated checks

`node --test notify.test.mjs` passed all 15 behavioral subtests (16 reported tests including the parent).
The suite uses a local HTTP server and a temporary Herdr CLI fixture. It covers:

- done/blocked publication and silence for working, idle, and unrelated events;
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

## Published package checks

Release `v0.1.0` points to `0dad8946d78e717649795f387cbd5b6631f6491b`.
[GitHub CI](https://github.com/nephilus/herdr-telegram-notify/actions/runs/35525497058)
passed both Node 22 and Node 24 jobs; the tag workflow also passed.

After unlinking the local development copy in the isolated profile,
`herdr plugin install nephilus/herdr-telegram-notify --ref v0.1.0 --yes`
installed the public tag successfully. The installed `status` action completed
with exit 0 and correctly reported the disabled test configuration without
sending another message. The disposable server and files were then removed.

## Limits before marketplace promotion

- Confirm actual phone rendering, notification permissions, mute settings, and lock-screen disclosure.
- Exercise real OMP question, approval, continuation, retry, cancellation, and normal completion workflows.
- Observe concurrent agents, multiple Herdr sessions, disconnect/reconnect, and prolonged operation.
- Exercise upgrades from an older GitHub-managed release; keep the supported platform list honest.
- Do not broaden idle handling without testing startup/focus/acknowledgement false positives.

The public repository is intentionally not tagged `herdr-plugin` yet. See [marketplace status](marketplace.md).
