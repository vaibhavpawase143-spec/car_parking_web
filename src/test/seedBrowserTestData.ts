/**
 * Seed script for Browser-based Manual UI Verification (Phase 4I)
 * Targets local emulator on 127.0.0.1:8080 (Firestore) & 127.0.0.1:9099 (Auth)
 * Enforces offline demo project: demo-car-parking-e2e
 */

import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-car-parking-e2e';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_URL = 'http://127.0.0.1:9099';

export async function seedBrowserTestData() {
  console.log('[seedBrowserTestData] Initializing emulator test data...');

  const app = initializeApp(
    {
      apiKey: 'demo-api-key',
      authDomain: 'localhost',
      projectId: PROJECT_ID,
      storageBucket: `${PROJECT_ID}.appspot.com`,
    },
    `browser_seeder_${Date.now()}`
  );

  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });

  const db = getFirestore(app);
  connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);

  // 1. Create Auth Users
  console.log('  -> Creating Auth Users...');
  const adminEmail = 'vaibhavpawase143@gmail.com';
  const guardEmail = 'guard_ramesh@bizflow.test';
  const inactiveEmail = 'guard_inactive@bizflow.test';
  const receiverEmail = 'guard_suresh@bizflow.test';
  const defaultPassword = 'Password@1234';

  async function getOrCreateUser(email: string, pass: string) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      return cred.user.uid;
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        return cred.user.uid;
      }
      throw err;
    }
  }

  const adminUid = await getOrCreateUser(adminEmail, defaultPassword);
  const guardUid = await getOrCreateUser(guardEmail, defaultPassword);
  const inactiveUid = await getOrCreateUser(inactiveEmail, defaultPassword);
  const receiverUid = await getOrCreateUser(receiverEmail, defaultPassword);

  // 2. Sign in as Admin so Security Rules authorize writes to settings, guards, shifts
  console.log('  -> Signing in as Admin for authorized seeding...');
  await signInWithEmailAndPassword(auth, adminEmail, defaultPassword);

  // 3. System Configuration
  console.log('  -> Seeding System Config...');
  await setDoc(doc(db, 'settings', 'system_config'), {
    carTotalCapacity: 50,
    twoWheelerTotalCapacity: 100,
    twoWheelerFirstHourRate: 20,
    twoWheelerAdditionalHourRate: 5,
    twoWheeler12HourCap: 60,
    twoWheeler24HourCap: 100,
    carFirstHourRate: 50,
    carAdditionalHourRate: 10,
    car12HourCap: 150,
    car24HourCap: 250,
    operatingHours: {
      openTime: '06:00',
      closeTime: '23:00',
    },
    updatedAt: Timestamp.now(),
  });

  // 4. Guards
  console.log('  -> Seeding Guard Profiles...');
  await setDoc(doc(db, 'guards', adminUid), {
    uid: adminUid,
    name: 'Vaibhav Admin',
    email: adminEmail,
    mobile: '9876543210',
    role: 'admin',
    isActive: true,
    createdAt: Timestamp.now(),
  });

  await setDoc(doc(db, 'guards', guardUid), {
    uid: guardUid,
    name: 'Ramesh Guard',
    email: guardEmail,
    mobile: '9876543211',
    role: 'guard',
    isActive: true,
    currentShift: 'Morning Shift',
    shiftStatus: 'active',
    createdAt: Timestamp.now(),
  });

  await setDoc(doc(db, 'guards', inactiveUid), {
    uid: inactiveUid,
    name: 'Inactive Staff',
    email: inactiveEmail,
    mobile: '9876543212',
    role: 'guard',
    isActive: false,
    createdAt: Timestamp.now(),
  });

  await setDoc(doc(db, 'guards', receiverUid), {
    uid: receiverUid,
    name: 'Suresh Guard',
    email: receiverEmail,
    mobile: '9876543213',
    role: 'guard',
    isActive: true,
    currentShift: 'Evening Shift',
    shiftStatus: 'active',
    createdAt: Timestamp.now(),
  });

  // 5. Shifts
  console.log('  -> Seeding Shift Models...');
  await setDoc(doc(db, 'shifts', 'shift-morning-01'), {
    id: 'shift-morning-01',
    name: 'Morning Shift',
    startTime: '08:00',
    endTime: '16:00',
    status: 'active',
    assignedGuards: [guardUid],
    createdAt: Timestamp.now(),
  });

  await setDoc(doc(db, 'shifts', 'shift-evening-02'), {
    id: 'shift-evening-02',
    name: 'Evening Shift',
    startTime: '16:00',
    endTime: '00:00',
    status: 'active',
    assignedGuards: [receiverUid],
    createdAt: Timestamp.now(),
  });

  await setDoc(doc(db, 'shifts', 'shift-night-03'), {
    id: 'shift-night-03',
    name: 'Night Shift',
    startTime: '00:00',
    endTime: '08:00',
    status: 'inactive',
    assignedGuards: [],
    createdAt: Timestamp.now(),
  });

  // 6. Monthly Passes
  console.log('  -> Seeding Monthly Passes...');
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  await setDoc(doc(db, 'monthly_passes', 'pass-01'), {
    passNumber: 'MP-2026-001',
    vehicleNumber: 'MH12AB1234',
    normalizedVehicleNumber: 'MH12AB1234',
    vehicleType: 'fourWheeler',
    customerName: 'Rahul Sharma',
    customerMobile: '9876543210',
    amount: 600,
    amountPaid: 600,
    outstandingAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'cash',
    status: 'ACTIVE',
    startDate: Timestamp.fromDate(now),
    endDate: Timestamp.fromDate(nextMonth),
    createdBy: 'Admin',
    createdAt: Timestamp.now(),
  });

  await setDoc(doc(db, 'monthly_passes', 'pass-02'), {
    passNumber: 'MP-2026-002',
    vehicleNumber: 'MH14CD5678',
    normalizedVehicleNumber: 'MH14CD5678',
    vehicleType: 'twoWheeler',
    customerName: 'Pooja Patil',
    customerMobile: '9876543211',
    amount: 300,
    amountPaid: 300,
    outstandingAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'upi',
    status: 'ACTIVE',
    startDate: Timestamp.fromDate(now),
    endDate: Timestamp.fromDate(nextMonth),
    createdBy: 'Admin',
    createdAt: Timestamp.now(),
  });

  await setDoc(doc(db, 'monthly_passes', 'pass-03'), {
    passNumber: 'MP-2026-003',
    vehicleNumber: 'MH01EF9999',
    normalizedVehicleNumber: 'MH01EF9999',
    vehicleType: 'fourWheeler',
    customerName: 'Amit Verma',
    customerMobile: '9876543212',
    amount: 600,
    amountPaid: 600,
    outstandingAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'cash',
    status: 'EXPIRED',
    startDate: Timestamp.fromDate(new Date(now.getTime() - 37 * 24 * 60 * 60 * 1000)),
    endDate: Timestamp.fromDate(lastWeek),
    createdBy: 'Admin',
    createdAt: Timestamp.now(),
  });

  // 7. Active Parking Records
  console.log('  -> Seeding Active Parking Records...');
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
  const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);

  await setDoc(doc(db, 'parking_records', 'rec-1001'), {
    ticketNumber: '1001',
    vehicleNumber: 'MH02XY5555',
    normalizedVehicleNumber: 'MH02XY5555',
    vehicleType: 'fourWheeler',
    status: 'ACTIVE',
    entryTime: Timestamp.fromDate(twoHoursAgo),
    advanceAmount: 50,
    advancePaymentMethod: 'cash',
    entryGuardId: guardUid,
    entryGuardName: 'Ramesh Guard',
    entryShift: 'Morning Shift',
    qrReference: '1001',
    createdAt: Timestamp.fromDate(twoHoursAgo),
  });

  await setDoc(doc(db, 'parking_records', 'rec-1002'), {
    ticketNumber: '1002',
    vehicleNumber: 'MH12AB1234',
    normalizedVehicleNumber: 'MH12AB1234',
    vehicleType: 'fourWheeler',
    status: 'ACTIVE',
    entryTime: Timestamp.fromDate(oneHourAgo),
    advanceAmount: 0,
    isMonthlyPass: true,
    monthlyPassId: 'pass-01',
    entryGuardId: guardUid,
    entryGuardName: 'Ramesh Guard',
    entryShift: 'Morning Shift',
    qrReference: '1002',
    createdAt: Timestamp.fromDate(oneHourAgo),
  });

  await setDoc(doc(db, 'parking_records', 'rec-1003'), {
    ticketNumber: '1003',
    vehicleNumber: 'MH04ZZ7777',
    normalizedVehicleNumber: 'MH04ZZ7777',
    vehicleType: 'twoWheeler',
    status: 'ACTIVE',
    entryTime: Timestamp.fromDate(thirtyMinsAgo),
    advanceAmount: 20,
    advancePaymentMethod: 'upi',
    entryGuardId: guardUid,
    entryGuardName: 'Ramesh Guard',
    entryShift: 'Morning Shift',
    qrReference: '1003',
    createdAt: Timestamp.fromDate(thirtyMinsAgo),
  });

  // 8. Exited Parking Records
  console.log('  -> Seeding Exited Record...');
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  await setDoc(doc(db, 'parking_records', 'rec-1000'), {
    ticketNumber: '1000',
    vehicleNumber: 'MH15AA1111',
    normalizedVehicleNumber: 'MH15AA1111',
    vehicleType: 'fourWheeler',
    status: 'EXITED',
    entryTime: Timestamp.fromDate(fourHoursAgo),
    exitTime: Timestamp.fromDate(oneHourAgo),
    advanceAmount: 50,
    advancePaymentMethod: 'cash',
    grossCharge: 70,
    balanceDue: 20,
    paymentMethod: 'cash',
    entryGuardId: guardUid,
    entryGuardName: 'Ramesh Guard',
    entryShift: 'Morning Shift',
    exitGuardId: guardUid,
    exitGuardName: 'Ramesh Guard',
    exitShift: 'Morning Shift',
    qrReference: '1000',
    createdAt: Timestamp.fromDate(fourHoursAgo),
  });

  // 9. Financial Payments & Ledger
  console.log('  -> Seeding Financial Payments...');
  await setDoc(doc(db, 'payment_transactions', 'pay-adv-1001'), {
    paymentId: 'pay-adv-1001',
    ticketNumber: '1001',
    amount: 50,
    paymentType: 'ADVANCE',
    paymentMethod: 'cash',
    guardUid: guardUid,
    guardName: 'Ramesh Guard',
    shift: 'Morning Shift',
    timestamp: Timestamp.fromDate(twoHoursAgo),
    createdAt: Timestamp.fromDate(twoHoursAgo),
  });

  await setDoc(doc(db, 'payment_transactions', 'pay-adv-1003'), {
    paymentId: 'pay-adv-1003',
    ticketNumber: '1003',
    amount: 20,
    paymentType: 'ADVANCE',
    paymentMethod: 'upi',
    guardUid: guardUid,
    guardName: 'Ramesh Guard',
    shift: 'Morning Shift',
    timestamp: Timestamp.fromDate(thirtyMinsAgo),
    createdAt: Timestamp.fromDate(thirtyMinsAgo),
  });

  await setDoc(doc(db, 'payment_transactions', 'pay-adv-1000'), {
    paymentId: 'pay-adv-1000',
    ticketNumber: '1000',
    amount: 50,
    paymentType: 'ADVANCE',
    paymentMethod: 'cash',
    guardUid: guardUid,
    guardName: 'Ramesh Guard',
    shift: 'Morning Shift',
    timestamp: Timestamp.fromDate(fourHoursAgo),
    createdAt: Timestamp.fromDate(fourHoursAgo),
  });

  await setDoc(doc(db, 'payment_transactions', 'pay-fin-1000'), {
    paymentId: 'pay-fin-1000',
    ticketNumber: '1000',
    amount: 20,
    paymentType: 'FINAL',
    paymentMethod: 'cash',
    guardUid: guardUid,
    guardName: 'Ramesh Guard',
    shift: 'Morning Shift',
    timestamp: Timestamp.fromDate(oneHourAgo),
    createdAt: Timestamp.fromDate(oneHourAgo),
  });

  // 10. Initial Responsibility Ledger Events
  console.log('  -> Seeding Guard Responsibility Events...');
  await setDoc(doc(db, 'responsibility_events', 'resp-001'), {
    id: 'resp-001',
    guardId: guardUid,
    guardName: 'Ramesh Guard',
    eventType: 'SHIFT_START',
    amount: 0,
    cashAmount: 0,
    upiAmount: 0,
    timestamp: Timestamp.fromDate(fourHoursAgo),
    notes: 'Morning shift commenced',
  });


  // Sign out cleanly
  await signOut(auth);
  await deleteApp(app);

  console.log('[seedBrowserTestData] Test data successfully seeded in local emulator!');
  console.log('  Test Credentials Available:');
  console.log('  - Admin:  vaibhavpawase143@gmail.com / Password@1234');
  console.log('  - Guard:  guard_ramesh@bizflow.test   / Password@1234');
  console.log('  - Inactive: guard_inactive@bizflow.test / Password@1234');
  console.log('  - Receiver: guard_suresh@bizflow.test   / Password@1234');
}

// Auto-run if executed directly via CLI
if (process.argv[1]?.endsWith('seedBrowserTestData.ts') || process.argv[1]?.endsWith('seedBrowserTestData.js')) {
  seedBrowserTestData()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding error:', err);
      process.exit(1);
    });
}
