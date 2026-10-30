import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { test } from 'node:test';

// Set MESHY_CLI_BIN to a built CLI entrypoint (.js/.mjs/.cjs) or executable.
// No install, real account, browser, paid endpoint, or personal config is used.
const cli = process.env.MESHY_CLI_BIN;
const skip = cli ? false : 'Set MESHY_CLI_BIN to test the real Meshy CLI 0.7.x';

async function fixture(t, handler) {
  const root = await mkdtemp(join(tmpdir(), 'meshy-skill-auth-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = createServer(handler);
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  t.after(() => new Promise(done => {
    server.close(done);
    server.closeAllConnections();
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const config = join(root, 'config');
  const home = join(root, 'home');
  const cwdA = join(root, 'generation');
  const cwdB = join(root, 'printing');
  await Promise.all([config, home, cwdA, cwdB].map(dir => mkdir(dir)));
  // Allow only process-launch essentials; inherited Meshy secrets/overrides,
  // NODE_OPTIONS, proxies and update notifier configuration cannot leak in.
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'PATHEXT']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    HOME: home, USERPROFILE: home, MESHY_CONFIG_DIR: config,
    MESHY_CREDENTIALS_PATH: join(config, 'credentials.json'),
    MESHY_BASE_URL_V1: `${origin}/openapi/v1`,
    MESHY_BASE_URL_V2: `${origin}/openapi/v2`,
    MESHY_BASE_URL_CREATIVE_LAB: `${origin}/openapi/creative-lab`,
    MESHY_CLI_NO_UPDATE_NOTIFIER: '1', MESHY_CLI_NO_BROWSER: '1',
    MESHY_READ_TIMEOUT_MS: '2000',
  });
  const bin = resolve(cli);
  const isJs = ['.js', '.mjs', '.cjs'].includes(extname(bin));
  const execPath = isJs ? process.execPath : bin;
  const execArgs = isJs ? [bin] : [];
  function runRaw(args, cwd = cwdA, timeoutMs = 15000) {
    return new Promise((done, reject) => {
      const child = spawn(execPath, [...execArgs, ...args], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('CLI exceeded its test deadline')); }, timeoutMs);
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
      child.once('error', err => { clearTimeout(timer); reject(err); });
      child.once('close', code => { clearTimeout(timer); done({ code, stdout, stderr }); });
    });
  }
  async function run(args, cwd = cwdA) {
    const commandArgs = [...(isJs ? [bin] : []), ...args, '--format', 'json', '--no-update-check'];
    return new Promise((done, reject) => {
      const child = spawn(isJs ? process.execPath : bin, commandArgs, {
        env, cwd, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('CLI exceeded 15 seconds')); }, 15000);
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
      child.once('error', err => { clearTimeout(timer); reject(err); });
      child.once('close', code => {
        clearTimeout(timer);
        try { done({ code, data: args.includes('--version') ? stdout.trim() : JSON.parse(stdout), stderr, stdout }); }
        catch { reject(new Error(`CLI produced non-JSON output (exit ${code}): ${stderr}`)); }
      });
    });
  }
  const version = await run(['--version']);
  assert.equal(version.code, 0);
  assert.match(version.data, /^0\.7\.([1-9]\d*)$/, 'these contracts target Meshy CLI 0.7.1 or a later 0.7.x');
  async function storeOauth(expiresAt = Date.now() + 3600000) {
    await writeFile(env.MESHY_CREDENTIALS_PATH, JSON.stringify({
      auth_version: 1, active_profile: 'shared', profiles: {
        shared: { kind: 'oauth', access_token: 'synthetic-access-token',
          refresh_token: 'synthetic-refresh-token', expires_at: expiresAt,
          login_id: 'synthetic-login' },
      },
    }), { mode: 0o600 });
  }
  return {
    root, cwdA, cwdB, run, runRaw, storeOauth, env, execPath, execArgs,
    readStore: async () => JSON.parse(await readFile(env.MESHY_CREDENTIALS_PATH, 'utf8')),
  };
}

function balance(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ balance: 42 }));
}

test('an existing OAuth profile is reused across generation and printing working directories', { skip }, async t => {
  const requests = [];
  const f = await fixture(t, (req, res) => {
    requests.push({ path: req.url, auth: req.headers.authorization });
    balance(res);
  });
  await f.storeOauth();
  for (const cwd of [f.cwdA, f.cwdB]) {
    const output = await f.run(['auth', 'status'], cwd);
    assert.equal(output.code, 0);
    assert.equal(output.data.schema_version, 'meshy.cli/v1', 'auth status prints the same envelope as every command');
    assert.equal(output.data.command, 'auth.status');
    assert.equal(output.data.ok, true);
    assert.equal(output.data.result.authenticated, true);
    assert.equal(output.data.result.verified, true);
    assert.equal(output.data.result.source, 'file');
    assert.equal(output.data.result.profile, 'shared');
    assert.ok(!output.stdout.includes('synthetic-access-token'));
    assert.ok(!output.stdout.includes('synthetic-refresh-token'));
  }
  assert.deepEqual(requests, [0, 1].map(() => ({
    path: '/openapi/v1/balance', auth: 'Bearer synthetic-access-token',
  })), 'only balance checks occur; no additional authorization or refresh');
});

test('status distinguishes absent credentials from a failed network verification despite shared exit 3', { skip }, async t => {
  let requests = 0;
  const f = await fixture(t, (req) => { requests++; req.socket.destroy(); });
  const missing = await f.run(['auth', 'status']);
  assert.equal(missing.code, 3);
  assert.equal(missing.data.ok, true, 'ok says the command ran; the answer is in result and the exit code');
  assert.equal(missing.data.result.authenticated, false);
  assert.equal(requests, 0);
  await f.storeOauth();
  const disconnected = await f.run(['auth', 'status']);
  assert.equal(disconnected.code, 3);
  assert.equal(disconnected.data.ok, true);
  assert.equal(disconnected.data.result.authenticated, true);
  assert.equal(disconnected.data.result.verified, false);
  assert.match(disconnected.data.result.hint, /network|connectivity/i);
  assert.ok(requests > 0);
});

test('expired OAuth refreshes once and another working directory reuses the rotated session', { skip }, async t => {
  const requests = [];
  const refreshBodies = [];
  const f = await fixture(t, (req, res) => {
    requests.push({ method: req.method, path: req.url, auth: req.headers.authorization });
    if (req.method === 'POST' && req.url === '/openapi/v1/oauth/token') {
      let body = '';
      req.setEncoding('utf8').on('data', chunk => { body += chunk; });
      req.on('end', () => {
        refreshBodies.push(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          access_token: 'synthetic-rotated-access', refresh_token: 'synthetic-rotated-refresh',
          token_type: 'Bearer', expires_in: 3600,
        }));
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/openapi/v1/balance') {
      balance(res);
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });
  await f.storeOauth(Date.now() - 1000);
  const startedAt = Date.now();
  const first = await f.run(['auth', 'status'], f.cwdA);
  assert.equal(first.code, 0);
  assert.equal(first.data.result.verified, true);
  const stored = await f.readStore();
  assert.equal(stored.active_profile, 'shared');
  assert.equal(stored.profiles.shared.access_token, 'synthetic-rotated-access');
  assert.equal(stored.profiles.shared.refresh_token, 'synthetic-rotated-refresh');
  assert.equal(stored.profiles.shared.login_id, 'synthetic-login');
  assert.ok(stored.profiles.shared.expires_at > startedAt + 3500000);

  const second = await f.run(['balance'], f.cwdB);
  assert.equal(second.code, 0);
  assert.equal(second.data.ok, true);
  assert.equal(second.data.result.balance, 42);
  assert.deepEqual(refreshBodies, [{
    grant_type: 'refresh_token', refresh_token: 'synthetic-refresh-token', client_id: 'meshy-cli',
  }]);
  assert.deepEqual(requests, [
    { method: 'POST', path: '/openapi/v1/oauth/token', auth: undefined },
    ...[0, 1].map(() => ({
      method: 'GET', path: '/openapi/v1/balance', auth: 'Bearer synthetic-rotated-access',
    })),
  ], 'one refresh and two reads; no new authorization flow');
  for (const output of [first, second]) {
    for (const secret of ['synthetic-refresh-token', 'synthetic-rotated-access', 'synthetic-rotated-refresh']) {
      assert.ok(!`${output.stdout}${output.stderr}`.includes(secret), 'full tokens stay out of CLI output');
    }
  }
});

test('explicit key-file uses balance verification without requiring a stored profile', { skip }, async t => {
  const requests = [];
  const f = await fixture(t, (req, res) => {
    requests.push({ path: req.url, auth: req.headers.authorization });
    balance(res);
  });
  const keyFile = join(f.root, 'project.env');
  await writeFile(keyFile, 'MESHY_API_KEY=msy_synthetic_key_file\n', { mode: 0o600 });
  const output = await f.run(['balance', '--api-key-file', keyFile]);
  assert.equal(output.code, 0);
  assert.equal(output.data.ok, true);
  assert.equal(output.data.result.balance, 42);
  assert.deepEqual(requests, [{ path: '/openapi/v1/balance', auth: 'Bearer msy_synthetic_key_file' }]);
  assert.ok(!output.stdout.includes('msy_synthetic_key_file'));
});

// CLI-level contract only: delayed synthetic approval completes the original process.
// This does NOT prove an agent keeps its turn alive; that needs a host behavioral check.
test('device login publishes the verification URL and code before it exits, then stores a verified session', { skip }, async t => {
  const DEVICE_CODE = 'synthetic-device-code-never-shown';
  let approved = false;
  let codeDisplayed = false;
  let pendingResponses = 0;
  const requests = [];
  const f = await fixture(t, (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/openapi/v1/oauth/device_authorization') {
      return reply(200, {
        device_code: DEVICE_CODE, user_code: 'WXYZ-1234',
        verification_uri: 'https://www.meshy.ai/device',
        verification_uri_complete: 'https://www.meshy.ai/device?user_code=WXYZ-1234',
        expires_in: 300, interval: 1,
      });
    }
    if (req.url === '/openapi/v1/oauth/token') {
      // Approval only happens once the test has seen the code on stderr: if the CLI buffered
      // that line until exit, this flow could never complete and the test would fail.
      if (!approved) {
        assert.equal(codeDisplayed, true, 'the user can see the instruction during the pending period');
        pendingResponses++;
        if (pendingResponses === 2) approved = true; // browser approval after multiple waits
        return reply(400, { error: 'authorization_pending' });
      }
      return reply(200, {
        access_token: 'synthetic-device-access', refresh_token: 'synthetic-device-refresh',
        token_type: 'Bearer', expires_in: 3600, user_id: 'synthetic-user',
      });
    }
    if (req.url === '/openapi/v1/balance') return balance(res);
    reply(404, {});
  });

  const login = await new Promise((done, reject) => {
    const child = spawn(f.execPath, [...f.execArgs, 'auth', 'login', '--device', '--format', 'json', '--no-update-check'],
      { env: f.env, cwd: f.cwdA, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', codeSeenWhileRunning = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('device login did not publish a code in time')); }, 20000);
    child.stderr.setEncoding('utf8').on('data', chunk => {
      stderr += chunk;
      if (!codeSeenWhileRunning && /Enter code \S+ at https?:\/\/\S+/.test(stderr)) {
        codeSeenWhileRunning = true;   // the user could act on it now, not after the process ends
        codeDisplayed = true;        // showing the link must not complete the login
      }
    });
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); done({ code, stdout, stderr, codeSeenWhileRunning }); });
  });

  assert.equal(pendingResponses, 2, 'the same process survives multiple pending responses');
  assert.equal(requests.filter(r => r.endsWith('/oauth/device_authorization')).length, 1);
  assert.equal(login.codeSeenWhileRunning, true, 'the code is readable before the login process exits');
  assert.equal(login.code, 0, login.stderr);
  const match = /Enter code (\S+) at (https?:\/\/\S+)/.exec(login.stderr);
  assert.equal(match[1], 'WXYZ-1234', 'the user code is shown verbatim');
  assert.equal(match[2], 'https://www.meshy.ai/device', 'the verification URL is shown verbatim');
  const envelope = JSON.parse(login.stdout);
  assert.equal(envelope.schema_version, 'meshy.cli/v1');
  assert.equal(envelope.command, 'auth.login');
  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.status, 'logged_in');
  assert.equal(envelope.result.verified, true);
  for (const secret of [DEVICE_CODE, 'synthetic-device-access', 'synthetic-device-refresh']) {
    assert.ok(!`${login.stdout}${login.stderr}`.includes(secret), 'no bearer secret is printed to the user');
  }

  // The original request can now continue, in the other skill's working directory, with no new flow.
  const before = requests.length;
  const status = await f.run(['auth', 'status'], f.cwdB);
  assert.equal(status.code, 0);
  assert.equal(status.data.result.verified, true);
  assert.equal(status.data.result.source, 'file');
  assert.deepEqual(requests.slice(before), ['GET /openapi/v1/balance'], 'no second authorization is started');
});

// A denied or expired code is recoverable by asking for a new one, and never by spending money.
test('a denied device code fails without clearing the flow or touching a paid endpoint', { skip }, async t => {
  const requests = [];
  const f = await fixture(t, (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.writeHead(req.url.endsWith('/token') ? 400 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url.endsWith('/token') ? { error: 'access_denied' } : {
      device_code: 'synthetic-denied-code', user_code: 'DENY-0000',
      verification_uri: 'https://www.meshy.ai/device', expires_in: 300, interval: 1,
    }));
  });
  const login = await f.runRaw(['auth', 'login', '--device', '--format', 'json', '--no-update-check']);
  assert.notEqual(login.code, 0, 'a denied approval is an error the agent must report');
  assert.match(login.stderr, /Enter code DENY-0000 at https:\/\/www\.meshy\.ai\/device/);
  const envelope = JSON.parse(login.stdout);
  assert.equal(envelope.ok, false, 'the failure is an envelope on stdout, not bare text');
  assert.equal(envelope.command, 'auth.login');
  assert.equal(envelope.error.details.oauth_error, 'access_denied', 'the OAuth reason is machine-readable');
  assert.deepEqual(requests, ['POST /openapi/v1/oauth/device_authorization', 'POST /openapi/v1/oauth/token']);
});

// The skills used to pass --output-schema v1 and to keep a `meshy project` folder. Both were removed
// (0.5.0 and 0.7.0), so a stale recipe must fail loudly with exit 2 instead of being ignored.
test('the removed --output-schema, --project, --stage and `meshy project` are usage errors, not silent no-ops', { skip }, async t => {
  const requests = [];
  const f = await fixture(t, (req, res) => { requests.push(req.url); balance(res); });
  const stale = [
    [['balance', '--output-schema', 'v1'], /unknown option '--output-schema'/],
    [['text-to-3d', 'wait', 'task', '--project', 'dir'], /unknown option '--project'/],
    [['text-to-3d', 'wait', 'task', '--stage', 'preview'], /unknown option '--stage'/],
    [['download', '--resource', 'text-to-3d', '--task-id', 'task', '--project', 'dir'], /unknown option '--project'/],
    [['project', 'init'], /unknown command 'project'/],
  ];
  for (const [args, message] of stale) {
    const result = await f.runRaw([...args, '--format', 'json', '--no-update-check']);
    assert.equal(result.code, 2, args.join(' '));
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'usage');
    assert.match(envelope.error.message, message);
  }
  assert.deepEqual(requests, [], 'nothing is sent for a rejected command line');
});

// setup.md section 7: a user on the China site signs in with `--region cn`; the region sticks to the profile.
test('the documented China-site login works through the device flow, and the region is remembered for later commands', { skip }, async t => {
  const setup = await readFile(new URL('../skills/meshy-3d-generation/references/setup.md', import.meta.url), 'utf8');
  const documented = [...setup.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap(match => match[1].split('\n')).filter(line => line.includes('--region cn'));
  assert.equal(documented.length, 1, 'setup.md documents exactly one China-site login');
  const requests = [];
  const f = await fixture(t, (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url === '/openapi/v1/oauth/device_authorization') {
      return reply(200, { device_code: 'synthetic-cn-device', user_code: 'CNCN-1234', verification_uri: 'https://meshy.cn/device', expires_in: 300, interval: 1 });
    }
    if (req.url === '/openapi/v1/oauth/token') {
      return reply(200, { access_token: 'synthetic-cn-access', refresh_token: 'synthetic-cn-refresh', token_type: 'Bearer', expires_in: 3600 });
    }
    if (req.url === '/openapi/v1/balance') return balance(res);
    reply(404, {});
  });
  const args = documented[0].split(' ').slice(1);
  assert.deepEqual(args.slice(0, 4), ['auth', 'login', '--device', '--region']);
  const login = await f.runRaw(args);
  assert.equal(login.code, 0, login.stderr);
  assert.match(login.stderr, /Enter code CNCN-1234 at https:\/\/meshy\.cn\/device/);
  const envelope = JSON.parse(login.stdout);
  assert.equal(envelope.result.status, 'logged_in');
  assert.equal(envelope.result.verified, true);

  // With no explicit base URL (nothing here talks to the network) the region picks the hosts.
  const bare = { ...f.env };
  for (const key of Object.keys(bare)) if (key.startsWith('MESHY_BASE_URL')) delete bare[key];
  const local = (extra, args2) => new Promise((done, reject) => {
    const child = spawn(f.execPath, [...f.execArgs, ...args2, '--format', 'json', '--no-update-check'], { env: { ...bare, ...extra }, cwd: f.cwdA, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => { try { done({ code, data: JSON.parse(stdout), stderr }); } catch { reject(new Error(`non-JSON (exit ${code}): ${stdout} ${stderr}`)); } });
  });
  const origins = async extra => (await local(extra, ['doctor'])).data.result.checks.find(check => check.id === 'base_urls').detail;
  assert.match(await origins({}), /api\.meshy\.ai/, 'global is the default');

  const stored = await local({}, ['auth', 'login', '--with-key', 'msy_synthetic_region_key', '--no-verify', '--region', 'cn']);
  assert.equal(stored.code, 0, stored.stderr);
  assert.equal((await f.readStore()).profiles.default.region, 'cn', 'the region is stored on the profile');
  assert.match(await origins({}), /v1 https:\/\/api\.meshy\.cn\/openapi\/v1/, 'later commands call the China host with no flag');
  await local({}, ['auth', 'login', '--with-key', 'msy_synthetic_region_key', '--no-verify', '--region', 'global']);
  assert.match(await origins({}), /api\.meshy\.ai/, '--region global switches back');
  assert.match(await origins({ MESHY_REGION: 'cn' }), /api\.meshy\.cn/, 'MESHY_REGION=cn is the API-key session variant');
  assert.ok(requests.every(request => request.includes('/openapi/v1/')), 'the loopback served only the device flow and the balance check');
});
