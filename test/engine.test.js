import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../src/engine/parser.js';
import { analyze } from '../src/engine/analyzer.js';
import { buildFixedResume, resumeToText, fixBullet, generateCoverLetter, generateLinkedIn } from '../src/engine/fixer.js';
import { extractJdKeywords, matchKeywords } from '../src/engine/keywords.js';
import { SAMPLE_RESUME, SAMPLE_JD } from '../src/engine/sample.js';
import { PLANS, planHas } from '../shared/plans.js';
import { CURRENCIES, COUNTRIES, DEFAULT_COUNTRY, currencyForCountry, priceFor, formatPrice, planFromAmount } from '../shared/pricing.js';

const ALL = ['format', 'contact', 'headings', 'dates', 'bullets', 'pronouns', 'cliches', 'tense', 'repetition', 'quantify', 'keywords', 'summary'];

test('sample resume is parsed into structure', () => {
  const a = analyze(parseText(SAMPLE_RESUME), SAMPLE_JD);
  assert.equal(a.model.name, 'Priya Sharma');
  assert.equal(a.model.contact.email, 'priya.sharma1990@yahoo.com');
  assert.equal(a.model.contact.location, 'Bengaluru, India');
  assert.ok(a.model.sections.find((s) => s.key === 'experience').entries.length === 2);
  assert.ok(a.score > 30 && a.score < 75, `score ${a.score}`);
  assert.ok(a.issues.some((i) => i.id === 'weak'));
  assert.ok(a.issues.some((i) => i.id === 'cliches'));
});

test('fixes raise the ATS score', () => {
  const a = analyze(parseText(SAMPLE_RESUME), SAMPLE_JD);
  const doc = buildFixedResume(a, { features: ALL, acceptedKeywords: ['playwright', 'docker', 'aws'] });
  const b = analyze(parseText(resumeToText(doc)), SAMPLE_JD);
  assert.ok(b.score >= a.score + 15, `${a.score} -> ${b.score}`);
  assert.ok(doc.changes.length > 10);
});

test('starter features do not rewrite bullets', () => {
  const a = analyze(parseText(SAMPLE_RESUME), '');
  const doc = buildFixedResume(a, { features: ['format', 'contact', 'headings', 'dates'] });
  const exp = doc.sections.find((s) => s.key === 'experience');
  assert.match(exp.items[0].bullets[0].text, /^Responsible for/);
  assert.equal(exp.title, 'Work Experience');
  assert.match(exp.items[1].meta.join(' '), /Jun 2017 – Dec 2020/);
});

test('bullet rewrites', () => {
  const f = new Set(['bullets', 'tense', 'pronouns', 'cliches']);
  assert.equal(fixBullet('Responsible for managing a team of 5', { features: f }).text, 'Managed a team of 5');
  assert.equal(fixBullet('Test cases were written for the wallet module', { features: f }).text, 'Wrote test cases for the wallet module');
  assert.equal(fixBullet('Manage vendor contracts', { features: f, current: false }).text, 'Managed vendor contracts');
  assert.equal(fixBullet('Manage vendor contracts', { features: f, current: true }).text, 'Manage vendor contracts');
  assert.ok(fixBullet('Built the app', { features: new Set(['quantify']) }).needsMetric);
});

test('keyword extraction & matching', () => {
  const kws = extractJdKeywords(SAMPLE_JD);
  const terms = kws.map((k) => k.term);
  for (const t of ['playwright', 'selenium', 'jmeter', 'docker', 'aws', 'pci dss']) assert.ok(terms.includes(t), t);
  const m = matchKeywords('Selenium and JMeter expert', kws);
  assert.ok(m.matched.some((k) => k.term === 'selenium'));
  assert.ok(m.missing.some((k) => k.term === 'docker'));
});

test('cover letter & linkedin', () => {
  const a = analyze(parseText(SAMPLE_RESUME), SAMPLE_JD);
  const doc = buildFixedResume(a, { features: ALL });
  assert.match(generateCoverLetter(a, doc, { company: 'Acme', role: 'QA Lead' }), /QA Lead position at Acme/);
  assert.ok(generateLinkedIn(a, doc).headline.length < 220);
});

test('plans span $9–$99 and are cumulative', () => {
  const paid = PLANS.filter((p) => p.usd);
  assert.equal(Math.min(...paid.map((p) => p.usd)), 9);
  assert.equal(Math.max(...paid.map((p) => p.usd)), 99);
  for (let i = 1; i < paid.length; i++) assert.ok(paid[i - 1].features.every((f) => paid[i].features.includes(f)));
  assert.ok(!planHas('free', 'format') && planHas('starter', 'format') && !planHas('starter', 'bullets') && planHas('ultimate', 'coverLetter'));
});

test('handles a resume with no structure gracefully', () => {
  const a = analyze(parseText('hello world this is not a resume at all'), '');
  assert.ok(a.score < 40);
  assert.ok(a.issues.some((i) => i.id === 'no-exp'));
});

test('country pricing: India/INR default, every currency priced for every paid plan', () => {
  assert.equal(DEFAULT_COUNTRY, 'IN');
  assert.equal(currencyForCountry('IN'), 'INR');
  assert.equal(currencyForCountry('GB'), 'GBP');
  assert.equal(currencyForCountry('ZZ'), 'USD');
  for (const c of COUNTRIES) assert.ok(CURRENCIES[c.currency], c.code);
  for (const [cur, def] of Object.entries(CURRENCIES)) {
    const vals = PLANS.filter((p) => p.usd).map((p) => priceFor(p.id, cur).amount);
    assert.ok(vals.every((v, i) => i === 0 || v > vals[i - 1]), `${cur} prices ascend`);
    assert.equal(planFromAmount(priceFor('premium', cur).minorUnits, cur.toLowerCase()), 'premium');
    assert.ok(def.symbol);
  }
  assert.equal(formatPrice(2399, 'INR'), '₹2,399');
  assert.equal(priceFor('ultimate', 'USD').amount, 99);
  assert.equal(priceFor('starter', 'JPY').minorUnits, 1400);
});
