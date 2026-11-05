# ResumeRx — ATS Resume Checker & Fixer

Mobile-first web app + Android + iOS app that scores a resume against Applicant Tracking System rules for free, and sells monthly fix plans from **$9 to $99**.

- **Web:** GitHub Pages — `https://gourav8jain.github.io/cv-ats-checker-fixer/`
- **Android / iOS:** the same code wrapped with Capacitor 7 (`/android`, `/ios`)
- **Payments:** Stripe (cards, Apple Pay, Google Pay; monthly subscriptions) and/or Razorpay (UPI and Indian cards; 30-day passes), verified by a small stateless Cloudflare Worker (`/worker`)
- **Privacy:** resumes are parsed and scored on the device. Nothing is uploaded except bullets the user explicitly sends for an AI rewrite.

## What's inside

| Area | Files |
|---|---|
| Parsing (PDF via pdf.js, DOCX via mammoth, TXT/paste) | `src/engine/parser.js` |
| Structure detection (name, contact, sections, roles, dates) | `src/engine/structure.js` |
| ATS scoring: 7 categories, 30+ checks, JD keyword match | `src/engine/analyzer.js`, `src/engine/keywords.js` |
| Fixes: headings, dates, contact, weak verbs, passive voice, tense, clichés, pronouns, verb repetition, metric gaps, keyword tailoring, summary, cover letter, LinkedIn | `src/engine/fixer.js` |
| ATS-safe export (DOCX, PDF, TXT) | `src/engine/exporter.js` |
| Plans & features (shared by app and worker) | `shared/plans.js` |
| License verification (ES256, works offline) | `src/lib/license.js` |
| Checkout (Stripe redirect / Razorpay modal) | `src/lib/payments.js` |
| Payments + AI API | `worker/src/index.js` |
| UI (hash router, all screens) | `src/main.js`, `src/styles.css` |

### Plans

| Plan | Price | Unlocks |
|---|---|---|
| Free | $0 | Unlimited ATS checks, full report, keyword match, blurred preview of fixes |
| Starter Fix | $9/mo | ATS-safe DOCX/PDF/TXT export, standard headings & order, contact & date cleanup |
| Pro Fix | $29/mo | + bullet rewrites (weak verbs, passive voice), clichés, pronouns, tense, verb variety, metric gaps |
| Premium Tailor | $59/mo | + job keyword tailoring, summary generator, AI rewrites |
| Career Ultimate | $99/mo | + cover letter generator, LinkedIn headline & About, unlimited tailored versions |

Edit prices or features in `shared/plans.js`. The app and the worker both read that file, so the price on screen always matches the charge. INR prices (`inr`) are used for Razorpay.

## How payment works

1. User taps a plan → app calls the worker `/checkout`.
2. **Stripe:** the worker creates a Checkout Session (monthly subscription) → user pays on Stripe → Stripe redirects to `…/?session_id=…#/success` → the app calls `/verify/stripe` → the worker confirms the session with Stripe and returns a **license token** (ES256-signed JWT with plan + expiry).
   **Razorpay:** the worker creates an order → Razorpay Checkout opens in the page → the worker verifies the HMAC signature and the captured payment → returns a license token valid for 30 days.
3. The app verifies the token signature locally with the public key and unlocks features. It works offline and needs no database.
4. Near expiry, the app calls `/refresh`; the worker checks the live Stripe subscription and issues a new token. Cancelled subscriptions stop renewing at period end.
5. Users can copy their license key from **Account** to unlock other devices or the mobile app. **Manage billing** opens the Stripe Customer Portal.

Without a worker configured (`VITE_API_BASE` empty) the site runs in **demo mode**: checkout is simulated and no card is charged. This lets you test the full flow end to end before connecting payments.

> AI rewrites are always enforced server-side (the worker checks the plan before calling Claude). The rule-based fixes run on the device, so a determined user could bypass the client-side lock. That is the normal trade-off for a serverless, private-by-design app.

## Setup

### 1. Run locally

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # engine + worker tests
```

### 2. Deploy the web app (GitHub Pages)

Push to `main`. `.github/workflows/deploy-web.yml` runs the tests, builds, and publishes `dist/` to the `gh-pages` branch.
On the first run, open **Settings → Pages** and set **Source: Deploy from a branch → `gh-pages` / root** if it isn't selected automatically.

### 3. Turn on real payments (about 15 minutes)

```bash
cd worker
npm install
npm run keys                                  # prints PRIVATE and PUBLIC keys
npx wrangler login
npx wrangler secret put SIGNING_KEY_JWK       # paste PRIVATE
npx wrangler secret put STRIPE_SECRET_KEY     # sk_test_… first, then sk_live_…
npx wrangler secret put RAZORPAY_KEY_ID       # optional, for UPI / India
npx wrangler secret put RAZORPAY_KEY_SECRET   # optional
npx wrangler secret put ANTHROPIC_API_KEY     # optional, enables AI rewrites
npm run deploy                                # prints https://resumerx-payments.<you>.workers.dev
```

Then in GitHub → **Settings → Secrets and variables → Actions → Variables**, add:

| Variable | Value |
|---|---|
| `VITE_API_BASE` | the worker URL |
| `VITE_PUBLIC_KEY_JWK` | the PUBLIC key JSON (one line) |
| `VITE_PAYMENT_PROVIDER` | `stripe`, `razorpay` or `both` |
| `VITE_SUPPORT_EMAIL` | your support address |

Re-run the **Deploy web** workflow. Demo mode switches off automatically.

In Stripe, also open **Settings → Billing → Customer portal** and save it once so **Manage billing** works.
If your repo or domain changes, update `ALLOWED_ORIGINS` in `worker/wrangler.toml`.

### 4. Android app

```bash
npm run android          # builds web, syncs, opens Android Studio
```

Or run the **Build Android app** workflow in GitHub Actions to get a debug APK (and a signed `.aab` for the Play Store once you add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` secrets).

### 5. iOS app (needs a Mac with Xcode 15+)

```bash
npm run ios              # builds web, syncs, opens Xcode (Swift Package Manager, no CocoaPods)
```

In Xcode select your team under **Signing & Capabilities**, then **Product → Archive** to upload to App Store Connect.

### App store payment rules (read before submitting)

Both stores generally require their own in-app purchase system for digital features unlocked inside an app.

- **iOS:** Apple has allowed external purchase links for US storefront apps since the 2025 court ruling. Outside the US it still requires In-App Purchase, or the external-purchase entitlement where a region offers one. If App Review rejects the build, add IAP via RevenueCat or `@capacitor-community/in-app-purchases` and map products to the same plan IDs.
- **Android:** Google Play requires Play Billing for digital goods, with user-choice billing in some regions, India included. For a Play Store release, add Play Billing for the same plan IDs, or distribute the APK directly.
- The license-key flow already lets users who bought on the web unlock the app ("reader"-style).

The checkout opens in the system browser and returns to the app through the `resumerx://unlock?token=…` deep link. That link is registered in `AndroidManifest.xml` and `Info.plist`.

## Project layout

```
index.html, src/          web app (Vite, vanilla JS, no framework)
shared/plans.js           plans & features (single source of truth)
worker/                   Cloudflare Worker: checkout, verification, refresh, portal, AI
android/, ios/            Capacitor native projects
test/                     engine tests (node --test)
.github/workflows/        Pages deploy, Android build
```
