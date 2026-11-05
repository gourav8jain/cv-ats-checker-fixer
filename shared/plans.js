// Single source of truth for plans (prices per country/currency live in shared/pricing.js). Imported by the web app AND the payments worker,
// so prices shown in the UI always match what is charged.

export const FEATURES = {
  format: 'ATS-safe single-column export (DOCX, PDF, TXT)',
  contact: 'Contact block cleanup & missing-field prompts',
  headings: 'Standard section headings & ATS-friendly order',
  dates: 'Consistent date formatting',
  bullets: 'Weak-phrase & passive-voice bullet rewrites',
  pronouns: 'First-person pronoun removal',
  cliches: 'Cliché & buzzword cleanup',
  tense: 'Past/present tense correction',
  repetition: 'Repeated action-verb variation',
  quantify: 'Metric gaps flagged on every bullet',
  keywords: 'Job-description keyword tailoring',
  summary: 'Professional summary generator',
  ai: 'AI rewrite of bullets & summary',
  coverLetter: 'Tailored cover letter generator',
  linkedin: 'LinkedIn headline & About section',
  tailor: 'Unlimited tailored versions per job',
};

const STARTER = ['format', 'contact', 'headings', 'dates'];
const PRO = [...STARTER, 'bullets', 'pronouns', 'cliches', 'tense', 'repetition', 'quantify'];
const PREMIUM = [...PRO, 'keywords', 'summary', 'ai'];
const ULTIMATE = [...PREMIUM, 'coverLetter', 'linkedin', 'tailor'];

export const PLANS = [
  { id: 'free', name: 'Free', usd: 0, interval: 'month', tagline: 'Full ATS score & issue report', features: [], highlights: ['Unlimited ATS checks', 'Score across 7 categories', 'Job keyword match report', 'Preview of suggested fixes'] },
  { id: 'starter', name: 'Starter Fix', usd: 9, interval: 'month', tagline: 'Make it parse cleanly', features: STARTER, highlights: ['Everything in Free', 'ATS-safe DOCX / PDF / TXT export', 'Standard headings & section order', 'Contact & date cleanup'] },
  { id: 'pro', name: 'Pro Fix', usd: 29, interval: 'month', tagline: 'Rewrite weak bullets', features: PRO, popular: true, highlights: ['Everything in Starter', 'Bullet rewrites (weak verbs, passive voice)', 'Cliché, pronoun & tense fixes', 'Metric gaps flagged'] },
  { id: 'premium', name: 'Premium Tailor', usd: 59, interval: 'month', tagline: 'Tailor to every job', features: PREMIUM, highlights: ['Everything in Pro', 'Job keyword tailoring', 'Summary generator', 'AI rewrites'] },
  { id: 'ultimate', name: 'Career Ultimate', usd: 99, interval: 'month', tagline: 'The full application kit', features: ULTIMATE, highlights: ['Everything in Premium', 'Cover letter generator', 'LinkedIn headline & About', 'Unlimited tailored versions'] },
];

export const PLAN_BY_ID = Object.fromEntries(PLANS.map((p) => [p.id, p]));

export function planHas(planId, feature) {
  const p = PLAN_BY_ID[planId];
  return !!p && p.features.includes(feature);
}

export function cheapestPlanFor(feature) {
  return PLANS.find((p) => p.features.includes(feature));
}
