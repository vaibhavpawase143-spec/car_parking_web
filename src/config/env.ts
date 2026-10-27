export interface FirebaseEnvConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface EnvironmentValidationResult {
  isValid: boolean;
  error: string | null;
}

const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env)
  ? import.meta.env
  : ((typeof process !== 'undefined' && process.env ? process.env : {}) as Record<string, string | undefined>);

const isProd = metaEnv.PROD === true || metaEnv.MODE === 'production';

export const isEmulatorMode = (): boolean => {
  // Production builds strictly forbid emulator mode
  if (isProd) {
    return false;
  }
  return metaEnv.VITE_USE_FIREBASE_EMULATOR === 'true';
};

export const envConfig: FirebaseEnvConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || (isEmulatorMode() ? 'demo-api-key' : ''),
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || (isEmulatorMode() ? 'localhost' : 'car-parking-system-2026.firebaseapp.com'),
  projectId: isEmulatorMode() ? (metaEnv.VITE_FIREBASE_PROJECT_ID || 'demo-car-parking-e2e') : (metaEnv.VITE_FIREBASE_PROJECT_ID || 'car-parking-system-2026'),
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || 'car-parking-system-2026.firebasestorage.app',
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: metaEnv.VITE_FIREBASE_APP_ID || (isEmulatorMode() ? 'demo-app-id' : ''),
};

/**
 * Fail-closed validation for environment configuration.
 * Detects contradictory, invalid, or dangerous settings without exposing secrets.
 */
export function validateEnvironmentConfiguration(): EnvironmentValidationResult {
  // 1. Production Mode Contradiction Checks
  if (isProd) {
    if (metaEnv.VITE_USE_FIREBASE_EMULATOR === 'true') {
      return {
        isValid: false,
        error: '[Configuration Error] Emulator mode is strictly prohibited in production builds.',
      };
    }
    if (envConfig.projectId.startsWith('demo-')) {
      return {
        isValid: false,
        error: '[Configuration Error] Demo project IDs are strictly prohibited in production builds.',
      };
    }
    if (envConfig.apiKey === 'demo-api-key' || envConfig.apiKey.startsWith('demo-')) {
      return {
        isValid: false,
        error: '[Configuration Error] Demo API keys are strictly prohibited in production builds.',
      };
    }
    if (envConfig.projectId !== 'car-parking-system-2026') {
      return {
        isValid: false,
        error: `[Configuration Error] Invalid production project ID '${envConfig.projectId}'. Expected 'car-parking-system-2026'.`,
      };
    }
  }

  // 2. Emulator Mode Contradiction Checks
  if (isEmulatorMode()) {
    if (envConfig.projectId === 'car-parking-system-2026') {
      return {
        isValid: false,
        error: '[Configuration Error] Contradictory settings: cannot run emulator mode against production project ID. Use a demo- project.',
      };
    }
  }

  // 3. Completeness Checks for Production
  if (!isEmulatorMode()) {
    if (!envConfig.apiKey || !envConfig.projectId || !envConfig.appId) {
      return {
        isValid: false,
        error: '[Configuration Error] Incomplete Firebase configuration for production environment.',
      };
    }
  }

  return { isValid: true, error: null };
}

export const isFirebaseConfigured = (): boolean => {
  const validation = validateEnvironmentConfiguration();
  if (!validation.isValid) {
    return false;
  }
  if (isEmulatorMode()) return true;
  return Boolean(
    envConfig.apiKey &&
    envConfig.projectId &&
    envConfig.appId
  );
};


