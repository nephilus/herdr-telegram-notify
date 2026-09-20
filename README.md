# Herdr Telegram Notify (Send-only)

A send-only [Herdr](https://herdr.dev/) plugin that sends a short Telegram message when an agent is done or needs attention. It is intended for one user’s private bot chat and all Herdr sessions owned by that user on the same host.

An independent community plugin, separate from the [Agent Telegram Notify example](https://github.com/ogulcancelik/herdr-plugin-examples/tree/main/agent-telegram-notify). This package provides outbound alerts only: no callback watcher, remote commands, or approval buttons. It is not an official Herdr plugin.

Version `0.1.1` is experimental. It is not a stable or fully certified integration.
Validation covered the real Herdr hook and three accepted Telegram API sends. Phone display and long-running reliability are not certified; see [validation evidence](docs/validation.md).

**Completion follows Herdr’s attention state:** an unseen completion can emit `done`; an already-seen pane can emit `idle` instead and will not alert. The plugin does not reinterpret every idle event as completion.

## What it does

- Sends notifications for `done` and `blocked` agent states.
- Includes available workspace, pane, and (when useful) tab names and identifiers.
- Sends an explicit test message only when you invoke the `test` action.
- Reads configuration from Herdr’s per-plugin config directory, outside this checkout.
- Never polls Telegram for updates, accepts inbound commands, displays buttons, or sends agent transcripts.

A `done` notification means Herdr reported an unseen idle agent, not that the requested work succeeded. A `blocked` notification means Herdr reported a state needing attention.

Example with synthetic names:

```text
omp finished
Project · 2 · Review

Workspace: Project [w2]
Pane: Review changes [w2:p7]
Tab: Review [w2:t7]
Source: My Herdr
Open Herdr for context.
```

The first two lines reproduce the standard agent-toast wording and available context; they are not a capture of arbitrary custom toasts.

## Requirements

- Linux
- Node.js 22 or newer
- Herdr 0.9.1 or newer
- A private Telegram bot and a private chat with that bot

Herdr’s plugin commands are user-wide. A linked or installed plugin is available to all Herdr sessions for the same user on that host, not only the session from which it was installed.

## Install

Install the tagged release from GitHub and review Herdr’s interactive preview before accepting it:

```sh
herdr plugin install nephilus/herdr-telegram-notify --ref v0.1.1
```

The plugin runs as ordinary user code. Read the manifest and source before accepting an install from any plugin author; see [Herdr’s plugin security guidance](https://herdr.dev/docs/plugins/#trust-and-security).

## Configure

There is no `configure` action. Create the config file yourself in the directory Herdr assigns to the plugin:

```sh
umask 077
config_dir="$(herdr plugin config-dir nephilus.telegram-notify)"
mkdir -p "$config_dir"
chmod 700 "$config_dir"
"${EDITOR:-vi}" "$config_dir/config.json"
chmod 600 "$config_dir/config.json"
```

Start with the disabled shape below while gathering your values. Do not put a real token in a command line, shell history, public issue, or checkout.

```json
{
  "enabled": false,
  "botToken": "",
  "chatId": "",
  "label": "My Herdr"
}
```

Then set `enabled` to `true`, use the token issued by BotFather, enter your positive private chat ID, and keep a short descriptive `label` (at most 100 characters). The file must remain owner-only (`0600`), and its directory must remain owner-only (`0700`). Unknown keys are rejected.

`label` appears as `Source:` in each message. Set a distinct label on each host
if several installations send to the same chat. It applies to every Herdr
session on that installation; it is not derived automatically from the hostname.
Private labels can identify your machines without hardcoding those names in
the public plugin.

### Create a private bot and find your chat ID

1. Use Telegram’s official **BotFather** to create a bot. Keep the bot private; do not add it to groups or forward the token to anyone.
2. Open the bot’s own conversation as yourself and press **Start** (or send `/start`). Telegram will not deliver a usable private-chat notification until the conversation has been started.
3. With your token saved in the protected, still-disabled config file, make the one-time `getUpdates` request below. Identify your own `/start` conversation and copy its positive chat ID into `config.json`. Do not select an unfamiliar sender.
4. Do not use random third-party “chat ID” bots. Do not paste a token-bearing API URL into a browser, where it can remain in history. Never place the token directly on a command line.

This setup-only request is not a background listener and does not send messages.
The token stays out of argv and printed errors:

```sh
HERDR_PLUGIN_CONFIG_DIR="$config_dir" node --input-type=module <<'JS'
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
try {
  const { botToken } = JSON.parse(await readFile(join(process.env.HERDR_PLUGIN_CONFIG_DIR, 'config.json'), 'utf8'));
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ allowed_updates: ['message'] }),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error();
  for (const update of body.result) {
    const message = update.message;
    if (message?.chat?.type === 'private' && message.text === '/start') {
      console.log({ chatId: String(message.chat.id), username: message.from?.username, time: message.date });
    }
  }
} catch {
  console.error('Could not read bot updates. Check the protected token, network, and bot configuration.');
  process.exitCode = 1;
}
JS
```

If nothing is printed, send `/start` again and repeat. Updates may be unavailable if another consumer already fetched them or the bot has a webhook; use a dedicated bot.

## Check and operate the plugin

`status` is local: it validates whether the plugin is enabled and configured and does not send Telegram traffic.

```sh
herdr plugin action invoke nephilus.telegram-notify.status
```

Send one explicit test notification after configuration:

```sh
herdr plugin action invoke nephilus.telegram-notify.test
```

Inspect the last ten Herdr plugin log entries:

```sh
herdr plugin log list --plugin nephilus.telegram-notify --limit 10
```

Disable or re-enable notifications for all of your Herdr sessions:

```sh
herdr plugin disable nephilus.telegram-notify
herdr plugin enable nephilus.telegram-notify
```

A disabled or missing config causes the plugin to skip metadata lookup and network access.

## Update and uninstall

There is no separate update command for a GitHub-managed plugin. Re-run the same install command with the desired release ref to refresh it:

```sh
herdr plugin install nephilus/herdr-telegram-notify --ref v0.1.1
```

To remove the GitHub-managed installation, unregister it and remove its managed checkout with:

```sh
herdr plugin uninstall nephilus.telegram-notify
```

`herdr plugin unlink nephilus.telegram-notify` is for a locally linked plugin; it only unregisters that local link and leaves local files in place. It is not the normal removal command for this GitHub installation.

## Reliability and privacy boundaries

The plugin receives Herdr state events, not terminal transcripts or exact toast text. Context names are best-effort; if a Herdr query fails, the status alert is retained and marked as incomplete. Telegram delivery is send-only and best-effort; a failed request does not block the Herdr agent.

See [reliability details](docs/reliability.md) and the [security model](SECURITY.md) before enabling it.

## Troubleshooting

- No completion alert: check whether Herdr reported `idle` rather than `done`; seen-pane completions do not notify.
- No names: inspect the incomplete-context note. The event pane may have closed or a one-second Herdr query may have timed out.
- Configuration error: check ownership, `0600` file mode, supported keys, and a positive **string** chat ID. Groups are not supported.
- `chat_not_found`: open your bot, press Start, and verify the private chat ID.
- HTTP 429: the log reports Telegram’s retry delay. This plugin does not retry or queue the event.
- Timeout/network error: delivery is unknown. Retrying manually could duplicate a message.
- An invocation returned a log ID: actions are asynchronous. Inspect the log for final `succeeded`/`failed`, `exit_code`, and stdout/stderr.

## Development

No dependency installation or build step is required:

```sh
git clone https://github.com/nephilus/herdr-telegram-notify.git
cd herdr-telegram-notify
node --test notify.test.mjs
herdr plugin link "$PWD" --enabled
```

`just check` is an optional shorthand for the same tests. Tests use temporary local HTTP and Herdr CLI fixtures, not a real Telegram bot. Installing over a local link is refused by Herdr; unlink it before switching to a GitHub-managed installation.

Marketplace discovery is deliberately deferred. See [the marketplace checklist](docs/marketplace.md).

## License

[Apache License 2.0](LICENSE).

## References

- [Herdr plugins](https://herdr.dev/docs/plugins/)
- [Herdr marketplace](https://herdr.dev/docs/marketplace/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
