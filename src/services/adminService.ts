import {
  collection,
  doc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  CapacityData,
  DashboardMetrics,
  GuardProfile,
  GuardWithFinancials,
  MonthlyPass,
  ParkingRecord,
  PaymentTransaction,
  ShiftModel,
  SystemConfig,
  WithdrawalRecord,
} from '../types';

/**
 * Safely parse any dynamic Firestore date value into a standard JavaScript Date
 */
export function parseFirestoreDate(val: unknown, fallback: Date = new Date()): Date {
  if (!val) return fallback;
  if (val instanceof Date) return val;
  if (typeof val === 'object' && 'toDate' in (val as Record<string, unknown>)) {
    return (val as { toDate: () => Date }).toDate();
  }
  if (typeof val === 'object' && 'seconds' in (val as Record<string, unknown>)) {
    const s = (val as { seconds: number; nanoseconds?: number }).seconds;
    return new Date(s * 1000);
  }
  if (typeof val === 'number') {
    return new Date(val);
  }
  if (typeof val === 'string') {
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  carTotalCapacity: 50,
  twoWheelerTotalCapacity: 50,
  fourWheelerFirstHourRate: 50,
  twoWheelerFirstHourRate: 20,
  fourWheelerAdditionalHourRate: 10,
  twoWheelerAdditionalHourRate: 5,
  fourWheeler12HourCap: 150,
  twoWheeler12HourCap: 60,
  fourWheelerMonthlyRate: 1500,
  twoWheelerMonthlyRate: 600,
  defaultShiftDurationHours: 8,
  allowedShiftDurations: [8, 9, 10],
  englishName: 'CAR PARKING SYSTEM',
  englishLocation: 'SANGAMNER BUS STAND',
  marathiName: 'CAR PARKING SYSTEM',
  marathiLocation: 'संगमनेर बसस्थानक',
  marathiAuthority: 'म. रा. मा. परिवहन महामंडळाचे अधिकृत वाहनतळ',
  mobile: '9690793434',
  marathiMobile: '९६९०७९३४३४',
  cashEnabled: true,
  upiEnabled: true,
  advanceEnabled: true,
  bizflowBrandingEnabled: true,
  singleActiveDeviceEnabled: true,
};

/**
 * 1. Real-time listener for System Config in `settings/system_config`
 */
export function subscribeSystemConfig(
  onData: (config: SystemConfig) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};

  const docRef = doc(db, 'settings', 'system_config');
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists() && snap.data()) {
        const d = snap.data();
        onData({
          ...DEFAULT_SYSTEM_CONFIG,
          ...d,
        } as SystemConfig);
      } else {
        onData(DEFAULT_SYSTEM_CONFIG);
      }
    },
    (err) => {
      console.error('[AdminService] Error loading system_config:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * 2. Real-time listener for Parking Capacity & Occupancy
 */
export function subscribeCapacity(
  onData: (data: CapacityData) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};

  let carCap = DEFAULT_SYSTEM_CONFIG.carTotalCapacity;
  let bikeCap = DEFAULT_SYSTEM_CONFIG.twoWheelerTotalCapacity;
  let carOccupied = 0;
  let bikeOccupied = 0;

  const emit = () => {
    onData({
      carTotal: carCap,
      carOccupied,
      twoWheelerTotal: bikeCap,
      twoWheelerOccupied: bikeOccupied,
      carAvailable: Math.max(0, carCap - carOccupied),
      twoWheelerAvailable: Math.max(0, bikeCap - bikeOccupied),
    });
  };

  // Immediate default emission
  emit();

  const settingsUnsub = onSnapshot(
    doc(db, 'settings', 'system_config'),
    (snap) => {
      if (snap.exists() && snap.data()) {
        const d = snap.data();
        if (typeof d.carTotalCapacity === 'number') carCap = d.carTotalCapacity;
        if (typeof d.twoWheelerTotalCapacity === 'number') bikeCap = d.twoWheelerTotalCapacity;
        emit();
      }
    },
    (err) => console.warn('[AdminService] Capacity settings warning:', err)
  );

  const recordsUnsub = onSnapshot(
    collection(db, 'parking_records'),
    (snap) => {
      let cars = 0;
      let bikes = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.status === 'ACTIVE') {
          const type = String(data.vehicleType || '').toLowerCase();
          if (type.includes('two') || type === '2w') {
            bikes++;
          } else {
            cars++;
          }
        }
      });
      carOccupied = cars;
      bikeOccupied = bikes;
      emit();
    },
    (err) => {
      console.error('[AdminService] Capacity records error:', err);
      if (onError) onError(err);
    }
  );

  return () => {
    settingsUnsub();
    recordsUnsub();
  };
}

/**
 * 3. Real-time listener for Today's Operational Metrics
 */
export function subscribeTodayMetrics(
  onData: (metrics: DashboardMetrics) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  let activeCount = 0;
  let entriesCount = 0;
  let exitsCount = 0;
  let rawCash = 0;
  let rawUpi = 0;

  const emit = () => {
    const netCash = Math.max(0, rawCash);
    const netUpi = Math.max(0, rawUpi);
    onData({
      todayEntries: entriesCount,
      todayExits: exitsCount,
      activeParked: activeCount,
      cashCollection: netCash,
      upiCollection: netUpi,
      todayCollection: Math.max(0, netCash + netUpi),
    });
  };

  emit();

  const recordsUnsub = onSnapshot(
    collection(db, 'parking_records'),
    (snap) => {
      let active = 0;
      let entries = 0;
      let exits = 0;

      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.status === 'ACTIVE') {
          active++;
        }

        const entryTime = parseFirestoreDate(data.entryTime);
        if (entryTime >= todayStart) {
          entries++;
        }

        if (data.exitTime) {
          const exitTime = parseFirestoreDate(data.exitTime);
          if (exitTime >= todayStart) {
            exits++;
          }
        }
      });

      activeCount = active;
      entriesCount = entries;
      exitsCount = exits;
      emit();
    },
    (err) => {
      console.error('[AdminService] Records listener error:', err);
      if (onError) onError(err);
    }
  );

  const txnsUnsub = onSnapshot(
    collection(db, 'payment_transactions'),
    (snap) => {
      let cash = 0;
      let upi = 0;

      snap.docs.forEach((d) => {
        const data = d.data();
        const createdAt = parseFirestoreDate(data.createdAt);
        if (createdAt >= todayStart) {
          const amt = Number(data.amount) || 0;
          const method = String(data.paymentMethod || 'cash').toLowerCase();
          const pType = String(data.paymentType || 'ADVANCE').toUpperCase();

          if (pType === 'ADVANCE' || pType === 'FINAL' || pType === 'MONTHLY_PASS') {
            if (method === 'upi') upi += amt;
            else cash += amt;
          } else if (pType === 'REFUND') {
            if (method === 'upi') upi -= amt;
            else cash -= amt;
          }
        }
      });

      rawCash = cash;
      rawUpi = upi;
      emit();
    },
    (err) => {
      console.error('[AdminService] Transactions listener error:', err);
      if (onError) onError(err);
    }
  );

  return () => {
    recordsUnsub();
    txnsUnsub();
  };
}

/**
 * 4. Real-time stream of all Parking Records (with optional date filtering)
 */
export function subscribeParkingRecords(
  onData: (records: ParkingRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};

  return onSnapshot(
    collection(db, 'parking_records'),
    (snap) => {
      const list: ParkingRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ticketId: String(data.ticketId || d.id),
          ticketNumber: String(data.ticketNumber || data.ticketId || d.id),
          vehicleNumber: String(data.vehicleNumber || ''),
          normalizedVehicleNumber: String(data.normalizedVehicleNumber || data.vehicleNumber || '').toUpperCase(),
          vehicleType: data.vehicleType || 'fourWheeler',
          customerMobile: data.customerMobile,
          entryTime: parseFirestoreDate(data.entryTime),
          exitTime: data.exitTime ? parseFirestoreDate(data.exitTime) : null,
          status: data.status || 'ACTIVE',
          advanceAmount: Number(data.advanceAmount) || 0,
          grossCharge: data.grossCharge !== undefined ? Number(data.grossCharge) : undefined,
          finalCharge: data.finalCharge !== undefined ? Number(data.finalCharge) : undefined,
          paidAmount: data.paidAmount !== undefined ? Number(data.paidAmount) : undefined,
          finalAmount: data.finalAmount !== undefined ? Number(data.finalAmount) : undefined,
          refundAmount: data.refundAmount !== undefined ? Number(data.refundAmount) : undefined,
          balanceDue: data.balanceDue !== undefined ? Number(data.balanceDue) : undefined,
          paymentMethod: data.paymentMethod,
          advancePaymentMethod: data.advancePaymentMethod,
          entryGuardName: String(data.entryGuardName || 'Guard'),
          entryGuardUid: data.entryGuardUid,
          exitGuardName: data.exitGuardName,
          exitGuardUid: data.exitGuardUid,
          entryShift: String(data.entryShift || ''),
          exitShift: data.exitShift,
          isMonthlyPass: Boolean(data.isMonthlyPass),
          monthlyPassId: data.monthlyPassId,
          vehiclePhotoUrl: data.vehiclePhotoUrl,
        };
      });

      // Sort newest first
      list.sort((a, b) => b.entryTime.getTime() - a.entryTime.getTime());
      onData(list);
    },
    (err) => {
      console.error('[AdminService] Error streaming parking records:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * 5. Real-time stream of all Payment Transactions
 */
export function subscribePaymentTransactions(
  onData: (transactions: PaymentTransaction[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};

  return onSnapshot(
    collection(db, 'payment_transactions'),
    (snap) => {
      const list: PaymentTransaction[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ticketId: String(data.ticketId || ''),
          vehicleNumber: String(data.vehicleNumber || ''),
          amount: Number(data.amount) || 0,
          paymentMethod: (String(data.paymentMethod || 'cash').toLowerCase() === 'upi' ? 'upi' : 'cash') as 'cash' | 'upi',
          paymentType: String(data.paymentType || 'ADVANCE').toUpperCase() as PaymentTransaction['paymentType'],
          guardUid: String(data.guardUid || ''),
          guardName: String(data.guardName || 'Guard'),
          shift: String(data.shift || ''),
          createdAt: parseFirestoreDate(data.createdAt),
        };
      });

      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(list);
    },
    (err) => {
      console.error('[AdminService] Error streaming payment transactions:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * 6. Real-time stream of all Guards with calculated Float Responsibilities
 */
export function subscribeGuardsWithResponsibility(
  onData: (guards: GuardWithFinancials[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};

  let rawGuards: GuardProfile[] = [];
  let rawTxns: PaymentTransaction[] = [];
  let rawHandovers: Array<{ fromGuardId: string; toGuardId: string; amount: number; type: string; status: string }> = [];
  let rawWithdrawals: Array<{ guardId: string; amount: number; type: string; status: string }> = [];

  const emit = () => {
    const results: GuardWithFinancials[] = rawGuards.map((g) => {
      const uid = g.uid;

      // Collections
      let cashColl = 0;
      let upiColl = 0;
      let txnCount = 0;
      let lastActive: Date | undefined;

      rawTxns.forEach((t) => {
        if (t.guardUid === uid || (!t.guardUid && t.guardName.toLowerCase() === g.name.toLowerCase())) {
          txnCount++;
          if (!lastActive || t.createdAt > lastActive) {
            lastActive = t.createdAt;
          }

          if (t.paymentType === 'REFUND') {
            if (t.paymentMethod === 'upi') upiColl -= t.amount;
            else cashColl -= t.amount;
          } else {
            if (t.paymentMethod === 'upi') upiColl += t.amount;
            else cashColl += t.amount;
          }
        }
      });

      // Outgoing handovers (transferred away)
      let cashOut = 0;
      let upiOut = 0;
      rawHandovers.forEach((h) => {
        if (h.fromGuardId === uid && h.status === 'ACCEPTED') {
          if (h.type === 'UPI') upiOut += h.amount;
          else cashOut += h.amount;
        }
      });

      // Incoming handovers (received from predecessor)
      let cashIn = 0;
      let upiIn = 0;
      rawHandovers.forEach((h) => {
        if (h.toGuardId === uid && h.status === 'ACCEPTED') {
          if (h.type === 'UPI') upiIn += h.amount;
          else cashIn += h.amount;
        }
      });

      // Admin withdrawals (settled/collected by admin)
      let cashWithdrawn = 0;
      let upiWithdrawn = 0;
      rawWithdrawals.forEach((w) => {
        if (w.guardId === uid && (w.status === 'COMPLETED' || !w.status)) {
          if (w.type === 'UPI') upiWithdrawn += w.amount;
          else cashWithdrawn += w.amount;
        }
      });

      const netCash = Math.max(0, cashColl - cashOut + cashIn - cashWithdrawn);
      const netUpi = Math.max(0, upiColl - upiOut + upiIn - upiWithdrawn);

      return {
        guard: g,
        transactionCount: txnCount,
        lastActive,
        responsibility: {
          guardUid: uid,
          guardName: g.name,
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
        },
      };
    });

    results.sort((a, b) => a.guard.name.localeCompare(b.guard.name));
    onData(results);
  };

  const guardsUnsub = onSnapshot(
    collection(db, 'guards'),
    (snap) => {
      rawGuards = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            uid: data.uid || d.id,
            name: String(data.name || 'Guard'),
            email: String(data.email || ''),
            mobile: data.mobile || '',
            role: (data.role || 'guard') as GuardProfile['role'],
            isActive: Boolean(data.isActive),
            currentShift: data.currentShift || 'Shift 1',
            shiftStatus: data.shiftStatus || 'active',
            shiftStartTime: data.shiftStartTime ? parseFirestoreDate(data.shiftStartTime).toISOString() : null,
            createdAt: data.createdAt ? parseFirestoreDate(data.createdAt).toISOString() : null,
          };
        })
        .filter((g) => g.role === 'guard');
      emit();
    },
    (err) => {
      console.error('[AdminService] Guards error:', err);
      if (onError) onError(err);
    }
  );

  const txnsUnsub = onSnapshot(collection(db, 'payment_transactions'), (snap) => {
    rawTxns = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ticketId: String(data.ticketId || ''),
        vehicleNumber: String(data.vehicleNumber || ''),
        amount: Number(data.amount) || 0,
        paymentMethod: (String(data.paymentMethod || 'cash').toLowerCase() === 'upi' ? 'upi' : 'cash') as 'cash' | 'upi',
        paymentType: String(data.paymentType || 'ADVANCE').toUpperCase() as PaymentTransaction['paymentType'],
        guardUid: String(data.guardUid || ''),
        guardName: String(data.guardName || 'Guard'),
        shift: String(data.shift || ''),
        createdAt: parseFirestoreDate(data.createdAt),
      };
    });
    emit();
  });

  const handoversUnsub = onSnapshot(collection(db, 'handovers'), (snap) => {
    rawHandovers = snap.docs.map((d) => {
      const data = d.data();
      return {
        fromGuardId: String(data.fromGuardId || ''),
        toGuardId: String(data.toGuardId || ''),
        amount: Number(data.amount) || 0,
        type: String(data.type || 'CASH').toUpperCase(),
        status: String(data.status || 'PENDING').toUpperCase(),
      };
    });
    emit();
  });

  const withdrawalsUnsub = onSnapshot(collection(db, 'withdrawals'), (snap) => {
    rawWithdrawals = snap.docs.map((d) => {
      const data = d.data();
      return {
        guardId: String(data.guardId || ''),
        amount: Number(data.amount) || 0,
        type: String(data.type || 'CASH').toUpperCase(),
        status: String(data.status || 'COMPLETED').toUpperCase(),
      };
    });
    emit();
  });

  return () => {
    guardsUnsub();
    txnsUnsub();
    handoversUnsub();
    withdrawalsUnsub();
  };
}

/**
 * 7. Real-time stream of all Shifts
 */
export function subscribeShifts(
  onData: (shifts: ShiftModel[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};

  return onSnapshot(
    collection(db, 'shifts'),
    (snap) => {
      const list: ShiftModel[] = snap.docs.map((d) => {
        const data = d.data();
        const startTime = parseFirestoreDate(data.startTime);
        const endTime = parseFirestoreDate(data.endTime, new Date(startTime.getTime() + 8 * 3600 * 1000));
        const shiftDate = parseFirestoreDate(data.shiftDate, startTime);

        return {
          id: d.id,
          shiftId: String(data.shiftId || d.id),
          scheduleId: data.scheduleId,
          guardId: String(data.guardId || data.guardUid || ''),
          guardUid: data.guardUid,
          guardEmail: data.guardEmail,
          guardName: String(data.guardName || 'Guard'),
          shiftDate,
          startTime,
          endTime,
          durationHours: Number(data.durationHours) || 8,
          status: String(data.status || 'ASSIGNED').toUpperCase() as ShiftModel['status'],
          cancellationReason: data.cancellationReason,
          actualStartTime: data.actualStartTime ? parseFirestoreDate(data.actualStartTime) : null,
          actualEndTime: data.actualEndTime ? parseFirestoreDate(data.actualEndTime) : null,
          startedBy: data.startedBy,
          endedBy: data.endedBy,
          createdAt: data.createdAt ? parseFirestoreDate(data.createdAt) : undefined,
          updatedAt: data.updatedAt ? parseFirestoreDate(data.updatedAt) : undefined,
        };
      });

      list.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
      onData(list);
    },
    (err) => {
      console.error('[AdminService] Shifts error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * 8. Real-time stream of all Withdrawals
 */
export function subscribeWithdrawals(
  onData: (withdrawals: WithdrawalRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};

  return onSnapshot(
    collection(db, 'withdrawals'),
    (snap) => {
      const list: WithdrawalRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          withdrawalId: String(data.withdrawalId || d.id),
          guardId: String(data.guardId || ''),
          guardName: String(data.guardName || 'Guard'),
          shiftId: String(data.shiftId || ''),
          type: (String(data.type || 'CASH').toUpperCase() === 'UPI' ? 'UPI' : 'CASH') as 'CASH' | 'UPI',
          amount: Number(data.amount) || 0,
          adminUid: String(data.adminUid || ''),
          adminName: String(data.adminName || 'Admin'),
          status: 'COMPLETED',
          notes: data.notes,
          previousOutstanding: data.previousOutstanding !== undefined ? Number(data.previousOutstanding) : undefined,
          remainingOutstanding: data.remainingOutstanding !== undefined ? Number(data.remainingOutstanding) : undefined,
          createdAt: parseFirestoreDate(data.createdAt),
        };
      });

      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(list);
    },
    (err) => {
      console.error('[AdminService] Withdrawals error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * 9. Real-time stream of all Monthly Passes
 */
export function subscribeMonthlyPasses(
  onData: (passes: MonthlyPass[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};

  return onSnapshot(
    collection(db, 'monthly_passes'),
    (snap) => {
      const now = new Date();
      const list: MonthlyPass[] = snap.docs.map((d) => {
        const data = d.data();
        const startDate = parseFirestoreDate(data.startDate);
        const endDate = parseFirestoreDate(data.endDate);

        const rawStatus = String(data.status || 'ACTIVE').toUpperCase();
        let dynamicStatus: MonthlyPass['dynamicStatus'] = 'ACTIVE';

        if (rawStatus === 'CANCELLED') {
          dynamicStatus = 'CANCELLED';
        } else if (now < startDate) {
          dynamicStatus = 'UPCOMING';
        } else if (now > endDate) {
          dynamicStatus = 'EXPIRED';
        } else {
          dynamicStatus = 'ACTIVE';
        }

        const isExpiringSoon =
          dynamicStatus === 'ACTIVE' && endDate.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000;

        return {
          id: d.id,
          passNumber: String(data.passNumber || `PASS-${d.id}`),
          vehicleNumber: String(data.vehicleNumber || ''),
          normalizedVehicleNumber: String(data.normalizedVehicleNumber || data.vehicleNumber || '').toUpperCase(),
          vehicleType: data.vehicleType || 'fourWheeler',
          customerName: String(data.customerName || 'Pass Holder'),
          customerMobile: String(data.customerMobile || ''),
          startDate,
          endDate,
          amount: Number(data.amount) || 600,
          amountPaid: Number(data.amountPaid) || 600,
          outstandingAmount: Number(data.outstandingAmount) || 0,
          paymentStatus: 'PAID',
          paymentMethod: (String(data.paymentMethod || 'cash').toLowerCase() === 'upi' ? 'upi' : 'cash') as 'cash' | 'upi',
          status: rawStatus as MonthlyPass['status'],
          dynamicStatus,
          isExpiringSoon,
          createdBy: String(data.createdBy || 'Admin'),
          createdAt: parseFirestoreDate(data.createdAt),
        };
      });

      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(list);
    },
    (err) => {
      console.error('[AdminService] Monthly Passes error:', err);
      if (onError) onError(err);
    }
  );
}
