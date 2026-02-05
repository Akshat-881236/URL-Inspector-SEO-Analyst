(function () {
  'use strict';

  // --- CONFIG ---
  const ALLOWED_PREFIX = 'https://akshat-881236.github.io/';
  const MAX_SCORE = 50; // Maximum marks

  // Notes / help content shown when a factor is missing
  const NOTES = {
    title: 'A <title> tag defines the page title displayed in search results and browser tabs. It is essential for relevance and CTR.',
    metaDescription: 'Meta description helps searchers understand the page content and can improve click-through rates in search results.',
    h1: 'At least one <h1> helps clarify the main topic for users and search engines.',
    h2: 'Using <h2> for subheadings improves content structure and scannability.',
    paragraphs: 'Multiple paragraphs indicate content depth; aim for several informative paragraphs.',
    internalLinks: 'Internal links keep users on your site and help distribute link equity across pages.',
    externalLinks: 'Relevant external links to trustworthy sources can help user trust and context.',
    nav: 'A <nav> element helps users and crawlers find main sections of the site.',
    breadcrumb: 'Breadcrumb schema helps search engines display hierarchical navigation in results.',
    jsonld: 'JSON-LD structured data helps search engines understand entities on the page.',
    canonical: 'A rel="canonical" link clarifies the canonical URL for the page and avoids duplicate content.',
    canonicalDomain: 'Canonical should point to the correct domain/version of the URL (helps avoid cross-domain canonical mismatch).',
    og: 'Open Graph (og:) tags provide rich link previews on social platforms.',
    twitter: 'Twitter Card tags provide optimized sharing on Twitter.',
    og_consistency: 'Title/description/url/image/type should remain consistent across Title / OG / Twitter / Canonical for best results.',
    metaAuthorship: 'Author/creator/developer/copyright/owner/contact meta tags help establish content ownership and attribution.',
    hreflang: 'Hreflang indicates page language/region targeting for international SEO.',
    langAttr: 'The HTML lang attribute helps search engines know the page language.',
    altText: 'Images should have alt text for accessibility and SEO.',
    structuredData: 'Structured data (JSON-LD) helps search engines understand the page (articles, breadcrumbs, products...).'
  };

  // DOM helpers
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // UI elements expected by the page
  const runBtn = $('#runBtn');
  const clearBtn = $('#clearBtn');
  const url1El = $('#url1');
  const url2El = $('#url2');
  const quickEl = $('#quick');
  const feedbackEl = $('#feedback');

  const tabs = $$('.tab');
  const panels = { iframe: $('#iframePanel'), source: $('#sourcePanel'), seo: $('#seoPanel') };
  const iframeArea = $('#iframeArea');
  const sourceArea = $('#sourceArea');
  const seoArea = $('#seoArea');
  const detailsEl = $('#details');

  // Device control element class names assumed to be present
  let deviceMode = 'mobile';
  $$('.device-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.device-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      deviceMode = btn.dataset.device;
      updateIframeSizing();
    });
  });

  // Tabs behavior
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      tabs.forEach((x) => {
        x.classList.remove('active');
        x.setAttribute('aria-selected', 'false');
      });
      t.classList.add('active');
      t.setAttribute('aria-selected', 'true');
      const name = t.dataset.tab;
      Object.keys(panels).forEach((k) => {
        panels[k].hidden = k !== name;
      });
    })
  );

  // Quick select
  quickEl && quickEl.addEventListener('change', () => {
    if (quickEl.value) url1El.value = quickEl.value;
  });

try {
  const ref = document.referrer || '';
  if (ref && ref.startsWith(ALLOWED_PREFIX)) {
    // Only auto-fill if user hasn't already supplied ?url
    const params = new URLSearchParams(location.search);
    if (!params.has('url')) {
      url1El.value = ref;
      // small delay so UI settles (iframes rendering etc.)
      setTimeout(() => {
        // double-check validation before running
        const v = validateUrl(ref);
        if (v.ok) runInspection();
      }, 250);
    }
  }
} catch (e) {
  // silent fail — do not spam console
}

  // Clear
  clearBtn && clearBtn.addEventListener('click', () => {
    url1El.value = '';
    url2El.value = '';
    feedbackEl.style.display = 'none';
    iframeArea.innerHTML =
      '<div class="iframe-card"><div class="iframe-title">No inspection yet. Use Run / Inspect to start.</div></div>';
    sourceArea.innerHTML = '<div style="color:var(--muted)">No source loaded yet.</div>';
    seoArea.innerHTML = '<div style="color:var(--muted)">No SEO analysis yet.</div>';
    detailsEl.textContent = 'Awaiting run.';
  });

  // Run
  runBtn && runBtn.addEventListener('click', runInspection);
  [url1El, url2El].forEach((el) => {
    el && el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runInspection();
    });
  });

  // Copy source / Reflow features (if they exist on the page)
  $('#copySource') &&
    $('#copySource').addEventListener('click', async () => {
      const codes = sourceArea.querySelectorAll('code');
      if (!codes || codes.length === 0) {
        showFeedback('No source to copy.', true);
        return;
      }
      const txt = Array.from(codes)
        .map((c) => c.textContent)
        .join('\n\n---\n\n');
      try {
        await navigator.clipboard.writeText(txt);
        showFeedback('Source copied to clipboard.', false, 2000);
      } catch (e) {
        showFeedback('Failed to copy (clipboard not available).', true);
      }
    });

  $('#reflow') &&
    $('#reflow').addEventListener('click', () => {
      if (window.Prism) Prism.highlightAll();
    });

  function showFeedback(msg, isError = true, timeout = 3500) {
    if (!feedbackEl) return;
    feedbackEl.style.display = 'block';
    feedbackEl.style.color = isError ? 'var(--bad)' : 'var(--accent)';
    feedbackEl.textContent = msg;
    if (timeout > 0) setTimeout(() => (feedbackEl.style.display = 'none'), timeout);
  }

  function validateUrl(url) {
    if (!url || typeof url !== 'string') return { ok: false, reason: 'Empty URL' };
    url = url.trim();
    if (!(url.startsWith('http://') || url.startsWith('https://')))
      return { ok: false, reason: 'URL must start with https:// or http://' };
    if (!url.startsWith(ALLOWED_PREFIX))
      return { ok: false, reason: `Only ANH URLs allowed (must start with ${ALLOWED_PREFIX})` };
    try {
      new URL(url);
    } catch (e) {
      return { ok: false, reason: 'Malformed URL' };
    }
    return { ok: true, url };
  }

  // ---- Fetch / iframe extraction ----
  async function fetchSource(url) {
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) return { ok: false, error: `${resp.status} ${resp.statusText}` };
      const text = await resp.text();
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Network/CORS error' };
    }
  }

  // Try extracting HTML from same-origin iframe (fallback when fetch fails).
  async function tryExtractFromIframe(url, waitMs = 800) {
    try {
      const iframes = iframeArea.querySelectorAll('iframe');
      for (const f of iframes) {
        // Compare absolute src - some browsers add trailing slashes so normalize
        if (!f.src) continue;
        const normalizedSrc = f.src.replace(/\/+$/, '');
        const normalizedUrl = url.replace(/\/+$/, '');
        if (normalizedSrc === normalizedUrl) {
          // Wait shortly for iframe load if needed
          if (f.contentDocument && f.contentDocument.documentElement)
            return f.contentDocument.documentElement.outerHTML;
          // else wait a bit
          await new Promise((r) => setTimeout(r, waitMs));
          try {
            if (f.contentDocument && f.contentDocument.documentElement)
              return f.contentDocument.documentElement.outerHTML;
          } catch (e) {
            return null;
          }
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  // ---- Analysis functions ----
  function extractMetaMap(doc) {
    // return { metaByName: {name: content}, metaByProperty: {property: content} }
    const metaByName = {};
    const metaByProperty = {};
    doc.querySelectorAll('meta').forEach((m) => {
      const name = (m.getAttribute('name') || '').trim().toLowerCase();
      const prop = (m.getAttribute('property') || '').trim().toLowerCase();
      const itemprop = (m.getAttribute('itemprop') || '').trim().toLowerCase();
      const content = m.getAttribute('content') || m.getAttribute('value') || '';
      if (name) metaByName[name] = content;
      if (prop) metaByProperty[prop] = content;
      if (itemprop) metaByProperty[itemprop] = content;
    });
    return { metaByName, metaByProperty };
  }

  function analyzeHTML(htmlStr, baseUrl) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlStr, 'text/html');

      // Basic presence checks
      const titleTag = doc.querySelector('title');
      const title = !!(titleTag && titleTag.textContent && titleTag.textContent.trim().length > 0);
      const titleText = title ? titleTag.textContent.trim() : '';

      const metaMap = extractMetaMap(doc);
      const metaDescription = !!metaMap.metaByName['description'] || !!metaMap.metaByProperty['og:description'] || false;
      const metaDescriptionText = metaMap.metaByName['description'] || metaMap.metaByProperty['og:description'] || '';

      const h1 = doc.querySelectorAll('h1').length > 0;
      const h2 = doc.querySelectorAll('h2').length > 0;
      const paragraphs = doc.querySelectorAll('p').length;
      const paragraphsDepth = paragraphs > 3;

      // anchors
      const anchors = Array.from(doc.querySelectorAll('a[href], a[onclick]'));
      const anchorCount = anchors.length;
      const internalAnchors = anchors.filter((a) => {
        const href = (a.getAttribute('href') || '').trim();
        if (!href) return false;
        // relative links are internal
        if (href.startsWith('/') || href.startsWith('#') || !href.startsWith('http')) return true;
        try {
          return new URL(href, baseUrl).href.startsWith(ALLOWED_PREFIX);
        } catch (e) {
          return false;
        }
      });
      const externalAnchors = anchors.filter((a) => {
        const href = (a.getAttribute('href') || '').trim();
        if (!href) return false;
        if (!href.startsWith('http')) return false;
        try {
          return !new URL(href).href.startsWith(ALLOWED_PREFIX);
        } catch (e) {
          return false;
        }
      });
      const navAnchors = Array.from(doc.querySelectorAll('nav a[href]'));
      const actionAnchors = anchors.filter((a) => {
        const onclick = a.getAttribute('onclick');
        const href = (a.getAttribute('href') || '').trim();
        return !!onclick || href.toLowerCase().startsWith('javascript:');
      });

      // Navigation presence
      const nav = !!doc.querySelector('nav');

      // Breadcrumb & JSON-LD
      const jsonLdScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
      let jsonld = false;
      let breadcrumb = false;
      if (jsonLdScripts.length > 0) {
        jsonld = true;
        for (const s of jsonLdScripts) {
          const txt = s.textContent || '';
          try {
            const parsed = JSON.parse(txt);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            for (const entry of arr) {
              if (entry && typeof entry === 'object') {
                const t = String(entry['@type'] || entry['type'] || '').toLowerCase();
                if (t && t.includes('breadcrumb')) breadcrumb = true;
                if (!breadcrumb && JSON.stringify(entry).toLowerCase().includes('breadcrumblist')) breadcrumb = true;
              }
            }
          } catch (e) {
            // ignore invalid JSON-LD
          }
        }
      }
      if (!breadcrumb) {
        const breadcrumbNav = doc.querySelector('nav[aria-label*="breadcrumb" i], nav.breadcrumb, [itemtype*="BreadcrumbList"]');
        if (breadcrumbNav) breadcrumb = true;
      }

      // canonical
      let canonical = null;
      const canonicalEl = doc.querySelector('link[rel="canonical"]');
      if (canonicalEl) canonical = (canonicalEl.getAttribute('href') || '').trim();

      // Open Graph parsing (og:title, og:description, og:type, og:url, og:image)
      const og = {
        title: metaMap.metaByProperty['og:title'] || '',
        description: metaMap.metaByProperty['og:description'] || '',
        type: metaMap.metaByProperty['og:type'] || '',
        url: metaMap.metaByProperty['og:url'] || '',
        image: metaMap.metaByProperty['og:image'] || ''
      };
      const ogPresent = !!(og.title || og.description || og.type || og.url || og.image);

      // Twitter card parsing
      const twitter = {
        card: metaMap.metaByName['twitter:card'] || '',
        title: metaMap.metaByName['twitter:title'] || '',
        description: metaMap.metaByName['twitter:description'] || '',
        image: metaMap.metaByName['twitter:image'] || ''
      };
      const twitterPresent = !!(twitter.card || twitter.title || twitter.description || twitter.image);

      // Language attribute
      const htmlLang = (doc.documentElement && doc.documentElement.lang) ? doc.documentElement.lang : '';

      // Hreflang presence
      const hreflangs = Array.from(doc.querySelectorAll('link[rel="alternate"][hreflang]')).map((l) => l.getAttribute('hreflang'));

      // Image alt ratio (imgs with alt)
      const imgs = Array.from(doc.querySelectorAll('img'));
      const imgsWithAlt = imgs.filter((i) => {
        const alt = i.getAttribute('alt');
        return alt && alt.trim().length > 0;
      });

      // Hreflang presence boolean
      const hreflangPresent = hreflangs.length > 0;

      // Meta authorship fields collection
      const authorKeys = [
        'author',
        'creator',
        'publisher',
        'copyright',
        'copyright-holder',
        'designer',
        'developer',
        'owner',
        'ownership',
        'contact',
        'dc.creator',
        'dc.contributor'
      ];
      const authors = {};
      authorKeys.forEach((k) => {
        if (metaMap.metaByName[k]) authors[k] = metaMap.metaByName[k];
      });

      // Consistency checks: title/description/url/image/type across Title / OG / Twitter / Canonical
      function normalize(s) {
        return String(s || '').trim().replace(/\s+/g, ' ');
      }
      const consistency = {
        titleSame: normalize(titleText) && (normalize(titleText) === normalize(og.title) || normalize(titleText) === normalize(twitter.title)),
        descriptionSame:
          normalize(metaDescriptionText) &&
          (normalize(metaDescriptionText) === normalize(og.description) || normalize(metaDescriptionText) === normalize(twitter.description)),
        urlSame:
          canonical &&
          (normalize(canonical) === normalize(og.url) || normalize(canonical) === normalize(twitter.image) /*not url but keep fallback*/),
        imageSame: normalize(og.image) && normalize(og.image) === normalize(twitter.image),
        typePresent: !!og.type
      };

      return {
        parsedDocument: doc,
        title,
        titleText,
        metaDescription,
        metaDescriptionText,
        h1,
        h2,
        paragraphsCount: paragraphs,
        paragraphsDepth,
        anchorsCount: anchorCount,
        internalLinksCount: internalAnchors.length,
        externalLinksCount: externalAnchors.length,
        navLinksCount: navAnchors.length,
        actionLinksCount: actionAnchors.length,
        nav,
        breadcrumb,
        jsonld,
        canonical,
        og,
        ogPresent,
        twitter,
        twitterPresent,
        htmlLang,
        hreflangs,
        hreflangPresent,
        imgsCount: imgs.length,
        imgsWithAltCount: imgsWithAlt.length,
        authors, // map of found authorship related meta
        consistency
      };
    } catch (e) {
      return { error: 'Failed to parse HTML' };
    }
  }

  // ---- SEO factors and scoring ----
  // We'll use 25 factors * 2 points each = 50 max
  const FACTOR_DEFINITIONS = [
    { key: 'title', name: 'Title tag present', noteKey: 'title' },
    { key: 'metaDescription', name: 'Meta description present', noteKey: 'metaDescription' },
    { key: 'h1', name: 'H1 tag present', noteKey: 'h1' },
    { key: 'h2', name: 'H2 structure present', noteKey: 'h2' },
    { key: 'paragraphsDepth', name: 'Paragraph content depth (>3 <p>)', noteKey: 'paragraphs' },
    { key: 'internalLinksPresent', name: 'Internal links (ANH domain)', noteKey: 'internalLinks' },
    { key: 'externalLinksPresent', name: 'External links (non-ANH)', noteKey: 'externalLinks' },
    { key: 'nav', name: 'Navigation links (<nav>)', noteKey: 'nav' },
    { key: 'breadcrumb', name: 'Breadcrumb schema (schema.org)', noteKey: 'breadcrumb' },
    { key: 'jsonld', name: 'JSON-LD structured data present', noteKey: 'jsonld' },

    // Canonical & domain checks
    { key: 'canonical', name: 'Canonical link present', noteKey: 'canonical' },
    { key: 'canonicalDomain', name: 'Canonical matches ANH domain', noteKey: 'canonicalDomain' },

    // Open Graph
    { key: 'ogPresent', name: 'Open Graph tags present', noteKey: 'og' },
    { key: 'ogTitle', name: 'OG: title present', noteKey: 'og' },
    { key: 'ogDescription', name: 'OG: description present', noteKey: 'og' },
    { key: 'ogType', name: 'OG: type present', noteKey: 'og' },
    { key: 'ogUrl', name: 'OG: url present', noteKey: 'og' },
    { key: 'ogImage', name: 'OG: image present', noteKey: 'og' },

    // Twitter Card
    { key: 'twitterPresent', name: 'Twitter Card present', noteKey: 'twitter' },
    { key: 'twitterTitle', name: 'Twitter: title present', noteKey: 'twitter' },
    { key: 'twitterDescription', name: 'Twitter: description present', noteKey: 'twitter' },
    { key: 'twitterImage', name: 'Twitter: image present', noteKey: 'twitter' },

    // Consistency across Title/OG/Twitter/Canonical (important)
    { key: 'consistencyTitle', name: 'Title consistency across Title/OG/Twitter', noteKey: 'og_consistency' },
    { key: 'consistencyDescription', name: 'Description consistency across Meta/OG/Twitter', noteKey: 'og_consistency' },
    { key: 'imageConsistency', name: 'Image consistency across OG/Twitter', noteKey: 'og_consistency' }
  ];

  // Each factor is worth 2 points (25 * 2 = 50)
  const POINTS_PER_FACTOR = MAX_SCORE / FACTOR_DEFINITIONS.length;

  function scoreSEO(analysis) {
    if (!analysis || analysis.error) {
      return { score: 0, factors: FACTOR_DEFINITIONS.map((f) => ({ ...f, pass: false })) };
    }

    const factors = FACTOR_DEFINITIONS.map((f) => {
      let pass = false;
      switch (f.key) {
        case 'title':
          pass = !!analysis.title;
          break;
        case 'metaDescription':
          pass = !!analysis.metaDescription;
          break;
        case 'h1':
          pass = !!analysis.h1;
          break;
        case 'h2':
          pass = !!analysis.h2;
          break;
        case 'paragraphsDepth':
          pass = !!analysis.paragraphsDepth;
          break;
        case 'internalLinksPresent':
          pass = analysis.internalLinksCount > 0;
          break;
        case 'externalLinksPresent':
          pass = analysis.externalLinksCount > 0;
          break;
        case 'nav':
          pass = !!analysis.nav;
          break;
        case 'breadcrumb':
          pass = !!analysis.breadcrumb;
          break;
        case 'jsonld':
          pass = !!analysis.jsonld;
          break;
        case 'canonical':
          pass = !!analysis.canonical;
          break;
        case 'canonicalDomain':
          pass = !!analysis.canonical && analysis.canonical.startsWith(ALLOWED_PREFIX);
          break;
        case 'ogPresent':
          pass = !!analysis.ogPresent;
          break;
        case 'ogTitle':
          pass = !!analysis.og.title;
          break;
        case 'ogDescription':
          pass = !!analysis.og.description;
          break;
        case 'ogType':
          pass = !!analysis.og.type;
          break;
        case 'ogUrl':
          pass = !!analysis.og.url;
          break;
        case 'ogImage':
          pass = !!analysis.og.image;
          break;
        case 'twitterPresent':
          pass = !!analysis.twitterPresent;
          break;
        case 'twitterTitle':
          pass = !!analysis.twitter.title;
          break;
        case 'twitterDescription':
          pass = !!analysis.twitter.description;
          break;
        case 'twitterImage':
          pass = !!analysis.twitter.image;
          break;
        case 'consistencyTitle':
          pass = !!analysis.consistency.titleSame;
          break;
        case 'consistencyDescription':
          pass = !!analysis.consistency.descriptionSame;
          break;
        case 'imageConsistency':
          pass = !!analysis.consistency.imageSame;
          break;
        default:
          pass = false;
      }
      return { ...f, pass };
    });

    const score = Math.round(
      factors.reduce((sum, f) => (f.pass ? sum + POINTS_PER_FACTOR : sum), 0)
    );

    return { score, factors };
  }

  // ---- Renderers (extend existing UI) ----
  function createIframeCard(url, idx) {
    const wrap = document.createElement('div');
    wrap.className = 'iframe-card';
    const title = document.createElement('div');
    title.className = 'iframe-title';
    title.textContent = `Preview — ${url}`;
    wrap.appendChild(title);

    const iframe = document.createElement('iframe');
    iframe.className = 'preview-frame';
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms');
    iframe.src = url;
    iframe.title = `Preview ${idx}`;
    iframe.loading = 'lazy';
    wrap.appendChild(iframe);
    return wrap;
  }

  function updateIframeSizing() {
    const frames = iframeArea.querySelectorAll('.preview-frame');
    frames.forEach((f) => {
      if (deviceMode === 'mobile') {
        f.style.width = '375px';
        f.style.height = '667px';
      } else if (deviceMode === 'tablet') {
        f.style.width = '768px';
        f.style.height = '1024px';
      } else if (deviceMode === 'laptop') {
        f.style.width = '100%';
        f.style.height = '768px';
      } else {
        f.style.width = '100%';
        f.style.height = '800px';
      }
      const containerWidth = iframeArea.clientWidth;
      // fallback to responsive width
      if (parseInt(f.style.width) && parseInt(f.style.width) > containerWidth) f.style.width = '100%';
    });
  }

  function renderSourceBlocks(sources) {
    if (!sources || sources.length === 0) {
      sourceArea.innerHTML = '<div style="color:var(--muted)">No source loaded yet.</div>';
      return;
    }
    sourceArea.innerHTML = '';
    sources.forEach((s) => {
      const header = document.createElement('div');
      header.style.color = 'var(--muted)';
      header.style.marginBottom = '8px';
      header.textContent = s.fetchError
        ? `Source: ${s.url} — fetch failed: ${s.fetchError}`
        : `Source: ${s.url}${s.extracted ? ' (extracted from iframe)' : ''}`;
      const pre = document.createElement('pre');
      pre.className = 'code language-markup';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
      const code = document.createElement('code');
      code.className = 'language-markup';
      code.textContent = s.text || (s.fetchError ? `/* ${s.fetchError} */` : '/* no source */');
      pre.appendChild(code);
      sourceArea.appendChild(header);
      sourceArea.appendChild(pre);
    });
    if (window.Prism) Prism.highlightAll();
  }

  function renderSEOReports(reports) {
    if (!reports || reports.length === 0) {
      seoArea.innerHTML = '<div style="color:var(--muted)">No SEO analysis yet.</div>';
      return;
    }
    seoArea.innerHTML = '';
    const container = document.createElement('div');
    container.className = reports.length > 1 ? 'compare' : '';

    reports.forEach((rep) => {
      const box = document.createElement('div');
      box.style.padding = '10px';
      box.style.borderRadius = '10px';
      box.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.01), transparent)';
      box.style.border = '1px solid var(--border)';

      const title = document.createElement('div');
      title.style.fontWeight = '700';
      title.style.marginBottom = '8px';
      title.textContent = rep.url;
      box.appendChild(title);

      if (rep.fetchError && !rep.analysis) {
        const err = document.createElement('div');
        err.style.color = 'var(--bad)';
        err.textContent = 'Failed to fetch and could not extract source: ' + rep.fetchError;
        box.appendChild(err);
      } else if (rep.analysis) {
        const sum = document.createElement('div');
        sum.className = 'seo-summary';

        const bubble = document.createElement('div');
        bubble.className = 'score-bubble';
        const big = document.createElement('div');
        big.className = 'score-big';
        big.textContent = rep.seo.score + ' / ' + MAX_SCORE;
        const small = document.createElement('div');
        small.style.color = 'var(--muted)';
        small.style.fontSize = '12px';
        small.textContent = 'Heuristic SEO Score';
        bubble.appendChild(big);
        bubble.appendChild(small);
        sum.appendChild(bubble);

        const d = document.createElement('div');
        d.style.color = 'var(--muted)';
        d.style.fontSize = '13px';
        d.innerHTML = `<div>Anchors: ${rep.analysis.anchorsCount || 0}</div>
                       <div>Internal: ${rep.analysis.internalLinksCount || 0}</div>
                       <div>External: ${rep.analysis.externalLinksCount || 0}</div>
                       <div>Nav Links: ${rep.analysis.navLinksCount || 0}</div>
                       <div>Action Links: ${rep.analysis.actionLinksCount || 0}</div>`;
        sum.appendChild(d);
        box.appendChild(sum);

        // Factors
        const list = document.createElement('div');
        list.className = 'seo-list';
        rep.seo.factors.forEach((f) => {
          const item = document.createElement('div');
          item.className = 'seo-item';
          const icon = document.createElement('div');
          icon.style.width = '22px';
          icon.style.height = '22px';
          icon.innerHTML = f.pass
            ? '<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:linear-gradient(180deg,#03260d,#042a0f)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
            : '<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:linear-gradient(180deg,#2a0b09,#3b0f0d)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
          const body = document.createElement('div');
          const h = document.createElement('div');
          h.style.fontWeight = '600';
          h.textContent = f.name + (f.pass ? ' — present' : ' — missing');
          body.appendChild(h);
          if (!f.pass) {
            const p = document.createElement('div');
            p.className = 'note';
            p.textContent = NOTES[f.noteKey] || 'Recommendation: add this element.';
            body.appendChild(p);
          }
          item.appendChild(icon);
          item.appendChild(body);
          list.appendChild(item);
        });
        box.appendChild(list);

        // Meta authorship display
        const authDiv = document.createElement('div');
        authDiv.style.marginTop = '10px';
        const authKeys = Object.keys(rep.analysis.authors || {});
        if (authKeys.length > 0) {
          const heading = document.createElement('div');
          heading.style.fontWeight = '700';
          heading.style.marginTop = '10px';
          heading.textContent = 'Authorship / Ownership Meta';
          authDiv.appendChild(heading);
          authKeys.forEach((k) => {
            const row = document.createElement('div');
            row.style.color = 'var(--muted)';
            row.style.fontSize = '13px';
            row.textContent = `${k}: ${rep.analysis.authors[k]}`;
            authDiv.appendChild(row);
          });
        } else {
          const heading = document.createElement('div');
          heading.style.fontWeight = '700';
          heading.style.marginTop = '10px';
          heading.textContent = 'Authorship / Ownership Meta';
          const none = document.createElement('div');
          none.style.color = 'var(--muted)';
          none.style.fontSize = '13px';
          none.textContent = 'No common authorship/ownership meta tags found.';
          authDiv.appendChild(heading);
          authDiv.appendChild(none);
        }
        box.appendChild(authDiv);

        // Ratios summary
        const ratioDiv = document.createElement('div');
        ratioDiv.style.marginTop = '10px';
        ratioDiv.style.color = 'var(--muted)';
        ratioDiv.style.fontSize = '13px';
        const totalAnchors = rep.analysis.anchorsCount || 0;
        const internal = rep.analysis.internalLinksCount || 0;
        const external = rep.analysis.externalLinksCount || 0;
        const navLinks = rep.analysis.navLinksCount || 0;
        const actions = rep.analysis.actionLinksCount || 0;
        const perc = (n) => (totalAnchors === 0 ? '0%' : Math.round((n / totalAnchors) * 100) + '%');
        ratioDiv.innerHTML = `<div style="font-weight:700;margin-top:8px">Link Ratios</div>
                              <div>Internal: ${internal} (${perc(internal)})</div>
                              <div>External: ${external} (${perc(external)})</div>
                              <div>Navigation: ${navLinks} (${perc(navLinks)})</div>
                              <div>Action links (onclick/js:): ${actions} (${perc(actions)})</div>`;
        box.appendChild(ratioDiv);

        // Quick consistency detail (show canonical & OG & twitter & title)
        const details = document.createElement('div');
        details.style.marginTop = '10px';
        details.style.color = 'var(--muted)';
        details.style.fontSize = '13px';
        details.innerHTML = `<div style="font-weight:700">Key metadata</div>
                             <div>Canonical: ${rep.analysis.canonical || '—'}</div>
                             <div>OG Title: ${rep.analysis.og.title || '—'}</div>
                             <div>OG Description: ${rep.analysis.og.description || '—'}</div>
                             <div>OG Type: ${rep.analysis.og.type || '—'}</div>
                             <div>OG URL: ${rep.analysis.og.url || '—'}</div>
                             <div>OG Image: ${rep.analysis.og.image || '—'}</div>
                             <div>Twitter Card: ${rep.analysis.twitter.card || '—'}</div>
                             <div>Twitter Title: ${rep.analysis.twitter.title || '—'}</div>
                             <div>Twitter Description: ${rep.analysis.twitter.description || '—'}</div>
                             <div>Twitter Image: ${rep.analysis.twitter.image || '—'}</div>`;
        box.appendChild(details);
      }

      container.appendChild(box);
    });

    // append quick links summary area (single place after reports)
    const quickBox = document.createElement('div');
    quickBox.style.marginTop = '12px';
    quickBox.style.padding = '10px';
    quickBox.style.borderRadius = '10px';
    quickBox.style.border = '1px solid var(--border)';
    quickBox.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.01), transparent)';
    quickBox.innerHTML = `<div style="font-weight:700;margin-bottom:8px">Quick Links — Akshat Network Hub Resources</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <a href="https://akshat-881236.github.io/WebDevelopmentCourse/Html/Tutorial/index.htm" target="_blank" rel="noopener" style="color:var(--accent)">HTML Tutorial</a>
        <a href="https://akshat-881236.github.io/WebDevelopmentCourse/SEO/Tutorial/index.htm" target="_blank" rel="noopener" style="color:var(--accent)">SEO Tutorial</a>
        <a href="https://akshat-881236.github.io/WebDevelopmentCourse/CSS/Tutorial/index.htm" target="_blank" rel="noopener" style="color:var(--accent)">CSS Tutorial</a>
        <a href="https://akshat-881236.github.io/WebDevelopmentCourse/JavaScript/Tutorial/index.htm" target="_blank" rel="noopener" style="color:var(--accent)">JavaScript Tutorial</a>
        <a href="https://akshat-881236.github.io/DSA/C_Cpp/Tutorial/index.htm" target="_blank" rel="noopener" style="color:var(--accent)">C / C++</a>
        <a href="https://akshat-881236.github.io/DSA/Java/Tutorial/index.htm" target="_blank" rel="noopener" style="color:var(--accent)">Java</a>
        <a href="https://akshat-881236.github.io/DSA/MySQL/Tutorial/index.htm" target="_blank" rel="noopener" style="color:var(--accent)">MySQL</a>
        <a href="https://akshat-881236.github.io/DSA/Python/Tutorial/index.htm" target="_blank" rel="noopener" style="color:var(--accent)">Python</a>
      </div>`;

    seoArea.appendChild(container);
    seoArea.appendChild(quickBox);
  }

  function updateDetails(reports) {
    if (!reports || reports.length === 0) {
      detailsEl.textContent = 'Awaiting run.';
      return;
    }
    detailsEl.innerHTML = reports
      .map((r) => {
        if (r.fetchError && !r.analysis) return `<div style="color:var(--muted)">${r.url} — fetch failed: ${r.fetchError}</div>`;
        return `<div style="color:var(--muted)">${r.url} — Score: ${r.seo.score}/${MAX_SCORE} — Anchors: ${r.analysis.anchorsCount || 0}</div>`;
      })
      .join('');
  }

  // ---- Main runner: fetch in parallel; if fetch fails, try iframe extraction ----
  async function runInspection() {
    feedbackEl && (feedbackEl.style.display = 'none');
    const raw1 = url1El.value.trim();
    const raw2 = url2El.value.trim();

    const v1 = validateUrl(raw1);
    if (!v1.ok) {
      showFeedback('URL 1 error: ' + v1.reason, true);
      url1El.focus();
      return;
    }
    const doCompare = raw2.length > 0;
    let v2 = null;
    if (doCompare) {
      v2 = validateUrl(raw2);
      if (!v2.ok) {
        showFeedback('URL 2 error: ' + v2.reason, true);
        url2El.focus();
        return;
      }
    }

    iframeArea.innerHTML = '';
    sourceArea.innerHTML = '<div style="color:var(--muted)">Fetching source...</div>';
    seoArea.innerHTML = '<div style="color:var(--muted)">Analyzing...</div>';
    detailsEl.textContent = 'Running inspection...';

    const urls = doCompare ? [v1.url, v2.url] : [v1.url];

    // Render preview iframes first so extraction fallback can access them
    iframeArea.innerHTML = '';
    if (urls.length === 1) {
      iframeArea.appendChild(createIframeCard(urls[0], 1));
    } else {
      iframeArea.appendChild(createIframeCard(urls[0], 1));
      iframeArea.appendChild(createIframeCard(urls[1], 2));
    }
    setTimeout(updateIframeSizing, 250);

    // Fetch in parallel
    const fetchPromises = urls.map((u) => fetchSource(u));
    const results = await Promise.all(fetchPromises);

    const analyses = [];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const fr = results[i];
      if (fr.ok) {
        const analysis = analyzeHTML(fr.text, url);
        const seo = scoreSEO(analysis);
        analyses.push({ url, text: fr.text, analysis, seo, fetchError: undefined, extracted: false });
      } else {
        // try iframe extraction if fetch failed
        let extracted = null;
        try {
          extracted = await tryExtractFromIframe(url);
        } catch (e) {
          extracted = null;
        }
        if (extracted) {
          const analysis = analyzeHTML(extracted, url);
          const seo = scoreSEO(analysis);
          analyses.push({
            url,
            text: extracted,
            analysis,
            seo,
            fetchError: fr.error + ' (fetched failed, extracted from iframe)',
            extracted: true
          });
        } else {
          analyses.push({ url, text: null, analysis: null, seo: null, fetchError: fr.error, extracted: false });
        }
      }
    }

    const sourcesForRender = analyses.map((a) => ({ url: a.url, text: a.text, fetchError: a.fetchError, extracted: a.extracted }));
    renderSourceBlocks(sourcesForRender);

    const seoReports = analyses.map((a) => {
      return { url: a.url, analysis: a.analysis, seo: a.seo, fetchError: a.fetchError };
    });
    renderSEOReports(seoReports);
    updateDetails(seoReports);

    showFeedback('Inspection complete.', false, 2400);
  }

  // Auto-inspect on load if ?url param present or referrer is ANH
  function autoInspectFromParams() {
    try {
      const params = new URLSearchParams(location.search);
      const pUrl = params.get('url');
      const pCompare = params.get('compare');
      if (pUrl) {
        url1El.value = pUrl;
        if (pCompare) url2El.value = pCompare;
        const v = validateUrl(pUrl);
        if (v.ok) runInspection();
        else showFeedback('Auto-filled URL is invalid: ' + v.reason, true);
      } else {
        const ref = document.referrer || '';
        if (ref && ref.startsWith(ALLOWED_PREFIX)) {
          url1El.value = ref;
          const v = validateUrl(ref);
          if (v.ok) runInspection();
        }
      }
    } catch (e) {
      // no-op
    }
  }

  window.addEventListener('load', () => {
    autoInspectFromParams();
  });

  // Accessibility: suppress console spam (no console logs here)

})();