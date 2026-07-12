// Cloudflare's native Rate Limiting binding — counters are cached on the
// same machine the Worker runs on, so this adds no network round-trip.
// Its windows are fixed at 10s or 60s (see wrangler.toml), coarser than the
// old express-rate-limit 15-minute windows — a deliberate, accepted
// trade-off for moving off a long-lived process. The per-account PIN
// lockout in services/pinAuth.js (DB-backed) remains the real brute-force
// defense; this is IP-level defense in depth, same as before.
//
// `bindingName` selects which [[ratelimits]] binding in wrangler.toml to
// use — a looser one globally, a tighter one reused on the PIN-guarded routes.
export function rateLimiter(bindingName) {
  return async function rateLimit(c, next) {
    const limiter = c.env[bindingName];
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const { success } = await limiter.limit({ key: `${bindingName}:${ip}` });

    if (!success) {
      return c.json({ error: 'Too many attempts. Try again later.' }, 429);
    }

    await next();
  };
}
