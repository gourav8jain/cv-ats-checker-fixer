// Turns raw resume lines into a structured model: name, contact, sections, entries, bullets.
import { SECTION_SYNONYMS, MONTHS } from './dictionaries.js';

const BULLET_RE = /^\s*([•▪●◦○■□➢➤►▶✓✔\-*–—·]|\d{1,2}[.)])\s+/;
const MONTH_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_TOKEN = `(?:${MONTH_RE}\\.?,?\\s*'?\\d{2,4}|\\d{1,2}[/.-]\\d{2,4}|(?:19|20)\\d{2})`;
const END_TOKEN = `(?:${DATE_TOKEN}|present|current|now|till date|to date|ongoing)`;
export const DATE_RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*(?:-|–|—|to|until|till|~)\\s*(${END_TOKEN})`, 'i');
export const DATE_ANY_RE = new RegExp(DATE_TOKEN, 'ig');

export const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
export const PHONE_RE = /(\+?\d{1,3}[\s.-]?)?(\(?\d{2,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}/;
export const LINKEDIN_RE = /(https?:\/\/)?(www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i;
export const URL_RE = /(https?:\/\/)?(www\.)?(github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com|[a-z0-9-]+\.(dev|io|me|com|in|co))\/?[^\s,|]*/i;

const HEADING_LOOKUP = (() => {
  const map = new Map();
  for (const [key, list] of Object.entries(SECTION_SYNONYMS)) list.forEach((s) => map.set(s, key));
  return map;
})();

export function normalizeHeading(line) {
  return line.toLowerCase().replace(/[:|_•\-–—]+$/g, '').replace(/^[^a-z]+/, '').replace(/\s+/g, ' ').trim();
}

export function detectHeading(line) {
  if (!line || line.length > 45) return null;
  if (BULLET_RE.test(line)) return null;
  const norm = normalizeHeading(line);
  if (HEADING_LOOKUP.has(norm)) return { key: HEADING_LOOKUP.get(norm), raw: line, standard: true };
  const words = norm.split(' ');
  const isCaps = line === line.toUpperCase() && /[A-Z]/.test(line);
  // Fuzzy: heading contains a known keyword (e.g. "My Work Experience", "Technical Skill Set")
  if (words.length <= 5) {
    for (const [key, list] of Object.entries(SECTION_SYNONYMS)) {
      if (list.some((s) => s.length > 4 && norm.includes(s))) return { key, raw: line, standard: false };
    }
  }
  if (isCaps && words.length <= 4 && !/\d/.test(line) && !EMAIL_RE.test(line)) {
    return { key: 'other', raw: line, standard: false };
  }
  return null;
}

export function isBullet(line) {
  return BULLET_RE.test(line);
}

export function stripBullet(line) {
  return line.replace(BULLET_RE, '').trim();
}

export function extractContact(lines, text) {
  const head = lines.slice(0, 12).join(' | ');
  const email = (text.match(EMAIL_RE) || [])[0] || '';
  const linkedin = (text.match(LINKEDIN_RE) || [])[0] || '';
  let phone = '';
  for (const l of lines.slice(0, 15)) {
    const cleaned = l.replace(EMAIL_RE, '').replace(LINKEDIN_RE, '');
    const m = cleaned.match(/(\+?\d[\d\s().-]{8,}\d)/);
    if (m && m[1].replace(/\D/g, '').length >= 9 && m[1].replace(/\D/g, '').length <= 15 && !DATE_RANGE_RE.test(m[1])) { phone = m[1].trim(); break; }
  }
  let website = '';
  for (const l of lines.slice(0, 15)) {
    const m = l.replace(EMAIL_RE, '').replace(LINKEDIN_RE, '').match(URL_RE);
    if (m && /\//.test(m[0]) || (m && /github|gitlab|behance|dribbble|portfolio/.test(m[0]))) { website = m[0]; break; }
  }
  let location = '';
  const locRe = /\b([A-Z][a-zA-Z.\s]{1,25}),\s*([A-Z]{2}\b|[A-Z][a-zA-Z\s]{2,20})\b/;
  for (const l of lines.slice(0, 10)) {
    const parts = l.split(/\s*[|•·,]\s{0,}|\s{3,}/).length > 1 ? l.split(/\s*[|•·]\s*|\s{3,}/) : [l];
    for (const part of parts) {
      if (EMAIL_RE.test(part) || /\d{5,}/.test(part) || LINKEDIN_RE.test(part)) continue;
      const m = part.match(locRe);
      if (m && part.length < 45) { location = m[0].trim(); break; }
    }
    if (location) break;
  }
  return { email, phone, linkedin, website, location, headerText: head };
}

function guessName(lines) {
  for (const l of lines.slice(0, 5)) {
    const clean = l.split(/\s*[|•·]\s*|\s{3,}/)[0].trim();
    { const hh = detectHeading(clean); if (EMAIL_RE.test(clean) || /\d/.test(clean) || (hh && hh.key !== 'other')) continue; }
    const words = clean.split(/\s+/);
    if (words.length >= 1 && words.length <= 5 && clean.length <= 40 && /^[A-Za-z][A-Za-z.'’\s-]+$/.test(clean)) {
      return clean.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b([A-Z])([A-Z]+)\b/g, (m, a, b) => a + b.toLowerCase());
    }
  }
  return '';
}

export function parseDates(str) {
  const m = str.match(DATE_RANGE_RE);
  if (m) return { start: m[1], end: m[2], raw: m[0] };
  const single = str.match(new RegExp(`(${MONTH_RE}\\.?,?\\s*'?\\d{2,4}|\\b(?:19|20)\\d{2}\\b)`, 'i'));
  return single ? { start: single[0], end: '', raw: single[0] } : null;
}

export function toDate(token) {
  if (!token) return null;
  const t = token.toLowerCase().trim();
  if (/present|current|now|date|ongoing/.test(t)) return new Date();
  const mName = t.match(/([a-z]{3})[a-z]*\.?,?\s*'?(\d{2,4})/);
  if (mName) {
    const mi = MONTHS.indexOf(mName[1]);
    let y = parseInt(mName[2], 10);
    if (y < 100) y += y > 50 ? 1900 : 2000;
    return new Date(y, Math.max(mi, 0), 1);
  }
  const mNum = t.match(/(\d{1,2})[/.-](\d{2,4})/);
  if (mNum) {
    let y = parseInt(mNum[2], 10);
    if (y < 100) y += y > 50 ? 1900 : 2000;
    return new Date(y, Math.min(parseInt(mNum[1], 10), 12) - 1, 1);
  }
  const y = t.match(/(19|20)\d{2}/);
  return y ? new Date(parseInt(y[0], 10), 0, 1) : null;
}

function looksLikeBulletProse(line) {
  return line.length > 70 || /^[A-Z][a-z]+ed\b/.test(line);
}

function buildEntries(lines) {
  const items = [];
  let cur = null;
  for (const line of lines) {
    if (isBullet(line)) {
      if (!cur) { cur = { heading: '', meta: [], bullets: [] }; items.push(cur); }
      cur.bullets.push(stripBullet(line));
      continue;
    }
    const hasDate = DATE_RANGE_RE.test(line) || parseDates(line);
    if (cur && cur.bullets.length === 0 && cur.meta.length < 2 && !looksLikeBulletProse(line)) {
      cur.meta.push(line);
      continue;
    }
    if (cur && !hasDate && looksLikeBulletProse(line)) {
      cur.bullets.push(line);
      continue;
    }
    // Continuation of a wrapped bullet (starts lowercase)
    if (cur && cur.bullets.length && /^[a-z(]/.test(line)) {
      cur.bullets[cur.bullets.length - 1] += ' ' + line;
      continue;
    }
    cur = { heading: line, meta: [], bullets: [] };
    items.push(cur);
  }
  for (const it of items) {
    const all = [it.heading, ...it.meta].join(' | ');
    it.dates = parseDates(all);
    if (it.dates) {
      it.startDate = toDate(it.dates.start);
      it.endDate = toDate(it.dates.end) || it.startDate;
      it.current = /present|current|now|date|ongoing/i.test(it.dates.end || '');
    }
  }
  return items;
}

export function structure(parsed) {
  const { lines, text } = parsed;
  const contact = extractContact(lines, text);
  const name = guessName(lines);
  const sections = [];
  const preamble = [];
  let cur = null;
  for (const [idx, line] of lines.entries()) {
    let h = detectHeading(line);
    // An all-caps name at the very top is not a section heading.
    if (h && h.key === 'other' && !cur && idx < 3) h = null;
    if (h) {
      cur = { key: h.key, title: h.raw, standard: h.standard, lines: [] };
      sections.push(cur);
      continue;
    }
    if (cur) cur.lines.push(line);
    else preamble.push(line);
  }
  // Headline: a short line in the preamble that is not name/contact.
  const headline = preamble.find((l, i) => i > 0 && l.length < 70 && !EMAIL_RE.test(l) && !/\d{6,}/.test(l.replace(/\D/g, '')) && !LINKEDIN_RE.test(l) && l !== name && !l.includes('|') && !/@/.test(l)) || '';

  for (const s of sections) {
    if (['experience', 'projects', 'education', 'volunteer', 'other'].includes(s.key)) s.entries = buildEntries(s.lines);
    if (s.key === 'skills') {
      s.skills = s.lines.flatMap((l) => stripBullet(l).replace(/^[^:]{2,30}:\s*/, '').split(/\s*[,|•·;]\s*|\s{3,}/)).map((x) => x.trim()).filter((x) => x && x.length < 50);
    }
    if (s.key === 'summary') s.text = s.lines.map(stripBullet).join(' ');
  }
  // Preamble paragraphs that look like a summary when no summary section exists
  if (!sections.some((s) => s.key === 'summary')) {
    const para = preamble.filter((l) => l.length > 90).join(' ');
    if (para) sections.unshift({ key: 'summary', title: 'Summary', standard: false, implicit: true, lines: [para], text: para });
  }

  const exp = sections.find((s) => s.key === 'experience');
  let yearsExperience = 0;
  if (exp && exp.entries) {
    const starts = exp.entries.map((e) => e.startDate).filter(Boolean);
    const ends = exp.entries.map((e) => e.endDate).filter(Boolean);
    if (starts.length && ends.length) {
      const min = Math.min(...starts.map(Number));
      const max = Math.max(...ends.map(Number));
      yearsExperience = Math.max(0, Math.round((max - min) / (365.25 * 24 * 3600 * 1000)));
    }
  }

  const allBullets = sections.flatMap((s) => (s.entries || []).flatMap((e) => e.bullets.map((b) => ({ text: b, section: s.key, entry: e }))));
  return { name, headline, contact, sections, preamble, yearsExperience, bullets: allBullets };
}
