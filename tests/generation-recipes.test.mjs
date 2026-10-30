import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { test } from 'node:test';

// Run with MESHY_CLI_BIN=/absolute/path/to/meshy-or-dist/index.js node --test tests/generation-recipes.test.mjs
// No install or production requests. The command text comes from the shipped recipe.
const cli = process.env.MESHY_CLI_BIN;
const skip = cli ? false : 'Set MESHY_CLI_BIN to the Meshy CLI 0.7.0 executable or JS entrypoint';
const markdown = ['pipelines.md', 'animation.md']
  .map(name => readFileSync(new URL(`../skills/meshy-3d-generation/references/${name}`, import.meta.url), 'utf8'))
  .join('\n');
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
  assert.equal(version.stdout.trim(), '0.7.0', 'these recipes require the exact supported CLI version');
  const image = join(cwd, 'reference photo.png');
  const png = Buffer.from('89504e470d0a1a0a0000000000000000', 'hex');
  await writeFile(image, png);
  const replacements = {
    PHOTO_PATH: image, IMAGE_PATH: image, FRONT_PATH: image, SIDE_PATH: image, BACK_PATH: image,
    RESOURCE: 'text-to-3d', ACTION_ID: '1', ACTION_IDS: '10,25,92', TASK_ID: 'source', SOURCE_ID: 'source', TEXTURED_ID: 'source',
    WORKSPACE: workspace, JOB_DIR: join(workspace, 'job'), OUTPUT_FILE: join(workspace, 'model.glb'),
  };
  // The documented workspace/job-folder pair for a location the user named themselves.
  async function userLocation(directory, fileName) {
    const ws = join(cwd, directory);
    await mkdir(ws, { recursive: true });
    return { WORKSPACE: ws, JOB_DIR: join(ws, 'meshy_output', 'job'), OUTPUT_FILE: join(ws, fileName) };
  }
  return { root, cwd, workspace, origin, requests, replacements, run, userLocation, png, imageUri: `data:image/png;base64,${png.toString('base64')}` };
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
  const creates = commands.filter(line => /^meshy \S+ create /.test(line));
  assert.equal(creates.length, 18, 'review workflow coverage when adding/removing a recipe');
  for (const line of creates) {
    const args = argv(line, f.replacements);
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
          if (p.model_type === 'smart-topology') { assert.equal(p.target_polycount, 10000); assert.equal(p.ai_model, 'meshy-t2.5', 'smart topology defaults to meshy-t2.5'); assert.equal(p.should_texture, false); assert.equal(p.enable_pbr, undefined); }
          else { assert.equal(p.model_type, 'standard'); assert.equal(p.should_texture, true); assert.equal(p.enable_pbr, true); assert.equal(p.texture_resolution, '4k'); }
        }
        break;
      case 'multi-image-to-3d': assert.deepEqual(p.image_urls, [f.imageUri, f.imageUri, f.imageUri]); assert.equal(p.should_texture, true); break;
      case 'retexture': assert.equal(p.input_task_id, 'source'); assert.equal(p.text_style_prompt, 'TEXTURE_DESCRIPTION'); assert.equal(p.enable_original_uv, true); break;
      case 'remesh': assert.equal(p.input_task_id, 'source'); assert.equal(p.target_polycount, 30000); assert.equal(p.topology, 'triangle'); break;
      case 'convert': assert.equal(p.input_task_id, 'source'); assert.deepEqual(p.target_formats, ['fbx', 'obj']); break;
      case 'resize': assert.equal(p.input_task_id, 'source'); assert.equal(p.resize_height, 0.15); assert.equal(p.origin_at, 'bottom'); break;
      case 'uv-unwrap': assert.equal(p.input_task_id, 'source'); break;
      case 'rigging': assert.equal(p.input_task_id, 'source'); assert.equal(p.height_meters, 1.7); break;
      case 'animate':
        assert.equal(p.rig_task_id, 'RIG_ID');
        if (p.action_ids) { assert.deepEqual(p.action_ids, [10, 25, 92]); assert.equal(p.action_id, undefined); }
        else if (p.motion_task_id) { assert.equal(p.motion_task_id, 'MOTION_ID'); assert.equal(p.action_id, undefined); }
        else assert.equal(p.action_id, 1);
        break;
      case 'text-to-image': assert.equal(p.ai_model, 'gpt-image-2'); assert.equal(p.aspect_ratio, '1:1'); assert.equal(p.prompt, 'DESIGN_DESCRIPTION'); break;
      case 'image-to-image': assert.equal(p.ai_model, 'gpt-image-2'); assert.deepEqual(p.reference_image_urls, [f.imageUri]); assert.equal(p.prompt, 'EDIT_DESCRIPTION'); break;
      case 'text-to-motion': assert.equal(p.mode, 'prime'); assert.equal(p.duration, 3); assert.equal(p.prompt, 'MOTION_DESCRIPTION'); break;
      default: assert.fail(`unreviewed recipe resource: ${args[0]}`);
    }
  }
  assert.equal(f.requests.filter(req => req.method === 'POST').length, 18);
});

test('a documented download refuses a target outside its explicit workspace', { skip }, async t => {
  const f = await fixture(t, (req, res) => json(res, 200, task('source')));
  const outside = join(f.root, 'outside');
  await mkdir(outside);
  const line = delivered(command => command.includes('--asset thumbnail.primary'));
  const result = await f.run(argv(line, { ...f.replacements, JOB_DIR: outside }));
  assert.notEqual(result.code, 0, 'removing --workspace must make this test fail');
  assert.equal(JSON.parse(result.stdout).ok, false);
  assert.equal(existsSync(join(outside, 'preview-source.png')), false);
  assert.ok(f.requests.every(req => req.method === 'GET'), 'a refused download never creates a task');
});

test('a timed-out documented wait resumes the accepted task without another submission', { skip }, async t => {
  const f = await fixture(t, (req, res) => json(res, 200, req.method === 'POST' ? { result: 'accepted-task' } : task('accepted-task', 'IN_PROGRESS')));
  const create = recipe(line => line.startsWith('meshy text-to-3d create --mode preview '));
  const accepted = output(await f.run(argv(create, f.replacements))).result.submission.task_id;
  const args = argv(recipe(line => line.startsWith('meshy RESOURCE wait ')), { ...f.replacements, TASK_ID: accepted });
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

// A location the user named — including a directory with a space and non-ASCII characters — must
// receive the exact file and its sidecar, and nothing may land in the default root.
test('a user-named output path receives the exact file and its sidecar, and rerunning the same -o is safe', { skip }, async t => {
  const f = await fixture(t, (req, res) => {
    if (req.path.startsWith('/assets/')) {
      const body = glb();
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    json(res, 200, { ...task(req.path.split('/').at(-1)), model_urls: { glb: `${f.origin}/assets/model.glb` } });
  });
  const loc = await f.userLocation('资源 assets', 'chest.glb');
  const bound = { ...f.replacements, ...loc };
  const deliver = argv(recipe(line => line.includes(' get ') && line.includes('-o "OUTPUT_FILE"')), bound);
  const result = output(await f.run(deliver));
  assert.equal(existsSync(loc.OUTPUT_FILE), true, 'the requested file path is the delivered path');
  assert.deepEqual(result.result.downloads.files.map(file => realpathSync(file.path)), [realpathSync(loc.OUTPUT_FILE)]);
  assert.deepEqual(readFileSync(loc.OUTPUT_FILE), glb());
  const folder = dirname(loc.OUTPUT_FILE);
  assert.deepEqual(readdirSync(folder).sort(), ['chest.glb', 'chest_meta.json'], 'the model and its sidecar are all that is written');
  const meta = JSON.parse(readFileSync(join(folder, 'chest_meta.json'), 'utf8'));
  assert.equal(meta.resource, 'text-to-3d', 'the sidecar is the task trail: resource');
  assert.equal(meta.task.id, 'source', 'the sidecar is the task trail: task ID');
  assert.equal(existsSync(f.workspace), false, 'the default root is not used once the user named a location');

  output(await f.run(deliver)); // the same task again replaces its own files instead of failing
  assert.deepEqual(readFileSync(loc.OUTPUT_FILE), glb());
  // Another task aimed at the same path is refused before a transfer, and the file stays as it was.
  const refused = output(await f.run(argv(recipe(line => line.includes(' get ') && line.includes('-o "OUTPUT_FILE"')), { ...bound, TASK_ID: 'another' })), 11);
  assert.equal(refused.error.code, 'local_io');
  assert.equal(JSON.parse(readFileSync(join(folder, 'chest_meta.json'), 'utf8')).task.id, 'source');
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
  const listed = output(await f.run(argv(delivered(line => line.includes('--list')), f.replacements)));
  assert.ok(JSON.stringify(listed).includes('thumbnail.primary'), 'the listing names the preview asset key');
  output(await f.run(argv(delivered(line => line.includes('--asset thumbnail.primary')), f.replacements)));
  assert.deepEqual(readFileSync(join(f.replacements.JOB_DIR, 'preview-source.png')), f.png, 'the rendered preview is on disk for the host to display');

  // A post-processing task carries no thumbnail of its own: listing succeeds and says so.
  const converted = { ...f.replacements, TASK_ID: 'converted' };
  const second = output(await f.run(argv(delivered(line => line.includes('--list')), converted)));
  assert.equal(JSON.stringify(second).includes('thumbnail'), false, 'no preview is invented for a task without one');
  const model = output(await f.run(argv(recipe(line => line.includes(' get ') && line.includes('-o "OUTPUT_FILE"')),
    { ...converted, OUTPUT_FILE: join(f.workspace, 'converted.glb') })));
  assert.equal(model.ok, true, 'a missing preview never blocks the model download');
  assert.ok(f.requests.every(request => request.method !== 'POST'), 'no paid task is created to obtain a picture');
});

// A GLB whose JSON declares `triangles` triangles in one mesh; the face counter reads accessor counts only.
function glbWithTriangles(triangles) {
  const doc = JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ count: triangles * 3 }, { count: triangles * 3 }],
  });
  const chunkJson = Buffer.from(doc.padEnd(Math.ceil(doc.length / 4) * 4, ' '), 'utf8');
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + chunkJson.length, 8);
  const chunk = Buffer.alloc(8);
  chunk.writeUInt32LE(chunkJson.length, 0);
  chunk.write('JSON', 4, 'ascii');
  return Buffer.concat([header, chunk, chunkJson]);
}

// The API reports no face count, so the UV-unwrap and rigging gates measure the downloaded GLB.
test('the documented face gates download the model and count it locally; a task response alone stays unknown', { skip }, async t => {
  const f = await fixture(t, (req, res) => {
    if (req.path.startsWith('/assets/')) {
      const body = glbWithTriangles(1000);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    // No face_count: what the API really returns.
    const { face_count: _omitted, ...bare } = task('source');
    json(res, 200, { ...bare, model_urls: { glb: `${f.origin}/assets/model.glb` } });
  });
  const bound = f.replacements;
  for (const [file, saved, limit] of [['source-SOURCE_ID.glb', 'source-source.glb', '40000'], ['textured-TEXTURED_ID.glb', 'textured-source.glb', '300000']]) {
    const download = output(await f.run(argv(recipe(line => line.startsWith('meshy download ') && line.includes(file)), bound)));
    assert.equal(download.result.downloads.files.length, 1);
    assert.equal(existsSync(join(bound.JOB_DIR, saved)), true);
    const gate = recipe(line => line.startsWith('meshy inspect faces --model') && line.includes(file));
    assert.ok(gate.includes(`--max-faces ${limit}`), gate);
    const pass = output(await f.run(argv(gate, bound)));
    assert.equal(pass.result.verdict, 'pass');
    assert.equal(pass.result.face_count, 1000);
    assert.equal(pass.result.source.kind, 'model');
    const tight = argv(gate, bound);
    tight[tight.indexOf('--max-faces') + 1] = '500';
    const fail = output(await f.run(tight), 12);
    assert.equal(fail.error.code, 'check_failed');
    assert.equal(fail.result.face_count, 1000);
  }
  const snapshot = join(f.cwd, 'task.json');
  await writeFile(snapshot, JSON.stringify((await (await fetch(`${f.origin}/openapi/v2/text-to-3d/source`)).json())));
  const unknown = output(await f.run(['inspect', 'faces', '--task-json', snapshot, '--max-faces', '40000', '--format', 'json', '--no-update-check']), 13);
  assert.equal(unknown.error.code, 'check_unknown', 'a task without a count is unknown, never a pass');
  assert.ok(f.requests.every(request => request.method === 'GET'), 'no paid task is created to count faces');
});

// What the references say about defaults and warnings, checked against payloads the CLI really sends.
test('image generators texture by default, a draft refuses texture settings, and a pose warns about the ratio', { skip }, async t => {
  const f = await fixture(t, (req, res) => json(res, 200, { result: 'accepted' }));
  const photo = f.replacements.PHOTO_PATH;
  const flags = ['--async', '--format', 'json', '--no-update-check'];
  const textured = output(await f.run(['image-to-3d', 'create', '--image-url', photo, ...flags]));
  const body = f.requests.at(-1).payload;
  assert.notEqual(body.should_texture, false, 'texturing is left to the API, which textures by default');
  assert.equal(body.enable_pbr, true);
  assert.equal(body.texture_resolution, '4k');
  assert.equal(textured.result.submission.state, 'accepted');

  const posts = f.requests.length;
  const refused = output(await f.run(['image-to-3d', 'create', '--image-url', photo, '--should-texture', 'false', '--enable-pbr', 'true', ...flags]), 2);
  assert.equal(refused.error.code, 'usage');
  assert.equal(f.requests.length, posts, 'texture settings with a draft are refused before anything is sent');

  const posed = output(await f.run(['text-to-image', 'create', '--ai-model', 'nano-banana-pro', '--prompt', 'a knight', '--pose-mode', 't-pose', '--aspect-ratio', '16:9', ...flags]));
  assert.deepEqual(posed.warnings.map(item => item.code), ['pose_aspect_ratio']);
  assert.equal(f.requests.at(-1).payload.aspect_ratio, '16:9', 'the request is still sent as asked');
});

// `-o` is described in pipelines.md: primary files only, the rest listed as skipped, --all-assets for everything.
test('-o saves the primary files, lists what it leaves on the server, and --all-assets saves the rest', { skip }, async t => {
  const f = await fixture(t, (req, res) => {
    if (req.path.startsWith('/assets/')) {
      const body = req.path.endsWith('.png') ? f.png : glb();
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    json(res, 200, {
      ...task('source'), model_urls: { glb: `${f.origin}/assets/model.glb` }, thumbnail_url: `${f.origin}/assets/thumbnail.png`,
      texture_urls: [{ base_color: `${f.origin}/assets/base.png` }],
    });
  });
  const common = ['--workspace', f.workspace, '--format', 'json', '--no-update-check'];
  const dir = output(await f.run(['text-to-3d', 'wait', 'source', '-o', join(f.workspace, 'out'), ...common]));
  assert.deepEqual(dir.result.downloads.files.map(file => file.key).sort(), ['model.glb', 'thumbnail.primary']);
  assert.deepEqual(dir.result.downloads.skipped, [{ key: 'texture.0.base_color', reason: 'embedded_textures' }]);
  const all = output(await f.run(['text-to-3d', 'wait', 'source', '-o', join(f.workspace, 'all'), '--all-assets', ...common]));
  assert.deepEqual(all.result.downloads.files.map(file => file.key).sort(), ['model.glb', 'texture.0.base_color', 'thumbnail.primary']);
  const file = output(await f.run(['text-to-3d', 'wait', 'source', '-o', join(f.workspace, 'chest.glb'), ...common]));
  assert.deepEqual(file.result.downloads.files.map(entry => entry.key), ['model.glb']);
  assert.equal(existsSync(join(f.workspace, 'chest.glb')), true);
  const refused = output(await f.run(['text-to-3d', 'wait', 'source', '-o', join(f.workspace, 'x.glb'), '--all-assets', ...common]), 2);
  assert.equal(refused.error.code, 'usage', '--all-assets needs a directory');
});

// troubleshooting.md closes an unknown submission with the documented `operations` commands.
test('the documented operations commands close out an unknown submission without a hidden second create', { skip }, async t => {
  let fail = true;
  const f = await fixture(t, (req, res) => (fail ? json(res, 500, { message: 'synthetic uncertain upstream failure' }) : json(res, 200, { result: 'task-new' })));
  const troubleshooting = readFileSync(new URL('../skills/meshy-3d-generation/references/troubleshooting.md', import.meta.url), 'utf8');
  const documentedOps = shellLines(troubleshooting).filter(line => line.startsWith('meshy operations '));
  assert.equal(documentedOps.length, 3, 'list, resolve --task-id and resolve --not-created');
  const op = predicate => documentedOps.find(predicate);
  const create = argv(recipe(line => line.startsWith('meshy text-to-3d create --mode preview ')), f.replacements);
  const posts = () => f.requests.filter(request => request.method === 'POST').length;

  const first = output(await f.run(create), 10);
  const bound = first.result.submission.operation_id;
  assert.ok(bound, 'the error envelope names the operation to resolve');
  const listed = output(await f.run(argv(op(line => line.includes(' list ')))));
  assert.deepEqual(listed.result.operations.map(entry => entry.operation_id), [bound]);

  const found = output(await f.run(argv(op(line => line.includes('--task-id')), { OPERATION_ID: bound, TASK_ID: 'task-found' })));
  assert.equal(found.ok, true);
  const replay = output(await f.run([...create, '--operation-id', bound]));
  assert.equal(replay.result.submission.task_id, 'task-found', 'a replay returns the bound task');
  assert.equal(posts(), 1, 'binding a task sends nothing');

  const second = output(await f.run(create.map(arg => (arg === 'MODEL_DESCRIPTION' ? 'another model' : arg))), 10);
  const released = second.result.submission.operation_id;
  output(await f.run(argv(op(line => line.includes('--not-created')), { OPERATION_ID: released })));
  fail = false;
  const resubmitted = output(await f.run([...create.map(arg => (arg === 'MODEL_DESCRIPTION' ? 'another model' : arg)), '--operation-id', released]));
  assert.equal(resubmitted.result.submission.task_id, 'task-new');
  assert.equal(posts(), 3, 'a released ID submits again, once: that is a new paid create');
});

// pipelines.md and troubleshooting.md: a part-way `-o` failure still writes its sidecar, and the printed recovery is the same `-o`.
test('a part-way -o failure keeps its sidecar, and running error.recovery.command finishes the delivery', { skip }, async t => {
  let thumbnailDown = true;
  const f = await fixture(t, (req, res) => {
    if (req.path.startsWith('/assets/')) {
      if (thumbnailDown && req.method === 'GET' && req.path.endsWith('.png')) { res.writeHead(503); res.end('busy'); return; }
      const body = req.path.endsWith('.png') ? f.png : glb();
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    json(res, 200, { ...task('source'), model_urls: { glb: `${f.origin}/assets/model.glb` }, thumbnail_url: `${f.origin}/assets/thumbnail.png` });
  });
  const target = join(f.workspace, 'my model');
  const common = ['--workspace', f.workspace, '--format', 'json', '--no-update-check'];
  const failed = output(await f.run(['text-to-3d', 'get', 'source', '-o', target, ...common]), 7);
  assert.equal(failed.result.downloads.state, 'partial');
  assert.equal(existsSync(join(target, 'model.glb')), true, 'the file that landed stays');
  assert.equal(existsSync(join(target, 'meta.json')), true, 'the sidecar is written for what landed');
  const recovery = failed.error.recovery.command;
  assert.match(recovery, /^meshy text-to-3d get source -o /, recovery);
  const args = recovery.match(/'[^']*'|\S+/g).slice(1).map(token => token.replace(/^'(.*)'$/, '$1'));
  assert.ok(args.includes(target), 'the recovery names the absolute target, whatever the working directory');

  thumbnailDown = false;
  const done = output(await f.run([...args, '--format', 'json', '--no-update-check']));
  assert.deepEqual(done.result.downloads.files.map(file => file.key).sort(), ['model.glb', 'thumbnail.primary']);
  assert.equal(existsSync(join(target, 'thumbnail.png')), true);
  assert.ok(f.requests.every(request => request.method !== 'POST'), 'recovery never creates a task');
});
