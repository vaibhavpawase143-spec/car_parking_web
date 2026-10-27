import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '../config/constants.js';
export function appendAuditLogTransaction(transaction, db, entry) {
    const auditRef = db.collection(COLLECTIONS.AUDIT_LOGS).doc();
    // Sanitize details: strip any possible sensitive values
    const safeDetails = { ...entry.details };
    delete safeDetails.password;
    delete safeDetails.token;
    delete safeDetails.apiKey;
    const logDoc = {
        id: auditRef.id,
        timestamp: FieldValue.serverTimestamp(),
        actorUid: entry.actorUid,
        actorRole: entry.actorRole,
        action: entry.action,
        entityType: 'LOCATION',
        entityId: entry.locationId,
        locationId: entry.locationId,
        details: safeDetails,
    };
    transaction.set(auditRef, logDoc);
}
//# sourceMappingURL=auditService.js.map