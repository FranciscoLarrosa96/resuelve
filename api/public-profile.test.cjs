const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Test the deployed handler with the same compiler used by the frontend; no extra runner.
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(outputText, filename);
};
const { default: handler, profileDocument } = require('./public-profile.ts');
require.extensions['.ts'] = previousLoader;
const originalFetch = global.fetch;
after(() => {
  global.fetch = originalFetch;
});
const template =
  '<html><head><title>Resuelve</title><meta name="description" content="old"><meta property="og:title" content="old"><link rel="canonical" href="old"></head><body><app-root></app-root></body></html>';
const profile = {
  displayName: 'Francisco Fernandes',
  headline: 'Plomero en Tandil',
  avatarUrl: 'https://example.test/avatar.png',
  acceptingRequests: true,
};
const response = () => ({
  statusCode: 200,
  headers: {},
  setHeader(name, value) {
    this.headers[name] = value;
  },
  end(body) {
    this.body = body;
  },
});
const request = (slug = 'francisco-fernandes', method = 'GET') => ({
  method,
  query: { slug },
  headers: {
    host: 'example.test',
    cookie: 'private-cookie',
    authorization: 'Bearer private-token',
  },
});

test('metadata replaces generic tags, uses canonical and retains the Angular document', async () => {
  const html = await profileDocument(
    template,
    profile,
    'https://example.test/p/francisco-fernandes',
  );
  assert.match(html, /Francisco Fernandes — Plomero en Tandil \| Resuelve/);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1);
  assert.match(html, /og:image/);
  assert.match(html, /<app-root>/);
  assert.doesNotMatch(html, /content="old"|href="old"|Tandil en Tandil/);
});
test('escapes public text and URLs; paused profiles keep metadata and a clear notice', async () => {
  const html = await profileDocument(
    template,
    {
      displayName: '<script>bad</script>',
      headline: '"oficio"',
      avatarUrl: 'javascript:bad',
      acceptingRequests: false,
    },
    'https://example.test/?a="x"',
  );
  assert.doesNotMatch(html, /<script>|og:image/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;x&quot;/);
  assert.match(html, /no está recibiendo nuevas solicitudes/);
});
test('handler serves public metadata without forwarding cookies or authorization', async () => {
  let received;
  global.fetch = async (url, options) => {
    received = { url, options };
    return {
      ok: true,
      json: async () => ({ ...profile, email: 'secret@example.test', phone: 'secret-phone' }),
    };
  };
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.match(received.url, /\/professionals\/public\/francisco-fernandes$/);
  assert.deepEqual(received.options.headers, { Accept: 'application/json' });
  assert.match(res.body, /og:url" content="https:\/\/example.test\/p\/francisco-fernandes/);
  assert.doesNotMatch(res.body, /secret@example.test|secret-phone|private-token|private-cookie/);
  assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8');
});
test('HEAD has headers without a document body', async () => {
  global.fetch = async () => ({ ok: true, json: async () => profile });
  const res = response();
  await handler(request(undefined, 'HEAD'), res);
  assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(res.body, undefined);
});
test('invalid slugs and methods never call the backend', async () => {
  global.fetch = async () => {
    assert.fail('must not fetch');
  };
  for (const slug of ['../private', ['a', 'b'], 'A', 'a'.repeat(191)]) {
    const res = response();
    await handler(request(slug), res);
    assert.equal(res.statusCode, 404);
  }
  const res = response();
  await handler(request(undefined, 'POST'), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET, HEAD');
});
test('missing profiles return 404; backend failures return 503 and cannot be indexed', async () => {
  for (const status of [404, 500]) {
    global.fetch = async () => ({ ok: false, status });
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, status === 404 ? 404 : 503);
    assert.equal(res.headers['X-Robots-Tag'], 'noindex');
  }
  global.fetch = async () => {
    throw new Error('timeout');
  };
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['X-Robots-Tag'], 'noindex');
});
