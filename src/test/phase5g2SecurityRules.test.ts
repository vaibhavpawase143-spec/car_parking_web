import './setupEmulatorEnv';
/**
 * Bizflow Phase 5G-2: Firestore Security Rules & Indexes Remediation Test Suite
 *
 * Dedicated live emulator test suite verifying:
 * - SEC-02: Client SDK direct writes/updates/deletes to /audit_logs strictly denied.
 * - SEC-03: Multi-location role and location tenant isolation enforced in Firestore Security Rules.
 * - Cross-location read and write prevention for guards and managers.
 * - Protection of legacy records without locationId against arbitrary authenticated users.
 * - Privilege escalation lockout on /guards/{uid} self-updates.
 * - Full operational preservation for legitimate same-location workflows (entry, exit, handover).
 * - Safe handling of missing custom claims without rules evaluation errors.
 *
 * Target: Local Firebase Emulator (demo-car-parking-e2e)
 * - Firestore: 127.0.0.1:8080
 * - Auth:      127.0.0.1:9099
 * - Functions: 127.0.0.1:5001
 * Zero production network access guaranteed.
 */

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
  serverTimestamp,
} from 'firebase/firestore';

import { auth, db } from '../firebase/config';
import {
  verifyEmulatorPortsActive,
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
  AUTH_EMULATOR_URL,
  EMULATOR_PROJECT_ID,
} from './emulatorTestHelper';

import { getAdminDb, COLLECTIONS } from '../../functions/src/index';
import { LocationAdminCallableService } from '../services/locationAdminCallableService';
import { LocationFormData } from '../utils/locationValidation';

const adminDb = getAdminDb();

export async function runPhase5G2RulesTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: string[];
}> {
  let passed = 0;
  let failed = 0;
  const results: string[] = [];

  function assert(condition: boolean, testId: string, testName: string) {
    if (condition) {
      passed++;
      results.push(`  [PASS - EMULATOR] ${testId}: ${testName}`);
      console.log(`  [PASS - EMULATOR] ${testId}: ${testName}`);
    } else {
      failed++;
      results.push(`  [FAIL - EMULATOR] ${testId}: ${testName}`);
      console.error(`  [FAIL - EMULATOR] ${testId}: ${testName}`);
    }
  }

  console.log('\n======================================================================');
  console.log('BIZFLOW PHASE 5G-2: FIRESTORE SECURITY RULES & ISOLATION SUITE');
  console.log(`Target: Firestore [${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}] | Auth [${AUTH_EMULATOR_URL}]`);
  console.log(`Project: ${EMULATOR_PROJECT_ID} (Strictly Isolated Offline Demo)`);
  console.log('======================================================================\n');

  // Preflight check: verify emulators are reachable
  const ports = await verifyEmulatorPortsActive();
  if (!ports.firestoreActive || !ports.authActive) {
    throw new Error('Emulator ports not responding! Aborting Phase 5G-2 tests.');
  }

  const testPassword = 'Password123!';
  const timestamp = Date.now();

  const ownerEmail = `owner_5g2_${timestamp}@bizflow.test`;
  const managerAlphaEmail = `mgr_alpha_${timestamp}@bizflow.test`;
  const guardAlphaEmail = `guard_alpha_${timestamp}@bizflow.test`;
  const relievingAlphaEmail = `guard_reliever_${timestamp}@bizflow.test`;
  const guardBetaEmail = `guard_beta_${timestamp}@bizflow.test`;
  const legacyGuardEmail = `legacy_guard_${timestamp}@bizflow.test`;
  const unauthorizedEmail = `unauthorized_${timestamp}@bizflow.test`;

  async function getOrCreateUser(email: string) {
    try {
      const cred = await createUserWithEmailAndPassword(auth!, email, testPassword);
      return cred.user;
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth!, email, testPassword);
        return cred.user;
      }
      throw err;
    }
  }

  // 1. Seed Authentication accounts
  const ownerUser = await getOrCreateUser(ownerEmail);
  const managerAlphaUser = await getOrCreateUser(managerAlphaEmail);
  const guardAlphaUser = await getOrCreateUser(guardAlphaEmail);
  const relievingAlphaUser = await getOrCreateUser(relievingAlphaEmail);
  const guardBetaUser = await getOrCreateUser(guardBetaEmail);
  const legacyGuardUser = await getOrCreateUser(legacyGuardEmail);
  await getOrCreateUser(unauthorizedEmail);

  // 2. Seed database-backed staff profiles in /guards via Admin SDK
  await adminDb.collection(COLLECTIONS.GUARDS).doc(ownerUser.uid).set({
    uid: ownerUser.uid,
    name: 'Enterprise Owner 5G2',
    email: ownerEmail,
    role: 'owner',
    isActive: true,
    assignedLocationIds: [],
  });

  await adminDb.collection(COLLECTIONS.GUARDS).doc(managerAlphaUser.uid).set({
    uid: managerAlphaUser.uid,
    name: 'Manager Alpha',
    email: managerAlphaEmail,
    role: 'manager',
    isActive: true,
    assignedLocationIds: ['loc_alpha_01'],
  });

  await adminDb.collection(COLLECTIONS.GUARDS).doc(guardAlphaUser.uid).set({
    uid: guardAlphaUser.uid,
    name: 'Guard Alpha',
    email: guardAlphaEmail,
    role: 'guard',
    isActive: true,
    assignedLocationId: 'loc_alpha_01',
    assignedLocationIds: ['loc_alpha_01'],
  });

  await adminDb.collection(COLLECTIONS.GUARDS).doc(relievingAlphaUser.uid).set({
    uid: relievingAlphaUser.uid,
    name: 'Relieving Guard Alpha',
    email: relievingAlphaEmail,
    role: 'guard',
    isActive: true,
    assignedLocationId: 'loc_alpha_01',
    assignedLocationIds: ['loc_alpha_01'],
  });

  await adminDb.collection(COLLECTIONS.GUARDS).doc(guardBetaUser.uid).set({
    uid: guardBetaUser.uid,
    name: 'Guard Beta',
    email: guardBetaEmail,
    role: 'guard',
    isActive: true,
    assignedLocationId: 'loc_beta_01',
    assignedLocationIds: ['loc_beta_01'],
  });

  await adminDb.collection(COLLECTIONS.GUARDS).doc(legacyGuardUser.uid).set({
    uid: legacyGuardUser.uid,
    name: 'Legacy Sangamner Guard',
    email: legacyGuardEmail,
    role: 'guard',
    isActive: true,
    // Note: assignedLocationId and assignedLocationIds are intentionally omitted to model legacy staff
  });

  // Note: unauthorizedUser is NOT seeded in /guards (models a non-staff user)

  // 3. Seed test operational records via Admin SDK
  await adminDb.collection(COLLECTIONS.PARKING_RECORDS).doc('rec_alpha_existing').set({
    ticketId: 'rec_alpha_existing',
    ticketNumber: 'ALP-1001',
    locationId: 'loc_alpha_01',
    status: 'ACTIVE',
    vehicleNumber: 'MH12AA1111',
    entryTime: new Date(),
    entryGuardUid: guardAlphaUser.uid,
  });

  await adminDb.collection(COLLECTIONS.PARKING_RECORDS).doc('rec_beta_existing').set({
    ticketId: 'rec_beta_existing',
    ticketNumber: 'BET-1001',
    locationId: 'loc_beta_01',
    status: 'ACTIVE',
    vehicleNumber: 'MH14BB2222',
    entryTime: new Date(),
    entryGuardUid: guardBetaUser.uid,
  });

  await adminDb.collection(COLLECTIONS.PARKING_RECORDS).doc('rec_legacy_untagged').set({
    ticketId: 'rec_legacy_untagged',
    ticketNumber: '1042',
    // locationId is null to model pre-migration records
    status: 'ACTIVE',
    vehicleNumber: 'MH17CC3333',
    entryTime: new Date(),
  });

  await adminDb.collection(COLLECTIONS.PAYMENT_TRANSACTIONS).doc('txn_alpha_existing').set({
    ticketId: 'rec_alpha_existing',
    locationId: 'loc_alpha_01',
    amount: 50,
    paymentMethod: 'cash',
    guardUid: guardAlphaUser.uid,
    createdAt: new Date(),
  });

  // =========================================================================
  // Test 1: Unauthenticated users cannot read protected operational data
  // =========================================================================
  await signOut(auth!);

  let unauthParkingBlocked = false;
  try {
    await getDoc(doc(db!, 'parking_records', 'rec_alpha_existing'));
  } catch (err: any) {
    if (err.code === 'permission-denied') unauthParkingBlocked = true;
  }

  let unauthTxnBlocked = false;
  try {
    await getDoc(doc(db!, 'payment_transactions', 'txn_alpha_existing'));
  } catch (err: any) {
    if (err.code === 'permission-denied') unauthTxnBlocked = true;
  }

  assert(
    unauthParkingBlocked && unauthTxnBlocked,
    'T-G2-01',
    'Unauthenticated users cannot read protected operational data'
  );

  // =========================================================================
  // Test 2: Guard assigned to Location A cannot read Location B records
  // =========================================================================
  await signInWithEmailAndPassword(auth!, guardAlphaEmail, testPassword);

  let crossReadBlocked = false;
  try {
    await getDoc(doc(db!, 'parking_records', 'rec_beta_existing'));
  } catch (err: any) {
    if (err.code === 'permission-denied') crossReadBlocked = true;
  }

  assert(
    crossReadBlocked,
    'T-G2-02',
    'A Guard assigned to Location A cannot read Location B parking records'
  );

  // =========================================================================
  // Test 3: Guard assigned to Location A cannot modify Location B records
  // =========================================================================
  let crossUpdateBlocked = false;
  try {
    await updateDoc(doc(db!, 'parking_records', 'rec_beta_existing'), {
      status: 'EXITED',
      grossCharge: 100,
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') crossUpdateBlocked = true;
  }

  let crossCreateBlocked = false;
  try {
    await setDoc(doc(db!, 'parking_records', 'rec_beta_illegal_create'), {
      ticketId: 'rec_beta_illegal_create',
      locationId: 'loc_beta_01',
      status: 'ACTIVE',
      vehicleNumber: 'MH12XX9999',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') crossCreateBlocked = true;
  }

  assert(
    crossUpdateBlocked && crossCreateBlocked,
    'T-G2-03',
    'A Guard assigned to Location A cannot modify or create Location B parking records'
  );

  // =========================================================================
  // Test 4: Manager cannot access an unassigned location
  // =========================================================================
  await signInWithEmailAndPassword(auth!, managerAlphaEmail, testPassword);

  let managerCrossShiftBlocked = false;
  try {
    await setDoc(doc(db!, 'shifts', 'shift_beta_illegal'), {
      locationId: 'loc_beta_01',
      guardUid: guardBetaUser.uid,
      status: 'ASSIGNED',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') managerCrossShiftBlocked = true;
  }

  let managerAssignedShiftAllowed = false;
  try {
    await setDoc(doc(db!, 'shifts', 'shift_alpha_valid'), {
      locationId: 'loc_alpha_01',
      guardUid: guardAlphaUser.uid,
      status: 'ASSIGNED',
    });
    managerAssignedShiftAllowed = true;
  } catch (err: any) {
    managerAssignedShiftAllowed = false;
  }

  assert(
    managerCrossShiftBlocked && managerAssignedShiftAllowed,
    'T-G2-04',
    'A Manager cannot access an unassigned location, but can manage assigned facilities'
  );

  // =========================================================================
  // Test 5: Owner access follows enterprise scope across facilities
  // =========================================================================
  await signInWithEmailAndPassword(auth!, ownerEmail, testPassword);

  let ownerCanReadAlpha = false;
  let ownerCanReadBeta = false;

  try {
    const snapA = await getDoc(doc(db!, 'parking_records', 'rec_alpha_existing'));
    ownerCanReadAlpha = snapA.exists();
    const snapB = await getDoc(doc(db!, 'parking_records', 'rec_beta_existing'));
    ownerCanReadBeta = snapB.exists();
  } catch (err: any) {
    // Failed
  }

  assert(
    ownerCanReadAlpha && ownerCanReadBeta,
    'T-G2-05',
    'An Owner access follows approved enterprise scope across all facilities'
  );

  // =========================================================================
  // Test 6: Users cannot escalate privileges by changing profile/assignment
  // =========================================================================
  await signInWithEmailAndPassword(auth!, guardAlphaEmail, testPassword);

  let roleEscalationBlocked = false;
  try {
    await updateDoc(doc(db!, 'guards', guardAlphaUser.uid), {
      role: 'admin',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') roleEscalationBlocked = true;
  }

  let locationEscalationBlocked = false;
  try {
    await updateDoc(doc(db!, 'guards', guardAlphaUser.uid), {
      assignedLocationId: 'loc_beta_01',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') locationEscalationBlocked = true;
  }

  let allowedProfileUpdate = false;
  try {
    await updateDoc(doc(db!, 'guards', guardAlphaUser.uid), {
      mobile: '9876543210',
    });
    allowedProfileUpdate = true;
  } catch (err: any) {
    allowedProfileUpdate = false;
  }

  assert(
    roleEscalationBlocked && locationEscalationBlocked && allowedProfileUpdate,
    'T-G2-06',
    'Users cannot escalate privileges or mutate assignments on self-profile updates'
  );

  // =========================================================================
  // Test 7: Client SDK direct writes to /audit_logs are denied (SEC-02)
  // =========================================================================
  let guardAuditWriteBlocked = false;
  try {
    await setDoc(doc(db!, 'audit_logs', 'forged_log_guard'), {
      action: 'ILLEGAL_CLIENT_AUDIT',
      timestamp: serverTimestamp(),
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') guardAuditWriteBlocked = true;
  }

  await signInWithEmailAndPassword(auth!, ownerEmail, testPassword);
  let ownerAuditWriteBlocked = false;
  try {
    await setDoc(doc(db!, 'audit_logs', 'forged_log_owner'), {
      action: 'ILLEGAL_OWNER_DIRECT_AUDIT',
      timestamp: serverTimestamp(),
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') ownerAuditWriteBlocked = true;
  }

  assert(
    guardAuditWriteBlocked && ownerAuditWriteBlocked,
    'T-G2-07',
    'Client SDK direct writes to /audit_logs are denied (SEC-02)'
  );

  // =========================================================================
  // Test 8: Client SDK direct updates/deletes of /audit_logs are denied (SEC-02)
  // =========================================================================
  await adminDb.collection(COLLECTIONS.AUDIT_LOGS).doc('existing_audit_entry_5g2').set({
    action: 'CANONICAL_ACTION',
    timestamp: new Date(),
  });

  let auditUpdateBlocked = false;
  try {
    await updateDoc(doc(db!, 'audit_logs', 'existing_audit_entry_5g2'), {
      action: 'FORGED_MUTATION',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') auditUpdateBlocked = true;
  }

  let auditDeleteBlocked = false;
  try {
    await deleteDoc(doc(db!, 'audit_logs', 'existing_audit_entry_5g2'));
  } catch (err: any) {
    if (err.code === 'permission-denied') auditDeleteBlocked = true;
  }

  assert(
    auditUpdateBlocked && auditDeleteBlocked,
    'T-G2-08',
    'Client SDK direct updates and deletes of /audit_logs are denied (SEC-02)'
  );

  // =========================================================================
  // Test 9: Client SDK direct writes to /locations and /location_codes denied
  // =========================================================================
  let locationWriteBlocked = false;
  try {
    await setDoc(doc(db!, 'locations', 'loc_client_direct_hack'), {
      name: 'Direct Client Hack',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') locationWriteBlocked = true;
  }

  let codeWriteBlocked = false;
  try {
    await setDoc(doc(db!, 'location_codes', 'HCK'), {
      locationId: 'loc_client_direct_hack',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') codeWriteBlocked = true;
  }

  assert(
    locationWriteBlocked && codeWriteBlocked,
    'T-G2-09',
    'Client SDK direct writes to /locations and /location_codes are strictly denied'
  );

  // =========================================================================
  // Test 10: Legitimate backend callable operations remain functional
  // =========================================================================
  const testCallablePayload: LocationFormData = {
    code: `G${Math.floor(Math.random() * 899 + 100)}`,
    name: 'Jay Ganesh 5G2 Test Facility',
    marathiName: 'जय गणेश ५जी२ वाहनतळ',
    locationName: 'Test Area',
    marathiLocationName: 'चाचणी परिसर',
    address: 'Station Road, Test District, 422605',
    authorityLicenseText: 'अधिकृत वाहनतळ',
    contactMobile: '9690793434',
    isActive: true,
    capacity: {
      carTotal: 50,
      twoWheelerTotal: 100,
    },
    rates: {
      fourWheelerFirstHourRate: 50,
      fourWheelerAdditionalHourRate: 10,
      fourWheeler12HourCap: 150,
      fourWheeler24HourCap: 250,
      fourWheelerMonthlyRate: 1500,
      twoWheelerFirstHourRate: 20,
      twoWheelerAdditionalHourRate: 5,
      twoWheeler12HourCap: 60,
      twoWheeler24HourCap: 100,
      twoWheelerMonthlyRate: 600,
    },
    operatingHours: {
      openTime: '06:00',
      closeTime: '23:00',
      is24Hours: false,
    },
    features: {
      cashEnabled: true,
      upiEnabled: true,
      advanceEnabled: true,
      overnightParkingAllowed: true,
    },
  };

  const callableRes = await LocationAdminCallableService.createLocation(testCallablePayload, {
    userRole: 'owner',
  });
  console.log('[T-G2-10 Result]:', callableRes);

  assert(
    callableRes.success === true && Boolean(callableRes.locationId),
    'T-G2-10',
    'Legitimate backend Cloud Function callable operations remain functional (Admin SDK)'
  );

  // =========================================================================
  // Test 11: Missing custom claims do not cause unexpected authorization
  // =========================================================================
  await signInWithEmailAndPassword(auth!, unauthorizedEmail, testPassword);

  let unauthStaffReadBlocked = false;
  try {
    await getDoc(doc(db!, 'parking_records', 'rec_alpha_existing'));
  } catch (err: any) {
    if (err.code === 'permission-denied') unauthStaffReadBlocked = true;
  }

  let unauthStaffWriteBlocked = false;
  try {
    await setDoc(doc(db!, 'parking_records', 'rec_unauth_write'), {
      status: 'ACTIVE',
      vehicleNumber: 'MH12XX0000',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') unauthStaffWriteBlocked = true;
  }

  assert(
    unauthStaffReadBlocked && unauthStaffWriteBlocked,
    'T-G2-11',
    'Missing custom claims safely fail closed without granting unauthorized access'
  );

  // =========================================================================
  // Test 12: Legacy records without locationId are protected
  // =========================================================================
  // Non-Sangamner guard at Alpha cannot read un-tagged legacy records
  await signInWithEmailAndPassword(auth!, guardAlphaEmail, testPassword);
  let guardAlphaLegacyBlocked = false;
  try {
    await getDoc(doc(db!, 'parking_records', 'rec_legacy_untagged'));
  } catch (err: any) {
    if (err.code === 'permission-denied') guardAlphaLegacyBlocked = true;
  }

  // Legacy guard (defaulting to Sangamner) CAN read un-tagged legacy records
  await signInWithEmailAndPassword(auth!, legacyGuardEmail, testPassword);
  let legacyGuardAllowed = false;
  try {
    const snap = await getDoc(doc(db!, 'parking_records', 'rec_legacy_untagged'));
    legacyGuardAllowed = snap.exists();
  } catch (err: any) {
    legacyGuardAllowed = false;
  }

  assert(
    guardAlphaLegacyBlocked && legacyGuardAllowed,
    'T-G2-12',
    'Legacy records without locationId are restricted to Sangamner staff and blocked for others'
  );

  // =========================================================================
  // Test 13: Legitimate same-location guard workflows remain functional
  // =========================================================================
  await signInWithEmailAndPassword(auth!, guardAlphaEmail, testPassword);

  let alphaEntryCreated = false;
  let alphaEntryRead = false;
  let alphaEntrySettled = false;

  try {
    await setDoc(doc(db!, 'parking_records', 'rec_alpha_guard_flow'), {
      ticketId: 'rec_alpha_guard_flow',
      ticketNumber: 'ALP-2001',
      locationId: 'loc_alpha_01',
      vehicleNumber: 'MH12AA5555',
      status: 'ACTIVE',
      entryTime: serverTimestamp(),
      entryGuardUid: guardAlphaUser.uid,
    });
    alphaEntryCreated = true;

    const snap = await getDoc(doc(db!, 'parking_records', 'rec_alpha_guard_flow'));
    alphaEntryRead = snap.exists();

    await updateDoc(doc(db!, 'parking_records', 'rec_alpha_guard_flow'), {
      status: 'EXITED',
      grossCharge: 40,
      exitGuardUid: guardAlphaUser.uid,
    });
    alphaEntrySettled = true;
  } catch (err: any) {
    console.error('[Test 13 Error]:', err);
  }

  assert(
    alphaEntryCreated && alphaEntryRead && alphaEntrySettled,
    'T-G2-13',
    'Legitimate same-location guard workflows remain functional (entry, read, settlement)'
  );

  // =========================================================================
  // Test 14: Shift, Handover, and Settlement operation permissions
  // =========================================================================
  const handoverDocId = `handover_alpha_${timestamp}`;
  let handoverCreated = false;
  try {
    await setDoc(doc(db!, 'handovers', handoverDocId), {
      handoverId: handoverDocId,
      fromGuardId: guardAlphaUser.uid,
      toGuardId: relievingAlphaUser.uid,
      locationId: 'loc_alpha_01',
      amount: 500,
      type: 'CASH',
      status: 'PENDING',
      createdAt: serverTimestamp(),
    });
    handoverCreated = true;
  } catch (err: any) {
    console.error('[Handover Create Error]:', err);
    handoverCreated = false;
  }

  // Guard Beta cannot accept Handover at Alpha
  await signInWithEmailAndPassword(auth!, guardBetaEmail, testPassword);
  let crossHandoverAcceptBlocked = false;
  try {
    await updateDoc(doc(db!, 'handovers', handoverDocId), {
      status: 'ACCEPTED',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') crossHandoverAcceptBlocked = true;
  }

  // Deleting financial transaction is strictly forbidden
  let deleteTxnBlocked = false;
  try {
    await deleteDoc(doc(db!, 'payment_transactions', 'txn_alpha_existing'));
  } catch (err: any) {
    if (err.code === 'permission-denied') deleteTxnBlocked = true;
  }

  assert(
    handoverCreated && crossHandoverAcceptBlocked && deleteTxnBlocked,
    'T-G2-14',
    'Legitimate shifts, handovers, and immutable ledger rules enforce intended permissions'
  );

  // Clean sign out
  await signOut(auth!);

  console.log('\n----------------------------------------------------------------------');
  console.log(`Phase 5G-2 Security Rules Test Summary: ${passed}/${passed + failed} Passed (${failed} Failed)`);
  console.log('----------------------------------------------------------------------\n');

  return { total: passed + failed, passed, failed, results };
}

// Auto-run if invoked directly
if (typeof process !== 'undefined' && process.argv[1]?.includes('phase5g2SecurityRules.test')) {
  runPhase5G2RulesTests()
    .then((res) => {
      if (res.failed > 0) process.exit(1);
    })
    .catch((err) => {
      console.error('[Phase 5G-2 Test Error]:', err);
      process.exit(1);
    });
}
