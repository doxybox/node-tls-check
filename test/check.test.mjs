import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const cli = fileURLToPath(new URL('../bin/check.mjs', import.meta.url));
const ca = fileURLToPath(new URL('./fixtures/test-only-cert.pem', import.meta.url));
const key = readFileSync(new URL('./fixtures/test-only-key.pem', import.meta.url));
const cert = readFileSync(ca);

function run(args, trusted = false, overrides = {}) {
  const env = { ...process.env };
  for (const name of ['NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_USE_ENV_PROXY']) delete env[name];
  if (trusted) env.NODE_EXTRA_CA_CERTS = ca;
  Object.assign(env, overrides);
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cli, ...args], { env, timeout: 15000 }, (error, stdout, stderr) => {
      if (error?.killed || (error && typeof error.code !== 'number')) return reject(error);
      resolve({ code: error?.code ?? 0, stdout, stderr });
    });
  });
}

async function serve(t, handler) {
  const server = https.createServer({ key, cert }, handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `https://127.0.0.1:${server.address().port}`;
}

test('untrusted certificates are rejected by both clients', async (t) => {
  const url = await serve(t, (_, res) => res.end('test'));
  const result = await run([url, '--json']);
  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.https.ok, false);
  assert.equal(report.fetch.ok, false);
  assert.equal(report.https.code, 'DEPTH_ZERO_SELF_SIGNED_CERT');
  assert.equal(report.fetch.code, 'DEPTH_ZERO_SELF_SIGNED_CERT');
});

test('explicitly trusted certificate works; request secrets are omitted from output', async (t) => {
  const requests = [];
  const url = await serve(t, (req, res) => { requests.push(req.url); res.end('PRIVATE_RESPONSE_BODY'); });
  const result = await run([`${url}/private-path?token=SECRET_TOKEN`, '--json'], true);
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.target, url);
  assert.deepEqual(report.https, { ok: true, status: 200 });
  assert.deepEqual(report.fetch, { ok: true, status: 200 });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((path) => path === '/private-path?token=SECRET_TOKEN'));
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_RESPONSE_BODY|private-path|SECRET_TOKEN/);
});

test('HTTP errors are reported as established HTTP connections', async (t) => {
  const url = await serve(t, (_, res) => { res.writeHead(503); res.end(); });
  const result = await run([url, '--json'], true);
  assert.equal(result.code, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.https.status, 503);
  assert.equal(report.fetch.status, 503);
});

test('neither client follows redirects', async (t) => {
  const paths = [];
  const url = await serve(t, (req, res) => {
    paths.push(req.url);
    res.writeHead(302, { location: '/must-not-be-requested' });
    res.end();
  });
  const result = await run([`${url}/redirect`, '--json'], true);
  assert.equal(result.code, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.https.status, 302);
  assert.equal(report.fetch.status, 302);
  assert.deepEqual(paths, ['/redirect', '/redirect']);
});

test('both clients stop when the server never sends headers', async (t) => {
  const url = await serve(t, () => {});
  const result = await run([url, '--json', '--timeout', '200'], true);
  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.https.code, 'TIMEOUT');
  assert.equal(report.fetch.code, 'TIMEOUT');
});

test('invalid and credential-bearing URLs are rejected without leaking input', async () => {
  for (const args of [[], ['not-a-url'], ['http://example.com'], ['https://user:SECRET@example.com'], ['https://example.com', '--timeout', '0'], ['https://example.com', '--timeout', 'abc'], ['https://example.com', '--timeout'], ['https://example.com', '--unknown']]) {
    const result = await run(args);
    assert.equal(result.code, 2, JSON.stringify(args));
    assert.doesNotMatch(result.stdout + result.stderr, /SECRET/);
  }
});

test('help exits successfully without a URL', async () => {
  const result = await run(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /--use-system-ca/);
});

test('refuses a globally disabled certificate check', async () => {
  const result = await run(['https://example.com'], false, { NODE_TLS_REJECT_UNAUTHORIZED: '0' });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Certificate verification is disabled/);
});

test('human-readable output includes the client results', async (t) => {
  const url = await serve(t, (_, res) => res.end('test'));
  const result = await run([url], true);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /https.get: HTTP 200/);
  assert.match(result.stdout, /fetch:\s+HTTP 200/);
});
