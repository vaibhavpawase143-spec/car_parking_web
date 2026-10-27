import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Fail-closed build guard: Prevent accidental production builds with emulator or demo configs
  if (command === 'build' && mode === 'production') {
    if (env.VITE_USE_FIREBASE_EMULATOR === 'true') {
      throw new Error(
        '[FAIL-CLOSED BUILD GUARD] Production build aborted: VITE_USE_FIREBASE_EMULATOR is enabled. ' +
        'Production builds cannot use the local emulator configuration.'
      );
    }
    if (env.VITE_FIREBASE_PROJECT_ID !== 'car-parking-system-2026') {
      throw new Error(
        `[FAIL-CLOSED BUILD GUARD] Production build aborted: Target project is '${env.VITE_FIREBASE_PROJECT_ID}', ` +
        `expected 'car-parking-system-2026'.`
      );
    }
    if (env.VITE_FIREBASE_API_KEY === 'demo-api-key' || env.VITE_FIREBASE_API_KEY?.startsWith('demo-')) {
      throw new Error(
        '[FAIL-CLOSED BUILD GUARD] Production build aborted: Demo API key detected in production build.'
      );
    }
    if (!env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_APP_ID) {
      throw new Error(
        '[FAIL-CLOSED BUILD GUARD] Production build aborted: Missing required Firebase credentials for production.'
      );
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 3000,
      host: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});

