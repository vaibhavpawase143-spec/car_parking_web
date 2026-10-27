import {
  onSnapshot,
  Unsubscribe,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { CreateVehicleEntryParams, LocationRates, ParkingRecord, SettleVehicleExitParams } from '../types';
import { normalizeVehicleNumber } from '../utils/formatters';
import { uploadVehiclePhoto } from './cloudinaryService';
import { fetchLocationById, DEFAULT_LEGACY_LOCATION_ID, DEFAULT_LEGACY_RATES } from './locationService';

export class VehicleAlreadyParkedException extends Error {
  vehicleNumber: string;
  constructor(vehicleNumber: string) {
    super('This vehicle is already parked.');
    this.name = 'VehicleAlreadyParkedException';
    this.vehicleNumber = vehicleNumber;
  }
}

export class CapacityFullException extends Error {
  vehicleType: string;
  constructor(vehicleType: string) {
    super('Parking capacity is full for ' + (vehicleType === 'twoWheeler' ? 'Two-Wheeler' : 'Four-Wheeler') + '.');
    this.name = 'CapacityFullException';
    this.vehicleType = vehicleType;
  }
}

export class InactiveLocationException extends Error {
  readonly locationName: string;
  readonly locationId: string;

  constructor(locationName: string, locationId: string) {
    super(`Facility '${locationName}' (${locationId}) is deactivated. New vehicle check-ins are disabled.`);
    this.name = 'InactiveLocationException';
    this.locationName = locationName;
    this.locationId = locationId;
  }
}

export class CrossLocationSettlementException extends Error {
  readonly ticketId: string;
  readonly recordLocationId: string;
  readonly attemptedLocationId: string;

  constructor(ticketId: string, recordLocationId: string, attemptedLocationId: string) {
    super(`Ticket '${ticketId}' belongs to location '${recordLocationId}' and cannot be settled at '${attemptedLocationId}'. Cross-location settlement denied.`);
    this.name = 'CrossLocationSettlementException';
    this.ticketId = ticketId;
    this.recordLocationId = recordLocationId;
    this.attemptedLocationId = attemptedLocationId;
  }
}

/**
 * Checks if a vehicle is already parked with status 'ACTIVE'.
 * Scoped to specific location when provided, or globally otherwise.
 */
export async function isVehicleAlreadyParked(vehicleNumber: string, locationId?: string): Promise<boolean> {
  const cleanNumber = normalizeVehicleNumber(vehicleNumber);
  if (!cleanNumber) return false;
  if (!db) return false;

  const recordsRef = collection(db, 'parking_records');

  const checkRecordBelongs = (data: Record<string, unknown>) => {
    if (!locationId) return true;
    const recLoc = data.locationId;
    if (recLoc === locationId) return true;
    if (!recLoc && locationId === DEFAULT_LEGACY_LOCATION_ID) return true;
    return false;
  };

  // 1. Primary check: by normalized vehicle number
  const q1 = query(
    recordsRef,
    where('vehicleNumber', '==', cleanNumber),
    where('status', '==', 'ACTIVE')
  );
  const snap1 = await getDocs(q1);
  for (const docSnap of snap1.docs) {
    if (checkRecordBelongs(docSnap.data() as Record<string, unknown>)) return true;
  }

  // 2. Compatibility check: raw uppercase
  const rawUpper = vehicleNumber.toUpperCase().trim();
  if (rawUpper !== cleanNumber) {
    const q2 = query(
      recordsRef,
      where('vehicleNumber', '==', rawUpper),
      where('status', '==', 'ACTIVE')
    );
    const snap2 = await getDocs(q2);
    for (const docSnap of snap2.docs) {
      if (checkRecordBelongs(docSnap.data() as Record<string, unknown>)) return true;
    }
  }

  // 3. Fallback scan: normalized comparison over active records
  try {
    const qActive = query(recordsRef, where('status', '==', 'ACTIVE'));
    const activeSnap = await getDocs(qActive);
    for (const docSnap of activeSnap.docs) {
      const data = docSnap.data() as Record<string, unknown>;
      if (!checkRecordBelongs(data)) continue;
      const stored = (data.vehicleNumber as string) || '';
      if (normalizeVehicleNumber(stored) === cleanNumber) {
        return true;
      }
    }
  } catch (_) {}

  return false;
}

/**
 * ARC-02: Checks available capacity for the specified vehicle type at a designated location.
 * Ensures occupancy at one location does not affect another location's availability,
 * with safe backward compatibility fallback for Sangamner.
 */
export async function getAvailableCapacity(
  vehicleType: 'twoWheeler' | 'fourWheeler',
  locationId: string = DEFAULT_LEGACY_LOCATION_ID
): Promise<number> {
  if (!db) return 50;

  let totalCapacity = 50;
  const targetLocationId = locationId || DEFAULT_LEGACY_LOCATION_ID;

  try {
    const locDoc = await fetchLocationById(targetLocationId);
    if (locDoc && locDoc.capacity) {
      if (vehicleType === 'twoWheeler' && typeof locDoc.capacity.twoWheelerTotal === 'number') {
        totalCapacity = locDoc.capacity.twoWheelerTotal;
      } else if (vehicleType === 'fourWheeler' && typeof locDoc.capacity.carTotal === 'number') {
        totalCapacity = locDoc.capacity.carTotal;
      }
    } else if (targetLocationId === DEFAULT_LEGACY_LOCATION_ID) {
      const configSnap = await getDoc(doc(db, 'settings', 'system_config'));
      if (configSnap.exists()) {
        const data = configSnap.data();
        if (vehicleType === 'twoWheeler' && typeof data.twoWheelerTotalCapacity === 'number') {
          totalCapacity = data.twoWheelerTotalCapacity;
        } else if (vehicleType === 'fourWheeler' && typeof data.carTotalCapacity === 'number') {
          totalCapacity = data.carTotalCapacity;
        }
      }
    }
  } catch (err) {
    console.warn(`[ParkingService] Could not read system_config for capacity (${targetLocationId}), using default`, err);
  }

  try {
    const recordsRef = collection(db, 'parking_records');
    const q = query(
      recordsRef,
      where('vehicleType', '==', vehicleType),
      where('status', '==', 'ACTIVE')
    );
    const snap = await getDocs(q);

    let occupied = 0;
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const recLoc = data.locationId;
      if (recLoc === targetLocationId) {
        occupied++;
      } else if (!recLoc && targetLocationId === DEFAULT_LEGACY_LOCATION_ID) {
        occupied++;
      }
    });

    return Math.max(0, totalCapacity - occupied);
  } catch (err) {
    console.error('[ParkingService] Error reading active occupancy:', err);
    throw err;
  }
}

export interface GeneratedTicketDetails {
  ticketId: string;
  ticketNumber: string;
  sequenceNumber: number;
  locationId: string;
  locationCode: string;
  toString(): string;
}

/**
 * ARC-01: Generates atomic, location-specific ticket counter and record IDs.
 * - Partitioned counter document: /counters/ticket_counter_${locationId}
 * - Compound document ID: ${locationId}_${sequence} (e.g. loc_nsk_01_1001)
 * - Display ticket code: ${locationCode}-${sequence} (e.g. NSK-1001)
 * - Full backward compatibility: initializes Sangamner from legacy counter if present
 *   and maintains collision protection for legacy numeric doc IDs.
 */
export async function generateNextTicketNumber(
  locationId: string = DEFAULT_LEGACY_LOCATION_ID,
  locationCode?: string
): Promise<GeneratedTicketDetails> {
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }
  const firestoreDb = db;
  const targetLocationId = locationId || DEFAULT_LEGACY_LOCATION_ID;
  const targetCode = (
    locationCode ||
    (targetLocationId === DEFAULT_LEGACY_LOCATION_ID ? 'SMR' : targetLocationId.replace(/^loc_/, '').slice(0, 3).toUpperCase())
  ).toUpperCase().trim();

  const counterDocName = `ticket_counter_${targetLocationId}`;
  const counterRef = doc(firestoreDb, 'counters', counterDocName);
  const legacyCounterRef = doc(firestoreDb, 'counters', 'ticket_counter');

  return await runTransaction(firestoreDb, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    let currentCounter = 1000;

    if (counterSnap.exists() && typeof counterSnap.data()?.lastTicketNumber === 'number') {
      currentCounter = counterSnap.data()!.lastTicketNumber;
    } else if (targetLocationId === DEFAULT_LEGACY_LOCATION_ID) {
      // Legacy Sangamner fallback: if partitioned counter does not exist yet, read from legacy counter
      const legacySnap = await transaction.get(legacyCounterRef);
      if (legacySnap.exists() && typeof legacySnap.data()?.lastTicketNumber === 'number') {
        currentCounter = legacySnap.data()!.lastTicketNumber;
      }
    }

    let candidate = currentCounter + 1;
    if (candidate < 1001) candidate = 1001;

    // Collision protection: verify candidate does not exist as doc in parking_records
    let unusedFound = false;
    let candidateDocId = `${targetLocationId}_${candidate}`;

    while (!unusedFound) {
      candidateDocId = `${targetLocationId}_${candidate}`;
      const candidateDocRef = doc(firestoreDb, 'parking_records', candidateDocId);
      const existingDoc = await transaction.get(candidateDocRef);

      // Also check legacy numeric ID if at Sangamner
      let legacyCollision = false;
      if (targetLocationId === DEFAULT_LEGACY_LOCATION_ID) {
        const legacyDocRef = doc(firestoreDb, 'parking_records', candidate.toString());
        const existingLegacyDoc = await transaction.get(legacyDocRef);
        if (existingLegacyDoc.exists()) {
          legacyCollision = true;
        }
      }

      if (existingDoc.exists() || legacyCollision) {
        candidate++;
      } else {
        unusedFound = true;
      }
    }

    transaction.set(
      counterRef,
      {
        locationId: targetLocationId,
        lastTicketNumber: candidate,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // Keep legacy counter document synchronized for Sangamner backward compatibility
    if (targetLocationId === DEFAULT_LEGACY_LOCATION_ID) {
      transaction.set(
        legacyCounterRef,
        {
          lastTicketNumber: candidate,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    const displayTicket = `${targetCode}-${candidate}`;
    return {
      ticketId: candidateDocId,
      ticketNumber: displayTicket,
      sequenceNumber: candidate,
      locationId: targetLocationId,
      locationCode: targetCode,
      toString() {
        return displayTicket;
      },
    };
  });
}

/**
 * Executes vehicle entry creation with capacity check, duplicate check,
 * Cloudinary photo upload, rate snapshot preservation, and atomic Firestore batch storage.
 */
export async function createVehicleEntry(params: CreateVehicleEntryParams): Promise<ParkingRecord> {
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }
  const firestoreDb = db;

  const cleanVehicleNumber = normalizeVehicleNumber(params.vehicleNumber);
  if (!cleanVehicleNumber) {
    throw new Error('Vehicle number cannot be empty.');
  }

  const effectiveAdvance = params.isMonthlyPass ? 0.0 : (params.advanceAmount || 0.0);

  // 0. Inactive-Location Vehicle Entry Guard (Phase 5F-1)
  // Authoritative boundary check: verify location is resolved and isActive === true
  const targetLocationId = params.locationId || DEFAULT_LEGACY_LOCATION_ID;
  const locationDoc = await fetchLocationById(targetLocationId);
  if (!locationDoc || locationDoc.isActive !== true) {
    throw new InactiveLocationException(
      locationDoc?.name || targetLocationId,
      targetLocationId
    );
  }

  // 1. Concurrently run duplicate check and location-scoped capacity check (ARC-02)
  const [isDuplicate, available] = await Promise.all([
    isVehicleAlreadyParked(cleanVehicleNumber, targetLocationId),
    getAvailableCapacity(params.vehicleType, targetLocationId),
  ]);

  if (isDuplicate) {
    throw new VehicleAlreadyParkedException(cleanVehicleNumber);
  }

  if (available <= 0) {
    throw new CapacityFullException(params.vehicleType);
  }

  // 2. ARC-01: Generate partitioned ticket counter, compound record ID, and display prefix
  const locCode = params.locationCode || locationDoc.code;
  const ticketInfo = await generateNextTicketNumber(targetLocationId, locCode);
  const ticketDocId = ticketInfo.ticketId;
  const displayTicketNumber = ticketInfo.ticketNumber;
  const entryDate = new Date();

  // 3. Upload mandatory photo to Cloudinary
  const uploadResult = await uploadVehiclePhoto(ticketDocId, params.vehiclePhotoBlob);

  const photoUrl = uploadResult.secureUrl;
  const photoPublicId = uploadResult.publicId;

  // 4. FIN-01: Immutable rate snapshot captured at check-in
  const rateSnapshot: LocationRates = locationDoc.rates || DEFAULT_LEGACY_RATES;

  // 5. Atomic Firestore Batch: Parking Record + Advance Payment Transaction
  const batch = writeBatch(firestoreDb);
  const recordDocRef = doc(firestoreDb, 'parking_records', ticketDocId);

  const parkingData: Record<string, unknown> = {
    ticketId: ticketDocId,
    ticketNumber: displayTicketNumber,
    sequenceNumber: ticketInfo.sequenceNumber,
    locationId: targetLocationId,
    locationCode: ticketInfo.locationCode,
    locationName: locationDoc.name,
    rateSnapshot: rateSnapshot,
    vehicleNumber: cleanVehicleNumber,
    normalizedVehicleNumber: cleanVehicleNumber,
    vehicleType: params.vehicleType,
    customerMobile: params.customerMobile.trim(),
    entryTime: serverTimestamp(),
    status: 'ACTIVE',
    entryGuardUid: params.guardUid,
    entryGuardName: params.guardName,
    entryShiftId: params.guardShift,
    entryShift: params.guardShift,
    advanceAmount: effectiveAdvance,
    advancePaymentMethod: (params.advancePaymentMethod || 'cash').toLowerCase(),
    advanceCollectorGuardUid: effectiveAdvance > 0 ? params.guardUid : null,
    advanceCollectorGuardName: effectiveAdvance > 0 ? params.guardName : null,
    advanceCollectorShift: effectiveAdvance > 0 ? params.guardShift : null,
    photoUrl: photoUrl,
    vehiclePhotoUrl: photoUrl,
    photoPublicId: photoPublicId,
    photoDeleteToken: uploadResult.deleteToken || null,
    photoStorageProvider: 'cloudinary',
    qrReference: displayTicketNumber,
    isMonthlyPass: Boolean(params.isMonthlyPass),
    monthlyPassId: params.monthlyPassId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  batch.set(recordDocRef, parkingData);

  if (effectiveAdvance > 0) {
    const txnDocRef = doc(collection(firestoreDb, 'payment_transactions'));
    batch.set(txnDocRef, {
      ticketId: ticketDocId,
      locationId: targetLocationId,
      vehicleNumber: cleanVehicleNumber,
      amount: effectiveAdvance,
      paymentMethod: (params.advancePaymentMethod || 'cash').toLowerCase(),
      paymentType: 'ADVANCE',
      guardUid: params.guardUid,
      guardName: params.guardName,
      shift: params.guardShift,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();

  return {
    id: ticketDocId,
    ticketId: ticketDocId,
    ticketNumber: displayTicketNumber,
    locationId: targetLocationId,
    locationCode: ticketInfo.locationCode,
    locationName: locationDoc.name,
    rateSnapshot: rateSnapshot,
    vehicleNumber: cleanVehicleNumber,
    normalizedVehicleNumber: cleanVehicleNumber,
    vehicleType: params.vehicleType,
    customerMobile: params.customerMobile.trim(),
    entryTime: entryDate,
    status: 'ACTIVE',
    entryGuardName: params.guardName,
    entryGuardUid: params.guardUid,
    entryShift: params.guardShift,
    advanceAmount: effectiveAdvance,
    advancePaymentMethod: params.advancePaymentMethod || 'cash',
    isMonthlyPass: params.isMonthlyPass,
    monthlyPassId: params.monthlyPassId,
    vehiclePhotoUrl: photoUrl,
    qrReference: displayTicketNumber,
  };
}

import { parseFirestoreDate } from './adminService';
import { VehicleCategory } from '../types';

/**
 * Real-time subscription to currently active parked vehicles.
 * Scoped to specific locationId when provided.
 */
export function subscribeToActiveParkingRecords(
  onUpdate: (records: ParkingRecord[]) => void,
  onError: (err: Error) => void,
  locationId?: string
): Unsubscribe {
  if (!db) {
    onError(new Error('Firebase Firestore is not initialized or configured.'));
    return () => {};
  }

  try {
    const recordsRef = collection(db, 'parking_records');
    const q = query(recordsRef, where('status', '==', 'ACTIVE'));

    return onSnapshot(
      q,
      (snapshot) => {
        const records: ParkingRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const recLoc = data.locationId;

          // Scope by location if requested
          if (locationId) {
            const isMatchLoc = (recLoc === locationId) || (!recLoc && locationId === DEFAULT_LEGACY_LOCATION_ID);
            if (!isMatchLoc) return;
          }

          const typeRaw = (data.vehicleType as string || 'fourWheeler').toLowerCase();
          const vehicleType: VehicleCategory = typeRaw.includes('two') || typeRaw === '2w' ? 'twoWheeler' : 'fourWheeler';

          records.push({
            id: docSnap.id,
            ticketId: data.ticketId || data.ticketNumber || docSnap.id,
            ticketNumber: data.ticketNumber || data.ticketId || docSnap.id,
            locationId: (data.locationId as string) || DEFAULT_LEGACY_LOCATION_ID,
            locationCode: (data.locationCode as string) || undefined,
            locationName: (data.locationName as string) || undefined,
            rateSnapshot: (data.rateSnapshot as LocationRates) || undefined,
            vehicleNumber: data.vehicleNumber || '',
            normalizedVehicleNumber: data.normalizedVehicleNumber || normalizeVehicleNumber(data.vehicleNumber || ''),
            vehicleType,
            customerMobile: data.customerMobile || '',
            entryTime: parseFirestoreDate(data.entryTime, new Date()),
            status: 'ACTIVE',
            advanceAmount: Number(data.advanceAmount) || 0,
            advancePaymentMethod: data.advancePaymentMethod || 'cash',
            entryGuardName: data.entryGuardName || 'Guard',
            entryGuardUid: data.entryGuardUid || '',
            entryShift: data.entryShift || 'Shift 1',
            vehiclePhotoUrl: data.vehiclePhotoUrl || data.photoUrl || undefined,
            isMonthlyPass: Boolean(data.isMonthlyPass),
            monthlyPassId: data.monthlyPassId || undefined,
            qrReference: (data.qrReference as string) || (data.ticketNumber as string) || docSnap.id,
          });
        });

        // Sort newest first by default matching Flutter
        records.sort((a, b) => b.entryTime.getTime() - a.entryTime.getTime());
        onUpdate(records);
      },
      (err) => {
        console.error('[ParkingService] Error streaming active vehicles:', err);
        onError(err);
      }
    );
  } catch (err: unknown) {
    const error = err as Error;
    onError(error);
    return () => {};
  }
}

export class VehicleAlreadyExitedException extends Error {
  ticketNumber: string;
  constructor(ticketNumber: string) {
    super('This vehicle has already exited.');
    this.name = 'VehicleAlreadyExitedException';
    this.ticketNumber = ticketNumber;
  }
}

export class TicketNotFoundException extends Error {
  ticketNumber: string;
  constructor(ticketNumber: string) {
    super('Ticket not found.');
    this.name = 'TicketNotFoundException';
    this.ticketNumber = ticketNumber;
  }
}

export class VehicleNotActiveException extends Error {
  status: string;
  constructor(status: string) {
    super('Vehicle is not currently parked.');
    this.name = 'VehicleNotActiveException';
    this.status = status;
  }
}

/**
 * DATA-01: Searches tickets for exit settlement scoped to authenticated staff member's assigned location.
 * - Prevents cross-location ticket retrieval and settlement.
 * - Preserves support for legacy numeric tickets and compound prefixes.
 */
export async function searchTicketsForExit(
  rawQuery: string,
  locationId: string = DEFAULT_LEGACY_LOCATION_ID
): Promise<ParkingRecord[]> {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    throw new TicketNotFoundException('');
  }
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }

  const isNumeric = /^\d+$/.test(trimmed);
  const qNorm = normalizeVehicleNumber(trimmed);
  const qUpper = trimmed.toUpperCase();
  const targetLocationId = locationId || DEFAULT_LEGACY_LOCATION_ID;

  const recordsRef = collection(db, 'parking_records');

  // 1. Fetch currently ACTIVE records
  const qActive = query(recordsRef, where('status', '==', 'ACTIVE'));
  const activeSnap = await getDocs(qActive);

  const activeMatches: ParkingRecord[] = [];
  activeSnap.forEach((docSnap) => {
    const data = docSnap.data();

    // DATA-01: Strictly filter records to active facility
    const recLoc = data.locationId;
    const isMatchLoc = (recLoc === targetLocationId) || (!recLoc && targetLocationId === DEFAULT_LEGACY_LOCATION_ID);
    if (!isMatchLoc) {
      return;
    }

    const typeRaw = (data.vehicleType as string || 'fourWheeler').toLowerCase();
    const vehicleType: VehicleCategory = typeRaw.includes('two') || typeRaw === '2w' ? 'twoWheeler' : 'fourWheeler';

    const rPlate = data.vehicleNumber || '';
    const rPlateNorm = normalizeVehicleNumber(rPlate);
    const rTicket = (data.ticketNumber || data.ticketId || docSnap.id).toString();
    const rDocId = docSnap.id;

    let matched = false;
    if (isNumeric) {
      // Suffix match against vehicle number, display ticket number, sequence, or document ID
      matched =
        rPlateNorm.endsWith(trimmed) ||
        rTicket.endsWith(trimmed) ||
        rTicket === trimmed ||
        rDocId.endsWith(`_${trimmed}`) ||
        rDocId === trimmed;
    } else {
      matched =
        (qNorm && rPlateNorm.includes(qNorm)) ||
        rPlate.toUpperCase().includes(qUpper) ||
        rTicket.toUpperCase().includes(qUpper) ||
        rDocId.toUpperCase().includes(qUpper);
    }

    if (matched) {
      activeMatches.push({
        id: docSnap.id,
        ticketId: data.ticketId || docSnap.id,
        ticketNumber: data.ticketNumber || data.ticketId || docSnap.id,
        locationId: (data.locationId as string) || DEFAULT_LEGACY_LOCATION_ID,
        locationCode: (data.locationCode as string) || undefined,
        locationName: (data.locationName as string) || undefined,
        rateSnapshot: (data.rateSnapshot as LocationRates) || undefined,
        vehicleNumber: rPlate,
        normalizedVehicleNumber: rPlateNorm,
        vehicleType,
        customerMobile: data.customerMobile || '',
        entryTime: parseFirestoreDate(data.entryTime, new Date()),
        status: 'ACTIVE',
        advanceAmount: Number(data.advanceAmount) || 0,
        advancePaymentMethod: data.advancePaymentMethod || 'cash',
        entryGuardName: data.entryGuardName || 'Guard',
        entryGuardUid: data.entryGuardUid || '',
        entryShift: data.entryShift || 'Shift 1',
        vehiclePhotoUrl: data.vehiclePhotoUrl || data.photoUrl || undefined,
        isMonthlyPass: Boolean(data.isMonthlyPass),
        monthlyPassId: data.monthlyPassId || undefined,
        qrReference: data.qrReference || rTicket,
      });
    }
  });

  if (activeMatches.length > 0) {
    // Sort: exact ticket first, exact vehicle second, then newest entry
    activeMatches.sort((a, b) => {
      const aExactTicket = a.ticketNumber === trimmed || a.ticketId === trimmed || a.id === trimmed;
      const bExactTicket = b.ticketNumber === trimmed || b.ticketId === trimmed || b.id === trimmed;
      if (aExactTicket && !bExactTicket) return -1;
      if (!aExactTicket && bExactTicket) return 1;

      const aExactVeh = a.normalizedVehicleNumber === qNorm;
      const bExactVeh = b.normalizedVehicleNumber === qNorm;
      if (aExactVeh && !bExactVeh) return -1;
      if (!aExactVeh && bExactVeh) return 1;

      return b.entryTime.getTime() - a.entryTime.getTime();
    });
    return activeMatches;
  }

  // 2. If no active matches found, check if an exact record exists in Firestore to give precise feedback
  let exactDocData: Record<string, unknown> | null = null;
  let exactTicketNum = trimmed;

  // Direct ID check
  try {
    const directDoc = await getDoc(doc(db, 'parking_records', trimmed));
    if (directDoc.exists() && directDoc.data()) {
      exactDocData = directDoc.data() as Record<string, unknown>;
      exactTicketNum = (exactDocData.ticketNumber || exactDocData.ticketId || directDoc.id) as string;
    }
  } catch (_) {}

  // TicketNumber check
  if (!exactDocData) {
    try {
      const qTkt = query(recordsRef, where('ticketNumber', '==', trimmed));
      const snap = await getDocs(qTkt);
      if (!snap.empty) {
        exactDocData = snap.docs[0].data() as Record<string, unknown>;
        exactTicketNum = (exactDocData.ticketNumber || snap.docs[0].id) as string;
      }
    } catch (_) {}
  }

  // VehicleNumber check
  if (!exactDocData && qNorm) {
    try {
      const qVeh = query(recordsRef, where('vehicleNumber', '==', qNorm));
      const snap = await getDocs(qVeh);
      if (!snap.empty) {
        exactDocData = snap.docs[0].data() as Record<string, unknown>;
        exactTicketNum = (exactDocData.ticketNumber || snap.docs[0].id) as string;
      }
    } catch (_) {}
  }

  if (exactDocData) {
    // Cross-location check: do not disclose ticket status across locations
    const recLoc = exactDocData.locationId as string | undefined;
    const isSameLoc = (recLoc === targetLocationId) || (!recLoc && targetLocationId === DEFAULT_LEGACY_LOCATION_ID);

    if (!isSameLoc) {
      // Prevent cross-location information disclosure; fail closed with TicketNotFoundException
      throw new TicketNotFoundException(trimmed);
    }

    const status = ((exactDocData.status as string) || '').toUpperCase();
    if (status === 'EXITED') {
      throw new VehicleAlreadyExitedException(exactTicketNum);
    }
    if (status !== 'ACTIVE') {
      throw new VehicleNotActiveException(status);
    }
  }

  throw new TicketNotFoundException(trimmed);
}

/**
 * Atomically settles vehicle exit:
 * - Updates parking record to status: 'EXITED', sets exit timestamps, final settled fees, and guard shift attribution.
 * - Records 'FINAL' payment transaction if balanceDue > 0.
 * - Records 'REFUND' payment transaction if refundAmount > 0.
 * - Concurrency protection: verifies in transaction that status was ACTIVE before modifying.
 */
/**
 * Validates and extracts the trusted advance amount from the stored Firestore document.
 * - Missing or null advanceAmount is safely treated as 0.0 (legitimate record with no advance paid).
 * - Valid non-negative numbers or numeric strings are parsed and returned.
 * - Negative, NaN, infinite, or corrupted data fails safely by throwing an error.
 * - Client-supplied advance amounts are NEVER trusted as authoritative.
 */
export function parseAndValidateStoredAdvance(storedVal: unknown): number {
  if (storedVal === undefined || storedVal === null) {
    return 0.0;
  }

  if (typeof storedVal === 'number') {
    if (isNaN(storedVal) || !isFinite(storedVal)) {
      throw new Error('Invalid record state: Stored advance amount is not a valid finite number.');
    }
    if (storedVal < 0) {
      throw new Error(`Invalid record state: Stored advance amount cannot be negative (${storedVal}).`);
    }
    return storedVal;
  }

  if (typeof storedVal === 'string') {
    const trimmed = storedVal.trim();
    if (trimmed === '') return 0.0;
    const num = Number(trimmed);
    if (isNaN(num) || !isFinite(num)) {
      throw new Error(`Invalid record state: Stored advance amount is corrupted non-numeric string ("${storedVal}").`);
    }
    if (num < 0) {
      throw new Error(`Invalid record state: Stored advance amount cannot be negative ("${storedVal}").`);
    }
    return num;
  }

  throw new Error(`Invalid record state: Stored advance amount has invalid type (${typeof storedVal}).`);
}

/**
 * Atomically settles vehicle exit:
 * - Resolves compound document IDs, display ticket numbers, and legacy numeric IDs.
 * - Verifies facility boundary: prevents cross-location settlement (DATA-01).
 * - Updates parking record to status: 'EXITED', sets exit timestamps, final settled fees, and guard shift attribution.
 * - Records 'FINAL' payment transaction if balanceDue > 0 with locationId.
 * - Records 'REFUND' payment transaction if refundAmount > 0 with locationId.
 * - Concurrency protection: verifies in transaction that status was ACTIVE before modifying.
 */
export async function settleVehicleExit(params: SettleVehicleExitParams): Promise<ParkingRecord> {
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }
  const firestoreDb = db;

  // Resolve document reference across compound IDs, display tickets, and legacy numeric IDs
  let resolvedDocId = params.ticketId;
  const directDocRef = doc(firestoreDb, 'parking_records', resolvedDocId);
  let directSnap;
  try {
    directSnap = await getDoc(directDocRef);
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      throw new CrossLocationSettlementException(params.ticketId, 'foreign_location', params.expectedLocationId || 'unknown');
    }
    throw err;
  }

  if (!directSnap.exists()) {
    // Try resolving by ticketNumber (display ticket)
    const recordsRef = collection(firestoreDb, 'parking_records');
    const qTkt = query(recordsRef, where('ticketNumber', '==', params.ticketId));
    try {
      const snapTkt = await getDocs(qTkt);
      if (!snapTkt.empty) {
        resolvedDocId = snapTkt.docs[0].id;
      } else {
        // Try resolving by ticketId field
        const qId = query(recordsRef, where('ticketId', '==', params.ticketId));
        const snapId = await getDocs(qId);
        if (!snapId.empty) {
          resolvedDocId = snapId.docs[0].id;
        }
      }
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        throw new CrossLocationSettlementException(params.ticketId, 'foreign_location', params.expectedLocationId || 'unknown');
      }
      throw err;
    }
  }

  const docRef = doc(firestoreDb, 'parking_records', resolvedDocId);

  return await runTransaction(firestoreDb, async (transaction) => {
    let snapshot;
    try {
      snapshot = await transaction.get(docRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        throw new CrossLocationSettlementException(params.ticketId, 'foreign_location', params.expectedLocationId || 'unknown');
      }
      throw err;
    }

    if (!snapshot.exists() || !snapshot.data()) {
      throw new TicketNotFoundException(params.ticketId);
    }

    const currentData = snapshot.data();
    const currentStatus = ((currentData.status as string) || '').toUpperCase();

    // Concurrency & Duplicate-exit check
    if (currentStatus === 'EXITED' || currentStatus !== 'ACTIVE') {
      throw new VehicleAlreadyExitedException(params.ticketId);
    }

    // DATA-01: Prevent cross-location settlement if expectedLocationId is specified
    const recordLocationId = (currentData.locationId as string) || DEFAULT_LEGACY_LOCATION_ID;
    if (params.expectedLocationId && params.expectedLocationId !== recordLocationId) {
      throw new CrossLocationSettlementException(params.ticketId, recordLocationId, params.expectedLocationId);
    }

    // 1. Guard and Shift Authentication Verification
    if (!params.exitGuardUid || !params.exitGuardUid.trim()) {
      throw new Error('Guard identity is required to authorize exit settlement.');
    }
    if (!params.exitGuardShift || !params.exitGuardShift.trim()) {
      throw new Error('Guard shift is required to authorize exit settlement.');
    }

    // 2. Validate & parse stored advance amount strictly from Firestore (never trust client)
    const trustedAdvance = parseAndValidateStoredAdvance(currentData.advanceAmount);

    const isPass = Boolean(currentData.isMonthlyPass);
    const effectiveGross = isPass ? 0.0 : (typeof params.grossCharge === 'number' && params.grossCharge >= 0 ? params.grossCharge : 0.0);
    if (!isPass && (typeof params.grossCharge !== 'number' || isNaN(params.grossCharge) || params.grossCharge < 0)) {
      throw new Error('Invalid fee: Gross parking charge must be a non-negative number.');
    }

    const effectiveAdvance = isPass ? 0.0 : trustedAdvance;
    const effectiveBalance = isPass ? 0.0 : Math.max(0, effectiveGross - effectiveAdvance);
    const effectiveRefund = isPass ? 0.0 : Math.max(0, effectiveAdvance - effectiveGross);

    // 3. Payment Method Validation
    const cleanPaymentMethod = (params.paymentMethod || 'cash').toLowerCase();
    if (effectiveBalance > 0 && cleanPaymentMethod !== 'cash' && cleanPaymentMethod !== 'upi') {
      throw new Error(`Invalid payment method "${params.paymentMethod}". Must be 'cash' or 'upi'.`);
    }

    // 1. Update parking record to EXITED
    transaction.update(docRef, {
      status: 'EXITED',
      exitTime: serverTimestamp(),
      exitGuardUid: params.exitGuardUid,
      exitGuardName: params.exitGuardName,
      exitShift: params.exitGuardShift,
      grossCharge: effectiveGross,
      advanceAmount: effectiveAdvance,
      finalAmount: effectiveBalance,
      paidAmount: effectiveBalance,
      balanceDue: effectiveBalance,
      refundAmount: effectiveRefund,
      paymentMethod: effectiveBalance > 0 ? cleanPaymentMethod : (effectiveRefund > 0 ? 'cash' : 'none'),
      balanceCollectorGuardUid: effectiveBalance > 0 ? params.exitGuardUid : null,
      balanceCollectorShift: effectiveBalance > 0 ? params.exitGuardShift : null,
      refundCollectorGuardUid: effectiveRefund > 0 ? params.exitGuardUid : null,
      refundCollectorShift: effectiveRefund > 0 ? params.exitGuardShift : null,
      updatedAt: serverTimestamp(),
    });

    // 2. Record payment transaction for final balance collected
    if (effectiveBalance > 0) {
      const txnRef = doc(collection(firestoreDb, 'payment_transactions'));
      transaction.set(txnRef, {
        ticketId: resolvedDocId,
        locationId: recordLocationId,
        vehicleNumber: params.vehicleNumber,
        amount: effectiveBalance,
        paymentMethod: cleanPaymentMethod,
        paymentType: 'FINAL',
        guardUid: params.exitGuardUid,
        guardName: params.exitGuardName,
        shift: params.exitGuardShift,
        createdAt: serverTimestamp(),
      });
    }

    // 3. Record refund transaction if advance was greater than gross charge
    if (effectiveRefund > 0) {
      const refundTxnRef = doc(collection(firestoreDb, 'payment_transactions'));
      transaction.set(refundTxnRef, {
        ticketId: resolvedDocId,
        locationId: recordLocationId,
        vehicleNumber: params.vehicleNumber,
        amount: effectiveRefund,
        paymentMethod: 'cash',
        paymentType: 'REFUND',
        guardUid: params.exitGuardUid,
        guardName: params.exitGuardName,
        shift: params.exitGuardShift,
        createdAt: serverTimestamp(),
      });
    }

    return {
      id: resolvedDocId,
      ticketId: (currentData.ticketId as string) || resolvedDocId,
      ticketNumber: (currentData.ticketNumber as string) || (currentData.ticketId as string) || resolvedDocId,
      locationId: recordLocationId,
      locationCode: (currentData.locationCode as string) || undefined,
      locationName: (currentData.locationName as string) || undefined,
      rateSnapshot: (currentData.rateSnapshot as LocationRates) || undefined,
      vehicleNumber: params.vehicleNumber,
      normalizedVehicleNumber: normalizeVehicleNumber(params.vehicleNumber),
      vehicleType: params.vehicleType,
      customerMobile: (currentData.customerMobile as string) || '',
      entryTime: params.entryTime,
      exitTime: params.exitTime,
      status: 'EXITED',
      entryGuardName: (currentData.entryGuardName as string) || 'Guard',
      entryGuardUid: (currentData.entryGuardUid as string) || '',
      entryShift: (currentData.entryShift as string) || 'Shift 1',
      exitGuardName: params.exitGuardName,
      exitGuardUid: params.exitGuardUid,
      exitShift: params.exitGuardShift,
      advanceAmount: effectiveAdvance,
      advancePaymentMethod: (currentData.advancePaymentMethod as string) || 'cash',
      grossCharge: effectiveGross,
      finalCharge: effectiveGross,
      paidAmount: effectiveBalance,
      balanceDue: effectiveBalance,
      refundAmount: effectiveRefund,
      paymentMethod: params.paymentMethod,
      isMonthlyPass: isPass,
      monthlyPassId: (currentData.monthlyPassId as string) || undefined,
      vehiclePhotoUrl: (currentData.vehiclePhotoUrl as string) || (currentData.photoUrl as string) || undefined,
      advanceCollectorGuardName: (currentData.advanceCollectorGuardName as string) || undefined,
      advanceCollectorShift: (currentData.advanceCollectorShift as string) || undefined,
      qrReference: (currentData.qrReference as string) || (currentData.ticketNumber as string) || resolvedDocId,
    };
  });
}
