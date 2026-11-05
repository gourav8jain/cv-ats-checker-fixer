// Country-based pricing. Shared by the web app and the payments worker, so the price shown is the price charged.
// Prices are set per currency (rounded to local price points), not converted live.

export const DEFAULT_COUNTRY = 'IN';

// minor = number of decimal places Stripe/Razorpay expect for the currency
export const CURRENCIES = {
  INR: { symbol: '₹', minor: 2, prices: { starter: 749, pro: 2399, premium: 4899, ultimate: 8199 } },
  USD: { symbol: '$', minor: 2, prices: { starter: 9, pro: 29, premium: 59, ultimate: 99 } },
  EUR: { symbol: '€', minor: 2, prices: { starter: 9, pro: 27, premium: 55, ultimate: 92 } },
  GBP: { symbol: '£', minor: 2, prices: { starter: 8, pro: 24, premium: 49, ultimate: 82 } },
  AUD: { symbol: 'A$', minor: 2, prices: { starter: 14, pro: 45, premium: 89, ultimate: 149 } },
  CAD: { symbol: 'C$', minor: 2, prices: { starter: 12, pro: 39, premium: 79, ultimate: 135 } },
  NZD: { symbol: 'NZ$', minor: 2, prices: { starter: 15, pro: 49, premium: 99, ultimate: 165 } },
  SGD: { symbol: 'S$', minor: 2, prices: { starter: 12, pro: 39, premium: 79, ultimate: 132 } },
  AED: { symbol: 'AED ', minor: 2, prices: { starter: 33, pro: 107, premium: 217, ultimate: 365 } },
  SAR: { symbol: 'SAR ', minor: 2, prices: { starter: 34, pro: 109, premium: 221, ultimate: 371 } },
  CHF: { symbol: 'CHF ', minor: 2, prices: { starter: 8, pro: 26, premium: 52, ultimate: 88 } },
  JPY: { symbol: '¥', minor: 0, prices: { starter: 1400, pro: 4400, premium: 8900, ultimate: 14900 } },
  ZAR: { symbol: 'R', minor: 2, prices: { starter: 99, pro: 329, premium: 649, ultimate: 1099 } },
  BRL: { symbol: 'R$', minor: 2, prices: { starter: 29, pro: 89, premium: 179, ultimate: 299 } },
  MXN: { symbol: 'MX$', minor: 2, prices: { starter: 99, pro: 319, premium: 649, ultimate: 1099 } },
  MYR: { symbol: 'RM', minor: 2, prices: { starter: 25, pro: 79, premium: 159, ultimate: 269 } },
  PHP: { symbol: '₱', minor: 2, prices: { starter: 299, pro: 949, premium: 1899, ultimate: 3199 } },
};

export const COUNTRIES = [
  ['IN', 'India', 'INR'],
  ['US', 'United States', 'USD'],
  ['GB', 'United Kingdom', 'GBP'],
  ['AE', 'United Arab Emirates', 'AED'],
  ['SA', 'Saudi Arabia', 'SAR'],
  ['SG', 'Singapore', 'SGD'],
  ['AU', 'Australia', 'AUD'],
  ['NZ', 'New Zealand', 'NZD'],
  ['CA', 'Canada', 'CAD'],
  ['IE', 'Ireland', 'EUR'],
  ['DE', 'Germany', 'EUR'],
  ['FR', 'France', 'EUR'],
  ['NL', 'Netherlands', 'EUR'],
  ['ES', 'Spain', 'EUR'],
  ['IT', 'Italy', 'EUR'],
  ['BE', 'Belgium', 'EUR'],
  ['AT', 'Austria', 'EUR'],
  ['PT', 'Portugal', 'EUR'],
  ['FI', 'Finland', 'EUR'],
  ['CH', 'Switzerland', 'CHF'],
  ['JP', 'Japan', 'JPY'],
  ['MY', 'Malaysia', 'MYR'],
  ['PH', 'Philippines', 'PHP'],
  ['ZA', 'South Africa', 'ZAR'],
  ['BR', 'Brazil', 'BRL'],
  ['MX', 'Mexico', 'MXN'],
  ['QA', 'Qatar', 'USD'],
  ['KW', 'Kuwait', 'USD'],
  ['BH', 'Bahrain', 'USD'],
  ['OM', 'Oman', 'USD'],
  ['HK', 'Hong Kong', 'USD'],
  ['LK', 'Sri Lanka', 'USD'],
  ['BD', 'Bangladesh', 'USD'],
  ['NP', 'Nepal', 'USD'],
  ['NG', 'Nigeria', 'USD'],
  ['KE', 'Kenya', 'USD'],
  ['OTHER', 'Other country', 'USD'],
].map(([code, name, currency]) => ({ code, name, currency }));

export const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

export function currencyForCountry(code) {
  return (COUNTRY_BY_CODE[code] || COUNTRY_BY_CODE.OTHER).currency;
}

export function priceFor(planId, currency) {
  const c = CURRENCIES[currency];
  if (!c || c.prices[planId] === undefined) return null;
  return { amount: c.prices[planId], currency, minorUnits: Math.round(c.prices[planId] * 10 ** c.minor) };
}

export function formatPrice(amount, currency) {
  const c = CURRENCIES[currency];
  if (!c) return `${amount} ${currency}`;
  const locale = currency === 'INR' ? 'en-IN' : 'en';
  return c.symbol + amount.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: c.minor });
}

// Find the plan from a charged amount (used when a subscription's metadata is missing, e.g. after a portal plan change).
export function planFromAmount(minorUnits, currency) {
  const c = CURRENCIES[String(currency || '').toUpperCase()];
  if (!c) return null;
  const hit = Object.entries(c.prices).find(([, v]) => Math.round(v * 10 ** c.minor) === minorUnits);
  return hit ? hit[0] : null;
}
