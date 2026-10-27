/**
 * Dedicated test bootstrap module to configure environment variables for local emulators.
 * MUST be imported before any Firebase modules are loaded.
 */
process.env.VITE_USE_FIREBASE_EMULATOR = 'true';
process.env.VITE_FIREBASE_PROJECT_ID = 'demo-car-parking-e2e';
process.env.VITE_FIREBASE_API_KEY = 'demo-api-key';
process.env.VITE_FIREBASE_AUTH_DOMAIN = 'localhost';
process.env.VITE_FIREBASE_STORAGE_BUCKET = 'demo-car-parking-e2e.appspot.com';
process.env.VITE_FIREBASE_APP_ID = 'demo-app-id';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-car-parking-e2e';
