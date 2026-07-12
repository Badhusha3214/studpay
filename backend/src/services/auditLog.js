import { v4 as uuidv4 } from 'uuid';

// Records one accountability entry (refunds, admin edits to students/shops/
// cashiers). `dbHandle` is either the request's `db` or a withTransaction()
// handle, so a caller already inside a transaction can log atomically with
// the change it's describing. `before`/`after` are plain objects, stored as
// JSONB — pass null for either on a pure create/delete.
export async function logAction(dbHandle, { actorId, actorRole, action, entity, entityId, before = null, after = null }) {
  await dbHandle.prepare(`
    INSERT INTO audit_log (id, actor_id, actor_role, action, entity, entity_id, before, after)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(), actorId, actorRole, action, entity, entityId,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null
  );
}
