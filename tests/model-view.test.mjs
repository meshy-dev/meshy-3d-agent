import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Runs the view script exactly as delivery.md ships it, against a throwaway WORKSPACE.
// Needs no CLI, no network and no browser.
const doc = readFileSync(new URL('../skills/meshy-3d-generation/references/delivery.md', import.meta.url), 'utf8');
const scripts = [...doc.matchAll(/```js\n([\s\S]*?)```/g)].map(match => match[1]).filter(code => code.startsWith('// view.mjs'));
assert.equal(scripts.length, 1, 'delivery.md must carry exactly one view.mjs script');
// Cursor left the side panel blank when browser_navigate reused a tab; a new tab rendered.
assert.match(doc, /`browser_navigate` with both `newTab: true` and\s+`position: "side"`/, 'delivery.md must name both browser_navigate options');

function get(port, path, { method = 'GET', host = `127.0.0.1:${port}` } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { host } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('view.mjs serves the page and models on 127.0.0.1 only, and nothing else from WORKSPACE', async t => {
  const base = await mkdtemp(join(tmpdir(), 'meshy-view-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const workspace = join(base, 'workspace');
  const jobDir = join(workspace, 'chest');
  const outside = join(base, 'outside');
  await mkdir(jobDir, { recursive: true });
  await mkdir(outside);
  const model = Buffer.from('glTF fake model bytes');
  await writeFile(join(jobDir, 'chest.glb'), model);
  await writeFile(join(jobDir, 'chest_meta.json'), '{"model_urls":{"glb":"https://signed.example/secret"}}');
  await writeFile(join(jobDir, 'notes.txt'), 'not a model');
  await writeFile(join(outside, 'other.glb'), 'outside the workspace');
  await symlink(join(outside, 'other.glb'), join(jobDir, 'link.glb'));
  await writeFile(join(jobDir, 'view.mjs'), scripts[0]);

  const child = spawn(process.execPath, [join(jobDir, 'view.mjs'), workspace], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => child.kill());
  const url = await new Promise((resolve, reject) => {
    child.stdout.once('data', data => resolve(String(data).trim()));
    child.once('exit', code => reject(new Error(`view.mjs exited early with ${code}`)));
  });
  const match = url.match(/^http:\/\/127\.0\.0\.1:(\d+)\/$/);
  assert.ok(match, `unexpected URL: ${url}`);
  const port = Number(match[1]);

  const page = await get(port, '/?src=/chest/chest.glb');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /^text\/html/);
  assert.match(String(page.body), /model-viewer@4\.4\.0\/dist\/model-viewer\.min\.js"\s+integrity="sha384-/);

  const glb = await get(port, '/chest/chest.glb');
  assert.equal(glb.status, 200);
  assert.equal(glb.headers['content-type'], 'model/gltf-binary');
  assert.deepEqual(glb.body, model);
  const head = await get(port, '/chest/chest.glb', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-length'], String(model.length));
  assert.equal(head.body.length, 0);

  for (const path of ['/chest/chest_meta.json', '/chest/notes.txt', '/chest/view.mjs', '/chest/link.glb',
    '/../outside/other.glb', '/%2e%2e/outside/other.glb', '/chest/missing.glb', '/%E0%A4%A']) {
    assert.equal((await get(port, path)).status, 404, path);
  }
  assert.equal((await get(port, '/chest/chest.glb', { method: 'POST' })).status, 404, 'POST');
  assert.equal((await get(port, '/chest/chest.glb', { host: `attacker.example:${port}` })).status, 404, 'foreign Host header');
  assert.equal((await get(port, '/chest/chest.glb', { host: `localhost:${port}` })).status, 200, 'localhost Host header');
});
