// Coerces a request-supplied amount into a finite positive number, or
// returns null if it isn't one. Guards against the classic `!amount || amount
// <= 0` bug: with a string like "abc", `"abc" <= 0` is `false` (NaN <= 0 is
// false), so a non-numeric amount would sail through and corrupt balances
// with NaN. Also caps amounts at a sane ceiling to stop typo/overflow abuse.
const MAX_AMOUNT = 1_000_000;

function parseAmount(value, { max = MAX_AMOUNT } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max) return null;
  return n;
}

// Like parseAmount, but accepts 0 — for fields like an initial wallet
// balance where "no starting balance" is a valid, common input.
function parseBalance(value, { max = MAX_AMOUNT } = {}) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE   = /^\d{4,6}$/;

// Cap on POST /admin/students/bulk row count — generous for a school roster,
// small enough that one request can't tie up the event loop indefinitely.
const MAX_BULK_ROWS = 500;

module.exports = { parseAmount, parseBalance, MAX_AMOUNT, EMAIL_RE, PIN_RE, MAX_BULK_ROWS };
