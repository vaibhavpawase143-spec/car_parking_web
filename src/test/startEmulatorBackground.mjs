import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

let javaHome = process.env.JAVA_HOME;
const jbr21 = 'C:\\Program Files\\JetBrains\\IntelliJ IDEA 2025.2.3\\jbr';
const jbr25 = 'C:\\Program Files\\Android\\Android Studio\\jbr';

if (fs.existsSync(jbr21)) {
  javaHome = jbr21;
} else if (fs.existsSync(jbr25)) {
  javaHome = jbr25;
}

process.env.JAVA_HOME = javaHome;
process.env.PATH = `${path.join(javaHome, 'bin')};${process.env.PATH || ''}`;

console.log('[startEmulator] Starting Firebase Emulators with session-scoped JDK:');
console.log('  JAVA_HOME:', process.env.JAVA_HOME);

const isWin = process.platform === 'win32';
const firebaseGlobal = 'C:\\Users\\Vaibhav\\AppData\\Roaming\\npm\\firebase.cmd';
const cmd = isWin && fs.existsSync(firebaseGlobal) ? firebaseGlobal : (isWin ? 'npx.cmd' : 'npx');
const args = isWin && fs.existsSync(firebaseGlobal)
  ? ['emulators:start', '--only=firestore,auth']
  : ['firebase', 'emulators:start', '--only=firestore,auth'];

const child = spawn(cmd, args, {
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

child.on('exit', (code) => {
  console.log(`[startEmulator] Exited with code ${code}`);
  process.exit(code || 0);
});

