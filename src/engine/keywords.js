import { SKILL_PHRASES, STOPWORDS } from './dictionaries.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export function containsPhrase(text, phrase) {
  const re = new RegExp(`(^|[^a-z0-9+#])${esc(phrase.toLowerCase())}(?=$|[^a-z0-9+#])`, 'i');
  return re.test(text.toLowerCase());
}

export function findSkills(text) {
  const lower = ' ' + text.toLowerCase() + ' ';
  const found = [];
  let scratch = lower;
  for (const s of SKILL_PHRASES) {
    const re = new RegExp(`(^|[^a-z0-9+#.])${esc(s)}(?=$|[^a-z0-9+#])`, 'g');
    if (re.test(scratch)) {
      found.push(s);
      scratch = scratch.replace(re, '$1 ');
    }
  }
  return found;
}

// Extract the important terms from a job description: known skills first, then frequent
// meaningful words / bigrams the employer repeats.
export function extractJdKeywords(jd, limit = 30) {
  if (!jd || jd.trim().length < 40) return [];
  const skills = findSkills(jd);
  const words = jd.toLowerCase().replace(/[^a-z0-9+#/.\s-]/g, ' ').split(/\s+/).map((w) => w.replace(/^[.-]+|[.-]+$/g, '')).filter(Boolean);
  const counts = new Map();
  const bump = (k, n = 1) => counts.set(k, (counts.get(k) || 0) + n);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w)) bump(w);
    const w2 = words[i + 1];
    if (w2 && !STOPWORDS.has(w) && !STOPWORDS.has(w2) && w.length > 2 && w2.length > 2 && !/^\d+$/.test(w + w2)) bump(`${w} ${w2}`, 1.5);
  }
  const frequent = [...counts.entries()]
    .filter(([k, v]) => v >= 2 && !skills.some((s) => s.includes(k) || k.includes(s)))
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  const out = [];
  for (const k of [...skills, ...frequent]) {
    if (!out.some((o) => o === k || (o.includes(k) && k.split(' ').length === 1))) out.push(k);
    if (out.length >= limit) break;
  }
  return out.map((k) => ({ term: k, isSkill: skills.includes(k), weight: skills.includes(k) ? 2 : 1 }));
}

export function matchKeywords(resumeText, jdKeywords) {
  const matched = [];
  const missing = [];
  for (const k of jdKeywords) {
    // Allow simple stemming: "test" matches "testing"
    const variants = [k.term, k.term.replace(/ing$/, ''), k.term.replace(/s$/, '')].filter((v, i) => i === 0 || v.length > 2);
    if (variants.some((v) => containsPhrase(resumeText, v))) matched.push(k);
    else missing.push(k);
  }
  const total = jdKeywords.reduce((a, k) => a + k.weight, 0) || 1;
  const got = matched.reduce((a, k) => a + k.weight, 0);
  return { matched, missing, percent: Math.round((got / total) * 100) };
}
