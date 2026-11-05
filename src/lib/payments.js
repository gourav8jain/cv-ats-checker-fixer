import { CONFIG } from './config.js';
import { isNative, platform, openExternal } from './platform.js';
import { setLicense, getLicense } from './license.js';
import { PLAN_BY_ID } from '../../shared/plans.js';

async function api(path, body, token) {
  const res = await fetch(`${CONFIG.apiBase}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'));
    document.head.appendChild(s);
  });
}

export async function startCheckout(planId, provider = CONFIG.provider === 'both' ? 'stripe' : CONFIG.provider, email = '', currency = 'INR', country = 'IN') {
  const plan = PLAN_BY_ID[planId];
  if (!plan || plan.usd === 0) throw new Error('Unknown plan');
  if (CONFIG.demoMode) {
    location.hash = `#/checkout-demo?plan=${planId}&prov=${provider}`;
    return;
  }
  if (provider === 'razorpay') return razorpayCheckout(plan, email, currency, country);
  const native = isNative();
  const base = CONFIG.webUrl.replace(/\/?$/, '/');
  const { url } = await api('/checkout', {
    plan: planId,
    provider: 'stripe',
    currency,
    country,
    email: email || undefined,
    successUrl: `${base}?provider=stripe&session_id={CHECKOUT_SESSION_ID}${native ? '&native=1' : ''}#/success`,
    cancelUrl: `${base}#/pricing`,
    platform: platform(),
  });
  await openExternal(url);
}

async function razorpayCheckout(plan, email, currency, country) {
  const order = await api('/checkout', { plan: plan.id, provider: 'razorpay', currency, country, email: email || undefined, platform: platform() });
  await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: CONFIG.appName,
      description: `${plan.name} — 30 days`,
      prefill: email ? { email } : undefined,
      theme: { color: '#0E7A55' },
      handler: async (resp) => {
        try {
          const { token } = await api('/verify/razorpay', resp);
          resolve(await setLicense(token));
        } catch (e) { reject(e); }
      },
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
    });
    rzp.open();
  });
}

export async function completeStripe(sessionId) {
  const { token } = await api(`/verify/stripe?session_id=${encodeURIComponent(sessionId)}`);
  const lic = await setLicense(token);
  return { lic, token };
}

export async function refreshLicense() {
  const lic = await getLicense();
  if (!lic || lic.demo || CONFIG.demoMode) return lic;
  const { token } = await api('/refresh', { token: lic.token });
  return setLicense(token);
}

export async function openBillingPortal() {
  const lic = await getLicense();
  if (!lic) throw new Error('No active license');
  const { url } = await api('/portal', { token: lic.token, returnUrl: `${CONFIG.webUrl.replace(/\/?$/, '/')}#/account` });
  await openExternal(url);
}

export async function aiRewrite(task, payload) {
  const lic = await getLicense();
  if (CONFIG.demoMode || !lic) throw new Error('AI rewrites need the payments server to be configured.');
  return api('/ai', { task, ...payload }, lic.token);
}

export const aiAvailable = () => !CONFIG.demoMode;
