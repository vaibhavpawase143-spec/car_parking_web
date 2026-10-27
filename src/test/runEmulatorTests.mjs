import { execSync } from 'child_process';
import fs from 'fs';

// Check if current JAVA_HOME is already JDK 21+ or locate the installed JBR 21
let javaHome = process.env.JAVA_HOME;
const jbr21 = 'C:\\Program Files\\JetBrains\\IntelliJ IDEA 2025.2.3\\jbr';
const jbr25 = 'C:\\Program Files\\Android\\Android Studio\\jbr';

if (fs.existsSync(jbr21)) {
  javaHome = jbr21;
} else if (fs.existsSync(jbr25)) {
  javaHome = jbr25;
}

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${javaHome}\\bin;${process.env.PATH || ''}`,
};

const isWin = process.platform === 'win32';
const firebaseCmd = isWin
  ? 'C:\\Users\\Vaibhav\\AppData\\Roaming\\npm\\firebase.cmd'
  : 'firebase';

console.log('[runEmulatorTests] Starting Firebase Emulators with session-scoped JDK:');
console.log(`  JAVA_HOME: ${javaHome}`);
console.log(`  Target:    Firestore (127.0.0.1:8080), Auth (127.0.0.1:9099)`);
console.log('----------------------------------------------------------------------\n');

try {
  const cmd = `"${firebaseCmd}" emulators:exec --only=firestore,auth "npx tsx src/test/emulatorIntegration.test.ts"`;
  execSync(cmd, { env, stdio: 'inherit' });
} catch (err) {
  process.exit(err.status || 1);
}
