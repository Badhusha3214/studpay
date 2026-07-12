import { Pool } from 'pg';
import { createDbClient } from '../db/client.js';

// Creates a fresh pg Pool per request against Hyperdrive's proxied
// connection string and attaches the db.prepare/withTransaction client to
// Hono context. Workers can't hold a module-level singleton pool the way
// the old Express process did — env/secrets only exist inside this request's
// fetch(request, env, ctx) — so this middleware runs first on every route.
// `max: 5` keeps each request's local pool small; Hyperdrive does the real
// connection pooling upstream. The pool is closed after the response is sent
// via ctx.waitUntil so cleanup never delays the response itself.
export async function dbMiddleware(c, next) {
  const pool = new Pool({ connectionString: c.env.HYPERDRIVE.connectionString, max: 5 });
  c.set('db', createDbClient(pool));

  await next();

  c.executionCtx.waitUntil(pool.end());
}
