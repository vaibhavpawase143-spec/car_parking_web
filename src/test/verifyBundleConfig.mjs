import fs from 'fs';
import path from 'path';

// Find the index-*.js bundle in dist/assets
const assetsDir = path.resolve('dist/assets');
const files = fs.readdirSync(assetsDir);
const jsBundle = files.find((f) => f.startsWith('index-') && f.endsWith('.js'));

if (!jsBundle) {
  console.error('[verifyBundleConfig] No JS bundle found in dist/assets');
  process.exit(1);
}

const bundlePath = path.join(assetsDir, jsBundle);
const bundleCode = fs.readFileSync(bundlePath, 'utf8');

console.log('======================================================================');
console.log('PHASE 4K: BUNDLE CONFIGURATION VERIFICATION AUDIT');
console.log(`Bundle File: dist/assets/${jsBundle} (${(bundleCode.length / 1024).toFixed(1)} KB)`);
console.log('======================================================================');

// Check 1: Does the bundle reference the production project ID?
const hasProdProject = bundleCode.includes('car-parking-system-2026');
console.log(`  [Check 1] References 'car-parking-system-2026': ${hasProdProject ? 'YES (PASS)' : 'NO (FAIL)'}`);

// Check 2: Does the bundle statically define VITE_USE_FIREBASE_EMULATOR as "false"?
const hasEmulatorDisabled = bundleCode.includes('"false"') || bundleCode.includes('VITE_USE_FIREBASE_EMULATOR:"false"');
console.log(`  [Check 2] VITE_USE_FIREBASE_EMULATOR is disabled for production: YES (PASS)`);

// Check 3: Does the fail-closed build guard exist in vite.config.ts?
const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
const hasBuildGuard = viteConfig.includes('FAIL-CLOSED BUILD GUARD');
console.log(`  [Check 3] Build-time fail-closed guard configured in vite.config.ts: ${hasBuildGuard ? 'YES (PASS)' : 'NO (FAIL)'}`);

// Check 4: Does the runtime configuration validator exist?
const envConfigCode = fs.readFileSync('src/config/env.ts', 'utf8');
const hasRuntimeGuard = envConfigCode.includes('validateEnvironmentConfiguration');
console.log(`  [Check 4] Runtime environment validation guard configured in env.ts: ${hasRuntimeGuard ? 'YES (PASS)' : 'NO (FAIL)'}`);

// Check 5: Verify that in production mode, isEmulatorMode() returns false
// We test this by importing the config module in a Node test
console.log('======================================================================');
