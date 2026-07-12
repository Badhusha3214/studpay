export const APPROVAL_GRADE_THRESHOLD = 5;
export const APPROVAL_TIMEOUT_MS = 60 * 1000;

// Extracts the leading grade number from a class string like "5-A" -> 5,
// "10-B" -> 10. Returns null (fails safe — no approval hold triggered) if
// the class doesn't start with a number, e.g. "Staff" or "Parent".
export function gradeOf(cls) {
  const match = String(cls || '').match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

// A junk-food purchase by a student in grade 5 or below requires parent
// approval (held for a timeout window, auto-approved unless rejected).
export function needsJunkApproval(cls, categories) {
  const grade = gradeOf(cls);
  if (grade === null || grade > APPROVAL_GRADE_THRESHOLD) return false;
  return categories.includes('junk');
}
