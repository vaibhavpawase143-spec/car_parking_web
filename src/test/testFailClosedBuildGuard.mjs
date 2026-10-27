import { execSync } from 'child_process';
import path from 'path';

console.log('======================================================================');
console.log('PHASE 4K: FAIL-CLOSED CONFIGURATION & BUILD GUARD AUDIT');
console.log('======================================================================');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${testName}`);
  }
}

// Test 1: Contradictory build test - VITE_USE_FIREBASE_EMULATOR=true in production mode
console.log('\n--- Scenario 1: Production build with VITE_USE_FIREBASE_EMULATOR=true ---');
try {
  execSync('npx vite build --mode production', {
    env: { ...process.env, VITE_USE_FIREBASE_EMULATOR: 'true' },
    stdio: 'pipe',
  });
  assert(false, 'Build should have failed closed when VITE_USE_FIREBASE_EMULATOR=true');
} catch (err) {
  const output = err.stderr ? err.stderr.toString() : err.message;
  assert(
    output.includes('[FAIL-CLOSED BUILD GUARD]') && output.includes('VITE_USE_FIREBASE_EMULATOR is enabled'),
    'Build cleanly aborted with [FAIL-CLOSED BUILD GUARD] when VITE_USE_FIREBASE_EMULATOR=true'
  );
}

// Test 2: Contradictory build test - Demo project ID in production mode
console.log('\n--- Scenario 2: Production build with Demo project ID ---');
try {
  execSync('npx vite build --mode production', {
    env: {
      ...process.env,
      VITE_USE_FIREBASE_EMULATOR: 'false',
      VITE_FIREBASE_PROJECT_ID: 'demo-unauthorized-target',
    },
    stdio: 'pipe',
  });
  assert(false, 'Build should have failed closed with demo project ID');
} catch (err) {
  const output = err.stderr ? err.stderr.toString() : err.message;
  assert(
    output.includes('[FAIL-CLOSED BUILD GUARD]') && output.includes('expected \'car-parking-system-2026\''),
    'Build cleanly aborted with [FAIL-CLOSED BUILD GUARD] when target project was not car-parking-system-2026'
  );
}

// Test 3: Contradictory build test - Demo API key in production mode
console.log('\n--- Scenario 3: Production build with Demo API key ---');
try {
  execSync('npx vite build --mode production', {
    env: {
      ...process.env,
      VITE_USE_FIREBASE_EMULATOR: 'false',
      VITE_FIREBASE_PROJECT_ID: 'car-parking-system-2026',
      VITE_FIREBASE_API_KEY: 'demo-api-key',
    },
    stdio: 'pipe',
  });
  assert(false, 'Build should have failed closed with demo API key');
} catch (err) {
  const output = err.stderr ? err.stderr.toString() : err.message;
  assert(
    output.includes('[FAIL-CLOSED BUILD GUARD]') && output.includes('Demo API key detected'),
    'Build cleanly aborted with [FAIL-CLOSED BUILD GUARD] when demo API key was supplied'
  );
}

// Test 4: Legitimate production build succeeds
console.log('\n--- Scenario 4: Clean Production Build with .env.production ---');
try {
  const buildOut = execSync('npx vite build --mode production', {
    env: { ...process.env },
    stdio: 'pipe',
  }).toString();
  assert(
    buildOut.includes('built in') || buildOut.includes('dist/assets'),
    'Clean production build with canonical .env.production succeeded'
  );
} catch (err) {
  assert(false, `Clean production build failed: ${err.message}`);
}

console.log('\n----------------------------------------------------------------------');
console.log(`Fail-Closed Guard Summary: ${passed}/${passed + failed} Passed`);
console.log('======================================================================\n');

if (failed > 0) {
  process.exit(1);
}
