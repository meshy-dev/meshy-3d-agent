import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { test } from 'node:test';

// Exercises commands extracted from shipped documentation, not handwritten recipe copies.
// CLI under test is supplied by the maintainer; no npm install or real account is used.
const cli = process.env.MESHY_CLI_BIN;
const skip = cli ? false : 'Set MESHY_CLI_BIN to a Meshy CLI 0.4.0 executable or JS entrypoint';
const doc = await readFile(new URL('../skills/meshy-3d-printing/references/printing.md', import.meta.url), 'utf8');
const lines = doc.split('\n').filter(line => line.startsWith('meshy '));
function words(line) {
  return [...line.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3]);
}
// Match on the tokenized form so quoting a path in the recipe does not change the lookup.
function recipe(prefix) {
  const line = lines.find(line => words(line).join(' ').startsWith(`meshy ${prefix}`));
  assert.ok(line, `documented command exists: ${prefix}`);
  return line;
}
const TOKENS = /PROJECT_ROOT|PROJECT_DIR|CURRENT_MODEL_URL|INPUT_IMAGE|CURRENT_RESOURCE|CURRENT_ID|SOURCE_ID|SOURCE_OBJ|TEXTURED_ID|PROTOTYPE_ID|MULTICOLOR_ID|ANALYSIS_ID|REPAIR_ID|BUILD_ID|IMAGE_ID|TEXT_ID|OBJ_PATH|OUTPUT_FILE|WORKSPACE|PRODUCT/g;
function argv(line, substitutions) {
  return words(line).slice(1).map(arg => arg.replace(TOKENS, token => {
    assert.ok(token in substitutions, `unbound documentation token: ${token}`);
    return substitutions[token];
  }));
}
const flags = ['--output-schema', 'v1', '--format', 'json', '--no-update-check'];

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'meshy-printing-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const requests = [], tasks = new Map();
  let origin;
  const obj = 'v 0 0 0\nv 1 0 0\nv 1 2 0\nv 0 2 0\nv 0 0 3\nv 1 0 3\nv 1 2 3\nv 0 2 3\nf 1 2 3 4\nf 5 8 7 6\nf 1 5 6 2\nf 4 3 7 8\nf 1 4 8 5\nf 2 6 7 3\n';
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ path: req.url, method: req.method, body, auth: req.headers.authorization });
    if (req.url.startsWith('/assets/')) {
      const bytes = req.url.endsWith('.obj') ? Buffer.from(obj) : Buffer.from(req.url.endsWith('.zip') ? 'PK\x03\x04synthetic-zip' : 'synthetic-model');
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length });
      res.end(req.method === 'HEAD' ? undefined : bytes); return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      const id = randomUUID();
      let type = req.url.includes('/text-to-3d') ? `text-to-3d-${body.mode}` : req.url.split('/').at(-1);
      const creative = /^\/openapi\/creative-lab\/([^/]+)\/v1\/(prototype|build)$/.exec(req.url);
      const models = { glb: `${origin}/assets/model.glb`, obj: `${origin}/assets/model.obj` };
      if (req.url.endsWith('/print/repair')) { type = 'print-repair'; models.glb = `${origin}/assets/repaired.glb`; }
      if (req.url.endsWith('/print/multi-color')) { type = 'print-multi-color'; Object.assign(models, { '3mf': `${origin}/assets/model.3mf` }); }
      if (creative) {
        type = `creative-lab-${creative[1]}-${creative[2]}`;
        if (creative[2] === 'build' && creative[1] === 'lamp') {
          delete models.glb; delete models.obj;
          if (body.output?.format === 'zip') models.bundle_zip = `${origin}/assets/bundle.zip`;
          else {
            models.lamp_stl = `${origin}/assets/lamp.stl`;
            if (body.options?.light_source_preset === 'bambu_mh001_60mm') models.base_stl = `${origin}/assets/base.stl`;
          }
        } else if (creative[2] === 'build' && ['keychain', 'fridge-magnet'].includes(creative[1])) {
          delete models.glb; delete models.obj;
          const fmt = body.output?.format ?? 'glb';
          models[fmt === 'zip' ? 'bundle_zip' : fmt] = `${origin}/assets/${fmt === 'obj' ? 'model.obj.zip' : `model.${fmt}`}`;
        }
      }
      tasks.set(id, { path: req.url, task: { id, type, status: 'SUCCEEDED', progress: 100, model_urls: models,
        printability: req.url.endsWith('/print/analyze') ? { status: 'healthy', watertight: true } : undefined } });
      res.end(JSON.stringify({ result: id })); return;
    }
    const id = req.url.split('/').at(-1), stored = tasks.get(id);
    if (stored && req.url === `${stored.path}/${id}`) { res.end(JSON.stringify(stored.task)); return; }
    res.statusCode = 404; res.end(JSON.stringify({ message: 'resource/id mismatch' }));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => { server.close(done); server.closeAllConnections(); }));
  origin = `http://127.0.0.1:${server.address().port}`;
  const home = join(root, 'home'), config = join(root, 'config');
  await mkdir(home); await mkdir(config);
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { HOME: home, USERPROFILE: home, MESHY_CONFIG_DIR: config,
    MESHY_CREDENTIALS_PATH: join(config, 'credentials.json'), MESHY_API_KEY: 'synthetic-printing-test-key',
    MESHY_BASE_URL_V1: `${origin}/openapi/v1`, MESHY_BASE_URL_V2: `${origin}/openapi/v2`,
    MESHY_BASE_URL_CREATIVE_LAB: `${origin}/openapi/creative-lab`,
    MESHY_CLI_NO_UPDATE_NOTIFIER: '1', MESHY_CLI_NO_BROWSER: '1', MESHY_READ_TIMEOUT_MS: '2000' });
  const bin = resolve(cli), js = ['.js', '.mjs', '.cjs'].includes(extname(bin));
  async function run(args) {
    return new Promise((done, reject) => {
      const child = spawn(js ? process.execPath : bin, [...(js ? [bin] : []), ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('CLI timed out')); }, 15000);
      child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('close', code => { clearTimeout(timer); try { done({ code, stderr, stdout, json: args.includes('--version') ? null : JSON.parse(stdout) }); } catch { reject(new Error(`non-JSON result: ${stdout} ${stderr}`)); } });
    });
  }
  async function ok(args) { const r = await run(args); assert.equal(r.code, 0, r.stdout + r.stderr); return r.json; }
  const version = await run(['--version']); assert.equal(version.stdout.trim(), '0.4.0'); assert.equal(version.code, 0);
  // The documented default job location, resolved the same way a user-named directory would be.
  const workspace = join(root, 'job output');
  await mkdir(workspace);
  const paths = { WORKSPACE: workspace, PROJECT_ROOT: join(workspace, 'meshy_output') };
  const project = await ok(argv(recipe('project init '), paths));
  const image = join(root, 'photo.png');
  await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9l8AAAAASUVORK5CYII=', 'base64'));
  const tokens = { ...paths, PROJECT_DIR: project.result.project_dir, INPUT_IMAGE: image, CURRENT_MODEL_URL: `${origin}/assets/model.glb`,
    SOURCE_ID: 'source-task', CURRENT_ID: 'repair-task', TEXT_ID: 'text-preview', IMAGE_ID: 'image-task', TEXTURED_ID: 'textured-task', PROTOTYPE_ID: 'prototype-task' };
  assert.ok(project.result.project_dir.startsWith(realpathSync(paths.PROJECT_ROOT)), 'bookkeeping stays under the resolved project root');
  return { root, workspace, requests, tasks, tokens, ok, run, obj };
}

test('printing recipes carry stable JSON flags and explicit workspace on writes', () => {
  assert.ok(lines.length > 20);
  for (const line of lines) {
    const a = words(line);
    for (const flag of flags) assert.ok(a.includes(flag), `${flag}: ${line}`);
    if (a.some(x => ['create', 'wait', 'init', 'record', 'prepare-print', '--output-dir', '--output', '--save-json'].includes(x))) {
      assert.ok(a.includes('--workspace'), line);
      assert.equal(a[a.indexOf('--workspace') + 1], 'WORKSPACE', `the workspace is resolved from the request, not hardcoded: ${line}`);
    }
    assert.ok(!line.includes('meshy_output'), `no hardcoded output root: ${line}`);
  }
  assert.match(doc, /50 MiB/);
  assert.match(doc, /base_stl.*only if listed/);
  assert.match(doc, /model\.obj\.zip/);
});

test('actual documented create commands submit the expected white/multicolor/repair and four-product payloads', { skip }, async t => {
  const f = await fixture(t);
  const creates = lines.filter(line => words(line).includes('create'));
  let count = 0;
  for (const line of creates) {
    for (const product of line.includes('PRODUCT') ? ['figure', 'lamp', 'keychain', 'fridge-magnet'] : [null]) {
      const before = f.requests.filter(r => r.method === 'POST').length;
      const result = await f.ok(argv(line, { ...f.tokens, PRODUCT: product }));
      assert.equal(result.result.submission.state, 'accepted'); assert.ok(result.result.submission.task_id);
      const posts = f.requests.filter(r => r.method === 'POST');
      assert.equal(posts.length, before + 1, 'one documented create is exactly one submission');
      const request = posts.at(-1), args = words(line);
      assert.equal(request.auth, 'Bearer synthetic-printing-test-key');
      if (args[1] === 'creative-lab') {
        const p = product ?? args[2], stage = args[3];
        assert.equal(request.path, `/openapi/creative-lab/${p}/v1/${stage}`);
        if (stage === 'prototype') assert.match(request.body.image_url, /^data:image\/png;base64,/);
        else {
          assert.equal(request.body.input_task_id, 'prototype-task');
          if (p === 'figure') { assert.equal(request.body.output, undefined); assert.equal(request.body.options, undefined); }
          if (p === 'lamp') assert.deepEqual(request.body.options, { diameter_mm: 180, light_source_preset: 'none' });
          if (p === 'keychain') assert.equal(request.body.options.size_mm, 50);
          if (p === 'fridge-magnet') assert.equal(request.body.options.size_mm, 60);
          if (p !== 'figure') assert.equal(request.body.output.format, p === 'lamp' ? 'stl' : 'obj');
        }
      } else {
        const paths = { 'text-to-3d': '/openapi/v2/text-to-3d', 'image-to-3d': '/openapi/v1/image-to-3d',
          'analyze-printability': '/openapi/v1/print/analyze', 'repair-printability': '/openapi/v1/print/repair',
          retexture: '/openapi/v1/retexture', 'multi-color-print': '/openapi/v1/print/multi-color' };
        assert.equal(request.path, paths[args[1]]);
        if (args[1] === 'image-to-3d') { assert.equal(request.body.should_texture, false); assert.deepEqual(request.body.target_formats, ['glb', 'obj']); }
        if (args[1] === 'text-to-3d') {
          assert.equal(request.body.mode, args[args.indexOf('--mode') + 1]);
          if (request.body.mode === 'preview') assert.deepEqual(request.body.target_formats, ['glb', 'obj']);
          else assert.equal(request.body.preview_task_id, 'text-preview');
        }
        if (args[1] === 'retexture') { assert.equal(request.body.model_url, f.tokens.CURRENT_MODEL_URL); assert.equal(request.body.input_task_id, undefined); }
        if (args[1] === 'multi-color-print') { assert.equal(request.body.max_colors, 4); assert.equal(request.body.max_depth, 4); assert.equal(request.body.input_task_id, 'textured-task'); }
        if (args[1].includes('printability')) assert.equal(request.body.input_task_id, 'source-task');
      }
      count++;
    }
  }
  assert.equal(count, 15, 'all current documented create variants were exercised');
});

test('Creative Lab downloads distinguish optional lamp base, bundles and relief OBJ archives', { skip }, async t => {
  const f = await fixture(t);
  for (const variant of ['lamp-none', 'lamp-base', 'lamp-zip', 'keychain', 'fridge-magnet', 'figure']) {
    const product = variant.startsWith('lamp') ? 'lamp' : variant;
    let create = argv(recipe(`creative-lab ${product} build create `), f.tokens);
    if (variant === 'lamp-base') create = create.map(x => x.replace('"none"', '"bambu_mh001_60mm"'));
    if (variant === 'lamp-zip') { create[create.indexOf('--model-format') + 1] = 'zip'; create.push('--include-result-json'); }
    const c = await f.ok(create), id = c.result.submission.task_id;
    const tokens = { ...f.tokens, PRODUCT: product, BUILD_ID: id };
    await f.ok(argv(recipe('creative-lab PRODUCT build wait '), tokens));
    const list = await f.ok(argv(recipe('download --resource creative-lab.PRODUCT.build '), tokens));
    const serialized = JSON.stringify(list);
    if (variant === 'lamp-none') assert.ok(!serialized.includes('model.base_stl'));
    if (variant === 'lamp-base') assert.ok(serialized.includes('model.base_stl'));
    let download = argv(recipe('download --resource creative-lab.lamp.build --task-id BUILD_ID --asset '), tokens);
    download[download.indexOf('--resource') + 1] = `creative-lab.${product}.build`;
    download[download.indexOf('--output-dir') + 1] = join(f.tokens.PROJECT_DIR, variant);
    const asset = variant === 'lamp-zip' ? 'model.bundle_zip' : product === 'lamp' ? 'model.lamp_stl' : 'model.obj';
    download[download.indexOf('--asset') + 1] = asset;
    if (variant === 'lamp-base') download.push('--asset', 'model.base_stl');
    const result = await f.ok(download), files = result.result.downloads.files;
    const text = JSON.stringify(files);
    if (variant === 'lamp-zip') assert.match(text, /bundle\.zip/);
    else if (product === 'lamp') { assert.match(text, /lamp\.stl/); if (variant === 'lamp-base') assert.match(text, /base\.stl/); }
    else if (product !== 'figure') assert.match(text, /model\.obj\.zip/);
    else assert.match(text, /model\.obj/);
    assert.ok(files.length >= 1);
  }
});

test('documented white-model download and prepare-print preserve source and produce requested Z-up dimensions', { skip }, async t => {
  const f = await fixture(t);
  const c = await f.ok(argv(recipe('text-to-3d create --mode preview '), f.tokens));
  const tokens = { ...f.tokens, TEXT_ID: c.result.submission.task_id, CURRENT_ID: c.result.submission.task_id, CURRENT_RESOURCE: 'text-to-3d' };
  await f.ok(argv(recipe('text-to-3d wait TEXT_ID '), tokens));
  const d = await f.ok(argv(recipe('download --resource CURRENT_RESOURCE '), tokens));
  assert.ok(d.result.downloads.files.length);
  const objPath = join(f.tokens.PROJECT_DIR, 'white-model', 'model.obj');
  const readyPath = join(f.tokens.PROJECT_DIR, 'white-model', 'ready.print.obj');
  const before = await readFile(objPath, 'utf8');
  await f.ok(argv(recipe('mesh prepare-print '), { ...tokens, SOURCE_OBJ: objPath, OUTPUT_FILE: readyPath }));
  assert.equal(await readFile(objPath, 'utf8'), before, 'source is not overwritten');
  const out = await readFile(readyPath, 'utf8');
  const vertices = out.split('\n').filter(line => line.startsWith('v ')).map(line => line.split(/\s+/).slice(1).map(Number));
  const bounds = [0, 1, 2].map(axis => [Math.min(...vertices.map(v => v[axis])), Math.max(...vertices.map(v => v[axis]))]);
  assert.deepEqual(bounds, [[-18.75, 18.75], [-56.25, 56.25], [0, 75]]);
});

test('repair lineage feeds retexture and multicolor download instead of the original mesh', { skip }, async t => {
  const f = await fixture(t);
  const analyzed = await f.ok(argv(recipe('analyze-printability create '), f.tokens));
  const report = await f.ok(argv(recipe('analyze-printability wait '), { ...f.tokens, ANALYSIS_ID: analyzed.result.submission.task_id }));
  assert.equal(report.result.task.printability.status, 'healthy');
  // Exercise repair as an explicitly chosen test branch; a healthy report does not trigger it.
  const repaired = await f.ok(argv(recipe('repair-printability create '), f.tokens));
  const repairId = repaired.result.submission.task_id;
  const rt = { ...f.tokens, REPAIR_ID: repairId, CURRENT_ID: repairId };
  const repairResult = await f.ok(argv(recipe('repair-printability wait '), rt));
  await f.ok(argv(recipe('project record --project PROJECT_DIR --task-id REPAIR_ID '), rt));
  rt.CURRENT_MODEL_URL = repairResult.result.task.model_urls.glb;
  assert.notEqual(rt.CURRENT_MODEL_URL, f.tokens.CURRENT_MODEL_URL, 'repaired artifact is distinct from the original');
  const textured = await f.ok(argv(recipe('retexture create '), rt));
  const textureId = textured.result.submission.task_id;
  const tt = { ...rt, TEXTURED_ID: textureId };
  await f.ok(argv(recipe('retexture wait '), tt));
  await f.ok(argv(recipe('project record --project PROJECT_DIR --task-id TEXTURED_ID '), tt));
  const multi = await f.ok(argv(recipe('multi-color-print create '), tt));
  const mt = { ...tt, MULTICOLOR_ID: multi.result.submission.task_id };
  await f.ok(argv(recipe('multi-color-print wait '), mt));
  const download = await f.ok(argv(recipe('download --resource multi-color-print '), mt));
  assert.match(JSON.stringify(download.result.downloads.files), /model\.3mf/);
  const metadata = JSON.parse(await readFile(join(f.tokens.PROJECT_DIR, 'metadata.json'), 'utf8'));
  const repairedEntry = metadata.tasks.find(task => task.task_id === repairId && task.stage === 'repaired');
  const texturedEntry = metadata.tasks.find(task => task.task_id === textureId && task.stage === 'textured');
  assert.equal(repairedEntry.parent_task_id, 'source-task');
  assert.equal(texturedEntry.parent_task_id, repairId);
  const retexturePost = f.requests.find(r => r.method === 'POST' && r.path.endsWith('/retexture'));
  assert.equal(retexturePost.body.model_url, repairResult.result.task.model_urls.glb);
  assert.equal(retexturePost.body.input_task_id, undefined);
  const multiPost = f.requests.find(r => r.method === 'POST' && r.path.endsWith('/print/multi-color'));
  assert.equal(multiPost.body.input_task_id, textureId);
});

// A user who already has geometry must not be pushed through authentication or a balance check.
test('the documented local-only route runs with no credential and makes no request at all', { skip }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'meshy-printing-local-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const requests = [];
  const server = createServer((req, res) => { requests.push(req.url); res.statusCode = 500; res.end('{}'); });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => { server.close(done); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const home = join(root, 'home'), config = join(root, 'config'), workspace = join(root, '我的模型');
  await Promise.all([home, config, workspace].map(dir => mkdir(dir)));
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
  // No MESHY_API_KEY and no stored profile: an authenticated command here would fail loudly.
  Object.assign(env, { HOME: home, USERPROFILE: home, MESHY_CONFIG_DIR: config,
    MESHY_CREDENTIALS_PATH: join(config, 'credentials.json'),
    MESHY_BASE_URL_V1: `${origin}/openapi/v1`, MESHY_BASE_URL_V2: `${origin}/openapi/v2`,
    MESHY_BASE_URL_CREATIVE_LAB: `${origin}/openapi/creative-lab`,
    MESHY_CLI_NO_UPDATE_NOTIFIER: '1', MESHY_CLI_NO_BROWSER: '1', MESHY_READ_TIMEOUT_MS: '2000' });
  const bin = resolve(cli), js = ['.js', '.mjs', '.cjs'].includes(extname(bin));
  const run = args => new Promise((done, reject) => {
    const child = spawn(js ? process.execPath : bin, [...(js ? [bin] : []), ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI timed out')); }, 15000);
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); done({ code, stdout, stderr }); });
  });
  const source = join(workspace, 'my cat.obj');
  await writeFile(source, 'v 0 0 0\nv 1 0 0\nv 1 2 0\nv 0 2 0\nv 0 0 3\nv 1 0 3\nv 1 2 3\nv 0 2 3\nf 1 2 3 4\nf 5 8 7 6\nf 1 5 6 2\nf 4 3 7 8\nf 1 4 8 5\nf 2 6 7 3\n');
  const ready = join(workspace, 'cat-75mm.obj');

  const detect = await run(argv(recipe('slicer detect'), {}));
  assert.equal(detect.code, 0, detect.stderr);
  assert.equal(JSON.parse(detect.stdout).ok, true, 'an empty slicer list is still a successful answer');

  const prepared = await run(argv(recipe('mesh prepare-print '), { SOURCE_OBJ: source, OUTPUT_FILE: ready, WORKSPACE: workspace }));
  assert.equal(prepared.code, 0, prepared.stdout + prepared.stderr);
  assert.equal(existsSync(ready), true, 'the prepared file lands at the path the user named');
  const vertices = (await readFile(ready, 'utf8')).split('\n').filter(line => line.startsWith('v '))
    .map(line => line.split(/\s+/).slice(1).map(Number));
  const height = Math.max(...vertices.map(v => v[2])) - Math.min(...vertices.map(v => v[2]));
  assert.equal(height, 75, 'the requested millimetre height is applied locally');
  assert.deepEqual(requests, [], 'no API call, no balance check, no login is triggered by local work');
});
