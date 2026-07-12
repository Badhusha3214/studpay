export function surnameOf(name) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

export function domainOf(email) {
  return email.split('@')[1]?.toLowerCase();
}

// Children linked to a parent by shared email domain + matching surname
export async function getChildrenFor(db, parent) {
  const students = await db.prepare("SELECT * FROM students WHERE role = 'student' AND active = 1").all();
  return students.filter(
    (s) => domainOf(s.email) === domainOf(parent.email) && surnameOf(s.name) === surnameOf(parent.name)
  );
}

// Reverse lookup: the parent linked to a given student, if any
export async function getParentFor(db, student) {
  const parents = await db.prepare("SELECT * FROM students WHERE role = 'parent' AND active = 1").all();
  return parents.find(
    (p) => domainOf(p.email) === domainOf(student.email) && surnameOf(p.name) === surnameOf(student.name)
  ) || null;
}
