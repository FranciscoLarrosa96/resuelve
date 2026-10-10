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
  primaryLocality: { name: 'Tandil', province: { name: 'Buenos Aires' } },
  coverage: [
    { locality: { name: 'Tandil', province: { name: 'Buenos Aires' } } },
    { locality: { name: 'Rauch', province: { name: 'Buenos Aires' } } },
  ],
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
  assert.doesNotMatch(html, /<script>/);
  // Avatar inseguro (javascript:) → nunca se usa; cae a la imagen de marca del mismo origen.
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /og:image" content="https:\/\/example.test\/og-image.png/);
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
    // 503 + Retry-After (el buscador reintenta y no desindexa); con build, el cuerpo es la app.
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['Retry-After'], '120');
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['X-Robots-Tag'], undefined);
  }
});

test('indexable profiles carry JSON-LD with the real rating and no contact data', async () => {
  const html = await profileDocument(template, profile, 'https://example.test/p/francisco-fernandes');
  assert.doesNotMatch(html, /name="robots"/);
  const [, json] = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const data = JSON.parse(json);
  assert.equal(data['@type'], 'ProfessionalService');
  assert.equal(data.aggregateRating.reviewCount, 12);
  // Zona general = las localidades que cubre (nunca una ciudad asumida).
  assert.deepEqual(data.areaServed.map((a) => a.name), ['Tandil', 'Rauch']);
  assert.equal(data.areaServed[0].containedInPlace.name, 'Buenos Aires');
  assert.doesNotMatch(json, /email|phone|telefono|address/i);
  // Con foto de perfil: se usa esa foto (tarjeta chica); sin foto, la imagen de marca (tarjeta grande).
  assert.match(html, /og:image" content="https:\/\/example.test\/avatar.png/);
  assert.match(html, /twitter:card" content="summary"/);
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
  global.fetch = async (url) => ({
    ok: true,
    json: async () =>
      String(url).endsWith('/localities/served-services')
        ? { items: [{ path: 'buenos-aires/tandil', service: 'plomeria' }] }
        : [{ slug: 'ana-gomez' }],
  });
  const ok = response();
  await sitemap({ method: 'GET', headers: { host: 'example.test' } }, ok);
  assert.match(ok.body, /\/p\/ana-gomez/);
  assert.match(ok.body, /\/ciudades\/buenos-aires\/tandil\/servicios\/plomeria/);
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

// ---- /servicios/:slug (páginas por servicio) ---------------------------------
const apiServices = [
  { name: 'Plomería', slug: 'plomeria', categoryId: 'c1', requiresLicense: false },
  { name: 'Gas', slug: 'gas', categoryId: 'c1', requiresLicense: true },
  { name: 'Pintura', slug: 'pintura', categoryId: 'c2', requiresLicense: false },
];
const apiCategories = [
  { id: 'c1', name: 'Instalaciones', slug: 'instalaciones' },
  { id: 'c2', name: 'Obra', slug: 'obra' },
];
test('service page: HTML con título, canonical, JSON-LD, contenido y servicios relacionados reales', () => {
  const { findLandingService, serviceDocument } = loadTs('./service-page.ts');
  const found = findLandingService('gas', apiServices, apiCategories);
  assert.deepEqual(found.related.map((s) => s.slug), ['plomeria']);
  const html = serviceDocument(template, found.service, found.related, 'https://example.test');
  // Página nacional: sin ciudad asumida.
  assert.match(html, /<title>Gasistas · Gas \| Resuelve<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.test\/servicios\/gas">/);
  assert.match(html, /"@type":"Service"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.match(html, /<app-root><main><p>Gas<\/p><h1>Gasistas<\/h1>/);
  assert.match(html, /"alternateName":"Gasista"/);
  assert.match(html, /"areaServed":\{"@type":"Country","name":"Argentina"\}/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /¿Cómo consigo un gasista\?/);
  assert.doesNotMatch(html, /Tandil/);
  assert.match(html, /¿Los gasistas están matriculados\?/);
  assert.match(html, /Matrícula verificada/);
  assert.match(html, /href="\/servicios\/plomeria"/);
  assert.doesNotMatch(html, /content="old"|noindex/);
  const noLicense = findLandingService('plomeria', apiServices, apiCategories);
  assert.doesNotMatch(serviceDocument(template, noLicense.service, noLicense.related, 'https://example.test'), /Matrícula verificada/);
});
test('service page por localidad: título, canonical, migas y JSON-LD de la ciudad; sin oferta = noindex', () => {
  const { findLandingService, serviceDocument } = loadTs('./service-page.ts');
  const found = findLandingService('gas', apiServices, apiCategories);
  const tandil = { name: 'Tandil', slug: 'tandil', province: { name: 'Buenos Aires', slug: 'buenos-aires' } };
  const html = serviceDocument(template, found.service, found.related, 'https://example.test', [], tandil, 3);
  assert.match(html, /<title>Gasista en Tandil · Gas \| Resuelve<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.test\/ciudades\/buenos-aires\/tandil\/servicios\/gas">/);
  assert.match(html, /<h1>Gasistas en Tandil<\/h1>/);
  assert.match(html, /¿Cómo consigo un gasista en Tandil\?/);
  assert.match(html, /"areaServed":\{"@type":"City","name":"Tandil","containedInPlace":\{"@type":"AdministrativeArea","name":"Buenos Aires"\}\}/);
  assert.match(html, /"position":4,"name":"Tandil"/);
  assert.match(html, /provincia=buenos-aires&amp;ciudad=tandil/);
  assert.doesNotMatch(html, /noindex/);
  // Azul sin gasistas: la página existe (se puede compartir) pero no se indexa ni declara canonical.
  const azul = { name: 'Azul', slug: 'azul', province: { name: 'Buenos Aires', slug: 'buenos-aires' } };
  const empty = serviceDocument(template, found.service, found.related, 'https://example.test', [], azul, 0);
  assert.match(empty, /<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(empty, /rel="canonical"/);
  // Nacional: enlaza solo las localidades con oferta real.
  const national = serviceDocument(template, found.service, found.related, 'https://example.test', [], null, 0, [
    { name: 'Tandil', slug: 'tandil', label: 'Tandil, Buenos Aires', province: { name: 'Buenos Aires', slug: 'buenos-aires' } },
  ]);
  assert.match(national, /<a href="\/ciudades\/buenos-aires\/tandil\/servicios\/gas">Tandil, Buenos Aires<\/a>/);
  assert.doesNotMatch(national, /noindex/);
});
test('service page por localidad: localidad inexistente = 404 noindex, y pide los profesionales de esa localidad', async () => {
  const { default: page } = loadTs('./service-page.ts');
  const serve = (query) => ({ method: 'GET', query, headers: { host: 'example.test' } });
  let res = response();
  await page(serve({ slug: 'gas', province: '../x', locality: 'tandil' }), res);
  assert.equal(res.statusCode, 404);
  global.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  res = response();
  await page(serve({ slug: 'gas', province: 'buenos-aires', locality: 'no-existe' }), res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers['X-Robots-Tag'], 'noindex');
  const requested = [];
  global.fetch = async (url) => {
    const u = String(url);
    requested.push(u);
    return {
      ok: true,
      status: 200,
      json: async () =>
        u.includes('/provinces/')
          ? { id: 'loc-1', name: 'Tandil', slug: 'tandil', province: { name: 'Buenos Aires', slug: 'buenos-aires' }, serviceProfessionalsCount: 2 }
          : u.includes('/professionals?')
            ? { items: [] }
            : u.endsWith('/services')
              ? apiServices
              : apiCategories,
    };
  };
  res = response();
  await page(serve({ slug: 'gas', province: 'buenos-aires', locality: 'tandil' }), res);
  assert.ok(requested.some((u) => /\/provinces\/buenos-aires\/localities\/tandil\?service=gas$/.test(u)));
  assert.ok(requested.some((u) => /\/professionals\?service=gas&locality=loc-1&pageSize=12$/.test(u)));
});
test('service page: slug inexistente o inválido = 404 noindex; backend caído = 503 para reintentar', async () => {
  const { default: page, findLandingService } = loadTs('./service-page.ts');
  assert.equal(findLandingService('nada', apiServices, apiCategories), null);
  const serve = (slug) => ({ method: 'GET', query: { slug }, headers: { host: 'example.test' } });
  let res = response();
  await page(serve('../x'), res);
  assert.equal(res.statusCode, 404);
  global.fetch = async (url) => ({ ok: true, json: async () => (String(url).endsWith('/services') ? apiServices : apiCategories) });
  res = response();
  await page(serve('nada'), res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers['X-Robots-Tag'], 'noindex');
  global.fetch = async () => {
    throw new Error('timeout');
  };
  res = response();
  await page(serve('gas'), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Retry-After'], '120');
  assert.equal(res.headers['X-Robots-Tag'], undefined);
});
test('sitemap incluye los servicios del catálogo', () => {
  const { sitemapXml } = loadTs('./sitemap.ts');
  const xml = sitemapXml('https://example.test', [], [{ slug: 'plomeria' }, { slug: 'Bad Slug' }]);
  assert.match(xml, /<loc>https:\/\/example.test\/servicios\/plomeria<\/loc>/);
  assert.doesNotMatch(xml, /Bad/);
});
test('sitemap handler: respuestas inesperadas del backend nunca dan 500', async () => {
  const { default: sitemap } = loadTs('./sitemap.ts');
  for (const body of [{ error: 'x' }, null, 'html', [null, { slug: 5 }, { slug: 'ok' }]]) {
    global.fetch = async () => ({ ok: true, json: async () => body });
    const res = response();
    await sitemap({ method: 'GET', headers: { host: 'example.test' } }, res);
    assert.notEqual(res.statusCode, 500);
    assert.match(res.body, /example.test\/terminos/);
  }
});
test('service page: texto propio por servicio (trabajos y consejos) y plantilla común si no tiene guía', () => {
  const { serviceDocument } = loadTs('./service-page.ts');
  const { SERVICE_GUIDES } = loadTs('../src/app/features/client/services/service-landing-content.ts');
  const own = { name: 'Plomería', slug: 'plomeria', requiresLicense: false, category: { name: 'Hogar', slug: 'hogar' } };
  const html = serviceDocument(template, own, [], 'https://example.test');
  assert.match(html, /Trabajos que suelen pedirse/);
  assert.match(html, /Antes de pedir tu presupuesto/);
  assert.match(html, /Pérdidas y filtraciones/);
  const generic = serviceDocument(template, { ...own, slug: 'nuevo', name: 'Nuevo' }, [], 'https://example.test');
  assert.doesNotMatch(generic, /Trabajos que suelen pedirse/);
  assert.match(generic, /<h1>Nuevo<\/h1>/);
  // Todos los servicios del catálogo tienen guía y ninguna promete precios.
  const seed = fs.readFileSync(require('node:path').join(__dirname, '../backend/src/database/catalog/catalog.data.ts'), 'utf8');
  for (const [, slug] of seed.matchAll(/slug: '([a-z0-9-]+)',\s*name: '[^']+',\s*requiresLicense/g)) assert.ok(SERVICE_GUIDES[slug], `falta guía de ${slug}`);
  assert.doesNotMatch(JSON.stringify(SERVICE_GUIDES), /\$|gratis|barato|precio|garant/i);
});
test('service page: título y H1 con el oficio que se busca ("plomero en Mar del Plata")', () => {
  const { serviceDocument } = loadTs('./service-page.ts');
  const { landingCopy, placeText } = loadTs('../src/app/features/client/services/service-landing-content.ts');
  const mdp = { name: 'Mar del Plata', slug: 'mar-del-plata', province: { name: 'Buenos Aires', slug: 'buenos-aires' } };
  const plomeria = { name: 'Plomería', slug: 'plomeria', requiresLicense: false, category: { name: 'Hogar', slug: 'hogar' } };
  const html = serviceDocument(template, plomeria, [], 'https://example.test', [], mdp, 1);
  assert.match(html, /<title>Plomero en Mar del Plata · Plomería \| Resuelve<\/title>/);
  assert.match(html, /<h1>Plomeros en Mar del Plata<\/h1>/);
  assert.match(html, /los plomeros de Mar del Plata te mandan su presupuesto/);
  assert.doesNotMatch(html, /matriculados|Tandil/);
  const ninera = landingCopy({ name: 'Niñera', slug: 'ninera', requiresLicense: false, category: { name: 'Cuidado', slug: 'cuidado' } }, mdp);
  assert.equal(ninera.faq[0].question, '¿Cómo consigo una niñera en Mar del Plata?');
  const generic = landingCopy({ name: 'Fletes', slug: 'fletes', requiresLicense: false, category: { name: 'T', slug: 't' } }, mdp);
  assert.equal(generic.title, 'Fletes en Mar del Plata · Resuelve');
  assert.equal(generic.faq[0].question, '¿Cómo consigo un profesional de fletes en Mar del Plata?');
  // Sin localidad, el texto propio no nombra ninguna ciudad.
  assert.equal(placeText('Mudanzas en {city}: contá desde dónde.'), 'Mudanzas: contá desde dónde.');
  assert.equal(placeText('Cargas dentro de {city}.'), 'Cargas dentro de tu ciudad.');
  assert.equal(placeText('los plomeros de {city} te mandan'), 'los plomeros de tu ciudad te mandan');
});
test('service page: lista profesionales reales del servicio (rating solo con reseñas) y sin ellos no inventa nada', async () => {
  const { default: page, serviceDocument } = loadTs('./service-page.ts');
  const items = [
    { slug: 'ana-gomez', displayName: 'Ana Gómez', headline: 'Gasista matriculada', averageRating: 4.75, reviewsCount: 8 },
    { slug: 'beto-paz', displayName: 'Beto Paz', headline: '', averageRating: null, reviewsCount: 0 },
    { slug: null, displayName: 'Sin enlace', reviewsCount: 0 },
  ];
  const requested = [];
  global.fetch = async (url) => {
    requested.push(String(url));
    const u = String(url);
    return { ok: true, json: async () => (u.includes('/professionals?') ? { items } : u.endsWith('/services') ? apiServices : apiCategories) };
  };
  const res = response();
  await page({ method: 'GET', query: { slug: 'gas' }, headers: { host: 'example.test' } }, res);
  assert.ok(requested.some((u) => /\/professionals\?service=gas&pageSize=12$/.test(u)));
  assert.equal(res.statusCode === 200 || res.statusCode === 503, true);
  const html = serviceDocument(
    template,
    { name: 'Gas', slug: 'gas', requiresLicense: true, category: { name: 'Hogar', slug: 'hogar' } },
    [],
    'https://example.test',
    loadTs('../src/app/features/client/services/service-landing-content.ts').landingProfessionals(items),
  );
  assert.match(html, /<h2>Gasistas en Resuelve<\/h2>/);
  assert.match(html, /<a href="\/p\/ana-gomez">Ana Gómez<\/a> · Gasista matriculada · 4,8 ★ · 8 reseñas/);
  assert.match(html, /<a href="\/p\/beto-paz">Beto Paz<\/a><\/li>/);
  assert.doesNotMatch(html, /Sin enlace/);
  const empty = serviceDocument(template, { name: 'Gas', slug: 'gas', requiresLicense: true, category: { name: 'H', slug: 'h' } }, [], 'https://example.test');
  assert.doesNotMatch(empty, /en Resuelve<\/h2>/);
});
test('llms.txt: Markdown con un solo H1 y un enlace a cada servicio con guía', () => {
  const { SERVICE_GUIDES } = loadTs('../src/app/features/client/services/service-landing-content.ts');
  const txt = fs.readFileSync(require('node:path').join(__dirname, '../public/llms.txt'), 'utf8');
  assert.equal((txt.match(/^# /gm) || []).length, 1);
  for (const slug of Object.keys(SERVICE_GUIDES)) assert.match(txt, new RegExp(`\\(https://resuelve\\.com\\.ar/servicios/${slug}\\)`), `falta ${slug}`);
  assert.doesNotMatch(txt, /\$|gratis|garant/i);
});
test('pie: cada enlace de oficio apunta a un servicio con guía y usa su nombre de oficio', () => {
  const { SERVICE_GUIDES } = loadTs('../src/app/features/client/services/service-landing-content.ts');
  const { FOOTER_SERVICE_LINKS } = loadTs('../src/app/shared/components/site-footer/footer-services.ts');
  for (const { slug, label } of FOOTER_SERVICE_LINKS) {
    const many = SERVICE_GUIDES[slug]?.trade?.many;
    assert.ok(many, `sin oficio: ${slug}`);
    assert.equal(label, `${many.charAt(0).toUpperCase()}${many.slice(1)}`);
  }
});
