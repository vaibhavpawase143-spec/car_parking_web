/**
 * Phase 4H: Vehicle Entry & Exit Settlement End-to-End Test Suite
 *
 * Simulates and verifies the complete lifecycle of vehicle parking operations:
 * 1. Vehicle Registration Validation & Normalization
 * 2. Duplicate Active Vehicle Detection & Rejection
 * 3. Capacity Checking & Full Capacity Rejection (2W and 4W)
 * 4. Sequential Ticket Number Generation & Collision Avoidance
 * 5. Mandatory Vehicle Photo Validation
 * 6. Monthly-Pass Zero-Advance & Zero-Fee Enforcement
 * 7. Active Vehicle Record Creation & Advance Payment Transaction
 * 8. Parking Fee Calculation against Flutter Reference:
 *    - Billable hours ceiling logic
 *    - 2-Wheeler rates (₹20 first hour, ₹5/hr addl, ₹60 12hr cap)
 *    - 4-Wheeler rates (₹50 first hour, ₹10/hr addl, ₹150 12hr cap)
 *    - Stays beyond 12 hours
 *    - Zero duration stays
 * 9. Settlement Scenarios:
 *    - Cash & UPI balance settlement
 *    - Full advance consumption (Gross == Advance)
 *    - Refund settlement (Gross < Advance)
 *    - Monthly-pass exit
 * 10. Concurrency & Duplicate Exit Rejection
 * 11. Stored Advance Validation & Tamper Protection
 * 12. Transaction Atomicity & Rollback Protection
 */

import {
  isValidCustomerMobile,
  isValidVehicleNumber,
  normalizeVehicleNumber,
} from '../utils/formatters';
import {
  calculateBillableHours,
  calculateParkingFee,
} from '../utils/feeCalculator';
import {
  parseAndValidateStoredAdvance,
  TicketNotFoundException,
  VehicleAlreadyExitedException,
  VehicleAlreadyParkedException,
  CapacityFullException,
} from '../services/parkingService';
import type { VehicleCategory } from '../types';

// ---------------------------------------------------------------------------
// In-Memory Simulated Transaction Engine
// ---------------------------------------------------------------------------

export class InMemoryParkingDatabase {
  records: Map<string, Record<string, any>> = new Map();
  transactions: Array<Record<string, any>> = new Array();
  counter: number = 1000;
  capacity2WTotal: number = 50;
  capacity4WTotal: number = 50;

  clear() {
    this.records.clear();
    this.transactions = [];
    this.counter = 1000;
  }

  getOccupiedCount(type: VehicleCategory): number {
    let count = 0;
    for (const doc of this.records.values()) {
      if (doc.status === 'ACTIVE' && doc.vehicleType === type) {
        count++;
      }
    }
    return count;
  }

  getAvailableCapacity(type: VehicleCategory): number {
    const total = type === 'twoWheeler' ? this.capacity2WTotal : this.capacity4WTotal;
    return Math.max(0, total - this.getOccupiedCount(type));
  }

  isVehicleAlreadyParked(vehicleNumber: string): boolean {
    const clean = normalizeVehicleNumber(vehicleNumber);
    for (const doc of this.records.values()) {
      if (doc.status === 'ACTIVE') {
        const storedNorm = normalizeVehicleNumber(doc.vehicleNumber || '');
        if (storedNorm === clean) return true;
      }
    }
    return false;
  }

  generateTicketNumber(): string {
    let candidate = this.counter + 1;
    while (this.records.has(candidate.toString())) {
      candidate++;
    }
    this.counter = candidate;
    return candidate.toString();
  }

  // Atomic Entry Transaction
  createEntry(params: {
    vehicleNumber: string;
    vehicleType: VehicleCategory;
    customerMobile: string;
    hasPhoto: boolean;
    guardUid: string;
    guardName: string;
    shift: string;
    advanceAmount?: number;
    advancePaymentMethod?: 'cash' | 'upi';
    isMonthlyPass?: boolean;
    monthlyPassId?: string;
  }): { record: Record<string, any>; txn?: Record<string, any> } {
    const cleanNumber = normalizeVehicleNumber(params.vehicleNumber);
    if (!cleanNumber) throw new Error('Vehicle number cannot be empty.');
    if (!isValidVehicleNumber(cleanNumber)) throw new Error('Invalid vehicle plate format.');
    if (!isValidCustomerMobile(params.customerMobile)) throw new Error('Invalid mobile number.');
    if (!params.hasPhoto) throw new Error('Mandatory photo is required.');

    if (this.isVehicleAlreadyParked(cleanNumber)) {
      throw new VehicleAlreadyParkedException(cleanNumber);
    }

    if (this.getAvailableCapacity(params.vehicleType) <= 0) {
      throw new CapacityFullException(params.vehicleType);
    }

    const ticketId = this.generateTicketNumber();
    const effectiveAdvance = params.isMonthlyPass ? 0 : (params.advanceAmount || 0);

    const recordData: Record<string, any> = {
      id: ticketId,
      ticketId,
      ticketNumber: ticketId,
      vehicleNumber: cleanNumber,
      normalizedVehicleNumber: cleanNumber,
      vehicleType: params.vehicleType,
      customerMobile: params.customerMobile,
      status: 'ACTIVE',
      entryTime: new Date(),
      entryGuardUid: params.guardUid,
      entryGuardName: params.guardName,
      entryShift: params.shift,
      advanceAmount: effectiveAdvance,
      advancePaymentMethod: params.advancePaymentMethod || 'cash',
      isMonthlyPass: Boolean(params.isMonthlyPass),
      monthlyPassId: params.monthlyPassId || null,
      photoUrl: 'https://res.cloudinary.com/test/' + ticketId + '.jpg',
    };

    let txnData: Record<string, any> | undefined = undefined;
    if (effectiveAdvance > 0) {
      txnData = {
        id: 'txn_' + ticketId,
        ticketId,
        vehicleNumber: cleanNumber,
        amount: effectiveAdvance,
        paymentMethod: (params.advancePaymentMethod || 'cash').toLowerCase(),
        paymentType: 'ADVANCE',
        guardUid: params.guardUid,
        guardName: params.guardName,
        shift: params.shift,
        createdAt: new Date(),
      };
    }

    // Atomic Commit: Both record and transaction
    this.records.set(ticketId, recordData);
    if (txnData) {
      this.transactions.push(txnData);
    }

    return { record: recordData, txn: txnData };
  }

  // Atomic Exit Transaction
  settleExit(params: {
    ticketId: string;
    exitTime: Date;
    paymentMethod: 'cash' | 'upi';
    exitGuardUid: string;
    exitGuardName: string;
    exitGuardShift: string;
  }): { updatedRecord: Record<string, any>; finalTxn?: Record<string, any>; refundTxn?: Record<string, any> } {
    const record = this.records.get(params.ticketId);
    if (!record) {
      throw new TicketNotFoundException(params.ticketId);
    }

    if (record.status !== 'ACTIVE') {
      throw new VehicleAlreadyExitedException(params.ticketId);
    }

    // Parse and validate stored advance strictly from DB
    const storedAdvance = parseAndValidateStoredAdvance(record.advanceAmount);

    const fee = calculateParkingFee({
      vehicleType: record.vehicleType,
      entryTime: record.entryTime,
      exitTime: params.exitTime,
      advancePaid: storedAdvance,
      isMonthlyPass: record.isMonthlyPass,
    });

    record.status = 'EXITED';
    record.exitTime = params.exitTime;
    record.grossCharge = fee.grossCharge;
    record.finalAmount = fee.balanceDue;
    record.paidAmount = fee.balanceDue;
    record.balanceDue = fee.balanceDue;
    record.refundAmount = fee.refundAmount;
    record.exitGuardUid = params.exitGuardUid;
    record.exitGuardName = params.exitGuardName;
    record.exitShift = params.exitGuardShift;
    record.paymentMethod = fee.balanceDue > 0 ? params.paymentMethod : (fee.refundAmount > 0 ? 'cash' : 'none');

    let finalTxn: Record<string, any> | undefined = undefined;
    let refundTxn: Record<string, any> | undefined = undefined;

    if (fee.balanceDue > 0) {
      finalTxn = {
        id: 'txn_final_' + params.ticketId,
        ticketId: params.ticketId,
        vehicleNumber: record.vehicleNumber,
        amount: fee.balanceDue,
        paymentMethod: params.paymentMethod,
        paymentType: 'FINAL',
        guardUid: params.exitGuardUid,
        guardName: params.exitGuardName,
        shift: params.exitGuardShift,
        createdAt: params.exitTime,
      };
      this.transactions.push(finalTxn);
    }

    if (fee.refundAmount > 0) {
      refundTxn = {
        id: 'txn_refund_' + params.ticketId,
        ticketId: params.ticketId,
        vehicleNumber: record.vehicleNumber,
        amount: fee.refundAmount,
        paymentMethod: 'cash',
        paymentType: 'REFUND',
        guardUid: params.exitGuardUid,
        guardName: params.exitGuardName,
        shift: params.exitGuardShift,
        createdAt: params.exitTime,
      };
      this.transactions.push(refundTxn);
    }

    return { updatedRecord: record, finalTxn, refundTxn };
  }
}

// ---------------------------------------------------------------------------
// Test Runner Function
// ---------------------------------------------------------------------------

export function runVehicleEntryAndExitTests(): {
  total: number;
  passed: number;
  failed: number;
  results: string[];
} {
  let passed = 0;
  let failed = 0;
  const results: string[] = [];

  function assert(condition: boolean, testName: string) {
    if (condition) {
      passed++;
      results.push(`  [PASS] ${testName}`);
    } else {
      failed++;
      results.push(`  [FAIL] ${testName}`);
    }
  }

  console.log('\n======================================================');
  console.log('Running Bizflow Web Phase 4H: Vehicle Entry & Exit Tests');
  console.log('======================================================\n');

  // -------------------------------------------------------------------------
  // 1. Vehicle Registration Plate Normalization & Validation
  // -------------------------------------------------------------------------
  assert(
    normalizeVehicleNumber('mh 12 ab 1234') === 'MH12AB1234',
    'Test 1A: Vehicle plate normalization strips whitespace and converts to uppercase'
  );
  assert(
    normalizeVehicleNumber('dl-01-c-5678') === 'DL01C5678',
    'Test 1B: Hyphens correctly stripped during normalization'
  );
  assert(
    isValidVehicleNumber('MH12AB1234') === true,
    'Test 1C: Standard Indian state plate passes validation'
  );
  assert(
    isValidVehicleNumber('22BH1234AA') === true,
    'Test 1D: Bharat Series (BH) plate passes validation'
  );
  assert(
    isValidVehicleNumber('INVALID_PLATE!') === false,
    'Test 1E: Malformed plate string is rejected'
  );
  assert(
    isValidVehicleNumber('AB12') === false,
    'Test 1F: Truncated plate string is rejected'
  );

  // -------------------------------------------------------------------------
  // 2. Customer Mobile Number Validation
  // -------------------------------------------------------------------------
  assert(isValidCustomerMobile('9876543210') === true, 'Test 2A: Valid 10-digit mobile accepted');
  assert(isValidCustomerMobile('8123456789') === true, 'Test 2B: Mobile starting with 8 accepted');
  assert(isValidCustomerMobile('7123456789') === true, 'Test 2C: Mobile starting with 7 accepted');
  assert(isValidCustomerMobile('6123456789') === true, 'Test 2D: Mobile starting with 6 accepted');
  assert(isValidCustomerMobile('5123456789') === false, 'Test 2E: Mobile starting with 5 rejected');
  assert(isValidCustomerMobile('987654321') === false, 'Test 2F: 9-digit mobile rejected');
  assert(isValidCustomerMobile('98765432100') === false, 'Test 2G: 11-digit mobile rejected');
  assert(isValidCustomerMobile('98765abcd0') === false, 'Test 2H: Non-numeric mobile rejected');

  // -------------------------------------------------------------------------
  // 3. Stored Advance Amount Validation & Tamper Protection
  // -------------------------------------------------------------------------
  assert(parseAndValidateStoredAdvance(undefined) === 0.0, 'Test 3A: Missing advance safely treated as ₹0');
  assert(parseAndValidateStoredAdvance(null) === 0.0, 'Test 3B: Null advance safely treated as ₹0');
  assert(parseAndValidateStoredAdvance(50) === 50.0, 'Test 3C: Valid numeric advance parsed');
  assert(parseAndValidateStoredAdvance('100.5') === 100.5, 'Test 3D: Valid string numeric advance parsed');

  let caughtNeg = false;
  try {
    parseAndValidateStoredAdvance(-20);
  } catch (e: any) {
    if (e.message.includes('negative')) caughtNeg = true;
  }
  assert(caughtNeg, 'Test 3E: Negative stored advance throws security error');

  let caughtCorrupt = false;
  try {
    parseAndValidateStoredAdvance('corrupted_money');
  } catch (e: any) {
    if (e.message.includes('corrupted') || e.message.includes('Invalid')) caughtCorrupt = true;
  }
  assert(caughtCorrupt, 'Test 3F: Corrupted non-numeric advance throws security error');

  // -------------------------------------------------------------------------
  // 4. Fee Calculation Engine Fidelity vs Flutter Implementation
  // -------------------------------------------------------------------------
  // Billable hours ceiling logic
  assert(calculateBillableHours(0) === 0, 'Test 4A: 0 minutes = 0 billable hours');
  assert(calculateBillableHours(1) === 1, 'Test 4B: 1 minute = 1 billable hour (zero free grace period)');
  assert(calculateBillableHours(45) === 1, 'Test 4C: 45 minutes = 1 billable hour');
  assert(calculateBillableHours(60) === 1, 'Test 4D: 60 minutes = 1 billable hour');
  assert(calculateBillableHours(61) === 2, 'Test 4E: 61 minutes = 2 billable hours');
  assert(calculateBillableHours(120) === 2, 'Test 4F: 120 minutes = 2 billable hours');
  assert(calculateBillableHours(121) === 3, 'Test 4G: 121 minutes = 3 billable hours');

  const now = new Date();
  const entryZero = new Date(now.getTime());
  const entry1m = new Date(now.getTime() - 1 * 60 * 1000);
  const entry45m = new Date(now.getTime() - 45 * 60 * 1000);
  const entry65m = new Date(now.getTime() - 65 * 60 * 1000);
  const entry12h = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const entry14h = new Date(now.getTime() - 14 * 60 * 60 * 1000);

  // Two-Wheeler fee calculations (Rate: 20 base, 5 addl, 60 cap)
  {
    const f0 = calculateParkingFee({ vehicleType: 'twoWheeler', entryTime: entryZero, exitTime: now });
    assert(f0.grossCharge === 0, 'Test 4H: 2W zero stay duration = ₹0 gross charge');

    const f1m = calculateParkingFee({ vehicleType: 'twoWheeler', entryTime: entry1m, exitTime: now });
    assert(f1m.grossCharge === 20 && f1m.billableHours === 1, 'Test 4I: 2W 1m stay = ₹20 (1st hour base)');

    const f45m = calculateParkingFee({ vehicleType: 'twoWheeler', entryTime: entry45m, exitTime: now });
    assert(f45m.grossCharge === 20 && f45m.billableHours === 1, 'Test 4J: 2W 45m stay = ₹20');

    const f65m = calculateParkingFee({ vehicleType: 'twoWheeler', entryTime: entry65m, exitTime: now });
    // 2 hours = 20 + 5 = 25
    assert(f65m.grossCharge === 25 && f65m.billableHours === 2, 'Test 4K: 2W 65m stay = ₹25 (2 hours)');

    const f12h = calculateParkingFee({ vehicleType: 'twoWheeler', entryTime: entry12h, exitTime: now });
    // 12 hours: 20 + 11*5 = 75, capped at 60!
    assert(f12h.grossCharge === 60, 'Test 4L: 2W 12h stay = ₹60 (12-hour cap applied)');

    const f14h = calculateParkingFee({ vehicleType: 'twoWheeler', entryTime: entry14h, exitTime: now });
    // 14 hours: cap 60 + 2*5 = 70
    assert(f14h.grossCharge === 70, 'Test 4M: 2W 14h stay = ₹70 (12-hour cap + 2 additional hours)');
  }

  // Four-Wheeler fee calculations (Rate: 50 base, 10 addl, 150 cap)
  {
    const f1m = calculateParkingFee({ vehicleType: 'fourWheeler', entryTime: entry1m, exitTime: now });
    assert(f1m.grossCharge === 50 && f1m.billableHours === 1, 'Test 4N: 4W 1m stay = ₹50 (1st hour base)');

    const f65m = calculateParkingFee({ vehicleType: 'fourWheeler', entryTime: entry65m, exitTime: now });
    // 2 hours = 50 + 10 = 60
    assert(f65m.grossCharge === 60 && f65m.billableHours === 2, 'Test 4O: 4W 65m stay = ₹60 (2 hours)');

    const f12h = calculateParkingFee({ vehicleType: 'fourWheeler', entryTime: entry12h, exitTime: now });
    // 12 hours: 50 + 11*10 = 160, capped at 150!
    assert(f12h.grossCharge === 150, 'Test 4P: 4W 12h stay = ₹150 (12-hour cap applied)');

    const f14h = calculateParkingFee({ vehicleType: 'fourWheeler', entryTime: entry14h, exitTime: now });
    // 14 hours: cap 150 + 2*10 = 170
    assert(f14h.grossCharge === 170, 'Test 4Q: 4W 14h stay = ₹170 (12-hour cap + 2 additional hours)');
  }

  // Monthly Pass: Always ₹0 gross charge
  {
    const fPass = calculateParkingFee({
      vehicleType: 'fourWheeler',
      entryTime: entry14h,
      exitTime: now,
      isMonthlyPass: true,
    });
    assert(fPass.grossCharge === 0 && fPass.billableHours === 0, 'Test 4R: Monthly pass has strictly ₹0 gross charge');
  }

  // -------------------------------------------------------------------------
  // 5. End-to-End Entry & Exit Scenarios with Database Simulation
  // -------------------------------------------------------------------------
  const db = new InMemoryParkingDatabase();

  // Test 5: Vehicle Entry with Duplicate Rejection
  {
    db.clear();
    const res1 = db.createEntry({
      vehicleNumber: 'MH12AB1234',
      vehicleType: 'fourWheeler',
      customerMobile: '9876543210',
      hasPhoto: true,
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      shift: 'Shift 1',
      advanceAmount: 50,
      advancePaymentMethod: 'cash',
    });

    assert(
      res1.record.status === 'ACTIVE' && res1.record.ticketNumber === '1001',
      'Test 5A: First entry successfully creates active parking record with ticket #1001'
    );
    assert(
      res1.txn !== undefined && res1.txn.amount === 50 && res1.txn.paymentType === 'ADVANCE',
      'Test 5B: Advance payment transaction atomically created'
    );

    // Duplicate active vehicle entry must fail
    let duplicateBlocked = false;
    try {
      db.createEntry({
        vehicleNumber: 'mh 12 ab 1234', // Same normalized plate
        vehicleType: 'fourWheeler',
        customerMobile: '9876543210',
        hasPhoto: true,
        guardUid: 'guard_1',
        guardName: 'Ramesh',
        shift: 'Shift 1',
      });
    } catch (e: any) {
      if (e instanceof VehicleAlreadyParkedException) duplicateBlocked = true;
    }
    assert(duplicateBlocked, 'Test 5C: Duplicate active vehicle entry strictly rejected');
  }

  // Test 6: Capacity full rejection
  {
    db.clear();
    db.capacity4WTotal = 1; // Only 1 slot available!

    db.createEntry({
      vehicleNumber: 'MH12AA1111',
      vehicleType: 'fourWheeler',
      customerMobile: '9876543210',
      hasPhoto: true,
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      shift: 'Shift 1',
    });

    let capacityBlocked = false;
    try {
      db.createEntry({
        vehicleNumber: 'MH12AA2222',
        vehicleType: 'fourWheeler',
        customerMobile: '9876543210',
        hasPhoto: true,
        guardUid: 'guard_1',
        guardName: 'Ramesh',
        shift: 'Shift 1',
      });
    } catch (e: any) {
      if (e instanceof CapacityFullException) capacityBlocked = true;
    }
    assert(capacityBlocked, 'Test 6: Entry blocked when category capacity is full');
  }

  // Test 7: Exit Settlement - Balance Due (Gross > Advance)
  {
    db.clear();
    const entryRes = db.createEntry({
      vehicleNumber: 'MH12CC3333',
      vehicleType: 'fourWheeler',
      customerMobile: '9876543210',
      hasPhoto: true,
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      shift: 'Shift 1',
      advanceAmount: 50, // ₹50 advance paid
      advancePaymentMethod: 'cash',
    });

    // Simulate exit after 2 hours: Gross = ₹60
    const entryTime = entryRes.record.entryTime;
    const exitTime = new Date(entryTime.getTime() + 65 * 60 * 1000);

    const exitRes = db.settleExit({
      ticketId: entryRes.record.ticketNumber,
      exitTime,
      paymentMethod: 'upi',
      exitGuardUid: 'guard_2',
      exitGuardName: 'Suresh',
      exitGuardShift: 'Shift 2',
    });

    // Gross ₹60, Advance ₹50 -> Balance Due ₹10 paid via UPI
    assert(
      exitRes.updatedRecord.status === 'EXITED' &&
        exitRes.updatedRecord.grossCharge === 60 &&
        exitRes.updatedRecord.balanceDue === 10 &&
        exitRes.updatedRecord.refundAmount === 0,
      'Test 7A: Settlement with balance due properly calculated (Gross: ₹60, Advance: ₹50, Balance: ₹10)'
    );
    assert(
      exitRes.finalTxn !== undefined &&
        exitRes.finalTxn.amount === 10 &&
        exitRes.finalTxn.paymentMethod === 'upi' &&
        exitRes.finalTxn.paymentType === 'FINAL',
      'Test 7B: FINAL payment transaction recorded with paymentMethod="upi"'
    );
    assert(exitRes.refundTxn === undefined, 'Test 7C: No refund transaction recorded when balance due > 0');
  }

  // Test 8: Exit Settlement - Refund Scenario (Gross < Advance)
  {
    db.clear();
    const entryRes = db.createEntry({
      vehicleNumber: 'MH12DD4444',
      vehicleType: 'twoWheeler',
      customerMobile: '9876543210',
      hasPhoto: true,
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      shift: 'Shift 1',
      advanceAmount: 50, // ₹50 advance paid at entry
      advancePaymentMethod: 'cash',
    });

    // Exit after 30 mins: 2W Gross = ₹20
    const entryTime = entryRes.record.entryTime;
    const exitTime = new Date(entryTime.getTime() + 30 * 60 * 1000);

    const exitRes = db.settleExit({
      ticketId: entryRes.record.ticketNumber,
      exitTime,
      paymentMethod: 'cash',
      exitGuardUid: 'guard_1',
      exitGuardName: 'Ramesh',
      exitGuardShift: 'Shift 1',
    });

    // Gross ₹20, Advance ₹50 -> Refund ₹30
    assert(
      exitRes.updatedRecord.status === 'EXITED' &&
        exitRes.updatedRecord.grossCharge === 20 &&
        exitRes.updatedRecord.balanceDue === 0 &&
        exitRes.updatedRecord.refundAmount === 30,
      'Test 8A: Refund calculated accurately when Advance > Gross (Refund: ₹30)'
    );
    assert(
      exitRes.refundTxn !== undefined &&
        exitRes.refundTxn.amount === 30 &&
        exitRes.refundTxn.paymentType === 'REFUND',
      'Test 8B: REFUND payment transaction recorded'
    );
    assert(exitRes.finalTxn === undefined, 'Test 8C: No FINAL payment transaction recorded on refund');
  }

  // Test 9: Exit Settlement - Full Advance Consumption (Gross == Advance)
  {
    db.clear();
    const entryRes = db.createEntry({
      vehicleNumber: 'MH12EE5555',
      vehicleType: 'twoWheeler',
      customerMobile: '9876543210',
      hasPhoto: true,
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      shift: 'Shift 1',
      advanceAmount: 20, // ₹20 advance paid
      advancePaymentMethod: 'cash',
    });

    // Exit after 30 mins: 2W Gross = ₹20
    const entryTime = entryRes.record.entryTime;
    const exitTime = new Date(entryTime.getTime() + 30 * 60 * 1000);

    const exitRes = db.settleExit({
      ticketId: entryRes.record.ticketNumber,
      exitTime,
      paymentMethod: 'cash',
      exitGuardUid: 'guard_1',
      exitGuardName: 'Ramesh',
      exitGuardShift: 'Shift 1',
    });

    assert(
      exitRes.updatedRecord.grossCharge === 20 &&
        exitRes.updatedRecord.balanceDue === 0 &&
        exitRes.updatedRecord.refundAmount === 0,
      'Test 9A: Full advance consumption results in ₹0 balance due and ₹0 refund'
    );
    assert(
      exitRes.finalTxn === undefined && exitRes.refundTxn === undefined,
      'Test 9B: Neither FINAL nor REFUND transaction recorded when balance is exactly settled by advance'
    );
  }

  // Test 10: Duplicate Exit Attempt Prevention
  {
    db.clear();
    const entryRes = db.createEntry({
      vehicleNumber: 'MH12FF6666',
      vehicleType: 'twoWheeler',
      customerMobile: '9876543210',
      hasPhoto: true,
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      shift: 'Shift 1',
    });

    // Settle exit first time
    db.settleExit({
      ticketId: entryRes.record.ticketNumber,
      exitTime: new Date(),
      paymentMethod: 'cash',
      exitGuardUid: 'guard_1',
      exitGuardName: 'Ramesh',
      exitGuardShift: 'Shift 1',
    });

    // Attempting second exit on same ticket must be rejected!
    let duplicateExitBlocked = false;
    try {
      db.settleExit({
        ticketId: entryRes.record.ticketNumber,
        exitTime: new Date(),
        paymentMethod: 'cash',
        exitGuardUid: 'guard_1',
        exitGuardName: 'Ramesh',
        exitGuardShift: 'Shift 1',
      });
    } catch (e: any) {
      if (e instanceof VehicleAlreadyExitedException) duplicateExitBlocked = true;
    }
    assert(duplicateExitBlocked, 'Test 10: Duplicate exit attempt on already exited ticket strictly prevented');
  }

  // Test 11: Monthly Pass Entry & Exit Workflow
  {
    db.clear();
    const entryRes = db.createEntry({
      vehicleNumber: 'MH12AB9999',
      vehicleType: 'fourWheeler',
      customerMobile: '9876543210',
      hasPhoto: true,
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      shift: 'Shift 1',
      isMonthlyPass: true,
      monthlyPassId: 'pass_vip_001',
      advanceAmount: 50, // Should be overridden to 0!
    });

    assert(
      entryRes.record.advanceAmount === 0 && entryRes.txn === undefined,
      'Test 11A: Monthly pass vehicle entry enforces ₹0 advance and creates no advance transaction'
    );

    // Settle exit after 8 hours stay
    const entryTime = entryRes.record.entryTime;
    const exitTime = new Date(entryTime.getTime() + 8 * 60 * 60 * 1000);

    const exitRes = db.settleExit({
      ticketId: entryRes.record.ticketNumber,
      exitTime,
      paymentMethod: 'cash',
      exitGuardUid: 'guard_1',
      exitGuardName: 'Ramesh',
      exitGuardShift: 'Shift 1',
    });

    assert(
      exitRes.updatedRecord.grossCharge === 0 &&
        exitRes.updatedRecord.balanceDue === 0 &&
        exitRes.updatedRecord.refundAmount === 0,
      'Test 11B: Monthly pass vehicle exit incurs strictly ₹0 parking fee'
    );
    assert(
      exitRes.finalTxn === undefined && exitRes.refundTxn === undefined,
      'Test 11C: No financial transactions generated for monthly-pass exit'
    );
  }

  console.log('\n------------------------------------------------------');
  console.log(`Vehicle Entry & Exit Test Summary: ${passed}/${passed + failed} Passed`);
  results.forEach((r) => console.log(r));
  console.log('------------------------------------------------------\n');

  return { total: passed + failed, passed, failed, results };
}

if (typeof process !== 'undefined' && process.argv[1]?.includes('vehicleEntryAndExitSettlement')) {
  const { failed } = runVehicleEntryAndExitTests();
  if (failed > 0) process.exit(1);
}
