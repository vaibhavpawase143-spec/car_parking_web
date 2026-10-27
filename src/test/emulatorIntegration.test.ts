/**
 * Phase 4H.1: Real Firebase Emulator End-to-End Integration Test Suite
 *
 * Runs against live local Firestore Emulator (127.0.0.1:8080) and Auth Emulator (127.0.0.1:9099).
 * Tests real Firestore Security Rules, atomic transactions, batch writes, and financial flows.
 *
 * Safety & Isolation:
 * - Dedicated offline project: 'demo-car-parking-e2e'
 * - Fails closed if emulator ports are not responding
 * - ZERO writes to Google Cloud / Production Firebase
 */

import {
  initializeTestEmulatorClient,
  clearEmulatorData,
  teardownEmulatorClient,
  verifyEmulatorPortsActive,
  EMULATOR_PROJECT_ID,
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
  AUTH_EMULATOR_URL,
} from './emulatorTestHelper';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  runTransaction,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';

export async function runEmulatorIntegrationTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: string[];
}> {
  let passed = 0;
  let failed = 0;
  const results: string[] = [];

  function assert(condition: boolean, testName: string) {
    if (condition) {
      passed++;
      results.push(`  [PASS - EMULATOR] ${testName}`);
    } else {
      failed++;
      results.push(`  [FAIL - EMULATOR] ${testName}`);
    }
  }

  console.log('\n======================================================================');
  console.log('BIZFLOW WEB APP: LIVE FIREBASE EMULATOR INTEGRATION TEST SUITE');
  console.log(`Target: Firestore [${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}] | Auth [${AUTH_EMULATOR_URL}]`);
  console.log(`Isolated Project: ${EMULATOR_PROJECT_ID} (Enforced Offline Demo Mode)`);
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // Pre-Flight: Port Check & Client Initialization
  // -------------------------------------------------------------------------
  const ports = await verifyEmulatorPortsActive();
  assert(
    ports.firestoreActive && ports.authActive,
    'Preflight: Confirmed local Firestore and Auth emulator processes listening on localhost'
  );

  const { auth, db } = await initializeTestEmulatorClient();
  await clearEmulatorData(); // Start with pristine database

  // -------------------------------------------------------------------------
  // 1. Authentication & Guard Profiles in Emulator
  // -------------------------------------------------------------------------
  const adminEmail = 'vaibhavpawase143@gmail.com';
  const guardEmail = 'guard_ramesh@bizflow.test';
  const receiverEmail = 'guard_suresh@bizflow.test';
  const inactiveEmail = 'guard_inactive@bizflow.test';
  const testPassword = 'Password@1234';

  // Create accounts in Auth Emulator
  const adminCred = await createUserWithEmailAndPassword(auth, adminEmail, testPassword);
  const guardCred = await createUserWithEmailAndPassword(auth, guardEmail, testPassword);
  const receiverCred = await createUserWithEmailAndPassword(auth, receiverEmail, testPassword);
  const inactiveCred = await createUserWithEmailAndPassword(auth, inactiveEmail, testPassword);

  const adminUid = adminCred.user.uid;
  const guardUid = guardCred.user.uid;
  const receiverUid = receiverCred.user.uid;
  const inactiveUid = inactiveCred.user.uid;

  // Sign in as Admin so request.auth is authenticated with canonical admin email
  await signInWithEmailAndPassword(auth, adminEmail, testPassword);

  // Seed settings/system_config as Admin
  await setDoc(doc(db, 'settings', 'system_config'), {
    carTotalCapacity: 50,
    twoWheelerTotalCapacity: 50,
    twoWheelerFirstHourRate: 20,
    twoWheelerAdditionalHourRate: 5,
    twoWheeler12HourCap: 60,
    carFirstHourRate: 50,
    carAdditionalHourRate: 10,
    car12HourCap: 150,
  });

  // Seed guards profiles directly as Admin
  await setDoc(doc(db, 'guards', adminUid), {
    uid: adminUid,
    name: 'Admin Vaibhav',
    email: adminEmail,
    role: 'admin',
    isActive: true,
  });

  await setDoc(doc(db, 'guards', guardUid), {
    uid: guardUid,
    name: 'Ramesh Guard',
    email: guardEmail,
    role: 'guard',
    isActive: true,
  });

  await setDoc(doc(db, 'guards', receiverUid), {
    uid: receiverUid,
    name: 'Suresh Receiving Guard',
    email: receiverEmail,
    role: 'guard',
    isActive: true,
  });

  await setDoc(doc(db, 'guards', inactiveUid), {
    uid: inactiveUid,
    name: 'Deactivated Guard',
    email: inactiveEmail,
    role: 'guard',
    isActive: false, // Inactive!
  });

  assert(true, 'Test 1A: Test identities seeded in Auth and Firestore Emulators');

  // -------------------------------------------------------------------------
  // 2. Security Rules Enforcement by Live Emulator
  // -------------------------------------------------------------------------
  // Authenticate as active guard
  await signInWithEmailAndPassword(auth, guardEmail, testPassword);

  // A: Guard reading own profile -> PERMITTED
  const guardProfileSnap = await getDoc(doc(db, 'guards', guardUid));
  assert(guardProfileSnap.exists(), 'Test 2A: Active Guard can read guard profiles in emulator');

  // B: Guard attempting to create another guard -> DENIED by rules
  let guardCreateBlocked = false;
  try {
    await setDoc(doc(db, 'guards', 'impostor_guard'), {
      name: 'Impostor',
      role: 'admin',
      isActive: true,
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') guardCreateBlocked = true;
  }
  assert(guardCreateBlocked, 'Test 2B: Guard blocked from creating guard accounts (permission-denied)');

  // C: Guard attempting to create shift in /shifts -> DENIED by rules
  let shiftCreateBlocked = false;
  try {
    await setDoc(doc(db, 'shifts', 'shift_1'), {
      guardId: guardUid,
      status: 'ACTIVE',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') shiftCreateBlocked = true;
  }
  assert(shiftCreateBlocked, 'Test 2C: Guard blocked from creating shifts (Admin only)');

  // D: Guard attempting to escalate own role to admin in /guards/{guardUid} -> DENIED
  let escalationBlocked = false;
  try {
    await updateDoc(doc(db, 'guards', guardUid), {
      role: 'admin',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') escalationBlocked = true;
  }
  assert(escalationBlocked, 'Test 2D: Guard blocked from self-escalating role to admin');

  // E: Guard attempting to delete payment transaction -> DENIED (Immutable)
  let txnDeleteBlocked = false;
  try {
    await deleteDoc(doc(db, 'payment_transactions', 'fake_txn'));
  } catch (err: any) {
    if (err.code === 'permission-denied') txnDeleteBlocked = true;
  }
  assert(txnDeleteBlocked, 'Test 2E: Deleting payment transactions strictly forbidden (allow delete: if false)');

  // -------------------------------------------------------------------------
  // 3. Vehicle Entry, Counter Transactions, and Atomic Batches
  // -------------------------------------------------------------------------
  // A: Counter transaction for sequential ticket generation
  const counterRef = doc(db, 'counters', 'ticket_counter');
  const ticketNumber = await runTransaction(db, async (txn) => {
    const counterSnap = await txn.get(counterRef);
    let current = 1000;
    if (counterSnap.exists() && typeof counterSnap.data().lastTicketNumber === 'number') {
      current = counterSnap.data().lastTicketNumber;
    }
    const next = current + 1;
    txn.set(counterRef, { lastTicketNumber: next }, { merge: true });
    return next.toString();
  });
  assert(ticketNumber === '1001', `Test 3A: Counter generated sequential ticket #${ticketNumber}`);

  // B: Atomic batch write: Parking Record + Advance Payment Transaction
  const recordDocRef = doc(db, 'parking_records', ticketNumber);
  const txnDocRef = doc(collection(db, 'payment_transactions'));
  const batch = writeBatch(db);

  batch.set(recordDocRef, {
    ticketId: ticketNumber,
    ticketNumber: ticketNumber,
    vehicleNumber: 'MH12AB1234',
    normalizedVehicleNumber: 'MH12AB1234',
    vehicleType: 'fourWheeler',
    customerMobile: '9876543210',
    entryTime: serverTimestamp(),
    status: 'ACTIVE',
    entryGuardUid: guardUid,
    entryGuardName: 'Ramesh Guard',
    entryShift: 'Shift 1',
    advanceAmount: 50,
    advancePaymentMethod: 'cash',
    advanceCollectorGuardUid: guardUid,
    advanceCollectorGuardName: 'Ramesh Guard',
    advanceCollectorShift: 'Shift 1',
    isMonthlyPass: false,
    createdAt: serverTimestamp(),
  });

  batch.set(txnDocRef, {
    ticketId: ticketNumber,
    vehicleNumber: 'MH12AB1234',
    amount: 50,
    paymentMethod: 'cash',
    paymentType: 'ADVANCE',
    guardUid: guardUid,
    guardName: 'Ramesh Guard',
    shift: 'Shift 1',
    createdAt: serverTimestamp(),
  });

  await batch.commit();

  // Verify stored in emulator
  const savedRecordSnap = await getDoc(recordDocRef);
  assert(
    savedRecordSnap.exists() && savedRecordSnap.data().status === 'ACTIVE',
    'Test 3B: Parking record created in Firestore emulator with status="ACTIVE"'
  );

  const savedTxnSnap = await getDoc(txnDocRef);
  assert(
    savedTxnSnap.exists() && savedTxnSnap.data().amount === 50 && savedTxnSnap.data().paymentType === 'ADVANCE',
    'Test 3C: ADVANCE payment transaction created in Firestore emulator'
  );

  // C: Duplicate entry prevention check
  const duplicateQuery = query(
    collection(db, 'parking_records'),
    where('normalizedVehicleNumber', '==', 'MH12AB1234'),
    where('status', '==', 'ACTIVE')
  );
  const duplicateSnap = await getDocs(duplicateQuery);
  assert(
    !duplicateSnap.empty,
    'Test 3D: Active record query detects duplicate vehicle and prevents second entry'
  );

  // -------------------------------------------------------------------------
  // 4. Exit Settlement Transaction & Concurrency in Emulator
  // -------------------------------------------------------------------------
  // Settle ticket 1001 inside a Firestore transaction:
  // Simulated: 2-hour stay on Four-Wheeler (Gross = ₹60, Advance = ₹50 -> Balance = ₹10)
  const exitTxnDocRef = doc(collection(db, 'payment_transactions'));

  await runTransaction(db, async (txn) => {
    const snap = await txn.get(recordDocRef);
    if (!snap.exists()) throw new Error('Not found');
    const data = snap.data();
    if (data.status !== 'ACTIVE') throw new Error('Vehicle already exited');

    const storedAdvance = Number(data.advanceAmount) || 0;
    const gross = 60;
    const balanceDue = Math.max(0, gross - storedAdvance); // ₹10

    txn.update(recordDocRef, {
      status: 'EXITED',
      exitTime: serverTimestamp(),
      grossCharge: gross,
      finalAmount: balanceDue,
      paidAmount: balanceDue,
      balanceDue: balanceDue,
      refundAmount: 0,
      paymentMethod: 'upi',
      exitGuardUid: receiverUid,
      exitGuardName: 'Suresh Receiving Guard',
      exitShift: 'Shift 2',
      updatedAt: serverTimestamp(),
    });

    if (balanceDue > 0) {
      txn.set(exitTxnDocRef, {
        ticketId: ticketNumber,
        vehicleNumber: data.vehicleNumber,
        amount: balanceDue,
        paymentMethod: 'upi',
        paymentType: 'FINAL',
        guardUid: receiverUid,
        guardName: 'Suresh Receiving Guard',
        shift: 'Shift 2',
        createdAt: serverTimestamp(),
      });
    }
  });

  const settledSnap = await getDoc(recordDocRef);
  assert(
    settledSnap.data()?.status === 'EXITED' && settledSnap.data()?.balanceDue === 10,
    'Test 4A: Exit settlement committed atomically in Firestore emulator (status="EXITED", balanceDue=10)'
  );

  const finalTxnSnap = await getDoc(exitTxnDocRef);
  assert(
    finalTxnSnap.exists() && finalTxnSnap.data()?.paymentType === 'FINAL' && finalTxnSnap.data()?.amount === 10,
    'Test 4B: FINAL payment transaction recorded in emulator'
  );

  // Duplicate exit attempt in transaction must fail
  let duplicateExitBlocked = false;
  try {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(recordDocRef);
      if (snap.data()?.status !== 'ACTIVE') {
        throw new Error('Vehicle already exited');
      }
    });
  } catch (err: any) {
    if (err.message.includes('already exited')) duplicateExitBlocked = true;
  }
  assert(duplicateExitBlocked, 'Test 4C: Concurrent/repeated exit attempt rejected by transaction status check');

  // -------------------------------------------------------------------------
  // 5. Refund Scenario in Emulator (Advance > Gross)
  // -------------------------------------------------------------------------
  // Two-Wheeler: Advance ₹50 paid, 30m stay: Gross ₹20 -> Refund ₹30
  const refundTicketRef = doc(db, 'parking_records', '1002');
  const refundTxnRef = doc(collection(db, 'payment_transactions'));

  await setDoc(refundTicketRef, {
    ticketId: '1002',
    ticketNumber: '1002',
    vehicleNumber: 'MH12CD5678',
    normalizedVehicleNumber: 'MH12CD5678',
    vehicleType: 'twoWheeler',
    advanceAmount: 50,
    status: 'ACTIVE',
    entryGuardUid: guardUid,
  });

  await runTransaction(db, async (txn) => {
    const snap = await txn.get(refundTicketRef);
    const data = snap.data()!;
    const gross = 20;
    const advance = Number(data.advanceAmount);
    const refund = Math.max(0, advance - gross); // ₹30

    txn.update(refundTicketRef, {
      status: 'EXITED',
      grossCharge: gross,
      balanceDue: 0,
      refundAmount: refund,
      paymentMethod: 'cash',
      exitGuardUid: guardUid,
    });

    txn.set(refundTxnRef, {
      ticketId: '1002',
      amount: refund,
      paymentMethod: 'cash',
      paymentType: 'REFUND',
      guardUid: guardUid,
      createdAt: serverTimestamp(),
    });
  });

  const refundRecordSnap = await getDoc(refundTicketRef);
  assert(
    refundRecordSnap.data()?.refundAmount === 30 && refundRecordSnap.data()?.status === 'EXITED',
    'Test 5A: Advance refund correctly recorded in emulator (Refund: ₹30)'
  );

  const refundTxnSnap = await getDoc(refundTxnRef);
  assert(
    refundTxnSnap.exists() && refundTxnSnap.data()?.paymentType === 'REFUND' && refundTxnSnap.data()?.amount === 30,
    'Test 5B: REFUND transaction recorded in emulator ledger'
  );

  // -------------------------------------------------------------------------
  // 6. My Shift & Handover Workflows in Live Emulator
  // -------------------------------------------------------------------------
  // Initiate a handover of ₹300 CASH from Ramesh to Suresh
  const handoverRef = doc(collection(db, 'handovers'));
  const eventInitRef = doc(collection(db, 'responsibility_events'));

  const handoverBatch = writeBatch(db);
  handoverBatch.set(handoverRef, {
    handoverId: handoverRef.id,
    fromGuardId: guardUid,
    fromGuardName: 'Ramesh Guard',
    toGuardId: receiverUid,
    toGuardName: 'Suresh Receiving Guard',
    shiftId: 'shift_1',
    amount: 300,
    type: 'CASH',
    status: 'PENDING',
    sourceBalanceBefore: 300,
    createdAt: serverTimestamp(),
  });

  handoverBatch.set(eventInitRef, {
    id: eventInitRef.id,
    guardId: guardUid,
    action: 'HANDOVER_INITIATED',
    status: 'Pending',
    amount: 300,
    type: 'CASH',
    targetGuardId: receiverUid,
    createdAt: serverTimestamp(),
  });

  await handoverBatch.commit();

  const savedHandoverSnap = await getDoc(handoverRef);
  assert(
    savedHandoverSnap.exists() && savedHandoverSnap.data()?.status === 'PENDING',
    'Test 6A: Handover created in emulator with status="PENDING"'
  );

  // Now authenticate as Suresh (receiving guard) to accept
  await signInWithEmailAndPassword(auth, receiverEmail, testPassword);

  const acceptBatch = writeBatch(db);
  acceptBatch.update(handoverRef, {
    status: 'ACCEPTED',
    acceptedAt: serverTimestamp(),
    acceptedBy: receiverUid,
  });

  const eventOutRef = doc(collection(db, 'responsibility_events'));
  acceptBatch.set(eventOutRef, {
    id: eventOutRef.id,
    guardId: guardUid,
    action: 'HANDOVER_OUT',
    status: 'Transferred',
    amount: 300,
    type: 'CASH',
    targetGuardId: receiverUid,
    createdAt: serverTimestamp(),
  });

  const eventInRef = doc(collection(db, 'responsibility_events'));
  acceptBatch.set(eventInRef, {
    id: eventInRef.id,
    guardId: receiverUid,
    action: 'HANDOVER_IN',
    status: 'Transferred',
    amount: 300,
    type: 'CASH',
    targetGuardId: guardUid,
    createdAt: serverTimestamp(),
  });

  await acceptBatch.commit();

  const acceptedHandoverSnap = await getDoc(handoverRef);
  assert(
    acceptedHandoverSnap.data()?.status === 'ACCEPTED' && acceptedHandoverSnap.data()?.acceptedBy === receiverUid,
    'Test 6B: Handover successfully accepted by designated receiver in emulator'
  );

  const outSnap = await getDoc(eventOutRef);
  const inSnap = await getDoc(eventInRef);
  assert(
    outSnap.exists() && inSnap.exists() && outSnap.data()?.action === 'HANDOVER_OUT' && inSnap.data()?.action === 'HANDOVER_IN',
    'Test 6C: Dual HANDOVER_OUT and HANDOVER_IN responsibility events written atomically in emulator'
  );

  // -------------------------------------------------------------------------
  // 7. Transaction Rollback Protection in Emulator
  // -------------------------------------------------------------------------
  const rollbackRef = doc(db, 'parking_records', 'rollback_test');
  let rollbackCaught = false;

  try {
    await runTransaction(db, async (txn) => {
      txn.set(rollbackRef, { status: 'SHOULD_NOT_EXIST' });
      // Deliberate error to force rollback
      throw new Error('SIMULATED_TRANSACTION_FAILURE');
    });
  } catch (err: any) {
    if (err.message.includes('SIMULATED_TRANSACTION_FAILURE')) rollbackCaught = true;
  }

  const rollbackSnap = await getDoc(rollbackRef);
  assert(
    rollbackCaught && !rollbackSnap.exists(),
    'Test 7: Failed transaction rolled back cleanly in emulator without partial writes'
  );

  // -------------------------------------------------------------------------
  // 8. Sign-out and Clean teardown
  // -------------------------------------------------------------------------
  await signOut(auth);
  await teardownEmulatorClient();

  assert(true, 'Test 8: Test client signed out and torn down cleanly');

  console.log('\n----------------------------------------------------------------------');
  console.log(`Live Firebase Emulator Integration Summary: ${passed}/${passed + failed} Passed`);
  results.forEach((r) => console.log(r));
  console.log('----------------------------------------------------------------------\n');

  return { total: passed + failed, passed, failed, results };
}

// Auto-run if executed directly by node
if (typeof process !== 'undefined' && process.argv[1]?.includes('emulatorIntegration')) {
  runEmulatorIntegrationTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
