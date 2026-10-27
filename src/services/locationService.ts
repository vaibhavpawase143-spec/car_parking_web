import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { LocationRates, ParkingLocationDoc, UserRole } from '../types';

/**
 * Phase 5C: Multi-Location Constants & Resolution Engine
 * Primary specification: PHASE_5B_MULTI_LOCATION_SPECIFICATION.md (v1.1.1-REVISED)
 */

export const DEFAULT_LEGACY_LOCATION_ID = 'loc_sangamner_01';

export const DEFAULT_LEGACY_RATES: LocationRates = {
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
};

export const DEFAULT_LEGACY_LOCATION: ParkingLocationDoc = {
  id: DEFAULT_LEGACY_LOCATION_ID,
  code: 'SMR',
  name: 'Jay Ganesh Pay & Park',
  marathiName: 'जय गणेश पे अँड पार्क',
  locationName: 'Sangamner Bus Stand',
  marathiLocationName: 'संगमनेर बसस्थानक',
  address: 'Sangamner Bus Stand, Sangamner, Maharashtra 422605',
  authorityLicenseText: 'म. रा. मा. परिवहन महामंडळाचे अधिकृत वाहनतळ',
  contactMobile: '9690793434',
  ownerUid: '',
  managerUids: [],
  isActive: true,
  capacity: {
    carTotal: 50,
    twoWheelerTotal: 100,
  },
  rates: DEFAULT_LEGACY_RATES,
  operatingHours: {
    openTime: '06:00',
    closeTime: '23:00',
    is24Hours: true,
  },
  features: {
    cashEnabled: true,
    upiEnabled: true,
    advanceEnabled: true,
    overnightParkingAllowed: true,
  },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

export interface ResolvedStaffLocations {
  role: UserRole;
  assignedLocationIds: string[];
  activeLocationId: string | null;
  assignedLocationId: string | null;
  isLegacyMode: boolean;
  hasValidAssignment: boolean;
}

/**
 * Non-mutating dual-read memory resolver for staff profiles.
 * Preserves backward compatibility by safely defaulting legacy records
 * without locationId to 'loc_sangamner_01' in memory without altering Firestore.
 */
export function resolveStaffLocations(data: any): ResolvedStaffLocations {
  const rawRole = String(data?.role || '').trim().toLowerCase();
  let role: UserRole = 'guard';

  if (rawRole === 'owner') role = 'owner';
  else if (rawRole === 'manager') role = 'manager';
  else if (rawRole === 'admin') role = 'admin';
  else role = 'guard';

  // 1. Owner: enterprise-wide access across all facilities
  if (role === 'owner') {
    const rawIds = Array.isArray(data?.assignedLocationIds) && data.assignedLocationIds.length > 0
      ? data.assignedLocationIds
      : [DEFAULT_LEGACY_LOCATION_ID];
    const activeId = data?.assignedLocationId || rawIds[0] || DEFAULT_LEGACY_LOCATION_ID;
    return {
      role: 'owner',
      assignedLocationIds: rawIds,
      activeLocationId: activeId,
      assignedLocationId: activeId,
      isLegacyMode: false,
      hasValidAssignment: true,
    };
  }

  // 2. Legacy Admin: strictly scoped to default location loc_sangamner_01 as Location Manager
  if (role === 'admin') {
    const isLegacy = !data?.assignedLocationId && !data?.assignedLocationIds;
    return {
      role: 'admin',
      assignedLocationIds: [DEFAULT_LEGACY_LOCATION_ID],
      activeLocationId: DEFAULT_LEGACY_LOCATION_ID,
      assignedLocationId: DEFAULT_LEGACY_LOCATION_ID,
      isLegacyMode: isLegacy,
      hasValidAssignment: true,
    };
  }

  // 3. Location Manager: scoped strictly to assignedLocationIds list
  if (role === 'manager') {
    let ids: string[] = [];
    if (Array.isArray(data?.assignedLocationIds)) {
      ids = data.assignedLocationIds.filter((id: any) => typeof id === 'string' && id.trim().length > 0);
    } else if (typeof data?.assignedLocationId === 'string' && data.assignedLocationId.trim().length > 0) {
      ids = [data.assignedLocationId.trim()];
    }

    const activeId = ids.length > 0 ? ids[0] : null;

    return {
      role: 'manager',
      assignedLocationIds: ids,
      activeLocationId: activeId,
      assignedLocationId: activeId,
      isLegacyMode: false,
      hasValidAssignment: ids.length > 0,
    };
  }

  // 4. Guard: handles modern array, transitional singular string, and legacy empty fallback
  if (Array.isArray(data?.assignedLocationIds)) {
    const ids = data.assignedLocationIds.filter((id: any) => typeof id === 'string' && id.trim().length > 0);
    const activeId = ids.length > 0 ? ids[0] : null;
    return {
      role: 'guard',
      assignedLocationIds: ids,
      activeLocationId: activeId,
      assignedLocationId: activeId,
      isLegacyMode: false,
      hasValidAssignment: ids.length > 0,
    };
  }

  const assignedId = typeof data?.assignedLocationId === 'string' && data.assignedLocationId.trim().length > 0
    ? data.assignedLocationId.trim()
    : null;

  if (assignedId) {
    return {
      role: 'guard',
      assignedLocationIds: [assignedId],
      activeLocationId: assignedId,
      assignedLocationId: assignedId,
      isLegacyMode: true,
      hasValidAssignment: true,
    };
  }

  // Legacy Guard fallback: if unassigned in legacy data, safely resolve to loc_sangamner_01 in memory
  return {
    role: 'guard',
    assignedLocationIds: [DEFAULT_LEGACY_LOCATION_ID],
    activeLocationId: DEFAULT_LEGACY_LOCATION_ID,
    assignedLocationId: DEFAULT_LEGACY_LOCATION_ID,
    isLegacyMode: true,
    hasValidAssignment: true,
  };
}

/**
 * Fetch a location document by ID, falling back to in-memory DEFAULT_LEGACY_LOCATION
 * if requesting 'loc_sangamner_01' during offline or pre-migration operation.
 */
export async function fetchLocationById(locationId: string): Promise<ParkingLocationDoc | null> {
  const cleanId = String(locationId || '').trim();
  if (!cleanId) return null;

  if (!db) {
    if (cleanId === DEFAULT_LEGACY_LOCATION_ID) {
      return DEFAULT_LEGACY_LOCATION;
    }
    return null;
  }

  try {
    const docRef = doc(db, 'locations', cleanId);
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data()) {
      const d = snap.data();
      return {
        id: snap.id,
        code: d.code || 'SMR',
        name: d.name || 'Jay Ganesh Pay & Park',
        marathiName: d.marathiName || 'जय गणेश पे अँड पार्क',
        locationName: d.locationName || 'Sangamner Bus Stand',
        marathiLocationName: d.marathiLocationName || 'संगमनेर बसस्थानक',
        address: d.address || '',
        authorityLicenseText: d.authorityLicenseText || '',
        contactMobile: d.contactMobile || '9690793434',
        ownerUid: d.ownerUid || '',
        managerUids: Array.isArray(d.managerUids) ? d.managerUids : [],
        isActive: d.isActive === true,
        capacity: d.capacity || { carTotal: 50, twoWheelerTotal: 100 },
        rates: d.rates || DEFAULT_LEGACY_RATES,
        operatingHours: d.operatingHours || { openTime: '06:00', closeTime: '23:00', is24Hours: true },
        features: d.features || { cashEnabled: true, upiEnabled: true, advanceEnabled: true, overnightParkingAllowed: true },
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
      };
    }

    // Dual-read fallback: if default legacy location document has not been provisioned yet
    if (cleanId === DEFAULT_LEGACY_LOCATION_ID) {
      return DEFAULT_LEGACY_LOCATION;
    }

    return null;
  } catch (err) {
    console.warn(`[LocationService] Error loading location ${cleanId}:`, err);
    if (cleanId === DEFAULT_LEGACY_LOCATION_ID) {
      return DEFAULT_LEGACY_LOCATION;
    }
    return null;
  }
}

/**
 * Fetch multiple location documents by their IDs.
 */
export async function fetchLocationsByIds(locationIds: string[]): Promise<ParkingLocationDoc[]> {
  const uniqueIds = Array.from(new Set(locationIds.map((id) => String(id).trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const results: ParkingLocationDoc[] = [];
  for (const id of uniqueIds) {
    const loc = await fetchLocationById(id);
    if (loc) {
      results.push(loc);
    }
  }
  return results;
}
