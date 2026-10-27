import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { getAdminDb } from '../config/admin.js';
import { verifyAuthAndResolveProfile } from '../middleware/authGuard.js';
import { updateLocationTransaction } from '../services/locationService.js';

export const updateLocation = onCall(
  {
    region: 'asia-south1',
    cors: true,
  },
  async (request: CallableRequest<any>) => {
    const db = getAdminDb();
    const profile = await verifyAuthAndResolveProfile(request.auth, db);
    return await updateLocationTransaction(db, profile, request.data);
  }
);
