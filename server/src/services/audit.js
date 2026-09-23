import { AuditLog } from '../models/index.js';

export async function audit({ actor, actorRole, action, entity, entityId, data }) {
  try {
    await AuditLog.create({ actor, actorRole, action, entity, entityId, data });
  } catch (err) {
    // Auditing must never break the primary action, but must be visible.
    console.error('[audit] failed to write', action, err.message);
  }
}
