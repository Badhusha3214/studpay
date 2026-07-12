// Shared PIN brute-force lockout, backed by students.failed_pin_attempts /
// pin_locked_until. All three entry points that check a 4-6 digit PIN
// (login, change-pin, cashier pay-by-nfc) share this row, so a lockout
// triggered from one blocks the others too — a 4-digit PIN only has 10,000
// combinations, so unlimited attempts from any single entry point is enough
// to crack it without this.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function isLocked(student) {
  return !!student.pin_locked_until && new Date(student.pin_locked_until) > new Date();
}

function lockedResponse(student) {
  const retryAfterSeconds = Math.ceil((new Date(student.pin_locked_until) - new Date()) / 1000);
  return { status: 423, body: { error: 'Too many failed PIN attempts. Try again later.', retryAfterSeconds } };
}

// `db` may be the module-level db or a withTransaction-scoped trx — both
// expose the same prepare().get/all/run shape.
async function recordFailedAttempt(db, studentId) {
  const attempts = await db.prepare(
    'UPDATE students SET failed_pin_attempts = failed_pin_attempts + 1 WHERE id = ? RETURNING failed_pin_attempts'
  ).get(studentId);

  if (attempts.failed_pin_attempts >= MAX_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MS);
    await db.prepare(
      'UPDATE students SET failed_pin_attempts = 0, pin_locked_until = ? WHERE id = ?'
    ).run(lockedUntil.toISOString(), studentId);
  }
}

async function recordSuccess(db, studentId) {
  await db.prepare(
    'UPDATE students SET failed_pin_attempts = 0, pin_locked_until = NULL WHERE id = ?'
  ).run(studentId);
}

module.exports = { isLocked, lockedResponse, recordFailedAttempt, recordSuccess, MAX_ATTEMPTS, LOCKOUT_MS };
