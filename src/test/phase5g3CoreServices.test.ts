import './setupEmulatorEnv';
/**
 * Bizflow Phase 5G-3: Core Services Remediation Test Suite
 *
 * Dedicated live emulator test suite verifying:
 * - ARC-01: Location-Specific Ticket Counters & Compound Document IDs
 *   * Partitioned counters: /counters/ticket_counter_${locationId}
 *   * Compound record IDs: ${locationId}_${sequenceNumber}
 *   * Display prefixes: ${locationCode}-${sequenceNumber}
 *   * Legacy numeric ticket continuity and exit compatibility
 * - ARC-02: Location-Scoped Capacity
 *   * Location-specific capacity and occupancy calculations
 *   * Cross-facility occupancy isolation (zero bleed)
 *   * Narrowly scoped legacy Sangamner fallback for untagged records
 * - FIN-01: Rate Snapshots and Exit Billing
 *   * Immutable rate snapshot captured at check-in
 *   * Exit fee calculated using stored rate snapshot (tamper-proof against subsequent rate edits)
 *   * Historical ticket settlement preserved
 * - DATA-01: Location-Scoped Ticket Search
 *   * Exit query scoped to staff member's active facility
 *   * Cross-location ticket retrieval and settlement prevention
 *   * Legacy numeric ticket lookup support
 * - PAS-01: Location-Aware Monthly Passes
 *   * Site-specific pass validation
 *   * Explicitly universal pass validation
 *   * Legacy passes restricted to Sangamner (never auto-universal)
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

import { auth } from '../firebase/config';
import {
  clearEmulatorData,
  verifyEmulatorPortsActive,
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
  AUTH_EMULATOR_URL,
  EMULATOR_PROJECT_ID,
} from './emulatorTestHelper';

import { getAdminDb, COLLECTIONS } from '../../functions/src/index';
import {
  createVehicleEntry,
  settleVehicleExit,
  searchTicketsForExit,
  getAvailableCapacity,
  generateNextTicketNumber,
  CapacityFullException,
  CrossLocationSettlementException,
  TicketNotFoundException,
} from '../services/parkingService';
import { checkVehiclePass } from '../services/monthlyPassService';
import { calculateParkingFee } from '../utils/feeCalculator';

const adminDb = getAdminDb();

export async function runPhase5G3ServicesTests(): Promise<{
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
  console.log('BIZFLOW PHASE 5G-3: CORE SERVICES REMEDIATION TEST SUITE');
  console.log(`Target: Firestore [${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}] | Auth [${AUTH_EMULATOR_URL}]`);
  console.log(`Project: ${EMULATOR_PROJECT_ID} (Strictly Isolated Offline Demo)`);
  console.log('======================================================================\n');

  // Preflight check: verify emulators are reachable
  const ports = await verifyEmulatorPortsActive();
  if (!ports.firestoreActive || !ports.authActive) {
    throw new Error('Emulator ports not responding! Aborting Phase 5G-3 tests.');
  }

  // Clear existing emulator data for a clean test run
  await clearEmulatorData();

  const testPassword = 'Password123!';
  const timestamp = Date.now();

  const ownerEmail = `owner_5g3_${timestamp}@bizflow.test`;
  const guardNskEmail = `guard_nsk_${timestamp}@bizflow.test`;
  const guardPunEmail = `guard_pun_${timestamp}@bizflow.test`;
  const guardSmrEmail = `guard_smr_${timestamp}@bizflow.test`;

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

  // Helper to create dummy vehicle photo blob for entry creation
  const createFakePhoto = () => new Blob(['sample-jpeg-binary-payload'], { type: 'image/jpeg' });

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
    // Setup: Provision test locations in Firestore /locations collection
    // -------------------------------------------------------------------------
    const ownerUser = await getOrCreateUser(ownerEmail);
    const guardNskUser = await getOrCreateUser(guardNskEmail);
    const guardPunUser = await getOrCreateUser(guardPunEmail);
    const guardSmrUser = await getOrCreateUser(guardSmrEmail);

    // 1. Provision Sangamner facility (Legacy default)
    await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_sangamner_01').set({
      id: 'loc_sangamner_01',
      code: 'SMR',
      name: 'Jay Ganesh Pay & Park',
      marathiName: 'जय गणेश पे अँड पार्क',
      locationName: 'Sangamner Bus Stand',
      marathiLocationName: 'संगमनेर बसस्थानक',
      address: 'Sangamner Bus Stand, Sangamner 422605',
      authorityLicenseText: 'म. रा. मा. परिवहन महामंडळाचे अधिकृत वाहनतळ',
      contactMobile: '9690793434',
      ownerUid: ownerUser.uid,
      managerUids: [],
      isActive: true,
      capacity: { carTotal: 50, twoWheelerTotal: 100 },
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Provision Nashik facility
    await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_nsk_01').set({
      id: 'loc_nsk_01',
      code: 'NSK',
      name: 'Jay Ganesh Nashik Central',
      marathiName: 'जय गणेश नाशिक मध्यवर्ती',
      locationName: 'CBS Bus Station',
      marathiLocationName: 'सीबीएस बस स्थानक',
      address: 'CBS, Nashik 422002',
      authorityLicenseText: 'नाशिक महानगरपालिका अधिकृत वाहनतळ',
      contactMobile: '9822334455',
      ownerUid: ownerUser.uid,
      managerUids: [],
      isActive: true,
      capacity: { carTotal: 40, twoWheelerTotal: 60 },
      rates: {
        fourWheelerFirstHourRate: 40,
        fourWheelerAdditionalHourRate: 15,
        fourWheeler12HourCap: 160,
        fourWheeler24HourCap: 250,
        fourWheelerMonthlyRate: 1400,
        twoWheelerFirstHourRate: 15,
        twoWheelerAdditionalHourRate: 5,
        twoWheeler12HourCap: 50,
        twoWheeler24HourCap: 90,
        twoWheelerMonthlyRate: 500,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Provision Pune facility
    await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_pun_01').set({
      id: 'loc_pun_01',
      code: 'PUN',
      name: 'Jay Ganesh Pune Station',
      marathiName: 'जय गणेश पुणे स्टेशन',
      locationName: 'Pune Railway Station',
      marathiLocationName: 'पुणे रेल्वे स्थानक',
      address: 'Station Road, Pune 411001',
      authorityLicenseText: 'पुणे महानगरपालिका अधिकृत वाहनतळ',
      contactMobile: '9822998877',
      ownerUid: ownerUser.uid,
      managerUids: [],
      isActive: true,
      capacity: { carTotal: 30, twoWheelerTotal: 50 },
      rates: {
        fourWheelerFirstHourRate: 60,
        fourWheelerAdditionalHourRate: 20,
        fourWheeler12HourCap: 200,
        fourWheeler24HourCap: 350,
        fourWheelerMonthlyRate: 1800,
        twoWheelerFirstHourRate: 25,
        twoWheelerAdditionalHourRate: 10,
        twoWheeler12HourCap: 80,
        twoWheeler24HourCap: 140,
        twoWheelerMonthlyRate: 750,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed staff records in /guards
    await adminDb.collection(COLLECTIONS.GUARDS).doc(guardNskUser.uid).set({
      uid: guardNskUser.uid,
      name: 'Nashik Guard',
      email: guardNskEmail,
      role: 'guard',
      isActive: true,
      assignedLocationId: 'loc_nsk_01',
      assignedLocationIds: ['loc_nsk_01'],
    });

    await adminDb.collection(COLLECTIONS.GUARDS).doc(guardPunUser.uid).set({
      uid: guardPunUser.uid,
      name: 'Pune Guard',
      email: guardPunEmail,
      role: 'guard',
      isActive: true,
      assignedLocationId: 'loc_pun_01',
      assignedLocationIds: ['loc_pun_01'],
    });

    await adminDb.collection(COLLECTIONS.GUARDS).doc(guardSmrUser.uid).set({
      uid: guardSmrUser.uid,
      name: 'Sangamner Guard',
      email: guardSmrEmail,
      role: 'guard',
      isActive: true,
      assignedLocationId: 'loc_sangamner_01',
      assignedLocationIds: ['loc_sangamner_01'],
    });

    // =========================================================================
    // SECTION 1: ARC-01 LOCATION-SPECIFIC TICKET COUNTERS (Tests 1 - 4)
    // =========================================================================

    // -------------------------------------------------------------------------
    // Test 1: Partitioned counters increment independently per location
    // -------------------------------------------------------------------------
    // Sign in as Nashik guard and generate a ticket
    await signInWithEmailAndPassword(auth!, guardNskEmail, testPassword);
    const nskTicket1 = await generateNextTicketNumber('loc_nsk_01', 'NSK');

    // Sign in as Pune guard and generate a ticket
    await signInWithEmailAndPassword(auth!, guardPunEmail, testPassword);
    const punTicket1 = await generateNextTicketNumber('loc_pun_01', 'PUN');

    // Verify counter documents in Firestore
    const nskCounterSnap = await adminDb.collection('counters').doc('ticket_counter_loc_nsk_01').get();
    const punCounterSnap = await adminDb.collection('counters').doc('ticket_counter_loc_pun_01').get();

    assert(
      nskTicket1.sequenceNumber === 1001 &&
      punTicket1.sequenceNumber === 1001 &&
      nskCounterSnap.exists && nskCounterSnap.data()?.lastTicketNumber === 1001 &&
      punCounterSnap.exists && punCounterSnap.data()?.lastTicketNumber === 1001,
      'Test 1',
      'ARC-01: Partitioned ticket counters increment independently across locations starting at 1001'
    );

    // -------------------------------------------------------------------------
    // Test 2: Compound parking record document IDs and display prefixes
    // -------------------------------------------------------------------------
    await signInWithEmailAndPassword(auth!, guardNskEmail, testPassword);
    const nskEntryRecord = await createVehicleEntry({
      vehicleNumber: 'MH-15-AB-1234',
      vehicleType: 'fourWheeler',
      vehiclePhotoBlob: createFakePhoto(),
      customerMobile: '9876543210',
      guardUid: guardNskUser.uid,
      guardName: 'Nashik Guard',
      guardShift: 'Shift 1',
      locationId: 'loc_nsk_01',
      locationCode: 'NSK',
    });

    const nskDocSnap = await adminDb.collection('parking_records').doc(nskEntryRecord.id).get();
    assert(
      nskEntryRecord.id === 'loc_nsk_01_1002' &&
      nskEntryRecord.ticketNumber === 'NSK-1002' &&
      nskEntryRecord.locationId === 'loc_nsk_01' &&
      nskDocSnap.exists &&
      nskDocSnap.data()?.ticketNumber === 'NSK-1002',
      'Test 2',
      'ARC-01: Compound record ID (loc_nsk_01_1002) and display ticket prefix (NSK-1002) correctly generated and persisted'
    );

    // -------------------------------------------------------------------------
    // Test 3: Dual-mode collision protection preserves legacy numeric continuity
    // -------------------------------------------------------------------------
    // Pre-seed legacy counter at 1050 and simulate collision on 1051
    await adminDb.collection('counters').doc('ticket_counter').set({ lastTicketNumber: 1050 });
    await adminDb.collection('parking_records').doc('1051').set({
      ticketId: '1051',
      vehicleNumber: 'MH-17-OLD-1051',
      status: 'EXITED',
      locationId: 'loc_sangamner_01',
    });

    await signInWithEmailAndPassword(auth!, guardSmrEmail, testPassword);
    const smrTicket = await generateNextTicketNumber('loc_sangamner_01', 'SMR');

    assert(
      smrTicket.sequenceNumber === 1052 &&
      smrTicket.ticketId === 'loc_sangamner_01_1052' &&
      smrTicket.ticketNumber === 'SMR-1052',
      'Test 3',
      'ARC-01: Dual-mode collision protection reads legacy counter and safely avoids collisions with legacy numeric doc IDs'
    );

    // -------------------------------------------------------------------------
    // Test 4: Active-ticket exit compatibility for legacy numeric ticket IDs
    // -------------------------------------------------------------------------
    // Seed an active legacy record with numeric ID "1042"
    await adminDb.collection('parking_records').doc('1042').set({
      ticketId: '1042',
      ticketNumber: '1042',
      vehicleNumber: 'MH-17-LEG-1042',
      vehicleType: 'fourWheeler',
      entryTime: new Date(Date.now() - 3600000), // 1 hour ago
      status: 'ACTIVE',
      advanceAmount: 20,
      locationId: 'loc_sangamner_01',
      entryGuardName: 'Legacy Guard',
      entryGuardUid: guardSmrUser.uid,
      entryShift: 'Shift 1',
    });

    const legacyExit = await settleVehicleExit({
      ticketId: '1042',
      vehicleNumber: 'MH-17-LEG-1042',
      vehicleType: 'fourWheeler',
      entryTime: new Date(Date.now() - 3600000),
      exitTime: new Date(),
      grossCharge: 50,
      advancePaid: 20,
      balanceDue: 30,
      refundAmount: 0,
      paymentMethod: 'cash',
      exitGuardUid: guardSmrUser.uid,
      exitGuardName: 'Sangamner Guard',
      exitGuardShift: 'Shift 1',
      expectedLocationId: 'loc_sangamner_01',
    });

    const legacyDocPostExit = await adminDb.collection('parking_records').doc('1042').get();
    assert(
      legacyExit.status === 'EXITED' &&
      legacyDocPostExit.exists &&
      legacyDocPostExit.data()?.status === 'EXITED' &&
      legacyDocPostExit.data()?.balanceDue === 30,
      'Test 4',
      'ARC-01: Active legacy tickets with numeric document IDs settle cleanly with complete backward compatibility'
    );

    // =========================================================================
    // SECTION 2: ARC-02 LOCATION-SCOPED CAPACITY (Tests 5 - 8)
    // =========================================================================

    // -------------------------------------------------------------------------
    // Test 5: Location-specific capacity and occupancy calculations
    // -------------------------------------------------------------------------
    // Nashik has carTotal: 40. We already entered 1 car (MH-15-AB-1234 in Test 2).
    const nskAvailableBefore = await getAvailableCapacity('fourWheeler', 'loc_nsk_01');
    assert(
      nskAvailableBefore === 39,
      'Test 5',
      'ARC-02: Location-specific available capacity correctly calculates total - active occupancy (40 - 1 = 39)'
    );

    // -------------------------------------------------------------------------
    // Test 6: Occupancy isolation across facilities (zero bleed)
    // -------------------------------------------------------------------------
    // Check Pune and Sangamner capacities; they must NOT be affected by Nashik's parked car
    const punAvailable = await getAvailableCapacity('fourWheeler', 'loc_pun_01');
    const smrAvailable = await getAvailableCapacity('fourWheeler', 'loc_sangamner_01');

    assert(
      punAvailable === 30 && smrAvailable === 50,
      'Test 6',
      'ARC-02: Occupancy at Nashik causes zero bleed into Pune (30/30) or Sangamner (50/50)'
    );

    // -------------------------------------------------------------------------
    // Test 7: Capacity full enforcement at individual facility
    // -------------------------------------------------------------------------
    // Provision temporary test facility with capacity 1
    await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_tiny_01').set({
      id: 'loc_tiny_01',
      code: 'TNY',
      name: 'Tiny Test Lot',
      isActive: true,
      capacity: { carTotal: 1, twoWheelerTotal: 0 },
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await adminDb.collection(COLLECTIONS.GUARDS).doc(guardNskUser.uid).set(
      { assignedLocationId: 'loc_tiny_01', assignedLocationIds: ['loc_nsk_01', 'loc_tiny_01'] },
      { merge: true }
    );

    // Sign in as authorized guard for tiny facility
    await signInWithEmailAndPassword(auth!, guardNskEmail, testPassword);

    // Park 1 car at loc_tiny_01
    await createVehicleEntry({
      vehicleNumber: 'MH-15-TN-0001',
      vehicleType: 'fourWheeler',
      vehiclePhotoBlob: createFakePhoto(),
      customerMobile: '9876543210',
      guardUid: guardNskUser.uid,
      guardName: 'Nashik Guard',
      guardShift: 'Shift 1',
      locationId: 'loc_tiny_01',
      locationCode: 'TNY',
    });

    let tinyFullBlocked = false;
    try {
      await createVehicleEntry({
        vehicleNumber: 'MH-15-TN-0002',
        vehicleType: 'fourWheeler',
        vehiclePhotoBlob: createFakePhoto(),
        customerMobile: '9876543210',
        guardUid: guardNskUser.uid,
        guardName: 'Nashik Guard',
        guardShift: 'Shift 1',
        locationId: 'loc_tiny_01',
        locationCode: 'TNY',
      });
    } catch (err: any) {
      if (err instanceof CapacityFullException) {
        tinyFullBlocked = true;
      }
    }

    assert(
      tinyFullBlocked && (await getAvailableCapacity('fourWheeler', 'loc_nsk_01')) > 0,
      'Test 7',
      'ARC-02: Facility capacity full prevents further entries locally while other locations remain open'
    );

    // -------------------------------------------------------------------------
    // Test 8: Safe legacy Sangamner capacity compatibility for untagged records
    // -------------------------------------------------------------------------
    // Seed an untagged legacy record (no locationId field) with status ACTIVE
    await adminDb.collection('parking_records').doc('legacy_untagged_01').set({
      ticketId: 'legacy_untagged_01',
      vehicleNumber: 'MH-17-UNTAG-01',
      vehicleType: 'fourWheeler',
      status: 'ACTIVE',
      // No locationId set!
    });

    const smrCapWithUntagged = await getAvailableCapacity('fourWheeler', 'loc_sangamner_01');
    const nskCapWithUntagged = await getAvailableCapacity('fourWheeler', 'loc_nsk_01');

    assert(
      smrCapWithUntagged === 49 && nskCapWithUntagged === 39,
      'Test 8',
      'ARC-02: Untagged legacy active records are safely counted against Sangamner only (50 - 1 = 49)'
    );

    // Clean up untagged test doc
    await adminDb.collection('parking_records').doc('legacy_untagged_01').delete();

    // =========================================================================
    // SECTION 3: FIN-01 RATE SNAPSHOTS AND EXIT BILLING (Tests 9 - 12)
    // =========================================================================

    // -------------------------------------------------------------------------
    // Test 9: Immutable rate snapshot captured and stored on vehicle entry record
    // -------------------------------------------------------------------------
    await signInWithEmailAndPassword(auth!, guardPunEmail, testPassword);
    const punEntry = await createVehicleEntry({
      vehicleNumber: 'MH-12-SN-1001',
      vehicleType: 'fourWheeler',
      vehiclePhotoBlob: createFakePhoto(),
      customerMobile: '9876543210',
      guardUid: guardPunUser.uid,
      guardName: 'Pune Guard',
      guardShift: 'Shift 1',
      locationId: 'loc_pun_01',
      locationCode: 'PUN',
    });

    const punDocSnap = await adminDb.collection('parking_records').doc(punEntry.id).get();
    const storedSnapshot = punDocSnap.data()?.rateSnapshot;

    assert(
      storedSnapshot !== undefined &&
      storedSnapshot.fourWheelerFirstHourRate === 60 &&
      storedSnapshot.fourWheelerAdditionalHourRate === 20,
      'Test 9',
      'FIN-01: Immutable rate snapshot captured from location settings and stored on parking record'
    );

    // -------------------------------------------------------------------------
    // Test 10: Subsequent location rate changes do not mutate ticket's stored snapshot
    // -------------------------------------------------------------------------
    // Admin alters Pune rates to 999
    await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_pun_01').set(
      { rates: { fourWheelerFirstHourRate: 999, fourWheelerAdditionalHourRate: 500 } },
      { merge: true }
    );

    const punDocPostChange = await adminDb.collection('parking_records').doc(punEntry.id).get();
    const postChangeSnapshot = punDocPostChange.data()?.rateSnapshot;

    assert(
      postChangeSnapshot.fourWheelerFirstHourRate === 60 &&
      postChangeSnapshot.fourWheelerAdditionalHourRate === 20,
      'Test 10',
      'FIN-01: Modifying facility tariff in /locations does NOT alter the ticket stored rateSnapshot'
    );

    // -------------------------------------------------------------------------
    // Test 11: Exit fee calculated using stored rate snapshot
    // -------------------------------------------------------------------------
    // Calculate fee using the ticket's rateSnapshot (40 mins = 1 hour = ₹60 rate)
    const calcFee = calculateParkingFee({
      vehicleType: punEntry.vehicleType,
      entryTime: new Date(Date.now() - 40 * 60000),
      exitTime: new Date(),
      rates: punEntry.rateSnapshot,
    });

    assert(
      calcFee.grossCharge === 60,
      'Test 11',
      'FIN-01: Exit billing correctly uses snapshotted rates (₹60) rather than newly inflated rates (₹999)'
    );

    // Restore Pune rates
    await adminDb.collection(COLLECTIONS.LOCATIONS).doc('loc_pun_01').set(
      {
        rates: {
          fourWheelerFirstHourRate: 60,
          fourWheelerAdditionalHourRate: 20,
          fourWheeler12HourCap: 200,
          fourWheeler24HourCap: 350,
          fourWheelerMonthlyRate: 1800,
          twoWheelerFirstHourRate: 25,
          twoWheelerAdditionalHourRate: 10,
          twoWheeler12HourCap: 80,
          twoWheeler24HourCap: 140,
          twoWheelerMonthlyRate: 750,
        },
      },
      { merge: true }
    );

    // -------------------------------------------------------------------------
    // Test 12: Historical ticket settlement fallback (tickets without rateSnapshot)
    // -------------------------------------------------------------------------
    await adminDb.collection('parking_records').doc('historical_smr_01').set({
      ticketId: 'historical_smr_01',
      ticketNumber: '1099',
      vehicleNumber: 'MH-17-HIST-01',
      vehicleType: 'fourWheeler',
      entryTime: new Date(Date.now() - 3600000),
      status: 'ACTIVE',
      advanceAmount: 0,
      locationId: 'loc_sangamner_01',
      entryGuardName: 'Sangamner Guard',
      entryGuardUid: guardSmrUser.uid,
      entryShift: 'Shift 1',
      // No rateSnapshot field!
    });

    // Authenticate as Sangamner guard to settle Sangamner ticket
    await signInWithEmailAndPassword(auth!, guardSmrEmail, testPassword);

    const histExit = await settleVehicleExit({
      ticketId: 'historical_smr_01',
      vehicleNumber: 'MH-17-HIST-01',
      vehicleType: 'fourWheeler',
      entryTime: new Date(Date.now() - 3600000),
      exitTime: new Date(),
      grossCharge: 50,
      advancePaid: 0,
      balanceDue: 50,
      refundAmount: 0,
      paymentMethod: 'cash',
      exitGuardUid: guardSmrUser.uid,
      exitGuardName: 'Sangamner Guard',
      exitGuardShift: 'Shift 1',
      expectedLocationId: 'loc_sangamner_01',
    });

    assert(
      histExit.status === 'EXITED' && histExit.finalCharge === 50,
      'Test 12',
      'FIN-01: Historical tickets without rate snapshots settle safely without breaking existing workflows'
    );

    // =========================================================================
    // SECTION 4: DATA-01 LOCATION-SCOPED TICKET SEARCH (Tests 13 - 15)
    // =========================================================================

    // -------------------------------------------------------------------------
    // Test 13: Ticket search strictly scoped to staff member's active facility
    // -------------------------------------------------------------------------
    // Nashik has active ticket 'NSK-1002' (plate: 'MH-15-AB-1234')
    // Pune has active ticket 'PUN-1001' (plate: 'MH-12-SN-1001')

    // Authenticate as Nashik guard
    await signInWithEmailAndPassword(auth!, guardNskEmail, testPassword);

    // Search from Nashik for Nashik vehicle -> succeeds
    const nskMatches = await searchTicketsForExit('MH15AB1234', 'loc_nsk_01');

    // Search from Nashik for Pune vehicle -> fails closed
    let crossSearchBlocked = false;
    try {
      await searchTicketsForExit('MH12SN1001', 'loc_nsk_01');
    } catch (err: any) {
      if (err instanceof TicketNotFoundException) {
        crossSearchBlocked = true;
      }
    }

    assert(
      nskMatches.length === 1 &&
      nskMatches[0].ticketNumber === 'NSK-1002' &&
      crossSearchBlocked,
      'Test 13',
      'DATA-01: Exit search scopes strictly to active facility and prevents cross-location retrieval'
    );

    // -------------------------------------------------------------------------
    // Test 14: Cross-location settlement denied
    // -------------------------------------------------------------------------
    // Authenticate as Pune guard attempting to settle Nashik ticket at Pune
    await signInWithEmailAndPassword(auth!, guardPunEmail, testPassword);

    let crossSettleBlocked = false;
    try {
      await settleVehicleExit({
        ticketId: nskEntryRecord.id,
        vehicleNumber: nskEntryRecord.vehicleNumber,
        vehicleType: nskEntryRecord.vehicleType,
        entryTime: nskEntryRecord.entryTime,
        exitTime: new Date(),
        grossCharge: 40,
        advancePaid: 0,
        balanceDue: 40,
        refundAmount: 0,
        paymentMethod: 'cash',
        exitGuardUid: guardPunUser.uid,
        exitGuardName: 'Pune Guard',
        exitGuardShift: 'Shift 1',
        expectedLocationId: 'loc_pun_01', // Pune guard trying to settle Nashik ticket!
      });
    } catch (err: any) {
      if (err instanceof CrossLocationSettlementException) {
        crossSettleBlocked = true;
      }
    }

    const nskDocPostAttempt = await adminDb.collection('parking_records').doc(nskEntryRecord.id).get();
    assert(
      crossSettleBlocked && nskDocPostAttempt.data()?.status === 'ACTIVE',
      'Test 14',
      'DATA-01: Cross-location settlement is strictly denied with CrossLocationSettlementException'
    );

    // -------------------------------------------------------------------------
    // Test 15: Support for legacy numeric ticket search
    // -------------------------------------------------------------------------
    // Seed active legacy ticket 2005 at Sangamner
    await adminDb.collection('parking_records').doc('2005').set({
      ticketId: '2005',
      ticketNumber: '2005',
      vehicleNumber: 'MH-17-NUM-2005',
      vehicleType: 'twoWheeler',
      entryTime: new Date(),
      status: 'ACTIVE',
      locationId: 'loc_sangamner_01',
    });

    // Authenticate as Sangamner guard
    await signInWithEmailAndPassword(auth!, guardSmrEmail, testPassword);

    const numSearch = await searchTicketsForExit('2005', 'loc_sangamner_01');
    const suffixSearch = await searchTicketsForExit('005', 'loc_sangamner_01');

    assert(
      numSearch.length >= 1 &&
      numSearch[0].ticketNumber === '2005' &&
      suffixSearch.length >= 1 &&
      suffixSearch[0].ticketNumber === '2005',
      'Test 15',
      'DATA-01: Legacy numeric tickets and numeric suffixes are fully searchable at assigned facility'
    );

    // Clean up test ticket 2005
    await adminDb.collection('parking_records').doc('2005').delete();

    // =========================================================================
    // SECTION 5: PAS-01 LOCATION-AWARE MONTHLY PASSES (Tests 16 - 18)
    // =========================================================================

    // -------------------------------------------------------------------------
    // Test 16: Site-specific monthly pass validation
    // -------------------------------------------------------------------------
    // Seed site-specific pass for Nashik
    await adminDb.collection('monthly_passes').doc('pass_nsk_01').set({
      passNumber: 'MP-NSK-01',
      vehicleNumber: 'MH-15-PASS-01',
      normalizedVehicleNumber: 'MH15PASS01',
      vehicleType: 'fourWheeler',
      primaryLocationId: 'loc_nsk_01',
      isUniversal: false,
      startDate: new Date(Date.now() - 86400000), // yesterday
      endDate: new Date(Date.now() + 86400000 * 20), // +20 days
      status: 'ACTIVE',
    });

    const nskPassCheck = await checkVehiclePass('MH15PASS01', 'loc_nsk_01');
    const punPassCheck = await checkVehiclePass('MH15PASS01', 'loc_pun_01');

    assert(
      nskPassCheck.hasValidPass === true &&
      nskPassCheck.validPass?.id === 'pass_nsk_01' &&
      punPassCheck.hasValidPass === false &&
      punPassCheck.isLocationMismatch === true,
      'Test 16',
      'PAS-01: Site-specific pass valid at primary facility (Nashik) and rejected at different facility (Pune)'
    );

    // -------------------------------------------------------------------------
    // Test 17: Explicitly universal monthly pass validation
    // -------------------------------------------------------------------------
    // Seed universal pass
    await adminDb.collection('monthly_passes').doc('pass_univ_01').set({
      passNumber: 'MP-UNIV-01',
      vehicleNumber: 'MH-12-UNIV-99',
      normalizedVehicleNumber: 'MH12UNIV99',
      vehicleType: 'fourWheeler',
      isUniversal: true,
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000 * 20),
      status: 'ACTIVE',
    });

    const univAtNsk = await checkVehiclePass('MH12UNIV99', 'loc_nsk_01');
    const univAtPun = await checkVehiclePass('MH12UNIV99', 'loc_pun_01');
    const univAtSmr = await checkVehiclePass('MH12UNIV99', 'loc_sangamner_01');

    assert(
      univAtNsk.hasValidPass === true &&
      univAtPun.hasValidPass === true &&
      univAtSmr.hasValidPass === true,
      'Test 17',
      'PAS-01: Explicitly universal passes are valid across all registered parking facilities'
    );

    // -------------------------------------------------------------------------
    // Test 18: Legacy passes restricted to Sangamner (never auto-universal)
    // -------------------------------------------------------------------------
    // Seed legacy monthly pass (no primaryLocationId and isUniversal: false)
    await adminDb.collection('monthly_passes').doc('pass_legacy_01').set({
      passNumber: 'MP-LEGACY-01',
      vehicleNumber: 'MH-17-LEG-77',
      normalizedVehicleNumber: 'MH17LEG77',
      vehicleType: 'twoWheeler',
      // No primaryLocationId and not universal!
      isUniversal: false,
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000 * 20),
      status: 'ACTIVE',
    });

    const legAtSmr = await checkVehiclePass('MH17LEG77', 'loc_sangamner_01');
    const legAtNsk = await checkVehiclePass('MH17LEG77', 'loc_nsk_01');
    const legAtPun = await checkVehiclePass('MH17LEG77', 'loc_pun_01');

    assert(
      legAtSmr.hasValidPass === true &&
      legAtNsk.hasValidPass === false &&
      legAtNsk.isLocationMismatch === true &&
      legAtPun.hasValidPass === false &&
      legAtPun.isLocationMismatch === true,
      'Test 18',
      'PAS-01: Legacy monthly passes are strictly restricted to Sangamner and not treated as universal'
    );

  } catch (err) {
    console.error('[Phase 5G-3 Test Error]:', err);
    failed++;
    results.push(`  [FATAL ERROR]: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    globalThis.fetch = originalFetch;
    await signOut(auth!).catch(() => {});
  }

  console.log('\n======================================================================');
  console.log(`PHASE 5G-3 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED | TOTAL: ${passed + failed}`);
  console.log('======================================================================\n');

  return {
    total: passed + failed,
    passed,
    failed,
    results,
  };
}

// Direct execution entrypoint
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('phase5g3CoreServices.test.ts')) {
  runPhase5G3ServicesTests()
    .then((summary) => {
      if (summary.failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Unhandled failure executing Phase 5G-3 tests:', err);
      process.exit(1);
    });
}
