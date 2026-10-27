import { HttpsError } from 'firebase-functions/v2/https';
import { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '../config/constants.js';
import { UserRole, UserStaffProfile } from '../types/index.js';

export async function verifyAuthAndResolveProfile(
  authContext: { uid?: string; token?: any } | undefined,
  db: Firestore
): Promise<UserStaffProfile> {
  if (!authContext || !authContext.uid) {
    throw new HttpsError(
      'unauthenticated',
      'Authentication is required to perform location management actions.'
    );
  }

  const uid = authContext.uid;

  // 1. Direct document lookup by Firebase Auth UID in /guards/{uid}
  const directRef = db.collection(COLLECTIONS.GUARDS).doc(uid);
  const directSnap = await directRef.get();

  let profileData: any = null;

  if (directSnap.exists) {
    profileData = directSnap.data();
  } else {
    // 2. Fallback query by 'uid' field
    const queryByUid = await db.collection(COLLECTIONS.GUARDS)
      .where('uid', '==', uid)
      .limit(1)
      .get();

    if (!queryByUid.empty) {
      profileData = queryByUid.docs[0].data();
    } else if (authContext.token?.email) {
      // 3. Fallback query by lowercase email
      const queryByEmail = await db.collection(COLLECTIONS.GUARDS)
        .where('email', '==', String(authContext.token.email).toLowerCase())
        .limit(1)
        .get();

      if (!queryByEmail.empty) {
        profileData = queryByEmail.docs[0].data();
      }
    }
  }

  if (!profileData) {
    throw new HttpsError(
      'permission-denied',
      'No authorized staff profile found in the guards registry for this account.'
    );
  }

  if (profileData.isActive === false) {
    throw new HttpsError(
      'permission-denied',
      'Your staff account is currently inactive. Contact your enterprise administrator.'
    );
  }

  const rawRole = String(profileData.role || '').trim().toLowerCase();
  let role: UserRole = 'guard';
  if (rawRole === 'owner') role = 'owner';
  else if (rawRole === 'manager') role = 'manager';
  else if (rawRole === 'admin') role = 'admin';
  else role = 'guard';

  let assignedLocationIds: string[] = [];
  if (Array.isArray(profileData.assignedLocationIds)) {
    assignedLocationIds = profileData.assignedLocationIds.filter((id: any) => typeof id === 'string' && id.trim().length > 0);
  } else if (typeof profileData.assignedLocationId === 'string' && profileData.assignedLocationId.trim().length > 0) {
    assignedLocationIds = [profileData.assignedLocationId.trim()];
  }

  return {
    uid,
    email: profileData.email || authContext.token?.email || '',
    name: profileData.name || 'Staff Member',
    role,
    isActive: true,
    ownerUid: profileData.ownerUid,
    assignedLocationIds,
  };
}
