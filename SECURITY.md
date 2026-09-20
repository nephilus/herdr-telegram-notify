# Security and privacy

Herdr Telegram Notify sends agent-state notifications to one Telegram chat. Read this before configuring a bot token.

## Trust model

This is an ordinary Herdr plugin, not a sandbox. Herdr launches it as the installing user; it inherits that user’s environment and can invoke the Herdr CLI and other host programs. Review the manifest and source before installing or linking it. Do not run it under an account that should not be able to access the host’s Herdr sessions.

The plugin currently targets Linux, Node.js 22+, and Herdr 0.9.1+. Herdr registration is user-wide, so every Herdr session for the same user on that host can use the enabled plugin.

## Data sent to Telegram

When enabled, the plugin sends a status message to the configured `chatId` through the Telegram Bot API. Depending on what Herdr can resolve, the message can disclose:

- done or blocked state, and idle state when `notifyOnIdle` is enabled;
- workspace and pane display names;
- workspace and pane identifiers;
- the configured source label; and
- an explicit incomplete-context note when lookup failed.

This is metadata disclosure to Telegram. The plugin does not send terminal transcripts, agent responses, selected text, tool arguments, or full toast contents. Names are sanitized and bounded, but sanitization is not anonymization: treat labels and identifiers as sensitive if they identify a private project, host, or work item.

Telegram’s normal cloud Bot API is not end-to-end encrypted. A “private chat” limits the intended recipient; it does not change Telegram’s transport or cloud-storage model. Use a bot and chat whose disclosure scope you accept, and do not add this bot to groups.

## Token and configuration handling

- Keep `config.json` outside the plugin checkout in the Herdr-provided config directory.
- Keep the directory owner-only (`0700`) and the file owner-only (`0600`). The plugin requires an owner-only config file.
- Never put the bot token in a command line, shell history, browser URL, repository, issue, or log.
- Use BotFather to rotate a token immediately if it may have been exposed.
- Start the bot conversation yourself with **Start** before testing. Use the official Bot API `getUpdates` flow through a trusted local tool to obtain your own private chat ID; do not use random third-party chat-ID bots.

A disabled or missing config causes the plugin to skip metadata lookup and network access. `status` is local-only; `test` is the explicit action that sends a message.

## Failure behavior and logs

Delivery is best-effort and fail-open to the main Herdr agent. The notifier makes one send attempt and does not queue or automatically retry. Telegram timeouts, transport failures, or rejected messages must not block agent execution or rewrite Herdr state.

Operational logs may report safe failure categories such as timeout, network failure, HTTP status, or a Telegram chat-not-found condition. They must not contain the bot token, credential-bearing URLs, Telegram response bodies, transcripts, or private event payloads. A successful request means Telegram accepted the API call; it does not prove that a phone displayed the message.

## Reporting a vulnerability

Do not include bot tokens, chat IDs, private workspace or pane identifiers, hostnames, transcripts, or other sensitive data in a public issue or pull request. Check the repository hosting page for the current private disclosure channel before reporting a security problem. If a private channel is unavailable, open a short public issue requesting one without including exploit details or sensitive payloads.

When reporting, include the affected release, platform, Herdr version, and a minimal reproduction that contains synthetic identifiers and no credentials.
