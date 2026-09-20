# Marketplace status

This repository is distributed directly from GitHub for the experimental `0.1.2` release. It is **not currently registered in the Herdr marketplace**.

Herdr’s marketplace indexes public GitHub repositories that carry the `herdr-plugin` topic and contain a parseable `herdr-plugin.toml` with the required manifest metadata. The index refreshes automatically about every 30 minutes and records the default-branch commit for each discovered manifest. Discovery is automatic and unreviewed; a listing is not a Herdr security or quality endorsement.

The repository deliberately does not add the `herdr-plugin` topic yet. Marketplace publication is deferred until this plugin is stable. Until then, install the tagged source directly:

```sh
herdr plugin install nephilus/herdr-telegram-notify --ref v0.1.2
```

When a future release is ready for marketplace discovery, maintainers must add the GitHub topic, keep the required manifest fields valid, and publish the manifest on the repository’s default branch. The marketplace can then discover it on a later refresh; no separate marketplace upload is needed.

For the manifest and trust model, see [Herdr’s plugin documentation](https://herdr.dev/docs/plugins/). For the marketplace’s discovery rules, see [Herdr’s marketplace documentation](https://herdr.dev/docs/marketplace/).
