import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { test } from 'node:test';

// Run with MESHY_CLI_BIN=/absolute/path/to/meshy-or-dist/index.js node --test tests/generation-recipes.test.mjs
// No install or production requests. The command text comes from the shipped recipe.
const cli = process.env.MESHY_CLI_BIN;
const skip = cli ? false : 'Set MESHY_CLI_BIN to the Meshy CLI 0.3.0 executable or JS entrypoint';
const markdown = readFileSync(new URL('../skills/meshy-3d-generation/references/pipelines.md', import.meta.url), 'utf8');
const deliveryDoc = readFileSync(new URL('../skills/meshy-3d-generation/references/delivery.md', import.meta.url), 'utf8');
const shellLines = doc => [...doc.matchAll(/```bash\n([\s\S]*?)```/g)]
  .flatMap(match => match[1].split('\n')).filter(line => line.startsWith('meshy '));
const commands = shellLines(markdown);
const deliveryCommands = shellLines(deliveryDoc);

// Deliberately a restricted argv tokenizer, not shell eval. Fail when recipes acquire
// operators/substitution or multiline shell programs instead of silently skipping them.
function argv(line, replacements = {}) {
  assert.ok(!/[`$;|&<>\\]/.test(line), `recipe needs an explicit tokenizer update: ${line}`);
  const tokens = line.match(/"[^"\n]*"|'[^'\n]*'|[^\s"']+/g) ?? [];
  assert.equal(tokens.join(' '), line, `unsupported shell syntax: ${line}`);
  assert.equal(tokens.shift(), 'meshy');
  return tokens.map(token => {
    const unquoted = token.replace(/^(["'])(.*)\1$/, '$2');
    return unquoted.replace(/[A-Z][A-Z_]+/g, key => replacements[key] ?? key);
  });
}
function pick(lines, predicate, what) {
  const found = lines.filter(predicate);
  assert.equal(found.length, 1, `expected one matching documented ${what}`);
  return found[0];
}
const recipe = predicate => pick(commands, predicate, 'pipeline recipe');
const delivered = predicate => pick(deliveryCommands, predicate, 'delivery recipe');
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}
// A structurally valid minimal GLB: the CLI refuses anything that is not really glTF.
function glb() {
  const chunkJson = Buffer.from('{"asset":{"version":"2.0"}}'.padEnd(28, ' '), 'utf8');
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + chunkJson.length, 8);
  const chunk = Buffer.alloc(8);
  chunk.writeUInt32LE(chunkJson.length, 0);
  chunk.write('JSON', 4, 'ascii');
  return Buffer.concat([header, chunk, chunkJson]);
}
const task = (id, status = 'SUCCEEDED') => ({ id, status, type: 'text-to-3d-preview', progress: status === 'SUCCEEDED' ? 100 : 40, face_count: 1000 });

async function fixture(t, respond) {
  const root = await mkdtemp(join(tmpdir(), 'meshy-generation-recipes-'));
  const home = join(root, 'private-home');
  const config = join(root, 'private-config');
  const cwd = join(root, 'working directory');
  await Promise.all([home, config, cwd].map(path => mkdir(path)));
  // The default job location; a user-named path is exercised by its own test below.
  const workspace = join(cwd, 'meshy_output');
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
      let text = '';
      for await (const chunk of req) text += chunk;
      const request = { method: req.method, path: req.url, payload: text ? JSON.parse(text) : null };
      requests.push(request);
      respond(request, res, requests.length);
    } catch (error) {
      json(res, 500, { message: String(error) });
    }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  t.after(async () => {
    await new Promise(done => { server.close(done); server.closeAllConnections(); });
    await rm(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Allowlist launch essentials; no real credentials, proxies, NODE_OPTIONS or personal config.
  const env = {};
  for (const name of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'PATHEXT']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  Object.assign(env, {
    HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config'),
    MESHY_CONFIG_DIR: config, MESHY_CREDENTIALS_PATH: join(config, 'credentials.json'),
    MESHY_API_KEY: 'synthetic-generation-test-key',
    MESHY_BASE_URL_V1: `${origin}/openapi/v1`, MESHY_BASE_URL_V2: `${origin}/openapi/v2`,
    MESHY_BASE_URL_CREATIVE_LAB: `${origin}/openapi/creative-lab`,
    MESHY_CLI_NO_UPDATE_NOTIFIER: '1', MESHY_CLI_NO_BROWSER: '1', MESHY_READ_TIMEOUT_MS: '2000',
  });
  const bin = resolve(cli);
  const isJs = ['.js', '.mjs', '.cjs'].includes(extname(bin));
  async function run(args) {
    return new Promise((done, reject) => {
      const child = spawn(isJs ? process.execPath : bin, [...(isJs ? [bin] : []), ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`CLI exceeded 15s: ${args.join(' ')}`)); }, 15000);
      child.stdout.setEncoding('utf8').on('data', data => { stdout += data; });
      child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('close', code => { clearTimeout(timeout); done({ code, stdout, stderr }); });
    });
  }
  const version = await run(['--version']);
  assert.equal(version.code, 0, version.stderr);
  assert.equal(version.stdout.trim(), '0.3.0', 'these recipes require the exact supported CLI version');
  const image = join(cwd, 'reference photo.png');
  const png = Buffer.from('89504e470d0a1a0a0000000000000000', 'hex');
  await writeFile(image, png);
  const replacements = {
    PHOTO_PATH: image, IMAGE_PATH: image, FRONT_PATH: image, SIDE_PATH: image, BACK_PATH: image,
    RESOURCE: 'text-to-3d', ACTION_ID: '1', TASK_ID: 'source', SOURCE_ID: 'source', STAGE: 'preview',
    WORKSPACE: workspace, PROJECT_ROOT: workspace,
  };
  // The documented workspace/project-root pair for a location the user named themselves.
  async function userLocation(directory, fileName) {
    const ws = join(cwd, directory);
    await mkdir(ws, { recursive: true });
    return { WORKSPACE: ws, PROJECT_ROOT: join(ws, 'meshy_output'), OUTPUT_FILE: join(ws, fileName) };
  }
  async function project(taskId = 'source', overrides = {}) {
    const bound = { ...replacements, ...overrides, TASK_ID: taskId };
    const result = await run(argv(recipe(line => line.startsWith('meshy project init ')), bound));
    assert.equal(result.code, 0, result.stdout + result.stderr);
    const projectDir = JSON.parse(result.stdout).result.project_dir;
    assert.ok(projectDir.startsWith(realpathSync(bound.PROJECT_ROOT)), projectDir);
    return projectDir;
  }
  return { root, cwd, workspace, origin, requests, replacements, run, project, userLocation, png, imageUri: `data:image/png;base64,${png.toString('base64')}` };
}
function output(result, expectedCode = 0) {
  assert.equal(result.code, expectedCode, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}

const routes = {
  'text-to-3d': '/openapi/v2/text-to-3d', 'image-to-3d': '/openapi/v1/image-to-3d',
  'multi-image-to-3d': '/openapi/v1/multi-image-to-3d', retexture: '/openapi/v1/retexture',
  remesh: '/openapi/v1/remesh', convert: '/openapi/v1/convert', resize: '/openapi/v1/resize',
  'uv-unwrap': '/openapi/v1/uv-unwrap', rigging: '/openapi/v1/rigging', animate: '/openapi/v1/animations',
  'text-to-image': '/openapi/v1/text-to-image', 'image-to-image': '/openapi/v1/image-to-image',
  'text-to-motion': '/openapi/v1/text-to-motion',
};

test('every documented generation create submits once with the intended payload and owning resource', { skip }, async t => {
  const f = await fixture(t, (req, res, count) => json(res, req.method === 'POST' ? 200 : 500, { result: `accepted-${count}` }));
  const projectDir = await f.project();
  const creates = commands.filter(line => /^meshy \S+ create /.test(line));
  assert.equal(creates.length, 16, 'review workflow coverage when adding/removing a recipe');
  for (const line of creates) {
    const args = argv(line, { ...f.replacements, PROJECT_DIR: projectDir });
    const count = f.requests.length;
    const result = output(await f.run(args));
    assert.equal(f.requests.length, count + 1, line);
    const request = f.requests[count];
    assert.equal(request.method, 'POST', line);
    assert.equal(request.path, routes[args[0]], line);
    assert.equal(result.result.submission.task_id, `accepted-${count + 1}`);
    assert.equal(result.result.submission.state, 'accepted');
    assert.equal(result.result.task, null, 'async create must not poll');
    const p = request.payload;
    switch (args[0]) {
      case 'text-to-3d':
        assert.deepEqual(p.target_formats, ['glb']);
        if (p.mode === 'preview') assert.equal(p.prompt, 'MODEL_DESCRIPTION');
        else { assert.equal(p.mode, 'refine'); assert.equal(p.preview_task_id, 'PREVIEW_ID'); assert.equal(p.enable_pbr, true); assert.equal(p.texture_resolution, '4k'); }
        break;
      case 'image-to-3d':
        assert.deepEqual(p.target_formats, ['glb']);
        if (p.input_task_id) { assert.equal(p.input_task_id, 'IMAGE_TASK_ID'); assert.equal(p.should_texture, false); }
        else {
          assert.equal(p.image_url, f.imageUri);
          if (p.model_type === 'smart-topology') { assert.equal(p.target_polycount, 10000); assert.equal(p.should_texture, false); assert.equal(p.enable_pbr, undefined); }
          else { assert.equal(p.model_type, 'standard'); assert.equal(p.should_texture, true); assert.equal(p.enable_pbr, true); assert.equal(p.texture_resolution, '4k'); }
        }
        break;
      case 'multi-image-to-3d': assert.deepEqual(p.image_urls, [f.imageUri, f.imageUri, f.imageUri]); assert.equal(p.should_texture, true); break;
      case 'retexture': assert.equal(p.input_task_id, 'source'); assert.equal(p.text_style_prompt, 'TEXTURE_DESCRIPTION'); assert.equal(p.enable_original_uv, true); break;
      case 'remesh': assert.equal(p.input_task_id, 'source'); assert.equal(p.target_polycount, 30000); assert.equal(p.topology, 'triangle'); break;
      case 'convert': assert.equal(p.input_task_id, 'source'); assert.deepEqual(p.target_formats, ['fbx', 'obj']); break;
      case 'resize': assert.equal(p.input_task_id, 'source'); assert.equal(p.resize_height, 0.15); assert.equal(p.origin_at, 'bottom'); break;
      case 'uv-unwrap': assert.equal(p.input_task_id, 'source'); break;
      case 'rigging': assert.equal(p.input_task_id, 'TEXTURED_ID'); assert.equal(p.height_meters, 1.7); break;
      case 'animate': assert.equal(p.rig_task_id, 'RIG_ID'); assert.equal(p.action_id, 1); break;
      case 'text-to-image': assert.equal(p.ai_model, 'nano-banana-pro'); assert.equal(p.aspect_ratio, '1:1'); assert.equal(p.prompt, 'DESIGN_DESCRIPTION'); break;
      case 'image-to-image': assert.equal(p.ai_model, 'nano-banana-pro'); assert.deepEqual(p.reference_image_urls, [f.imageUri]); assert.equal(p.prompt, 'EDIT_DESCRIPTION'); break;
      case 'text-to-motion': assert.equal(p.mode, 'prime'); assert.equal(p.duration, 3); assert.equal(p.prompt, 'MOTION_DESCRIPTION'); break;
      default: assert.fail(`unreviewed recipe resource: ${args[0]}`);
    }
  }
  assert.equal(f.requests.filter(req => req.method === 'POST').length, 16);
});

test('documented snapshot recipe refuses an output outside its explicit workspace', { skip }, async t => {
  const f = await fixture(t, (req, res) => json(res, 200, task('source')));
  await f.project();
  const outside = join(f.root, 'outside');
  await mkdir(outside);
  const line = recipe(command => command.includes(' get ') && command.includes('--save-json'));
  const result = await f.run(argv(line, { ...f.replacements, PROJECT_DIR: outside }));
  assert.notEqual(result.code, 0, 'removing --workspace must make this test fail');
  assert.equal(JSON.parse(result.stdout).ok, false);
  assert.equal(existsSync(join(outside, 'task_source.json')), false);
  assert.ok(f.requests.every(req => req.method === 'GET'), 'snapshot recovery never creates a task');
});

test('a timed-out documented wait resumes the accepted task without another submission', { skip }, async t => {
  const f = await fixture(t, (req, res) => json(res, 200, req.method === 'POST' ? { result: 'accepted-task' } : task('accepted-task', 'IN_PROGRESS')));
  const create = recipe(line => line.startsWith('meshy text-to-3d create --mode preview '));
  const accepted = output(await f.run(argv(create, f.replacements))).result.submission.task_id;
  const projectDir = await f.project(accepted);
  const args = argv(recipe(line => line.startsWith('meshy RESOURCE wait ')), { ...f.replacements, TASK_ID: accepted, PROJECT_DIR: projectDir });
  args[args.indexOf('--timeout') + 1] = '0'; // Deterministic one-query deadline; no sleeps.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = output(await f.run(args), 8);
    assert.equal(result.error.code, 'timed_out');
    assert.equal(result.result.task.task_id, accepted);
  }
  assert.deepEqual(f.requests.map(req => req.method), ['POST', 'GET', 'GET']);
  assert.ok(f.requests.slice(1).every(req => req.path === `/openapi/v2/text-to-3d/${accepted}`));
});

test('an uncertain response to a documented create preserves unknown state and is never retried', { skip }, async t => {
  const f = await fixture(t, (req, res) => json(res, 500, { message: 'synthetic uncertain upstream failure' }));
  const line = recipe(command => command.startsWith('meshy text-to-3d create --mode preview '));
  const result = output(await f.run(argv(line, f.replacements)), 10);
  assert.equal(result.error.code, 'submission_unknown');
  assert.equal(result.result.submission.state, 'unknown');
  assert.equal(result.result.submission.task_id, null);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].method, 'POST');
});

// A location the user named — including a directory with a space and non-ASCII characters —
// must receive the exact file, with bookkeeping inside the same workspace and nothing in the default root.
test('a user-named output path receives the exact file and keeps every write inside that workspace', { skip }, async t => {
  const f = await fixture(t, (req, res) => {
    if (req.path.startsWith('/assets/')) {
      const body = glb();
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    json(res, 200, { ...task('source'), model_urls: { glb: `${f.origin}/assets/model.glb` } });
  });
  const loc = await f.userLocation('资源 assets', 'chest.glb');
  const projectDir = await f.project('source', loc);
  const bound = { ...f.replacements, ...loc, PROJECT_DIR: projectDir };
  output(await f.run(argv(recipe(line => line.includes(' get ') && line.includes('--save-json')), bound)));
  const result = output(await f.run(argv(recipe(line => line.includes('--model-format glb') && line.includes('--output "OUTPUT_FILE"')), bound)));
  assert.equal(existsSync(loc.OUTPUT_FILE), true, 'the requested file path is the delivered path');
  assert.deepEqual(result.result.downloads.files.map(file => realpathSync(file.path ?? file)), [realpathSync(loc.OUTPUT_FILE)]);
  assert.deepEqual(readFileSync(loc.OUTPUT_FILE), glb());
  assert.equal(existsSync(f.workspace), false, 'the default root is not used once the user named a location');
  assert.ok(projectDir.startsWith(realpathSync(loc.PROJECT_ROOT)), 'bookkeeping stays inside the named workspace');
  const metadata = JSON.parse(readFileSync(join(projectDir, 'metadata.json'), 'utf8'));
  const recorded = metadata.tasks.find(entry => entry.task_id === 'source');
  assert.equal(recorded.stage, 'delivered', 'the producing task is recorded even when the file lives at the user path');
  assert.deepEqual(result.warnings.map(item => item.code), ['files_outside_project'],
    'delivering outside the project folder is a documented warning, not a failure');
});

// A preview is fetched and shown when the task has one, and its absence never blocks the model.
test('the documented preview recipe downloads a thumbnail, and a task without one still lists and delivers', { skip }, async t => {
  const f = await fixture(t, (req, res) => {
    if (req.path.startsWith('/assets/')) {
      const body = req.path.endsWith('.png') ? f.png : glb();
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    const withPreview = req.path.includes('/source');
    json(res, 200, {
      ...task(withPreview ? 'source' : 'converted'),
      model_urls: { glb: `${f.origin}/assets/model.glb` },
      ...(withPreview ? { thumbnail_url: `${f.origin}/assets/thumbnail.png` } : {}),
    });
  });
  const projectDir = await f.project();
  const bound = { ...f.replacements, PROJECT_DIR: projectDir };
  output(await f.run(argv(recipe(line => line.includes(' get ') && line.includes('--save-json')), bound)));
  const listed = output(await f.run(argv(delivered(line => line.includes('--list')), bound)));
  assert.ok(JSON.stringify(listed).includes('thumbnail.primary'), 'the listing names the preview asset key');
  output(await f.run(argv(delivered(line => line.includes('--asset thumbnail.primary')), bound)));
  const preview = join(projectDir, 'preview.png');
  assert.deepEqual(readFileSync(preview), f.png, 'the rendered preview is on disk for the host to display');

  // A post-processing task carries no thumbnail of its own: listing succeeds and says so.
  const converted = { ...bound, TASK_ID: 'converted', SOURCE_ID: 'converted' };
  output(await f.run(argv(recipe(line => line.includes(' get ') && line.includes('--save-json')), converted)));
  const second = output(await f.run(argv(delivered(line => line.includes('--list')), converted)));
  assert.equal(JSON.stringify(second).includes('thumbnail'), false, 'no preview is invented for a task without one');
  const model = output(await f.run(argv(recipe(line => line.includes('--model-format glb') && line.includes('--output "OUTPUT_FILE"')),
    { ...converted, OUTPUT_FILE: join(projectDir, 'converted.glb') })));
  assert.equal(model.ok, true, 'a missing preview never blocks the model download');
  assert.ok(f.requests.every(request => request.method !== 'POST'), 'no paid task is created to obtain a picture');
});
