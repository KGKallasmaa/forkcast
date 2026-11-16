import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit, MemoryStore, ipKeyGenerator } from 'express-rate-limit';
import { timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import mealPlanRouter from './routes/mealPlan.js';
import { accessRouter, TRUSTED_COOKIE } from './routes/access.js';
import { usageTracker } from './services/usageTracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

// In production the frontend is served from the same origin, so CORS is only
// needed for local development where Vite runs on a different port.
// CORS_ORIGIN may be a bare hostname (Render's fromService `host`
// property); prepend https:// so the browser's Origin header matches.
const rawCorsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const corsOrigin = /^https?:\/\//.test(rawCorsOrigin) ? rawCorsOrigin : `https://${rawCorsOrigin}`;
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
// Passing a secret enables *signed* cookies (req.signedCookies) for the
// trusted-access cookie below.
app.use(cookieParser(process.env.COOKIE_SIGNING_SECRET));

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Visiting the app at either /<code> (e.g. https://yourapp.com/your-code) or
// with ?access=<code> silently grants a long-lived, signed "trusted" cookie
// and redirects to the clean root — no login form, just a link to share with
// family/friends. Nothing else about the request is affected if the code is
// missing or wrong; it just falls through as normal (still subject to the
// strict rate limit below). Always redirects to "/" specifically rather than
// stripping the path in place — for the /<code> form, redirecting back to
// the same path would just re-trigger this same check forever.
const TRUSTED_COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

app.use((req, res, next) => {
  const expected = process.env.FULL_ACCESS_CODE;
  if (!expected) return next();

  const queryCode = req.query.access;
  const pathSegment = req.path.slice(1); // strip leading "/"

  const matchedViaQuery = typeof queryCode === 'string' && timingSafeEqualStrings(queryCode, expected);
  const matchedViaPath =
    pathSegment.length > 0 && !pathSegment.includes('/') && timingSafeEqualStrings(pathSegment, expected);

  if (matchedViaQuery || matchedViaPath) {
    res.cookie(TRUSTED_COOKIE, '1', {
      signed: true,
      httpOnly: true,
      secure: !!process.env.APP_URL,
      sameSite: 'lax',
      maxAge: TRUSTED_COOKIE_MAX_AGE_MS,
    });
    return res.redirect('/');
  }
  next();
});

const isProd = process.env.NODE_ENV === 'production';

// Explicit keyGenerator (rather than relying on the library default) so the
// usage-peek route below can compute the exact same key and read the exact
// same store — one source of truth instead of two systems tracking the same
// thing separately.
function mealPlanRateLimitKey(req: express.Request): string {
  return ipKeyGenerator(req.ip ?? '');
}

function mealPlanLimit(req: express.Request): number {
  return req.signedCookies?.[TRUSTED_COOKIE] ? 10 : isProd ? 2 : 1000;
}

const mealPlanStore = new MemoryStore();
const apiLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: mealPlanLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'rate_limited' },
  store: mealPlanStore,
  keyGenerator: mealPlanRateLimitKey,
});

// Lets the frontend show "N of M requests used today" without spending one —
// a plain read of the same store/key the limiter itself uses, not a second
// tracking mechanism that could drift out of sync with it.
app.get('/api/meal-plan/usage', async (req, res) => {
  const key = mealPlanRateLimitKey(req);
  const info = await mealPlanStore.get(key);
  const limit = mealPlanLimit(req);
  const used = info?.totalHits ?? 0;
  res.json({
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: info?.resetTime ? info.resetTime.getTime() : null,
    // Gemini free-tier usage for today (Pacific date): per-model counts
    // against the 20/day per-model quota. Additive — the fields above are
    // unchanged.
    gemini: usageTracker.getToday(),
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── Image proxy ───────────────────────────────────────────────────────────────
// Lets the browser show recipe photos from sites that block hotlinking. It is
// locked down on purpose: an open proxy can be abused to reach internal
// addresses, or to serve someone else's HTML/SVG from our own origin.

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isPublicHttps(url: URL): boolean {
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  if (host.startsWith('[')) return false;   // IPv6 literal
  if (!host.includes('.')) return false;    // "localhost", "intranet", ...
  return !/^(.*\.(local|internal|localhost)$|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

// Follows redirects by hand so every hop is checked too (a public URL could
// otherwise redirect us to an internal one).
async function fetchPublicImage(start: URL): Promise<Response | null> {
  let url = start;
  for (let hop = 0; hop < 3; hop++) {
    if (!isPublicHttps(url)) return null;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; recipe-aggregator/1.0)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    if (r.status >= 300 && r.status < 400) {
      const location = r.headers.get('location');
      if (!location) return null;
      url = new URL(location, url);
      continue;
    }
    return r;
  }
  return null;
}

const imageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/api/image-proxy', imageLimiter, async (req, res) => {
  const raw = req.query.url;
  let target: URL;
  try {
    target = new URL(typeof raw === 'string' ? raw : '');
  } catch {
    res.status(400).end();
    return;
  }

  try {
    const r = await fetchPublicImage(target);
    if (!r) { res.status(400).end(); return; }
    if (!r.ok) { res.status(r.status).end(); return; }

    // Images only (and not SVG, which can carry scripts).
    const type = r.headers.get('content-type') ?? '';
    if (!type.startsWith('image/') || type.includes('svg')) { res.status(415).end(); return; }

    const body = Buffer.from(await r.arrayBuffer());
    if (body.length > MAX_IMAGE_BYTES) { res.status(413).end(); return; }

    res.set({
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    res.send(body);
  } catch {
    res.status(502).end();
  }
});

app.use('/api/meal-plan', apiLimiter, mealPlanRouter);
app.use('/api/access', accessRouter);

// Serve built frontend in production (backend/dist is two levels below frontend/dist)
const frontendDist = join(__dirname, '../../frontend/dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // Send index.html for client-side routes. Plain middleware instead of
  // app.get('*'), which throws at startup on Express 5.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`forkcast backend running on http://localhost:${PORT}`);
  console.log(`CORS origin: ${corsOrigin}`);
});