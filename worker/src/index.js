// ResumeRx payments + AI worker (Cloudflare Workers, free tier is enough).
// Stateless: no database. Payments are verified directly with Stripe / Razorpay and turned
// into ES256-signed license tokens the app verifies offline with the public key.
import { PLANS, PLAN_BY_ID, planHas } from '../../shared/plans.js';

const DAY = 86400;
const enc = new TextEncoder();

/* ---------------- utils ---------------- */
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64urlJson = (o) => b64url(enc.encode(JSON.stringify(o)));
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function corsHeaders(req, env) {
  const origin = req.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || allowed.includes('*');
  return {
    'access-control-allow-origin': ok ? origin : allowed[0] || '',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

/* ---------------- license signing ---------------- */
async function signingKey(env) {
  const jwk = JSON.parse(env.SIGNING_KEY_JWK);
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
async function verifyKey(env) {
  const { d, key_ops, ...pub } = JSON.parse(env.SIGNING_KEY_JWK);
  return crypto.subtle.importKey('jwk', { ...pub, key_ops: ['verify'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}
export async function issueToken(env, { plan, exp, sub, prov, ref, email }) {
  const head = b64urlJson({ alg: 'ES256', typ: 'JWT' });
  const body = b64urlJson({ plan, exp, iat: Math.floor(Date.now() / 1000), sub, prov, ref, email: email || undefined });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(env), enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}
export async function readToken(env, token, { allowExpired = false } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Invalid license');
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await verifyKey(env), fromB64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new HttpError(401, 'Invalid license');
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  if (!allowExpired && payload.exp < Date.now() / 1000) throw new HttpError(402, 'License expired');
  return payload;
}
const bearer = (req) => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');

/* ---------------- Stripe ---------------- */
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}
async function stripe(env, method, path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: params ? form(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, data.error?.message || 'Stripe error');
  return data;
}
function periodEnd(sub) {
  return sub.current_period_end || sub.items?.data?.[0]?.current_period_end || Math.floor(Date.now() / 1000) + 31 * DAY;
}
function planFromSubscription(sub) {
  if (sub.metadata?.plan && PLAN_BY_ID[sub.metadata.plan]) return sub.metadata.plan;
  const cents = sub.items?.data?.[0]?.price?.unit_amount;
  const p = PLANS.find((x) => x.usd * 100 === cents);
  return p ? p.id : null;
}

function assertAllowedUrl(env, url) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  let origin;
  try { origin = new URL(url.replace('{CHECKOUT_SESSION_ID}', 'x')).origin; } catch { throw new HttpError(400, 'Bad return URL'); }
  if (!allowed.includes(origin)) throw new HttpError(400, 'Return URL not allowed');
}

/* ---------------- Razorpay ---------------- */
async function razorpay(env, method, path, body) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, data.error?.description || 'Razorpay error');
  return data;
}
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* ---------------- AI ---------------- */
async function claude(env, system, user, maxTokens = 2000) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(501, 'AI is not configured on the server');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, data.error?.message || 'AI error');
  return data.content.map((c) => c.text || '').join('');
}
const RESUME_RULES = 'You are an expert resume writer optimising for Applicant Tracking Systems. Rules: start each bullet with a strong past-tense action verb (present tense only if the role is current); keep each bullet under 30 words; keep every fact, number, tool and employer exactly as given; never invent metrics, employers, titles or skills; where a metric is clearly missing write [X] as a placeholder for the user to fill; naturally include the provided job keywords only where they truthfully fit; no first-person pronouns; no clichés.';

/* ---------------- routes ---------------- */
async function route(req, env, url) {
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

  if (p === '/' || p === '/health') return { ok: true, stripe: !!env.STRIPE_SECRET_KEY, razorpay: !!env.RAZORPAY_KEY_ID, ai: !!env.ANTHROPIC_API_KEY };

  if (p === '/checkout' && req.method === 'POST') {
    const plan = PLAN_BY_ID[body.plan];
    if (!plan || !plan.usd) throw new HttpError(400, 'Unknown plan');
    if (body.provider === 'razorpay') {
      if (!env.RAZORPAY_KEY_ID) throw new HttpError(501, 'Razorpay is not configured');
      const order = await razorpay(env, 'POST', '/orders', { amount: plan.inr * 100, currency: 'INR', receipt: `rrx_${Date.now()}`, notes: { plan: plan.id, email: body.email || '' } });
      return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env.RAZORPAY_KEY_ID };
    }
    if (!env.STRIPE_SECRET_KEY) throw new HttpError(501, 'Stripe is not configured');
    assertAllowedUrl(env, body.successUrl);
    assertAllowedUrl(env, body.cancelUrl);
    const session = await stripe(env, 'POST', '/checkout/sessions', {
      mode: 'subscription',
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      customer_email: body.email || undefined,
      allow_promotion_codes: 'true',
      billing_address_collection: 'auto',
      line_items: { 0: { quantity: 1, price_data: { currency: 'usd', unit_amount: plan.usd * 100, recurring: { interval: 'month' }, product_data: { name: `ResumeRx ${plan.name}`, description: plan.tagline } } } },
      metadata: { plan: plan.id, platform: body.platform || 'web' },
      subscription_data: { metadata: { plan: plan.id } },
    });
    return { url: session.url };
  }

  if (p === '/verify/stripe') {
    const id = url.searchParams.get('session_id');
    if (!id || !/^cs_/.test(id)) throw new HttpError(400, 'Missing session');
    const s = await stripe(env, 'GET', `/checkout/sessions/${encodeURIComponent(id)}?expand[]=subscription`);
    if (s.status !== 'complete' || !['paid', 'no_payment_required'].includes(s.payment_status)) throw new HttpError(402, 'Payment not completed');
    const sub = s.subscription;
    const plan = s.metadata?.plan || planFromSubscription(sub);
    const token = await issueToken(env, { plan, exp: periodEnd(sub) + 2 * DAY, sub: s.customer, prov: 'stripe', ref: sub.id, email: s.customer_details?.email });
    return { token };
  }

  if (p === '/verify/razorpay' && req.method === 'POST') {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = body;
    if (!orderId || !paymentId || !sig) throw new HttpError(400, 'Missing payment details');
    const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
    if (!safeEqual(expected, sig)) throw new HttpError(400, 'Signature mismatch');
    const [order, payment] = await Promise.all([razorpay(env, 'GET', `/orders/${orderId}`), razorpay(env, 'GET', `/payments/${paymentId}`)]);
    if (payment.order_id !== orderId || !['captured', 'authorized'].includes(payment.status)) throw new HttpError(402, 'Payment not captured');
    const plan = order.notes?.plan;
    if (!PLAN_BY_ID[plan]) throw new HttpError(400, 'Unknown plan on order');
    const token = await issueToken(env, { plan, exp: Math.floor(Date.now() / 1000) + 30 * DAY, sub: payment.email || payment.contact || paymentId, prov: 'razorpay', ref: paymentId, email: payment.email });
    return { token };
  }

  if (p === '/refresh' && req.method === 'POST') {
    const lic = await readToken(env, body.token, { allowExpired: true });
    if (lic.prov !== 'stripe') {
      if (lic.exp < Date.now() / 1000) throw new HttpError(402, 'Your 30-day pass has ended. Buy again to continue.');
      return { token: body.token };
    }
    const sub = await stripe(env, 'GET', `/subscriptions/${encodeURIComponent(lic.ref)}`);
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) throw new HttpError(402, 'Subscription is no longer active');
    const plan = planFromSubscription(sub) || lic.plan;
    return { token: await issueToken(env, { plan, exp: periodEnd(sub) + 2 * DAY, sub: lic.sub, prov: 'stripe', ref: lic.ref, email: lic.email }) };
  }

  if (p === '/portal' && req.method === 'POST') {
    const lic = await readToken(env, body.token, { allowExpired: true });
    if (lic.prov !== 'stripe') throw new HttpError(400, 'Billing portal is only for card subscriptions');
    assertAllowedUrl(env, body.returnUrl);
    const s = await stripe(env, 'POST', '/billing_portal/sessions', { customer: lic.sub, return_url: body.returnUrl });
    return { url: s.url };
  }

  if (p === '/ai' && req.method === 'POST') {
    const lic = await readToken(env, bearer(req));
    if (!planHas(lic.plan, 'ai')) throw new HttpError(403, 'AI rewrites need the Premium plan or higher');
    const jd = String(body.jd || '').slice(0, 6000);
    if (body.task === 'resume') {
      const bullets = (body.bullets || []).slice(0, 60).map((b) => String(b).slice(0, 400));
      const summary = String(body.summary || '').slice(0, 1500);
      const prompt = `Job description (may be empty):\n${jd}\n\nKeywords the candidate confirmed they have: ${(body.keywords || []).join(', ')}\n\nCurrent summary:\n${summary}\n\nBullets (JSON array):\n${JSON.stringify(bullets)}\n\nReturn ONLY JSON: {"summary": "2-3 sentence rewritten summary", "bullets": [rewritten bullets, same count and order]}`;
      const out = await claude(env, RESUME_RULES, prompt, 4000);
      const m = out.match(/\{[\s\S]*\}/);
      if (!m) throw new HttpError(502, 'AI returned an unexpected response');
      const parsed = JSON.parse(m[0]);
      if (!Array.isArray(parsed.bullets) || parsed.bullets.length !== bullets.length) parsed.bullets = bullets.map((b, i) => parsed.bullets?.[i] || b);
      return parsed;
    }
    if (body.task === 'cover') {
      if (!planHas(lic.plan, 'coverLetter')) throw new HttpError(403, 'Cover letters need the Career Ultimate plan');
      const text = await claude(env, `${RESUME_RULES} You write concise, specific cover letters (under 300 words) in plain text with no placeholders other than [X] for missing numbers.`,
        `Company: ${String(body.company || '').slice(0, 100)}\nRole: ${String(body.role || '').slice(0, 100)}\nHiring manager: ${String(body.manager || '').slice(0, 100)}\n\nJob description:\n${jd}\n\nResume:\n${String(body.resume || '').slice(0, 12000)}\n\nWrite the cover letter.`, 1500);
      return { text: text.trim() };
    }
    throw new HttpError(400, 'Unknown AI task');
  }

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const data = await route(req, env, new URL(req.url));
      return json(data, 200, cors);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      return json({ error: e.message || 'Server error' }, status, cors);
    }
  },
};
