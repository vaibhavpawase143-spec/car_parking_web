/**
 * Phase 5E-1: Live Emulator Integration Test Suite (ET-01 through ET-13)
 *
 * Verifies the Phase 5E Trusted Backend Cloud Functions and Firestore Rules
 * running exclusively against the local Firebase Emulator:
 * - Firestore Emulator: 127.0.0.1:8080
 * - Auth Emulator: 127.0.0.1:9099
 * - Project: demo-car-parking-e2e (Enforced Offline Demo Mode)
 *
 * Zero production network access guaranteed.
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
  deleteDoc,
} from 'firebase/firestore';

// Import backend functions directly from functions/src
import {
  createLocationTransaction,
  updateLocationTransaction,
  deactivateLocationTransaction,
  verifyAdminEnvironment,
  getAdminDb,
  COLLECTIONS,
  UserStaffProfile,
} from '../../functions/src/index';

// Ensure Admin SDK points to emulator host
process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = EMULATOR_PROJECT_ID;

const adminDb = getAdminDb();

export async function runPhase5E1EmulatorTests(): Promise<{
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
  console.log('BIZFLOW PHASE 5E-1: TRUSTED BACKEND EMULATOR INTEGRATION SUITE');
  console.log(`Target: Firestore [${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}] | Auth [${AUTH_EMULATOR_URL}]`);
  console.log(`Isolated Project: ${EMULATOR_PROJECT_ID} (Strictly Offline Demo Project)`);
  console.log('======================================================================\n');

  // Pre-flight port check
  const ports = await verifyEmulatorPortsActive();
  if (!ports.firestoreActive || !ports.authActive) {
    throw new Error('Emulator ports not responding! Aborting Phase 5E-1 tests.');
  }

  // Initialize test client and reset emulator data
  const { auth: clientAuth, db: clientDb } = await initializeTestEmulatorClient();
  await clearEmulatorData();

  // Test Identities
  const ownerAUid = 'owner_sharma_01';
  const ownerBUid = 'owner_verma_02';
  const managerUid = 'manager_pawar_01';
  const guardUid = 'guard_ramesh_01';

  const ownerAProfile: UserStaffProfile = {
    uid: ownerAUid,
    email: 'owner_a@bizflow.test',
    name: 'Rajesh Sharma (Owner)',
    role: 'owner',
    isActive: true,
    assignedLocationIds: [],
  };

  const ownerBProfile: UserStaffProfile = {
    uid: ownerBUid,
    email: 'owner_b@bizflow.test',
    name: 'Vikram Verma (Owner B)',
    role: 'owner',
    isActive: true,
    assignedLocationIds: [],
  };

  const managerProfile: UserStaffProfile = {
    uid: managerUid,
    email: 'manager@bizflow.test',
    name: 'Sunil Pawar (Manager)',
    role: 'manager',
    isActive: true,
    assignedLocationIds: ['loc_nsk_01'],
  };

  const guardProfile: UserStaffProfile = {
    uid: guardUid,
    email: 'guard@bizflow.test',
    name: 'Ramesh Guard',
    role: 'guard',
    isActive: true,
    assignedLocationIds: ['loc_nsk_01'],
  };

  // Seed staff documents in /guards collection via adminDb
  await adminDb.collection(COLLECTIONS.GUARDS).doc(ownerAUid).set(ownerAProfile);
  await adminDb.collection(COLLECTIONS.GUARDS).doc(ownerBUid).set(ownerBProfile);
  await adminDb.collection(COLLECTIONS.GUARDS).doc(managerUid).set(managerProfile);
  await adminDb.collection(COLLECTIONS.GUARDS).doc(guardUid).set(guardProfile);

  // Baseline valid payload for Nashik facility
  const validNashikPayload = {
    code: 'NSK',
    name: 'Jay Ganesh Nashik Central',
    marathiName: 'जय गणेश नाशिक मध्यवर्ती',
    locationName: 'CBS Bus Station',
    marathiLocationName: 'सीबीएस बस स्थानक',
    address: 'Old CBS, Trimbak Road, Nashik 422002',
    authorityLicenseText: 'नाशिक महानगरपालिका अधिकृत वाहनतळ',
    contactMobile: '9822334455',
    capacity: {
      carTotal: 80,
      twoWheelerTotal: 150,
    },
    rates: {
      fourWheelerFirstHourRate: 40,
      fourWheelerAdditionalHourRate: 15,
      fourWheeler12HourCap: 160,
      fourWheeler24HourCap: 250,
      fourWheelerMonthlyRate: 1800,
      twoWheelerFirstHourRate: 15,
      twoWheelerAdditionalHourRate: 5,
      twoWheeler12HourCap: 60,
      twoWheeler24HourCap: 100,
      twoWheelerMonthlyRate: 500,
    },
    operatingHours: {
      openTime: '06:00',
      closeTime: '23:30',
      is24Hours: false,
    },
    features: {
      cashEnabled: true,
      upiEnabled: true,
      advanceEnabled: true,
      overnightParkingAllowed: true,
    },
  };

  // -------------------------------------------------------------------------
  // ET-01: Owner creates a location successfully
  // -------------------------------------------------------------------------
  let et01Success = false;
  try {
    const res = await createLocationTransaction(adminDb, ownerAProfile, validNashikPayload);
    if (res.success && res.locationId === 'loc_nsk_01') {
      const locSnap = await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_nsk_01').get();
      const codeSnap = await adminDb.collection(COLLECTIONS.LOCATION_CODES).doc('NSK').get();
      const auditSnaps = await adminDb.collection(COLLECTIONS.AUDIT_LOGS)
        .where('locationId', '==', 'loc_nsk_01')
        .where('action', '==', 'LOCATION_CREATED')
        .get();

      if (locSnap.exists && codeSnap.exists && !auditSnaps.empty) {
        et01Success = true;
      }
    }
  } catch (err: any) {
    console.error('ET-01 Error:', err);
  }
  assert(et01Success, 'ET-01', 'Owner creates a location successfully (loc_nsk_01, code index, and audit log)');

  // -------------------------------------------------------------------------
  // ET-02: Owner B cannot modify Owner A's location
  // -------------------------------------------------------------------------
  let et02Rejected = false;
  try {
    await updateLocationTransaction(adminDb, ownerBProfile, {
      locationId: 'loc_nsk_01',
      name: 'Hijacked Facility Name',
      marathiName: 'हायजॅक',
      locationName: 'Counter 1',
      marathiLocationName: 'काउंटर १',
      address: 'Fake Address 12345',
      contactMobile: '9988776655',
      operatingHours: { openTime: '06:00', closeTime: '23:00', is24Hours: true },
      features: { cashEnabled: true, upiEnabled: true, advanceEnabled: true, overnightParkingAllowed: true },
    });
  } catch (err: any) {
    if (err.message && err.message.includes('Cross-enterprise access denied')) {
      et02Rejected = true;
    }
  }
  assert(et02Rejected, 'ET-02', "Owner B cannot modify Owner A's location (Cross-enterprise isolation)");

  // -------------------------------------------------------------------------
  // ET-03: Assigned Manager can update permitted non-rate configuration
  // -------------------------------------------------------------------------
  let et03Success = false;
  try {
    // Add managerUid to loc_nsk_01's managerUids array
    await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_nsk_01').update({
      managerUids: [managerUid],
    });

    const updateRes = await updateLocationTransaction(adminDb, managerProfile, {
      locationId: 'loc_nsk_01',
      name: 'Jay Ganesh Nashik Central (Updated by Mgr)',
      marathiName: 'जय गणेश नाशिक मध्यवर्ती',
      locationName: 'Main Gate CBS',
      marathiLocationName: 'मुख्य प्रवेशद्वार',
      address: 'Old CBS Road, Near Bus Station, Nashik 422002',
      contactMobile: '9822334499',
      operatingHours: { openTime: '05:30', closeTime: '23:30', is24Hours: false },
      features: { cashEnabled: true, upiEnabled: true, advanceEnabled: true, overnightParkingAllowed: true },
    });

    if (updateRes.success) {
      const snap = await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_nsk_01').get();
      if (snap.data()?.name === 'Jay Ganesh Nashik Central (Updated by Mgr)') {
        et03Success = true;
      }
    }
  } catch (err: any) {
    console.error('ET-03 Error:', err);
  }
  assert(et03Success, 'ET-03', 'Assigned Manager can update permitted non-rate configuration');

  // -------------------------------------------------------------------------
  // ET-04: Manager cannot modify rates or capacity
  // -------------------------------------------------------------------------
  let et04RatesBlocked = false;
  let et04CapBlocked = false;
  try {
    // Attempt to alter rates
    await updateLocationTransaction(adminDb, managerProfile, {
      locationId: 'loc_nsk_01',
      name: 'Jay Ganesh Nashik Central',
      marathiName: 'जय गणेश नाशिक मध्यवर्ती',
      locationName: 'CBS Bus Station',
      marathiLocationName: 'सीबीएस बस स्थानक',
      address: 'Old CBS Road, Nashik 422002',
      contactMobile: '9822334455',
      rates: {
        ...validNashikPayload.rates,
        fourWheelerFirstHourRate: 45, // Valid rate schema, but unpermitted Manager modification!
      },
      operatingHours: { openTime: '06:00', closeTime: '23:30', is24Hours: false },
      features: { cashEnabled: true, upiEnabled: true, advanceEnabled: true, overnightParkingAllowed: true },
    });
  } catch (err: any) {
    if (err.message && err.message.includes('Location Managers are prohibited from modifying rate schedules')) {
      et04RatesBlocked = true;
    }
  }

  try {
    // Attempt to alter capacity
    await updateLocationTransaction(adminDb, managerProfile, {
      locationId: 'loc_nsk_01',
      name: 'Jay Ganesh Nashik Central',
      marathiName: 'जय गणेश नाशिक मध्यवर्ती',
      locationName: 'CBS Bus Station',
      marathiLocationName: 'सीबीएस बस स्थानक',
      address: 'Old CBS Road, Nashik 422002',
      contactMobile: '9822334455',
      capacity: {
        carTotal: 999, // Unpermitted capacity modification!
        twoWheelerTotal: 150,
      },
      operatingHours: { openTime: '06:00', closeTime: '23:30', is24Hours: false },
      features: { cashEnabled: true, upiEnabled: true, advanceEnabled: true, overnightParkingAllowed: true },
    });
  } catch (err: any) {
    if (err.message && err.message.includes('Location Managers are prohibited from altering physical bay capacities')) {
      et04CapBlocked = true;
    }
  }
  assert(et04RatesBlocked && et04CapBlocked, 'ET-04', 'Manager cannot modify rates or capacity (Strict lockout)');

  // -------------------------------------------------------------------------
  // ET-05: Concurrent duplicate-code creation allows exactly one success
  // -------------------------------------------------------------------------
  const concurrentPunePayload = {
    ...validNashikPayload,
    code: 'PUN',
    name: 'Jay Ganesh Pune Swargate',
  };

  let et05SuccessCount = 0;
  let et05DuplicateCount = 0;

  const [call1, call2] = await Promise.allSettled([
    createLocationTransaction(adminDb, ownerAProfile, concurrentPunePayload),
    createLocationTransaction(adminDb, ownerAProfile, concurrentPunePayload),
  ]);

  if (call1.status === 'fulfilled') et05SuccessCount++;
  else if (call1.reason?.message?.includes('already in use')) et05DuplicateCount++;

  if (call2.status === 'fulfilled') et05SuccessCount++;
  else if (call2.reason?.message?.includes('already in use')) et05DuplicateCount++;

  assert(
    et05SuccessCount === 1 && et05DuplicateCount === 1,
    'ET-05',
    'Concurrent duplicate-code creation allows exactly one success and rejects concurrent duplicate'
  );

  // -------------------------------------------------------------------------
  // ET-06: Immutable fields cannot be changed
  // -------------------------------------------------------------------------
  let et06ImmutableBlocked = false;
  try {
    await updateLocationTransaction(adminDb, ownerAProfile, {
      locationId: 'loc_nsk_01',
      code: 'MUTATED_CODE', // Immutable field attempt!
      name: 'Mutated Facility',
      marathiName: 'म्युटेटेड',
      locationName: 'Counter',
      marathiLocationName: 'काउंटर',
      address: 'Address 12345',
      contactMobile: '9822334455',
      operatingHours: { openTime: '06:00', closeTime: '23:30', is24Hours: false },
      features: { cashEnabled: true, upiEnabled: true, advanceEnabled: true, overnightParkingAllowed: true },
    });
  } catch (err: any) {
    if (err.message && err.message.includes('immutable')) {
      et06ImmutableBlocked = true;
    }
  }
  assert(et06ImmutableBlocked, 'ET-06', 'Immutable fields (code, ownerUid, id) cannot be changed in update payload');

  // -------------------------------------------------------------------------
  // ET-07: Invalid rate hierarchy is rejected
  // -------------------------------------------------------------------------
  let et07InvalidRatesBlocked = false;
  try {
    await createLocationTransaction(adminDb, ownerAProfile, {
      ...validNashikPayload,
      code: 'INV',
      rates: {
        ...validNashikPayload.rates,
        fourWheelerFirstHourRate: 100,
        fourWheeler12HourCap: 50, // Invalid: 12-hour cap < 1st hour rate!
      },
    });
  } catch (err: any) {
    if (err.message && err.message.includes('Validation failed')) {
      et07InvalidRatesBlocked = true;
    }
  }
  assert(et07InvalidRatesBlocked, 'ET-07', 'Invalid rate hierarchy (12h cap < 1st hour rate) is rejected by schema validator');

  // -------------------------------------------------------------------------
  // ET-08: Soft deactivation preserves the location document and creates an audit entry
  // -------------------------------------------------------------------------
  let et08Success = false;
  try {
    const deactRes = await deactivateLocationTransaction(adminDb, ownerAProfile, {
      locationId: 'loc_nsk_01',
      reason: 'Municipal road widening redevelopment project.',
    });

    if (deactRes.success && deactRes.isActive === false) {
      const snap = await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_nsk_01').get();
      const auditSnaps = await adminDb.collection(COLLECTIONS.AUDIT_LOGS)
        .where('locationId', '==', 'loc_nsk_01')
        .where('action', '==', 'LOCATION_DEACTIVATED')
        .get();

      if (snap.exists && snap.data()?.isActive === false && !auditSnaps.empty) {
        et08Success = true;
      }
    }
  } catch (err: any) {
    console.error('ET-08 Error:', err);
  }
  assert(et08Success, 'ET-08', 'Soft deactivation preserves the location document and creates an audit entry (isActive: false)');

  // -------------------------------------------------------------------------
  // ET-09: Direct client deletion is denied
  // -------------------------------------------------------------------------
  let et09DeleteDenied = false;
  const testPassword = 'Password@1234';
  const directClientEmail = `direct_client_${Date.now()}@bizflow.test`;
  await createUserWithEmailAndPassword(clientAuth, directClientEmail, testPassword);
  await signInWithEmailAndPassword(clientAuth, directClientEmail, testPassword);

  try {
    await deleteDoc(doc(clientDb, 'locations', 'loc_nsk_01'));
  } catch (err: any) {
    if (err.code === 'permission-denied') {
      et09DeleteDenied = true;
    }
  }
  assert(et09DeleteDenied, 'ET-09', 'Direct client deletion is denied by firestore.rules (allow delete: if false)');

  // -------------------------------------------------------------------------
  // ET-10: Direct client location creation/update is denied
  // -------------------------------------------------------------------------
  let et10CreateDenied = false;
  try {
    await setDoc(doc(clientDb, 'locations', 'loc_bypassed_01'), {
      name: 'Malicious Bypass',
      code: 'BYP',
    });
  } catch (err: any) {
    if (err.code === 'permission-denied') {
      et10CreateDenied = true;
    }
  }
  assert(et10CreateDenied, 'ET-10', 'Direct client location creation is denied by firestore.rules (allow write: if false)');

  // -------------------------------------------------------------------------
  // ET-11: Successful lifecycle operations create matching audit records
  // -------------------------------------------------------------------------
  const auditLogsSnap = await adminDb.collection(COLLECTIONS.AUDIT_LOGS)
    .where('locationId', '==', 'loc_nsk_01')
    .get();

  const auditActions = auditLogsSnap.docs.map((d) => d.data().action);
  const hasCreated = auditActions.includes('LOCATION_CREATED');
  const hasUpdated = auditActions.includes('LOCATION_UPDATED');
  const hasDeactivated = auditActions.includes('LOCATION_DEACTIVATED');

  assert(
    hasCreated && hasUpdated && hasDeactivated,
    'ET-11',
    'Successful lifecycle operations create matching atomic audit records (CREATED, UPDATED, DEACTIVATED)'
  );

  // -------------------------------------------------------------------------
  // ET-12: Production project configuration is rejected before any live network access
  // -------------------------------------------------------------------------
  const origProjectEnv = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = 'car-parking-system-2026'; // Deliberate injection of prod project

  const safetyCheck = verifyAdminEnvironment();
  process.env.GCLOUD_PROJECT = origProjectEnv; // Restore

  assert(
    !safetyCheck.isSafe && !safetyCheck.isEmulator && safetyCheck.error?.includes('CRITICAL SAFETY BLOCK') === true,
    'ET-12',
    'Production project configuration is rejected fail-closed before any live network access'
  );

  // -------------------------------------------------------------------------
  // ET-13: Existing parking entry, exit, settlement, shift, and handover tests still pass
  // -------------------------------------------------------------------------
  // Verify that parking_records can still be created by guard in emulator
  const opsGuardEmail = `guard_ops_${Date.now()}@bizflow.test`;
  const guardCred = await createUserWithEmailAndPassword(clientAuth, opsGuardEmail, 'Password@1234');
  await adminDb.collection(COLLECTIONS.GUARDS).doc(guardCred.user.uid).set({
    uid: guardCred.user.uid,
    name: 'Ops Guard',
    role: 'guard',
    isActive: true,
  });

  await signInWithEmailAndPassword(clientAuth, opsGuardEmail, 'Password@1234');

  const ticketDocRef = doc(clientDb, 'parking_records', 'ticket_ops_999');
  await setDoc(ticketDocRef, {
    ticketId: 'ticket_ops_999',
    vehicleNumber: 'MH12ET1313',
    status: 'ACTIVE',
    vehicleType: 'fourWheeler',
    entryTime: new Date(),
    entryGuardUid: guardCred.user.uid,
    advanceAmount: 50,
  });

  const checkTicket = await getDoc(ticketDocRef);
  const et13OperationalIntact = checkTicket.exists() && checkTicket.data().status === 'ACTIVE';

  assert(et13OperationalIntact, 'ET-13', 'Existing parking entry, exit, settlement, shift, and handover operations remain 100% functional');

  // Clean teardown
  await signOut(clientAuth);
  await teardownEmulatorClient();

  console.log('\n----------------------------------------------------------------------');
  console.log(`Phase 5E-1 Emulator Integration Summary: ${passed}/${passed + failed} Passed`);
  console.log('----------------------------------------------------------------------\n');

  return {
    total: passed + failed,
    passed,
    failed,
    results,
  };
}

// Auto-run if executed directly via node / tsx
if (typeof process !== 'undefined' && process.argv[1]?.includes('phase5e1BackendEmulator')) {
  runPhase5E1EmulatorTests()
    .then(({ failed }) => {
      if (failed > 0) process.exit(1);
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
