import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { COLLECTIONS } from '../config/constants.js';
import {
  ParkingLocationDoc,
  UserStaffProfile,
} from '../types/index.js';
import {
  createLocationSchema,
  updateLocationSchema,
  deactivateLocationSchema,
} from '../validation/locationSchemas.js';
import {
  assertCanCreateLocation,
  assertCanUpdateLocation,
  assertCanDeactivateLocation,
} from '../middleware/roleGuard.js';
import { appendAuditLogTransaction } from './auditService.js';

export async function createLocationTransaction(
  db: Firestore,
  profile: UserStaffProfile,
  rawPayload: any
): Promise<{ success: true; locationId: string; code: string; message: string }> {
  // 1. Authorization check
  assertCanCreateLocation(profile);

  // 2. Schema validation
  const parseResult = createLocationSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new HttpsError('invalid-argument', `Validation failed: ${errorMsg}`);
  }
  const data = parseResult.data;

  const cleanCode = data.code.toUpperCase();
  const docId = `loc_${cleanCode.toLowerCase()}_01`;
  const codeIndexRef = db.collection(COLLECTIONS.LOCATION_CODES).doc(cleanCode);
  const locationDocRef = db.collection(COLLECTIONS.LOCATIONS).doc(docId);

  // 3. Atomic transaction: Code reservation + Location document + Audit log
  return await db.runTransaction(async (transaction) => {
    // A. Check code uniqueness
    const codeSnap = await transaction.get(codeIndexRef);
    if (codeSnap.exists) {
      throw new HttpsError(
        'already-exists',
        `Location code "${cleanCode}" is already in use by another facility. Codes must be globally unique.`
      );
    }

    // B. Check document ID collision
    const locSnap = await transaction.get(locationDocRef);
    if (locSnap.exists) {
      throw new HttpsError(
        'already-exists',
        `Location document ID "${docId}" already exists.`
      );
    }

    // C. Write code index reservation
    transaction.set(codeIndexRef, {
      code: cleanCode,
      locationId: docId,
      ownerUid: profile.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    // D. Construct and write canonical location document
    const now = FieldValue.serverTimestamp();
    const newDoc: ParkingLocationDoc = {
      id: docId,
      code: cleanCode,
      name: data.name,
      marathiName: data.marathiName,
      locationName: data.locationName,
      marathiLocationName: data.marathiLocationName,
      address: data.address,
      authorityLicenseText: data.authorityLicenseText || '',
      contactMobile: data.contactMobile,
      ownerUid: profile.uid, // Authoritatively assigned to caller UID
      managerUids: [],
      isActive: true,
      capacity: data.capacity,
      rates: data.rates,
      operatingHours: data.operatingHours,
      features: data.features,
      createdAt: now,
      updatedAt: now,
    };
    transaction.set(locationDocRef, newDoc);

    // E. Append atomic audit record
    appendAuditLogTransaction(transaction, db, {
      actorUid: profile.uid,
      actorRole: profile.role,
      action: 'LOCATION_CREATED',
      locationId: docId,
      details: {
        code: cleanCode,
        name: data.name,
        capacity: data.capacity,
      },
    });

    return {
      success: true,
      locationId: docId,
      code: cleanCode,
      message: `Facility "${data.name}" (${cleanCode}) successfully provisioned and indexed.`,
    };
  });
}

export async function updateLocationTransaction(
  db: Firestore,
  profile: UserStaffProfile,
  rawPayload: any
): Promise<{ success: true; locationId: string; message: string }> {
  // 1. Schema validation
  const parseResult = updateLocationSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new HttpsError('invalid-argument', `Validation failed: ${errorMsg}`);
  }
  const data = parseResult.data;

  // Immutability defense: forbid explicit changes to code or ownerUid
  if (rawPayload.code !== undefined || rawPayload.ownerUid !== undefined) {
    throw new HttpsError(
      'invalid-argument',
      'Location code and ownerUid are immutable once provisioned and cannot be modified.'
    );
  }

  const locationDocRef = db.collection(COLLECTIONS.LOCATIONS).doc(data.locationId);

  return await db.runTransaction(async (transaction) => {
    // 2. Fetch existing document
    const locSnap = await transaction.get(locationDocRef);
    if (!locSnap.exists) {
      throw new HttpsError('not-found', `Location "${data.locationId}" not found.`);
    }

    const existingLoc = locSnap.data() as ParkingLocationDoc;

    // 3. Authorization & role permissions check
    assertCanUpdateLocation(profile, existingLoc, {
      rates: data.rates,
      capacity: data.capacity,
    });

    // 4. Build safe updates
    const updates: Partial<ParkingLocationDoc> = {
      name: data.name,
      marathiName: data.marathiName,
      locationName: data.locationName,
      marathiLocationName: data.marathiLocationName,
      address: data.address,
      authorityLicenseText: data.authorityLicenseText ?? existingLoc.authorityLicenseText,
      contactMobile: data.contactMobile,
      operatingHours: data.operatingHours,
      features: data.features,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (data.capacity && profile.role === 'owner') {
      updates.capacity = data.capacity;
    }
    if (data.rates && profile.role === 'owner') {
      updates.rates = data.rates;
    }

    transaction.update(locationDocRef, updates);

    // 5. Append atomic audit record
    appendAuditLogTransaction(transaction, db, {
      actorUid: profile.uid,
      actorRole: profile.role,
      action: 'LOCATION_UPDATED',
      locationId: data.locationId,
      details: {
        updatedFields: Object.keys(updates).filter((k) => k !== 'updatedAt'),
      },
    });

    return {
      success: true,
      locationId: data.locationId,
      message: `Facility "${existingLoc.name}" (${existingLoc.code}) configuration updated.`,
    };
  });
}

export async function deactivateLocationTransaction(
  db: Firestore,
  profile: UserStaffProfile,
  rawPayload: any
): Promise<{ success: true; locationId: string; isActive: false; message: string }> {
  // 1. Schema validation
  const parseResult = deactivateLocationSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new HttpsError('invalid-argument', `Validation failed: ${errorMsg}`);
  }
  const data = parseResult.data;

  const locationDocRef = db.collection(COLLECTIONS.LOCATIONS).doc(data.locationId);

  return await db.runTransaction(async (transaction) => {
    // 2. Fetch existing document
    const locSnap = await transaction.get(locationDocRef);
    if (!locSnap.exists) {
      throw new HttpsError('not-found', `Location "${data.locationId}" not found.`);
    }

    const existingLoc = locSnap.data() as ParkingLocationDoc;

    // 3. Authorization check (Owner only)
    assertCanDeactivateLocation(profile, existingLoc);

    // 4. Soft deactivation (Hard deletion is prohibited)
    transaction.update(locationDocRef, {
      isActive: false,
      deactivationReason: data.reason,
      deactivatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 5. Append atomic audit record
    appendAuditLogTransaction(transaction, db, {
      actorUid: profile.uid,
      actorRole: profile.role,
      action: 'LOCATION_DEACTIVATED',
      locationId: data.locationId,
      details: {
        reason: data.reason,
        code: existingLoc.code,
      },
    });

    return {
      success: true,
      locationId: data.locationId,
      isActive: false,
      message: `Facility "${existingLoc.name}" (${existingLoc.code}) successfully deactivated. Operational entry slips halted.`,
    };
  });
}
