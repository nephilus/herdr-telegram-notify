import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, chmod, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { run } from './notify.mjs';

const fakeHerdr = `#!${process.execPath}
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(process.env.FAKE_HERDR_FIXTURE, 'utf8'));
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_HERDR_CALLS, JSON.stringify(args) + '\\n');
if (fixture.fail) process.exit(7);
let result;
if (args[0] === 'workspace' && args[1] === 'list') result = { workspaces: fixture.workspaces ?? [] };
else if (args[0] === 'pane' && args[1] === 'list') result = { panes: fixture.panes ?? [] };
else if (args[0] === 'tab' && args[1] === 'list') result = { tabs: fixture.tabs ?? [] };
else process.exit(8);
process.stdout.write(JSON.stringify({ result }));
`;

const baseFixture = {
  workspaces: [{ workspace_id: 'w2', label: 'Project', number: 2, tab_count: 2 }],
  panes: [{ pane_id: 'p7', workspace_id: 'w2', tab_id: 't7', label: 'Telegram notifier', title: 'Agent terminal', terminal_title_stripped: 'shell' }],
  tabs: [{ tab_id: 't7', workspace_id: 'w2', label: 'Notifications' }],
};

function bodyOf(request) {
  return request.text;
}

function assertNoNameControls(text) {
  assert.doesNotMatch(text.replaceAll('\n', ''), /[\p{Cc}\p{Cf}]/u);
}

test('Herdr status notifications preserve privacy and diagnose delivery failures', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'herdr-telegram-test-'));
  const configPath = join(directory, 'config.json');
  const fixturePath = join(directory, 'herdr-fixture.json');
  const callsPath = join(directory, 'herdr-calls.log');
  const herdrPath = join(directory, 'fake-herdr');
  const originalFetch = globalThis.fetch;
  const requests = [];
  let reply = 'success';
  const server = createServer(async (req, res) => {
    let body = '';
    if (req.method !== 'POST' || req.url !== '/sendMessage') {
      res.writeHead(404).end();
      return;
    }
    for await (const part of req) body += part;
    requests.push(JSON.parse(body));
    if (reply === 'hang') return;
    if (reply === 'redirect') {
      res.writeHead(302, { location: 'http://127.0.0.1:1/should-not-follow' }).end();
      return;
    }
    if (reply === 'html') {
      res.writeHead(502, { 'content-type': 'text/html' }).end('SECRET upstream response');
      return;
    }
    if (reply === 'chatNotFound') {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: false, error_code: 400, description: 'Bad Request: chat not found',
      }));
      return;
    }
    res.writeHead(reply === 'rate' ? 429 : reply === 'rejected' ? 400 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply === 'success' ? { ok: true, result: { message_id: requests.length } }
      : { ok: false, description: 'SECRET RESPONSE 123:fake_token', parameters: { retry_after: 12 } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  globalThis.fetch = (url, options) => {
    assert.equal(url, 'https://api.telegram.org/bot123:fake_token/sendMessage');
    return originalFetch(`http://127.0.0.1:${server.address().port}/sendMessage`, options);
  };

  const config = { enabled: true, botToken: '123:fake_token', chatId: '12345', label: 'Lab' };
  const save = async value => {
    await writeFile(configPath, JSON.stringify(value), { mode: 0o600 });
    await chmod(configPath, 0o600);
  };
  const saveFixture = async value => writeFile(fixturePath, JSON.stringify(value), { mode: 0o600 });
  const callCount = async () => (await readFile(callsPath, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).length;
  const context = (values = {}) => JSON.stringify({
    workspace_id: 'w2', focused_pane_id: 'p7', workspace_label: 'Project',
    tab_label: 'Notifications', tab_id: 't7', ...values,
  });
  const env = {
    HERDR_PLUGIN_CONFIG_DIR: directory,
    HERDR_BIN_PATH: herdrPath,
    FAKE_HERDR_FIXTURE: fixturePath,
    FAKE_HERDR_CALLS: callsPath,
    HERDR_PLUGIN_EVENT: 'pane.agent_status_changed',
    HERDR_PLUGIN_CONTEXT_JSON: context(),
  };
  const event = (status = 'done', extra = {}, contextValues = {}) => run('event', {
    ...env,
    HERDR_PLUGIN_CONTEXT_JSON: context(contextValues),
    HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ data: {
      agent_status: status, pane_id: 'p7', workspace_id: 'w2', title: 'Event pane',
      display_agent: 'omp', selected_text: 'SECRET selection', cwd: '/private/worktree',
      agent_session: 'SECRET session', prompt: 'SECRET prompt', transcript: 'SECRET transcript', ...extra,
    } }),
  });

  try {
    await writeFile(herdrPath, fakeHerdr, { mode: 0o700 });
    await chmod(herdrPath, 0o700);
    await save(config);
    await saveFixture(baseFixture);

    await t.test('done and blocked use enriched title/body format and retain no invocation data', async () => {
      await event();
      await event('blocked');
      assert.equal(requests.length, 2);
      assert.equal(bodyOf(requests[0]), [
        'omp finished',
        'Project · 2 · Notifications',
        '',
        'Workspace: Project [w2]',
        'Pane: Telegram notifier [p7]',
        'Tab: Notifications [t7]',
        'Source: Lab',
        'Open Herdr for context.',
      ].join('\n'));
      assert.equal(bodyOf(requests[1]).split('\n')[0], 'omp needs attention');
      await event('done', { display_agent: '', agent: 'codex' });
      assert.equal(bodyOf(requests.at(-1)).split('\n')[0], 'codex finished');
      await event('done', { display_agent: '', agent: '' });
      assert.equal(bodyOf(requests.at(-1)).split('\n')[0], 'Agent finished');
      assert.equal(requests[0].chat_id, config.chatId);
      assert.equal(requests[0].parse_mode, undefined);
      assert.equal(requests[0].reply_markup, undefined);
      assert.doesNotMatch(JSON.stringify(requests), /SECRET|selected_text|agent_session|transcript|worktree/);
    });

    await t.test('non-notifying statuses and unrelated events do not publish', async () => {
      const count = requests.length;
      await event('working');
      await event('idle');
      await run('event', { ...env, HERDR_PLUGIN_EVENT: 'workspace.created' });
      assert.equal(requests.length, count);
      await assert.rejects(event('done', { pane_id: 'SECRET\nspoofed' }), /invalid Herdr event identifier/);
      await assert.rejects(run('event', { ...env, HERDR_PLUGIN_EVENT_JSON: 'SECRET bad JSON' }), error => {
        assert.doesNotMatch(error.message, /SECRET/);
        return /Invalid HERDR_PLUGIN_EVENT_JSON/.test(error.message);
      });
    });

    await t.test('pane identity and explicit label precedence never substitute the tab name', async () => {
      await saveFixture({ ...baseFixture, panes: [{ ...baseFixture.panes[0], label: 'Explicit pane', title: 'Pane title', terminal_title_stripped: 'Terminal title' }] });
      await event('done', { title: 'Event title' });
      assert.match(bodyOf(requests.at(-1)), /Pane: Explicit pane \[p7\]/);
      assert.doesNotMatch(bodyOf(requests.at(-1)), /Pane: Notifications/);

      await saveFixture({ ...baseFixture, panes: [{ ...baseFixture.panes[0], label: '', title: 'Pane title', terminal_title_stripped: 'Terminal title' }] });
      await event('done', { title: 'Event title' });
      assert.match(bodyOf(requests.at(-1)), /Pane: Event title \[p7\]/);
      await event('done', { title: '' });
      assert.match(bodyOf(requests.at(-1)), /Pane: Pane title \[p7\]/);
      await saveFixture({ ...baseFixture, panes: [{ ...baseFixture.panes[0], label: '', title: '', terminal_title_stripped: 'Terminal title' }] });
      await event('done', { title: '' });
      assert.match(bodyOf(requests.at(-1)), /Pane: Terminal title \[p7\]/);
      await saveFixture({ ...baseFixture, panes: [{ ...baseFixture.panes[0], label: '', title: '', terminal_title_stripped: '' }] });
      await event('done', { title: '' });
      assert.match(bodyOf(requests.at(-1)), /Pane: \(unnamed\) \[p7\]/);
    });

    await t.test('event pane, workspace position, and single/multi-tab context remain distinct', async () => {
      await saveFixture({
        workspaces: [{ workspace_id: 'w2', label: 'Project', number: 7, tab_count: 2 }],
        panes: [
          { pane_id: 'p7', workspace_id: 'w2', tab_id: 't7', label: 'Focused pane' },
          { pane_id: 'p8', workspace_id: 'w2', tab_id: 't8', label: 'Event pane' },
        ],
        tabs: [{ tab_id: 't7', workspace_id: 'w2', label: 'Focused tab' }, { tab_id: 't8', workspace_id: 'w2', label: 'Event tab' }],
      });
      await event('done', { pane_id: 'p8' }, { focused_pane_id: 'p7', tab_label: 'Focused tab', tab_id: 't7' });
      const text = bodyOf(requests.at(-1));
      assert.match(text, /^omp finished\nProject · 7 · Event tab\n/m);
      assert.match(text, /Workspace: Project \[w2\]/);
      assert.match(text, /Pane: Event pane \[p8\]/);
      assert.match(text, /Tab: Event tab \[t8\]/);
      assert.doesNotMatch(text, /Focused pane|Focused tab/);

      await saveFixture({
        workspaces: [{ workspace_id: 'w2', label: 'Project', number: 7, tab_count: 1 }],
        panes: [{ pane_id: 'p8', workspace_id: 'w2', tab_id: 't8', label: 'Event pane' }],
        tabs: [{ tab_id: 't8', workspace_id: 'w2', label: 'Only tab' }],
      });
      await event('done', { pane_id: 'p8' });
      const singleTab = bodyOf(requests.at(-1));
      assert.match(singleTab, /^omp finished\nProject · 7\n/m);
      assert.doesNotMatch(singleTab, /Project · 7 · Only tab/m);
    });

    await t.test('matching event context is a safe fallback when metadata CLI fails', async () => {
      await saveFixture({ fail: true });
      await event('done', {}, {
        workspace_label: 'Context project', tab_label: 'Context tab', tab_id: 'context-tab',
      });
      const text = bodyOf(requests.at(-1));
      assert.match(text, /Workspace: Context project \[w2\]/);
      assert.match(text, /Tab: Context tab \[context-tab\]/);
      assert.match(text, /Context: incomplete/);
    });

    await t.test('missing metadata still publishes with an explicit incomplete-context diagnostic', async () => {
      await event('done', {}, { workspace_label: 'Wrong workspace', focused_pane_id: 'other-pane' });
      const text = bodyOf(requests.at(-1));
      assert.match(text, /Context: incomplete; names or toast context may be unavailable\./);
      assert.match(text, /Workspace: .+ \[w2\]/);
      assert.doesNotMatch(text, /Wrong workspace/);
      assert.match(text, /Pane: Event pane \[p7\]/);
    });

    await t.test('malformed names become bounded plain text while identifiers remain intact', async () => {
      const long = ` \t  \u001b[31m${'x'.repeat(500)}\u001b[0m\u202e`;
      await saveFixture({
        workspaces: [{ workspace_id: 'workspace-long', label: long, number: 3, tab_count: 2 }],
        panes: [{ pane_id: 'pane-long', workspace_id: 'workspace-long', tab_id: 'tab-long', label: long }],
        tabs: [{ tab_id: 'tab-long', workspace_id: 'workspace-long', label: long }],
      });
      await event('done', { workspace_id: 'workspace-long', pane_id: 'pane-long', title: long }, {
        workspace_id: 'workspace-long', focused_pane_id: 'pane-long', workspace_label: long,
        tab_label: long, tab_id: 'tab-long',
      });
      const text = bodyOf(requests.at(-1));
      assert.ok(text.length < 4096);
      assertNoNameControls(text);
      assert.doesNotMatch(text.replaceAll('\n', ''), /\t| {2,}/);
      assert.match(text, /… \[truncated\]/);
      assert.match(text, /workspace-long/);
      assert.match(text, /pane-long/);
      assert.match(text, /tab-long/);
    });

    await t.test('API rejection is redacted and does not suppress a subsequent event', async () => {
      await saveFixture(baseFixture);
      reply = 'rejected';
      await assert.rejects(event(), error => {
        assert.doesNotMatch(error.message, /SECRET|fake_token/);
        return /HTTP 400/.test(error.message);
      });
      const count = requests.length;
      reply = 'success';
      await event();
      assert.equal(requests.length, count + 1);
    });

    await t.test('rate limiting reports wait time without automatic retries', async () => {
      reply = 'rate';
      const count = requests.length;
      await assert.rejects(event(), /HTTP 429.*retry after 12 seconds/);
      assert.equal(requests.length, count + 1);
      reply = 'success';
    });

    await t.test('redirects cannot forward notification data elsewhere', async () => {
      reply = 'redirect';
      await assert.rejects(event(), /delivery unknown/);
      reply = 'success';
    });

    await t.test('stalled transport terminates within the request deadline', async () => {
      reply = 'hang';
      const start = performance.now();
      await assert.rejects(event(), /\[timeout\]/);
      assert.ok(performance.now() - start < 7000, 'must not wait indefinitely');
      reply = 'success';
    });

    await t.test('destination rejection has a distinct actionable category', async () => {
      reply = 'chatNotFound';
      await assert.rejects(event(), /\[chat_not_found\]/);
      reply = 'success';
    });

    await t.test('non-JSON response preserves status without exposing its body', async () => {
      reply = 'html';
      await assert.rejects(event(), error => {
        assert.doesNotMatch(error.message, /SECRET/);
        return /\[invalid_response\].*HTTP 502/.test(error.message);
      });
      reply = 'success';
    });

    await t.test('network diagnostics expose only known safe codes', async () => {
      const localFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => { throw Object.assign(new Error('SECRET 123:fake_token'), { code: 'ENOTFOUND' }); };
        await assert.rejects(event(), /\[network:ENOTFOUND\]/);
        globalThis.fetch = async () => { throw Object.assign(new Error('SECRET'), { code: 'SECRET_TOKEN' }); };
        await assert.rejects(event(), error => {
          assert.doesNotMatch(error.message, /SECRET|fake_token/);
          return /\[network\]/.test(error.message);
        });
      } finally { globalThis.fetch = localFetch; }
    });

    await t.test('status is local; missing and disabled config skip metadata and Telegram', async () => {
      await save(config);
      await saveFixture(baseFixture);
      const before = await callCount();
      const requestCount = requests.length;
      assert.match(await run('status', env), /enabled/);
      await unlink(configPath);
      assert.match(await run('status', env), /disabled/);
      await event();
      await save({ enabled: false });
      assert.match(await run('test', env), /disabled/);
      await event();
      assert.equal(requests.length, requestCount);
      assert.equal(await callCount(), before);

      await save(config);
      await chmod(configPath, 0o644);
      await assert.rejects(event(), /owner-only JSON/);
      await chmod(configPath, 0o600);
      await save({ ...config, chatId: '-100123' });
      await assert.rejects(event(), /owner-only JSON/);
      assert.equal(requests.length, requestCount);
    });
  } finally {
    globalThis.fetch = originalFetch;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
