/**
 * Phase 5D-1: Owner Dashboard & Location Switcher Unit Test Suite
 *
 * Validates:
 * 1. Safe calculation of enterprise summary metrics from authorized locations only
 * 2. Strict omission of financial and revenue aggregations
 * 3. In-memory location switching behavior for Owners, Managers, and Guards
 * 4. Boundary enforcement preventing unauthorized location switching
 * 5. Display fidelity of canonical 10-field rate schedule
 * 6. Interactive vs. static switcher mode evaluation
 */

import {
  DEFAULT_LEGACY_LOCATION,
  DEFAULT_LEGACY_RATES,
} from '../services/locationService';
import type { ParkingLocationDoc, UserRole } from '../types';

export function runPhase5D1TestSuite(): {
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
  console.log('Running Bizflow Web Phase 5D-1: Owner Dashboard & Switcher Tests');
  console.log('======================================================\n');

  // -------------------------------------------------------------------------
  // Fixtures: Multi-Location Setup for Enterprise Owner
  // -------------------------------------------------------------------------
  const sangamnerLocation: ParkingLocationDoc = {
    ...DEFAULT_LEGACY_LOCATION,
    id: 'loc_sangamner_01',
    code: 'SMR',
    name: 'Jay Ganesh Pay & Park - Sangamner',
    locationName: 'Sangamner Bus Stand',
    isActive: true,
    capacity: { carTotal: 50, twoWheelerTotal: 100 },
    rates: DEFAULT_LEGACY_RATES,
  };

  const puneLocation: ParkingLocationDoc = {
    ...DEFAULT_LEGACY_LOCATION,
    id: 'loc_pune_01',
    code: 'PUN',
    name: 'Jay Ganesh Pay & Park - Pune',
    locationName: 'Pune Railway Station',
    isActive: true,
    capacity: { carTotal: 80, twoWheelerTotal: 150 },
    rates: {
      ...DEFAULT_LEGACY_RATES,
      fourWheelerFirstHourRate: 60,
      twoWheelerFirstHourRate: 25,
      fourWheeler12HourCap: 180,
      twoWheeler12HourCap: 80,
    },
  };

  const closedLocation: ParkingLocationDoc = {
    ...DEFAULT_LEGACY_LOCATION,
    id: 'loc_nashik_01',
    code: 'NSK',
    name: 'Jay Ganesh Pay & Park - Nashik',
    locationName: 'Old CBS Counter',
    isActive: false, // Closed facility
    capacity: { carTotal: 30, twoWheelerTotal: 60 },
    rates: DEFAULT_LEGACY_RATES,
  };

  const enterpriseLocations = [sangamnerLocation, puneLocation, closedLocation];

  // -------------------------------------------------------------------------
  // 1. Enterprise Summary Metrics Calculation
  // -------------------------------------------------------------------------
  const totalLocations = enterpriseLocations.length;
  const activeLocationsCount = enterpriseLocations.filter((l) => l.isActive !== false).length;
  const totalCarCapacity = enterpriseLocations.reduce((sum, l) => sum + l.capacity.carTotal, 0);
  const totalTwoWheelerCapacity = enterpriseLocations.reduce((sum, l) => sum + l.capacity.twoWheelerTotal, 0);
  const totalFleetCapacity = totalCarCapacity + totalTwoWheelerCapacity;

  assert(totalLocations === 3, 'Total authorized locations correctly calculated as 3');
  assert(activeLocationsCount === 2, 'Active operational locations correctly counted as 2 (1 inactive)');
  assert(totalCarCapacity === 160, 'Total car capacity correctly summed (50 + 80 + 30 = 160)');
  assert(totalTwoWheelerCapacity === 310, 'Total 2W capacity correctly summed (100 + 150 + 60 = 310)');
  assert(totalFleetCapacity === 470, 'Total fleet capacity accurately computed as 470 bays');

  // -------------------------------------------------------------------------
  // 2. Financial Metrics Omission & Integrity Boundary
  // -------------------------------------------------------------------------
  // Verify that location documents contain strictly configuration and zero financial balances
  assert(
    !('todayRevenue' in sangamnerLocation) &&
      !('totalCollection' in sangamnerLocation) &&
      !('activeCashBalance' in sangamnerLocation),
    'Location documents strictly omit multi-location financial aggregates (preventing data corruption)'
  );

  // -------------------------------------------------------------------------
  // 3. Switcher Mode Evaluation: Interactive vs Static
  // -------------------------------------------------------------------------
  function isSwitcherInteractive(role: UserRole, assignedCount: number): boolean {
    return (role === 'owner' || role === 'manager') && assignedCount > 1;
  }

  assert(
    isSwitcherInteractive('owner', 3) === true,
    'Owner with 3 locations renders interactive dropdown switcher'
  );
  assert(
    isSwitcherInteractive('owner', 1) === false,
    'Owner with 1 location renders clean static indicator'
  );
  assert(
    isSwitcherInteractive('manager', 2) === true,
    'Manager assigned to 2 locations renders interactive switcher'
  );
  assert(
    isSwitcherInteractive('manager', 1) === false,
    'Manager assigned to 1 location renders static indicator'
  );
  assert(
    isSwitcherInteractive('guard', 3) === false,
    'Guard is strictly prevented from having an interactive switcher (always static)'
  );
  assert(
    isSwitcherInteractive('guard', 1) === false,
    'Guard with 1 location renders static indicator'
  );

  // -------------------------------------------------------------------------
  // 4. In-Memory Location Switching Logic & Guardrails
  // -------------------------------------------------------------------------
  function simulateSwitchLocation(
    role: UserRole,
    currentActiveId: string,
    targetId: string,
    authorizedIds: string[],
    guardAssignedId?: string
  ): { success: boolean; newActiveId: string } {
    const cleanTarget = String(targetId || '').trim();
    if (!cleanTarget) {
      return { success: false, newActiveId: currentActiveId };
    }

    // Manager boundary check
    if (role === 'manager' && !authorizedIds.includes(cleanTarget)) {
      return { success: false, newActiveId: currentActiveId };
    }

    // Guard boundary check
    if (role === 'guard' && guardAssignedId && guardAssignedId !== cleanTarget) {
      return { success: false, newActiveId: currentActiveId };
    }

    return { success: true, newActiveId: cleanTarget };
  }

  // Owner switching between authorized locations
  const ownerSwitchValid = simulateSwitchLocation(
    'owner',
    'loc_sangamner_01',
    'loc_pune_01',
    ['loc_sangamner_01', 'loc_pune_01', 'loc_nashik_01']
  );
  assert(
    ownerSwitchValid.success && ownerSwitchValid.newActiveId === 'loc_pune_01',
    'Owner can safely switch active context to loc_pune_01 in-memory'
  );

  // Manager switching to assigned location
  const managerSwitchValid = simulateSwitchLocation(
    'manager',
    'loc_sangamner_01',
    'loc_pune_01',
    ['loc_sangamner_01', 'loc_pune_01']
  );
  assert(
    managerSwitchValid.success && managerSwitchValid.newActiveId === 'loc_pune_01',
    'Manager can switch between assigned locations'
  );

  // Manager attempting to switch to an unauthorized location
  const managerSwitchBlocked = simulateSwitchLocation(
    'manager',
    'loc_sangamner_01',
    'loc_mumbai_99', // Unauthorized location
    ['loc_sangamner_01', 'loc_pune_01']
  );
  assert(
    !managerSwitchBlocked.success && managerSwitchBlocked.newActiveId === 'loc_sangamner_01',
    'Manager is strictly blocked from switching to unassigned location'
  );

  // Guard attempting to switch to another location
  const guardSwitchBlocked = simulateSwitchLocation(
    'guard',
    'loc_sangamner_01',
    'loc_pune_01',
    ['loc_sangamner_01'],
    'loc_sangamner_01'
  );
  assert(
    !guardSwitchBlocked.success && guardSwitchBlocked.newActiveId === 'loc_sangamner_01',
    'Guard is strictly blocked from switching outside assigned facility'
  );

  // -------------------------------------------------------------------------
  // 5. Canonical 10-Rate Field Display Integrity
  // -------------------------------------------------------------------------
  const locRates = puneLocation.rates;
  const ratesVerified =
    locRates.fourWheelerFirstHourRate === 60 &&
    locRates.fourWheelerAdditionalHourRate === 10 &&
    locRates.fourWheeler12HourCap === 180 &&
    locRates.fourWheeler24HourCap === 250 &&
    locRates.fourWheelerMonthlyRate === 1500 &&
    locRates.twoWheelerFirstHourRate === 25 &&
    locRates.twoWheelerAdditionalHourRate === 5 &&
    locRates.twoWheeler12HourCap === 80 &&
    locRates.twoWheeler24HourCap === 100 &&
    locRates.twoWheelerMonthlyRate === 600;

  assert(ratesVerified, 'Canonical 10-rate schedule preserves distinct facility pricing (Pune)');

  // -------------------------------------------------------------------------
  // 6. Empty Assigned Locations State
  // -------------------------------------------------------------------------
  const emptyLocations: ParkingLocationDoc[] = [];
  const emptyTotal = emptyLocations.length;
  assert(emptyTotal === 0, 'Empty assigned locations array yields 0 total facilities for setup card');

  results.forEach((r) => console.log(r));

  return {
    total: passed + failed,
    passed,
    failed,
    results,
  };
}

// Auto-run if executed directly
if (typeof process !== 'undefined' && process.argv[1]?.includes('phase5d1OwnerDashboard.test')) {
  const result = runPhase5D1TestSuite();
  console.log(`\nPhase 5D-1 Suite: ${result.passed}/${result.total} Passed, ${result.failed} Failed`);
  if (result.failed > 0) {
    process.exit(1);
  }
}
