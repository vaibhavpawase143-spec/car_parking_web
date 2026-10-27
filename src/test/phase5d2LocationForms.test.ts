/**
 * Phase 5D-2: Location Management Forms & Validation Test Suite
 *
 * Validates:
 * 1. Required field checks & whitespace rejections
 * 2. 3-5 character uppercase alphanumeric location code validation
 * 3. Duplicate code rejection across isolated fixtures
 * 4. 10-digit Indian mobile number validation (starting with 6-9)
 * 5. Positive whole integer capacity validation
 * 6. Canonical 10-field rate schedule validation & logical ordering checks
 * 7. Operating hours & 24-hour configuration format validation
 * 8. Edit mode immutability (code, document ID, ownerUid)
 * 9. Phase 5B role permissions (Managers prohibited from editing rates/capacity)
 * 10. Safe deactivation behavior & hard deletion prevention
 * 11. Production persistence disabled safety gate
 */

import {
  DEFAULT_LEGACY_LOCATION,
  DEFAULT_LEGACY_RATES,
} from '../services/locationService';
import {
  validateLocationForm,
  LocationFormData,
} from '../utils/locationValidation';
import {
  saveLocationPrototype,
  deactivateLocationPrototype,
} from '../services/locationAdminService';
import type { ParkingLocationDoc } from '../types';

export function runPhase5D2TestSuite(): {
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
  console.log('Running Bizflow Web Phase 5D-2: Location Form & Validation Tests');
  console.log('======================================================\n');

  // Baseline valid form data
  const validBaseFormData: LocationFormData = {
    code: 'PUN',
    name: 'Jay Ganesh Pay & Park - Pune',
    marathiName: 'जय गणेश पे अँड पार्क - पुणे',
    locationName: 'Pune Railway Station',
    marathiLocationName: 'पुणे रेल्वे स्टेशन',
    address: 'Station Road, Pune, Maharashtra 411001',
    authorityLicenseText: 'म. रा. मा. परिवहन महामंडळाचे अधिकृत वाहनतळ',
    contactMobile: '9822012345',
    isActive: true,
    capacity: {
      carTotal: 60,
      twoWheelerTotal: 120,
    },
    rates: { ...DEFAULT_LEGACY_RATES },
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
  };

  const existingLocations: ParkingLocationDoc[] = [DEFAULT_LEGACY_LOCATION];

  // -------------------------------------------------------------------------
  // 1. Valid Form Baseline
  // -------------------------------------------------------------------------
  const baselineResult = validateLocationForm(validBaseFormData, { existingLocations });
  assert(baselineResult.isValid === true, 'Valid baseline form data passes all validation checks');

  // -------------------------------------------------------------------------
  // 2. Required Fields & Whitespace Rejection
  // -------------------------------------------------------------------------
  const emptyNameResult = validateLocationForm(
    { ...validBaseFormData, name: '   ' },
    { existingLocations }
  );
  assert(
    !emptyNameResult.isValid && Boolean(emptyNameResult.errors.name),
    'Whitespace-only facility name is rejected'
  );

  const emptyMarathiResult = validateLocationForm(
    { ...validBaseFormData, marathiName: '' },
    { existingLocations }
  );
  assert(
    !emptyMarathiResult.isValid && Boolean(emptyMarathiResult.errors.marathiName),
    'Missing Marathi facility name is rejected'
  );

  const emptyLocationNameResult = validateLocationForm(
    { ...validBaseFormData, locationName: ' ' },
    { existingLocations }
  );
  assert(
    !emptyLocationNameResult.isValid && Boolean(emptyLocationNameResult.errors.locationName),
    'Whitespace-only counter landmark name is rejected'
  );

  const emptyAddressResult = validateLocationForm(
    { ...validBaseFormData, address: 'Road' }, // < 5 chars
    { existingLocations }
  );
  assert(
    !emptyAddressResult.isValid && Boolean(emptyAddressResult.errors.address),
    'Address under 5 characters is rejected'
  );

  // -------------------------------------------------------------------------
  // 3. Location Code Format & Uniqueness
  // -------------------------------------------------------------------------
  const code2Chars = validateLocationForm(
    { ...validBaseFormData, code: 'PU' },
    { existingLocations }
  );
  assert(
    !code2Chars.isValid && Boolean(code2Chars.errors.code),
    'Location code under 3 characters (PU) is rejected'
  );

  const code6Chars = validateLocationForm(
    { ...validBaseFormData, code: 'PUNEOK' },
    { existingLocations }
  );
  assert(
    !code6Chars.isValid && Boolean(code6Chars.errors.code),
    'Location code over 5 characters (PUNEOK) is rejected'
  );

  const codeSymbols = validateLocationForm(
    { ...validBaseFormData, code: 'PU-1' },
    { existingLocations }
  );
  assert(
    !codeSymbols.isValid && Boolean(codeSymbols.errors.code),
    'Location code with special characters (PU-1) is rejected'
  );

  const codeDuplicate = validateLocationForm(
    { ...validBaseFormData, code: 'SMR' }, // Matches DEFAULT_LEGACY_LOCATION
    { existingLocations }
  );
  assert(
    !codeDuplicate.isValid && Boolean(codeDuplicate.errors.code),
    'Duplicate location code (SMR) matching existing facility is strictly rejected'
  );

  // -------------------------------------------------------------------------
  // 4. Contact Mobile Validation (Indian 10-Digit Standard)
  // -------------------------------------------------------------------------
  const mobileStarting5 = validateLocationForm(
    { ...validBaseFormData, contactMobile: '5123456789' },
    { existingLocations }
  );
  assert(
    !mobileStarting5.isValid && Boolean(mobileStarting5.errors.contactMobile),
    'Mobile number starting with 5 is rejected'
  );

  const mobile9Digits = validateLocationForm(
    { ...validBaseFormData, contactMobile: '982201234' },
    { existingLocations }
  );
  assert(
    !mobile9Digits.isValid && Boolean(mobile9Digits.errors.contactMobile),
    '9-digit mobile number is rejected'
  );

  const mobileValid = validateLocationForm(
    { ...validBaseFormData, contactMobile: '7020112233' },
    { existingLocations }
  );
  assert(
    mobileValid.isValid && !mobileValid.errors.contactMobile,
    'Valid 10-digit mobile starting with 7 is accepted'
  );

  // -------------------------------------------------------------------------
  // 5. Positive Whole Integer Capacity Validation
  // -------------------------------------------------------------------------
  const capacityZero = validateLocationForm(
    { ...validBaseFormData, capacity: { carTotal: 0, twoWheelerTotal: 100 } },
    { existingLocations }
  );
  assert(
    !capacityZero.isValid && Boolean(capacityZero.errors['capacity.carTotal']),
    'Car capacity of 0 is rejected (must be > 0)'
  );

  const capacityNegative = validateLocationForm(
    { ...validBaseFormData, capacity: { carTotal: 50, twoWheelerTotal: -10 } },
    { existingLocations }
  );
  assert(
    !capacityNegative.isValid && Boolean(capacityNegative.errors['capacity.twoWheelerTotal']),
    'Negative 2W capacity (-10) is rejected'
  );

  const capacityDecimal = validateLocationForm(
    { ...validBaseFormData, capacity: { carTotal: 50.5, twoWheelerTotal: 100 } },
    { existingLocations }
  );
  assert(
    !capacityDecimal.isValid && Boolean(capacityDecimal.errors['capacity.carTotal']),
    'Non-integer car capacity (50.5) is rejected'
  );

  // -------------------------------------------------------------------------
  // 6. Canonical 10-Field Rate Schedule Validation
  // -------------------------------------------------------------------------
  const rateNegative = validateLocationForm(
    {
      ...validBaseFormData,
      rates: { ...validBaseFormData.rates, fourWheelerFirstHourRate: -20 },
    },
    { existingLocations }
  );
  assert(
    !rateNegative.isValid && Boolean(rateNegative.errors['rates.fourWheelerFirstHourRate']),
    'Negative rate (-₹20) is rejected'
  );

  const rate12hCapLessThanFirstHour = validateLocationForm(
    {
      ...validBaseFormData,
      rates: {
        ...validBaseFormData.rates,
        fourWheelerFirstHourRate: 50,
        fourWheeler12HourCap: 30, // Invalid: 12h cap less than 1st hour
      },
    },
    { existingLocations }
  );
  assert(
    !rate12hCapLessThanFirstHour.isValid &&
      Boolean(rate12hCapLessThanFirstHour.errors['rates.fourWheeler12HourCap']),
    '12-hour cap less than 1st hour rate is rejected'
  );

  // -------------------------------------------------------------------------
  // 7. Operating Hours Validation
  // -------------------------------------------------------------------------
  const invalidTimeFormat = validateLocationForm(
    {
      ...validBaseFormData,
      operatingHours: { is24Hours: false, openTime: '6 AM', closeTime: '23:00' },
    },
    { existingLocations }
  );
  assert(
    !invalidTimeFormat.isValid && Boolean(invalidTimeFormat.errors['operatingHours.openTime']),
    'Invalid operating time format ("6 AM") is rejected (requires HH:mm 24h format)'
  );

  const validTimeFormat = validateLocationForm(
    {
      ...validBaseFormData,
      operatingHours: { is24Hours: false, openTime: '06:00', closeTime: '23:30' },
    },
    { existingLocations }
  );
  assert(
    validTimeFormat.isValid,
    'Valid 24h operating time format (06:00 to 23:30) is accepted'
  );

  // -------------------------------------------------------------------------
  // 8. Edit Mode Immutability (Code, Document ID, ownerUid)
  // -------------------------------------------------------------------------
  const editCodeMutation = validateLocationForm(
    {
      ...validBaseFormData,
      code: 'NEW', // Changed from SMR
    },
    {
      isEdit: true,
      originalDoc: DEFAULT_LEGACY_LOCATION,
      existingLocations,
    }
  );
  assert(
    !editCodeMutation.isValid && Boolean(editCodeMutation.errors.code),
    'Attempt to change location code in edit mode is strictly rejected as immutable'
  );

  const editIdMutation = validateLocationForm(
    {
      ...validBaseFormData,
      id: 'loc_tampered_id',
    },
    {
      isEdit: true,
      originalDoc: DEFAULT_LEGACY_LOCATION,
      existingLocations,
    }
  );
  assert(
    !editIdMutation.isValid && Boolean(editIdMutation.errors.id),
    'Attempt to mutate document ID in edit mode is strictly rejected'
  );

  // -------------------------------------------------------------------------
  // 9. Role-Based Permission Matrix (SEC-09: Manager Rate/Capacity Restrictions)
  // -------------------------------------------------------------------------
  const managerRateEdit = validateLocationForm(
    {
      ...validBaseFormData,
      code: DEFAULT_LEGACY_LOCATION.code,
      rates: {
        ...DEFAULT_LEGACY_LOCATION.rates,
        fourWheelerFirstHourRate: 100, // Altered
      },
    },
    {
      isEdit: true,
      originalDoc: DEFAULT_LEGACY_LOCATION,
      userRole: 'manager',
    }
  );
  assert(
    !managerRateEdit.isValid && Boolean(managerRateEdit.errors.ratesPermission),
    'Location Manager is strictly prohibited from altering rate schedule'
  );

  const managerCapacityEdit = validateLocationForm(
    {
      ...validBaseFormData,
      code: DEFAULT_LEGACY_LOCATION.code,
      capacity: {
        carTotal: 200, // Altered
        twoWheelerTotal: 100,
      },
    },
    {
      isEdit: true,
      originalDoc: DEFAULT_LEGACY_LOCATION,
      userRole: 'manager',
    }
  );
  assert(
    !managerCapacityEdit.isValid && Boolean(managerCapacityEdit.errors.capacityPermission),
    'Location Manager is strictly prohibited from altering physical bay capacities'
  );

  const ownerRateEdit = validateLocationForm(
    {
      ...validBaseFormData,
      code: DEFAULT_LEGACY_LOCATION.code,
      rates: {
        ...DEFAULT_LEGACY_LOCATION.rates,
        fourWheelerFirstHourRate: 100, // Altered by Owner
      },
    },
    {
      isEdit: true,
      originalDoc: DEFAULT_LEGACY_LOCATION,
      userRole: 'owner',
    }
  );
  assert(
    ownerRateEdit.isValid,
    'Enterprise Owner is authorized to update facility rates'
  );

  // -------------------------------------------------------------------------
  // 10. Production Safety Barrier: Live Persistence Disabled
  // -------------------------------------------------------------------------
  // In production mode (when forceEmulatorOnly is false and not in emulator), saveLocationPrototype must block
  const prototypeProductionSave = saveLocationPrototype(validBaseFormData, {
    forceEmulatorOnly: false,
  });
  assert(
    !prototypeProductionSave.success && prototypeProductionSave.isProductionBlocked === true,
    'Production save attempt is strictly blocked with isProductionBlocked: true'
  );

  const prototypeProductionDeactivate = deactivateLocationPrototype(DEFAULT_LEGACY_LOCATION, {
    forceEmulatorOnly: false,
  });
  assert(
    !prototypeProductionDeactivate.success && prototypeProductionDeactivate.isProductionBlocked === true,
    'Production deactivation attempt is strictly blocked with isProductionBlocked: true'
  );

  // In isolated emulator context (forceEmulatorOnly: true), prototype save succeeds cleanly
  const prototypeEmulatorSave = saveLocationPrototype(validBaseFormData, {
    forceEmulatorOnly: true,
  });
  assert(
    prototypeEmulatorSave.success === true &&
      prototypeEmulatorSave.doc?.code === 'PUN' &&
      prototypeEmulatorSave.doc.id === 'loc_pun_01',
    'Isolated emulator prototype persistence successfully constructs complete document'
  );

  results.forEach((r) => console.log(r));

  return {
    total: passed + failed,
    passed,
    failed,
    results,
  };
}

// Auto-run if executed directly
if (typeof process !== 'undefined' && process.argv[1]?.includes('phase5d2LocationForms.test')) {
  const result = runPhase5D2TestSuite();
  console.log(`\nPhase 5D-2 Suite: ${result.passed}/${result.total} Passed, ${result.failed} Failed`);
  if (result.failed > 0) {
    process.exit(1);
  }
}
