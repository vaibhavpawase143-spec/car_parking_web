import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  CapacityData,
  DashboardMetrics,
  GuardFinancialResponsibility,
  HandoverModel,
  ParkingRecord,
  ShiftModel,
  ShiftStats,
  ResponsibilityEventModel,
  WithdrawalRecord,
  GuardProfile,
  InitiateHandoverParams,
  RespondToHandoverParams,
  CancelHandoverParams,
  KeepWithMeParams,
} from '../types';
import { DEFAULT_SYSTEM_CONFIG, parseFirestoreDate } from './adminService';

/**
 * Service providing real-time streams and operations for Guard Operations Terminal
 * Matches Flutter's DashboardService, ShiftService, and FinancialResponsibilityService.
 */

/**
 * 1. Real-time subscription to incoming pending financial handovers addressed to the specified guard.
 * Corresponds to Flutter's:
 *   _financialService.watchPendingHandoversForGuard(widget.currentGuard.uid)
 */
export function subscribeToPendingHandovers(
  guardUid: string,
  onUpdate: (handovers: HandoverModel[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  if (!db) {
    onError(new Error('Firebase Firestore is not initialized or configured.'));
    return () => {};
  }

  const cleanUid = guardUid.trim();
  if (!cleanUid) {
    onUpdate([]);
    return () => {};
  }

  try {
    const handoversRef = collection(db, 'handovers');
    const q = query(
      handoversRef,
      where('toGuardId', '==', cleanUid),
      where('status', '==', 'PENDING')
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const handovers: HandoverModel[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const handover: HandoverModel = {
            id: docSnap.id,
            handoverId: docSnap.id,
            fromGuardId: String(data.fromGuardId || '').trim(),
            fromGuardName: String(data.fromGuardName || 'Guard').trim(),
            fromGuardEmail: data.fromGuardEmail ? String(data.fromGuardEmail) : undefined,
            toGuardId: String(data.toGuardId || '').trim(),
            toGuardName: String(data.toGuardName || 'Guard').trim(),
            toGuardEmail: data.toGuardEmail ? String(data.toGuardEmail) : undefined,
            shiftId: String(data.shiftId || data.fromShiftId || '').trim(),
            toShiftId: data.toShiftId ? String(data.toShiftId) : undefined,
            amount: typeof data.amount === 'number' ? data.amount : Number(data.amount) || 0,
            type: String(data.type || 'CASH').toUpperCase().trim() === 'UPI' ? 'UPI' : 'CASH',
            action: String(data.action || 'HANDOVER').trim(),
            status: (String(data.status || 'PENDING').toUpperCase().trim() as HandoverModel['status']),
            sourceBalanceBefore: typeof data.sourceBalanceBefore === 'number' ? data.sourceBalanceBefore : undefined,
            acceptedAt: data.acceptedAt ? parseFirestoreDate(data.acceptedAt) : null,
            acceptedBy: data.acceptedBy ? String(data.acceptedBy) : null,
            rejectedAt: data.rejectedAt ? parseFirestoreDate(data.rejectedAt) : null,
            rejectedBy: data.rejectedBy ? String(data.rejectedBy) : null,
            cancelledAt: data.cancelledAt ? parseFirestoreDate(data.cancelledAt) : null,
            notes: data.notes ? String(data.notes) : null,
            createdAt: parseFirestoreDate(data.createdAt),
          };

          if (handover.status === 'PENDING' && handover.toGuardId.toLowerCase() === cleanUid.toLowerCase()) {
            handovers.push(handover);
          }
        });

        handovers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        onUpdate(handovers);
      },
      (err) => {
        console.error('[guardService] Error listening to pending handovers:', err);
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    );
  } catch (err) {
    console.error('[guardService] Failed to initialize pending handovers query:', err);
    onError(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }
}

/**
 * 2. Real-time stream of Parking Capacity (2W and 4W)
 * Matches Flutter's DashboardService.watchCapacity():
 * - Settings from /settings/system_config
 * - Occupancy from /parking_records where status == 'ACTIVE'
 * - Prevents negative available slots with Math.max(0, ...)
 */
export function subscribeToLiveCapacity(
  onUpdate: (capacity: CapacityData) => void,
  onError: (error: Error) => void
): Unsubscribe {
  if (!db) {
    onError(new Error('Firebase Firestore is not initialized.'));
    return () => {};
  }

  let carCap = DEFAULT_SYSTEM_CONFIG.carTotalCapacity;
  let bikeCap = DEFAULT_SYSTEM_CONFIG.twoWheelerTotalCapacity;
  let carOccupied = 0;
  let bikeOccupied = 0;

  const emit = () => {
    onUpdate({
      carTotal: carCap,
      carOccupied,
      twoWheelerTotal: bikeCap,
      twoWheelerOccupied: bikeOccupied,
      carAvailable: Math.max(0, carCap - carOccupied),
      twoWheelerAvailable: Math.max(0, bikeCap - bikeOccupied),
    });
  };

  emit();

  let settingsUnsub: Unsubscribe = () => {};
  let recordsUnsub: Unsubscribe = () => {};

  try {
    const configDocRef = doc(db, 'settings', 'system_config');
    settingsUnsub = onSnapshot(
      configDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          if (typeof d.carTotalCapacity === 'number') carCap = d.carTotalCapacity;
          if (typeof d.twoWheelerTotalCapacity === 'number') bikeCap = d.twoWheelerTotalCapacity;
          emit();
        }
      },
      (err) => {
        console.warn('[guardService] Capacity settings warning:', err);
      }
    );

    const activeQuery = query(
      collection(db, 'parking_records'),
      where('status', '==', 'ACTIVE')
    );

    recordsUnsub = onSnapshot(
      activeQuery,
      (snapshot) => {
        let cars = 0;
        let bikes = 0;

        snapshot.forEach((d) => {
          const data = d.data();
          const type = String(data.vehicleType || '').toLowerCase();
          if (type.includes('two') || type === '2w' || type === 'twowheeler') {
            bikes++;
          } else {
            cars++;
          }
        });

        carOccupied = cars;
        bikeOccupied = bikes;
        emit();
      },
      (err) => {
        console.error('[guardService] Error listening to active parking capacity:', err);
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    );
  } catch (err) {
    console.error('[guardService] Failed to initialize capacity listeners:', err);
    onError(err instanceof Error ? err : new Error(String(err)));
  }

  return () => {
    settingsUnsub();
    recordsUnsub();
  };
}

/**
 * 3. Real-time stream of Today's Operational Metrics scoped to a specific guard.
 * Matches Flutter's DashboardService.watchGuardTodayMetrics(guardUid, guardName).
 */
export function subscribeToGuardTodayMetrics(
  guardUid: string,
  guardName: string | undefined,
  onUpdate: (metrics: DashboardMetrics) => void,
  onError: (error: Error) => void
): Unsubscribe {
  if (!db) {
    onError(new Error('Firebase Firestore is not initialized.'));
    return () => {};
  }

  const cleanUid = guardUid.trim();
  const cleanName = (guardName || '').trim().toLowerCase();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  let entriesCount = 0;
  let exitsCount = 0;
  let rawCash = 0;
  let rawUpi = 0;

  const emit = () => {
    const netCash = Math.max(0, rawCash);
    const netUpi = Math.max(0, rawUpi);
    onUpdate({
      todayEntries: entriesCount,
      todayExits: exitsCount,
      activeParked: 0,
      cashCollection: netCash,
      upiCollection: netUpi,
      todayCollection: Math.max(0, netCash + netUpi),
    });
  };

  emit();

  let entriesUnsub: Unsubscribe = () => {};
  let exitsUnsub: Unsubscribe = () => {};
  let txnsUnsub: Unsubscribe = () => {};

  try {
    const recordsRef = collection(db, 'parking_records');

    // 1. Today Entries
    const entriesQuery = query(
      recordsRef,
      where('entryTime', '>=', todayStart)
    );
    entriesUnsub = onSnapshot(
      entriesQuery,
      (snap) => {
        entriesCount = snap.docs.length;
        emit();
      },
      (err) => {
        console.error('[guardService] Error listening to today entries:', err);
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    );

    // 2. Today Exits
    const exitsQuery = query(
      recordsRef,
      where('exitTime', '>=', todayStart)
    );
    exitsUnsub = onSnapshot(
      exitsQuery,
      (snap) => {
        exitsCount = snap.docs.length;
        emit();
      },
      (err) => {
        console.error('[guardService] Error listening to today exits:', err);
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    );

    // 3. Today Transactions strictly filtered by Guard
    const txnsQuery = query(
      collection(db, 'payment_transactions'),
      where('createdAt', '>=', todayStart)
    );
    txnsUnsub = onSnapshot(
      txnsQuery,
      (snap) => {
        let c = 0;
        let u = 0;

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const docGuardUid = String(data.guardUid || data.collectorGuardUid || '').trim();
          const docGuardName = String(data.guardName || '').trim().toLowerCase();

          if (cleanUid) {
            if (docGuardUid) {
              if (docGuardUid !== cleanUid) return;
            } else if (cleanName && docGuardName === cleanName) {
              // fallback match
            } else {
              return;
            }
          } else if (cleanName) {
            if (docGuardName !== cleanName) return;
          }

          const amount = typeof data.amount === 'number' ? data.amount : Number(data.amount) || 0;
          const pType = String(data.paymentType || '').toUpperCase().trim();
          const method = String(data.paymentMethod || 'cash').toLowerCase().trim();
          const isUpi = method === 'upi';

          if (pType === 'ADVANCE' || pType === 'FINAL' || pType === 'MONTHLY_PASS') {
            if (isUpi) u += amount;
            else c += amount;
          } else if (pType === 'REFUND') {
            if (isUpi) u -= amount;
            else c -= amount;
          }
        });

        rawCash = c;
        rawUpi = u;
        emit();
      },
      (err) => {
        console.error('[guardService] Error listening to guard today transactions:', err);
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    );
  } catch (err) {
    console.error('[guardService] Failed to setup today metrics listeners:', err);
    onError(err instanceof Error ? err : new Error(String(err)));
  }

  return () => {
    entriesUnsub();
    exitsUnsub();
    txnsUnsub();
  };
}

/**
 * 4. Real-time stream of the Guard's Financial Responsibility
 * Matches Flutter's FinancialResponsibilityService.watchGuardResponsibility(guardUid, guardName).
 */
export function subscribeToGuardFinancialResponsibility(
  guardUid: string,
  guardName: string | undefined,
  onUpdate: (resp: GuardFinancialResponsibility) => void,
  onError: (error: Error) => void
): Unsubscribe {
  if (!db) {
    onError(new Error('Firebase Firestore is not initialized.'));
    return () => {};
  }

  const cleanUid = guardUid.trim();
  const displayName = guardName?.trim() || 'Guard';

  if (!cleanUid) {
    onUpdate({
      guardUid: '',
      guardName: displayName,
      totalCashCollected: 0,
      cashHandedOver: 0,
      cashReceived: 0,
      cashWithdrawn: 0,
      outstandingCash: 0,
      totalUpiCollected: 0,
      upiHandedOver: 0,
      upiReceived: 0,
      upiWithdrawn: 0,
      outstandingUpi: 0,
      totalOutstanding: 0,
    });
    return () => {};
  }

  let cashColl = 0;
  let upiColl = 0;
  let cashOut = 0;
  let upiOut = 0;
  let cashIn = 0;
  let upiIn = 0;
  let cashWithdrawn = 0;
  let upiWithdrawn = 0;

  const emit = () => {
    const netCash = Math.max(0, cashColl - cashOut + cashIn - cashWithdrawn);
    const netUpi = Math.max(0, upiColl - upiOut + upiIn - upiWithdrawn);

    onUpdate({
      guardUid: cleanUid,
      guardName: displayName,
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
    });
  };

  emit();

  let txnsUnsub: Unsubscribe = () => {};
  let outHandoversUnsub: Unsubscribe = () => {};
  let inHandoversUnsub: Unsubscribe = () => {};
  let withdrawalsUnsub: Unsubscribe = () => {};

  try {
    const txnsQuery = query(
      collection(db, 'payment_transactions'),
      where('guardUid', '==', cleanUid)
    );
    txnsUnsub = onSnapshot(
      txnsQuery,
      (snap) => {
        let c = 0;
        let u = 0;
        snap.forEach((d) => {
          const data = d.data();
          const amt = typeof data.amount === 'number' ? data.amount : Number(data.amount) || 0;
          const method = String(data.paymentMethod || 'cash').toLowerCase();
          const pType = String(data.paymentType || 'ADVANCE').toUpperCase();

          if (method === 'cash') {
            if (pType === 'REFUND') c -= amt;
            else c += amt;
          } else if (method === 'upi') {
            if (pType === 'REFUND') u -= amt;
            else u += amt;
          }
        });
        cashColl = c;
        upiColl = u;
        emit();
      },
      (err) => {
        console.error('[guardService] Error in responsibility txns:', err);
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    );

    const outQuery = query(
      collection(db, 'handovers'),
      where('fromGuardId', '==', cleanUid),
      where('status', '==', 'ACCEPTED')
    );
    outHandoversUnsub = onSnapshot(
      outQuery,
      (snap) => {
        let c = 0;
        let u = 0;
        snap.forEach((d) => {
          const data = d.data();
          const amt = typeof data.amount === 'number' ? data.amount : Number(data.amount) || 0;
          const type = String(data.type || 'CASH').toUpperCase();
          if (type === 'CASH') c += amt;
          if (type === 'UPI') u += amt;
        });
        cashOut = c;
        upiOut = u;
        emit();
      },
      (err) => {
        console.error('[guardService] Error in responsibility out handovers:', err);
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    );

    const inQuery = query(
      collection(db, 'handovers'),
      where('toGuardId', '==', cleanUid),
      where('status', '==', 'ACCEPTED')
    );
    inHandoversUnsub = onSnapshot(
      inQuery,
      (snap) => {
        let c = 0;
        let u = 0;
        snap.forEach((d) => {
          const data = d.data();
          const amt = typeof data.amount === 'number' ? data.amount : Number(data.amount) || 0;
          const type = String(data.type || 'CASH').toUpperCase();
          if (type === 'CASH') c += amt;
          if (type === 'UPI') u += amt;
        });
        cashIn = c;
        upiIn = u;
        emit();
      },
      (err) => {
        console.error('[guardService] Error in responsibility in handovers:', err);
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    );

    const withdrawalsQuery = query(
      collection(db, 'withdrawals'),
      where('guardId', '==', cleanUid)
    );
    withdrawalsUnsub = onSnapshot(
      withdrawalsQuery,
      (snap) => {
        let c = 0;
        let u = 0;
        snap.forEach((d) => {
          const data = d.data();
          const amt = typeof data.amount === 'number' ? data.amount : Number(data.amount) || 0;
          const type = String(data.type || 'CASH').toUpperCase();
          if (type === 'CASH') c += amt;
          if (type === 'UPI') u += amt;
        });
        cashWithdrawn = c;
        upiWithdrawn = u;
        emit();
      },
      (err) => {
        console.error('[guardService] Error in responsibility withdrawals:', err);
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    );
  } catch (err) {
    console.error('[guardService] Failed to initialize responsibility listeners:', err);
    onError(err instanceof Error ? err : new Error(String(err)));
  }

  return () => {
    txnsUnsub();
    outHandoversUnsub();
    inHandoversUnsub();
    withdrawalsUnsub();
  };
}

/**
 * 5. Real-time stream of the guard's currently ACTIVE shift.
 * Matches Flutter's ShiftService.watchGuardCurrentActiveShift(guardUid, guardEmail, guardName).
 */
export function subscribeToGuardActiveShift(
  guardUid: string,
  onUpdate: (shift: ShiftModel | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!db) {
    onUpdate(null);
    return () => {};
  }

  const cleanUid = guardUid.trim();
  if (!cleanUid) {
    onUpdate(null);
    return () => {};
  }

  try {
    const shiftsRef = collection(db, 'shifts');
    const q = query(
      shiftsRef,
      where('guardId', '==', cleanUid),
      where('status', '==', 'ACTIVE')
    );

    return onSnapshot(
      q,
      (snapshot) => {
        let activeShift: ShiftModel | null = null;

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          const isCancelled = data.status === 'CANCELLED' || !!data.cancellationReason;
          const isCompleted = data.status === 'COMPLETED' || !!data.actualEndTime;

          if (isCancelled || isCompleted) continue;

          activeShift = {
            id: docSnap.id,
            shiftId: docSnap.id,
            scheduleId: data.scheduleId ? String(data.scheduleId) : undefined,
            guardId: String(data.guardId || cleanUid),
            guardUid: data.guardUid ? String(data.guardUid) : cleanUid,
            guardEmail: data.guardEmail ? String(data.guardEmail) : undefined,
            guardName: String(data.guardName || 'Guard'),
            shiftDate: parseFirestoreDate(data.shiftDate),
            startTime: parseFirestoreDate(data.startTime),
            endTime: parseFirestoreDate(data.endTime),
            durationHours: Number(data.durationHours) || 8,
            status: 'ACTIVE',
            actualStartTime: data.actualStartTime ? parseFirestoreDate(data.actualStartTime) : null,
            actualEndTime: data.actualEndTime ? parseFirestoreDate(data.actualEndTime) : null,
            startedBy: data.startedBy ? String(data.startedBy) : null,
            endedBy: data.endedBy ? String(data.endedBy) : null,
          };
          break;
        }

        onUpdate(activeShift);
      },
      (err) => {
        console.warn('[guardService] Error listening to active shift:', err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    );
  } catch (err) {
    console.warn('[guardService] Failed to initialize active shift query:', err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }
}

/**
 * 6. Real-time stream of Recent Parking Activity (latest 5 records).
 * Matches Flutter's DashboardService.watchRecentActivity(limit: 5).
 */
export function subscribeToRecentParkingActivity(
  limitCount: number = 5,
  onUpdate: (records: ParkingRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  try {
    return onSnapshot(
      collection(db, 'parking_records'),
      (snapshot) => {
        const records: ParkingRecord[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          records.push({
            id: docSnap.id,
            ticketId: docSnap.id,
            ticketNumber: String(d.ticketNumber || docSnap.id),
            vehicleNumber: String(d.vehicleNumber || 'UNKNOWN'),
            normalizedVehicleNumber: String(d.normalizedVehicleNumber || d.vehicleNumber || ''),
            vehicleType: (d.vehicleType || 'fourWheeler'),
            customerMobile: d.customerMobile ? String(d.customerMobile) : undefined,
            entryTime: parseFirestoreDate(d.entryTime),
            exitTime: d.exitTime ? parseFirestoreDate(d.exitTime) : null,
            status: (d.status || 'ACTIVE'),
            advanceAmount: Number(d.advanceAmount) || 0,
            grossCharge: typeof d.grossCharge === 'number' ? d.grossCharge : undefined,
            finalCharge: typeof d.finalCharge === 'number' ? d.finalCharge : undefined,
            paidAmount: typeof d.paidAmount === 'number' ? d.paidAmount : undefined,
            finalAmount: typeof d.finalAmount === 'number' ? d.finalAmount : undefined,
            refundAmount: typeof d.refundAmount === 'number' ? d.refundAmount : undefined,
            balanceDue: typeof d.balanceDue === 'number' ? d.balanceDue : undefined,
            paymentMethod: d.paymentMethod ? String(d.paymentMethod) : null,
            advancePaymentMethod: d.advancePaymentMethod ? String(d.advancePaymentMethod) : null,
            entryGuardName: String(d.entryGuardName || 'Guard'),
            entryGuardUid: d.entryGuardUid ? String(d.entryGuardUid) : undefined,
            exitGuardName: d.exitGuardName ? String(d.exitGuardName) : undefined,
            exitGuardUid: d.exitGuardUid ? String(d.exitGuardUid) : undefined,
            entryShift: String(d.entryShift || ''),
            exitShift: d.exitShift ? String(d.exitShift) : undefined,
            isMonthlyPass: !!d.isMonthlyPass,
            monthlyPassId: d.monthlyPassId ? String(d.monthlyPassId) : undefined,
            vehiclePhotoUrl: d.vehiclePhotoUrl ? String(d.vehiclePhotoUrl) : undefined,
          });
        });

        records.sort((a, b) => b.entryTime.getTime() - a.entryTime.getTime());
        onUpdate(records.slice(0, limitCount));
      },
      (err) => {
        console.error('[guardService] Error listening to recent activity:', err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    );
  } catch (err) {
    console.error('[guardService] Failed to setup recent activity stream:', err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }
}

/**
 * 7. Real-time stream of all shifts for a specific guard.
 * Matches Flutter ShiftService.watchGuardShifts(guardUid, guardEmail, guardName).
 */
export function subscribeGuardShifts(
  guardUid: string,
  guardEmail: string | undefined,
  guardName: string | undefined,
  onUpdate: (shifts: ShiftModel[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  const cleanUid = guardUid.trim().toLowerCase();
  const cleanEmail = guardEmail?.trim().toLowerCase();
  const cleanName = (guardName || '').trim().toLowerCase();

  try {
    return onSnapshot(
      collection(db, 'shifts'),
      (snapshot) => {
        const shifts: ShiftModel[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const sGuardId = String(d.guardId || '').trim().toLowerCase();
          const sGuardUid = String(d.guardUid || '').trim().toLowerCase();
          const sGuardEmail = String(d.guardEmail || '').trim().toLowerCase();
          const sGuardName = String(d.guardName || '').trim().toLowerCase();

          const isMatch =
            (cleanUid && (sGuardId === cleanUid || sGuardUid === cleanUid)) ||
            (cleanEmail && (sGuardId === cleanEmail || sGuardUid === cleanEmail || sGuardEmail === cleanEmail)) ||
            (cleanName && cleanName !== 'guard' && (sGuardName === cleanName || sGuardId === cleanName));

          if (isMatch) {
            const startTime = parseFirestoreDate(d.startTime);
            const endTime = parseFirestoreDate(d.endTime, new Date(startTime.getTime() + 8 * 3600 * 1000));
            const shiftDate = parseFirestoreDate(d.shiftDate, startTime);

            shifts.push({
              id: docSnap.id,
              shiftId: String(d.shiftId || docSnap.id),
              scheduleId: d.scheduleId ? String(d.scheduleId) : undefined,
              guardId: String(d.guardId || d.guardUid || ''),
              guardUid: d.guardUid ? String(d.guardUid) : undefined,
              guardEmail: d.guardEmail ? String(d.guardEmail) : undefined,
              guardName: String(d.guardName || 'Guard'),
              shiftDate,
              startTime,
              endTime,
              durationHours: Number(d.durationHours) || 8,
              status: (String(d.status || 'ASSIGNED').toUpperCase().trim() as ShiftModel['status']),
              cancellationReason: d.cancellationReason ? String(d.cancellationReason) : null,
              actualStartTime: d.actualStartTime ? parseFirestoreDate(d.actualStartTime) : null,
              actualEndTime: d.actualEndTime ? parseFirestoreDate(d.actualEndTime) : null,
              startedBy: d.startedBy ? String(d.startedBy) : null,
              endedBy: d.endedBy ? String(d.endedBy) : null,
              createdAt: d.createdAt ? parseFirestoreDate(d.createdAt) : undefined,
              updatedAt: d.updatedAt ? parseFirestoreDate(d.updatedAt) : undefined,
            });
          }
        });

        shifts.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
        onUpdate(shifts);
      },
      (err) => {
        console.error('[guardService] Error listening to guard shifts:', err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    );
  } catch (err) {
    console.error('[guardService] Failed to initialize guard shifts stream:', err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }
}

/**
 * 8. Real-time stream of Shift Operational Statistics for a specific shift window.
 * Matches Flutter ShiftService.watchShiftStats(shift).
 * Calculates Entries, Exits, Cash Collection, UPI Collection strictly within shift boundaries.
 */
export function subscribeShiftStats(
  shift: ShiftModel,
  onUpdate: (stats: ShiftStats) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!db) {
    onUpdate({
      entriesCount: 0,
      exitsCount: 0,
      totalCollection: 0,
      cashCollection: 0,
      upiCollection: 0,
    });
    return () => {};
  }

  const shiftStart = shift.startTime.getTime();
  const shiftEnd = shift.endTime.getTime();
  const guardId = shift.guardId.toLowerCase();
  const guardUid = (shift.guardUid || '').toLowerCase();

  let entries = 0;
  let exits = 0;
  let rawCash = 0;
  let rawUpi = 0;

  const emit = () => {
    const netCash = Math.max(0, rawCash);
    const netUpi = Math.max(0, rawUpi);
    onUpdate({
      entriesCount: entries,
      exitsCount: exits,
      cashCollection: netCash,
      upiCollection: netUpi,
      totalCollection: netCash + netUpi,
    });
  };

  emit();

  let recordsUnsub: Unsubscribe = () => {};
  let txnsUnsub: Unsubscribe = () => {};

  try {
    recordsUnsub = onSnapshot(
      collection(db, 'parking_records'),
      (snapshot) => {
        let ent = 0;
        let ext = 0;

        snapshot.forEach((docSnap) => {
          const d = docSnap.data();

          if (d.entryTime) {
            const eTime = parseFirestoreDate(d.entryTime).getTime();
            if (eTime >= shiftStart && eTime <= shiftEnd) {
              const gUid = String(d.entryGuardUid || d.guardUid || '').toLowerCase();
              if (!gUid || gUid === guardId || (guardUid && gUid === guardUid)) {
                ent++;
              }
            }
          }

          if (d.exitTime) {
            const exTime = parseFirestoreDate(d.exitTime).getTime();
            if (exTime >= shiftStart && exTime <= shiftEnd) {
              const exUid = String(d.exitGuardUid || '').toLowerCase();
              if (!exUid || exUid === guardId || (guardUid && exUid === guardUid)) {
                ext++;
              }
            }
          }
        });

        entries = ent;
        exits = ext;
        emit();
      },
      (err) => {
        console.error('[guardService] Error in shift stats records:', err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    );

    txnsUnsub = onSnapshot(
      collection(db, 'payment_transactions'),
      (snapshot) => {
        let c = 0;
        let u = 0;

        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          if (!d.createdAt) return;
          const tTime = parseFirestoreDate(d.createdAt).getTime();
          if (tTime < shiftStart || tTime > shiftEnd) return;

          const collector = String(d.collectorGuardUid || d.guardUid || '').toLowerCase();
          if (collector && collector !== guardId && (guardUid && collector !== guardUid)) {
            return;
          }

          const amount = typeof d.amount === 'number' ? d.amount : Number(d.amount) || 0;
          const pType = String(d.paymentType || '').toUpperCase().trim();
          const pMethod = String(d.paymentMethod || 'cash').toLowerCase().trim();
          const isUpi = pMethod === 'upi';

          if (pType === 'ADVANCE' || pType === 'FINAL' || pType === 'MONTHLY_PASS') {
            if (isUpi) u += amount;
            else c += amount;
          } else if (pType === 'REFUND') {
            if (isUpi) u -= amount;
            else c -= amount;
          }
        });

        rawCash = c;
        rawUpi = u;
        emit();
      },
      (err) => {
        console.error('[guardService] Error in shift stats txns:', err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    );
  } catch (err) {
    console.error('[guardService] Failed to initialize shift stats listeners:', err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
  }

  return () => {
    recordsUnsub();
    txnsUnsub();
  };
}

/**
 * 9. Real-time stream of all Handovers involving a specific guard (incoming or outgoing).
 * Matches Flutter FinancialResponsibilityService.watchGuardHandovers(guardUid).
 */
export function subscribeGuardHandovers(
  guardUid: string,
  onUpdate: (handovers: HandoverModel[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  const cleanUid = guardUid.trim().toLowerCase();
  if (!cleanUid) {
    onUpdate([]);
    return () => {};
  }

  try {
    return onSnapshot(
      collection(db, 'handovers'),
      (snapshot) => {
        const list: HandoverModel[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const fromId = String(d.fromGuardId || '').trim().toLowerCase();
          const toId = String(d.toGuardId || '').trim().toLowerCase();

          if (fromId === cleanUid || toId === cleanUid) {
            list.push({
              id: docSnap.id,
              handoverId: docSnap.id,
              fromGuardId: String(d.fromGuardId || '').trim(),
              fromGuardName: String(d.fromGuardName || 'Guard').trim(),
              fromGuardEmail: d.fromGuardEmail ? String(d.fromGuardEmail) : undefined,
              toGuardId: String(d.toGuardId || '').trim(),
              toGuardName: String(d.toGuardName || 'Guard').trim(),
              toGuardEmail: d.toGuardEmail ? String(d.toGuardEmail) : undefined,
              shiftId: String(d.shiftId || d.fromShiftId || '').trim(),
              toShiftId: d.toShiftId ? String(d.toShiftId) : undefined,
              amount: typeof d.amount === 'number' ? d.amount : Number(d.amount) || 0,
              type: String(d.type || 'CASH').toUpperCase().trim() === 'UPI' ? 'UPI' : 'CASH',
              action: String(d.action || 'HANDOVER').trim(),
              status: (String(d.status || 'PENDING').toUpperCase().trim() as HandoverModel['status']),
              sourceBalanceBefore: typeof d.sourceBalanceBefore === 'number' ? d.sourceBalanceBefore : undefined,
              acceptedAt: d.acceptedAt ? parseFirestoreDate(d.acceptedAt) : null,
              acceptedBy: d.acceptedBy ? String(d.acceptedBy) : null,
              rejectedAt: d.rejectedAt ? parseFirestoreDate(d.rejectedAt) : null,
              rejectedBy: d.rejectedBy ? String(d.rejectedBy) : null,
              cancelledAt: d.cancelledAt ? parseFirestoreDate(d.cancelledAt) : null,
              notes: d.notes ? String(d.notes) : null,
              createdAt: parseFirestoreDate(d.createdAt),
            });
          }
        });

        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        onUpdate(list);
      },
      (err) => {
        console.error('[guardService] Error streaming guard handovers:', err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    );
  } catch (err) {
    console.error('[guardService] Failed to setup guard handovers stream:', err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }
}

/**
 * 10. Real-time stream of Responsibility History Events for a guard.
 * Matches Flutter FinancialResponsibilityService.watchResponsibilityHistory(guardUid).
 */
export function subscribeResponsibilityEvents(
  guardUid: string,
  onUpdate: (events: ResponsibilityEventModel[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  const cleanUid = guardUid.trim().toLowerCase();
  if (!cleanUid) {
    onUpdate([]);
    return () => {};
  }

  try {
    return onSnapshot(
      collection(db, 'responsibility_events'),
      (snapshot) => {
        const list: ResponsibilityEventModel[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const gId = String(d.guardId || '').trim().toLowerCase();
          const targetId = String(d.targetGuardId || '').trim().toLowerCase();

          if (gId === cleanUid || targetId === cleanUid) {
            list.push({
              id: docSnap.id,
              guardId: String(d.guardId || '').trim(),
              guardName: String(d.guardName || 'Guard').trim(),
              guardEmail: d.guardEmail ? String(d.guardEmail) : undefined,
              shiftId: String(d.shiftId || '').trim(),
              type: String(d.type || 'CASH').toUpperCase().trim() === 'UPI' ? 'UPI' : 'CASH',
              action: (String(d.action || 'KEEP_WITH_ME').toUpperCase().trim() as ResponsibilityEventModel['action']),
              status: String(d.status || 'Carried Forward').trim(),
              amount: typeof d.amount === 'number' ? d.amount : Number(d.amount) || 0,
              createdAt: parseFirestoreDate(d.createdAt),
              targetGuardId: d.targetGuardId ? String(d.targetGuardId) : undefined,
              targetGuardName: d.targetGuardName ? String(d.targetGuardName) : undefined,
              adminUid: d.adminUid ? String(d.adminUid) : undefined,
              adminName: d.adminName ? String(d.adminName) : undefined,
              notes: d.notes ? String(d.notes) : undefined,
            });
          }
        });

        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        onUpdate(list);
      },
      (err) => {
        console.error('[guardService] Error streaming responsibility events:', err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    );
  } catch (err) {
    console.error('[guardService] Failed to setup responsibility events stream:', err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }
}

/**
 * 11. Real-time stream of Admin Withdrawals for a guard.
 * Matches Flutter FinancialResponsibilityService.watchGuardWithdrawals(guardUid).
 */
export function subscribeGuardWithdrawals(
  guardUid: string,
  onUpdate: (withdrawals: WithdrawalRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  const cleanUid = guardUid.trim().toLowerCase();
  if (!cleanUid) {
    onUpdate([]);
    return () => {};
  }

  try {
    return onSnapshot(
      collection(db, 'withdrawals'),
      (snapshot) => {
        const list: WithdrawalRecord[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const gId = String(d.guardId || '').trim().toLowerCase();
          if (gId === cleanUid) {
            list.push({
              id: docSnap.id,
              withdrawalId: String(d.withdrawalId || docSnap.id),
              guardId: String(d.guardId || '').trim(),
              guardName: String(d.guardName || 'Guard').trim(),
              shiftId: String(d.shiftId || '').trim(),
              type: String(d.type || 'CASH').toUpperCase().trim() === 'UPI' ? 'UPI' : 'CASH',
              amount: typeof d.amount === 'number' ? d.amount : Number(d.amount) || 0,
              adminUid: String(d.adminUid || ''),
              adminName: String(d.adminName || 'Admin'),
              status: 'COMPLETED',
              notes: d.notes ? String(d.notes) : undefined,
              previousOutstanding: typeof d.previousOutstanding === 'number' ? d.previousOutstanding : undefined,
              remainingOutstanding: typeof d.remainingOutstanding === 'number' ? d.remainingOutstanding : undefined,
              createdAt: parseFirestoreDate(d.createdAt),
            });
          }
        });

        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        onUpdate(list);
      },
      (err) => {
        console.error('[guardService] Error streaming guard withdrawals:', err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    );
  } catch (err) {
    console.error('[guardService] Failed to setup guard withdrawals stream:', err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }
}

/**
 * 12. Asynchronously calculate the authoritative live financial responsibility of a guard.
 * Matches Flutter FinancialResponsibilityService.calculateGuardResponsibility(guardUid, guardName).
 */
export async function calculateGuardResponsibility(
  guardUid: string,
  guardName: string = 'Guard'
): Promise<GuardFinancialResponsibility> {
  if (!db) {
    return {
      guardUid,
      guardName,
      totalCashCollected: 0,
      cashHandedOver: 0,
      cashReceived: 0,
      cashWithdrawn: 0,
      outstandingCash: 0,
      totalUpiCollected: 0,
      upiHandedOver: 0,
      upiReceived: 0,
      upiWithdrawn: 0,
      outstandingUpi: 0,
      totalOutstanding: 0,
    };
  }

  const cleanUid = guardUid.trim();

  const [txnsSnap, outSnap, inSnap, withdrawalsSnap] = await Promise.all([
    getDocs(query(collection(db, 'payment_transactions'), where('guardUid', '==', cleanUid))),
    getDocs(query(collection(db, 'handovers'), where('fromGuardId', '==', cleanUid), where('status', '==', 'ACCEPTED'))),
    getDocs(query(collection(db, 'handovers'), where('toGuardId', '==', cleanUid), where('status', '==', 'ACCEPTED'))),
    getDocs(query(collection(db, 'withdrawals'), where('guardId', '==', cleanUid))).catch(() => ({
      forEach: () => {},
      empty: true,
      docs: [],
    }) as any),
  ]);

  let cashColl = 0;
  let upiColl = 0;
  txnsSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const amt = typeof d.amount === 'number' ? d.amount : Number(d.amount) || 0;
    const method = String(d.paymentMethod || 'cash').toLowerCase();
    const pType = String(d.paymentType || 'ADVANCE').toUpperCase();

    if (method === 'cash') {
      if (pType === 'REFUND') cashColl -= amt;
      else cashColl += amt;
    } else if (method === 'upi') {
      if (pType === 'REFUND') upiColl -= amt;
      else upiColl += amt;
    }
  });

  let cashOut = 0;
  let upiOut = 0;
  outSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const amt = typeof d.amount === 'number' ? d.amount : Number(d.amount) || 0;
    const type = String(d.type || 'CASH').toUpperCase();
    if (type === 'CASH') cashOut += amt;
    if (type === 'UPI') upiOut += amt;
  });

  let cashIn = 0;
  let upiIn = 0;
  inSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const amt = typeof d.amount === 'number' ? d.amount : Number(d.amount) || 0;
    const type = String(d.type || 'CASH').toUpperCase();
    if (type === 'CASH') cashIn += amt;
    if (type === 'UPI') upiIn += amt;
  });

  let cashWithdrawn = 0;
  let upiWithdrawn = 0;
  withdrawalsSnap.forEach((docSnap: any) => {
    const d = docSnap.data();
    const amt = typeof d.amount === 'number' ? d.amount : Number(d.amount) || 0;
    const type = String(d.type || 'CASH').toUpperCase();
    if (type === 'CASH') cashWithdrawn += amt;
    if (type === 'UPI') upiWithdrawn += amt;
  });

  const netCash = Math.max(0, cashColl - cashOut + cashIn - cashWithdrawn);
  const netUpi = Math.max(0, upiColl - upiOut + upiIn - upiWithdrawn);

  return {
    guardUid: cleanUid,
    guardName,
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

/**
 * 13. Fetches authoritative single Handover document by ID.
 * Matches Flutter FinancialResponsibilityService.getHandover(handoverId).
 */
export async function getAuthoritativeHandover(handoverId: string): Promise<HandoverModel | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'handovers', handoverId));
    if (!snap.exists() || !snap.data()) return null;
    const d = snap.data();
    return {
      id: snap.id,
      handoverId: snap.id,
      fromGuardId: String(d.fromGuardId || '').trim(),
      fromGuardName: String(d.fromGuardName || 'Guard').trim(),
      fromGuardEmail: d.fromGuardEmail ? String(d.fromGuardEmail) : undefined,
      toGuardId: String(d.toGuardId || '').trim(),
      toGuardName: String(d.toGuardName || 'Guard').trim(),
      toGuardEmail: d.toGuardEmail ? String(d.toGuardEmail) : undefined,
      shiftId: String(d.shiftId || d.fromShiftId || '').trim(),
      toShiftId: d.toShiftId ? String(d.toShiftId) : undefined,
      amount: typeof d.amount === 'number' ? d.amount : Number(d.amount) || 0,
      type: String(d.type || 'CASH').toUpperCase().trim() === 'UPI' ? 'UPI' : 'CASH',
      action: String(d.action || 'HANDOVER').trim(),
      status: (String(d.status || 'PENDING').toUpperCase().trim() as HandoverModel['status']),
      sourceBalanceBefore: typeof d.sourceBalanceBefore === 'number' ? d.sourceBalanceBefore : undefined,
      acceptedAt: d.acceptedAt ? parseFirestoreDate(d.acceptedAt) : null,
      acceptedBy: d.acceptedBy ? String(d.acceptedBy) : null,
      rejectedAt: d.rejectedAt ? parseFirestoreDate(d.rejectedAt) : null,
      rejectedBy: d.rejectedBy ? String(d.rejectedBy) : null,
      cancelledAt: d.cancelledAt ? parseFirestoreDate(d.cancelledAt) : null,
      notes: d.notes ? String(d.notes) : null,
      createdAt: parseFirestoreDate(d.createdAt),
    };
  } catch (err) {
    console.error('[guardService] Error fetching handover doc:', err);
    return null;
  }
}

/**
 * 14. Fetch list of active guards available for handover transfer.
 */
export async function getActiveGuardsList(excludeUid?: string): Promise<GuardProfile[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'guards'));
    const guards: GuardProfile[] = [];
    const cleanExclude = (excludeUid || '').trim().toLowerCase();

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const uid = String(d.uid || docSnap.id).trim();
      const isActive = d.isActive !== false;
      const role = String(d.role || 'guard').toLowerCase();

      if (isActive && role === 'guard') {
        if (!cleanExclude || uid.toLowerCase() !== cleanExclude) {
          guards.push({
            uid,
            name: String(d.name || 'Guard').trim(),
            email: String(d.email || '').trim(),
            mobile: d.mobile ? String(d.mobile) : undefined,
            role: 'guard',
            isActive: true,
            currentShift: d.currentShift ? String(d.currentShift) : undefined,
          });
        }
      }
    });

    guards.sort((a, b) => a.name.localeCompare(b.name));
    return guards;
  } catch (err) {
    console.error('[guardService] Error fetching active guards list:', err);
    return [];
  }
}

/**
 * Helper: Dispatches an in-app notification to notifications collection.
 * Matches Flutter NotificationService.createNotification.
 */
export async function createInAppNotification(params: {
  recipientUserId: string;
  title: string;
  message: string;
  type: string;
  relatedEntityId?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const notifRef = doc(collection(db, 'notifications'));
    const batch = writeBatch(db);
    batch.set(notifRef, {
      recipientUserId: params.recipientUserId,
      title: params.title,
      message: params.message,
      type: params.type,
      relatedEntityId: params.relatedEntityId || null,
      isRead: false,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    console.warn('[guardService] Failed to record in-app notification:', err);
  }
}

/**
 * Helper: Records an immutable audit log to audit_logs collection.
 * Matches Flutter AuditService.log.
 */
export async function recordAuditLog(params: {
  action: string;
  targetEntity: string;
  targetId: string;
  details?: Record<string, unknown>;
  actorUid?: string;
  actorName?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const logRef = doc(collection(db, 'audit_logs'));
    const batch = writeBatch(db);
    batch.set(logRef, {
      id: logRef.id,
      adminUid: params.actorUid || 'SYSTEM',
      adminName: params.actorName || 'Staff Guard',
      action: params.action,
      targetEntity: params.targetEntity,
      targetId: params.targetId,
      details: params.details || {},
      timestamp: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    console.warn('[guardService] Failed to record audit log:', err);
  }
}

/**
 * 15. Initiates an authoritative Handover to a relieving guard.
 * Matches Flutter FinancialResponsibilityService.initiateHandover.
 */
export async function initiateHandover(params: InitiateHandoverParams): Promise<HandoverModel> {
  if (!db) {
    throw new Error('Firebase Firestore is not initialized.');
  }

  const cleanAmount = Number(params.amount);
  if (isNaN(cleanAmount) || cleanAmount <= 0) {
    throw new Error('Handover amount must be strictly greater than zero.');
  }

  const cleanType = params.type.toUpperCase().trim() === 'UPI' ? 'UPI' : 'CASH';
  const cleanFromId = params.fromGuardId.trim();
  const cleanToId = params.toGuardId.trim();

  if (!cleanFromId || !cleanToId) {
    throw new Error('Both outgoing and receiving guard identities are required.');
  }
  if (cleanFromId.toLowerCase() === cleanToId.toLowerCase()) {
    throw new Error('Cannot hand over financial responsibility to yourself.');
  }

  const fromResp = await calculateGuardResponsibility(cleanFromId, params.fromGuardName);
  const currentAvailable = cleanType === 'CASH' ? fromResp.outstandingCash : fromResp.outstandingUpi;

  if (cleanAmount > currentAvailable + 0.001) {
    throw new Error(
      `Handover amount (₹${cleanAmount}) exceeds current available ${cleanType} responsibility (₹${currentAvailable.toFixed(2)}).`
    );
  }

  const handoverRef = doc(collection(db, 'handovers'));
  const eventRef = doc(collection(db, 'responsibility_events'));
  const now = new Date();

  const handoverData: Record<string, unknown> = {
    handoverId: handoverRef.id,
    fromGuardId: cleanFromId,
    fromGuardName: params.fromGuardName.trim(),
    fromGuardEmail: params.fromGuardEmail ? params.fromGuardEmail.trim() : null,
    toGuardId: cleanToId,
    toGuardName: params.toGuardName.trim(),
    toGuardEmail: params.toGuardEmail ? params.toGuardEmail.trim() : null,
    shiftId: params.shiftId.trim(),
    fromShiftId: params.shiftId.trim(),
    toShiftId: params.toShiftId ? params.toShiftId.trim() : null,
    amount: cleanAmount,
    type: cleanType,
    action: 'HANDOVER',
    status: 'PENDING',
    sourceBalanceBefore: currentAvailable > 0 ? currentAvailable : cleanAmount,
    notes: params.notes ? params.notes.trim() : null,
    createdAt: serverTimestamp(),
  };

  const eventData: Record<string, unknown> = {
    id: eventRef.id,
    guardId: cleanFromId,
    guardName: params.fromGuardName.trim(),
    guardEmail: params.fromGuardEmail ? params.fromGuardEmail.trim() : null,
    shiftId: params.shiftId.trim(),
    type: cleanType,
    action: 'HANDOVER_INITIATED',
    status: 'Pending',
    amount: cleanAmount,
    targetGuardId: cleanToId,
    targetGuardName: params.toGuardName.trim(),
    notes: params.notes ? params.notes.trim() : null,
    createdAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(handoverRef, handoverData);
  batch.set(eventRef, eventData);
  await batch.commit();

  createInAppNotification({
    recipientUserId: cleanToId,
    title: `Incoming ${cleanType} Handover`,
    message: `${params.fromGuardName} has handed over ₹${cleanAmount.toFixed(2)} ${cleanType} responsibility to you.`,
    type: 'handover',
    relatedEntityId: handoverRef.id,
  });

  createInAppNotification({
    recipientUserId: 'admin',
    title: `${cleanType} Handover Initiated`,
    message: `${params.fromGuardName} handed over ₹${cleanAmount.toFixed(2)} ${cleanType} to ${params.toGuardName}.`,
    type: 'handover',
    relatedEntityId: handoverRef.id,
  });

  recordAuditLog({
    action: `${cleanType}_HANDOVER_INITIATED`,
    targetEntity: 'handover',
    targetId: handoverRef.id,
    actorUid: cleanFromId,
    actorName: params.fromGuardName,
    details: {
      fromGuard: params.fromGuardName,
      toGuard: params.toGuardName,
      amount: cleanAmount,
      type: cleanType,
    },
  });

  return {
    id: handoverRef.id,
    handoverId: handoverRef.id,
    fromGuardId: cleanFromId,
    fromGuardName: params.fromGuardName.trim(),
    fromGuardEmail: params.fromGuardEmail,
    toGuardId: cleanToId,
    toGuardName: params.toGuardName.trim(),
    toGuardEmail: params.toGuardEmail,
    shiftId: params.shiftId.trim(),
    amount: cleanAmount,
    type: cleanType,
    action: 'HANDOVER',
    status: 'PENDING',
    sourceBalanceBefore: currentAvailable > 0 ? currentAvailable : cleanAmount,
    notes: params.notes,
    createdAt: now,
  };
}

/**
 * 16. Responds to an incoming handover (Accept or Reject).
 * Enforces strict STALE-BALANCE VALIDATION, IDENTITY CHECK, and ATOMIC SETTLEMENT.
 * Matches Flutter FinancialResponsibilityService.respondToHandover.
 */
export async function respondToHandover(params: RespondToHandoverParams): Promise<void> {
  if (!db) {
    throw new Error('Firebase Firestore is not initialized.');
  }

  const cleanHandoverId = params.handoverId.trim();
  const cleanGuardUid = params.guardUid.trim().toLowerCase();
  const handoverDocRef = doc(db, 'handovers', cleanHandoverId);

  const snap = await getDoc(handoverDocRef);
  if (!snap.exists() || !snap.data()) {
    throw new Error('Handover record not found.');
  }

  const data = snap.data();
  const currentStatus = String(data.status || 'PENDING').toUpperCase().trim();
  const toGuardId = String(data.toGuardId || '').trim().toLowerCase();

  if (toGuardId !== cleanGuardUid) {
    throw new Error('Only the designated receiving guard can respond to this handover.');
  }

  if (currentStatus !== 'PENDING') {
    if (params.accept && currentStatus === 'ACCEPTED') {
      console.log(`[guardService] Handover ${cleanHandoverId} is already ACCEPTED. Idempotent return.`);
      return;
    }
    throw new Error(`This handover has already been ${currentStatus.toLowerCase()}.`);
  }

  const amount = typeof data.amount === 'number' ? data.amount : Number(data.amount) || 0;
  const cleanType = String(data.type || 'CASH').toUpperCase().trim() === 'UPI' ? 'UPI' : 'CASH';
  const fromGuardId = String(data.fromGuardId || '').trim();
  const fromGuardName = String(data.fromGuardName || 'Guard').trim();
  const shiftId = String(data.shiftId || data.fromShiftId || '').trim();

  if (params.accept) {
    const fromGuardResp = await calculateGuardResponsibility(fromGuardId, fromGuardName);
    const currentAvailable = cleanType === 'CASH' ? fromGuardResp.outstandingCash : fromGuardResp.outstandingUpi;
    const expectedBalance =
      typeof data.sourceBalanceBefore === 'number' ? data.sourceBalanceBefore : amount;

    const isStale =
      Math.abs(currentAvailable - expectedBalance) > 0.001 || currentAvailable < amount - 0.001;

    if (isStale) {
      const cancelBatch = writeBatch(db);
      cancelBatch.update(handoverDocRef, {
        status: 'CANCELLED',
        cancelledAt: serverTimestamp(),
        notes: `Auto-cancelled: Guard responsibility changed prior to acceptance (captured: ₹${expectedBalance}, current: ₹${currentAvailable}, required: ₹${amount})`,
      });

      const cancelEventRef = doc(collection(db, 'responsibility_events'));
      cancelBatch.set(cancelEventRef, {
        id: cancelEventRef.id,
        guardId: fromGuardId,
        guardName: fromGuardName,
        shiftId,
        type: cleanType,
        action: 'HANDOVER_CANCELLED',
        status: 'Cancelled',
        amount,
        createdAt: serverTimestamp(),
        targetGuardId: params.guardUid,
        targetGuardName: params.guardName,
        notes: 'Auto-cancelled due to stale responsibility amount change',
      });

      await cancelBatch.commit();
      throw new Error('Guard responsibility changed prior to acceptance. Handover was cancelled.');
    }
  }

  const batch = writeBatch(db);
  const newStatus = params.accept ? 'ACCEPTED' : 'REJECTED';

  const updateFields: Record<string, unknown> = {
    status: newStatus,
  };
  if (params.accept) {
    updateFields.acceptedAt = serverTimestamp();
    updateFields.acceptedBy = params.guardUid;
  } else {
    updateFields.rejectedAt = serverTimestamp();
    updateFields.rejectedBy = params.guardUid;
  }
  batch.update(handoverDocRef, updateFields);

  if (params.accept) {
    const outEventRef = doc(collection(db, 'responsibility_events'));
    batch.set(outEventRef, {
      id: outEventRef.id,
      guardId: fromGuardId,
      guardName: fromGuardName,
      shiftId,
      type: cleanType,
      action: 'HANDOVER_OUT',
      status: 'Transferred',
      amount,
      createdAt: serverTimestamp(),
      targetGuardId: params.guardUid,
      targetGuardName: params.guardName,
    });

    const inEventRef = doc(collection(db, 'responsibility_events'));
    batch.set(inEventRef, {
      id: inEventRef.id,
      guardId: params.guardUid,
      guardName: params.guardName,
      shiftId,
      type: cleanType,
      action: 'HANDOVER_IN',
      status: 'Transferred',
      amount,
      createdAt: serverTimestamp(),
      targetGuardId: fromGuardId,
      targetGuardName: fromGuardName,
    });
  } else {
    const rejEventRef = doc(collection(db, 'responsibility_events'));
    batch.set(rejEventRef, {
      id: rejEventRef.id,
      guardId: fromGuardId,
      guardName: fromGuardName,
      shiftId,
      type: cleanType,
      action: 'HANDOVER_REJECTED',
      status: 'Rejected',
      amount,
      createdAt: serverTimestamp(),
      targetGuardId: params.guardUid,
      targetGuardName: params.guardName,
    });
  }

  await batch.commit();

  createInAppNotification({
    recipientUserId: fromGuardId,
    title: `${newStatus}: ${cleanType} Handover`,
    message: `${params.guardName} has ${params.accept ? 'accepted' : 'rejected'} your ${cleanType} handover of ₹${amount.toFixed(2)}.`,
    type: 'handover',
    relatedEntityId: cleanHandoverId,
  });

  createInAppNotification({
    recipientUserId: 'admin',
    title: `${newStatus}: ${cleanType} Handover`,
    message: `${params.guardName} ${newStatus.toLowerCase()} the ${cleanType} handover of ₹${amount.toFixed(2)} from ${fromGuardName}.`,
    type: 'handover',
    relatedEntityId: cleanHandoverId,
  });

  recordAuditLog({
    action: params.accept ? `${cleanType}_HANDOVER_ACCEPTED` : `${cleanType}_HANDOVER_REJECTED`,
    targetEntity: 'handover',
    targetId: cleanHandoverId,
    actorUid: params.guardUid,
    actorName: params.guardName,
    details: {
      guardName: params.guardName,
      amount,
      status: newStatus,
    },
  });
}

/**
 * 17. Cancels an outgoing pending handover.
 * Matches Flutter FinancialResponsibilityService.cancelHandover.
 */
export async function cancelHandover(params: CancelHandoverParams): Promise<void> {
  if (!db) {
    throw new Error('Firebase Firestore is not initialized.');
  }

  const cleanHandoverId = params.handoverId.trim();
  const cleanGuardUid = params.guardUid.trim().toLowerCase();
  const handoverDocRef = doc(db, 'handovers', cleanHandoverId);

  const snap = await getDoc(handoverDocRef);
  if (!snap.exists() || !snap.data()) {
    throw new Error('Handover record not found.');
  }

  const data = snap.data();
  const currentStatus = String(data.status || 'PENDING').toUpperCase().trim();
  if (currentStatus !== 'PENDING') {
    throw new Error('Only pending handovers can be cancelled.');
  }

  const fromGuardId = String(data.fromGuardId || '').trim().toLowerCase();
  if (fromGuardId !== cleanGuardUid) {
    throw new Error('Only the creator guard can cancel an outgoing handover.');
  }

  const amount = typeof data.amount === 'number' ? data.amount : Number(data.amount) || 0;
  const cleanType = String(data.type || 'CASH').toUpperCase().trim() === 'UPI' ? 'UPI' : 'CASH';
  const toGuardId = String(data.toGuardId || '').trim();
  const toGuardName = String(data.toGuardName || 'Guard').trim();
  const shiftId = String(data.shiftId || data.fromShiftId || '').trim();

  const batch = writeBatch(db);
  batch.update(handoverDocRef, {
    status: 'CANCELLED',
    cancelledAt: serverTimestamp(),
  });

  const eventRef = doc(collection(db, 'responsibility_events'));
  batch.set(eventRef, {
    id: eventRef.id,
    guardId: params.guardUid,
    guardName: params.guardName,
    shiftId,
    type: cleanType,
    action: 'HANDOVER_CANCELLED',
    status: 'Cancelled',
    amount,
    createdAt: serverTimestamp(),
    targetGuardId: toGuardId,
    targetGuardName: toGuardName,
  });

  await batch.commit();

  createInAppNotification({
    recipientUserId: toGuardId,
    title: 'Handover Cancelled',
    message: `${params.guardName} cancelled the ₹${amount.toFixed(2)} ${cleanType} handover.`,
    type: 'handover',
    relatedEntityId: cleanHandoverId,
  });

  recordAuditLog({
    action: `${cleanType}_HANDOVER_CANCELLED`,
    targetEntity: 'handover',
    targetId: cleanHandoverId,
    actorUid: params.guardUid,
    actorName: params.guardName,
    details: {
      guardName: params.guardName,
      amount,
    },
  });
}

/**
 * 18. Records Guard "Keep With Me" retention of the full outstanding amount across shifts.
 * Matches Flutter FinancialResponsibilityService.recordKeepWithMe.
 */
export async function recordKeepWithMe(params: KeepWithMeParams): Promise<void> {
  if (!db) {
    throw new Error('Firebase Firestore is not initialized.');
  }

  const cleanAmount = Number(params.amount);
  if (isNaN(cleanAmount) || cleanAmount <= 0) {
    throw new Error('Retention amount must be strictly greater than zero.');
  }

  const cleanType = params.type.toUpperCase().trim() === 'UPI' ? 'UPI' : 'CASH';
  const eventRef = doc(collection(db, 'responsibility_events'));

  const batch = writeBatch(db);
  batch.set(eventRef, {
    id: eventRef.id,
    guardId: params.guardId.trim(),
    guardName: params.guardName.trim(),
    shiftId: params.shiftId.trim(),
    type: cleanType,
    action: 'KEEP_WITH_ME',
    status: 'Carried Forward',
    amount: cleanAmount,
    createdAt: serverTimestamp(),
  });
  await batch.commit();

  createInAppNotification({
    recipientUserId: 'admin',
    title: `${cleanType} Kept by Guard`,
    message: `${params.guardName} kept ₹${cleanAmount.toFixed(2)} ${cleanType} responsibility (Carried Forward).`,
    type: 'keep_with_me',
    relatedEntityId: params.guardId.trim(),
  });

  recordAuditLog({
    action: `${cleanType}_KEEP_WITH_ME`,
    targetEntity: 'guard',
    targetId: params.guardId.trim(),
    actorUid: params.guardId.trim(),
    actorName: params.guardName,
    details: {
      guardName: params.guardName,
      shiftId: params.shiftId,
      type: cleanType,
      amount: cleanAmount,
      status: 'Carried Forward',
    },
  });
}
