import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { readToken } from '../src/index.js';

const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const env = {
  SIGNING_KEY_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', privateKey)),
  STRIPE_SECRET_KEY: 'sk_test_x', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'rzpsecret', ANTHROPIC_API_KEY: 'sk-ant-x',
  ALLOWED_ORIGINS: 'https://gourav8jain.github.io,capacitor://localhost',
};
const pubJwk = await crypto.subtle.exportKey('jwk', publicKey);
const now = Math.floor(Date.now() / 1000);

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const u = String(url);
  const ok = (d) => new Response(JSON.stringify(d), { status: 200 });
  if (u.endsWith('/v1/checkout/sessions')) return ok({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  if (u.includes('/v1/checkout/sessions/cs_test_1')) return ok({ status: 'complete', payment_status: 'paid', customer: 'cus_1', metadata: { plan: 'pro' }, customer_details: { email: 'a@b.c' }, subscription: { id: 'sub_1', items: { data: [{ current_period_end: now + 30 * 86400, price: { unit_amount: 2900 } }] } } });
  if (u.includes('/v1/subscriptions/sub_1')) return ok({ id: 'sub_1', status: 'active', metadata: { plan: 'premium' }, current_period_end: now + 60 * 86400 });
  if (u.includes('/v1/orders') && init.method === 'POST') return ok({ id: 'order_1', amount: 239900, currency: 'INR' });
  if (u.includes('/v1/orders/order_1')) return ok({ id: 'order_1', notes: { plan: 'ultimate' } });
  if (u.includes('/v1/payments/pay_1')) return ok({ id: 'pay_1', order_id: 'order_1', status: 'captured', email: 'x@y.z' });
  if (u.includes('api.anthropic.com')) return ok({ content: [{ type: 'text', text: '{"summary":"S","bullets":["B1","B2"]}' }] });
  return new Response('{}', { status: 404 });
};

const call = async (method, path, body, headers = {}) => {
  const res = await worker.fetch(new Request(`https://w.example${path}`, { method, headers: { origin: 'https://gourav8jain.github.io', 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: await res.json(), cors: res.headers.get('access-control-allow-origin') };
};

async function clientVerify(token) {
  const [h, b, s] = token.split('.');
  const key = await crypto.subtle.importKey('jwk', pubJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(`${h}.${b}`));
}

test('stripe checkout → verify → refresh → portal-guard', async () => {
  const base = 'https://gourav8jain.github.io/cv-ats-checker-fixer/';
  const c = await call('POST', '/checkout', { plan: 'pro', provider: 'stripe', successUrl: `${base}?session_id={CHECKOUT_SESSION_ID}#/success`, cancelUrl: `${base}#/pricing` });
  assert.equal(c.status, 200); assert.match(c.data.url, /checkout\.stripe\.com/);
  assert.equal(c.cors, 'https://gourav8jain.github.io');
  const sent = new URLSearchParams(calls.at(-1).init.body);
  assert.equal(sent.get('line_items[0][price_data][unit_amount]'), '2900');
  assert.equal(sent.get('mode'), 'subscription');

  const bad = await call('POST', '/checkout', { plan: 'pro', provider: 'stripe', successUrl: 'https://evil.com/x', cancelUrl: `${base}` });
  assert.equal(bad.status, 400);

  const v = await call('GET', '/verify/stripe?session_id=cs_test_1');
  assert.equal(v.status, 200);
  assert.ok(await clientVerify(v.data.token), 'client can verify signature');
  const lic = await readToken(env, v.data.token);
  assert.equal(lic.plan, 'pro'); assert.equal(lic.sub, 'cus_1');

  const r = await call('POST', '/refresh', { token: v.data.token });
  assert.equal((await readToken(env, r.data.token)).plan, 'premium');

  const tampered = v.data.token.replace(/\.[^.]+\./, '.' + btoa(JSON.stringify({ plan: 'ultimate', exp: now + 9e6 })).replace(/=+$/, '') + '.');
  assert.equal((await call('POST', '/refresh', { token: tampered })).status, 401);
});

test('razorpay order → verify signature', async () => {
  const o = await call('POST', '/checkout', { plan: 'pro', provider: 'razorpay' });
  assert.equal(o.data.orderId, 'order_1');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('rzpsecret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('order_1|pay_1')))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const v = await call('POST', '/verify/razorpay', { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: sig });
  assert.equal(v.status, 200);
  assert.equal((await readToken(env, v.data.token)).plan, 'ultimate');
  const forged = await call('POST', '/verify/razorpay', { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'f'.repeat(64) });
  assert.equal(forged.status, 400);
});

test('ai is gated by plan', async () => {
  const v = await call('GET', '/verify/stripe?session_id=cs_test_1'); // pro plan — no AI
  const denied = await call('POST', '/ai', { task: 'resume', bullets: ['a', 'b'] }, { authorization: `Bearer ${v.data.token}` });
  assert.equal(denied.status, 403);
  const r = await call('POST', '/refresh', { token: v.data.token }); // premium
  const ok = await call('POST', '/ai', { task: 'resume', bullets: ['a', 'b'], summary: 's' }, { authorization: `Bearer ${r.data.token}` });
  assert.equal(ok.status, 200); assert.deepEqual(ok.data.bullets, ['B1', 'B2']);
  assert.equal((await call('POST', '/ai', { task: 'resume' })).status, 401);
});
