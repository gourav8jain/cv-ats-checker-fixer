// ATS analysis: produces a 0-100 score with categories, issues and the fix that resolves each.
import { ACTION_VERBS, WEAK_DETECT, CLICHES, PRONOUNS } from './dictionaries.js';
import { structure, DATE_ANY_RE } from './structure.js';
import { extractJdKeywords, matchKeywords, findSkills } from './keywords.js';

const QUANT_RE = /(\d+(\.\d+)?\s?(%|percent|x\b|k\b|m\b|bn\b|million|billion|lakh|crore|hrs?|hours|days|weeks|months|users|customers|clients|people|engineers|members|projects|countries|markets)|[$€£₹]\s?\d|\b\d{2,}\b)/i;
const PASSIVE_RE = /\b(was|were|been|being|is|are)\s+(\w+ed|built|done|made|led|run|given|taken|written|chosen)\b/i;

function issue(id, severity, title, detail, fix, extra = {}) {
  return { id, severity, title, detail, fix, ...extra };
}

function firstWord(b) {
  return (b.match(/^[A-Za-z][A-Za-z-]*/) || [''])[0].toLowerCase();
}

export function analyze(parsed, jd = '') {
  const model = structure(parsed);
  const { meta, text } = parsed;
  const cats = [];
  const has = (k) => model.sections.some((s) => s.key === k);

  // 1. Parseability / formatting (20)
  {
    const issues = [];
    let s = 20;
    if (meta.scanned) { s -= 20; issues.push(issue('scanned', 'critical', 'No readable text found', 'This looks like a scanned or image-based file. Most ATS will read it as blank. Export a text-based PDF or DOCX.', 'format')); }
    if (meta.multiColumn) { s -= 6; issues.push(issue('columns', 'high', 'Multi-column layout detected', 'Columns are often read left-to-right across the page, scrambling your sections. Use a single-column layout.', 'format')); }
    if (meta.tables > 0) { s -= 5; issues.push(issue('tables', 'high', `${meta.tables} table${meta.tables > 1 ? 's' : ''} found`, 'Many ATS skip or garble table cells. Move content into plain text lines.', 'format')); }
    if (meta.images > 0) { s -= 3; issues.push(issue('images', 'medium', `${meta.images} image${meta.images > 1 ? 's' : ''} or graphic${meta.images > 1 ? 's' : ''}`, 'Photos, icons and skill bars are invisible to ATS and can trigger bias filters. Remove them.', 'format')); }
    if (meta.specialChars > 3) { s -= 2; issues.push(issue('icons', 'low', 'Icons or special symbols in text', 'Symbol fonts and emoji often turn into “?” in an ATS. Use plain words like “Email:”.', 'format')); }
    if (meta.fontCount > 6) { s -= 2; issues.push(issue('fonts', 'low', 'Too many fonts', `${meta.fontCount} font styles detected. Stick to one font family for a cleaner parse.`, 'format')); }
    if (meta.fileType === 'docx' || meta.fileType === 'pdf') { /* good */ } else if (meta.fileType === 'txt') {
      issues.push(issue('txt', 'low', 'Plain text file', 'Plain text parses well, but recruiters expect a formatted PDF or DOCX. We can export one for you.', 'format'));
    }
    cats.push({ id: 'format', name: 'ATS parse & format', max: 20, score: Math.max(0, s), issues });
  }

  // 2. Contact (10)
  {
    const c = model.contact;
    const issues = [];
    let s = 10;
    if (!model.name) { s -= 2; issues.push(issue('name', 'medium', 'Name not found at the top', 'Put your full name alone on the first line so the ATS can capture it.', 'contact')); }
    if (!c.email) { s -= 4; issues.push(issue('email', 'critical', 'No email address', 'Recruiters cannot contact you. Add a professional email near the top.', 'contact')); }
    else if (/(hotmail|yahoo|aol|rediff)\./i.test(c.email) || /\d{4,}/.test(c.email.split('@')[0])) { s -= 1; issues.push(issue('email-pro', 'low', 'Email looks informal', 'Use a firstname.lastname style address on a modern provider.', 'contact')); }
    if (!c.phone) { s -= 2; issues.push(issue('phone', 'high', 'No phone number', 'Add a phone number with country code.', 'contact')); }
    if (!c.linkedin) { s -= 1; issues.push(issue('linkedin', 'low', 'No LinkedIn URL', 'Most recruiters check LinkedIn. Add your profile URL.', 'contact')); }
    if (!c.location) { s -= 1; issues.push(issue('location', 'low', 'No location', 'Add City, Country. Many ATS filter candidates by location.', 'contact')); }
    cats.push({ id: 'contact', name: 'Contact details', max: 10, score: Math.max(0, s), issues });
  }

  // 3. Sections (15)
  {
    const issues = [];
    let s = 15;
    if (!has('experience')) { s -= 6; issues.push(issue('no-exp', 'critical', 'No Experience section found', 'ATS look for a heading like “Work Experience”. Rename yours or add one.', 'headings')); }
    if (!has('education')) { s -= 3; issues.push(issue('no-edu', 'high', 'No Education section found', 'Add an “Education” heading, even for experienced candidates.', 'headings')); }
    if (!has('skills')) { s -= 3; issues.push(issue('no-skills', 'high', 'No Skills section found', 'A dedicated “Skills” section is where ATS match most keywords.', 'headings')); }
    if (!has('summary')) { s -= 2; issues.push(issue('no-summary', 'medium', 'No professional summary', 'A 2–3 line summary with your title and top skills improves matching and recruiter skim.', 'summary')); }
    const nonStd = model.sections.filter((x) => !x.standard && !x.implicit);
    if (nonStd.length) { s -= Math.min(3, nonStd.length); issues.push(issue('nonstd', 'medium', 'Non-standard section headings', `Headings like ${nonStd.slice(0, 3).map((x) => `“${x.title}”`).join(', ')} may not be recognised. Use standard names.`, 'headings')); }
    cats.push({ id: 'sections', name: 'Sections & structure', max: 15, score: Math.max(0, s), issues });
  }

  // 4. Impact (25)
  const bullets = model.bullets.map((b) => b.text);
  {
    const issues = [];
    let s = 25;
    if (bullets.length === 0) {
      s = 0;
      issues.push(issue('no-bullets', 'critical', 'No bullet points found', 'Describe each role with 3–6 bullet points starting with an action verb and ending with a result.', 'bullets'));
    } else if (bullets.length < 4) {
      s -= 10;
      issues.push(issue('few-bullets', 'high', 'Too few bullet points', 'Describe each role with 3–6 bullet points starting with an action verb.', 'bullets'));
    }
    if (bullets.length) {
      const weak = bullets.filter((b) => WEAK_DETECT.test(b));
      const actionStart = bullets.filter((b) => ACTION_VERBS.has(firstWord(b))).length / bullets.length;
      const quant = bullets.filter((b) => QUANT_RE.test(b));
      const passive = bullets.filter((b) => PASSIVE_RE.test(b));
      const long = bullets.filter((b) => b.split(/\s+/).length > 35);
      const short = bullets.filter((b) => b.split(/\s+/).length < 5);
      if (weak.length) { s -= Math.min(6, weak.length * 1.5); issues.push(issue('weak', 'high', `${weak.length} bullet${weak.length > 1 ? 's start' : ' starts'} with weak phrasing`, 'Phrases like “responsible for” or “helped with” describe duties, not results.', 'bullets', { examples: weak.slice(0, 3) })); }
      if (actionStart < 0.6) { s -= 5 * (1 - actionStart); issues.push(issue('verbs', 'medium', `Only ${Math.round(actionStart * 100)}% of bullets start with an action verb`, 'Aim for 80%+. Start with verbs like Led, Built, Reduced, Launched.', 'bullets')); }
      const qRatio = quant.length / bullets.length;
      if (qRatio < 0.4) { s -= 8 * (1 - qRatio / 0.4); issues.push(issue('quant', 'high', `Only ${Math.round(qRatio * 100)}% of bullets include numbers`, 'Quantified results (%, $, time saved, team size) are what recruiters scan for. Aim for 40%+.', 'quantify', { examples: bullets.filter((b) => !QUANT_RE.test(b)).slice(0, 3) })); }
      if (passive.length) { s -= Math.min(3, passive.length); issues.push(issue('passive', 'medium', `${passive.length} bullet${passive.length > 1 ? 's use' : ' uses'} passive voice`, 'Write “Reduced costs” instead of “Costs were reduced”.', 'bullets', { examples: passive.slice(0, 2) })); }
      if (long.length) { s -= Math.min(2, long.length); issues.push(issue('long', 'low', `${long.length} bullet${long.length > 1 ? 's are' : ' is'} too long`, 'Keep bullets under ~30 words so they are skimmable.', 'bullets')); }
      if (short.length > 2) { s -= 1; issues.push(issue('short', 'low', 'Some bullets are too vague', 'Very short bullets rarely show impact. Add what you did and the result.', 'bullets')); }
    }
    cats.push({ id: 'impact', name: 'Impact & achievements', max: 25, score: Math.max(0, Math.round(s)), issues });
  }

  // 5. Language (10)
  {
    const issues = [];
    let s = 10;
    const lower = text.toLowerCase();
    const cliches = Object.keys(CLICHES).filter((c) => new RegExp(`\\b${c.replace(/[-]/g, '[- ]')}\\b`, 'i').test(lower));
    if (cliches.length) { s -= Math.min(3, cliches.length); issues.push(issue('cliches', 'medium', `${cliches.length} cliché${cliches.length > 1 ? 's' : ''} or buzzword${cliches.length > 1 ? 's' : ''}`, `Recruiters skip filler like ${cliches.slice(0, 4).map((c) => `“${c}”`).join(', ')}. Show it with evidence instead.`, 'cliches', { examples: cliches })); }
    const pronounHits = bullets.join(' ').match(PRONOUNS) || [];
    const summary = model.sections.find((x) => x.key === 'summary');
    const summaryPron = summary ? (summary.text.match(PRONOUNS) || []).length : 0;
    if (pronounHits.length + summaryPron > 1) { s -= 2; issues.push(issue('pronouns', 'low', 'First-person pronouns used', 'Drop “I”, “my”, “we” — resumes are written in implied first person.', 'pronouns')); }
    // Verb repetition
    const starts = bullets.map(firstWord).filter(Boolean);
    const freq = starts.reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map());
    const repeated = [...freq.entries()].filter(([, n]) => n >= 3).map(([w, n]) => `${w} (${n}×)`);
    if (repeated.length) { s -= Math.min(2, repeated.length); issues.push(issue('repeat', 'low', 'Repetitive action verbs', `Over-used: ${repeated.join(', ')}. Vary your verbs.`, 'repetition')); }
    // Tense consistency in past roles
    const exp = model.sections.find((x) => x.key === 'experience');
    let tenseMismatch = 0;
    if (exp && exp.entries) {
      for (const e of exp.entries.filter((en) => !en.current)) {
        tenseMismatch += e.bullets.filter((b) => /^(manage|lead|develop|build|create|design|drive|own|work|support|maintain|handle|coordinate|implement|ensure|deliver|test)(s|ing)?\b/i.test(b)).length;
      }
    }
    if (tenseMismatch) { s -= Math.min(2, tenseMismatch); issues.push(issue('tense', 'medium', `${tenseMismatch} bullet${tenseMismatch > 1 ? 's' : ''} in past roles use present tense`, 'Use past tense for previous jobs and present tense only for your current role.', 'tense')); }
    cats.push({ id: 'language', name: 'Language & tone', max: 10, score: Math.max(0, s), issues });
  }

  // 6. Length & dates (10)
  {
    const issues = [];
    let s = 10;
    const wc = meta.wordCount;
    if (wc < 120) { s -= 8; issues.push(issue('too-short', 'critical', `Very little text (${wc} words)`, 'This does not look like a full resume. Upload the complete document.', 'bullets')); }
    else if (wc < 250) { s -= 4; issues.push(issue('too-short', 'high', `Resume is short (${wc} words)`, 'Most strong resumes have 400–900 words. Add detail on achievements.', 'bullets')); }
    else if (wc > 1300) { s -= 3; issues.push(issue('too-long', 'medium', `Resume is long (${wc} words)`, 'Trim older or less relevant roles. Recruiters spend ~7 seconds on a first pass.', 'bullets')); }
    if (meta.pages > 2 && model.yearsExperience < 15) { s -= 2; issues.push(issue('pages', 'medium', `${meta.pages} pages`, 'Keep it to 1–2 pages unless you have 15+ years of experience.', 'format')); }
    const dates = (text.match(DATE_ANY_RE) || []);
    const styles = new Set(dates.map((d) => (/^[a-z]/i.test(d) ? (/[a-z]{4,}/i.test(d) ? 'Month' : 'Mon') : /[/.-]/.test(d) ? 'num' : 'year')));
    styles.delete('year');
    if (styles.size > 1) { s -= 2; issues.push(issue('date-format', 'low', 'Inconsistent date formats', 'Mixing “Jan 2020”, “01/2020” and “January 2020” confuses date parsing. Use one format.', 'dates')); }
    const exp = model.sections.find((x) => x.key === 'experience');
    if (exp && exp.entries && exp.entries.length && exp.entries.filter((e) => !e.dates).length > exp.entries.length / 2) {
      s -= 3; issues.push(issue('no-dates', 'high', 'Missing employment dates', 'ATS calculate years of experience from dates. Add start and end dates for each role.', 'dates'));
    }
    cats.push({ id: 'length', name: 'Length & dates', max: 10, score: Math.max(0, s), issues });
  }

  // 7. Keywords (10)
  const jdKeywords = extractJdKeywords(jd);
  const skillsFound = findSkills(text);
  let keywordReport = null;
  {
    const issues = [];
    let s = 10;
    if (jdKeywords.length) {
      keywordReport = matchKeywords(text, jdKeywords);
      s = Math.round(10 * Math.min(1, keywordReport.percent / 75));
      if (keywordReport.percent < 75) issues.push(issue('jd-missing', keywordReport.percent < 45 ? 'critical' : 'high', `Matches ${keywordReport.percent}% of job keywords`, `Missing: ${keywordReport.missing.slice(0, 8).map((k) => k.term).join(', ')}. Add the ones you genuinely have.`, 'keywords'));
    } else {
      if (skillsFound.length < 6) { s -= 4; issues.push(issue('few-skills', 'medium', `Only ${skillsFound.length} recognisable hard skills`, 'List specific tools, technologies and methods. Paste a job description to see exactly what is missing.', 'keywords')); }
      issues.push(issue('add-jd', 'info', 'Paste a job description for a match score', 'Tailoring to each job is the single biggest ATS lever.', 'keywords'));
    }
    cats.push({ id: 'keywords', name: jdKeywords.length ? 'Job match keywords' : 'Hard skills', max: 10, score: Math.max(0, s), issues });
  }

  const total = cats.reduce((a, c) => a + c.score, 0);
  const max = cats.reduce((a, c) => a + c.max, 0);
  let score = Math.round((total / max) * 100);
  // Documents that are not really resumes should never look healthy.
  if (!has('experience') && meta.wordCount < 150) score = Math.min(score, 25);
  const issues = cats.flatMap((c) => c.issues.map((i) => ({ ...i, category: c.id })));
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    score,
    grade: score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs work' : 'At risk',
    categories: cats,
    issues,
    model,
    stats: {
      words: meta.wordCount,
      pages: meta.pages,
      bullets: bullets.length,
      quantified: bullets.filter((b) => QUANT_RE.test(b)).length,
      skills: skillsFound,
      yearsExperience: model.yearsExperience,
      sections: model.sections.map((x) => x.key),
    },
    keywords: keywordReport,
    jdKeywords,
  };
}

export { QUANT_RE };
