import { onCall } from 'firebase-functions/v2/https';
import { getAdminDb } from '../config/admin.js';
import { verifyAuthAndResolveProfile } from '../middleware/authGuard.js';
import { createLocationTransaction } from '../services/locationService.js';
export const createLocation = onCall({
    region: 'asia-south1',
    cors: true,
}, async (request) => {
    const db = getAdminDb();
    const profile = await verifyAuthAndResolveProfile(request.auth, db);
    return await createLocationTransaction(db, profile, request.data);
});
//# sourceMappingURL=createLocation.js.map