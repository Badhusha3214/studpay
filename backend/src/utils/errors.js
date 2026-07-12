// Thrown from inside a withTransaction() callback to abort the transaction
// (the throw triggers ROLLBACK) and produce a specific HTTP response at the
// route's catch block, instead of falling through to the generic 500 handler.
class HttpError extends Error {
  constructor(status, body) {
    const payload = typeof body === 'string' ? { error: body } : body;
    super(payload.error || 'Request failed');
    this.status = status;
    this.body = payload;
  }
}

module.exports = { HttpError };
