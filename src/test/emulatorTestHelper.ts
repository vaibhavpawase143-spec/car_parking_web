/**
 * Phase 4H.1: Firebase Emulator Test Client & Connection Guard
 *
 * Dedicated, test-only initialization path connecting exclusively to local emulators:
 * - Firestore Emulator: 127.0.0.1:8080
 * - Auth Emulator: http://127.0.0.1:9099
 *
 * Security & Isolation Guarantees:
 * - Uses dedicated project ID 'demo-car-parking-e2e' (Firebase SDK enforces offline-only demo mode)
 * - Explicitly verifies localhost emulator connectivity before allowing any write operation
 * - Fails closed if emulator cannot be reached; NEVER falls back to production Firebase
 * - Provides REST endpoints for pristine database clearing between test suites
 */

import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  Firestore,
} from 'firebase/firestore';

export const EMULATOR_PROJECT_ID = 'demo-car-parking-e2e';
export const FIRESTORE_EMULATOR_HOST = '127.0.0.1';
export const FIRESTORE_EMULATOR_PORT = 8080;
export const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

export interface EmulatorClientContext {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let activeApp: FirebaseApp | null = null;
let activeAuth: Auth | null = null;
let activeDb: Firestore | null = null;

/**
 * Health check probe to prove emulator processes are active on expected ports.
 * Fails closed if ports are unreachable.
 */
export async function verifyEmulatorPortsActive(): Promise<{ firestoreActive: boolean; authActive: boolean }> {
  let firestoreActive = false;
  let authActive = false;

  try {
    const fsRes = await fetch(`http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/`);
    if (fsRes.status === 200 || fsRes.status === 404) {
      firestoreActive = true;
    }
  } catch (_) {
    firestoreActive = false;
  }

  try {
    const authRes = await fetch(`${AUTH_EMULATOR_URL}/`);
    if (authRes.status === 200 || authRes.status === 404) {
      authActive = true;
    }
  } catch (_) {
    authActive = false;
  }

  return { firestoreActive, authActive };
}

/**
 * Initializes dedicated test Firebase client connected exclusively to emulators.
 */
export async function initializeTestEmulatorClient(): Promise<EmulatorClientContext> {
  const { firestoreActive, authActive } = await verifyEmulatorPortsActive();

  if (!firestoreActive || !authActive) {
    throw new Error(
      `[CRITICAL EMULATOR ISOLATION FAILURE] Emulator health check failed! ` +
      `Firestore Active: ${firestoreActive} (expected on ${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}), ` +
      `Auth Active: ${authActive} (expected on ${AUTH_EMULATOR_URL}). ` +
      `Aborting all tests. Writing to production Firebase is STRICTLY FORBIDDEN.`
    );
  }

  if (activeApp) {
    return { app: activeApp, auth: activeAuth!, db: activeDb! };
  }

  const appName = `emulator_test_runner_${Date.now()}`;
  activeApp = initializeApp(
    {
      apiKey: 'test-fake-api-key-for-emulator-only',
      authDomain: 'localhost',
      projectId: EMULATOR_PROJECT_ID,
      storageBucket: 'demo-car-parking-e2e.appspot.com',
    },
    appName
  );

  activeAuth = getAuth(activeApp);
  connectAuthEmulator(activeAuth, AUTH_EMULATOR_URL, { disableWarnings: true });

  activeDb = getFirestore(activeApp);
  connectFirestoreEmulator(activeDb, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);

  return { app: activeApp, auth: activeAuth, db: activeDb };
}

/**
 * Clears all Firestore collections and Auth accounts in the emulator.
 */
export async function clearEmulatorData(): Promise<void> {
  const projectIds = [EMULATOR_PROJECT_ID, 'car-parking-system-2026'];
  for (const pid of projectIds) {
    // Clear Firestore emulator data
    try {
      const clearFirestoreUrl = `http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/emulator/v1/projects/${pid}/databases/(default)/documents`;
      await fetch(clearFirestoreUrl, { method: 'DELETE' });
    } catch (err) {
      // Ignored
    }

    // Clear Auth emulator accounts
    try {
      const clearAuthUrl = `${AUTH_EMULATOR_URL}/emulator/v1/projects/${pid}/accounts`;
      await fetch(clearAuthUrl, { method: 'DELETE' });
    } catch (err) {
      // Ignored
    }
  }
}

/**
 * Sets custom user claims in the Auth Emulator via REST API.
 */
export async function setEmulatorCustomClaims(uid: string, claims: Record<string, any>): Promise<void> {
  const url = `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-key`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      localId: uid,
      customAttributes: JSON.stringify(claims),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[setEmulatorCustomClaims] Warning setting claims for ${uid}:`, errText);
  }
}

/**
 * Tear down test client cleanly.
 */
export async function teardownEmulatorClient(): Promise<void> {
  if (activeApp) {
    await deleteApp(activeApp);
    activeApp = null;
    activeAuth = null;
    activeDb = null;
  }
}

