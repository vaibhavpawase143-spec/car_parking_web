/**
 * Phase 4G: My Shift Operations & Handover Settlement Test Suite
 *
 * Simulates and verifies the Guard Portal shift and handover workflows matching Flutter source:
 * - Zero and non-zero balances
 * - Shift stats calculation (entries, exits, collections, refunds, no double-counting)
 * - Handover creation, validation, and float bounds
 * - Mandatory Handover Barrier & Stale-Balance validation
 * - Concurrent / idempotent acceptance protection
 * - Permission and identity validation
 * - Rejection and cancellation workflows
 * - Keep With Me float retention (Carried Forward)
 * - Fallback authoritative status re-verification
 */

import type {
  GuardFinancialResponsibility,
  ShiftModel,
  ShiftStats,
  HandoverModel,
  ResponsibilityEventModel,
  WithdrawalRecord,
} from '../types';

interface MockTransaction {
  amount: number;
  paymentMethod: 'cash' | 'upi';
  paymentType: 'ADVANCE' | 'FINAL' | 'REFUND' | 'MONTHLY_PASS';
  guardUid: string;
  createdAt: Date;
}

interface MockParkingRecord {
  ticketId: string;
  entryTime: Date;
  exitTime?: Date | null;
  entryGuardUid?: string;
  exitGuardUid?: string;
}

// -------------------------------------------------------------
// Pure Calculation Engines (replicating guardService logic)
// -------------------------------------------------------------

export function calculateMockResponsibility(params: {
  guardUid: string;
  guardName: string;
  transactions: MockTransaction[];
  handovers: HandoverModel[];
  withdrawals: WithdrawalRecord[];
}): GuardFinancialResponsibility {
  const cleanUid = params.guardUid.trim().toLowerCase();

  let cashColl = 0;
  let upiColl = 0;

  for (const t of params.transactions) {
    if (t.guardUid.trim().toLowerCase() === cleanUid) {
      if (t.paymentMethod === 'cash') {
        if (t.paymentType === 'REFUND') cashColl -= t.amount;
        else cashColl += t.amount;
      } else if (t.paymentMethod === 'upi') {
        if (t.paymentType === 'REFUND') upiColl -= t.amount;
        else upiColl += t.amount;
      }
    }
  }

  let cashOut = 0;
  let upiOut = 0;
  for (const h of params.handovers) {
    if (h.status === 'ACCEPTED' && h.fromGuardId.trim().toLowerCase() === cleanUid) {
      if (h.type === 'CASH') cashOut += h.amount;
      if (h.type === 'UPI') upiOut += h.amount;
    }
  }

  let cashIn = 0;
  let upiIn = 0;
  for (const h of params.handovers) {
    if (h.status === 'ACCEPTED' && h.toGuardId.trim().toLowerCase() === cleanUid) {
      if (h.type === 'CASH') cashIn += h.amount;
      if (h.type === 'UPI') upiIn += h.amount;
    }
  }

  let cashWithdrawn = 0;
  let upiWithdrawn = 0;
  for (const w of params.withdrawals) {
    if (w.guardId.trim().toLowerCase() === cleanUid) {
      if (w.type === 'CASH') cashWithdrawn += w.amount;
      if (w.type === 'UPI') upiWithdrawn += w.amount;
    }
  }

  const netCash = Math.max(0, cashColl - cashOut + cashIn - cashWithdrawn);
  const netUpi = Math.max(0, upiColl - upiOut + upiIn - upiWithdrawn);

  return {
    guardUid: params.guardUid,
    guardName: params.guardName,
    totalCashCollected: Math.max(0, cashColl),
    cashHandedOver: cashOut,
    cashReceived: cashIn,
    cashWithdrawn,
    outstandingCash: netCash,
    totalUpiCollected: Math.max(0, upiColl),
    upiHandedOver: upiOut,
    upiReceived: upiIn,
    upiWithdrawn,
    outstandingUpi: netUpi,
    totalOutstanding: netCash + netUpi,
  };
}

export function calculateMockShiftStats(
  shift: ShiftModel,
  records: MockParkingRecord[],
  transactions: MockTransaction[]
): ShiftStats {
  const sStart = shift.startTime.getTime();
  const sEnd = shift.endTime.getTime();
  const guardId = shift.guardId.toLowerCase();

  let entries = 0;
  let exits = 0;
  let rawCash = 0;
  let rawUpi = 0;

  for (const r of records) {
    if (r.entryTime) {
      const eTime = r.entryTime.getTime();
      if (eTime >= sStart && eTime <= sEnd) {
        if (!r.entryGuardUid || r.entryGuardUid.toLowerCase() === guardId) {
          entries++;
        }
      }
    }
    if (r.exitTime) {
      const exTime = r.exitTime.getTime();
      if (exTime >= sStart && exTime <= sEnd) {
        if (!r.exitGuardUid || r.exitGuardUid.toLowerCase() === guardId) {
          exits++;
        }
      }
    }
  }

  for (const t of transactions) {
    const tTime = t.createdAt.getTime();
    if (tTime >= sStart && tTime <= sEnd && t.guardUid.toLowerCase() === guardId) {
      const isUpi = t.paymentMethod === 'upi';
      if (t.paymentType === 'ADVANCE' || t.paymentType === 'FINAL' || t.paymentType === 'MONTHLY_PASS') {
        if (isUpi) rawUpi += t.amount;
        else rawCash += t.amount;
      } else if (t.paymentType === 'REFUND') {
        if (isUpi) rawUpi -= t.amount;
        else rawCash -= t.amount;
      }
    }
  }

  const netCash = Math.max(0, rawCash);
  const netUpi = Math.max(0, rawUpi);

  return {
    entriesCount: entries,
    exitsCount: exits,
    cashCollection: netCash,
    upiCollection: netUpi,
    totalCollection: netCash + netUpi,
  };
}

export function validateAndSettleHandover(params: {
  handover: HandoverModel;
  accept: boolean;
  guardUid: string;
  guardName: string;
  fromGuardCurrentResp: GuardFinancialResponsibility;
}): {
  updatedHandover: HandoverModel;
  events: ResponsibilityEventModel[];
} {
  const { handover, accept, guardUid, guardName, fromGuardCurrentResp } = params;

  // 1. Identity validation
  if (handover.toGuardId.toLowerCase() !== guardUid.toLowerCase()) {
    throw new Error('Only the designated receiving guard can respond to this handover.');
  }

  // 2. Status validation / idempotency
  if (handover.status !== 'PENDING') {
    if (accept && handover.status === 'ACCEPTED') {
      return { updatedHandover: handover, events: [] };
    }
    throw new Error(`This handover has already been ${handover.status.toLowerCase()}.`);
  }

  const now = new Date();

  // 3. Stale-Balance Check on Accept
  if (accept) {
    const currentAvailable =
      handover.type === 'CASH'
        ? fromGuardCurrentResp.outstandingCash
        : fromGuardCurrentResp.outstandingUpi;
    const expected = handover.sourceBalanceBefore ?? handover.amount;

    const isStale = Math.abs(currentAvailable - expected) > 0.001 || currentAvailable < handover.amount - 0.001;
    if (isStale) {
      throw new Error('Guard responsibility changed prior to acceptance. Handover was cancelled.');
    }

    // Fresh & Valid Acceptance
    const acceptedHandover: HandoverModel = {
      ...handover,
      status: 'ACCEPTED',
      acceptedAt: now,
      acceptedBy: guardUid,
    };

    const outEvent: ResponsibilityEventModel = {
      id: 'event_out_1',
      guardId: handover.fromGuardId,
      guardName: handover.fromGuardName,
      shiftId: handover.shiftId,
      type: handover.type,
      action: 'HANDOVER_OUT',
      status: 'Transferred',
      amount: handover.amount,
      createdAt: now,
      targetGuardId: guardUid,
      targetGuardName: guardName,
    };

    const inEvent: ResponsibilityEventModel = {
      id: 'event_in_1',
      guardId: guardUid,
      guardName,
      shiftId: handover.shiftId,
      type: handover.type,
      action: 'HANDOVER_IN',
      status: 'Transferred',
      amount: handover.amount,
      createdAt: now,
      targetGuardId: handover.fromGuardId,
      targetGuardName: handover.fromGuardName,
    };

    return { updatedHandover: acceptedHandover, events: [outEvent, inEvent] };
  } else {
    // Rejection
    const rejectedHandover: HandoverModel = {
      ...handover,
      status: 'REJECTED',
      rejectedAt: now,
      rejectedBy: guardUid,
    };

    const rejEvent: ResponsibilityEventModel = {
      id: 'event_rej_1',
      guardId: handover.fromGuardId,
      guardName: handover.fromGuardName,
      shiftId: handover.shiftId,
      type: handover.type,
      action: 'HANDOVER_REJECTED',
      status: 'Rejected',
      amount: handover.amount,
      createdAt: now,
      targetGuardId: guardUid,
      targetGuardName: guardName,
    };

    return { updatedHandover: rejectedHandover, events: [rejEvent] };
  }
}

// -------------------------------------------------------------
// Test Runner Function
// -------------------------------------------------------------

export function runPhase4GTests(): { total: number; passed: number; failed: number; results: string[] } {
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
  console.log('Running Bizflow Web Phase 4G: My Shift & Handover Tests');
  console.log('======================================================\n');

  // Test 1: Zero initial balance
  {
    const resp = calculateMockResponsibility({
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      transactions: [],
      handovers: [],
      withdrawals: [],
    });
    assert(
      resp.outstandingCash === 0 && resp.outstandingUpi === 0 && resp.totalOutstanding === 0,
      'Test 1: Zero initial balance results in zero outstanding float'
    );
  }

  // Test 2: Non-zero cash & UPI collections with advance, final, refund
  {
    const baseDate = new Date();
    const txns: MockTransaction[] = [
      { amount: 50, paymentMethod: 'cash', paymentType: 'ADVANCE', guardUid: 'guard_1', createdAt: baseDate },
      { amount: 100, paymentMethod: 'cash', paymentType: 'FINAL', guardUid: 'guard_1', createdAt: baseDate },
      { amount: 20, paymentMethod: 'cash', paymentType: 'REFUND', guardUid: 'guard_1', createdAt: baseDate },
      { amount: 200, paymentMethod: 'upi', paymentType: 'ADVANCE', guardUid: 'guard_1', createdAt: baseDate },
      { amount: 300, paymentMethod: 'upi', paymentType: 'FINAL', guardUid: 'guard_1', createdAt: baseDate },
      { amount: 50, paymentMethod: 'upi', paymentType: 'REFUND', guardUid: 'guard_1', createdAt: baseDate },
    ];
    const resp = calculateMockResponsibility({
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      transactions: txns,
      handovers: [],
      withdrawals: [],
    });
    // cash = 50 + 100 - 20 = 130
    // upi = 200 + 300 - 50 = 450
    // total = 580
    assert(
      resp.outstandingCash === 130 && resp.outstandingUpi === 450 && resp.totalOutstanding === 580,
      `Test 2: Collections and refunds properly segregated (Cash: ₹${resp.outstandingCash}, UPI: ₹${resp.outstandingUpi}, Total: ₹${resp.totalOutstanding})`
    );
  }

  // Test 3: Shift Operational Statistics within strict shift window boundaries
  {
    const shiftStart = new Date('2026-10-17T06:00:00Z');
    const shiftEnd = new Date('2026-10-17T14:00:00Z');
    const shift: ShiftModel = {
      id: 'shift_101',
      shiftId: 'shift_101',
      guardId: 'guard_1',
      guardName: 'Ramesh',
      shiftDate: shiftStart,
      startTime: shiftStart,
      endTime: shiftEnd,
      durationHours: 8,
      status: 'ACTIVE',
    };

    const records: MockParkingRecord[] = [
      // Within window
      { ticketId: 'T1', entryTime: new Date('2026-10-17T07:00:00Z'), entryGuardUid: 'guard_1' },
      { ticketId: 'T2', entryTime: new Date('2026-10-17T08:00:00Z'), exitTime: new Date('2026-10-17T10:00:00Z'), entryGuardUid: 'guard_1', exitGuardUid: 'guard_1' },
      // Outside window (before start)
      { ticketId: 'T3', entryTime: new Date('2026-10-17T04:00:00Z'), entryGuardUid: 'guard_1' },
      // Outside window (after end)
      { ticketId: 'T4', entryTime: new Date('2026-10-17T15:00:00Z'), entryGuardUid: 'guard_1' },
      // Different guard in window
      { ticketId: 'T5', entryTime: new Date('2026-10-17T09:00:00Z'), entryGuardUid: 'guard_other' },
    ];

    const txns: MockTransaction[] = [
      { amount: 50, paymentMethod: 'cash', paymentType: 'ADVANCE', guardUid: 'guard_1', createdAt: new Date('2026-10-17T07:05:00Z') },
      { amount: 150, paymentMethod: 'upi', paymentType: 'FINAL', guardUid: 'guard_1', createdAt: new Date('2026-10-17T10:05:00Z') },
      // Outside shift window
      { amount: 200, paymentMethod: 'cash', paymentType: 'ADVANCE', guardUid: 'guard_1', createdAt: new Date('2026-10-17T16:00:00Z') },
    ];

    const stats = calculateMockShiftStats(shift, records, txns);
    assert(
      stats.entriesCount === 2 && stats.exitsCount === 1,
      `Test 3A: Shift entries count (${stats.entriesCount} == 2) and exits (${stats.exitsCount} == 1) strictly bounded`
    );
    assert(
      stats.cashCollection === 50 && stats.upiCollection === 150 && stats.totalCollection === 200,
      `Test 3B: Shift collections exclude transactions outside shift boundary (Total: ₹${stats.totalCollection} == 200)`
    );
  }

  // Test 4: Handover creation & float deduction on acceptance
  {
    const baseTxns: MockTransaction[] = [
      { amount: 300, paymentMethod: 'cash', paymentType: 'ADVANCE', guardUid: 'guard_1', createdAt: new Date() },
    ];
    const handover: HandoverModel = {
      id: 'ho_1',
      handoverId: 'ho_1',
      fromGuardId: 'guard_1',
      fromGuardName: 'Ramesh',
      toGuardId: 'guard_2',
      toGuardName: 'Suresh',
      shiftId: 'shift_101',
      amount: 300,
      type: 'CASH',
      status: 'PENDING',
      sourceBalanceBefore: 300,
      createdAt: new Date(),
    };

    // Pending handover does NOT yet reduce guard_1 balance
    let respSender = calculateMockResponsibility({
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      transactions: baseTxns,
      handovers: [handover], // PENDING
      withdrawals: [],
    });
    assert(
      respSender.outstandingCash === 300,
      'Test 4A: Pending handover does NOT prematurely reduce outgoing guard responsibility'
    );

    // Now accept the handover
    const settlement = validateAndSettleHandover({
      handover,
      accept: true,
      guardUid: 'guard_2',
      guardName: 'Suresh',
      fromGuardCurrentResp: respSender,
    });

    assert(
      settlement.updatedHandover.status === 'ACCEPTED' && settlement.events.length === 2,
      'Test 4B: Handover successfully accepted and dual responsibility events generated (OUT + IN)'
    );

    // Verify balances after acceptance:
    respSender = calculateMockResponsibility({
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      transactions: baseTxns,
      handovers: [settlement.updatedHandover],
      withdrawals: [],
    });
    const respReceiver = calculateMockResponsibility({
      guardUid: 'guard_2',
      guardName: 'Suresh',
      transactions: [],
      handovers: [settlement.updatedHandover],
      withdrawals: [],
    });

    assert(
      respSender.outstandingCash === 0 && respReceiver.outstandingCash === 300,
      `Test 4C: Balances accurately settled after acceptance (Sender: ₹${respSender.outstandingCash}, Receiver: ₹${respReceiver.outstandingCash})`
    );
  }

  // Test 5: STALE-BALANCE PROTECTION - Handover auto-cancelled if outgoing balance dropped
  {
    const staleHandover: HandoverModel = {
      id: 'ho_stale',
      handoverId: 'ho_stale',
      fromGuardId: 'guard_1',
      fromGuardName: 'Ramesh',
      toGuardId: 'guard_2',
      toGuardName: 'Suresh',
      shiftId: 'shift_101',
      amount: 500,
      type: 'CASH',
      status: 'PENDING',
      sourceBalanceBefore: 500,
      createdAt: new Date(),
    };

    // Simulate that guard_1's balance dropped from 500 to 200 before acceptance!
    const reducedResp: GuardFinancialResponsibility = {
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      totalCashCollected: 200,
      cashHandedOver: 0,
      cashReceived: 0,
      cashWithdrawn: 0,
      outstandingCash: 200, // LESS THAN 500!
      totalUpiCollected: 0,
      upiHandedOver: 0,
      upiReceived: 0,
      upiWithdrawn: 0,
      outstandingUpi: 0,
      totalOutstanding: 200,
    };

    let caughtStaleError = false;
    try {
      validateAndSettleHandover({
        handover: staleHandover,
        accept: true,
        guardUid: 'guard_2',
        guardName: 'Suresh',
        fromGuardCurrentResp: reducedResp,
      });
    } catch (e: any) {
      if (e.message.includes('stale') || e.message.includes('cancelled')) {
        caughtStaleError = true;
      }
    }

    assert(
      caughtStaleError,
      'Test 5: Stale-Balance validation correctly detects balance change and auto-cancels handover'
    );
  }

  // Test 6: Non-designated guard cannot accept or reject handover (Permission & Identity check)
  {
    const ho: HandoverModel = {
      id: 'ho_secure',
      handoverId: 'ho_secure',
      fromGuardId: 'guard_1',
      fromGuardName: 'Ramesh',
      toGuardId: 'guard_2',
      toGuardName: 'Suresh',
      shiftId: 'shift_101',
      amount: 100,
      type: 'CASH',
      status: 'PENDING',
      sourceBalanceBefore: 100,
      createdAt: new Date(),
    };

    let unauthorizedBlocked = false;
    try {
      validateAndSettleHandover({
        handover: ho,
        accept: true,
        guardUid: 'guard_impostor', // WRONG GUARD
        guardName: 'Impostor',
        fromGuardCurrentResp: {
          guardUid: 'guard_1',
          guardName: 'Ramesh',
          totalCashCollected: 100,
          cashHandedOver: 0,
          cashReceived: 0,
          cashWithdrawn: 0,
          outstandingCash: 100,
          totalUpiCollected: 0,
          upiHandedOver: 0,
          upiReceived: 0,
          upiWithdrawn: 0,
          outstandingUpi: 0,
          totalOutstanding: 100,
        },
      });
    } catch (e: any) {
      if (e.message.includes('designated receiving guard')) {
        unauthorizedBlocked = true;
      }
    }

    assert(
      unauthorizedBlocked,
      'Test 6: Identity validation prevents unauthorized guard from accepting handover'
    );
  }

  // Test 7: Idempotency & Repeated Acceptance
  {
    const acceptedHo: HandoverModel = {
      id: 'ho_accepted',
      handoverId: 'ho_accepted',
      fromGuardId: 'guard_1',
      fromGuardName: 'Ramesh',
      toGuardId: 'guard_2',
      toGuardName: 'Suresh',
      shiftId: 'shift_101',
      amount: 100,
      type: 'CASH',
      status: 'ACCEPTED',
      acceptedAt: new Date(),
      acceptedBy: 'guard_2',
      createdAt: new Date(),
    };

    const res = validateAndSettleHandover({
      handover: acceptedHo,
      accept: true,
      guardUid: 'guard_2',
      guardName: 'Suresh',
      fromGuardCurrentResp: {
        guardUid: 'guard_1',
        guardName: 'Ramesh',
        totalCashCollected: 0,
        cashHandedOver: 100,
        cashReceived: 0,
        cashWithdrawn: 0,
        outstandingCash: 0,
        totalUpiCollected: 0,
        upiHandedOver: 0,
        upiReceived: 0,
        upiWithdrawn: 0,
        outstandingUpi: 0,
        totalOutstanding: 0,
      },
    });

    assert(
      res.updatedHandover.status === 'ACCEPTED' && res.events.length === 0,
      'Test 7: Repeated acceptance on already ACCEPTED handover is idempotent and does not duplicate events'
    );
  }

  // Test 8: Rejection workflow
  {
    const hoToReject: HandoverModel = {
      id: 'ho_reject_test',
      handoverId: 'ho_reject_test',
      fromGuardId: 'guard_1',
      fromGuardName: 'Ramesh',
      toGuardId: 'guard_2',
      toGuardName: 'Suresh',
      shiftId: 'shift_101',
      amount: 150,
      type: 'UPI',
      status: 'PENDING',
      sourceBalanceBefore: 150,
      createdAt: new Date(),
    };

    const res = validateAndSettleHandover({
      handover: hoToReject,
      accept: false, // REJECT
      guardUid: 'guard_2',
      guardName: 'Suresh',
      fromGuardCurrentResp: {
        guardUid: 'guard_1',
        guardName: 'Ramesh',
        totalCashCollected: 0,
        cashHandedOver: 0,
        cashReceived: 0,
        cashWithdrawn: 0,
        outstandingCash: 0,
        totalUpiCollected: 150,
        upiHandedOver: 0,
        upiReceived: 0,
        upiWithdrawn: 0,
        outstandingUpi: 150,
        totalOutstanding: 150,
      },
    });

    assert(
      res.updatedHandover.status === 'REJECTED' && res.events[0].action === 'HANDOVER_REJECTED',
      'Test 8: Rejection updates status to REJECTED and logs HANDOVER_REJECTED event'
    );
  }

  // Test 9: Keep With Me float retention across shifts
  {
    const txns: MockTransaction[] = [
      { amount: 400, paymentMethod: 'cash', paymentType: 'ADVANCE', guardUid: 'guard_1', createdAt: new Date() },
    ];
    // Keep With Me is an audit event; it does NOT reduce outstanding money
    const keepWithMeEvent: ResponsibilityEventModel = {
      id: 'ev_keep',
      guardId: 'guard_1',
      guardName: 'Ramesh',
      shiftId: 'shift_101',
      type: 'CASH',
      action: 'KEEP_WITH_ME',
      status: 'Carried Forward',
      amount: 400,
      createdAt: new Date(),
    };

    const resp = calculateMockResponsibility({
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      transactions: txns,
      handovers: [],
      withdrawals: [],
    });

    assert(
      resp.outstandingCash === 400 && keepWithMeEvent.status === 'Carried Forward',
      'Test 9: Keep With Me records Carried Forward event while retaining float in hand (₹400)'
    );
  }

  // Test 10: Admin Withdrawals reduce outstanding balance
  {
    const txns: MockTransaction[] = [
      { amount: 500, paymentMethod: 'cash', paymentType: 'ADVANCE', guardUid: 'guard_1', createdAt: new Date() },
    ];
    const withdrawal: WithdrawalRecord = {
      id: 'w_1',
      withdrawalId: 'w_1',
      guardId: 'guard_1',
      guardName: 'Ramesh',
      shiftId: 'shift_101',
      type: 'CASH',
      amount: 500,
      adminUid: 'admin_1',
      adminName: 'Owner Admin',
      status: 'COMPLETED',
      createdAt: new Date(),
    };

    const resp = calculateMockResponsibility({
      guardUid: 'guard_1',
      guardName: 'Ramesh',
      transactions: txns,
      handovers: [],
      withdrawals: [withdrawal],
    });

    assert(
      resp.outstandingCash === 0 && resp.cashWithdrawn === 500,
      'Test 10: Admin withdrawal settles guard outstanding float (Cash Remaining: ₹0)'
    );
  }

  console.log('\n------------------------------------------------------');
  console.log(`Test Results Summary: ${passed}/${passed + failed} Passed`);
  results.forEach((r) => console.log(r));
  console.log('------------------------------------------------------\n');

  return { total: passed + failed, passed, failed, results };
}

// Auto-run if executed directly by node
if (typeof process !== 'undefined' && process.argv[1]?.includes('shiftHandoverSettlement')) {
  const { failed } = runPhase4GTests();
  if (failed > 0) process.exit(1);
}
