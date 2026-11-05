const env = import.meta.env || {};

function parseJson(s) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

export const CONFIG = {
  appName: 'ResumeRx',
  // Base URL of the payments worker (see /worker). Empty = demo mode.
  apiBase: (env.VITE_API_BASE || '').replace(/\/$/, ''),
  // Public half of the ES256 key the worker signs licenses with.
  publicKeyJwk: parseJson(env.VITE_PUBLIC_KEY_JWK),
  // 'stripe' (cards, Apple Pay, Google Pay worldwide), 'razorpay' (UPI/cards in India) or 'both'
  provider: env.VITE_PAYMENT_PROVIDER || 'stripe',
  webUrl: env.VITE_WEB_URL || 'https://gourav8jain.github.io/cv-ats-checker-fixer/',
  appScheme: 'resumerx',
  supportEmail: env.VITE_SUPPORT_EMAIL || 'support@example.com',
};
CONFIG.demoMode = !CONFIG.apiBase;
