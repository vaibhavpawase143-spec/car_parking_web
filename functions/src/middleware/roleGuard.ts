import { HttpsError } from 'firebase-functions/v2/https';
import { LocationRates, ParkingLocationDoc, UserStaffProfile } from '../types/index.js';

export function assertCanCreateLocation(profile: UserStaffProfile): void {
  if (profile.role !== 'owner') {
    throw new HttpsError(
      'permission-denied',
      `Role '${profile.role}' is not authorized to create parking locations. Only Enterprise Owners can provision new facilities.`
    );
  }
}

export function assertCanUpdateLocation(
  profile: UserStaffProfile,
  existingLocation: ParkingLocationDoc,
  requestedUpdates: {
    rates?: Partial<LocationRates>;
    capacity?: { carTotal?: number; twoWheelerTotal?: number };
  }
): void {
  if (profile.role === 'owner') {
    // Cross-owner isolation: Owner can only update locations they own
    if (existingLocation.ownerUid && existingLocation.ownerUid !== profile.uid) {
      throw new HttpsError(
        'permission-denied',
        'Cross-enterprise access denied. You can only manage locations belonging to your enterprise.'
      );
    }
    // Enterprise Owner has full update permission
    return;
  }

  if (profile.role === 'manager') {
    // 1. Manager must be explicitly assigned to this location
    const isAssigned =
      (Array.isArray(existingLocation.managerUids) && existingLocation.managerUids.includes(profile.uid)) ||
      (Array.isArray(profile.assignedLocationIds) && profile.assignedLocationIds.includes(existingLocation.id));

    if (!isAssigned) {
      throw new HttpsError(
        'permission-denied',
        `Access denied. Location Manager is not assigned to location '${existingLocation.name}' (${existingLocation.id}).`
      );
    }

    // 2. Manager Rate & Capacity Lockout (Phase 5B v1.1.1 & Phase 5E Decision)
    if (requestedUpdates.rates) {
      const rateKeys: Array<keyof LocationRates> = [
        'fourWheelerFirstHourRate',
        'fourWheelerAdditionalHourRate',
        'fourWheeler12HourCap',
        'fourWheeler24HourCap',
        'fourWheelerMonthlyRate',
        'twoWheelerFirstHourRate',
        'twoWheelerAdditionalHourRate',
        'twoWheeler12HourCap',
        'twoWheeler24HourCap',
        'twoWheelerMonthlyRate',
      ];

      const hasRateChanges = rateKeys.some(
        (key) => requestedUpdates.rates![key] !== undefined && requestedUpdates.rates![key] !== existingLocation.rates[key]
      );

      if (hasRateChanges) {
        throw new HttpsError(
          'permission-denied',
          'Location Managers are prohibited from modifying rate schedules. Pricing changes require Enterprise Owner authorization.'
        );
      }
    }

    if (requestedUpdates.capacity) {
      const origCap = existingLocation.capacity;
      const newCap = requestedUpdates.capacity;
      const hasCapChanges =
        (newCap.carTotal !== undefined && newCap.carTotal !== origCap.carTotal) ||
        (newCap.twoWheelerTotal !== undefined && newCap.twoWheelerTotal !== origCap.twoWheelerTotal);

      if (hasCapChanges) {
        throw new HttpsError(
          'permission-denied',
          'Location Managers are prohibited from altering physical bay capacities.'
        );
      }
    }

    return;
  }

  throw new HttpsError(
    'permission-denied',
    `Role '${profile.role}' is not authorized to edit location configurations.`
  );
}

export function assertCanDeactivateLocation(
  profile: UserStaffProfile,
  existingLocation: ParkingLocationDoc
): void {
  if (profile.role !== 'owner') {
    throw new HttpsError(
      'permission-denied',
      `Role '${profile.role}' is not authorized to deactivate facilities. Deactivation is strictly an Enterprise Owner operation.`
    );
  }

  if (existingLocation.ownerUid && existingLocation.ownerUid !== profile.uid) {
    throw new HttpsError(
      'permission-denied',
      'Cross-enterprise access denied. You can only deactivate locations belonging to your enterprise.'
    );
  }
}
