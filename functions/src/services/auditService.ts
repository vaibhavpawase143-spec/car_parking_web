import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { COLLECTIONS } from '../config/constants.js';
import { AuditLogDoc, UserRole } from '../types/index.js';

export function appendAuditLogTransaction(
  transaction: Transaction,
  db: FirebaseFirestore.Firestore,
  entry: {
    actorUid: string;
    actorRole: UserRole;
    action: 'LOCATION_CREATED' | 'LOCATION_UPDATED' | 'LOCATION_DEACTIVATED';
    locationId: string;
    details: Record<string, any>;
  }
): void {
  const auditRef = db.collection(COLLECTIONS.AUDIT_LOGS).doc();

  // Sanitize details: strip any possible sensitive values
  const safeDetails = { ...entry.details };
  delete safeDetails.password;
  delete safeDetails.token;
  delete safeDetails.apiKey;

  const logDoc: AuditLogDoc = {
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
