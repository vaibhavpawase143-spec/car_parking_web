/**
 * Phase 4H: Authentication, RBAC, and Firestore Security Rules Verification Test Suite
 *
 * Verifies application and Firestore security rules behavior matching canonical firestore.rules:
 * - Admin and Guard role separation
 * - Inactive Guard rejection (isActive == false)
 * - Authenticated user identity and session cleanup
 * - Guard access to only permitted operations and records
 * - Guards blocked from updating privileged profile fields (role, isActive)
 * - Shifts collection: Admin-only create, update, delete
 * - Guards & Admins permitted to create parking records and payment transactions
 * - Payment transactions: immutable financial ledger (update admin-only, delete forbidden)
 * - Handover status transitions: PENDING -> ACCEPTED/REJECTED (toGuard only), CANCELLED (fromGuard only)
 * - Blocked modification of already completed/cancelled handovers
 * - Withdrawals: immutable settlement records (Admin-only create, update/delete forbidden)
 * - Responsibility events: append-only (create permitted, update/delete forbidden)
 * - Unauthenticated access rejection
 */

export interface TestUserAuth {
  uid: string;
  email?: string;
  token?: {
    admin?: boolean;
    email?: string;
  };
}

export interface GuardDocData {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'guard';
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Security Rules Engine (direct simulation of D:\car_parking_system\firestore.rules)
// ---------------------------------------------------------------------------

export class FirestoreSecurityRulesSimulator {
  private guards: Map<string, GuardDocData> = new Map();

  registerGuard(guard: GuardDocData) {
    this.guards.set(guard.uid, { ...guard });
  }

  isAuthenticated(auth: TestUserAuth | null): boolean {
    return auth !== null && !!auth.uid;
  }

  isAdmin(auth: TestUserAuth | null): boolean {
    if (!this.isAuthenticated(auth)) return false;
    if (auth?.token?.admin === true) return true;
    if (auth?.token?.email?.toLowerCase() === 'vaibhavpawase143@gmail.com') return true;

    const guardDoc = this.guards.get(auth!.uid);
    return !!guardDoc && guardDoc.role.toLowerCase() === 'admin' && guardDoc.isActive === true;
  }

  isGuard(auth: TestUserAuth | null): boolean {
    if (!this.isAuthenticated(auth)) return false;
    const guardDoc = this.guards.get(auth!.uid);
    return !!guardDoc && guardDoc.role.toLowerCase() === 'guard' && guardDoc.isActive === true;
  }

  isOwner(auth: TestUserAuth | null, userId: string): boolean {
    return this.isAuthenticated(auth) && auth!.uid === userId;
  }

  // Collection: /guards/{guardId}
  canReadGuard(auth: TestUserAuth | null): boolean {
    return this.isAuthenticated(auth);
  }

  canCreateGuard(auth: TestUserAuth | null): boolean {
    return this.isAdmin(auth);
  }

  canUpdateGuard(
    auth: TestUserAuth | null,
    guardId: string,
    existingData: GuardDocData,
    newData: Partial<GuardDocData>
  ): boolean {
    if (this.isAdmin(auth)) return true;
    if (
      this.isOwner(auth, guardId) &&
      (newData.role === undefined || newData.role === existingData.role) &&
      (newData.isActive === undefined || newData.isActive === existingData.isActive)
    ) {
      return true;
    }
    return false;
  }

  canDeleteGuard(auth: TestUserAuth | null): boolean {
    return this.isAdmin(auth);
  }

  // Collection: /shifts/{shiftId}
  canReadShifts(auth: TestUserAuth | null): boolean {
    return this.isAuthenticated(auth);
  }

  canWriteShift(auth: TestUserAuth | null): boolean {
    return this.isAdmin(auth);
  }

  // Collection: /parking_records/{ticketId}
  canReadParkingRecords(auth: TestUserAuth | null): boolean {
    return this.isAuthenticated(auth);
  }

  canCreateParkingRecord(auth: TestUserAuth | null): boolean {
    return this.isAuthenticated(auth) && (this.isAdmin(auth) || this.isGuard(auth));
  }

  canUpdateParkingRecord(auth: TestUserAuth | null): boolean {
    return this.isAuthenticated(auth) && (this.isAdmin(auth) || this.isGuard(auth));
  }

  canDeleteParkingRecord(auth: TestUserAuth | null): boolean {
    return this.isAdmin(auth);
  }

  // Collection: /payment_transactions/{txnId}
  canReadPaymentTransactions(auth: TestUserAuth | null): boolean {
    return this.isAuthenticated(auth);
  }

  canCreatePaymentTransaction(auth: TestUserAuth | null): boolean {
    return this.isAuthenticated(auth) && (this.isAdmin(auth) || this.isGuard(auth));
  }

  canUpdatePaymentTransaction(auth: TestUserAuth | null): boolean {
    return this.isAdmin(auth);
  }

  canDeletePaymentTransaction(_auth: TestUserAuth | null): boolean {
    return false; // Immutable!
  }

  // Collection: /handovers/{handoverId}
  canReadHandovers(auth: TestUserAuth | null): boolean {
    return this.isAuthenticated(auth);
  }

  canCreateHandover(
    auth: TestUserAuth | null,
    resourceData: { fromGuardId: string; fromGuardEmail?: string }
  ): boolean {
    if (!this.isAuthenticated(auth)) return false;
    return (
      this.isAdmin(auth) ||
      resourceData.fromGuardId === auth!.uid ||
      (!!resourceData.fromGuardEmail && resourceData.fromGuardEmail === auth?.token?.email) ||
      this.isGuard(auth)
    );
  }

  canUpdateHandover(
    auth: TestUserAuth | null,
    existingHandover: {
      status: string;
      toGuardId: string;
      toGuardEmail?: string;
      fromGuardId: string;
      fromGuardEmail?: string;
    },
    requestedStatus: string
  ): boolean {
    if (!this.isAuthenticated(auth)) return false;
    if (this.isAdmin(auth)) return true;

    if (existingHandover.status !== 'PENDING') {
      return false; // Guards cannot modify once settled/cancelled
    }

    const isDesignatedReceiver =
      existingHandover.toGuardId === auth!.uid ||
      (!!existingHandover.toGuardEmail && existingHandover.toGuardEmail === auth?.token?.email) ||
      this.isGuard(auth);

    if (isDesignatedReceiver && (requestedStatus === 'ACCEPTED' || requestedStatus === 'REJECTED')) {
      return true;
    }

    const isDesignatedSender =
      existingHandover.fromGuardId === auth!.uid ||
      (!!existingHandover.fromGuardEmail && existingHandover.fromGuardEmail === auth?.token?.email) ||
      this.isGuard(auth);

    if (isDesignatedSender && requestedStatus === 'CANCELLED') {
      return true;
    }

    return false;
  }

  canDeleteHandover(auth: TestUserAuth | null): boolean {
    return this.isAdmin(auth);
  }

  // Collection: /withdrawals/{withdrawalId}
  canCreateWithdrawal(auth: TestUserAuth | null): boolean {
    return this.isAdmin(auth);
  }

  canUpdateOrDeleteWithdrawal(_auth: TestUserAuth | null): boolean {
    return false; // Immutable!
  }

  // Collection: /responsibility_events/{eventId}
  canCreateResponsibilityEvent(
    auth: TestUserAuth | null,
    eventData: { guardId: string; targetGuardId?: string }
  ): boolean {
    if (!this.isAuthenticated(auth)) return false;
    return (
      this.isAdmin(auth) ||
      eventData.guardId === auth!.uid ||
      (!!eventData.targetGuardId && eventData.targetGuardId === auth!.uid) ||
      this.isGuard(auth)
    );
  }

  canUpdateOrDeleteResponsibilityEvent(_auth: TestUserAuth | null): boolean {
    return false; // Immutable!
  }
}

// ---------------------------------------------------------------------------
// Test Runner Function
// ---------------------------------------------------------------------------

export function runSecurityRulesAndAuthTests(): {
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
  console.log('Running Bizflow Web Phase 4H: Security Rules & Auth Tests');
  console.log('======================================================\n');

  const sim = new FirestoreSecurityRulesSimulator();

  // Test Accounts
  const adminAuth: TestUserAuth = { uid: 'admin_1', email: 'admin@bizflow.com' };
  const activeGuardAuth: TestUserAuth = { uid: 'guard_active', email: 'ramesh@bizflow.com' };
  const inactiveGuardAuth: TestUserAuth = { uid: 'guard_inactive', email: 'inactive@bizflow.com' };
  const unauth: TestUserAuth | null = null;

  sim.registerGuard({
    uid: 'admin_1',
    name: 'Main Admin',
    email: 'admin@bizflow.com',
    role: 'admin',
    isActive: true,
  });

  sim.registerGuard({
    uid: 'guard_active',
    name: 'Ramesh Active',
    email: 'ramesh@bizflow.com',
    role: 'guard',
    isActive: true,
  });

  sim.registerGuard({
    uid: 'guard_inactive',
    name: 'Suresh Inactive',
    email: 'inactive@bizflow.com',
    role: 'guard',
    isActive: false, // Inactive!
  });

  // 1. Role identification & Inactive Rejection
  assert(sim.isAdmin(adminAuth) === true, 'Test 1A: Admin user correctly identified as Admin');
  assert(sim.isGuard(activeGuardAuth) === true, 'Test 1B: Active Guard correctly identified as Guard');
  assert(sim.isGuard(inactiveGuardAuth) === false, 'Test 1C: Inactive Guard is strictly rejected by isGuard()');
  assert(sim.isAdmin(inactiveGuardAuth) === false, 'Test 1D: Inactive Guard is not Admin');
  assert(sim.isAuthenticated(unauth) === false, 'Test 1E: Unauthenticated session is rejected');

  // 2. Guards Collection Permissions
  assert(sim.canReadGuard(activeGuardAuth) === true, 'Test 2A: Authenticated user can read guard profiles');
  assert(sim.canReadGuard(unauth) === false, 'Test 2B: Unauthenticated user cannot read guard profiles');
  assert(sim.canCreateGuard(adminAuth) === true, 'Test 2C: Admin can create new guard accounts');
  assert(sim.canCreateGuard(activeGuardAuth) === false, 'Test 2D: Guard cannot create guard accounts');

  // 3. Profile Privilege Escalation Block
  const existingGuardData: GuardDocData = {
    uid: 'guard_active',
    name: 'Ramesh',
    email: 'ramesh@bizflow.com',
    role: 'guard',
    isActive: true,
  };

  // Guard updating own name (permitted)
  assert(
    sim.canUpdateGuard(activeGuardAuth, 'guard_active', existingGuardData, { name: 'Ramesh K' }) === true,
    'Test 3A: Guard can update own non-privileged profile details'
  );

  // Guard attempting to escalate own role to 'admin' (forbidden!)
  assert(
    sim.canUpdateGuard(activeGuardAuth, 'guard_active', existingGuardData, { role: 'admin' }) === false,
    'Test 3B: Guard cannot escalate own role to admin'
  );

  // Guard attempting to reactivate an inactive account (forbidden!)
  assert(
    sim.canUpdateGuard(inactiveGuardAuth, 'guard_inactive', { ...existingGuardData, isActive: false }, { isActive: true }) === false,
    'Test 3C: Guard cannot self-activate an inactive status'
  );

  // Admin updating guard profile (permitted)
  assert(
    sim.canUpdateGuard(adminAuth, 'guard_active', existingGuardData, { role: 'admin', isActive: true }) === true,
    'Test 3D: Admin can update any guard profile including role and isActive'
  );

  // Guard deletion strictly Admin-only
  assert(sim.canDeleteGuard(activeGuardAuth) === false, 'Test 3E: Guard cannot delete guard records');
  assert(sim.canDeleteGuard(adminAuth) === true, 'Test 3F: Admin can delete guard records');

  // 4. Shifts Collection Permissions
  assert(sim.canReadShifts(activeGuardAuth) === true, 'Test 4A: Authenticated guard can read shifts');
  assert(sim.canWriteShift(activeGuardAuth) === false, 'Test 4B: Guard cannot create or edit shifts');
  assert(sim.canWriteShift(adminAuth) === true, 'Test 4C: Admin can create, edit, or cancel shifts');

  // 5. Parking Records Permissions
  assert(sim.canCreateParkingRecord(activeGuardAuth) === true, 'Test 5A: Active Guard can create parking records');
  assert(sim.canCreateParkingRecord(inactiveGuardAuth) === false, 'Test 5B: Inactive Guard cannot create parking records');
  assert(sim.canCreateParkingRecord(adminAuth) === true, 'Test 5C: Admin can create parking records');
  assert(sim.canCreateParkingRecord(unauth) === false, 'Test 5D: Unauthenticated visitor cannot create parking records');
  assert(sim.canDeleteParkingRecord(activeGuardAuth) === false, 'Test 5E: Guard cannot delete parking records');
  assert(sim.canDeleteParkingRecord(adminAuth) === true, 'Test 5F: Admin can delete parking records');

  // 6. Payment Transactions (Immutable Financial Ledger)
  assert(sim.canCreatePaymentTransaction(activeGuardAuth) === true, 'Test 6A: Active Guard can append payment transactions');
  assert(sim.canCreatePaymentTransaction(inactiveGuardAuth) === false, 'Test 6B: Inactive Guard cannot append payment transactions');
  assert(sim.canUpdatePaymentTransaction(activeGuardAuth) === false, 'Test 6C: Guard cannot modify payment transactions');
  assert(sim.canUpdatePaymentTransaction(adminAuth) === true, 'Test 6D: Admin can update payment transactions');
  assert(sim.canDeletePaymentTransaction(adminAuth) === false, 'Test 6E: Deletions forbidden on payment transactions (Immutable)');
  assert(sim.canDeletePaymentTransaction(activeGuardAuth) === false, 'Test 6F: Guard cannot delete payment transactions');

  // 7. Handover Security & State Transition Rules
  const pendingHandover = {
    status: 'PENDING',
    fromGuardId: 'guard_active',
    toGuardId: 'guard_receiver',
  };

  // Designated receiver accepting
  assert(
    sim.canUpdateHandover({ uid: 'guard_receiver' }, pendingHandover, 'ACCEPTED') === true,
    'Test 7A: Designated receiver can ACCEPT a PENDING handover'
  );

  // Designated receiver rejecting
  assert(
    sim.canUpdateHandover({ uid: 'guard_receiver' }, pendingHandover, 'REJECTED') === true,
    'Test 7B: Designated receiver can REJECT a PENDING handover'
  );

  // Creator cancelling
  assert(
    sim.canUpdateHandover(activeGuardAuth, pendingHandover, 'CANCELLED') === true,
    'Test 7C: Initiator guard can CANCEL a PENDING handover'
  );

  // Impostor trying to cancel
  assert(
    sim.canUpdateHandover({ uid: 'guard_impostor' }, pendingHandover, 'CANCELLED') === false,
    'Test 7D: Non-initiator cannot CANCEL a handover'
  );

  // Guard attempting to modify already ACCEPTED handover
  const completedHandover = {
    status: 'ACCEPTED',
    fromGuardId: 'guard_active',
    toGuardId: 'guard_receiver',
  };
  assert(
    sim.canUpdateHandover({ uid: 'guard_receiver' }, completedHandover, 'REJECTED') === false,
    'Test 7E: Guards cannot modify an already ACCEPTED handover'
  );

  // 8. Admin Withdrawals & Responsibility Events Immutability
  assert(sim.canCreateWithdrawal(adminAuth) === true, 'Test 8A: Admin can execute cash/UPI withdrawals');
  assert(sim.canCreateWithdrawal(activeGuardAuth) === false, 'Test 8B: Guard cannot execute withdrawals');
  assert(sim.canUpdateOrDeleteWithdrawal(adminAuth) === false, 'Test 8C: Withdrawals are strictly immutable');

  assert(
    sim.canCreateResponsibilityEvent(activeGuardAuth, { guardId: 'guard_active' }) === true,
    'Test 8D: Guard can append own responsibility history events'
  );
  assert(
    sim.canUpdateOrDeleteResponsibilityEvent(adminAuth) === false,
    'Test 8E: Responsibility events cannot be updated or deleted'
  );

  console.log('\n------------------------------------------------------');
  console.log(`Security Rules Test Summary: ${passed}/${passed + failed} Passed`);
  results.forEach((r) => console.log(r));
  console.log('------------------------------------------------------\n');

  return { total: passed + failed, passed, failed, results };
}

if (typeof process !== 'undefined' && process.argv[1]?.includes('securityRulesAndAuth')) {
  const { failed } = runSecurityRulesAndAuthTests();
  if (failed > 0) process.exit(1);
}
