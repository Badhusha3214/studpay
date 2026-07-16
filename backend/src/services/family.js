export function surnameOf(name) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

export function domainOf(email) {
  return email.split('@')[1]?.toLowerCase();
}

// Children linked to a parent by shared email domain + matching surname.
// Uses a SQL query with indexed surname column for efficient lookup
// instead of fetching all students into memory.
export async function getChildrenFor(db, parent) {
  const surname = surnameOf(parent.name);
  const domain = domainOf(parent.email);
  return db
    .prepare(
      `
    SELECT * FROM students
    WHERE role = 'student' AND active = 1
      AND surname = ? AND lower(split_part(email, '@', 2)) = ?
  `
    )
    .all(surname, domain);
}

// Reverse lookup: the parent linked to a given student, if any.
export async function getParentFor(db, student) {
  const surname = surnameOf(student.name);
  const domain = domainOf(student.email);
  return (
    db
      .prepare(
        `
    SELECT * FROM students
    WHERE role = 'parent' AND active = 1
      AND surname = ? AND lower(split_part(email, '@', 2)) = ?
    LIMIT 1
  `
      )
      .get(surname, domain) || null
  );
}
