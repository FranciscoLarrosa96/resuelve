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
const { default: handler, profileDocument, profileJsonLd, isIndexable } = require('./public-profile.ts');
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
  services: [{ name: 'Plomería' }],
  averageRating: 4.5,
  reviewsCount: 12,
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
test('missing profiles return 404; backend failures still serve the app, not indexable', async () => {
  global.fetch = async () => ({ ok: false, status: 404 });
  let res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers['X-Robots-Tag'], 'noindex');
  const failures = [
    async () => ({ ok: false, status: 500 }),
    async () => {
      throw new Error('timeout');
    },
  ];
  for (const failure of failures) {
    global.fetch = failure;
    res = response();
    await handler(request(), res);
    // Sin build local el template no existe: cae al 503; con build sirve la app.
    if (res.statusCode === 200) {
      assert.match(res.body, /<app-root>/);
      assert.equal(res.headers['Cache-Control'], 'no-store');
    } else {
      assert.equal(res.statusCode, 503);
    }
    assert.equal(res.headers['X-Robots-Tag'], 'noindex');
  }
});

test('indexable profiles carry JSON-LD with the real rating and no contact data', async () => {
  const html = await profileDocument(template, profile, 'https://example.test/p/francisco-fernandes');
  assert.doesNotMatch(html, /name="robots"/);
  const [, json] = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const data = JSON.parse(json);
  assert.equal(data['@type'], 'ProfessionalService');
  assert.equal(data.aggregateRating.reviewCount, 12);
  assert.equal(data.areaServed.name, 'Tandil');
  assert.doesNotMatch(json, /email|phone|telefono|address/i);
  assert.match(html, /twitter:card" content="summary_large_image/);
});
test('no reviews means no aggregateRating; JSON-LD cannot close the script tag', () => {
  const json = profileJsonLd(
    { displayName: '</script><b>', services: [{ name: 'Gas' }], reviewsCount: 0, averageRating: null },
    'https://example.test/p/x',
  );
  assert.doesNotMatch(json, /aggregateRating|<\/script>/);
  assert.match(json, /\\u003c/);
});
test('paused or service-less profiles are noindex (page and header) and out of JSON-LD', async () => {
  assert.equal(isIndexable(profile), true);
  assert.equal(isIndexable({ ...profile, acceptingRequests: false }), false);
  assert.equal(isIndexable({ ...profile, services: [] }), false);
  const html = await profileDocument(template, { ...profile, acceptingRequests: false }, 'https://example.test/p/x');
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.doesNotMatch(html, /ld\+json/);
  global.fetch = async () => ({ ok: true, json: async () => ({ ...profile, acceptingRequests: false }) });
  const res = response();
  await handler(request(), res);
  if (res.statusCode === 200) assert.equal(res.headers['X-Robots-Tag'], 'noindex, follow');
});

// ---- sitemap.xml / robots.txt ------------------------------------------------
const loadTs = (file) => {
  const prev = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    module._compile(outputText, filename);
  };
  try {
    return require(file);
  } finally {
    require.extensions['.ts'] = prev;
  }
};
test('sitemap lists public pages and indexable profiles only, with escaped URLs', () => {
  const { sitemapXml } = loadTs('./sitemap.ts');
  const xml = sitemapXml('https://example.test', [
    { slug: 'ana-gomez', updatedAt: '2026-10-01T12:00:00.000Z' },
    { slug: '../hack' },
    { slug: 'Bad Slug' },
  ]);
  assert.match(xml, /<loc>https:\/\/example.test\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example.test\/p\/ana-gomez<\/loc><lastmod>2026-10-01<\/lastmod>/);
  assert.doesNotMatch(xml, /hack|Bad|\/pro\/|\/admin|mis-solicitudes|\/perfil/);
});
test('sitemap handler survives a failing backend with the static pages and a short cache', async () => {
  const { default: sitemap } = loadTs('./sitemap.ts');
  global.fetch = async () => {
    throw new Error('timeout');
  };
  const res = response();
  await sitemap({ method: 'GET', headers: { host: 'example.test' } }, res);
  assert.equal(res.headers['Content-Type'], 'application/xml; charset=utf-8');
  assert.match(res.headers['Cache-Control'], /s-maxage=60$/);
  assert.match(res.body, /example.test\/terminos/);
  global.fetch = async () => ({ ok: true, json: async () => [{ slug: 'ana-gomez' }] });
  const ok = response();
  await sitemap({ method: 'GET', headers: { host: 'example.test' } }, ok);
  assert.match(ok.body, /\/p\/ana-gomez/);
  assert.match(ok.headers['Cache-Control'], /s-maxage=3600/);
});
test('robots blocks private areas, allows the public site and points to the sitemap', () => {
  const { robotsTxt } = loadTs('./robots.ts');
  const txt = robotsTxt('https://example.test');
  for (const path of ['/pro/', '/admin/', '/mis-solicitudes', '/api/']) assert.match(txt, new RegExp(`Disallow: ${path}`));
  assert.match(txt, /Allow: \//);
  assert.match(txt, /Sitemap: https:\/\/example.test\/sitemap.xml/);
  assert.doesNotMatch(txt, /Disallow: \/p\//);
});
