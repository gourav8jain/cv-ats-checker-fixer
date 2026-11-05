// Licenses are ES256-signed JWTs issued by the payments worker after a verified payment.
// The app verifies the signature locally with the public key, so it works offline too.
import { CONFIG } from './config.js';
import { PLAN_BY_ID } from '../../shared/plans.js';

const KEY = 'rrx_license';

const b64urlToBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const decodePart = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

let cached = null;

export async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  let payload;
  try { payload = decodePart(parts[1]); } catch { return null; }
  if (!PLAN_BY_ID[payload.plan]) return null;
  if (payload.demo) {
    if (!CONFIG.demoMode) return null;
  } else {
    if (!CONFIG.publicKeyJwk) return null;
    try {
      const key = await crypto.subtle.importKey('jwk', CONFIG.publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      if (!ok) return null;
    } catch { return null; }
  }
  return { ...payload, token, expired: payload.exp * 1000 < Date.now() };
}

export async function getLicense() {
  if (cached) return cached;
  let token = null;
  try { token = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  cached = await verifyToken(token);
  return cached;
}

export async function setLicense(token) {
  const lic = await verifyToken(token);
  if (!lic) throw new Error('That license key is not valid.');
  try { localStorage.setItem(KEY, token.trim()); } catch { /* ignore */ }
  cached = lic;
  return lic;
}

export function clearLicense() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  cached = null;
}

export async function activePlanId() {
  const lic = await getLicense();
  return lic && !lic.expired ? lic.plan : 'free';
}

export function makeDemoToken(plan) {
  const enc = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ plan, demo: true, iat: now, exp: now + 30 * 86400, sub: 'demo', prov: 'demo' })}.demo`;
}
