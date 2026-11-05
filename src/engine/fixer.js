// Rule-based resume fixer. Each fix is gated by a feature key so plans can unlock different sets.
import { WEAK_PHRASES, CLICHES, TENSE_MAP, VERB_SYNONYMS, CANONICAL_TITLES, SECTION_ORDER, MONTH_NAMES, ACTION_VERBS } from './dictionaries.js';
import { DATE_RANGE_RE, toDate } from './structure.js';
import { QUANT_RE } from './analyzer.js';
import { findSkills } from './keywords.js';

const UPPER_TERMS = new Set(['aws', 'gcp', 'sql', 'nosql', 'api', 'apis', 'ci/cd', 'qa', 'ux', 'ui', 'seo', 'sem', 'crm', 'erp', 'sap', 'kyc', 'aml', 'etl', 'nlp', 'llm', 'tdd', 'bdd', 'owasp', 'vapt', 'gdpr', 'hipaa', 'sox', 'siem', 'elk', 'pmp', 'okrs', 'kpis', 'sre', 'itil', 'iot', 'dns', 'vpn', 'html', 'css', 'php', 'gaap', 'ifrs', 'tcp/ip', 'ec2', 's3', 'k6', 'pci dss', 'pci-dss', 'soc 2', 'iso 27001', 'iso 20022', 'dbt']);
const PRETTY = { javascript: 'JavaScript', typescript: 'TypeScript', 'node.js': 'Node.js', 'next.js': 'Next.js', github: 'GitHub', 'github actions': 'GitHub Actions', 'gitlab ci': 'GitLab CI', postgresql: 'PostgreSQL', mongodb: 'MongoDB', mysql: 'MySQL', graphql: 'GraphQL', jmeter: 'JMeter', testng: 'TestNG', junit: 'JUnit', pytorch: 'PyTorch', tensorflow: 'TensorFlow', 'scikit-learn': 'scikit-learn', dynamodb: 'DynamoDB', bigquery: 'BigQuery', 'power bi': 'Power BI', hubspot: 'HubSpot', servicenow: 'ServiceNow', devops: 'DevOps', ios: 'iOS', fintech: 'Fintech', 'rest api': 'REST API', 'c#': 'C#', 'c++': 'C++', '.net': '.NET', 'a/b testing': 'A/B Testing', 'react native': 'React Native', rabbitmq: 'RabbitMQ', fastapi: 'FastAPI', 'new relic': 'New Relic' };

export function prettySkill(s) {
  const k = s.toLowerCase().trim();
  if (PRETTY[k]) return PRETTY[k];
  if (UPPER_TERMS.has(k)) return k.toUpperCase();
  if (s !== k) return s; // keep user's own casing
  return k.split(' ').map((w) => (UPPER_TERMS.has(w) ? w.toUpperCase() : PRETTY[w] || w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

const PARTICIPLE_TO_PAST = { written: 'Wrote', built: 'Built', done: 'Completed', made: 'Created', run: 'Ran', led: 'Led', given: 'Delivered', taken: 'Took', chosen: 'Selected' };

function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function fixPassive(b) {
  const m = b.match(/^(.+?)\s+(was|were)\s+(\w+)\s+(?:by me\s+)?(.*)$/i);
  if (!m) return b;
  const [, subject, , verb, rest] = m;
  if (!/(ed|written|built|done|made|led|run|given|taken|chosen)$/i.test(verb)) return b;
  if (subject.split(/\s+/).length > 6) return b;
  const past = PARTICIPLE_TO_PAST[verb.toLowerCase()] || capFirst(verb.toLowerCase());
  return `${past} ${subject.charAt(0).toLowerCase()}${subject.slice(1)} ${rest}`.replace(/\s+/g, ' ').trim();
}

export function replaceCliches(text) {
  let out = text;
  for (const [c, rep] of Object.entries(CLICHES).sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`\\b(a |an )?${c.replace(/[-]/g, '[- ]')}\\b`, 'gi');
    out = out.replace(re, (m, art) => (rep ? (art ? (/^[aeiou]/i.test(rep) ? 'an ' : 'a ') : '') + rep : ''));
  }
  return out.replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\b(and|or)\s*([.,])/g, '$2').replace(/\s{2,}/g, ' ').replace(/\s+\./g, '.').trim();
}

function removePronouns(text) {
  return text
    .replace(/^(i am|i'm)\s+(a|an)\s+/i, '')
    .replace(/\bI (have|am|was|had)\s+/g, '')
    .replace(/(^|\.\s+)I\s+(\w)/g, (m, p, c) => p + c.toUpperCase())
    .replace(/\b(my|our)\s+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function fixBullet(raw, ctx) {
  const { features, current, verbCounts, changes } = ctx;
  let b = raw.trim().replace(/[.;]+$/, '');
  const before = b;
  if (features.has('pronouns')) b = removePronouns(b);
  if (features.has('bullets')) {
    for (const [re, rep] of WEAK_PHRASES) {
      if (re.test(b)) { b = b.replace(re, rep); break; }
    }
    b = fixPassive(b);
  }
  if (features.has('tense')) {
    const fw = (b.match(/^[A-Za-z]+/) || [''])[0];
    const lw = fw.toLowerCase();
    if (TENSE_MAP[lw] && (!current || lw.endsWith('ing'))) b = capFirst(TENSE_MAP[lw]) + b.slice(fw.length);
  }
  if (features.has('cliches')) b = replaceCliches(b);
  if (features.has('repetition') && verbCounts) {
    const fw = (b.match(/^[A-Za-z]+/) || [''])[0];
    const lw = fw.toLowerCase();
    const n = (verbCounts.get(lw) || 0) + 1;
    verbCounts.set(lw, n);
    if (n >= 3 && VERB_SYNONYMS[lw]) {
      const alt = VERB_SYNONYMS[lw][(n - 3) % VERB_SYNONYMS[lw].length];
      b = alt + b.slice(fw.length);
    }
  }
  b = capFirst(b.replace(/\s{2,}/g, ' ').trim());
  let needsMetric = false;
  if (features.has('quantify') && !QUANT_RE.test(b)) needsMetric = true;
  if (b !== before && changes) changes.push({ type: 'bullet', before, after: b });
  return { text: b, needsMetric };
}

function fmtDate(token) {
  if (!token) return '';
  if (/present|current|now|date|ongoing/i.test(token)) return 'Present';
  const d = toDate(token);
  if (!d) return token;
  const hasMonth = /[a-z]{3}|\d{1,2}[/.-]\d{2,4}/i.test(token);
  return hasMonth ? `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` : String(d.getFullYear());
}

function normalizeDatesIn(line) {
  return line.replace(DATE_RANGE_RE, (m, a, b) => `${fmtDate(a)} – ${fmtDate(b)}`);
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(And|Of|The|In|For|&)\b/g, (m) => m.toLowerCase());
}

export function generateSummary(analysis, extraSkills = []) {
  const m = analysis.model;
  const exp = m.sections.find((s) => s.key === 'experience');
  const firstRole = exp && exp.entries && exp.entries[0] ? exp.entries[0].heading.split(/\s{3,}|\s[|–—-]\s/)[0] : '';
  const title = (m.headline && m.headline.length < 50 ? m.headline : firstRole) || 'Professional';
  const yrs = m.yearsExperience;
  const listed = (m.sections.find((s) => s.key === 'skills')?.skills || []).map((x) => x.toLowerCase());
  const skills = [...new Set([...listed, ...analysis.stats.skills, ...extraSkills].map((x) => x.toLowerCase()))].slice(0, 6).map(prettySkill);
  const quant = m.bullets.map((b) => b.text).find((b) => QUANT_RE.test(b));
  const parts = [];
  parts.push(`${capFirst(title.replace(/^(senior|lead|principal)\s/i, (x) => x))}${yrs ? ` with ${yrs}+ years of experience` : ''}${skills.length ? ` across ${skills.slice(0, 3).join(', ')}` : ''}.`);
  if (quant) {
    const q = fixBullet(quant, { features: new Set(['bullets', 'tense', 'pronouns', 'cliches']), current: false }).text;
    parts.push(`Track record includes: ${q.charAt(0).toLowerCase() + q.slice(1)}.`);
  } else {
    parts.push('Known for shipping reliable work, improving processes and partnering closely with cross-functional teams.');
  }
  if (skills.length > 3) parts.push(`Skilled in ${skills.slice(3).join(', ')}.`);
  return parts.join(' ').replace(/\.\./g, '.');
}

// Build the fixed resume document model.
export function buildFixedResume(analysis, opts = {}) {
  const features = new Set(opts.features || []);
  const accepted = opts.acceptedKeywords || [];
  const overrides = opts.contact || {};
  const m = analysis.model;
  const changes = [];
  const verbCounts = new Map();

  const contact = {
    email: overrides.email ?? m.contact.email,
    phone: overrides.phone ?? m.contact.phone,
    location: overrides.location ?? m.contact.location,
    linkedin: (overrides.linkedin ?? m.contact.linkedin).replace(/^https?:\/\/(www\.)?/, ''),
    website: (overrides.website ?? m.contact.website).replace(/^https?:\/\/(www\.)?/, ''),
  };
  if (features.has('contact') && contact.phone) contact.phone = contact.phone.replace(/[^\d+]+/g, ' ').trim();

  const sections = [];
  for (const s of m.sections) {
    const title = features.has('headings') ? (CANONICAL_TITLES[s.key] || titleCase(s.title)) : s.title;
    if (title !== s.title && features.has('headings')) changes.push({ type: 'heading', before: s.title, after: title });
    const out = { key: s.key, title };
    if (s.key === 'summary') {
      let t = s.text || '';
      if (features.has('pronouns')) t = removePronouns(t);
      if (features.has('cliches')) t = replaceCliches(t);
      t = capFirst(t);
      if (t !== s.text) changes.push({ type: 'summary', before: s.text, after: t });
      out.type = 'text';
      out.text = t;
    } else if (s.key === 'skills') {
      out.type = 'list';
      const base = (s.skills && s.skills.length ? s.skills : s.lines).map((x) => x.trim()).filter(Boolean);
      const merged = [...base];
      for (const k of accepted) if (!merged.some((x) => x.toLowerCase() === k.toLowerCase())) { merged.push(prettySkill(k)); changes.push({ type: 'keyword', before: '', after: prettySkill(k) }); }
      out.list = merged;
    } else if (s.entries) {
      out.type = 'entries';
      out.items = s.entries.map((e) => {
        const heading = features.has('dates') ? normalizeDatesIn(e.heading) : e.heading;
        const meta = e.meta.map((x) => (features.has('dates') ? normalizeDatesIn(x) : x));
        if (features.has('dates') && (heading !== e.heading || meta.join() !== e.meta.join())) changes.push({ type: 'date', before: [e.heading, ...e.meta].join(' · '), after: [heading, ...meta].join(' · ') });
        const bullets = e.bullets.map((b) => fixBullet(b, { features, current: e.current, verbCounts, changes }));
        return { heading, meta, bullets };
      });
    } else {
      out.type = 'lines';
      out.lines = s.lines.map((l) => (features.has('cliches') ? replaceCliches(l) : l));
    }
    sections.push(out);
  }

  // Missing sections
  if (features.has('summary')) {
    const sum = sections.find((s) => s.key === 'summary');
    const generated = generateSummary(analysis, accepted);
    if (!sum) { sections.unshift({ key: 'summary', title: CANONICAL_TITLES.summary, type: 'text', text: generated, generated: true }); changes.push({ type: 'summary', before: '', after: generated }); }
    else if (!sum.text || sum.text.split(/\s+/).length < 15 || opts.rewriteSummary) { changes.push({ type: 'summary', before: sum.text, after: generated }); sum.text = generated; sum.generated = true; }
  }
  if (accepted.length && !sections.some((s) => s.key === 'skills')) {
    sections.push({ key: 'skills', title: CANONICAL_TITLES.skills, type: 'list', list: [...analysis.stats.skills.map(prettySkill), ...accepted.map(prettySkill)].filter((v, i, a) => a.indexOf(v) === i) });
  } else if (!sections.some((s) => s.key === 'skills') && features.has('headings') && analysis.stats.skills.length) {
    sections.push({ key: 'skills', title: CANONICAL_TITLES.skills, type: 'list', list: analysis.stats.skills.map(prettySkill) });
    changes.push({ type: 'heading', before: '', after: 'Skills (added from your experience)' });
  }

  if (features.has('headings')) {
    sections.sort((a, b) => {
      const ia = SECTION_ORDER.indexOf(a.key); const ib = SECTION_ORDER.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }

  const headline = opts.headline ?? m.headline;
  return { name: opts.name ?? m.name, headline, contact, sections, changes };
}

export function resumeToText(doc) {
  const out = [];
  out.push(doc.name || '');
  if (doc.headline) out.push(doc.headline);
  const c = doc.contact;
  out.push([c.location, c.phone, c.email, c.linkedin, c.website].filter(Boolean).join(' | '));
  for (const s of doc.sections) {
    out.push('', s.title.toUpperCase());
    if (s.type === 'text') out.push(s.text);
    if (s.type === 'list') out.push(s.list.join(', '));
    if (s.type === 'lines') out.push(...s.lines);
    if (s.type === 'entries') {
      for (const it of s.items) {
        out.push(it.heading, ...it.meta);
        for (const b of it.bullets) out.push(`• ${typeof b === 'string' ? b : b.text}`);
        out.push('');
      }
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function generateCoverLetter(analysis, doc, { company = '', role = '', manager = '' } = {}) {
  const m = analysis.model;
  const yrs = m.yearsExperience;
  const wins = doc.sections.filter((s) => s.type === 'entries').flatMap((s) => s.items.flatMap((i) => i.bullets.map((b) => (typeof b === 'string' ? b : b.text)))).filter((b) => QUANT_RE.test(b)).slice(0, 3);
  const fallbackWins = doc.sections.filter((s) => s.type === 'entries').flatMap((s) => s.items.flatMap((i) => i.bullets.map((b) => (typeof b === 'string' ? b : b.text)))).slice(0, 3);
  const matched = analysis.keywords ? analysis.keywords.matched.slice(0, 5).map((k) => prettySkill(k.term)) : analysis.stats.skills.slice(0, 5).map(prettySkill);
  const roleName = role || 'this role';
  const co = company || 'your company';
  const lines = [];
  lines.push(`Dear ${manager || 'Hiring Manager'},`, '');
  lines.push(`I am applying for the ${roleName} position at ${co}. With ${yrs ? `${yrs}+ years of` : 'hands-on'} experience${matched.length ? ` in ${matched.slice(0, 3).join(', ')}` : ''}, I can contribute from day one.`, '');
  lines.push('A few results I would bring:');
  (wins.length ? wins : fallbackWins).forEach((w) => lines.push(`• ${w}`));
  lines.push('');
  if (matched.length > 3) lines.push(`My background in ${matched.slice(3).join(' and ')} lines up closely with what you are looking for, and I enjoy working across product, engineering and business teams to get things shipped.`, '');
  lines.push(`I would welcome the chance to discuss how I can help ${co} reach its goals. Thank you for your time and consideration.`, '');
  lines.push('Sincerely,', doc.name || '', [doc.contact.email, doc.contact.phone].filter(Boolean).join(' | '));
  return lines.join('\n');
}

export function generateLinkedIn(analysis, doc) {
  const sum = doc.sections.find((s) => s.key === 'summary');
  const skills = (doc.sections.find((s) => s.key === 'skills')?.list || analysis.stats.skills.map(prettySkill)).slice(0, 5);
  const exp = doc.sections.find((s) => s.key === 'experience');
  const title = doc.headline || (exp && exp.items[0] ? exp.items[0].heading.split(/\s{3,}|\s[|–—-]\s/)[0] : 'Professional');
  const headline = `${title} | ${skills.slice(0, 3).join(' · ')}${analysis.model.yearsExperience ? ` | ${analysis.model.yearsExperience}+ yrs` : ''}`.slice(0, 220);
  const wins = exp ? exp.items.flatMap((i) => i.bullets.map((b) => (typeof b === 'string' ? b : b.text))).filter((b) => QUANT_RE.test(b)).slice(0, 3) : [];
  const about = [
    sum ? sum.text : generateSummary(analysis),
    '',
    wins.length ? 'Highlights:' : '',
    ...wins.map((w) => `→ ${w}`),
    '',
    `Core skills: ${skills.join(', ')}`,
    '',
    'Open to conversations about new opportunities — feel free to connect.',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  return { headline, about };
}

export { ACTION_VERBS, findSkills };
