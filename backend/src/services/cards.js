const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/schema');

// Links an NFC UID to a student, deactivating any previous active card for them.
// Returns { cardId, uid } on success, or { error } if the UID is already registered.
async function registerCard(uid, studentId) {
  const upperUid = uid.toUpperCase();

  const existing = await db.prepare('SELECT id FROM cards WHERE uid = ?').get(upperUid);
  if (existing) return { error: 'Card UID already registered' };

  await db.prepare('UPDATE cards SET active = 0 WHERE student_id = ?').run(studentId);

  const cardId = uuidv4();
  await db.prepare('INSERT INTO cards (id, uid, student_id, active) VALUES (?, ?, ?, 1)')
    .run(cardId, upperUid, studentId);

  return { cardId, uid: upperUid };
}

module.exports = { registerCard };
