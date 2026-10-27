import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { DEFAULT_EMULATOR_PROJECT_ID, PRODUCTION_PROJECT_ID } from './constants.js';
let appInstance = null;
let firestoreInstance = null;
let authInstance = null;
export function verifyAdminEnvironment() {
    const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT_ID || DEFAULT_EMULATOR_PROJECT_ID;
    const isProdProject = projectId === PRODUCTION_PROJECT_ID;
    const fsEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    // Safety Gate: Reject production project ID in emulator environment
    if (isProdProject) {
        return {
            isEmulator: false,
            projectId,
            isSafe: false,
            error: `[CRITICAL SAFETY BLOCK] Production project '${PRODUCTION_PROJECT_ID}' detected in Phase 5E backend. All live operations are strictly prohibited.`,
        };
    }
    // Ensure emulator host is set in development
    if (!fsEmulatorHost) {
        process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    }
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    }
    return {
        isEmulator: true,
        projectId,
        isSafe: true,
    };
}
export function getAdminApp() {
    if (appInstance)
        return appInstance;
    const verification = verifyAdminEnvironment();
    if (!verification.isSafe) {
        throw new Error(verification.error);
    }
    if (getApps().length > 0) {
        appInstance = getApp();
    }
    else {
        appInstance = initializeApp({
            projectId: verification.projectId,
        });
    }
    return appInstance;
}
export function getAdminDb() {
    if (firestoreInstance)
        return firestoreInstance;
    const app = getAdminApp();
    firestoreInstance = getFirestore(app);
    // Ensure timestampsInSnapshots and settings are clean
    firestoreInstance.settings({ ignoreUndefinedProperties: true });
    return firestoreInstance;
}
export function getAdminAuth() {
    if (authInstance)
        return authInstance;
    const app = getAdminApp();
    authInstance = getAuth(app);
    return authInstance;
}
//# sourceMappingURL=admin.js.map