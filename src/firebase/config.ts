import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, Functions } from 'firebase/functions';
import {
  envConfig,
  isFirebaseConfigured,
  isEmulatorMode,
  validateEnvironmentConfiguration,
} from '../config/env';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;
let emulatorConnected = false;

const envValidation = validateEnvironmentConfiguration();

if (!envValidation.isValid) {
  console.error('[Firebase Safety Guard]', envValidation.error);
} else if (isFirebaseConfigured()) {
  try {
    app = getApps().length === 0 ? initializeApp(envConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, 'asia-south1');

    if (isEmulatorMode() && !emulatorConnected) {
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      emulatorConnected = true;
      console.info('[Firebase] Connected to local Firestore, Auth, and Functions Emulators on 127.0.0.1:8080 / 9099 / 5001 (Project: demo-car-parking-e2e)');
    }
  } catch (err) {
    console.warn('[Firebase] Initialization error with provided environment config:', err);
  }
} else {
  console.info('[Firebase] Environment variables not yet configured. Running in local preview mode.');
}

export { app, auth, db, storage, functions, isEmulatorMode, validateEnvironmentConfiguration };
export { isFirebaseConfigured };


