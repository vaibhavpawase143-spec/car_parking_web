import { onCall } from 'firebase-functions/v2/https';
import { getAdminDb } from '../config/admin.js';
import { verifyAuthAndResolveProfile } from '../middleware/authGuard.js';
import { deactivateLocationTransaction } from '../services/locationService.js';
export const deactivateLocation = onCall({
    region: 'asia-south1',
    cors: true,
}, async (request) => {
    const db = getAdminDb();
    const profile = await verifyAuthAndResolveProfile(request.auth, db);
    return await deactivateLocationTransaction(db, profile, request.data);
});
//# sourceMappingURL=deactivateLocation.js.map