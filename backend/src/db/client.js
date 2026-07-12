// Workers/Hono have no module-level singleton the way the old Express process
// did (env/secrets only exist inside a request's fetch(request, env, ctx)),
// so the db handle is built fresh per request from the Hyperdrive-proxied
// pool and threaded through Hono context instead of imported directly.
// createDbClient(pool) below produces the exact same
// db.prepare(sql).get/.all/.run(...) shape every route/service already uses.

// Compatibility shim so route files can keep using the same
// db.prepare(sql).get/.all/.run(...) shape they used with node:sqlite,
// instead of rewriting every call site into pool.query() + $n placeholders.
function makePrepare(queryable) {
  return function prepare(sql) {
    let n = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++n}`);
    return {
      get: async (...params) => (await queryable.query(pgSql, params)).rows[0],
      all: async (...params) => (await queryable.query(pgSql, params)).rows,
      run: async (...params) => { await queryable.query(pgSql, params); },
    };
  };
}

// Runs `fn` against a single checked-out client wrapped in BEGIN/COMMIT, so
// callers can SELECT ... FOR UPDATE to lock a row and then read-modify-write
// it atomically (e.g. debiting a wallet) without a lost-update/double-spend
// race between concurrent requests. `fn` receives a `db`-shaped object bound
// to the transaction's client — use it instead of the request's `db` for
// every query that must participate in the same transaction.
function makeWithTransaction(pool) {
  return async function withTransaction(fn) {
    const client = await pool.connect();
    const trxDb = { prepare: makePrepare(client) };

    try {
      await client.query('BEGIN');
      const result = await fn(trxDb);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };
}

// One of these is created per request (see middleware/db.js) from the
// Hyperdrive-proxied pool, and torn down via ctx.waitUntil(pool.end()) after
// the response is sent.
export function createDbClient(pool) {
  return {
    prepare: makePrepare(pool),
    withTransaction: makeWithTransaction(pool),
  };
}
