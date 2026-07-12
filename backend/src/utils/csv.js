// Escapes a single CSV field: wraps in quotes and doubles any embedded
// quotes whenever the value contains a delimiter, quote, or newline.
function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = { csvEscape };
