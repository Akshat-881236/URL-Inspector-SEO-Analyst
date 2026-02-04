(function(){
    'use strict';

    // Allowed prefix & notes DB
    const ALLOWED_PREFIX = 'https://akshat-881236.github.io/';
    const NOTES = {
      title: "A <title> tag defines the page title displayed in search results and browser tabs. It's essential for relevance and CTR.",
      metaDescription: "Meta description helps searchers understand the page content and can improve click-through rates in search results.",
      h1: "At least one <h1> helps clarify the main topic for users and search engines.",
      h2: "Using <h2> for subheadings improves content structure and scannability.",
      paragraphs: "Multiple paragraphs indicate content depth; aim for several informative paragraphs.",
      internalLinks: "Internal links keep users on your site and help distribute link equity across pages.",
      externalLinks: "Relevant external links to trustworthy sources can help user trust and context.",
      nav: "A <nav> element helps users and crawlers find main sections of the site.",
      breadcrumb: "Breadcrumb schema helps search engines display hierarchical navigation in results.",
      jsonld: "JSON-LD structured data helps search engines understand entities on the page."
    };

    // DOM helpers
    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));

    // Elements
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

    // Device mode (default mobile-first)
    let deviceMode = 'mobile';
    $$('.device-btn').forEach(btn => {
      btn.addEventListener('click', ()=>{
        $$('.device-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        deviceMode = btn.dataset.device;
        updateIframeSizing();
      });
    });

    // Tabs
    tabs.forEach(t => t.addEventListener('click', ()=>{
      tabs.forEach(x=>{ x.classList.remove('active'); x.setAttribute('aria-selected','false'); });
      t.classList.add('active'); t.setAttribute('aria-selected','true');
      const name = t.dataset.tab;
      Object.keys(panels).forEach(k=>{
        panels[k].hidden = (k !== name);
      });
    }));

    // Quick select
    quickEl.addEventListener('change', ()=>{ if(quickEl.value) url1El.value = quickEl.value; });

    // Clear
    clearBtn.addEventListener('click', ()=>{
      url1El.value = ''; url2El.value = '';
      feedbackEl.style.display='none';
      iframeArea.innerHTML = '<div class="iframe-card"><div class="iframe-title">No inspection yet. Use Run / Inspect to start.</div></div>';
      sourceArea.innerHTML = 'No source loaded yet.';
      seoArea.innerHTML = 'No SEO analysis yet.';
      detailsEl.textContent = 'Awaiting run.';
    });

    // Run
    runBtn.addEventListener('click', runInspection);
    [url1El, url2El].forEach(el => el.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') runInspection(); }));

    // Copy source
    $('#copySource').addEventListener('click', async ()=>{
      const codes = sourceArea.querySelectorAll('code');
      if(!codes || codes.length===0){ showFeedback('No source to copy.', true); return; }
      const txt = Array.from(codes).map(c=>c.textContent).join("\n\n---\n\n");
      try{ await navigator.clipboard.writeText(txt); showFeedback('Source copied to clipboard.', false, 2000); }catch(e){ showFeedback('Failed to copy (clipboard not available).', true); }
    });
    $('#reflow').addEventListener('click', ()=>{ Prism.highlightAll(); });

    function showFeedback(msg, isError=true, timeout=3500){
      feedbackEl.style.display='block';
      feedbackEl.style.color = isError ? 'var(--bad)' : 'var(--accent)';
      feedbackEl.textContent = msg;
      if(timeout>0) setTimeout(()=>{ feedbackEl.style.display='none'; }, timeout);
    }

    function validateUrl(url){
      if(!url || typeof url !== 'string') return { ok:false, reason:'Empty URL' };
      url = url.trim();
      if(!(url.startsWith('http://') || url.startsWith('https://'))) return { ok:false, reason:'URL must start with https:// or http://' };
      if(!url.startsWith(ALLOWED_PREFIX)) return { ok:false, reason:`Only ANH URLs allowed (must start with ${ALLOWED_PREFIX})` };
      try{ new URL(url); }catch(e){ return { ok:false, reason:'Malformed URL' }; }
      return { ok:true, url };
    }

    async function fetchSource(url){
      try{
        const resp = await fetch(url, {cache:'no-store'});
        if(!resp.ok) return { ok:false, error:`${resp.status} ${resp.statusText}` };
        const text = await resp.text();
        return { ok:true, text };
      }catch(err){
        return { ok:false, error: err && err.message ? err.message : 'Network/CORS error' };
      }
    }

    // Attempt to extract HTML from the same-origin iframe when fetch failed.
    // This works when the iframe allows embedding and the content is same-origin (which is true for your GitHub Pages domain).
    async function tryExtractFromIframe(url, timeoutMs = 1200){
      try{
        // find iframe with matching src
        const iframes = iframeArea.querySelectorAll('iframe');
        for(const f of iframes){
          if(f.src === url){
            // Wait briefly for iframe to load
            if(f.contentDocument){
              try{
                const doc = f.contentDocument;
                // if contentDocument is accessible, grab outerHTML
                if(doc && doc.documentElement){
                  return doc.documentElement.outerHTML;
                }
              }catch(e){
                // Access denied due to cross-origin or blocked frame
                return null;
              }
            } else {
              // If not loaded yet, wait small interval
              await new Promise(res => setTimeout(res, 300));
              try{
                if(f.contentDocument && f.contentDocument.documentElement) return f.contentDocument.documentElement.outerHTML;
              }catch(e){ return null; }
            }
          }
        }
      }catch(e){
        return null;
      }
      return null;
    }

    function analyzeHTML(htmlStr, baseUrl){
      try{
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlStr, 'text/html');

        const title = !!(doc.querySelector('title') && doc.querySelector('title').textContent.trim().length>0);
        const metaDescription = !!doc.querySelector('meta[name="description"]');
        const h1 = doc.querySelectorAll('h1').length > 0;
        const h2 = doc.querySelectorAll('h2').length > 0;
        const paragraphs = doc.querySelectorAll('p').length > 3;

        const anchors = Array.from(doc.querySelectorAll('a[href]'));
        const internalLinks = anchors.filter(a=>{
          const href = (a.getAttribute('href') || '').trim();
          if(!href) return false;
          if(href.startsWith('/') || href.startsWith('#') || !href.startsWith('http')) return true;
          try{ const u = new URL(href, baseUrl); return u.href.startsWith(ALLOWED_PREFIX); }catch(e){ return false; }
        });
        const externalLinks = anchors.filter(a=>{
          const href = (a.getAttribute('href') || '').trim();
          if(!href) return false;
          if(!href.startsWith('http')) return false;
          try{ const u = new URL(href); return !u.href.startsWith(ALLOWED_PREFIX); }catch(e){ return false; }
        });

        const nav = !!doc.querySelector('nav');
        const jsonLdScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
        let jsonld = false;
        let breadcrumb = false;
        if(jsonLdScripts.length>0){
          jsonld = true;
          for(const s of jsonLdScripts){
            const txt = s.textContent || '';
            try{
              const parsed = JSON.parse(txt);
              const arr = Array.isArray(parsed) ? parsed : [parsed];
              for(const entry of arr){
                if(entry && typeof entry === 'object'){
                  const t = (entry['@type'] || entry['type'] || '').toString();
                  if(t && t.toLowerCase().includes('breadcrumb')) breadcrumb = true;
                  if(!breadcrumb && JSON.stringify(entry).toLowerCase().includes('breadcrumblist')) breadcrumb = true;
                }
              }
            }catch(e){ /* invalid JSON-LD ignored */ }
          }
        }
        if(!breadcrumb){
          const breadcrumbNav = doc.querySelector('nav[aria-label*="breadcrumb" i], nav.breadcrumb, [itemtype*="BreadcrumbList"]');
          if(breadcrumbNav) breadcrumb = true;
        }

        return {
          title, metaDescription, h1, h2, paragraphs,
          internalLinksCount: internalLinks.length,
          externalLinksCount: externalLinks.length,
          internalLinksPresent: internalLinks.length > 0,
          externalLinksPresent: externalLinks.length > 0,
          nav, breadcrumb, jsonld,
          anchorsCount: anchors.length,
          parsedDocument: doc
        };
      }catch(e){
        return { error: 'Failed to parse HTML' };
      }
    }

    function scoreSEO(analysis){
      const factors = [
        { key:'title', pass: !!analysis.title, name:'Title tag present', noteKey:'title' },
        { key:'metaDescription', pass: !!analysis.metaDescription, name:'Meta description present', noteKey:'metaDescription' },
        { key:'h1', pass: !!analysis.h1, name:'H1 tag present', noteKey:'h1' },
        { key:'h2', pass: !!analysis.h2, name:'H2 structure present', noteKey:'h2' },
        { key:'paragraphs', pass: !!analysis.paragraphs, name:'Paragraph content depth (>3 <p>)', noteKey:'paragraphs' },
        { key:'internalLinksPresent', pass: !!analysis.internalLinksPresent, name:'Internal links (ANH domain)', noteKey:'internalLinks' },
        { key:'externalLinksPresent', pass: !!analysis.externalLinksPresent, name:'External links (non-ANH)', noteKey:'externalLinks' },
        { key:'nav', pass: !!analysis.nav, name:'Navigation links (<nav>)', noteKey:'nav' },
        { key:'breadcrumb', pass: !!analysis.breadcrumb, name:'Breadcrumb schema (schema.org)', noteKey:'breadcrumb' },
        { key:'jsonld', pass: !!analysis.jsonld, name:'JSON-LD structured data', noteKey:'jsonld' }
      ];
      let score = 0;
      factors.forEach(f=>{ if(f.pass) score += 2; });
      return { score, factors };
    }

    // Render helpers
    function createIframeCard(url, idx, compareMode){
      const wrap = document.createElement('div');
      wrap.className = 'iframe-card';
      const title = document.createElement('div');
      title.className = 'iframe-title';
      title.textContent = `Preview — ${url}`;
      wrap.appendChild(title);

      const iframe = document.createElement('iframe');
      iframe.className = 'preview-frame';
      // sandbox minimal but allow same-origin for read when allowed
      iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms');
      iframe.src = url;
      iframe.title = `Preview ${idx}`;
      iframe.loading = 'lazy';
      wrap.appendChild(iframe);
      return wrap;
    }

    function updateIframeSizing(){
      const frames = iframeArea.querySelectorAll('.preview-frame');
      frames.forEach(f=>{
        if(deviceMode === 'mobile'){ f.style.width = '375px'; f.style.height = '667px'; }
        else if(deviceMode === 'tablet'){ f.style.width = '768px'; f.style.height = '1024px'; }
        else if(deviceMode === 'laptop'){ f.style.width = '100%'; f.style.height = '768px'; } // 100% width container
        else { f.style.width = '100%'; f.style.height = '800px'; }
        // make responsive: if container is narrower, set width to 100%
        const containerWidth = iframeArea.clientWidth;
        if(parseInt(f.style.width) && parseInt(f.style.width) > containerWidth) f.style.width = '100%';
      });
    }

    function renderSourceBlocks(sources){
      // sources: [{url,text,fetchError,extractedFromIframe}]
      if(!sources || sources.length===0){ sourceArea.innerHTML = '<div style="color:var(--muted)">No source loaded yet.</div>'; return; }
      sourceArea.innerHTML = '';
      sources.forEach(s=>{
        const header = document.createElement('div');
        header.style.color = 'var(--muted)';
        header.style.marginBottom = '8px';
        header.textContent = s.fetchError ? `Source: ${s.url} — fetch failed: ${s.fetchError}` : `Source: ${s.url}${s.extracted ? ' (extracted from iframe)' : ''}`;
        const pre = document.createElement('pre');
        pre.className = 'code language-markup';
        pre.style.whiteSpace = 'pre-wrap'; pre.style.wordBreak = 'break-word';
        const code = document.createElement('code');
        code.className = 'language-markup';
        code.textContent = s.text || (s.fetchError ? `/* ${s.fetchError} */` : '/* no source */');
        pre.appendChild(code);
        sourceArea.appendChild(header);
        sourceArea.appendChild(pre);
      });
      Prism.highlightAll();
    }

    function renderSEOReports(reports){
      if(!reports || reports.length===0){ seoArea.innerHTML = '<div style="color:var(--muted)">No SEO analysis yet.</div>'; return; }
      seoArea.innerHTML = '';
      const container = document.createElement('div');
      container.className = reports.length>1 ? 'compare' : '';
      reports.forEach(rep=>{
        const box = document.createElement('div');
        box.style.padding = '10px'; box.style.borderRadius = '10px'; box.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.01), transparent)'; box.style.border = '1px solid var(--border)';
        const title = document.createElement('div'); title.style.fontWeight='700'; title.style.marginBottom='8px'; title.textContent = rep.url; box.appendChild(title);

        if(rep.fetchError && !rep.analysis){
          const err = document.createElement('div'); err.style.color='var(--bad)'; err.textContent = 'Failed to fetch and could not extract source: ' + rep.fetchError; box.appendChild(err);
        } else if(rep.analysis){
          const sum = document.createElement('div'); sum.className='seo-summary';
          const bubble = document.createElement('div'); bubble.className='score-bubble';
          const big = document.createElement('div'); big.className='score-big'; big.textContent = rep.seo.score + ' / 20';
          const small = document.createElement('div'); small.style.color='var(--muted)'; small.style.fontSize='12px'; small.textContent='Heuristic SEO Score';
          bubble.appendChild(big); bubble.appendChild(small); sum.appendChild(bubble);

          const d = document.createElement('div'); d.style.color='var(--muted)'; d.style.fontSize='13px'; d.innerHTML = `<div>Anchors: ${rep.analysis.anchorsCount || 0}</div><div>Internal: ${rep.analysis.internalLinksCount || 0}</div><div>External: ${rep.analysis.externalLinksCount || 0}</div>`;
          sum.appendChild(d); box.appendChild(sum);

          const list = document.createElement('div'); list.className='seo-list';
          rep.seo.factors.forEach(f=>{
            const item = document.createElement('div'); item.className='seo-item';
            const icon = document.createElement('div'); icon.style.width='22px'; icon.style.height='22px';
            icon.innerHTML = f.pass ? '<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:linear-gradient(180deg,#03260d,#042a0f)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' : '<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:linear-gradient(180deg,#2a0b09,#3b0f0d)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
            const body = document.createElement('div');
            const h = document.createElement('div'); h.style.fontWeight='600'; h.textContent = f.name + (f.pass ? ' — present' : ' — missing');
            body.appendChild(h);
            if(!f.pass){ const p = document.createElement('div'); p.className='note'; p.textContent = NOTES[f.noteKey] || 'Recommendation: add this item.'; body.appendChild(p); }
            item.appendChild(icon); item.appendChild(body); list.appendChild(item);
          });
          box.appendChild(list);
        }
        container.appendChild(box);
      });
      seoArea.appendChild(container);
    }

    function updateDetails(reports){
      if(!reports || reports.length===0){ detailsEl.textContent = 'Awaiting run.'; return; }
      detailsEl.innerHTML = reports.map(r=>{
        if(r.fetchError && !r.analysis) return `<div style="color:var(--muted)">${r.url} — fetch failed: ${r.fetchError}</div>`;
        return `<div style="color:var(--muted)">${r.url} — Score: ${r.seo.score}/20 — Anchors: ${r.analysis.anchorsCount || 0}</div>`;
      }).join('');
    }

    // Main runner: fetch in parallel; if fetch fails, try extracting from iframe content if same-origin
    async function runInspection(){
      feedbackEl.style.display='none';
      const raw1 = url1El.value.trim();
      const raw2 = url2El.value.trim();

      const v1 = validateUrl(raw1);
      if(!v1.ok){ showFeedback('URL 1 error: ' + v1.reason, true); url1El.focus(); return; }
      const doCompare = raw2.length > 0;
      let v2 = null;
      if(doCompare){ v2 = validateUrl(raw2); if(!v2.ok){ showFeedback('URL 2 error: ' + v2.reason, true); url2El.focus(); return; } }

      iframeArea.innerHTML = '';
      sourceArea.innerHTML = '<div style="color:var(--muted)">Fetching source...</div>';
      seoArea.innerHTML = '<div style="color:var(--muted)">Analyzing...</div>';
      detailsEl.textContent = 'Running inspection...';

      const urls = doCompare ? [v1.url, v2.url] : [v1.url];

      // Render preview iframes first (so extraction can try later)
      iframeArea.innerHTML = '';
      if(urls.length === 1){
        const c = createIframeCard(urls[0], 1, 'single');
        iframeArea.appendChild(c);
      } else {
        // side-by-side for compare
        const left = createIframeCard(urls[0], 1, 'compare');
        const right = createIframeCard(urls[1], 2, 'compare');
        iframeArea.appendChild(left); iframeArea.appendChild(right);
      }
      // ensure sizing
      setTimeout(updateIframeSizing, 250);

      // Start fetches in parallel
      const fetchPromises = urls.map(u => fetchSource(u));
      const results = await Promise.all(fetchPromises);

      // For each result, if fetch failed, attempt iframe extraction
      const analyses = [];
      for(let i=0;i<urls.length;i++){
        const url = urls[i];
        const fr = results[i];
        if(fr.ok){
          const analysis = analyzeHTML(fr.text, url);
          const seo = scoreSEO(analysis);
          analyses.push({ url, text: fr.text, analysis, seo, fetchError: undefined, extracted: false });
        } else {
          // Try to extract from iframe (might succeed if same-origin and not blocked)
          let extracted = null;
          try{
            extracted = await tryExtractFromIframe(url);
          }catch(e){ extracted = null; }
          if(extracted){
            const analysis = analyzeHTML(extracted, url);
            const seo = scoreSEO(analysis);
            analyses.push({ url, text: extracted, analysis, seo, fetchError: fr.error + ' (fetched failed, extracted from iframe)', extracted: true });
          } else {
            // No source available to analyze
            analyses.push({ url, text: null, analysis: null, seo: null, fetchError: fr.error, extracted: false });
          }
        }
      }

      // Prepare source blocks and SEO reports
      const sourcesForRender = analyses.map(a => ({ url: a.url, text: a.text, fetchError: a.fetchError, extracted: a.extracted }));
      renderSourceBlocks(sourcesForRender);

      const seoReports = analyses.map(a => {
        return { url: a.url, analysis: a.analysis, seo: a.seo, fetchError: a.fetchError };
      });
      renderSEOReports(seoReports);
      updateDetails(seoReports);

      showFeedback('Inspection complete.', false, 2400);
    }

    // Auto inspect from URL params or referrer (and validate)
    function autoInspectFromParams(){
      try{
        const params = new URLSearchParams(location.search);
        const pUrl = params.get('url');
        const pCompare = params.get('compare');
        if(pUrl){
          url1El.value = pUrl;
          if(pCompare) url2El.value = pCompare;
          const v = validateUrl(pUrl);
          if(v.ok) runInspection();
          else showFeedback('Auto-filled URL is invalid: ' + v.reason, true);
        } else {
          const ref = document.referrer || '';
          if(ref && ref.startsWith(ALLOWED_PREFIX)){
            url1El.value = ref;
            const v = validateUrl(ref);
            if(v.ok) runInspection();
          }
        }
      }catch(e){}
    }

    window.addEventListener('load', ()=>{ autoInspectFromParams(); });

    // Accessibility: avoid console spam - no console logs

  })();