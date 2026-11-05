import './styles.css';
import { parseFile, parseText } from './engine/parser.js';
import { analyze } from './engine/analyzer.js';
import { buildFixedResume, resumeToText, generateCoverLetter, generateLinkedIn, prettySkill } from './engine/fixer.js';
import { toDocxBlob, toPdfBlob, toTxtBlob, textToBlob } from './engine/exporter.js';
import { SAMPLE_RESUME, SAMPLE_JD } from './engine/sample.js';
import { PLANS, PLAN_BY_ID, FEATURES, planHas, cheapestPlanFor } from '../shared/plans.js';
import { CONFIG } from './lib/config.js';
import { getLicense, setLicense, clearLicense, makeDemoToken, activePlanId } from './lib/license.js';
import { startCheckout, completeStripe, refreshLicense, openBillingPortal, aiRewrite, aiAvailable } from './lib/payments.js';
import { isNative, platform, saveFile, onDeepLink, closeExternal } from './lib/platform.js';

/* ---------------- helpers ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const money = (p) => `$${p.usd}`;

/* ---------------- state ---------------- */
const FIX_GROUPS = ['format', 'contact', 'headings', 'dates', 'bullets', 'pronouns', 'cliches', 'tense', 'repetition', 'quantify', 'keywords', 'summary'];
const state = {
  parsed: null, jd: '', fileName: '', analysis: null,
  selected: new Set(FIX_GROUPS), accepted: new Set(), contact: {}, rewriteSummary: false,
  edits: {}, plan: 'free', lic: null, tab: 'resume', cover: { company: '', role: '', manager: '' },
  aiBusy: false,
};

function saveSession() {
  if (!state.parsed) return;
  store.set('rrx_session', { parsed: state.parsed, jd: state.jd, fileName: state.fileName, accepted: [...state.accepted], contact: state.contact, edits: state.edits, cover: state.cover });
}
function loadSession() {
  const s = store.get('rrx_session');
  if (!s || !s.parsed) return;
  Object.assign(state, { parsed: s.parsed, jd: s.jd || '', fileName: s.fileName || '', contact: s.contact || {}, edits: s.edits || {}, cover: s.cover || state.cover });
  state.accepted = new Set(s.accepted || []);
  state.analysis = analyze(state.parsed, state.jd);
}
function clearSession() {
  store.del('rrx_session');
  Object.assign(state, { parsed: null, jd: '', fileName: '', analysis: null, accepted: new Set(), contact: {}, edits: {} });
}

async function refreshPlan() {
  state.lic = await getLicense();
  state.plan = await activePlanId();
  const nav = $('#nav-account');
  if (state.plan !== 'free') { nav.textContent = PLAN_BY_ID[state.plan].name; nav.classList.add('plan-pill'); }
  else { nav.textContent = 'Account'; nav.classList.remove('plan-pill'); }
}
const unlocked = (f) => planHas(state.plan, f);

/* ---------------- router ---------------- */
const routes = {
  '/': viewHome, '/report': viewReport, '/fix': viewFix, '/pricing': viewPricing, '/account': viewAccount,
  '/success': viewSuccess, '/checkout-demo': viewDemoCheckout, '/privacy': viewPrivacy, '/terms': viewTerms,
};
function currentRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path, params: new URLSearchParams(qs || '') };
}
async function render() {
  const { path, params } = currentRoute();
  const view = routes[path] || viewHome;
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${path}`));
  document.querySelectorAll('.sticky-cta').forEach((n) => n.remove());
  await view(params);
  main.focus({ preventScroll: true });
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

/* ---------------- views ---------------- */
function viewHome() {
  main.innerHTML = `
  <section class="hero hero-grid">
    <div>
      <div class="eyebrow">Free ATS resume checker</div>
      <h1>Will your resume <em>pass</em> the robots?</h1>
      <p class="lead">75% of resumes are filtered by Applicant Tracking Systems before a human sees them. Get your ATS score in seconds, then fix every issue in one tap.</p>
    </div>
    <div class="card" id="uploader">
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="true" data-mode="file">Upload file</button>
        <button role="tab" aria-selected="false" data-mode="paste">Paste text</button>
      </div>
      <div id="mode-file">
        <label class="drop" id="drop">
          <input type="file" id="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" aria-label="Upload your resume" />
          <div class="icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3"/></svg></div>
          <strong>Tap to upload your resume</strong>
          <span class="muted small">PDF, DOCX or TXT · up to 10 MB</span>
        </label>
      </div>
      <div id="mode-paste" hidden>
        <textarea id="paste" placeholder="Paste the full text of your resume here…" aria-label="Resume text"></textarea>
        <button class="btn pass block" id="paste-go" style="margin-top:10px">Check my resume</button>
      </div>
      <details class="jd" ${state.jd ? 'open' : ''}>
        <summary>Match against a job description <span class="muted small" style="font-weight:400;margin-left:auto;margin-right:10px">optional</span></summary>
        <div class="body"><textarea id="jd" placeholder="Paste the job description to see which keywords you're missing…">${esc(state.jd)}</textarea></div>
      </details>
      <div class="privacy-note"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Analysed on your device — your resume is never uploaded.</div>
      <p class="center small" style="margin:10px 0 0">No resume handy? <button class="linkbtn" id="sample">Try a sample</button>${state.analysis ? ` · <a href="#/report" class="linkbtn">Back to your last report</a>` : ''}</p>
    </div>
  </section>

  <section class="section">
    <h2>How it works</h2>
    <div class="steps">
      <div class="card step"><h3>Upload</h3><p class="muted">Drop in your PDF or Word resume. Parsing happens right in your browser.</p></div>
      <div class="card step"><h3>Get your score</h3><p class="muted">See exactly how an ATS reads you, across 7 categories and 30+ checks.</p></div>
      <div class="card step"><h3>Fix & export</h3><p class="muted">Apply rewrites, add missing keywords, and download an ATS-safe DOCX or PDF.</p></div>
    </div>
  </section>

  <section class="section">
    <h2>What we check</h2>
    <ul class="checks">
      <li><b>Parse & format</b>Columns, tables, images, icons, scanned pages, fonts</li>
      <li><b>Contact details</b>Name, email, phone, LinkedIn and location</li>
      <li><b>Sections</b>Standard headings recruiters and ATS expect</li>
      <li><b>Impact</b>Action verbs, quantified results, passive voice</li>
      <li><b>Language</b>Clichés, buzzwords, pronouns, tense, repetition</li>
      <li><b>Length & dates</b>Word count, page count, date consistency</li>
      <li><b>Keywords</b>Hard skills and job-description match rate</li>
    </ul>
  </section>

  <section class="section">
    <div class="row"><h2 style="margin:0">Fix plans from $9</h2><span class="spacer"></span><a class="btn ghost sm" href="#/pricing">Compare plans</a></div>
    <p class="muted" style="margin-top:8px">Checking is always free. Pay only for the fixes you need — cancel anytime.</p>
    <div class="plans">${PLANS.filter((p) => p.usd).map((p) => `<a class="card plan ${p.popular ? 'popular' : ''}" href="#/pricing" style="text-decoration:none">${p.popular ? '<span class="badge">Most popular</span>' : ''}<h3>${p.name}</h3><div class="price">${money(p)}<small> /month</small></div><p class="muted small" style="margin:0">${p.tagline}</p></a>`).join('')}</div>
  </section>

  <section class="section faq">
    <h2>Questions</h2>
    <details><summary>Is the ATS check really free?</summary><p>Yes. The score, the full issue list and the keyword match report are free and unlimited. Paid plans unlock automatic fixes and exports.</p></details>
    <details><summary>Do you store my resume?</summary><p>No. Your file is read and analysed inside your browser or the app. It is saved only on your own device so you can come back to it, and you can clear it any time from Account.</p></details>
    <details><summary>Which ATS systems does this cover?</summary><p>The checks reflect how common systems like Workday, Greenhouse, Lever, iCIMS and Taleo parse resumes: plain single-column text, standard headings, real dates and matching keywords.</p></details>
    <details><summary>Can I cancel?</summary><p>Yes, anytime from Account → Manage billing. You keep access until the end of the period you paid for.</p></details>
  </section>`;

  const tabs = $$('.tabs button');
  tabs.forEach((b) => b.addEventListener('click', () => {
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('#mode-file').hidden = b.dataset.mode !== 'file';
    $('#mode-paste').hidden = b.dataset.mode !== 'paste';
  }));
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (ev) => { ev.preventDefault(); if (ev.dataTransfer.files[0]) handleFile(ev.dataTransfer.files[0]); });
  $('#file').addEventListener('change', (e) => e.target.files[0] && handleFile(e.target.files[0]));
  $('#paste-go').addEventListener('click', () => {
    const t = $('#paste').value.trim();
    if (t.length < 200) return toast('Paste your full resume text (at least a few lines).');
    runAnalysis(parseText(t), 'pasted-resume');
  });
  $('#sample').addEventListener('click', () => {
    $('#jd').value = SAMPLE_JD;
    runAnalysis(parseText(SAMPLE_RESUME), 'sample-resume');
  });
}

function loading(msg) {
  main.innerHTML = `<div class="section center"><div class="spinner"></div><p class="muted" style="margin-top:16px">${esc(msg)}</p></div>`;
}

async function handleFile(file) {
  if (file.size > 10 * 1024 * 1024) return toast('That file is over 10 MB.');
  const jd = $('#jd') ? $('#jd').value : state.jd;
  state.jd = jd;
  loading('Reading your resume…');
  try {
    const parsed = await parseFile(file);
    runAnalysis(parsed, file.name.replace(/\.[^.]+$/, ''));
  } catch (e) {
    console.error(e);
    location.hash = '#/';
    render().then(() => toast(e.message || 'Could not read that file.'));
  }
}

function runAnalysis(parsed, name) {
  const jdEl = $('#jd');
  if (jdEl) state.jd = jdEl.value.trim();
  state.parsed = parsed;
  state.fileName = name;
  state.accepted = new Set(); state.edits = {}; state.contact = {};
  state.analysis = analyze(parsed, state.jd);
  saveSession();
  if (location.hash === '#/report') render(); else location.hash = '#/report';
}

function gradeClass(score) { return score >= 70 ? 'g-pass' : score >= 50 ? 'g-warn' : 'g-fail'; }
function ringColor(score) { return score >= 70 ? 'var(--pass)' : score >= 50 ? 'var(--warn)' : 'var(--fail)'; }

function lockLabel(feature) {
  if (unlocked(feature)) return '';
  const p = cheapestPlanFor(feature);
  return p ? `${p.name} · ${money(p)}` : '';
}

function viewReport() {
  const a = state.analysis;
  if (!a) { location.hash = '#/'; return; }
  const fixable = a.issues.filter((i) => i.fix && i.severity !== 'info').length;
  main.innerHTML = `
  <section class="section" style="padding-top:24px">
    <div class="card report-head">
      <div class="ring" style="--v:${a.score};--c:${ringColor(a.score)}"><div><span>${a.score}</span><small>ATS score</small></div></div>
      <div style="flex:1;min-width:200px">
        <span class="grade ${gradeClass(a.score)}">${a.grade}</span>
        <h2 style="margin:8px 0 4px">${a.score >= 85 ? 'Your resume is in great shape.' : a.score >= 70 ? 'Solid, with a few gaps.' : a.score >= 50 ? 'Likely to be filtered out for some roles.' : 'High risk of being auto-rejected.'}</h2>
        <p class="muted" style="margin:0">${esc(state.fileName)} · ${fixable} issue${fixable === 1 ? '' : 's'} we can fix${a.keywords ? ` · ${a.keywords.percent}% job match` : ''}</p>
      </div>
    </div>
  </section>
  <div class="grid side">
    <div class="stack">
      <div class="card">
        <h3>Score breakdown</h3>
        <div class="bars">${a.categories.map((c) => `
          <div class="bar-row"><span>${esc(c.name)}</span><b>${c.score}/${c.max}</b>
          <div class="bar"><i style="width:${(c.score / c.max) * 100}%;background:${ringColor((c.score / c.max) * 100)}"></i></div></div>`).join('')}
        </div>
      </div>
      <div class="card">
        <h3>At a glance</h3>
        <div class="stats">
          <div class="stat"><b>${a.stats.words}</b><span>words</span></div>
          <div class="stat"><b>${a.stats.bullets}</b><span>bullets</span></div>
          <div class="stat"><b>${a.stats.quantified}</b><span>with numbers</span></div>
          <div class="stat"><b>${a.stats.yearsExperience || '—'}</b><span>yrs experience</span></div>
        </div>
      </div>
      ${a.keywords ? `
      <div class="card">
        <h3>Job keyword match · ${a.keywords.percent}%</h3>
        <p class="small muted">Missing</p>
        <div class="chips">${a.keywords.missing.map((k) => `<span class="chip miss">${esc(prettySkill(k.term))}</span>`).join('') || '<span class="muted small">Nothing missing 🎉</span>'}</div>
        <p class="small muted" style="margin-top:12px">Found</p>
        <div class="chips">${a.keywords.matched.map((k) => `<span class="chip ok">${esc(prettySkill(k.term))}</span>`).join('')}</div>
      </div>` : `
      <div class="card">
        <h3>Hard skills found</h3>
        <div class="chips">${a.stats.skills.map((s) => `<span class="chip">${esc(prettySkill(s))}</span>`).join('') || '<span class="muted small">None recognised</span>'}</div>
        <button class="btn ghost sm" style="margin-top:14px" id="add-jd">+ Match to a job description</button>
      </div>`}
    </div>
    <div class="card">
      <div class="row"><h3 style="margin:0">Issues to fix</h3><span class="spacer"></span><span class="muted small">${a.issues.length} found</span></div>
      <ul class="issues" style="margin-top:14px">
        ${a.issues.map((i) => `
        <li class="issue">
          <span class="sev sev-${i.severity}" title="${i.severity}"></span>
          <b>${esc(i.title)}</b>
          <div>
            <p>${esc(i.detail)}</p>
            ${i.examples && i.examples.length ? `<div class="ex">e.g. “${esc(i.examples[0])}”</div>` : ''}
            ${i.fix && i.severity !== 'info' ? (unlocked(i.fix) ? `<a class="fixtag" href="#/fix">✓ Auto-fix included</a>` : `<a class="fixtag locked" href="#/pricing">🔒 Auto-fix with ${esc(lockLabel(i.fix))}</a>`) : ''}
          </div>
        </li>`).join('')}
      </ul>
      <div class="row" style="margin-top:16px"><a href="#/" class="btn ghost sm">Check another resume</a></div>
    </div>
  </div>`;
  const cta = document.createElement('div');
  cta.className = 'sticky-cta';
  cta.innerHTML = `<a class="btn pass" href="#/fix">Fix my resume →</a>`;
  document.body.appendChild(cta);
  const addJd = $('#add-jd');
  if (addJd) addJd.addEventListener('click', () => { location.hash = '#/'; setTimeout(() => { const d = $('details.jd'); if (d) { d.open = true; $('#jd').focus(); } }, 50); });
}

/* ---------- Fix view ---------- */
function effectiveFeatures() {
  // Free users see a preview of everything (blurred); paid users get only what they selected & own.
  if (state.plan === 'free') return new Set(FIX_GROUPS);
  return new Set(FIX_GROUPS.filter((f) => state.selected.has(f) && unlocked(f)));
}

function buildDoc() {
  const feats = effectiveFeatures();
  const keywordsOn = feats.has('keywords');
  const doc = buildFixedResume(state.analysis, {
    features: feats,
    acceptedKeywords: keywordsOn ? [...state.accepted] : [],
    contact: state.contact,
    rewriteSummary: state.rewriteSummary && feats.has('summary'),
  });
  // Apply manual / AI edits
  doc.sections.forEach((s, si) => {
    if (s.type === 'text' && state.edits[`${s.key}-text`] !== undefined) s.text = state.edits[`${s.key}-text`];
    if (s.type === 'entries') s.items.forEach((it, ii) => it.bullets.forEach((b, bi) => {
      const k = `${s.key}-${ii}-${bi}`;
      if (state.edits[k] !== undefined) { b.text = state.edits[k]; b.needsMetric = false; b.edited = true; }
    }));
  });
  return doc;
}

function previewHtml(doc, editable) {
  const c = doc.contact;
  const ce = editable ? 'contenteditable="true" spellcheck="true"' : '';
  return `
    <p class="pname">${esc(doc.name || 'Your Name')}</p>
    ${doc.headline ? `<p class="phead">${esc(doc.headline)}</p>` : ''}
    <p class="pcontact">${[c.location, c.phone, c.email, c.linkedin, c.website].filter(Boolean).map(esc).join(' &nbsp;|&nbsp; ')}</p>
    ${doc.sections.map((s) => `
      <h4>${esc(s.title)}</h4>
      ${s.type === 'text' ? `<div ${ce} data-edit="${s.key}-text">${esc(s.text)}</div>` : ''}
      ${s.type === 'list' ? `<div>${s.list.map(esc).join(', ')}</div>` : ''}
      ${s.type === 'lines' ? s.lines.map((l) => `<div>${esc(l)}</div>`).join('') : ''}
      ${s.type === 'entries' ? s.items.map((it, ii) => `
        <div class="pitem">${it.heading ? `<b>${esc(it.heading)}</b>` : ''}${it.meta.map((m) => `<div class="pmeta">${esc(m)}</div>`).join('')}
        ${it.bullets.length ? `<ul>${it.bullets.map((b, bi) => `<li><span ${ce} data-edit="${s.key}-${ii}-${bi}">${esc(b.text)}</span>${b.needsMetric ? '<span class="metric" title="Add a number: %, $, time saved, volume, team size">+ add metric</span>' : ''}</li>`).join('')}</ul>` : ''}
        </div>`).join('') : ''}`).join('')}`;
}

function viewFix() {
  const a = state.analysis;
  if (!a) { location.hash = '#/'; return; }
  const free = state.plan === 'free';
  const missing = a.keywords ? a.keywords.missing : [];
  main.innerHTML = `
  <section class="section" style="padding-top:24px">
    <div class="row"><div><div class="eyebrow">Resume fixer</div><h2 style="margin:0">Fix & export</h2></div><span class="spacer"></span>
    ${free ? `<a class="btn pass sm" href="#/pricing">Unlock fixes from $9</a>` : `<span class="grade g-pass">${esc(PLAN_BY_ID[state.plan].name)}</span>`}</div>
  </section>
  <div class="tabs" role="tablist" id="fix-tabs">
    <button role="tab" data-tab="resume" aria-selected="${state.tab === 'resume'}">Resume</button>
    <button role="tab" data-tab="cover" aria-selected="${state.tab === 'cover'}">Cover letter</button>
    <button role="tab" data-tab="linkedin" aria-selected="${state.tab === 'linkedin'}">LinkedIn</button>
  </div>
  <div id="tab-body"></div>`;
  $$('#fix-tabs button').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; viewFix(); }));
  const body = $('#tab-body');
  if (state.tab === 'cover') return renderCoverTab(body);
  if (state.tab === 'linkedin') return renderLinkedInTab(body);

  body.innerHTML = `
  <div class="grid side">
    <div class="stack">
      <div class="card">
        <div class="delta" id="delta"></div>
        <p class="muted small" id="change-count" style="margin:4px 0 0"></p>
      </div>
      <details class="card fixes-card" ${window.innerWidth >= 760 ? 'open' : ''}>
        <summary><h3 style="display:inline">Fixes</h3> <span class="muted small">· ${FIX_GROUPS.filter((f) => unlocked(f)).length}/${FIX_GROUPS.length} unlocked</span></summary>
        <div class="fix-groups" style="margin-top:12px">${FIX_GROUPS.map((f) => {
          const lock = lockLabel(f);
          return `<label class="fix-group ${lock && !free ? 'locked' : ''}">
            <input type="checkbox" data-feat="${f}" ${(free || (unlocked(f) && state.selected.has(f))) ? 'checked' : ''} ${(free || !unlocked(f)) ? 'disabled' : ''} />
            <span class="small">${esc(FEATURES[f])}</span>${lock ? `<span class="lock">🔒 ${esc(PLAN_BY_ID[cheapestPlanFor(f).id].name)}</span>` : ''}
          </label>`;
        }).join('')}</div>
      </details>
      ${missing.length ? `
      <div class="card">
        <h3>Add missing keywords</h3>
        <p class="small muted">Only tick skills you genuinely have — they'll be added to your Skills section${unlocked('summary') ? ' and summary' : ''}.</p>
        <div class="chips">${missing.map((k) => `<label class="chip"><input type="checkbox" data-kw="${esc(k.term)}" ${state.accepted.has(k.term) ? 'checked' : ''} ${unlocked('keywords') ? '' : 'disabled'}/> ${esc(prettySkill(k.term))}</label>`).join('')}</div>
        ${unlocked('keywords') ? '' : `<p class="small" style="margin:10px 0 0"><a class="linkbtn" href="#/pricing">Keyword tailoring needs Premium</a></p>`}
      </div>` : ''}
      <div class="card">
        <h3>Contact details</h3>
        ${['email', 'phone', 'location', 'linkedin'].map((k) => `
          <label class="field" for="c-${k}" style="margin-top:10px">${k === 'linkedin' ? 'LinkedIn URL' : k[0].toUpperCase() + k.slice(1)}</label>
          <input id="c-${k}" type="${k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'}" data-contact="${k}" value="${esc(state.contact[k] ?? a.model.contact[k] ?? '')}" placeholder="${k === 'linkedin' ? 'linkedin.com/in/yourname' : k === 'location' ? 'City, Country' : ''}" />`).join('')}
      </div>
      ${unlocked('summary') ? `<div class="card"><label class="row small" style="cursor:pointer"><input type="checkbox" id="rewrite-summary" ${state.rewriteSummary ? 'checked' : ''} style="accent-color:var(--pass);width:18px;height:18px"/> Replace my summary with a generated one</label></div>` : ''}
    </div>
    <div class="stack fix-preview-col">
      <div class="row">
        <h3 style="margin:0">Preview</h3><span class="spacer"></span>
        ${!free ? '<span class="muted small">Tap any bullet to edit</span>' : ''}
      </div>
      ${unlocked('ai') ? `<div class="card row" style="padding:14px"><div style="flex:1;min-width:180px"><b>AI polish</b><div class="muted small">${aiAvailable() ? 'Rewrite every bullet for impact and the job keywords.' : 'Connect the payments server to enable AI rewrites.'}</div></div><button class="btn sm" id="ai-btn" ${aiAvailable() ? '' : 'disabled'}>✨ Polish with AI</button></div>` : ''}
      <div class="preview" id="preview"></div>
      <div class="card">
        <h3>Download</h3>
        <div class="export-row">
          <button class="btn pass" data-export="docx">DOCX</button>
          <button class="btn ghost" data-export="pdf">PDF</button>
          <button class="btn ghost" data-export="txt">TXT</button>
        </div>
        <p class="small muted" style="margin:10px 0 0">${unlocked('format') ? 'Single-column, standard fonts, no tables or graphics — exactly what ATS parse best.' : '🔒 Export is included in every paid plan, from $9.'}</p>
      </div>
    </div>
  </div>`;

  const update = () => {
    const doc = buildDoc();
    const editable = !free;
    const prev = $('#preview');
    prev.innerHTML = previewHtml(doc, editable) + (free ? `<div class="paywall-veil"><b style="font-size:1.1rem">${doc.changes.length} fixes ready to apply</b><span class="muted small">Unlock automatic fixes and ATS-safe export.</span><a class="btn pass" href="#/pricing">See plans from $9</a></div>` : '');
    if (free) {
      // Blur everything after the first section so the value is visible but not usable.
      const nodes = [...prev.children].filter((n) => !n.classList.contains('paywall-veil'));
      let seen = 0;
      nodes.forEach((n) => { if (n.tagName === 'H4') seen++; if (seen >= 2) n.classList.add('blurred'); });
    }
    const after = analyze(parseText(resumeToText(doc)), state.jd);
    $('#delta').innerHTML = `<span class="muted" style="font-size:1rem;font-family:var(--sans)">Score</span> <span>${state.analysis.score}</span><span class="arrow">→</span><span class="after">${after.score}</span>`;
    $('#change-count').textContent = `${doc.changes.length} automatic change${doc.changes.length === 1 ? '' : 's'}${doc.sections.some((s) => s.items && s.items.some((i) => i.bullets.some((b) => b.needsMetric))) ? ' · add numbers where flagged for a higher score' : ''}`;
    $$('[data-edit]', prev).forEach((el) => {
      el.addEventListener('blur', () => {
        const v = el.textContent.trim();
        state.edits[el.dataset.edit] = v; saveSession(); update();
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });
    return doc;
  };
  update();
  const cta = document.createElement('div');
  cta.className = 'sticky-cta';
  cta.innerHTML = free ? '<a class="btn pass" href="#/pricing">Unlock fixes from $9</a>' : (unlocked('format') ? '<button class="btn pass" data-export="docx">Download DOCX</button><button class="btn ghost" data-export="pdf" style="flex:0 0 auto">PDF</button>' : '');
  if (cta.innerHTML) document.body.appendChild(cta);

  $$('[data-feat]').forEach((cb) => cb.addEventListener('change', () => { cb.checked ? state.selected.add(cb.dataset.feat) : state.selected.delete(cb.dataset.feat); update(); }));
  $$('[data-kw]').forEach((cb) => cb.addEventListener('change', () => { cb.checked ? state.accepted.add(cb.dataset.kw) : state.accepted.delete(cb.dataset.kw); saveSession(); update(); }));
  $$('[data-contact]').forEach((inp) => inp.addEventListener('change', () => { state.contact[inp.dataset.contact] = inp.value.trim(); saveSession(); update(); }));
  const rs = $('#rewrite-summary');
  if (rs) rs.addEventListener('change', () => { state.rewriteSummary = rs.checked; delete state.edits['summary-text']; update(); });
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export)));
  const ai = $('#ai-btn');
  if (ai) ai.addEventListener('click', async () => {
    const doc = buildDoc();
    const items = [];
    doc.sections.forEach((s) => s.type === 'entries' && s.items.forEach((it, ii) => it.bullets.forEach((b, bi) => items.push({ key: `${s.key}-${ii}-${bi}`, text: b.text }))));
    const summary = doc.sections.find((s) => s.key === 'summary');
    ai.disabled = true; ai.textContent = 'Polishing…';
    try {
      const res = await aiRewrite('resume', { bullets: items.map((i) => i.text), summary: summary ? summary.text : '', jd: state.jd, keywords: [...state.accepted] });
      (res.bullets || []).forEach((t, i) => { if (items[i] && t) state.edits[items[i].key] = t; });
      if (res.summary && summary) state.edits['summary-text'] = res.summary;
      saveSession(); update(); toast('AI rewrite applied — review and edit anything you like.');
    } catch (e) { toast(e.message); }
    ai.disabled = false; ai.textContent = '✨ Polish with AI';
  });
}

async function doExport(kind) {
  if (!unlocked('format')) { location.hash = '#/pricing'; toast('Export is included in every paid plan.'); return; }
  const doc = buildDoc();
  // Strip metric hints from the exported file.
  const base = (doc.name || state.fileName || 'resume').replace(/[^\w-]+/g, '_');
  try {
    const blob = kind === 'docx' ? await toDocxBlob(doc) : kind === 'pdf' ? await toPdfBlob(doc) : toTxtBlob(doc);
    await saveFile(blob, `${base}_ATS.${kind}`);
    toast(`Downloaded ${base}_ATS.${kind}`);
  } catch (e) { console.error(e); toast('Export failed: ' + e.message); }
}

function lockedTab(body, feature, title, blurb) {
  const p = cheapestPlanFor(feature);
  body.innerHTML = `<div class="card center" style="padding:40px 20px"><h3>${title}</h3><p class="muted">${blurb}</p><a class="btn pass" href="#/pricing">Unlock with ${esc(p.name)} · ${money(p)}/mo</a></div>`;
}

function renderCoverTab(body) {
  if (!unlocked('coverLetter')) return lockedTab(body, 'coverLetter', 'Tailored cover letters', 'Generate a cover letter built from your strongest, quantified achievements and the job’s keywords.');
  const doc = buildDoc();
  body.innerHTML = `<div class="grid side">
    <div class="card stack">
      <div><label class="field" for="cl-company">Company</label><input type="text" id="cl-company" value="${esc(state.cover.company)}" /></div>
      <div><label class="field" for="cl-role">Role</label><input type="text" id="cl-role" value="${esc(state.cover.role)}" /></div>
      <div><label class="field" for="cl-manager">Hiring manager (optional)</label><input type="text" id="cl-manager" value="${esc(state.cover.manager)}" /></div>
      ${unlocked('ai') && aiAvailable() ? '<button class="btn" id="cl-ai">✨ Write with AI</button>' : ''}
    </div>
    <div class="stack"><textarea id="cl-out" style="min-height:420px"></textarea>
      <div class="export-row"><button class="btn pass" id="cl-copy">Copy</button><button class="btn ghost" id="cl-dl">Download .txt</button></div></div>
  </div>`;
  const gen = () => { $('#cl-out').value = generateCoverLetter(state.analysis, doc, state.cover); };
  gen();
  ['company', 'role', 'manager'].forEach((k) => $(`#cl-${k}`).addEventListener('input', (e) => { state.cover[k] = e.target.value; saveSession(); gen(); }));
  $('#cl-copy').addEventListener('click', () => navigator.clipboard.writeText($('#cl-out').value).then(() => toast('Copied')));
  $('#cl-dl').addEventListener('click', () => saveFile(textToBlob($('#cl-out').value), 'Cover_Letter.txt'));
  const ai = $('#cl-ai');
  if (ai) ai.addEventListener('click', async () => {
    ai.disabled = true; ai.textContent = 'Writing…';
    try { const r = await aiRewrite('cover', { resume: resumeToText(doc), jd: state.jd, ...state.cover }); $('#cl-out').value = r.text; } catch (e) { toast(e.message); }
    ai.disabled = false; ai.textContent = '✨ Write with AI';
  });
}

function renderLinkedInTab(body) {
  if (!unlocked('linkedin')) return lockedTab(body, 'linkedin', 'LinkedIn headline & About', 'Turn your fixed resume into a keyword-rich LinkedIn headline and About section.');
  const li = generateLinkedIn(state.analysis, buildDoc());
  body.innerHTML = `<div class="stack">
    <div class="card"><div class="row"><h3 style="margin:0">Headline</h3><span class="spacer"></span><button class="btn ghost sm" data-copy="h">Copy</button></div><div class="out-box" style="margin-top:10px" id="li-h">${esc(li.headline)}</div></div>
    <div class="card"><div class="row"><h3 style="margin:0">About</h3><span class="spacer"></span><button class="btn ghost sm" data-copy="a">Copy</button></div><div class="out-box" style="margin-top:10px" id="li-a">${esc(li.about)}</div></div>
  </div>`;
  $$('[data-copy]').forEach((b) => b.addEventListener('click', () => navigator.clipboard.writeText($(b.dataset.copy === 'h' ? '#li-h' : '#li-a').textContent).then(() => toast('Copied'))));
}

/* ---------- Pricing ---------- */
function viewPricing() {
  const both = CONFIG.provider === 'both';
  const ios = platform() === 'ios';
  main.innerHTML = `
  <section class="section" style="padding-top:28px">
    <div class="eyebrow">Pricing</div>
    <h2>Pay for the fixes you need</h2>
    <p class="muted">ATS checks are always free. Every plan is billed monthly and can be cancelled anytime.</p>
    ${CONFIG.demoMode ? `<div class="banner warn" style="margin-bottom:16px"><b>Demo mode.</b> The payments server isn't connected yet, so checkout is simulated and no card is charged.</div>` : ''}
    ${ios && !CONFIG.demoMode ? `<div class="banner" style="margin-bottom:16px">You'll complete payment securely on our website, then return to the app automatically.</div>` : ''}
    <div style="max-width:360px;margin-bottom:20px"><label class="field" for="buyer-email">Email for your receipt (optional)</label><input type="email" id="buyer-email" placeholder="you@example.com" autocomplete="email" /></div>
    <div class="plans">${PLANS.filter((p) => p.usd).map((p) => `
      <div class="card plan ${p.popular ? 'popular' : ''} ${state.plan === p.id ? 'current' : ''}">
        ${p.popular ? '<span class="badge">Most popular</span>' : ''}
        <div><h3 style="margin-bottom:2px">${p.name}</h3><span class="muted small">${p.tagline}</span></div>
        <div class="price">${money(p)}<small> /month</small></div>
        <ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
        ${state.plan === p.id ? '<button class="btn ghost block" disabled>Current plan</button>' : `
          <button class="btn ${p.popular ? 'pass' : ''} block" data-buy="${p.id}" data-prov="${both ? 'stripe' : CONFIG.provider}">${both ? 'Pay by card' : `Get ${p.name}`}</button>
          ${both ? `<button class="btn ghost block" data-buy="${p.id}" data-prov="razorpay">UPI / India · ₹${p.inr.toLocaleString('en-IN')}</button>` : ''}`}
      </div>`).join('')}
    </div>
  </section>
  <section class="section">
    <h3>Compare everything</h3>
    <div class="card table-wrap" style="padding:8px 12px"><table class="compare">
      <thead><tr><th>Feature</th>${PLANS.map((p) => `<th>${p.name.split(' ')[0]}<br><span class="muted small">${p.usd ? money(p) : 'Free'}</span></th>`).join('')}</tr></thead>
      <tbody>
        <tr><td>ATS score & full report</td>${PLANS.map(() => '<td class="y">✓</td>').join('')}</tr>
        ${Object.entries(FEATURES).map(([k, label]) => `<tr><td>${esc(label)}</td>${PLANS.map((p) => (p.features.includes(k) ? '<td class="y">✓</td>' : '<td class="muted">—</td>')).join('')}</tr>`).join('')}
      </tbody></table></div>
  </section>
  <section class="section">
    <div class="card"><h3>Already paid on another device?</h3><p class="muted small">Paste the license key from your Account page or receipt email.</p>
      <div class="row"><input type="text" id="lic-in" placeholder="Paste license key" style="flex:1;min-width:200px" /><button class="btn" id="lic-go">Activate</button></div></div>
  </section>`;
  $$('[data-buy]').forEach((b) => b.addEventListener('click', async () => {
    const label = b.textContent;
    b.disabled = true; b.textContent = 'Opening checkout…';
    try {
      const lic = await startCheckout(b.dataset.buy, b.dataset.prov, $('#buyer-email').value.trim());
      if (lic) { await refreshPlan(); toast(`${PLAN_BY_ID[lic.plan].name} unlocked!`); location.hash = state.analysis ? '#/fix' : '#/account'; }
    } catch (e) { toast(e.message); }
    b.disabled = false; b.textContent = label;
  }));
  $('#lic-go').addEventListener('click', activateFromInput);
}

async function activateFromInput() {
  try {
    const lic = await setLicense($('#lic-in').value);
    await refreshPlan();
    toast(`${PLAN_BY_ID[lic.plan].name} activated`);
    location.hash = state.analysis ? '#/fix' : '#/account';
  } catch (e) { toast(e.message); }
}

/* ---------- Checkout result ---------- */
async function viewSuccess() {
  const q = new URLSearchParams(location.search);
  const sessionId = q.get('session_id');
  const native = q.get('native') === '1';
  if (!sessionId) {
    main.innerHTML = state.lic ? successHtml(state.lic, native) : `<div class="section center"><h2>Nothing to confirm</h2><a class="btn" href="#/pricing">See plans</a></div>`;
    return;
  }
  loading('Confirming your payment…');
  try {
    const { lic, token } = await completeStripe(sessionId);
    history.replaceState(null, '', location.pathname + '#/success' + (native ? '?native=1' : ''));
    await refreshPlan();
    main.innerHTML = successHtml(lic, native, token);
    if (native) setTimeout(() => { location.href = `${CONFIG.appScheme}://unlock?token=${encodeURIComponent(token)}`; }, 600);
  } catch (e) {
    main.innerHTML = `<div class="section center"><h2>We couldn't confirm that payment</h2><p class="muted">${esc(e.message)}</p><p class="muted small">If you were charged, email ${esc(CONFIG.supportEmail)} with your receipt and we'll sort it out.</p><a class="btn" href="#/pricing">Back to pricing</a></div>`;
  }
}

function successHtml(lic, native, token) {
  const p = PLAN_BY_ID[lic.plan];
  return `<div class="section center" style="max-width:520px;margin:0 auto">
    <div style="width:64px;height:64px;border-radius:50%;background:var(--pass-soft);color:var(--pass);display:grid;place-items:center;margin:0 auto 16px;font-size:2rem">✓</div>
    <h2>${esc(p.name)} unlocked</h2>
    <p class="muted">Access until ${new Date(lic.exp * 1000).toLocaleDateString()}. It renews automatically — cancel anytime from Account.</p>
    ${native && token ? `<a class="btn pass block" href="${CONFIG.appScheme}://unlock?token=${encodeURIComponent(token)}">Return to the app</a><p class="small muted" style="margin-top:12px">Or copy this license key into the app:</p><div class="kbd">${esc(token)}</div>` : `<a class="btn pass block" href="${state.analysis ? '#/fix' : '#/'}">${state.analysis ? 'Fix my resume now' : 'Check a resume'}</a>`}
  </div>`;
}

function viewDemoCheckout(params) {
  const p = PLAN_BY_ID[params.get('plan')];
  if (!p) { location.hash = '#/pricing'; return; }
  main.innerHTML = `<div class="section" style="max-width:460px;margin:0 auto">
    <div class="card stack">
      <div class="banner warn"><b>Demo checkout.</b> Payments aren't connected yet, so this simulates a successful payment. Set up the payments worker (see README) to charge real cards.</div>
      <h2 style="margin:0">${esc(p.name)}</h2>
      <div class="price">${money(p)}<small> /month</small></div>
      <ul class="muted small">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <button class="btn pass block" id="demo-pay">Simulate payment</button>
      <a class="btn ghost block" href="#/pricing">Cancel</a>
    </div></div>`;
  $('#demo-pay').addEventListener('click', async () => {
    await setLicense(makeDemoToken(p.id));
    await refreshPlan();
    toast(`${p.name} unlocked (demo)`);
    location.hash = state.analysis ? '#/fix' : '#/account';
  });
}

/* ---------- Account ---------- */
function viewAccount() {
  const lic = state.lic;
  const p = PLAN_BY_ID[state.plan];
  main.innerHTML = `<section class="section stack" style="padding-top:28px;max-width:640px">
    <div><div class="eyebrow">Account</div><h2>Your plan</h2></div>
    <div class="card stack">
      <div class="row"><h3 style="margin:0">${esc(p.name)}</h3><span class="spacer"></span>${lic && lic.demo ? '<span class="grade g-warn">Demo</span>' : ''}${lic && lic.expired ? '<span class="grade g-fail">Expired</span>' : ''}</div>
      ${lic ? `<p class="muted" style="margin:0">${lic.expired ? 'Expired' : 'Renews / valid until'} ${new Date(lic.exp * 1000).toLocaleDateString()} · via ${esc(lic.prov || 'card')}</p>` : '<p class="muted" style="margin:0">You are on the free plan. ATS checks are unlimited.</p>'}
      <div class="row">
        ${lic && !lic.demo && !CONFIG.demoMode ? '<button class="btn sm" id="refresh">Refresh status</button>' : ''}
        ${lic && lic.prov === 'stripe' && !CONFIG.demoMode ? '<button class="btn ghost sm" id="portal">Manage billing / cancel</button>' : ''}
        <a class="btn ${lic ? 'ghost' : 'pass'} sm" href="#/pricing">${lic ? 'Change plan' : 'Upgrade'}</a>
      </div>
    </div>
    ${lic ? `<div class="card stack"><h3 style="margin:0">License key</h3><p class="muted small" style="margin:0">Use this to unlock your plan on another phone or browser.</p><div class="kbd" id="lic-key">${esc(lic.token)}</div><div class="row"><button class="btn ghost sm" id="copy-key">Copy key</button><button class="btn ghost sm" id="remove-key">Remove from this device</button></div></div>` : `
    <div class="card"><h3>Have a license key?</h3><div class="row"><input type="text" id="lic-in" placeholder="Paste license key" style="flex:1;min-width:200px"/><button class="btn" id="lic-go">Activate</button></div></div>`}
    <div class="card stack"><h3 style="margin:0">Your data</h3><p class="muted small" style="margin:0">Your resume stays on this device. ${state.parsed ? `Currently saved: <b>${esc(state.fileName)}</b>.` : 'Nothing saved.'}</p>${state.parsed ? '<button class="btn ghost sm" id="clear-data" style="align-self:flex-start">Delete saved resume</button>' : ''}</div>
    <p class="small muted">Need help? <a href="mailto:${esc(CONFIG.supportEmail)}">${esc(CONFIG.supportEmail)}</a></p>
  </section>`;
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  on('#refresh', async () => { try { await refreshLicense(); await refreshPlan(); toast('Status updated'); viewAccount(); } catch (e) { toast(e.message); } });
  on('#portal', async () => { try { await openBillingPortal(); } catch (e) { toast(e.message); } });
  on('#copy-key', () => navigator.clipboard.writeText(lic.token).then(() => toast('License key copied')));
  on('#remove-key', async () => { clearLicense(); await refreshPlan(); toast('License removed from this device'); viewAccount(); });
  on('#lic-go', activateFromInput);
  on('#clear-data', () => { clearSession(); toast('Saved resume deleted'); viewAccount(); });
}

/* ---------- Legal ---------- */
function viewPrivacy() {
  main.innerHTML = `<section class="section legal"><h2>Privacy policy</h2>
  <p class="muted">Last updated ${new Date().getFullYear()}</p>
  <p>ResumeRx is built so your resume never leaves your device. Files are parsed and analysed locally in your browser or in the mobile app.</p>
  <h2>What we store</h2><p>On your device only: your most recent resume text, job description and edits (so you can return to them), and your license key. You can delete these any time from Account.</p>
  <p>On our servers: nothing about your resume. When you buy a plan, our payment processor (Stripe or Razorpay) handles your card or UPI details; we receive your email, plan and payment status to issue your license. If you use AI rewrites, the bullet text you choose to polish is sent to our AI provider to generate the rewrite and is not stored by us.</p>
  <h2>Cookies & tracking</h2><p>We do not use advertising trackers.</p>
  <h2>Contact</h2><p>${esc(CONFIG.supportEmail)}</p></section>`;
}
function viewTerms() {
  main.innerHTML = `<section class="section legal"><h2>Terms of service</h2>
  <p>ResumeRx provides automated resume analysis and editing suggestions. Scores are an estimate of how applicant tracking systems parse resumes and do not guarantee interviews or job offers.</p>
  <h2>Subscriptions</h2><p>Paid plans are billed monthly in advance and renew automatically until cancelled. Cancel anytime from Account → Manage billing; access continues until the end of the paid period. UPI/Razorpay purchases are 30-day passes that do not auto-renew.</p>
  <h2>Refunds</h2><p>If a fix doesn't work for you, contact us within 7 days of purchase for a refund.</p>
  <h2>Your content</h2><p>You own your resume and everything generated from it. Only add skills and achievements that are true.</p>
  <h2>Contact</h2><p>${esc(CONFIG.supportEmail)}</p></section>`;
}

/* ---------------- boot ---------------- */
async function boot() {
  $('#yr').textContent = new Date().getFullYear();
  loadSession();
  await refreshPlan();
  // Quietly refresh licenses close to expiry (subscriptions renew on the Stripe side).
  if (state.lic && !state.lic.demo && !CONFIG.demoMode && state.lic.exp * 1000 - Date.now() < 3 * 86400e3) {
    refreshLicense().then(refreshPlan).catch(() => {});
  }
  // Stripe returns with ?session_id=… before the hash; make sure we land on the success view.
  if (new URLSearchParams(location.search).get('session_id') && !location.hash.startsWith('#/success')) location.hash = '#/success';
  onDeepLink(async (url) => {
    const u = new URL(url);
    const token = u.searchParams.get('token');
    if (token) {
      try { await setLicense(token); await refreshPlan(); await closeExternal(); toast('Plan unlocked'); location.hash = state.analysis ? '#/fix' : '#/account'; } catch (e) { toast(e.message); }
    }
  });
  if (isNative()) document.documentElement.classList.add('native');
  render();
}
boot();
