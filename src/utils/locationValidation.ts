import { LocationRates, ParkingLocationDoc, UserRole } from '../types';

export interface LocationFormData {
  id?: string;
  code: string;
  name: string;
  marathiName: string;
  locationName: string;
  marathiLocationName: string;
  address: string;
  authorityLicenseText: string;
  contactMobile: string;
  ownerUid?: string;
  isActive: boolean;
  capacity: {
    carTotal: number;
    twoWheelerTotal: number;
  };
  rates: LocationRates;
  operatingHours: {
    openTime: string;
    closeTime: string;
    is24Hours: boolean;
  };
  features: {
    cashEnabled: boolean;
    upiEnabled: boolean;
    advanceEnabled: boolean;
    overnightParkingAllowed: boolean;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

const LOCATION_CODE_REGEX = /^[A-Z0-9]{3,5}$/;
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validates a parking location creation or edit form.
 * Enforces Phase 5B field constraints, canonical rate limits, and immutability invariants.
 */
export function validateLocationForm(
  data: LocationFormData,
  options: {
    isEdit?: boolean;
    originalDoc?: ParkingLocationDoc | null;
    existingLocations?: ParkingLocationDoc[];
    userRole?: UserRole;
  } = {}
): ValidationResult {
  const errors: Record<string, string> = {};
  const { isEdit = false, originalDoc = null, existingLocations = [], userRole = 'owner' } = options;

  // 1. Identity & Name validation
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
    errors.name = 'Location name is required (minimum 2 characters).';
  }

  if (!data.marathiName || typeof data.marathiName !== 'string' || data.marathiName.trim().length < 2) {
    errors.marathiName = 'Marathi signage name is required.';
  }

  if (!data.locationName || typeof data.locationName !== 'string' || data.locationName.trim().length < 2) {
    errors.locationName = 'Specific counter or landmark name is required.';
  }

  if (!data.marathiLocationName || typeof data.marathiLocationName !== 'string' || data.marathiLocationName.trim().length < 2) {
    errors.marathiLocationName = 'Marathi counter/landmark name is required.';
  }

  // 2. Location Code validation
  const cleanCode = String(data.code || '').trim().toUpperCase();
  if (!cleanCode) {
    errors.code = 'Location code is required (3–5 uppercase letters or numbers, e.g. SMR, PUN).';
  } else if (!LOCATION_CODE_REGEX.test(cleanCode)) {
    errors.code = 'Location code must be strictly 3 to 5 uppercase alphanumeric characters (no spaces or symbols).';
  } else if (!isEdit) {
    // Uniqueness check across existing prototype/emulator fixtures
    const isDuplicate = existingLocations.some(
      (loc) => loc.code.toUpperCase() === cleanCode
    );
    if (isDuplicate) {
      errors.code = `Location code "${cleanCode}" is already in use by another facility. Codes must be unique.`;
    }
  }

  // 3. Address & Contact validation
  if (!data.address || typeof data.address !== 'string' || data.address.trim().length < 5) {
    errors.address = 'Full physical address is required (minimum 5 characters).';
  }

  const cleanMobile = String(data.contactMobile || '').trim();
  if (!cleanMobile) {
    errors.contactMobile = 'Contact mobile number is required.';
  } else if (!INDIAN_MOBILE_REGEX.test(cleanMobile)) {
    errors.contactMobile = 'Contact number must be a valid 10-digit Indian mobile starting with 6, 7, 8, or 9.';
  }

  // 4. Capacity validation (positive integers)
  const carCap = Number(data.capacity?.carTotal);
  if (isNaN(carCap) || !Number.isInteger(carCap) || carCap <= 0) {
    errors['capacity.carTotal'] = 'Car capacity must be a positive whole number greater than 0.';
  }

  const twoWCap = Number(data.capacity?.twoWheelerTotal);
  if (isNaN(twoWCap) || !Number.isInteger(twoWCap) || twoWCap <= 0) {
    errors['capacity.twoWheelerTotal'] = 'Two-wheeler capacity must be a positive whole number greater than 0.';
  }

  // 5. Canonical 10-Field Rate Card validation
  const rates = data.rates;
  if (!rates) {
    errors.rates = 'Complete 10-field rate schedule is required.';
  } else {
    const rateFields: Array<{ key: keyof LocationRates; label: string }> = [
      { key: 'fourWheelerFirstHourRate', label: 'Four-Wheeler 1st Hour Rate' },
      { key: 'fourWheelerAdditionalHourRate', label: 'Four-Wheeler Additional Hour Rate' },
      { key: 'fourWheeler12HourCap', label: 'Four-Wheeler 12-Hour Cap' },
      { key: 'fourWheeler24HourCap', label: 'Four-Wheeler 24-Hour Cap' },
      { key: 'fourWheelerMonthlyRate', label: 'Four-Wheeler Monthly Pass Rate' },
      { key: 'twoWheelerFirstHourRate', label: 'Two-Wheeler 1st Hour Rate' },
      { key: 'twoWheelerAdditionalHourRate', label: 'Two-Wheeler Additional Hour Rate' },
      { key: 'twoWheeler12HourCap', label: 'Two-Wheeler 12-Hour Cap' },
      { key: 'twoWheeler24HourCap', label: 'Two-Wheeler 24-Hour Cap' },
      { key: 'twoWheelerMonthlyRate', label: 'Two-Wheeler Monthly Pass Rate' },
    ];

    for (const field of rateFields) {
      const val = Number(rates[field.key]);
      if (isNaN(val) || val < 0) {
        errors[`rates.${field.key}`] = `${field.label} must be a valid non-negative number.`;
      }
    }

    // Logical pricing relationships
    if (rates.fourWheeler12HourCap < rates.fourWheelerFirstHourRate) {
      errors['rates.fourWheeler12HourCap'] = '12-hour cap cannot be less than the 1st hour base rate.';
    }
    if (rates.fourWheeler24HourCap < rates.fourWheeler12HourCap) {
      errors['rates.fourWheeler24HourCap'] = '24-hour daily cap cannot be less than the 12-hour cap.';
    }
    if (rates.twoWheeler12HourCap < rates.twoWheelerFirstHourRate) {
      errors['rates.twoWheeler12HourCap'] = 'Two-wheeler 12-hour cap cannot be less than 1st hour base rate.';
    }
    if (rates.twoWheeler24HourCap < rates.twoWheeler12HourCap) {
      errors['rates.twoWheeler24HourCap'] = 'Two-wheeler 24-hour daily cap cannot be less than 12-hour cap.';
    }
  }

  // 6. Operating Hours validation
  if (!data.operatingHours?.is24Hours) {
    const openTime = String(data.operatingHours?.openTime || '').trim();
    const closeTime = String(data.operatingHours?.closeTime || '').trim();

    if (!openTime || !TIME_REGEX.test(openTime)) {
      errors['operatingHours.openTime'] = 'Opening time must be in HH:mm 24-hour format (e.g. 06:00).';
    }
    if (!closeTime || !TIME_REGEX.test(closeTime)) {
      errors['operatingHours.closeTime'] = 'Closing time must be in HH:mm 24-hour format (e.g. 23:00).';
    }
  }

  // 7. Edit Mode Immutability & Permission Matrix (SEC-09 & Phase 5B)
  if (isEdit && originalDoc) {
    if (cleanCode !== originalDoc.code.toUpperCase()) {
      errors.code = `Location code is immutable once provisioned. Cannot change from "${originalDoc.code}" to "${cleanCode}".`;
    }

    if (data.id && data.id !== originalDoc.id) {
      errors.id = `Location document ID is immutable. Cannot change from "${originalDoc.id}" to "${data.id}".`;
    }

    if (data.ownerUid && originalDoc.ownerUid && data.ownerUid !== originalDoc.ownerUid) {
      errors.ownerUid = 'Enterprise owner UID is immutable and cannot be re-assigned across enterprises.';
    }

    // Role-based editing restrictions: Managers cannot alter rates or capacity
    if (userRole === 'manager') {
      const origRates = originalDoc.rates;
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

      const hasRateChanges = rateKeys.some((k) => rates[k] !== origRates[k]);
      if (hasRateChanges) {
        errors.ratesPermission = 'Location Managers are prohibited from modifying rate schedules per Phase 5B security model.';
      }

      if (
        data.capacity.carTotal !== originalDoc.capacity.carTotal ||
        data.capacity.twoWheelerTotal !== originalDoc.capacity.twoWheelerTotal
      ) {
        errors.capacityPermission = 'Location Managers are prohibited from altering physical bay capacities.';
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
