import { isEmulatorMode } from '../firebase';
import { ParkingLocationDoc, UserRole } from '../types';
import { LocationFormData, validateLocationForm, ValidationResult } from '../utils/locationValidation';

export interface LocationSaveResult {
  success: boolean;
  doc?: ParkingLocationDoc;
  errors?: Record<string, string>;
  isProductionBlocked?: boolean;
  message: string;
}

/**
 * Phase 5D-2: Isolated Prototype Persistence Adapter
 *
 * Safety Boundary:
 * - Production Location CRUD is STRICTLY DISABLED.
 * - Live production Firestore writes are completely blocked.
 * - Allows isolated in-memory or Firebase Emulator testing only.
 */
export function saveLocationPrototype(
  formData: LocationFormData,
  options: {
    isEdit?: boolean;
    originalDoc?: ParkingLocationDoc | null;
    existingLocations?: ParkingLocationDoc[];
    userRole?: UserRole;
    forceEmulatorOnly?: boolean;
  } = {}
): LocationSaveResult {
  const { isEdit = false, originalDoc = null, existingLocations = [], userRole = 'owner', forceEmulatorOnly = false } = options;

  // 1. Run strict schema & field validation
  const validation: ValidationResult = validateLocationForm(formData, {
    isEdit,
    originalDoc,
    existingLocations,
    userRole,
  });

  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors,
      message: 'Validation failed. Please correct the highlighted errors.',
    };
  }

  // 2. Production Safety Boundary
  // If not running in emulator mode and not forced into in-memory mock, strictly block live write
  const emulatorActive = isEmulatorMode();
  if (!emulatorActive && !forceEmulatorOnly) {
    return {
      success: false,
      isProductionBlocked: true,
      message: 'Production Persistence Disabled: Creating or modifying location documents in production Firestore is blocked pending Phase 5E trusted backend security rules.',
    };
  }

  // 3. Isolated Prototype / Emulator Document Construction
  const cleanCode = formData.code.trim().toUpperCase();
  const docId = isEdit && originalDoc ? originalDoc.id : `loc_${cleanCode.toLowerCase()}_01`;

  const newDoc: ParkingLocationDoc = {
    id: docId,
    code: cleanCode,
    name: formData.name.trim(),
    marathiName: formData.marathiName.trim(),
    locationName: formData.locationName.trim(),
    marathiLocationName: formData.marathiLocationName.trim(),
    address: formData.address.trim(),
    authorityLicenseText: formData.authorityLicenseText ? formData.authorityLicenseText.trim() : '',
    contactMobile: formData.contactMobile.trim(),
    ownerUid: isEdit && originalDoc ? originalDoc.ownerUid : formData.ownerUid || 'owner_1',
    managerUids: isEdit && originalDoc ? originalDoc.managerUids : [],
    isActive: formData.isActive !== false,
    capacity: {
      carTotal: Number(formData.capacity.carTotal),
      twoWheelerTotal: Number(formData.capacity.twoWheelerTotal),
    },
    rates: {
      fourWheelerFirstHourRate: Number(formData.rates.fourWheelerFirstHourRate),
      fourWheelerAdditionalHourRate: Number(formData.rates.fourWheelerAdditionalHourRate),
      fourWheeler12HourCap: Number(formData.rates.fourWheeler12HourCap),
      fourWheeler24HourCap: Number(formData.rates.fourWheeler24HourCap),
      fourWheelerMonthlyRate: Number(formData.rates.fourWheelerMonthlyRate),
      twoWheelerFirstHourRate: Number(formData.rates.twoWheelerFirstHourRate),
      twoWheelerAdditionalHourRate: Number(formData.rates.twoWheelerAdditionalHourRate),
      twoWheeler12HourCap: Number(formData.rates.twoWheeler12HourCap),
      twoWheeler24HourCap: Number(formData.rates.twoWheeler24HourCap),
      twoWheelerMonthlyRate: Number(formData.rates.twoWheelerMonthlyRate),
    },
    operatingHours: {
      openTime: formData.operatingHours.is24Hours ? '00:00' : formData.operatingHours.openTime,
      closeTime: formData.operatingHours.is24Hours ? '23:59' : formData.operatingHours.closeTime,
      is24Hours: Boolean(formData.operatingHours.is24Hours),
    },
    features: {
      cashEnabled: Boolean(formData.features.cashEnabled),
      upiEnabled: Boolean(formData.features.upiEnabled),
      advanceEnabled: Boolean(formData.features.advanceEnabled),
      overnightParkingAllowed: Boolean(formData.features.overnightParkingAllowed),
    },
    createdAt: isEdit && originalDoc ? originalDoc.createdAt : new Date(),
    updatedAt: new Date(),
  };

  return {
    success: true,
    doc: newDoc,
    message: isEdit
      ? `Location "${newDoc.name}" (${newDoc.code}) configuration updated in isolated prototype context.`
      : `Location "${newDoc.name}" (${newDoc.code}) provisioned in isolated prototype context.`,
  };
}

/**
 * Phase 5D-2: Safe Location Deactivation (Hard deletion is prohibited)
 */
export function deactivateLocationPrototype(
  location: ParkingLocationDoc,
  options: { forceEmulatorOnly?: boolean } = {}
): { success: boolean; isProductionBlocked?: boolean; message: string } {
  const emulatorActive = isEmulatorMode();
  if (!emulatorActive && !options.forceEmulatorOnly) {
    return {
      success: false,
      isProductionBlocked: true,
      message: 'Production Deactivation Disabled: Facility deactivation in production Firestore is blocked pending Phase 5E trusted backend rules.',
    };
  }

  return {
    success: true,
    message: `Facility "${location.name}" (${location.code}) safely set to inactive (operational gate entries halted; historical ledgers preserved).`,
  };
}
