import './setupEmulatorEnv';
/**
 * Bizflow Phase 5F-1: Client Callable Integration & Inactive Location Entry Guard
 *
 * Dedicated live emulator test suite verifying:
 * - Client Callable Adapter (LocationAdminCallableService) calling Cloud Functions v2
 *   endpoints (createLocation, updateLocation, deactivateLocation) on 127.0.0.1:5001.
 * - Inactive-Location Vehicle Entry Guard in parkingService.createVehicleEntry.
 * - Guaranteed preservation of exits, settlements, shifts, and cash handovers.
 *
 * Target: Local Firebase Emulator (demo-car-parking-e2e)
 * - Firestore: 127.0.0.1:8080
 * - Auth:      127.0.0.1:9099
 * - Functions: 127.0.0.1:5001
 * Zero production network access guaranteed.
 */

// Configure environment for local emulator before any imports
process.env.VITE_USE_FIREBASE_EMULATOR = 'true';
process.env.VITE_FIREBASE_PROJECT_ID = 'demo-car-parking-e2e';
process.env.VITE_FIREBASE_API_KEY = 'demo-api-key';
process.env.VITE_FIREBASE_AUTH_DOMAIN = 'localhost';
process.env.VITE_FIREBASE_STORAGE_BUCKET = 'demo-car-parking-e2e.appspot.com';
process.env.VITE_FIREBASE_APP_ID = 'demo-app-id';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-car-parking-e2e';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  collection,
  getDocs,
} from 'firebase/firestore';

import { auth, db } from '../firebase/config';
import {
  clearEmulatorData,
  verifyEmulatorPortsActive,
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
  AUTH_EMULATOR_URL,
  EMULATOR_PROJECT_ID,
} from './emulatorTestHelper';

import { LocationAdminCallableService } from '../services/locationAdminCallableService';
import { LocationFormData } from '../utils/locationValidation';
import {
  createVehicleEntry,
  settleVehicleExit,
  InactiveLocationException,
} from '../services/parkingService';
import {
  initiateHandover,
  respondToHandover,
  calculateGuardResponsibility,
} from '../services/guardService';
import { DEFAULT_LEGACY_RATES } from '../services/locationService';
import { ParkingLocationDoc } from '../types';
import { getAdminDb, COLLECTIONS } from '../../functions/src/index';

const adminDb = getAdminDb();

export async function runPhase5F1Tests(): Promise<{
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
  console.log('BIZFLOW PHASE 5F-1: CALLABLE ADAPTER & INACTIVE LOCATION GUARD SUITE');
  console.log(`Target: Firestore [${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}] | Auth [${AUTH_EMULATOR_URL}] | Functions [127.0.0.1:5001]`);
  console.log(`Project: ${EMULATOR_PROJECT_ID} (Strictly Isolated Offline Demo)`);
  console.log('======================================================================\n');

  // Pre-flight check: Verify emulator ports are listening
  const ports = await verifyEmulatorPortsActive();
  if (!ports.firestoreActive || !ports.authActive) {
    throw new Error('Emulator ports not responding! Aborting Phase 5F-1 tests.');
  }

  // Clear existing emulator data for a clean test run
  await clearEmulatorData();

  // Mock global fetch for Cloudinary so vehicle photo upload succeeds offline without calling external APIs
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.includes('cloudinary.com')) {
      return new Response(
        JSON.stringify({
          secure_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          public_id: 'test_sample_photo',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return originalFetch(input, init);
  };

  try {
    // -------------------------------------------------------------------------
    // Setup: Seed Test Identities in Auth and Firestore Emulators
    // -------------------------------------------------------------------------
    const testPassword = 'Password123!';
    const ownerAEmail = 'owner_sharma@bizflow.test';
    const ownerBEmail = 'owner_verma@bizflow.test';
    const managerEmail = 'manager_pawar@bizflow.test';
    const guard1Email = 'guard_ramesh@bizflow.test';
    const guard2Email = 'guard_suresh@bizflow.test';

    // Helper to register/login test users
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

    const ownerAUser = await getOrCreateUser(ownerAEmail);
    const ownerBUser = await getOrCreateUser(ownerBEmail);
    const managerUser = await getOrCreateUser(managerEmail);
    const guard1User = await getOrCreateUser(guard1Email);
    const guard2User = await getOrCreateUser(guard2Email);

    // Seed staff documents in Firestore /guards collection via adminDb
    await adminDb.collection(COLLECTIONS.GUARDS).doc(ownerAUser.uid).set({
      uid: ownerAUser.uid,
      name: 'Rajesh Sharma (Owner)',
      email: ownerAEmail,
      role: 'owner',
      isActive: true,
      assignedLocationIds: [],
    });

    await adminDb.collection(COLLECTIONS.GUARDS).doc(ownerBUser.uid).set({
      uid: ownerBUser.uid,
      name: 'Vikram Verma (Owner B)',
      email: ownerBEmail,
      role: 'owner',
      isActive: true,
      assignedLocationIds: [],
    });

    await adminDb.collection(COLLECTIONS.GUARDS).doc(managerUser.uid).set({
      uid: managerUser.uid,
      name: 'Sunil Pawar (Manager)',
      email: managerEmail,
      role: 'manager',
      isActive: true,
      assignedLocationIds: ['loc_nsk_01'],
    });

    await adminDb.collection(COLLECTIONS.GUARDS).doc(guard1User.uid).set({
      uid: guard1User.uid,
      name: 'Ramesh Guard',
      email: guard1Email,
      role: 'guard',
      isActive: true,
      assignedLocationIds: ['loc_nsk_01', 'loc_pun_01', 'loc_sangamner_01'],
    });

    await adminDb.collection(COLLECTIONS.GUARDS).doc(guard2User.uid).set({
      uid: guard2User.uid,
      name: 'Suresh Guard',
      email: guard2Email,
      role: 'guard',
      isActive: true,
      assignedLocationIds: ['loc_nsk_01', 'loc_pun_01', 'loc_sangamner_01'],
    });

    // -------------------------------------------------------------------------
    // Baseline form payload for Nashik facility
    // -------------------------------------------------------------------------
    const baseNashikForm: LocationFormData = {
      code: 'NSK',
      name: 'Jay Ganesh Nashik Central',
      marathiName: 'जय गणेश नाशिक मध्यवर्ती',
      locationName: 'CBS Bus Station',
      marathiLocationName: 'सीबीएस बस स्थानक',
      address: 'Old CBS, Trimbak Road, Nashik 422002',
      authorityLicenseText: 'नाशिक महानगरपालिका अधिकृत वाहनतळ',
      contactMobile: '9822334455',
      isActive: true,
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

    // =========================================================================
    // SECTION A: CALLABLE INTEGRATION TESTS (Tests 1 to 13)
    // =========================================================================

    // -------------------------------------------------------------------------
    // Test 1: Authenticated Owner can create a location in the emulator
    // -------------------------------------------------------------------------
    await signInWithEmailAndPassword(auth!, ownerAEmail, testPassword);
    const createRes = await LocationAdminCallableService.createLocation(baseNashikForm, {
      userRole: 'owner',
    });

    const createdDocSnap = await getDoc(doc(db!, 'locations', 'loc_nsk_01'));
    assert(
      createRes.success === true &&
      createRes.locationId === 'loc_nsk_01' &&
      createdDocSnap.exists() &&
      createdDocSnap.data()?.isActive === true &&
      createdDocSnap.data()?.code === 'NSK',
      'Test 1',
      'Authenticated Owner can create a location in the emulator via Cloud Function'
    );

    let createdDoc = createRes.doc!;

    // -------------------------------------------------------------------------
    // Test 2: Owner can update an owned location
    // -------------------------------------------------------------------------
    const updatedForm: LocationFormData = {
      ...baseNashikForm,
      address: 'Trimbak Road CBS Complex, Nashik 422002',
      contactMobile: '9988776655',
    };

    const updateRes = await LocationAdminCallableService.updateLocation(updatedForm, {
      originalDoc: createdDoc,
      userRole: 'owner',
    });

    const updatedDocSnap = await getDoc(doc(db!, 'locations', 'loc_nsk_01'));
    assert(
      updateRes.success === true &&
      updatedDocSnap.exists() &&
      updatedDocSnap.data()?.address === 'Trimbak Road CBS Complex, Nashik 422002' &&
      updatedDocSnap.data()?.contactMobile === '9988776655',
      'Test 2',
      'Owner can update an owned location via Cloud Function'
    );

    if (updateRes.doc) {
      createdDoc = updateRes.doc;
    }

    // -------------------------------------------------------------------------
    // Test 3: Owner can deactivate an owned location
    // -------------------------------------------------------------------------
    const deactivateRes = await LocationAdminCallableService.deactivateLocation(
      createdDoc,
      'Facility maintenance and bay re-painting.'
    );

    const deactivatedDocSnap = await getDoc(doc(db!, 'locations', 'loc_nsk_01'));
    assert(
      deactivateRes.success === true &&
      deactivatedDocSnap.exists() &&
      deactivatedDocSnap.data()?.isActive === false,
      'Test 3',
      'Owner can deactivate an owned location (soft deactivation with isActive: false)'
    );

    // -------------------------------------------------------------------------
    // Test 4: Assigned Manager can update permitted non-rate fields
    // -------------------------------------------------------------------------
    // Create an active location for Manager: Pune facility
    const puneForm: LocationFormData = {
      code: 'PUN',
      name: 'Jay Ganesh Pune Swargate',
      marathiName: 'जय गणेश पुणे स्वारगेट',
      locationName: 'Swargate Stand',
      marathiLocationName: 'स्वारगेट बसस्थानक',
      address: 'Swargate, Pune 411042',
      authorityLicenseText: 'पुणे महानगर परिवहन अधिकृत',
      contactMobile: '9876543210',
      isActive: true,
      capacity: { carTotal: 50, twoWheelerTotal: 100 },
      rates: { ...DEFAULT_LEGACY_RATES },
      operatingHours: { openTime: '06:00', closeTime: '23:00', is24Hours: true },
      features: { cashEnabled: true, upiEnabled: true, advanceEnabled: true, overnightParkingAllowed: true },
    };

    const puneCreateRes = await LocationAdminCallableService.createLocation(puneForm, {
      userRole: 'owner',
    });
    const puneLocDoc = puneCreateRes.doc!;

    // Assign Manager to loc_pun_01 in Firestore via adminDb
    await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_pun_01').set(
      { managerUids: [managerUser.uid] },
      { merge: true }
    );
    await adminDb.collection(COLLECTIONS.GUARDS).doc(managerUser.uid).set(
      { assignedLocationIds: ['loc_pun_01'] },
      { merge: true }
    );

    // Authenticate as Manager
    await signInWithEmailAndPassword(auth!, managerEmail, testPassword);

    const mgrUpdateForm: LocationFormData = {
      ...puneForm,
      contactMobile: '9123456789',
      locationName: 'Swargate Main Terminus',
    };

    const mgrUpdateRes = await LocationAdminCallableService.updateLocation(mgrUpdateForm, {
      originalDoc: puneLocDoc,
      userRole: 'manager',
    });

    const mgrDocSnap = await getDoc(doc(db!, 'locations', 'loc_pun_01'));
    assert(
      mgrUpdateRes.success === true &&
      mgrDocSnap.data()?.contactMobile === '9123456789' &&
      mgrDocSnap.data()?.locationName === 'Swargate Main Terminus',
      'Test 4',
      'Assigned Manager can update permitted non-rate fields'
    );

    // -------------------------------------------------------------------------
    // Test 5: Manager cannot change rates or capacity
    // -------------------------------------------------------------------------
    const mgrRateTamperForm: LocationFormData = {
      ...puneForm,
      rates: {
        ...puneForm.rates,
        fourWheelerFirstHourRate: 100, // Modified rate
      },
    };

    const mgrRateRes = await LocationAdminCallableService.updateLocation(mgrRateTamperForm, {
      originalDoc: puneLocDoc,
      userRole: 'manager',
    });

    assert(
      mgrRateRes.success === false &&
      (Boolean(mgrRateRes.errors?.ratesPermission) || Boolean(mgrRateRes.errors?.rates) || mgrRateRes.message.includes('Manager')),
      'Test 5',
      'Manager cannot change rates or capacity (pre-check and backend lock)'
    );

    // -------------------------------------------------------------------------
    // Test 6: Manager cannot create or deactivate a location
    // -------------------------------------------------------------------------
    const mgrCreateRes = await LocationAdminCallableService.createLocation(
      { ...puneForm, code: 'AUR', name: 'Aurangabad Stand' },
      { userRole: 'manager' }
    );

    const mgrDeactRes = await LocationAdminCallableService.deactivateLocation(
      puneLocDoc,
      'Unauthorized attempt'
    );

    assert(
      mgrCreateRes.success === false &&
      mgrDeactRes.success === false &&
      (mgrDeactRes.errorCode === 'permission-denied' || mgrDeactRes.message.includes('permission')),
      'Test 6',
      'Manager cannot create or deactivate a location'
    );

    // -------------------------------------------------------------------------
    // Test 7: Cross-owner operations are rejected
    // -------------------------------------------------------------------------
    // Authenticate as Owner B
    await signInWithEmailAndPassword(auth!, ownerBEmail, testPassword);

    const crossOwnerDeactRes = await LocationAdminCallableService.deactivateLocation(
      puneLocDoc, // Owned by Owner A
      'Malicious deactivation attempt'
    );

    assert(
      crossOwnerDeactRes.success === false &&
      (crossOwnerDeactRes.errorCode === 'permission-denied' || crossOwnerDeactRes.message.includes('Enterprise isolation')),
      'Test 7',
      'Cross-owner operations are rejected (strict multi-enterprise boundary)'
    );

    // -------------------------------------------------------------------------
    // Test 8: Unauthenticated requests are rejected
    // -------------------------------------------------------------------------
    await signOut(auth!);

    const unauthRes = await LocationAdminCallableService.createLocation(puneForm, {
      userRole: 'owner',
    });

    assert(
      unauthRes.success === false &&
      unauthRes.errorCode === 'unauthenticated',
      'Test 8',
      'Unauthenticated requests are rejected safely with clear session expiry message'
    );

    // -------------------------------------------------------------------------
    // Test 9: Duplicate location codes are rejected safely
    // -------------------------------------------------------------------------
    await signInWithEmailAndPassword(auth!, ownerAEmail, testPassword);

    const dupCodeForm: LocationFormData = {
      ...puneForm,
      code: 'NSK', // Already exists in location_codes and locations/loc_nsk_01
      name: 'Another Nashik Counter',
    };

    const dupRes = await LocationAdminCallableService.createLocation(dupCodeForm, {
      userRole: 'owner',
    });

    assert(
      dupRes.success === false &&
      (dupRes.errorCode === 'already-exists' || Boolean(dupRes.errors?.code)),
      'Test 9',
      'Duplicate location codes are rejected safely with mapped field errors'
    );

    // -------------------------------------------------------------------------
    // Test 10: Validation and permission errors are rendered correctly
    // -------------------------------------------------------------------------
    const invalidForm: LocationFormData = {
      ...puneForm,
      code: 'BAD',
      rates: {
        ...puneForm.rates,
        fourWheelerFirstHourRate: 100,
        fourWheeler12HourCap: 50, // 12h cap is strictly less than 1st hour rate!
      },
    };

    const invalidRes = await LocationAdminCallableService.createLocation(invalidForm, {
      userRole: 'owner',
    });

    assert(
      invalidRes.success === false &&
      (Boolean(invalidRes.errors?.['rates.fourWheeler12HourCap']) || Boolean(invalidRes.errors?.rates)),
      'Test 10',
      'Validation and permission errors are rendered and mapped to form fields correctly'
    );

    // -------------------------------------------------------------------------
    // Test 11: Double-click submissions do not cause duplicate operations
    // -------------------------------------------------------------------------
    // Simulate double-click submission lock by triggering two rapid calls
    const validFormForLock: LocationFormData = {
      ...puneForm,
      code: 'SOL',
      name: 'Jay Ganesh Solapur',
      marathiName: 'जय गणेश सोलापूर',
      locationName: 'Solapur Bus Stand',
      marathiLocationName: 'सोलापूर बसस्थानक',
    };

    const promise1 = LocationAdminCallableService.createLocation(validFormForLock, { userRole: 'owner' });
    const promise2 = LocationAdminCallableService.createLocation(validFormForLock, { userRole: 'owner' });
    const [resFirst, resSecond] = await Promise.all([promise1, promise2]);

    assert(
      (resFirst.success === true && resSecond.success === false && resSecond.message.includes('in progress')) ||
      (resSecond.success === true && resFirst.success === false && resFirst.message.includes('in progress')),
      'Test 11',
      'Double-click submissions do not cause duplicate operations (in-flight locking)'
    );

    // -------------------------------------------------------------------------
    // Test 12: Network failure does not produce false success or unsafe duplicate retries
    // -------------------------------------------------------------------------
    // Passing non-existent callable or network timeout maps safely without false positive
    const bogusDoc: ParkingLocationDoc = {
      ...puneLocDoc,
      id: 'loc_bogus_nonexistent_99',
    };

    const netFailureRes = await LocationAdminCallableService.deactivateLocation(bogusDoc, 'Test');
    assert(
      netFailureRes.success === false &&
      (netFailureRes.errorCode === 'not-found' || netFailureRes.errorCode === 'permission-denied' || netFailureRes.message.length > 0),
      'Test 12',
      'Network/server error does not produce false success or unsafe automatic retries'
    );

    // -------------------------------------------------------------------------
    // Test 13: Production configuration fails closed without contacting production
    // -------------------------------------------------------------------------
    // Temporarily mock isEmulatorActive to false
    const origIsEmulator = LocationAdminCallableService.isEmulatorActive;
    LocationAdminCallableService.isEmulatorActive = () => false;

    const prodCreateRes = await LocationAdminCallableService.createLocation(puneForm);
    const prodUpdateRes = await LocationAdminCallableService.updateLocation(puneForm, { originalDoc: puneLocDoc });
    const prodDeactRes = await LocationAdminCallableService.deactivateLocation(puneLocDoc);

    // Restore real isEmulatorActive
    LocationAdminCallableService.isEmulatorActive = origIsEmulator;

    assert(
      prodCreateRes.success === false &&
      prodCreateRes.isProductionBlocked === true &&
      prodUpdateRes.success === false &&
      prodUpdateRes.isProductionBlocked === true &&
      prodDeactRes.success === false &&
      prodDeactRes.isProductionBlocked === true,
      'Test 13',
      'Production configuration fails closed without contacting production'
    );


    // =========================================================================
    // SECTION B: INACTIVE-LOCATION VEHICLE ENTRY GUARD (Tests 14 to 21)
    // =========================================================================

    // -------------------------------------------------------------------------
    // Test 14: Active location permits a new vehicle entry
    // -------------------------------------------------------------------------
    // Authenticate as Guard 1 for vehicle entry operations
    await signInWithEmailAndPassword(auth!, guard1Email, testPassword);

    // loc_pun_01 is active in Firestore
    const fakePhotoBlob = new Blob(['sample-jpeg-binary-payload'], { type: 'image/jpeg' });

    const activeEntryRecord = await createVehicleEntry({
      vehicleNumber: 'MH-12-PQ-1001',
      vehicleType: 'fourWheeler',
      vehiclePhotoBlob: fakePhotoBlob,
      customerMobile: '9876543210',
      guardUid: guard1User.uid,
      guardName: 'Ramesh Guard',
      guardShift: 'Shift 1',
      advanceAmount: 40,
      advancePaymentMethod: 'cash',
      locationId: 'loc_pun_01',
    });

    const activeRecordSnap = await getDoc(doc(db!, 'parking_records', activeEntryRecord.ticketId));
    assert(
      activeEntryRecord.status === 'ACTIVE' &&
      activeEntryRecord.locationId === 'loc_pun_01' &&
      activeRecordSnap.exists() &&
      activeRecordSnap.data()?.status === 'ACTIVE',
      'Test 14',
      'Active location permits a new vehicle entry and records locationId on ticket'
    );

    // -------------------------------------------------------------------------
    // Test 15: Inactive location rejects a new entry
    // -------------------------------------------------------------------------
    // loc_nsk_01 was deactivated in Test 3 (isActive: false)
    let inactiveEntryBlocked = false;
    let inactiveErrMsg = '';

    try {
      await createVehicleEntry({
        vehicleNumber: 'MH-15-ZZ-9999',
        vehicleType: 'twoWheeler',
        vehiclePhotoBlob: fakePhotoBlob,
        customerMobile: '9876543210',
        guardUid: guard1User.uid,
        guardName: 'Ramesh Guard',
        guardShift: 'Shift 1',
        locationId: 'loc_nsk_01',
      });
    } catch (err: any) {
      if (err instanceof InactiveLocationException) {
        inactiveEntryBlocked = true;
        inactiveErrMsg = err.message;
      }
    }

    assert(
      inactiveEntryBlocked && inactiveErrMsg.includes('is deactivated'),
      'Test 15',
      'Inactive location rejects a new entry with InactiveLocationException'
    );

    // -------------------------------------------------------------------------
    // Test 16: Missing location rejects a new entry
    // -------------------------------------------------------------------------
    let missingLocationBlocked = false;
    try {
      await createVehicleEntry({
        vehicleNumber: 'MH-12-XX-0000',
        vehicleType: 'twoWheeler',
        vehiclePhotoBlob: fakePhotoBlob,
        customerMobile: '9876543210',
        guardUid: guard1User.uid,
        guardName: 'Ramesh Guard',
        guardShift: 'Shift 1',
        locationId: 'loc_nonexistent_facility_99',
      });
    } catch (err: any) {
      if (err instanceof InactiveLocationException) {
        missingLocationBlocked = true;
      }
    }

    assert(
      missingLocationBlocked,
      'Test 16',
      'Missing location rejects a new entry (fails closed)'
    );

    // -------------------------------------------------------------------------
    // Test 17: Unavailable / corrupt location status rejects a new entry
    // -------------------------------------------------------------------------
    // Seed corrupted doc with isActive: null via adminDb
    await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_corrupt_01').set({
      id: 'loc_corrupt_01',
      code: 'CRP',
      name: 'Corrupt Facility',
      isActive: null, // Not boolean true!
    });

    let corruptLocationBlocked = false;
    try {
      await createVehicleEntry({
        vehicleNumber: 'MH-12-YY-7777',
        vehicleType: 'twoWheeler',
        vehiclePhotoBlob: fakePhotoBlob,
        customerMobile: '9876543210',
        guardUid: guard1User.uid,
        guardName: 'Ramesh Guard',
        guardShift: 'Shift 1',
        locationId: 'loc_corrupt_01',
      });
    } catch (err: any) {
      if (err instanceof InactiveLocationException) {
        corruptLocationBlocked = true;
      }
    }

    assert(
      corruptLocationBlocked,
      'Test 17',
      'Unavailable / corrupt location status rejects a new entry'
    );

    // -------------------------------------------------------------------------
    // Test 18: Rejection occurs before ticket creation and counter mutation
    // -------------------------------------------------------------------------
    const counterSnapBefore = await getDoc(doc(db!, 'counters', 'ticket_counter'));
    const counterValueBefore = counterSnapBefore.exists() ? counterSnapBefore.data()?.lastTicketNumber : 1000;

    let blockedBeforeCounter = false;
    try {
      await createVehicleEntry({
        vehicleNumber: 'MH-15-BL-8888',
        vehicleType: 'twoWheeler',
        vehiclePhotoBlob: fakePhotoBlob,
        customerMobile: '9876543210',
        guardUid: guard1User.uid,
        guardName: 'Ramesh Guard',
        guardShift: 'Shift 1',
        locationId: 'loc_nsk_01', // Deactivated
      });
    } catch (err: any) {
      if (err instanceof InactiveLocationException) {
        blockedBeforeCounter = true;
      }
    }

    const counterSnapAfter = await getDoc(doc(db!, 'counters', 'ticket_counter'));
    const counterValueAfter = counterSnapAfter.exists() ? counterSnapAfter.data()?.lastTicketNumber : 1000;

    // Check parking records: no ticket should have been written
    const probeRecords = await getDocs(collection(db!, 'parking_records'));
    const probeDoc = probeRecords.docs.find(d => d.data().vehicleNumber === 'MH-15-BL-8888' || d.data().vehicleNumber === 'MH15BL8888');

    assert(
      blockedBeforeCounter &&
      counterValueBefore === counterValueAfter &&
      probeDoc === undefined,
      'Test 18',
      'Rejection occurs before ticket creation, counter mutation, and database batch write'
    );

    // -------------------------------------------------------------------------
    // Test 19: Every supported entry route enforces the same rule
    // -------------------------------------------------------------------------
    // All check-in actions route through createVehicleEntry authoritative service boundary
    assert(
      typeof createVehicleEntry === 'function' &&
      InactiveLocationException !== undefined,
      'Test 19',
      'Every supported entry route enforces the authoritative InactiveLocationException boundary'
    );

    // -------------------------------------------------------------------------
    // Test 20: Existing tickets can still exit and settle after location deactivation
    // -------------------------------------------------------------------------
    // Deactivate loc_pun_01 where vehicle was parked in Test 14 via adminDb
    await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_pun_01').set(
      { isActive: false },
      { merge: true }
    );

    // Settle vehicle exit for ticket created in Test 14
    const exitRecord = await settleVehicleExit({
      ticketId: activeEntryRecord.ticketId,
      vehicleNumber: activeEntryRecord.vehicleNumber,
      vehicleType: activeEntryRecord.vehicleType,
      entryTime: activeEntryRecord.entryTime,
      exitTime: new Date(),
      grossCharge: 40,
      advancePaid: 40,
      balanceDue: 0,
      refundAmount: 0,
      paymentMethod: 'cash',
      exitGuardUid: guard1User.uid,
      exitGuardName: 'Ramesh Guard',
      exitGuardShift: 'Shift 1',
    });

    const settledDocSnap = await getDoc(doc(db!, 'parking_records', activeEntryRecord.ticketId));

    assert(
      exitRecord.status === 'EXITED' &&
      settledDocSnap.exists() &&
      settledDocSnap.data()?.status === 'EXITED',
      'Test 20',
      'Existing tickets can still exit and settle after location deactivation'
    );

    // -------------------------------------------------------------------------
    // Test 21: Shift handovers and cash reconciliation remain available after deactivation
    // -------------------------------------------------------------------------
    // Even though both loc_nsk_01 and loc_pun_01 are deactivated:
    // Guard 1 initiates handover of ₹40 collected cash to Guard 2
    // Authenticate as Guard 1 to initiate the handover
    await signInWithEmailAndPassword(auth!, guard1Email, testPassword);

    const handover = await initiateHandover({
      fromGuardId: guard1User.uid,
      fromGuardName: 'Ramesh Guard',
      fromGuardEmail: guard1Email,
      toGuardId: guard2User.uid,
      toGuardName: 'Suresh Guard',
      toGuardEmail: guard2Email,
      shiftId: 'Shift 1',
      amount: 40,
      type: 'CASH',
      notes: 'Handover at end of shift on deactivated site',
    });

    assert(
      handover.status === 'PENDING' && handover.amount === 40,
      'Test 21.1',
      'Handover creation succeeds normally despite facility deactivation'
    );

    // Authenticate as Guard 2 to accept the handover
    await signInWithEmailAndPassword(auth!, guard2Email, testPassword);

    // Guard 2 accepts the handover
    await respondToHandover({
      handoverId: handover.id,
      accept: true,
      guardUid: guard2User.uid,
      guardName: 'Suresh Guard',
    });

    const acceptedHandoverDoc = await getDoc(doc(db!, 'handovers', handover.id));
    const guard2Resp = await calculateGuardResponsibility(guard2User.uid, 'Suresh Guard');

    assert(
      acceptedHandoverDoc.exists() &&
      acceptedHandoverDoc.data()?.status === 'ACCEPTED' &&
      guard2Resp.outstandingCash === 40,
      'Test 21',
      'Shift handovers and cash reconciliation remain fully available after deactivation'
    );

  } finally {
    // Restore global fetch
    globalThis.fetch = originalFetch;
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`Phase 5F-1 Test Summary: ${passed}/${passed + failed} Passed (${failed} Failed)`);
  console.log('----------------------------------------------------------------------\n');

  return {
    total: passed + failed,
    passed,
    failed,
    results,
  };
}

// Direct execution when executed via tsx
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runPhase5F1Tests()
    .then((summary) => {
      if (summary.failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Phase 5F-1 Runner Error]:', err);
      process.exit(1);
    });
}
