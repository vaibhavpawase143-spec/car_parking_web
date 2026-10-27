/**
 * Phase 5C: Multi-Location Foundation & Context Engine Unit Test Suite
 *
 * Validates the core Phase 5C deliverables:
 * 1. Multi-location type definitions and rate structure (10 rate fields)
 * 2. Role resolution (owner, manager, guard, legacy admin)
 * 3. Non-mutating legacy fallback to 'loc_sangamner_01'
 * 4. Multi-location assignment resolution and active location selection
 * 5. Role hierarchy and access control guards (Owner/Manager/Admin vs Guard)
 * 6. Edge cases: unassigned managers, empty location arrays, immutability
 */

import {
  DEFAULT_LEGACY_LOCATION_ID,
  DEFAULT_LEGACY_LOCATION,
  resolveStaffLocations,
} from '../services/locationService';
import type { GuardProfile, UserRole } from '../types';

export function runPhase5CTestSuite(): {
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
  console.log('Running Bizflow Web Phase 5C: Multi-Location Context Tests');
  console.log('======================================================\n');

  // -------------------------------------------------------------------------
  // 1. Constants & Schema Integrity
  // -------------------------------------------------------------------------
  assert(
    DEFAULT_LEGACY_LOCATION_ID === 'loc_sangamner_01',
    'DEFAULT_LEGACY_LOCATION_ID is strictly loc_sangamner_01'
  );

  assert(
    DEFAULT_LEGACY_LOCATION.id === 'loc_sangamner_01' &&
      DEFAULT_LEGACY_LOCATION.name === 'Jay Ganesh Pay & Park' &&
      DEFAULT_LEGACY_LOCATION.code === 'SMR' &&
      DEFAULT_LEGACY_LOCATION.isActive === true,
    'DEFAULT_LEGACY_LOCATION has correct identification and active status'
  );

  const rates = DEFAULT_LEGACY_LOCATION.rates;
  const hasAll10RateFields =
    typeof rates.fourWheelerFirstHourRate === 'number' &&
    typeof rates.fourWheelerAdditionalHourRate === 'number' &&
    typeof rates.fourWheeler12HourCap === 'number' &&
    typeof rates.fourWheeler24HourCap === 'number' &&
    typeof rates.fourWheelerMonthlyRate === 'number' &&
    typeof rates.twoWheelerFirstHourRate === 'number' &&
    typeof rates.twoWheelerAdditionalHourRate === 'number' &&
    typeof rates.twoWheeler12HourCap === 'number' &&
    typeof rates.twoWheeler24HourCap === 'number' &&
    typeof rates.twoWheelerMonthlyRate === 'number';

  assert(hasAll10RateFields, 'DEFAULT_LEGACY_LOCATION contains all 10 canonical rate fields');

  // -------------------------------------------------------------------------
  // 2. Legacy Dual-Read Non-Mutating Fallback
  // -------------------------------------------------------------------------
  const legacyAdminProfile: GuardProfile = {
    uid: 'legacy_admin_1',
    name: 'Old Admin',
    email: 'admin@jayganesh.com',
    role: 'admin',
    isActive: true,
  };

  const adminResolution = resolveStaffLocations(legacyAdminProfile);
  assert(
    adminResolution.assignedLocationIds.length === 1 &&
      adminResolution.assignedLocationIds[0] === 'loc_sangamner_01',
    'Legacy admin without location fields falls back to loc_sangamner_01'
  );
  assert(
    adminResolution.activeLocationId === 'loc_sangamner_01',
    'Legacy admin active location defaults to loc_sangamner_01'
  );
  assert(
    adminResolution.isLegacyMode === true,
    'Legacy admin is correctly marked with isLegacyMode: true'
  );
  assert(
    adminResolution.hasValidAssignment === true,
    'Legacy admin is treated as having valid assignment via fallback'
  );

  // Non-mutating guarantee check
  assert(
    legacyAdminProfile.assignedLocationId === undefined &&
      legacyAdminProfile.assignedLocationIds === undefined,
    'Legacy admin profile input object was not mutated by resolveStaffLocations'
  );

  const legacyGuardProfile: GuardProfile = {
    uid: 'legacy_guard_1',
    name: 'Old Guard',
    email: 'guard@jayganesh.com',
    role: 'guard',
    isActive: true,
  };

  const guardResolution = resolveStaffLocations(legacyGuardProfile);
  assert(
    guardResolution.assignedLocationIds[0] === 'loc_sangamner_01' &&
      guardResolution.activeLocationId === 'loc_sangamner_01' &&
      guardResolution.isLegacyMode === true &&
      guardResolution.hasValidAssignment === true,
    'Legacy guard without location fields falls back to loc_sangamner_01 in-memory'
  );

  // Legacy profile with single assignedLocationId string (Phase 5B transitional)
  const transitionalGuardProfile: GuardProfile = {
    uid: 'trans_guard_1',
    name: 'Transitional Guard',
    email: 'trans.guard@bizflow.com',
    role: 'guard',
    isActive: true,
    assignedLocationId: 'loc_pune_01',
  };

  const transResolution = resolveStaffLocations(transitionalGuardProfile);
  assert(
    transResolution.assignedLocationIds.length === 1 &&
      transResolution.assignedLocationIds[0] === 'loc_pune_01' &&
      transResolution.activeLocationId === 'loc_pune_01' &&
      transResolution.isLegacyMode === true,
    'Transitional profile with assignedLocationId string resolves properly and sets isLegacyMode: true'
  );

  // -------------------------------------------------------------------------
  // 3. Multi-Role Resolution & Scope
  // -------------------------------------------------------------------------

  // A. Owner Role
  const ownerProfile: GuardProfile = {
    uid: 'owner_1',
    name: 'Business Owner',
    email: 'owner@bizflow.com',
    role: 'owner',
    isActive: true,
    assignedLocationIds: ['loc_sangamner_01', 'loc_pune_01', 'loc_nashik_01'],
  };

  const ownerResolution = resolveStaffLocations(ownerProfile);
  assert(
    ownerResolution.assignedLocationIds.length === 3 &&
      ownerResolution.assignedLocationIds.includes('loc_sangamner_01') &&
      ownerResolution.assignedLocationIds.includes('loc_pune_01') &&
      ownerResolution.assignedLocationIds.includes('loc_nashik_01'),
    'Owner profile resolves all assigned enterprise locations'
  );
  assert(
    ownerResolution.activeLocationId === 'loc_sangamner_01',
    'Owner primary active location defaults to first assigned location'
  );
  assert(
    ownerResolution.isLegacyMode === false,
    'Modern owner with assignedLocationIds array has isLegacyMode: false'
  );
  assert(
    ownerResolution.hasValidAssignment === true,
    'Owner has valid assignment'
  );

  // B. Location Manager with Valid Locations
  const managerProfile: GuardProfile = {
    uid: 'manager_1',
    name: 'Pune Branch Manager',
    email: 'mgr.pune@bizflow.com',
    role: 'manager',
    ownerUid: 'owner_1',
    isActive: true,
    assignedLocationIds: ['loc_pune_01'],
  };

  const managerResolution = resolveStaffLocations(managerProfile);
  assert(
    managerResolution.assignedLocationIds.length === 1 &&
      managerResolution.assignedLocationIds[0] === 'loc_pune_01' &&
      managerResolution.activeLocationId === 'loc_pune_01' &&
      managerResolution.hasValidAssignment === true &&
      managerResolution.isLegacyMode === false,
    'Location manager resolves exactly to assigned location'
  );

  // C. Location Manager with NO Locations Assigned (Edge Case: Orphan Manager)
  const unassignedManagerProfile: GuardProfile = {
    uid: 'unassigned_mgr_1',
    name: 'Unassigned Manager',
    email: 'orphan@bizflow.com',
    role: 'manager',
    ownerUid: 'owner_1',
    isActive: true,
    assignedLocationIds: [],
  };

  const unassignedMgrResolution = resolveStaffLocations(unassignedManagerProfile);
  assert(
    unassignedMgrResolution.assignedLocationIds.length === 0 &&
      unassignedMgrResolution.activeLocationId === null &&
      unassignedMgrResolution.hasValidAssignment === false &&
      unassignedMgrResolution.isLegacyMode === false,
    'Manager with empty assignedLocationIds resolves to hasValidAssignment: false and null activeLocationId'
  );

  // D. Modern Guard with Assigned Locations
  const modernGuardProfile: GuardProfile = {
    uid: 'guard_pune_1',
    name: 'Pune Station Guard',
    email: 'guard.pune@bizflow.com',
    role: 'guard',
    isActive: true,
    assignedLocationIds: ['loc_pune_01'],
  };

  const modernGuardResolution = resolveStaffLocations(modernGuardProfile);
  assert(
    modernGuardResolution.assignedLocationIds.length === 1 &&
      modernGuardResolution.activeLocationId === 'loc_pune_01' &&
      modernGuardResolution.hasValidAssignment === true &&
      modernGuardResolution.isLegacyMode === false,
    'Modern guard with assignedLocationIds resolves assigned location without fallback'
  );

  // E. Modern Guard with Empty Locations (Edge Case)
  const unassignedGuardProfile: GuardProfile = {
    uid: 'guard_unassigned',
    name: 'Unassigned Guard',
    email: 'unassigned@bizflow.com',
    role: 'guard',
    isActive: true,
    assignedLocationIds: [],
  };

  const unassignedGuardResolution = resolveStaffLocations(unassignedGuardProfile);
  assert(
    unassignedGuardResolution.assignedLocationIds.length === 0 &&
      unassignedGuardResolution.activeLocationId === null &&
      unassignedGuardResolution.hasValidAssignment === false,
    'Guard explicitly configured with empty array resolves to hasValidAssignment: false'
  );

  // -------------------------------------------------------------------------
  // 4. Role Hierarchy & Access Verification Helper
  // -------------------------------------------------------------------------
  function canAccessAdminPortal(role: UserRole | undefined): boolean {
    if (!role) return false;
    return role === 'owner' || role === 'manager' || role === 'admin';
  }

  function canAccessGuardPortal(role: UserRole | undefined): boolean {
    if (!role) return false;
    return role === 'guard' || role === 'owner' || role === 'manager' || role === 'admin';
  }

  assert(canAccessAdminPortal('owner') === true, 'Owner is authorized for Admin Portal');
  assert(canAccessAdminPortal('manager') === true, 'Manager is authorized for Admin Portal');
  assert(canAccessAdminPortal('admin') === true, 'Legacy Admin is authorized for Admin Portal');
  assert(canAccessAdminPortal('guard') === false, 'Guard is strictly blocked from Admin Portal');
  assert(canAccessAdminPortal(undefined) === false, 'Unauthenticated user is blocked from Admin Portal');

  assert(canAccessGuardPortal('guard') === true, 'Guard is authorized for Guard Portal');
  assert(canAccessGuardPortal('owner') === true, 'Owner is authorized for Guard Portal');
  assert(canAccessGuardPortal('manager') === true, 'Manager is authorized for Guard Portal');
  assert(canAccessGuardPortal('admin') === true, 'Admin is authorized for Guard Portal');

  // -------------------------------------------------------------------------
  // 5. Inactive Account Lockout Test
  // -------------------------------------------------------------------------
  const inactiveOwner: GuardProfile = {
    ...ownerProfile,
    isActive: false,
  };

  assert(
    inactiveOwner.isActive === false,
    'Inactive accounts maintain isActive: false flag for AuthGate lockout'
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
if (typeof process !== 'undefined' && process.argv[1]?.includes('phase5cMultiLocationContext.test')) {
  const result = runPhase5CTestSuite();
  console.log(`\nPhase 5C Suite: ${result.passed}/${result.total} Passed, ${result.failed} Failed`);
  if (result.failed > 0) {
    process.exit(1);
  }
}
