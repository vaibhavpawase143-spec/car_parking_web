import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MonthlyPass, VehiclePassCheckResult } from '../types';
import { normalizeVehicleNumber } from '../utils/formatters';
import { parseFirestoreDate } from './adminService';
import { DEFAULT_LEGACY_LOCATION_ID } from './locationService';

/**
 * Service managing Monthly Passes in 'monthly_passes' collection.
 * PAS-01: Validates monthly pass eligibility against current location.
 * - Distinguishes between site-specific and explicitly universal passes.
 * - Restricts legacy passes strictly to Sangamner (does not treat them as universal).
 */
export async function checkVehiclePass(
  vehicleNumber: string,
  locationIdOrAtTime?: string | Date,
  atTime?: Date
): Promise<VehiclePassCheckResult> {
  let targetLocationId = DEFAULT_LEGACY_LOCATION_ID;
  let effectiveDate = new Date();

  if (typeof locationIdOrAtTime === 'string') {
    targetLocationId = locationIdOrAtTime || DEFAULT_LEGACY_LOCATION_ID;
    effectiveDate = atTime || new Date();
  } else if (locationIdOrAtTime instanceof Date) {
    targetLocationId = DEFAULT_LEGACY_LOCATION_ID;
    effectiveDate = locationIdOrAtTime;
  }

  const normalized = normalizeVehicleNumber(vehicleNumber);
  if (!normalized || normalized.length < 4) {
    return {
      hasValidPass: false,
      validPass: null,
      upcomingPass: null,
      expiredPass: null,
    };
  }

  if (!db) {
    console.warn('[MonthlyPassService] Firestore not initialized');
    return {
      hasValidPass: false,
      validPass: null,
      upcomingPass: null,
      expiredPass: null,
    };
  }

  try {
    const passesRef = collection(db, 'monthly_passes');
    const q = query(passesRef, where('normalizedVehicleNumber', '==', normalized));
    const snapshot = await getDocs(q);

    let activePass: MonthlyPass | null = null;
    let upcomingPass: MonthlyPass | null = null;
    let latestExpiredPass: MonthlyPass | null = null;
    let hasLocationMismatch = false;
    let mismatchedPass: MonthlyPass | null = null;

    const checkTime = effectiveDate.getTime();

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const status = (data.status as string || 'ACTIVE').toUpperCase();
      if (status === 'CANCELLED') return;

      const startDate = parseFirestoreDate(data.startDate, new Date());
      const endDate = parseFirestoreDate(data.endDate, new Date());

      // Start of day for start date, end of day for end date
      const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
      const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);

      const typeRaw = (data.vehicleType as string || 'fourWheeler').toLowerCase();
      const vehicleType = typeRaw.includes('two') || typeRaw === '2w' ? 'twoWheeler' : 'fourWheeler';

      const pass: MonthlyPass = {
        id: docSnap.id,
        passNumber: data.passNumber || docSnap.id,
        passType: data.passType,
        primaryLocationId: data.primaryLocationId,
        eligibleLocationIds: data.eligibleLocationIds,
        isUniversal: data.isUniversal,
        ownerUid: data.ownerUid,
        vehicleNumber: data.vehicleNumber || normalized,
        normalizedVehicleNumber: data.normalizedVehicleNumber || normalized,
        vehicleType,
        customerName: data.customerName || 'Customer',
        customerMobile: data.customerMobile || '',
        startDate: startDay,
        endDate: endDay,
        amount: Number(data.amount) || 600,
        amountPaid: Number(data.amountPaid) || 600,
        outstandingAmount: Number(data.outstandingAmount) || 0,
        paymentStatus: 'PAID',
        paymentMethod: (data.paymentMethod as string || 'cash').toLowerCase() as 'cash' | 'upi',
        status: status as 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'CANCELLED',
        dynamicStatus: status as 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'CANCELLED',
        isExpiringSoon: false,
        createdBy: data.createdBy || 'Admin',
        createdAt: parseFirestoreDate(data.createdAt, new Date()),
      };

      // PAS-01: Location eligibility check
      const isUniversal = pass.isUniversal === true || pass.passType === 'UNIVERSAL';
      const isExplicitLocation =
        pass.primaryLocationId === targetLocationId ||
        (Array.isArray(pass.eligibleLocationIds) && pass.eligibleLocationIds.includes(targetLocationId));
      const isLegacySangamner =
        !pass.primaryLocationId &&
        !isUniversal &&
        (!pass.eligibleLocationIds || pass.eligibleLocationIds.length === 0) &&
        targetLocationId === DEFAULT_LEGACY_LOCATION_ID;

      const isLocationEligible = isUniversal || isExplicitLocation || isLegacySangamner;

      if (checkTime >= startDay.getTime() && checkTime <= endDay.getTime()) {
        if (isLocationEligible) {
          activePass = pass;
        } else {
          hasLocationMismatch = true;
          mismatchedPass = pass;
        }
      } else if (checkTime < startDay.getTime()) {
        if (!upcomingPass || startDay.getTime() < upcomingPass.startDate.getTime()) {
          upcomingPass = pass;
        }
      } else if (checkTime > endDay.getTime()) {
        if (!latestExpiredPass || endDay.getTime() > latestExpiredPass.endDate.getTime()) {
          latestExpiredPass = pass;
        }
      }
    });

    return {
      hasValidPass: Boolean(activePass),
      validPass: activePass,
      upcomingPass,
      expiredPass: latestExpiredPass,
      isUpcoming: Boolean(upcomingPass && !activePass),
      isExpired: Boolean(latestExpiredPass && !activePass && !upcomingPass),
      isLocationMismatch: Boolean(!activePass && hasLocationMismatch),
      locationMismatchMessage: (!activePass && hasLocationMismatch)
        ? `Pass is registered for facility '${(mismatchedPass as MonthlyPass | null)?.primaryLocationId || 'Sangamner'}' and cannot be used at this location.`
        : undefined,
    };
  } catch (err) {
    console.error('[MonthlyPassService] Error checking vehicle pass:', err);
    throw err;
  }
}
