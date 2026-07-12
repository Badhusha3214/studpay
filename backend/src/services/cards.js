import { v4 as uuidv4 } from 'uuid';

// Links an NFC UID to a student, deactivating any previous active card for them.
// Returns { cardId, uid } on success, or { error } if the UID is still actively registered
// to someone else. A UID freed up by a prior deactivation is reused (physical cards get
// reassigned to new students), not permanently blocked.
export async function registerCard(db, uid, studentId) {
  const upperUid = uid.toUpperCase();

  const existing = await db.prepare('SELECT id, active FROM cards WHERE uid = ?').get(upperUid);
  if (existing && existing.active) return { error: 'Card UID already registered' };

  await db.prepare('UPDATE cards SET active = 0 WHERE student_id = ?').run(studentId);

  let cardId;
  if (existing) {
    // Reassign the previously-deactivated row to the new student instead of
    // inserting a duplicate (uid has a UNIQUE constraint).
    cardId = existing.id;
    await db.prepare('UPDATE cards SET student_id = ?, active = 1, linked_at = NOW() WHERE id = ?')
      .run(studentId, cardId);
  } else {
    cardId = uuidv4();
    await db.prepare('INSERT INTO cards (id, uid, student_id, active) VALUES (?, ?, ?, 1)')
      .run(cardId, upperUid, studentId);
  }

  return { cardId, uid: upperUid };
}
