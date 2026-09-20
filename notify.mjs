import { open } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify, stripVTControlCharacters } from 'node:util';

const execute = promisify(execFile);

const DEADLINE_MS = 5000;
const NETWORK_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'ENETUNREACH', 'EHOSTUNREACH', 'ConnectionRefused', 'ConnectionClosed',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// Herdr owns the config directory; credentials never live in the plugin checkout.
async function configuration(directory = process.env.HERDR_PLUGIN_CONFIG_DIR) {
  if (!directory || !isAbsolute(directory)) throw new Error('HERDR_PLUGIN_CONFIG_DIR must be an absolute path');
  const path = join(directory, 'config.json');
  let file;
  try {
    file = await open(path, 'r');
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 8192 || (stat.mode & 0o077) !== 0 ||
        (process.getuid && stat.uid !== process.getuid())) {
      throw new Error('unsafe config');
    }
    const config = JSON.parse(await file.readFile('utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config) ||
        Object.keys(config).some(key => !['enabled', 'botToken', 'chatId', 'label'].includes(key)) ||
        typeof config.enabled !== 'boolean') throw new Error('invalid config');
    if (!config.enabled) return null;
    if (typeof config.botToken !== 'string' || !/^\d+:[A-Za-z0-9_-]+$/.test(config.botToken) ||
        typeof config.chatId !== 'string' || !/^[1-9]\d*$/.test(config.chatId) ||
        typeof config.label !== 'string' || !config.label.trim() || config.label.length > 100 ||
        /[\p{Cc}\p{Cf}]/u.test(config.label)) throw new Error('invalid config');
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    // Never propagate JSON, filesystem, or transport diagnostics containing secrets.
    throw new Error('Cannot load Telegram config: require owner-only JSON with enabled, botToken, positive private chatId, and label');
  } finally {
    await file?.close();
  }
}

async function publish(config, text, signal) {
  const deadline = AbortSignal.timeout(DEADLINE_MS);
  let response;
  let body;
  try {
    response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text, link_preview_options: { is_disabled: true } }),
    });
    body = await response.json();
  } catch (error) {
    const code = NETWORK_CODES.has(error?.code) ? error.code
      : NETWORK_CODES.has(error?.cause?.code) ? error.cause.code : null;
    const detail = deadline.aborted ? '[timeout] exceeded the five-second deadline'
      : signal?.aborted ? '[cancelled] notification cancelled'
      : response && error?.name === 'SyntaxError' ? `[invalid_response] non-JSON response (HTTP ${response.status})`
      : `[network${code ? `:${code}` : ''}] request or response-body read failed`;
    throw new Error(`Telegram ${detail}; delivery unknown, no automatic retry`);
  }
  if (!response.ok || body?.ok !== true || !Number.isSafeInteger(body.result?.message_id)) {
    // Telegram descriptions and fetch exceptions can contain credential-bearing URLs.
    const retry = response.status === 429 && Number.isSafeInteger(body?.parameters?.retry_after)
      ? `; retry after ${Math.max(0, body.parameters.retry_after)} seconds` : '';
    if (body?.description === 'Bad Request: chat not found') {
      throw new Error('Telegram [chat_not_found]: open the bot conversation and press Start, then verify chatId; message rejected, no automatic retry');
    }
    throw new Error(`Telegram rejected notification (HTTP ${response.status})${retry}; no automatic retry`);
  }
}

function identifier(value) {
  const text = String(value ?? '');
  if (!/^[A-Za-z0-9:_-]{1,80}$/.test(text)) throw new Error('Missing or invalid Herdr event identifier');
  return text;
}

// Treat names as display data, never markup or additional message lines.
function name(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const clean = stripVTControlCharacters(value)
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (!clean) return fallback;
  if (clean.length <= 320) return clean;
  return `${clean.slice(0, 306).replace(/[\uD800-\uDBFF]$/u, '')}… [truncated]`;
}

async function query(env, args, field) {
  try {
    const { stdout } = await execute(env.HERDR_BIN_PATH || 'herdr', args, {
      env, encoding: 'utf8', timeout: 1000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
    });
    const result = JSON.parse(stdout)?.result?.[field];
    return Array.isArray(result) ? result : null;
  } catch {
    // A pane can disappear before its event hook runs. Preserve the alert,
    // but never forward CLI stderr, paths, or raw metadata as diagnostics.
    return null;
  }
}

async function notification(data, env) {
  const workspaceId = identifier(data.workspace_id);
  const paneId = identifier(data.pane_id);
  let context;
  try { context = JSON.parse(env.HERDR_PLUGIN_CONTEXT_JSON ?? '{}'); } catch {}
  if (context?.workspace_id !== workspaceId || context?.focused_pane_id !== paneId) context = {};

  const [workspaces, panes, tabs] = await Promise.all([
    query(env, ['workspace', 'list'], 'workspaces'),
    query(env, ['pane', 'list', '--workspace', workspaceId], 'panes'),
    query(env, ['tab', 'list', '--workspace', workspaceId], 'tabs'),
  ]);
  const workspace = workspaces?.find(item => item?.workspace_id === workspaceId);
  const pane = panes?.find(item => item?.pane_id === paneId && item?.workspace_id === workspaceId);
  const candidateTab = pane?.tab_id ?? context?.tab_id;
  const tabId = typeof candidateTab === 'string' && /^[A-Za-z0-9:_-]{1,80}$/.test(candidateTab)
    ? candidateTab : undefined;
  const tab = tabs?.find(item => item?.tab_id === tabId && item?.workspace_id === workspaceId);
  const workspaceName = name(context?.workspace_label) || name(workspace?.label, '(unknown)');
  const tabName = name(context?.tab_id === tabId ? context?.tab_label : undefined) || name(tab?.label);
  const paneName = name(pane?.label) || name(data.title) || name(pane?.title)
    || name(pane?.terminal_title_stripped, '(unnamed)');
  const agentName = name(data.display_agent) || name(data.agent, 'Agent');
  const title = `${agentName} ${data.agent_status === 'done' ? 'finished' : 'needs attention'}`;
  let body = workspaceName;
  const positionKnown = Number.isSafeInteger(workspace?.number) && workspace.number > 0;
  if (positionKnown) body += ` · ${workspace.number}`;
  if (workspace?.tab_count > 1 && tabName) body += ` · ${tabName}`;

  const lines = [
    title, body, '',
    `Workspace: ${workspaceName} [${workspaceId}]`,
    `Pane: ${paneName} [${paneId}]`,
  ];
  if (tabId) lines.push(`Tab: ${tabName || '(unnamed)'} [${tabId}]`);
  if (!workspace || !pane || !tab || !positionKnown || workspaceName === '(unknown)' || paneName === '(unnamed)') {
    lines.push('Context: incomplete; names or toast context may be unavailable.');
  }
  return lines.join('\n');
}

export async function run(action, env = process.env) {
  if (!['event', 'status', 'test'].includes(action)) throw new Error('Usage: notify.mjs event | status | test');
  let data;
  if (action === 'event') {
    if (env.HERDR_PLUGIN_EVENT !== 'pane.agent_status_changed') return 'Ignored unrelated event';
    let event;
    try { event = JSON.parse(env.HERDR_PLUGIN_EVENT_JSON ?? ''); }
    catch { throw new Error('Invalid HERDR_PLUGIN_EVENT_JSON'); }
    data = event?.data;
    // Herdr already emits transitions. Do not suppress legitimate rapid changes
    // with a cooldown or create a second cross-process state/locking system.
    if (!['done', 'blocked'].includes(data?.agent_status)) return 'Ignored non-notifying status';
    identifier(data.pane_id);
    identifier(data.workspace_id);
  }
  const config = await configuration(env.HERDR_PLUGIN_CONFIG_DIR);
  if (!config) return 'Telegram notifications disabled or not configured';
  if (action === 'status') return 'Telegram notifications enabled (send-only; private chat; done/blocked; all Herdr sessions)';
  const text = action === 'event' ? await notification(data, env) : 'Herdr: Test notification';
  await publish(config, `${text}\nSource: ${config.label}\nOpen Herdr for context.`);
  return 'Telegram accepted notification (phone delivery not confirmed)';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(await run(process.argv[2])); }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
