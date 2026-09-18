import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// The documented path for a host that has Node but no global `meshy`: a pinned temporary
// package, run exactly as setup.md prints it. HOME, the CLI config and the npm cache are all
// isolated; the API is loopback with synthetic credentials. The npm registry is reached once
// to populate the cache — that is inherent to testing this entry point, and a failure here is
// a real failure of the documented first-run path, never something to skip past.
const setupDoc = await readFile(new URL('../skills/meshy-3d-generation/references/setup.md', import.meta.url), 'utf8');
const documented = [...setupDoc.matchAll(/```bash\n([\s\S]*?)```/g)]
  .flatMap(match => match[1].split('\n'))
  .filter(line => line.startsWith('npm exec '));
assert.equal(documented.length, 1, 'setup.md documents exactly one temporary-package invocation');
const RUNNER = documented[0].split(' ').slice(0, 5);
assert.deepEqual(RUNNER, ['npm', 'exec', '--yes', '--package=meshy-cli@0.3.0', '--'], RUNNER.join(' '));
const DOCUMENTED_ARGS = documented[0].split(' ').slice(5);
// Shared between runs so only the first execution on a machine downloads the package.
const NPM_CACHE = join(tmpdir(), 'meshy-skill-runner-npm-cache');

async function harness(t, handler) {
  const root = await mkdtemp(join(tmpdir(), 'meshy-runner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = createServer(handler);
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  t.after(() => new Promise(done => { server.close(done); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const home = join(root, 'home'), config = join(root, 'config');
  const generation = join(root, 'generation'), printing = join(root, 'printing');
  await Promise.all([home, config, generation, printing, NPM_CACHE].map(dir => mkdir(dir, { recursive: true })));
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    HOME: home, USERPROFILE: home, npm_config_cache: NPM_CACHE, npm_config_update_notifier: 'false',
    MESHY_CONFIG_DIR: config, MESHY_CREDENTIALS_PATH: join(config, 'credentials.json'),
    MESHY_BASE_URL_V1: `${origin}/openapi/v1`, MESHY_BASE_URL_V2: `${origin}/openapi/v2`,
    MESHY_CLI_NO_UPDATE_NOTIFIER: '1', MESHY_CLI_NO_BROWSER: '1', MESHY_READ_TIMEOUT_MS: '5000',
  });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  function run(args, cwd) {
    return new Promise((done, reject) => {
      const child = spawn(npm, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('npm exec exceeded 180s')); }, 180000);
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); done({ code, stdout, stderr }); });
    });
  }
  return { root, generation, printing, credentials: env.MESHY_CREDENTIALS_PATH, run };
}

test('the pinned temporary package is the CLI, forwards flags and exit codes, and shares one session across directories', async t => {
  const requests = [];
  const f = await harness(t, (req, res) => {
    requests.push({ path: req.url, auth: req.headers.authorization });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ balance: 42 }));
  });

  const version = await f.run([...RUNNER.slice(1), 'meshy', '--version'], f.generation);
  assert.equal(version.code, 0, version.stderr);
  assert.equal(version.stdout.trim(), '0.3.0', 'the temporary package is the supported CLI version');

  // Documented command, verbatim, with no credential anywhere: the CLI's own exit code survives npm.
  const missing = await f.run([...RUNNER.slice(1), ...DOCUMENTED_ARGS], f.generation);
  assert.equal(missing.code, 3, missing.stderr);
  const report = JSON.parse(missing.stdout);
  assert.equal(report.authenticated, false, 'stdout stays pure JSON through npm exec');
  assert.equal(requests.length, 0, 'no credential means no API call');

  await writeFile(f.credentials, JSON.stringify({
    auth_version: 1, active_profile: 'shared', profiles: {
      shared: { kind: 'oauth', access_token: 'synthetic-runner-token', refresh_token: 'synthetic-runner-refresh',
        expires_at: Date.now() + 3600000, login_id: 'synthetic-runner-login' },
    },
  }), { mode: 0o600 });

  for (const cwd of [f.generation, f.printing]) {
    const status = await f.run([...RUNNER.slice(1), ...DOCUMENTED_ARGS], cwd);
    assert.equal(status.code, 0, status.stderr);
    const data = JSON.parse(status.stdout);
    assert.equal(data.authenticated, true);
    assert.equal(data.verified, true);
    assert.ok(!status.stdout.includes('synthetic-runner-token'), 'no token is printed');
  }
  assert.deepEqual(requests.map(request => request.path), ['/openapi/v1/balance', '/openapi/v1/balance']);
  assert.ok(requests.every(request => request.auth === 'Bearer synthetic-runner-token'),
    'one stored session serves both skills without another login');
});
