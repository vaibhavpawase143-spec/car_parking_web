# Bizflow Multi-Location Parking Management System
## Phase 5B: Architecture, Data Schema & Firestore Security Specification

**Document Version:** 1.1.1-REVISED  
**Target Application:** Bizflow / Jay Ganesh Pay & Park Web Application (`D:\car_parking_web`)  
**Phase Classification:** Architectural Planning, Data Modeling & Security Specification (Documentation Only)  
**Author:** Antigravity AI Engineering Team  
**Date:** October 19, 2026  
**Status:** REVISED SPECIFICATION — POST-AUDIT HARDENED (v1.1.1)  

---

> [!IMPORTANT]
> **Safety & Scope Declaration:**
> This document is strictly an architecture and security specification. It does **not** modify existing production code, Firebase security rules, Firestore schema, authentication records, or configuration. In accordance with Phase 5B constraints, no implementation, migration, deployment, or database mutation has been performed.

---

## Table of Contents
1. [Executive Summary & Phase 5A Baseline](#1-executive-summary--phase-5a-baseline)
2. [Approved Business Requirements (Fixed Decisions)](#2-approved-business-requirements-fixed-decisions)
3. [Role Hierarchy & Permission Matrix](#3-role-hierarchy--permission-matrix)
4. [Proposed Firestore Data Schema Specification](#4-proposed-firestore-data-schema-specification)
5. [Firestore Security Rules Architecture & Pseudocode](#5-firestore-security-rules-architecture--pseudocode)
6. [Security & Financial Invariants](#6-security--financial-invariants)
7. [Monthly Pass & Ticket Numbering Specifications](#7-monthly-pass--ticket-numbering-specifications)
8. [Cash Float, Handover, Shift & Exit Protocols](#8-cash-float-handover-shift--exit-protocols)
9. [Legacy Compatibility & Future Migration Strategy](#9-legacy-compatibility--future-migration-strategy)
10. [Existing Code Impact Map](#10-existing-code-impact-map)
11. [Threat & Risk Register](#11-threat--risk-register)
12. [Future Implementation Roadmap (Phases 5C onward)](#12-future-implementation-roadmap-phases-5c-onward)
13. [Testing Matrix & Acceptance Criteria](#13-testing-matrix--acceptance-criteria)
14. [Technical Notes & Non-Blocking Design Observations](#14-technical-notes--non-blocking-design-observations)
15. [Explicit Out-of-Scope Actions & Safety Confirmation](#15-explicit-out-of-scope-actions--safety-confirmation)

---

## 1. Executive Summary & Phase 5A Baseline

### 1.1 Context
The Bizflow Car Parking Web Application (`D:\car_parking_web`) was developed as a modern desktop/tablet counter interface for parking management. The Phase 5A audit confirmed that the system operates effectively for a **single physical parking location** (*"Jay Ganesh Pay & Park - Sangamner Bus Stand"*), but suffers from fundamental architectural blockers when scaled across multiple locations:

1. **Flat Collection Architecture:** All 14 Firestore collections (`parking_records`, `payment_transactions`, `shifts`, etc.) lack a mandatory `locationId` attribute.
2. **Global Single Counter:** Ticket generation relies on a single document `/counters/ticket_counter` with document IDs set to raw sequential integers (`"1001"`, `"1002"`), creating an immediate primary key collision risk under concurrent multi-location usage.
3. **Global Static Rate Card:** Rates and capacities are read from a single document `/settings/system_config` with hardcoded fallback defaults in client code.
4. **Binary Role Access:** Roles are strictly limited to `'admin' | 'guard'`, with no tenant or managerial tier.
5. **Open Security Rules:** Current `firestore.rules` permit any authenticated staff member to read all tickets, passes, shifts, and financial ledgers across the entire database.

### 1.2 Phase 5B Objective & Architectural Scope
Phase 5B establishes the complete technical blueprint for transforming `D:\car_parking_web` into an enterprise-grade multi-location architecture. 

**Architectural Scope Clarification (Single-Enterprise Multi-Location):**
Phase 5 explicitly targets a **Single-Enterprise Multi-Location** model where a single business entity (Jay Ganesh Pay & Park) operates multiple physical parking facilities (e.g., Sangamner Bus Stand, Nashik Gate Counter, Pune Railway Lot). To ensure future extensibility without redesign, all entities embed an `ownerUid` to support future multi-tenant franchise expansion, while enforcing strict intra-enterprise location boundaries today.

This specification formalizes:
- A hardened four-tier role hierarchy: **Owner → Location Manager → Guard → Legacy Admin**.
- Strict location isolation at the database, query, transaction, and UI layers.
- An independent, collision-free, location-prefixed ticket numbering engine with decoupled document IDs and an **idempotent two-phase entry request lifecycle** (`NF-05`).
- A hybrid monthly pass system (site-specific vs. universal) with **gate cross-validation and anti-concurrency lease protection** (`NF-02`).
- An authoritative, aligned rate-schedule snapshot model (`NF-01`).
- A **Trusted Server Boundary for Exit Fee Settlement** eliminating client-side arithmetic fee manipulation (`NF-04`).
- Reconciled Legacy Admin permissions for default-location staff management (`NF-03`).
- Complete backward compatibility, quarantine mechanisms for ambiguous historical records, and verified zero-downtime migration planning.

---

## 2. Approved Business Requirements (Fixed Decisions)

The following core business requirements are established as fixed, non-negotiable architectural constraints for the design:

### A. Monthly Passes: Hybrid Model
1. **Site-Specific Passes:** Standard monthly passes are valid exclusively at their issuing location (`primaryLocationId`). Attempting to redeem a site-specific pass at any other facility fails closed.
2. **Universal Passes:** Special enterprise or multi-facility passes may be issued with network-wide eligibility (`isUniversal: true` and an explicit `eligibleLocationIds: string[]` whitelist).
3. **Gate Cross-Validation:** Entry rules and gate transactions require full verification of the pass: pass exists, is `ACTIVE`, matches `normalizedVehicleNumber`, matches `vehicleType`, valid date range (`startDate <= now <= endDate`), and includes the gate's `locationId` in eligible locations (`NF-02`).
4. **Anti-Concurrency Pass Leases:** A pass cannot be used to park multiple vehicles simultaneously. Entry transactions atomically register an active pass stay lease (`active_passes/{passId}`) preventing concurrent or shared pass abuse (`NF-02`).
5. **Audit Trail:** Every redemption at an entry/exit gate records an immutable redemption record (`monthly_pass_redemptions`) binding the pass ID to the specific facility, gate guard, and timestamp.
6. **Migration Safety:** Existing historical passes in `monthly_passes` without location tags are treated as site-specific passes assigned to the legacy default location.

### B. Ticket Numbering: Location-Prefixed Independent Counters & Idempotent Lifecycle
1. **Independent Sequence Counters:** Each parking location maintains its own isolated counter document: `/counters/ticket_counter_{locationId}`.
2. **Prefixed Display Numbers:** Human-readable ticket numbers incorporate an official uppercase location prefix (e.g., `SMR-1001` for Sangamner, `NSK-1001` for Nashik).
3. **Decoupled Document IDs:** To eliminate database key collision risks, display ticket numbers (`ticketNumber`) are strictly decoupled from Firestore document IDs (`id` / `ticketId`). Document IDs use a deterministic compound format (`${locationId}_${sequenceNumber}`) or Firestore auto-IDs.
4. **Safe Two-Phase Photo & Counter Lifecycle:** External photo uploads to Cloudinary are executed *prior* to sequence reservation. Counter increment and entry record creation execute in a single atomic transaction. In the event of network failure or abort during photo upload, sequence integrity remains intact.
5. **Idempotent Entry Lifecycle:** Every entry request carries a client-generated `idempotencyKey`. An active occupancy document (`active_vehicles/${locationId}_${normalizedVehicleNumber}`) ensures that network retry attempts return the already-created ticket rather than incrementing the counter or duplicating active stays (`NF-05`). Subsequent visits after stay settlement execute normally.

### C. Rate Authority: Owner Only & Complete Schedule Snapshot
1. **Exclusive Control:** Only the verified business **Owner** (`role === 'owner'`) can create, modify, or deactivate parking rate schedules. Location Managers and Guards have zero rate modification privileges.
2. **Location-Bound Tariffs:** Each location stores its own independent rate schedule within its location profile (`locations/{locationId}.rates`).
3. **Complete Schedule Snapshot (`rateSnapshot`):** When a vehicle enters, an immutable copy of the location's complete authoritative rate schedule (`LocationRates`) is embedded directly into the `parking_records` document (`NF-01`). Security rules mandate exact equality with `/locations/{locationId}.rates` at the time of entry. Direct client-supplied rate injection is rejected. Subsequent rate modifications by the Owner never retroactively distort open tickets or historical reports.
4. **Fail-Closed Tariff Guard:** If a location lacks a valid, verified rate card, entry operations fail closed (`RateConfigurationMissingException`). Silent fallback to global or hardcoded defaults is strictly prohibited.

### D. Float Withdrawals: Assigned Location Manager with Audit Trail
1. **Authorized Custody:** A Location Manager may receive cash float settlements and execute withdrawals **only** for guards currently operating at a location the manager is explicitly assigned to manage.
2. **Auditable Settlement Records:** Every float withdrawal persists an immutable document in `/withdrawals` capturing: `withdrawalId`, `locationId`, `guardId`, `guardName`, `managerId`, `managerName`, `amount`, `type` (`CASH` or `UPI`), `shiftId`, `previousOutstanding`, `remainingOutstanding`, `reason`, and server timestamps.
3. **Trusted State Mutations:** Float balance deductions on staff profiles (`outstandingFloat.cash`) are executed via trusted server logic (Cloud Functions / Admin SDK) during withdrawal commits, preventing client-side balance spoofing.
4. **Owner Oversight:** The business Owner retains real-time visibility into all float withdrawals across all managed locations.

### E. Cross-Location Guard Shifts: Allowed Only After Full Settlement
1. **Settlement Gate:** A Guard is strictly blocked from opening an active shift or logging vehicle transactions at Location B while having an unclosed shift or unsettled float at Location A.
2. **Machine-Verifiable Definition of "Fully Settled":**
   - Active shift status at previous location is explicitly `COMPLETED` or `ENDED`.
   - Outstanding cash float is strictly ₹0.00 (`outstandingCash === 0`).
   - Outstanding UPI collection responsibility is strictly ₹0.00 (`outstandingUpi === 0`).
   - Zero incoming or outgoing handovers in `PENDING` state.
   - All physical cash has been transferred to a verified relieving guard via an accepted handover or surrendered to the assigned Location Manager via a recorded withdrawal.
3. **Trusted Server Enforcement:** Shift activation across locations requires a server-side boundary (Cloud Function or trusted Admin SDK endpoint) that verifies zero float and closed shifts prior to marking a shift `ACTIVE`. Direct client writes to activate shifts without verification are blocked.

### F. Manager Scope: One or Multiple Explicitly Assigned Locations
1. **Explicit Assignment:** Managerial authority is defined exclusively by the list of authorized location IDs in `managerProfile.assignedLocationIds: string[]`.
2. **Anti-Inference Rule:** Managerial permissions are never inferred from a role string alone. A user with `role: 'manager'` but an empty `assignedLocationIds` array has zero administrative access.
3. **Complete Boundary Isolation:** Every query, dashboard listener, report export, shift creation, staff assignment, and withdrawal initiated by a Manager must be filtered by `where('locationId', 'in', manager.assignedLocationIds)`.

### G. Trusted Financial Boundaries: Exit Fee Settlement
1. **No Client-Side Fee Calculation Dictation:** Authoritative fee calculations, duration rounding, cap applications, advance deductions, and refund determinations at exit are strictly computed and committed by a **Trusted Server Operation (Firebase Cloud Function / Admin SDK callable)** (`NF-04`).
2. **Immutable Exit State:** Firestore client security rules block direct client SDK writes to `grossCharge`, `finalAmount`, `refundAmount`, and `status: 'EXITED'`.

---

## 3. Role Hierarchy & Permission Matrix

### 3.1 Structural Hierarchy

```
                      ┌────────────────────────────────────────┐
                      │                 OWNER                  │
                      │  - Business-wide configuration         │
                      │  - Provision & deactivate locations    │
                      │  - Define & update location rates      │
                      │  - Consolidated cross-location reports │
                      │  - Assign & revoke Location Managers   │
                      └───────────────────┬────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
    ┌───────────────────────────┐                   ┌───────────────────────────┐
    │     LOCATION MANAGER      │                   │     LOCATION MANAGER      │
    │   (Location A: Sangamner) │                   │     (Location B: Nashik)  │
    │  - Manage Location A staff│                   │  - Manage Location B staff│
    │  - Roster Location A shift│                   │  - Roster Location B shift│
    │  - Location A withdrawals │                   │  - Location B withdrawals │
    │  - Location A reports     │                   │  - Location B reports     │
    └─────────────┬─────────────┘                   └─────────────┬─────────────┘
                  │                                               │
          ┌───────┴───────┐                               ┌───────┴───────┐
          ▼               ▼                               ▼               ▼
    ┌───────────┐   ┌───────────┐                   ┌───────────┐   ┌───────────┐
    │   GUARD   │   │   GUARD   │                   │   GUARD   │   │   GUARD   │
    │  Gate 1   │   │  Gate 2   │                   │  Gate 1   │   │  Gate 2   │
    │  (Loc A)  │   │  (Loc A)  │                   │  (Loc B)  │   │  (Loc B)  │
    └───────────┘   └───────────┘                   └───────────┘   └───────────┘
```

### 3.2 Distinction Principles
1. **Authentication vs. Authorization:** Authentication confirms staff identity via Firebase Auth UID. Authorization confirms whether that UID holds the required role and active assignment for the target `locationId`.
2. **Role vs. Assignment:** Role dictates *what capabilities* a user can execute; location assignment dictates *where* those capabilities may be exercised.
3. **Assigned Locations vs. Active Shift Location:** A Manager may be assigned to multiple locations (`assignedLocationIds: ['loc_a', 'loc_b']`), but a Guard can only operate at one *active shift location* (`shiftLocationId: 'loc_a'`) at any given moment.
4. **Legacy Admin Compatibility Mapping (`NF-03`):** The existing `'admin'` role is **not** enterprise `'owner'`. Instead, unmigrated `'admin'` accounts are mapped strictly to the default legacy facility (`loc_sangamner_01`) with Location Manager privileges for that site only. This includes managing guards at `loc_sangamner_01`, while strictly barring access, query execution, or staff management at newly provisioned locations.

### 3.3 Comprehensive Role-Permission Matrix

| Operational Capability | Owner | Location Manager | Guard | Legacy Admin (Unmigrated) | Enforcement Layer |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **System Settings (Global Business Name, Branding)** | ✅ Full | ❌ Denied | ❌ Denied | ⚠️ Legacy Only | Firestore Rules + Schema |
| **Create / Deactivate Parking Locations** | ✅ Full | ❌ Denied | ❌ Denied | ❌ Denied | Firestore Rules (`isOwner()`) |
| **Configure / Update Location Parking Rates** | ✅ Full | ❌ Denied | ❌ Denied | ❌ Denied | Firestore Rules (`isOwner()`) |
| **Assign / Reassign Location Managers** | ✅ Full | ❌ Denied | ❌ Denied | ❌ Denied | Firestore Rules (`isOwner()`) |
| **Assign / Reassign Guards to Locations** | ✅ Full | ✅ Assigned Locs Only | ❌ Denied | ⚠️ Default Loc Only (`NF-03`) | Firestore Rules (`canManageGuards()`) |
| **Create / Modify Staff Shift Schedules** | ✅ Full | ✅ Assigned Locs Only | ❌ Denied | ⚠️ Default Loc Only | Firestore Rules (`isManager(locId)`) |
| **Vehicle Gate Entry (Create Ticket & Slip)** | ✅ Override | ✅ Override | ✅ Active Shift Loc | ✅ Active Shift Loc | Firestore Rules + Atomic Transaction |
| **Vehicle Gate Exit (Authoritative Fee Settle)** | ✅ Override | ✅ Override | ✅ Active Shift Loc | ✅ Active Shift Loc | **Trusted Server Callable** (`NF-04`) |
| **Issue Site-Specific Monthly Passes** | ✅ Any Loc | ✅ Assigned Locs Only | ❌ Denied | ⚠️ Default Loc Only | Firestore Rules (`isManager(locId)`) |
| **Issue Universal Monthly Passes** | ✅ Full | ❌ Denied | ❌ Denied | ❌ Denied | Firestore Rules (`isOwner()`) |
| **Validate Monthly Pass at Gate** | ✅ Any Loc | ✅ Any Loc | ✅ Verified Eligibility | ✅ Default Loc | Transaction + Security Rule Guard (`NF-02`) |
| **Initiate Cash Handover** | ❌ N/A | ❌ N/A | ✅ Same Loc Only | ✅ Same Loc Only | Firestore Rules + Transaction |
| **Accept Cash Handover** | ❌ N/A | ❌ N/A | ✅ Same Loc Only | ✅ Same Loc Only | Firestore Rules + Trusted Server |
| **Withdraw Guard Cash Float** | ✅ Full | ✅ Assigned Locs Only | ❌ Denied | ⚠️ Default Loc Only | Firestore Rules + Trusted Server |
| **View Consolidated Business Reports** | ✅ Full | ❌ Denied | ❌ Denied | ❌ Denied | Query Filter (`where('ownerUid')`) |
| **View Location-Specific Reports & CSV** | ✅ Any Loc | ✅ Assigned Locs Only | ❌ Denied | ⚠️ Default Loc Only | Query Filter (`where('locationId')`) |
| **Cross-Location Shift Transfer** | ❌ N/A | ❌ N/A | ✅ Settlement-Gated | ❌ Denied | Trusted Server Boundary (Cloud Function) |
| **View Audit Logs** | ✅ Global | ✅ Assigned Locs Only | ❌ Denied | ⚠️ Default Loc Only (`NF-03`) | Firestore Rules |

---

## 4. Proposed Firestore Data Schema Specification

### 4.1 Schema Overview & Conventions
- **Collection Architecture:** Root collections with a mandatory, indexed `locationId: string` field.
- **Timestamps:** Handled exclusively via Firestore `serverTimestamp()` on create and update.
- **Amounts:** Non-negative integers or finite floats representing INR (₹). Negative values are strictly rejected.
- **Status Identifiers:** Uppercase snake-case enums (`ACTIVE`, `EXITED`, `CANCELLED`, `COMPLETED`, `PENDING`, `OCCUPIED`, `VACATED`).

---

### 4.2 Entity Specifications

#### Entity 1: `locations/{locationId}` (New Collection)
- **Purpose:** Primary registry of all physical parking branches/facilities under the enterprise.
- **Document ID Strategy:** Canonical slug or prefixed identifier (e.g., `loc_sangamner_01`, `loc_nashik_gate2`).
- **Classification:** NEW COLLECTION.

```typescript
export interface LocationRates {
  fourWheelerFirstHourRate: number;      // e.g. 50
  fourWheelerAdditionalHourRate: number;  // e.g. 10
  fourWheeler12HourCap: number;          // e.g. 150
  fourWheeler24HourCap: number;          // e.g. 250
  fourWheelerMonthlyRate: number;        // e.g. 1500
  twoWheelerFirstHourRate: number;       // e.g. 20
  twoWheelerAdditionalHourRate: number;  // e.g. 5
  twoWheeler12HourCap: number;           // e.g. 60
  twoWheeler24HourCap: number;           // e.g. 100
  twoWheelerMonthlyRate: number;         // e.g. 600
}

export interface ParkingLocationDoc {
  id: string;                         // e.g. "loc_sangamner_01"
  code: string;                       // Unique 3-5 char prefix: "SMR", "NSK", "PUN"
  name: string;                       // "Jay Ganesh Pay & Park"
  marathiName: string;                // "जय गणेश पे अँड पार्क"
  locationName: string;               // "Sangamner Bus Stand"
  marathiLocationName: string;        // "संगमनेर बसस्थानक"
  address: string;                    // Street, Landmark, City, Pincode
  authorityLicenseText: string;       // "म. रा. मा. परिवहन महामंडळाचे अधिकृत वाहनतळ"
  contactMobile: string;              // "9690793434"
  ownerUid: string;                   // Firebase Auth UID of business owner
  managerUids: string[];              // Array of authorized Manager UIDs
  isActive: boolean;                  // Administrative toggle (false halts gate entries)
  capacity: {
    carTotal: number;                 // e.g. 50
    twoWheelerTotal: number;          // e.g. 100
  };
  rates: LocationRates;
  operatingHours: {
    openTime: string;                 // "06:00" (24h format)
    closeTime: string;                // "23:00"
    is24Hours: boolean;               // true if continuously open
  };
  features: {
    cashEnabled: boolean;             // true
    upiEnabled: boolean;              // true
    advanceEnabled: boolean;          // true
    overnightParkingAllowed: boolean; // true
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

#### Entity 2: `guards/{uid}` (Staff Profiles — Extended Collection)
- **Purpose:** User profile registry for all personnel (Owners, Managers, Guards).
- **Document ID Strategy:** Matches Firebase Authentication `user.uid`.
- **Classification:** EXTENSION OF EXISTING COLLECTION.

```typescript
export interface StaffProfileDoc {
  uid: string;
  name: string;
  email: string;
  mobile: string;
  role: 'owner' | 'manager' | 'guard' | 'admin'; // 'admin' supported for legacy fallback
  isActive: boolean;
  ownerUid: string;                   // Parent enterprise owner UID
  assignedLocationId?: string;        // Mandatory for 'guard'
  assignedLocationIds?: string[];     // Mandatory for 'manager' (list of managed sites)
  currentShiftId?: string | null;     // ID of currently active shift
  shiftStatus?: 'active' | 'ended' | 'offline';
  shiftLocationId?: string | null;    // Location of currently active shift
  outstandingFloat?: {
    cash: number;                     // Authoritative unsettled cash
    upi: number;                      // Authoritative unsettled UPI
    lastReconciledAt: Timestamp;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

#### Entity 3: `counters/ticket_counter_{locationId}` (New Counter Strategy)
- **Purpose:** Independent, atomic serial sequence counter for each individual parking facility.
- **Document ID Strategy:** `ticket_counter_${locationId}` (e.g., `ticket_counter_loc_sangamner_01`).
- **Classification:** NEW PATTERN (Replaces global `counters/ticket_counter`).

```typescript
export interface LocationTicketCounterDoc {
  locationId: string;                 // "loc_sangamner_01"
  prefix: string;                     // "SMR"
  lastTicketNumber: number;           // Monotonically increasing sequence (e.g. 1000, 1001)
  updatedAt: Timestamp;
  updatedByUid: string;               // UID of guard who generated the last ticket
}
```

---

#### Entity 4: `parking_records/{recordId}` (Extended Collection — NF-01 Reconciled)
- **Purpose:** Core vehicle entry, parking stay, and exit settlement records.
- **Document ID Strategy:** Deterministic compound ID `${locationId}_${sequenceNumber}` (e.g. `loc_sangamner_01_1001`) or Firestore UUID.
- **Classification:** EXTENSION OF EXISTING COLLECTION.

```typescript
export interface ParkingRecordDoc {
  id: string;                         // "${locationId}_${sequence}"
  ticketNumber: string;               // Human-readable: "SMR-1001"
  locationId: string;                 // Mandatory: "loc_sangamner_01"
  locationCode: string;               // "SMR"
  locationName: string;               // "Sangamner Bus Stand"
  vehicleNumber: string;              // "MH12AB1234"
  normalizedVehicleNumber: string;    // "MH12AB1234" (no spaces/hyphens, uppercase)
  vehicleType: 'twoWheeler' | 'fourWheeler';
  customerMobile?: string;
  status: 'ACTIVE' | 'EXITED' | 'CANCELLED';
  entryTime: Timestamp;
  exitTime?: Timestamp | null;
  entryGuardUid: string;
  entryGuardName: string;
  entryShiftId: string;
  exitGuardUid?: string | null;
  exitGuardName?: string | null;
  exitShiftId?: string | null;
  advanceAmount: number;              // 0.00 if monthly pass or zero advance
  advancePaymentMethod?: 'cash' | 'upi' | 'none';
  grossCharge?: number;               // Computed billable total by trusted server
  finalAmount?: number;               // Balance collected at gate by trusted server
  refundAmount?: number;              // Overpaid advance refunded by trusted server
  paymentMethod?: 'cash' | 'upi' | 'none';
  isMonthlyPass: boolean;
  monthlyPassId?: string | null;
  vehiclePhotoUrl?: string;           // Mandatory photo proof
  photoStorageProvider?: 'cloudinary';
  rateSnapshot: LocationRates;        // NF-01: Full authoritative schedule copy matching LocationRates
  idempotencyKey?: string;            // NF-05: Stable client idempotency identifier
  settlementIdempotencyKey?: string;  // NF-04: Exit settlement idempotency key
  qrReference: string;                // Encoded ticket reference
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

> [!NOTE]
> **NF-01 Design Rationale:** `rateSnapshot` stores the complete `LocationRates` schedule. This guarantees that:
> 1. Security rules can perform direct bitwise equality validation (`request.resource.data.rateSnapshot == get(/locations/$(locId)).data.rates`) without complex sub-field branching.
> 2. Historical auditability preserves the entire pricing context of the location at entry time.
> 3. The applicable vehicle category is deterministically resolved by trusted code indexing `rateSnapshot.fourWheeler*` or `rateSnapshot.twoWheeler*` against the immutable `record.vehicleType`.

---

#### Entity 5: `payment_transactions/{txnId}` (Extended Collection)
- **Purpose:** Immutable append-only financial ledger of all cash/UPI collections and refunds.
- **Document ID Strategy:** Auto-generated Firestore ID (`doc(collection(db, 'payment_transactions')).id`).
- **Classification:** EXTENSION OF EXISTING COLLECTION.

```typescript
export interface PaymentTransactionDoc {
  id: string;
  locationId: string;                 // Mandatory location scoping
  ticketId: string;                   // Reference to parking_record
  ticketNumber: string;               // "SMR-1001"
  vehicleNumber: string;
  amount: number;                     // Strictly positive number
  paymentMethod: 'cash' | 'upi';
  paymentType: 'ADVANCE' | 'FINAL' | 'REFUND' | 'MONTHLY_PASS';
  guardUid: string;
  guardName: string;
  shiftId: string;
  ownerUid: string;                   // Organization owner
  createdAt: Timestamp;
}
```

---

#### Entity 6: `monthly_passes/{passId}` (Extended Collection)
- **Purpose:** Customer recurring monthly parking subscriptions.
- **Document ID Strategy:** Compound ID `pass_${locationCode}_${passNumber}` or auto-ID.
- **Classification:** EXTENSION OF EXISTING COLLECTION.

```typescript
export interface MonthlyPassDoc {
  id: string;
  passNumber: string;                 // e.g. "MP-SMR-2026-001"
  passType: 'SITE_SPECIFIC' | 'UNIVERSAL';
  primaryLocationId: string;          // Originating location
  eligibleLocationIds: string[];      // ['loc_sangamner_01'] or array of valid facilities
  isUniversal: boolean;               // Convenience flag
  vehicleNumber: string;
  normalizedVehicleNumber: string;
  vehicleType: 'twoWheeler' | 'fourWheeler';
  customerName: string;
  customerMobile: string;
  startDate: Timestamp;
  endDate: Timestamp;
  amount: number;                     // Subscription fee (e.g. 600 or 1500)
  amountPaid: number;
  paymentStatus: 'PAID';
  paymentMethod: 'cash' | 'upi';
  status: 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'CANCELLED';
  createdByUid: string;
  createdByName: string;
  ownerUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

#### Entity 7: `monthly_pass_redemptions/{redemptionId}` (New Collection)
- **Purpose:** Audit ledger recording every time a monthly pass is used to enter or exit a facility.
- **Document ID Strategy:** Auto-generated Firestore ID.
- **Classification:** NEW COLLECTION.

```typescript
export interface MonthlyPassRedemptionDoc {
  id: string;
  passId: string;
  passNumber: string;
  locationId: string;                 // Facility where redemption occurred
  ticketId: string;                   // Generated parking_record reference
  vehicleNumber: string;
  action: 'ENTRY' | 'EXIT';
  guardUid: string;
  guardName: string;
  timestamp: Timestamp;
}
```

---

#### Entity 8: `active_vehicles/{occupancyId}` (New Collection — NF-05 Idempotency Index)
- **Purpose:** Real-time occupancy lease preventing duplicate entries and enabling idempotent network retries.
- **Document ID Strategy:** Compound deterministic key `${locationId}_${normalizedVehicleNumber}`.
- **Classification:** NEW COLLECTION.

```typescript
export interface ActiveVehicleOccupancyDoc {
  id: string;                         // `${locationId}_${normalizedVehicleNumber}`
  locationId: string;
  normalizedVehicleNumber: string;
  ticketId: string;                   // Document ID in parking_records
  ticketNumber: string;               // Display ticket: "SMR-1001"
  idempotencyKey: string;             // Client request idempotency key
  status: 'OCCUPIED' | 'VACATED';
  entryTime: Timestamp;
  entryGuardUid: string;
  updatedAt: Timestamp;
}
```

---

#### Entity 9: `active_passes/{passId}` (New Collection — NF-02 Anti-Concurrency Lease)
- **Purpose:** Active facility stay lease for monthly passes, preventing pass sharing/tailgating across concurrent entries.
- **Document ID Strategy:** Matches `passId`.
- **Classification:** NEW COLLECTION.

```typescript
export interface ActivePassStayDoc {
  id: string;                         // Matches passId
  passId: string;
  ticketId: string;                   // Current active ticket
  locationId: string;                 // Active parking facility
  vehicleNumber: string;
  status: 'IN_FACILITY' | 'EXITED';
  entryTime: Timestamp;
  updatedAt: Timestamp;
}
```

---

#### Entities 10–14: Supporting Operations & Auditing
- **`shifts/{shiftId}`:** Shift records with `locationId`, `guardUid`, status, duration, closing float.
- **`handovers/{handoverId}`:** Intra-location float transfer records between guards at the same site.
- **`withdrawals/{withdrawalId}`:** Immutable cash withdrawal records collected by assigned Location Managers.
- **`responsibility_events/{eventId}`:** Balance fluctuation timeline for staff float reconciliation.
- **`audit_logs/{logId}`:** Tamper-evident administrative action log.

---

## 5. Firestore Security Rules Architecture & Pseudocode

### 5.1 Architecture Overview
Firestore Security Rules serve as the authoritative database boundary. They enforce:
1. **No Client-Side Inferences:** Authorization is established strictly by evaluating `request.auth.uid` against database documents.
2. **"Rules Are Not Filters" Principle:** Rules reject any `list` query that does not include an explicit equality clause matching the user's authorized scope (e.g., `where('locationId', '==', userLocId)`).
3. **Field Immutability & Financial Shielding:** Sensitive fields (`role`, `assignedLocationId`, `outstandingFloat`, `rateSnapshot`, `amount`) are protected by explicit immutability rules.
4. **Trusted Server Boundaries:** Actions requiring aggregation, arithmetic fee calculation, or cross-collection transactions (cross-location shifts, exit fee settlements) are reserved for trusted backend callable functions.

---

### 5.2 Helper Functions (Pseudocode Specification)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // --- Authentication Basics ---
    function isAuthenticated() {
      return request.auth != null;
    }

    function isExistingUser() {
      return isAuthenticated() && exists(/databases/$(database)/documents/guards/$(request.auth.uid));
    }

    function getUserData() {
      return get(/databases/$(database)/documents/guards/$(request.auth.uid)).data;
    }

    // --- Role Evaluation ---
    function isOwner() {
      return isAuthenticated() && (
        request.auth.token.role == 'owner' ||
        (isExistingUser() && getUserData().role.lower() == 'owner' && getUserData().isActive == true) ||
        // Hardcoded bootstrap account preserved for initial development
        request.auth.token.email.lower() == 'vaibhavpawase143@gmail.com'
      );
    }

    // SEC-09 & NF-03 FIX: Explicit compatibility mapping for legacy 'admin' to loc_sangamner_01
    function isManager(locationId) {
      return isAuthenticated() && (
        isOwner() ||
        (isExistingUser() && getUserData().isActive == true && (
          (getUserData().role.lower() == 'manager' && locationId in getUserData().assignedLocationIds) ||
          (getUserData().role.lower() == 'admin' && locationId == 'loc_sangamner_01')
        ))
      );
    }

    // NF-03 FIX: Guard management helper allowing legacy admin at default location only
    function canManageGuards(targetLocationId) {
      return isOwner() || (
        isExistingUser() && getUserData().isActive == true && (
          (getUserData().role.lower() == 'manager' && targetLocationId in getUserData().assignedLocationIds) ||
          (getUserData().role.lower() == 'admin' && targetLocationId == 'loc_sangamner_01')
        )
      );
    }

    function isAssignedGuard(locationId) {
      return isAuthenticated() && isExistingUser() &&
        getUserData().role.lower() == 'guard' &&
        getUserData().isActive == true &&
        getUserData().assignedLocationId == locationId;
    }

    function isStaffAtLocation(locationId) {
      return isOwner() || isManager(locationId) || isAssignedGuard(locationId);
    }

    function isLocationActive(locationId) {
      return exists(/databases/$(database)/documents/locations/$(locationId)) &&
        get(/databases/$(database)/documents/locations/$(locationId)).data.isActive == true;
    }

    function isImmutable(fieldName) {
      return !(fieldName in request.resource.data) || 
             request.resource.data[fieldName] == resource.data[fieldName];
    }
```

---

### 5.3 Collection Match Rules (Hardened Specification)

#### Locations: `/locations/{locationId}`
```javascript
    match /locations/{locationId} {
      allow read: if isAuthenticated();
      allow create, delete: if isOwner();
      allow update: if isOwner() || (
        isManager(locationId) && 
        isImmutable('rates') && 
        isImmutable('capacity') && 
        isImmutable('ownerUid') &&
        isImmutable('code')
      );
    }
```

#### Guards Registry: `/guards/{guardId}` (SEC-01, SEC-07 & NF-03 Hardened)
```javascript
    match /guards/{guardId} {
      allow read: if isAuthenticated();

      // Owner can create any staff account; Managers & Legacy Admin can create guards only for permitted locations
      allow create: if isOwner() || (
        isExistingUser() && 
        canManageGuards(request.resource.data.assignedLocationId) &&
        request.resource.data.role == 'guard' &&
        request.resource.data.ownerUid == getUserData().ownerUid
      );

      // Guard self-update: cannot alter role, locations, float, or shift state
      // Manager & Legacy Admin update: both existing and proposed locations must be in manager's scope
      allow update: if isOwner() || (
        request.auth.uid == guardId &&
        isImmutable('role') &&
        isImmutable('assignedLocationId') &&
        isImmutable('assignedLocationIds') &&
        isImmutable('ownerUid') &&
        isImmutable('isActive') &&
        isImmutable('outstandingFloat') &&
        isImmutable('shiftStatus') &&
        isImmutable('currentShiftId') &&
        isImmutable('shiftLocationId')
      ) || (
        isExistingUser() && 
        canManageGuards(resource.data.assignedLocationId) &&
        canManageGuards(request.resource.data.assignedLocationId) &&
        request.resource.data.role == 'guard' &&
        isImmutable('ownerUid') &&
        isImmutable('outstandingFloat')
      );

      allow delete: if isOwner();
    }
```

#### Location Ticket Counters: `/counters/{counterId}`
```javascript
    match /counters/{counterId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated() && (
        isOwner() ||
        (counterId.matches('ticket_counter_.*') && 
         isStaffAtLocation(request.resource.data.locationId))
      );
      allow delete: if isOwner();
    }
```

#### Parking Records: `/parking_records/{recordId}` (NF-01, NF-02 & NF-04 Hardened)
```javascript
    match /parking_records/{recordId} {
      allow get: if isAuthenticated() && isStaffAtLocation(resource.data.locationId);

      allow list: if isAuthenticated() && (
        isOwner() || 
        (isExistingUser() && (
          (getUserData().role == 'manager' && resource.data.locationId in getUserData().assignedLocationIds) ||
          (getUserData().role == 'admin' && resource.data.locationId == 'loc_sangamner_01') ||
          (getUserData().role == 'guard' && resource.data.locationId == getUserData().assignedLocationId)
        ))
      );

      // Entry Creation: Full schedule equality check (NF-01) + Pass cross-validation (NF-02)
      allow create: if isAuthenticated() && 
        isLocationActive(request.resource.data.locationId) &&
        isStaffAtLocation(request.resource.data.locationId) &&
        request.resource.data.status == 'ACTIVE' &&
        request.resource.data.advanceAmount >= 0 &&
        request.resource.data.rateSnapshot == get(/databases/$(database)/documents/locations/$(request.resource.data.locationId)).data.rates &&
        (
          !request.resource.data.isMonthlyPass || (
            request.resource.data.monthlyPassId != null &&
            request.resource.data.advanceAmount == 0 &&
            exists(/databases/$(database)/documents/monthly_passes/$(request.resource.data.monthlyPassId)) &&
            get(/databases/$(database)/documents/monthly_passes/$(request.resource.data.monthlyPassId)).data.status == 'ACTIVE' &&
            get(/databases/$(database)/documents/monthly_passes/$(request.resource.data.monthlyPassId)).data.normalizedVehicleNumber == request.resource.data.normalizedVehicleNumber &&
            get(/databases/$(database)/documents/monthly_passes/$(request.resource.data.monthlyPassId)).data.vehicleType == request.resource.data.vehicleType &&
            (
              (get(/databases/$(database)/documents/monthly_passes/$(request.resource.data.monthlyPassId)).data.passType == 'SITE_SPECIFIC' &&
               get(/databases/$(database)/documents/monthly_passes/$(request.resource.data.monthlyPassId)).data.primaryLocationId == request.resource.data.locationId) ||
              (get(/databases/$(database)/documents/monthly_passes/$(request.resource.data.monthlyPassId)).data.passType == 'UNIVERSAL' &&
               request.resource.data.locationId in get(/databases/$(database)/documents/monthly_passes/$(request.resource.data.monthlyPassId)).data.eligibleLocationIds)
            )
          )
        );

      // NF-04 Hardened Update: Direct client updates to exit settlement charges or EXITED status are BLOCKED
      // Only trusted backend callable operations can settle exit fees and transition status to EXITED
      allow update: if isAuthenticated() && 
        isStaffAtLocation(resource.data.locationId) &&
        resource.data.status == 'ACTIVE' &&
        isImmutable('status') &&
        isImmutable('grossCharge') &&
        isImmutable('finalAmount') &&
        isImmutable('refundAmount') &&
        isImmutable('locationId') &&
        isImmutable('locationCode') &&
        isImmutable('rateSnapshot') &&
        isImmutable('advanceAmount') &&
        isImmutable('entryTime');

      allow delete: if isOwner();
    }
```

#### Active Vehicle Occupancy: `/active_vehicles/{occupancyId}` (NF-05)
```javascript
    match /active_vehicles/{occupancyId} {
      allow read: if isAuthenticated();
      // Only staff at the location can set or clear occupancy leases in transactions
      allow create, update: if isAuthenticated() && isStaffAtLocation(request.resource.data.locationId);
      allow delete: if isAuthenticated() && isStaffAtLocation(resource.data.locationId);
    }
```

#### Active Monthly Pass Leases: `/active_passes/{passId}` (NF-02)
```javascript
    match /active_passes/{passId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated() && isStaffAtLocation(request.resource.data.locationId);
      allow delete: if isAuthenticated() && isStaffAtLocation(resource.data.locationId);
    }
```

#### Monthly Passes: `/monthly_passes/{passId}` (SEC-06)
```javascript
    match /monthly_passes/{passId} {
      allow read: if isAuthenticated();
      allow create: if isOwner() || (
        request.resource.data.passType == 'SITE_SPECIFIC' &&
        isManager(request.resource.data.primaryLocationId) &&
        request.resource.data.eligibleLocationIds == [request.resource.data.primaryLocationId]
      );
      allow update: if isOwner() || (
        isManager(resource.data.primaryLocationId) &&
        isImmutable('passType') &&
        isImmutable('primaryLocationId') &&
        isImmutable('eligibleLocationIds') &&
        isImmutable('amount') &&
        isImmutable('startDate') &&
        isImmutable('endDate') &&
        isImmutable('vehicleNumber') &&
        isImmutable('vehicleType')
      );
      allow delete: if isOwner();
    }
```

#### Payment Transactions & Redemptions (Append-Only)
```javascript
    match /payment_transactions/{txnId} {
      allow read: if isAuthenticated() && isStaffAtLocation(resource.data.locationId);
      allow create: if isAuthenticated() && 
        isStaffAtLocation(request.resource.data.locationId) &&
        request.resource.data.amount > 0;
      allow update, delete: if false;
    }

    match /monthly_pass_redemptions/{redemptionId} {
      allow read: if isAuthenticated() && isStaffAtLocation(resource.data.locationId);
      allow create: if isAuthenticated() && isStaffAtLocation(request.resource.data.locationId);
      allow update, delete: if false;
    }
```

#### Guard Shifts, Handovers & Withdrawals
```javascript
    match /shifts/{shiftId} {
      allow read: if isAuthenticated() && (
        isStaffAtLocation(resource.data.locationId) || resource.data.guardUid == request.auth.uid
      );
      allow create: if isOwner() || isManager(request.resource.data.locationId);
      allow update: if isOwner() || 
        isManager(resource.data.locationId) ||
        (resource.data.guardUid == request.auth.uid && 
         isImmutable('locationId') && 
         resource.data.locationId == getUserData().assignedLocationId);
      allow delete: if isOwner() || isManager(resource.data.locationId);
    }

    match /handovers/{handoverId} {
      allow read: if isAuthenticated() && isStaffAtLocation(resource.data.locationId);
      allow create: if isAuthenticated() && 
        isAssignedGuard(request.resource.data.locationId) &&
        request.resource.data.fromGuardId == request.auth.uid &&
        request.resource.data.amount > 0 &&
        request.resource.data.status == 'PENDING';
      allow update: if isAuthenticated() && 
        isStaffAtLocation(resource.data.locationId) &&
        isImmutable('locationId') &&
        isImmutable('amount') &&
        resource.data.status == 'PENDING' &&
        (
          (request.auth.uid == resource.data.toGuardId && request.resource.data.status in ['ACCEPTED', 'REJECTED']) ||
          (request.auth.uid == resource.data.fromGuardId && request.resource.data.status == 'CANCELLED') ||
          isOwner()
        );
      allow delete: if false;
    }

    match /withdrawals/{withdrawalId} {
      allow read: if isAuthenticated() && isStaffAtLocation(resource.data.locationId);
      allow create: if isAuthenticated() && 
        (isOwner() || isManager(request.resource.data.locationId)) &&
        request.resource.data.managerUid == request.auth.uid &&
        request.resource.data.amount > 0 &&
        request.resource.data.status == 'COMPLETED';
      allow update, delete: if false;
    }

    match /audit_logs/{logId} {
      allow read: if isOwner() || (
        resource.data.locationId != null && isManager(resource.data.locationId)
      );
      allow create: if isAuthenticated() && 
        request.resource.data.actorUid == request.auth.uid &&
        (isOwner() || 
         (getUserData().role == 'manager' && request.resource.data.locationId in getUserData().assignedLocationIds) ||
         (getUserData().role == 'admin' && request.resource.data.locationId == 'loc_sangamner_01') ||
         (getUserData().role == 'guard' && request.resource.data.locationId == getUserData().assignedLocationId));
      allow update, delete: if false;
    }
  }
}
```

---

## 6. Security & Financial Invariants

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        CORE MANDATORY INVARIANTS                                      │
├────┬─────────────────────────────────────────────────────────┬─────────────────────────┤
│ ID │ Invariant Description                                   │ Primary Enforcement     │
├────┼─────────────────────────────────────────────────────────┼─────────────────────────┤
│ 01 │ Location-Scoped Foreign Key Integrity                   │ Firestore Security Rule │
│ 02 │ Non-Tamperable Location Binding                         │ Firestore Security Rule │
│ 03 │ Location Manager Boundary Confinement                   │ Rules + Query Assertion │
│ 04 │ Guard Active Shift Isolation                            │ Rules + Transaction     │
│ 05 │ Atomic Non-Colliding & Idempotent Ticket Generation     │ Two-Phase Txn + Lease   │
│ 06 │ Complete Historical Rate Snapshot Immutability          │ Rules Equality Check    │
│ 07 │ Fail-Closed Rate Resolution                             │ Service + Rule Guard    │
│ 08 │ Site-Specific Monthly Pass Confinement                  │ Rules Gate Cross-Check  │
│ 09 │ Universal Monthly Pass Whitelist Validation             │ Rules Whitelist Match   │
│ 10 │ Anti-Concurrency Monthly Pass Lease Protection          │ Active Pass Lease Doc   │
│ 11 │ Idempotent Float Settlement & Withdrawal                │ Atomic Server Logic     │
│ 12 │ Gated Cross-Location Shift Transition                   │ Trusted Server Boundary │
│ 13 │ Immutable Financial Ledgers (No Update / No Delete)     │ Firestore Security Rule │
│ 14 │ Authoritative Exit Settlement Server Execution          │ Trusted Backend Runtime │
│ 15 │ Legacy Tenant Data Shielding                            │ Query Scoping Contract │
│ 16 │ Backward-Compatible Dual-Read Resolution                │ Client Resolver Engine  │
└────┴─────────────────────────────────────────────────────────┴─────────────────────────┘
```

---

## 7. Monthly Pass & Ticket Numbering Specifications

### 7.1 Hybrid Monthly Pass Specification (NF-02 Hardened)

#### Multi-Tier Pass Validation Architecture
Pass validation is enforced across both client algorithms and the authoritative database layer:
1. **Rule-Level Pre-Flight:** Firestore Security Rules verify existence, active status, exact plate match, vehicle type match, and location whitelist.
2. **Date Range Validation:** Gate logic asserts `startDate.toMillis() <= now <= endDate.toMillis()`.
3. **Anti-Concurrency Pass Lease (`active_passes/{passId}`):**
   - When a pass vehicle enters, the transaction attempts to register an active lease document in `/active_passes/{passId}`.
   - If an active lease with `status == 'IN_FACILITY'` already exists for this pass ID, the entry transaction fails with `MonthlyPassAlreadyInUseException`.
   - When the vehicle exits, `settleVehicleExit` updates the lease to `status: 'EXITED'` and appends a record to `/monthly_pass_redemptions`.
   - This completely stops pass-sharing and tailgating abuses.

---

### 7.2 Independent Location-Prefixed Ticket Counter Specification (NF-01 & NF-05 Hardened)

#### The Safe Two-Phase Creation Lifecycle with Idempotency Protection

```
PHASE 1: PRE-TRANSACTION PREPARATION (Client-Side)
  1. Generate stable UUIDv4 idempotencyKey for this logical submission.
  2. Validate plate format, customer mobile, category, and capacity.
  3. Verify pass validity (if monthly pass entry).
  4. Upload vehicle photo to Cloudinary.
     --> If photo upload fails: Abort entry immediately.
         Counter is NEVER touched. Zero sequence gap.

PHASE 2: ATOMIC RESERVATION & COMMIT (Single Firestore Transaction)
  1. Read /active_vehicles/${locationId}_${normalizedVehicleNumber}.
     --> If doc exists and status == 'OCCUPIED':
         a) If doc.idempotencyKey == currentIdempotencyKey:
            RETURN EXISTING TICKET (Idempotent network replay; counter untouched).
         b) If doc.idempotencyKey != currentIdempotencyKey:
            ABORT with VehicleAlreadyParkedException.
  2. Read /counters/ticket_counter_{locationId}.
  3. Increment candidate sequence: candidateSeq = lastTicketNumber + 1.
  4. Format display ticket: `${prefix}-${candidateSeq}` (e.g. SMR-1043).
  5. Format compound doc ID: `${locationId}_${candidateSeq}`.
  6. Read /locations/{locationId} to fetch authoritative rates.
  7. Write /counters/ticket_counter_{locationId} (lastTicketNumber = candidateSeq).
  8. Write /parking_records/{docId} with embedded rateSnapshot (LocationRates), photoUrl, and idempotencyKey.
  9. Write /active_vehicles/${locationId}_${normalizedVehicleNumber} with status: 'OCCUPIED'.
 10. If monthly pass: Write /active_passes/{passId} with status: 'IN_FACILITY'.
 11. If advance > 0: Write /payment_transactions record.
  --> Entire Phase 2 commits atomically.
```

#### Counter & Idempotency Transaction Algorithm (Pseudocode)

```typescript
export async function executeVehicleEntryTransaction(
  db: Firestore, 
  locationId: string, 
  locationPrefix: string, 
  entryParams: CreateVehicleEntryParams,
  uploadedPhotoUrl: string,
  guardUid: string,
  idempotencyKey: string
): Promise<{ docId: string; ticketNumber: string; isReplay: boolean }> {
  const counterRef = doc(db, 'counters', `ticket_counter_${locationId}`);
  const locationRef = doc(db, 'locations', locationId);
  const occupancyRef = doc(db, 'active_vehicles', `${locationId}_${entryParams.normalizedVehicleNumber}`);
  const passLeaseRef = entryParams.monthlyPassId 
    ? doc(db, 'active_passes', entryParams.monthlyPassId) 
    : null;

  return await runTransaction(db, async (transaction) => {
    // 1. Check active occupancy lease for duplicate entry / network replay
    const occupancySnap = await transaction.get(occupancyRef);
    if (occupancySnap.exists() && occupancySnap.data().status === 'OCCUPIED') {
      const existingData = occupancySnap.data();
      if (existingData.idempotencyKey === idempotencyKey) {
        // Idempotent recovery after lost network response
        return { 
          docId: existingData.ticketId, 
          ticketNumber: existingData.ticketNumber, 
          isReplay: true 
        };
      }
      throw new Error(`Vehicle ${entryParams.vehicleNumber} is already parked inside this facility.`);
    }

    // 2. If monthly pass, check pass lease concurrency
    if (passLeaseRef) {
      const passLeaseSnap = await transaction.get(passLeaseRef);
      if (passLeaseSnap.exists() && passLeaseSnap.data().status === 'IN_FACILITY') {
        throw new Error('This monthly pass is currently in use by another parked vehicle.');
      }
    }

    // 3. Fetch counter and location rate configuration
    const [counterSnap, locationSnap] = await Promise.all([
      transaction.get(counterRef),
      transaction.get(locationRef)
    ]);

    if (!locationSnap.exists() || !locationSnap.data().isActive) {
      throw new Error('Location is inactive or unconfigured.');
    }
    const locationData = locationSnap.data();
    if (!locationData.rates) {
      throw new Error('Authoritative location rate configuration missing.');
    }

    let currentSeq = 1000;
    if (counterSnap.exists()) {
      currentSeq = counterSnap.data().lastTicketNumber || 1000;
    }

    const nextSeq = currentSeq + 1;
    const docId = `${locationId}_${nextSeq}`;
    const displayTicketNumber = `${locationPrefix}-${nextSeq}`;

    const recordRef = doc(db, 'parking_records', docId);

    // Atomically increment counter
    transaction.set(counterRef, {
      locationId,
      prefix: locationPrefix,
      lastTicketNumber: nextSeq,
      updatedAt: serverTimestamp(),
      updatedByUid: guardUid
    }, { merge: true });

    // Atomically create entry record with complete LocationRates snapshot
    transaction.set(recordRef, {
      id: docId,
      ticketNumber: displayTicketNumber,
      locationId,
      locationCode: locationPrefix,
      locationName: locationData.name,
      vehicleNumber: entryParams.vehicleNumber,
      normalizedVehicleNumber: entryParams.normalizedVehicleNumber,
      vehicleType: entryParams.vehicleType,
      status: 'ACTIVE',
      entryTime: serverTimestamp(),
      entryGuardUid: guardUid,
      advanceAmount: entryParams.isMonthlyPass ? 0 : (entryParams.advanceAmount || 0),
      isMonthlyPass: !!entryParams.isMonthlyPass,
      monthlyPassId: entryParams.monthlyPassId || null,
      rateSnapshot: locationData.rates, // Full LocationRates schedule (NF-01)
      vehiclePhotoUrl: uploadedPhotoUrl,
      idempotencyKey,
      createdAt: serverTimestamp()
    });

    // Atomically set active vehicle occupancy lease (NF-05)
    transaction.set(occupancyRef, {
      id: `${locationId}_${entryParams.normalizedVehicleNumber}`,
      locationId,
      normalizedVehicleNumber: entryParams.normalizedVehicleNumber,
      ticketId: docId,
      ticketNumber: displayTicketNumber,
      idempotencyKey,
      status: 'OCCUPIED',
      entryTime: serverTimestamp(),
      entryGuardUid: guardUid,
      updatedAt: serverTimestamp()
    });

    // Atomically register active pass lease if monthly pass (NF-02)
    if (passLeaseRef && entryParams.monthlyPassId) {
      transaction.set(passLeaseRef, {
        id: entryParams.monthlyPassId,
        passId: entryParams.monthlyPassId,
        ticketId: docId,
        locationId,
        vehicleNumber: entryParams.vehicleNumber,
        status: 'IN_FACILITY',
        entryTime: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    return { docId, ticketNumber: displayTicketNumber, isReplay: false };
  });
}
```

---

## 8. Cash Float, Handover, Shift & Exit Protocols

### 8.1 Intra-Location Float Handover Protocol
Handovers transfer physical cash and digital responsibility between guards **at the same facility**:
1. **Initiation (`HANDOVER_INITIATED`):** Dropdown displays **only** guards where `assignedLocationId == currentGuard.assignedLocationId`. Document created in `/handovers` with `status: 'PENDING'`.
2. **Acceptance (`ACCEPTED`):** Relieving guard clicks "Accept Handover". Executed via trusted server logic updating handover status, logging dual responsibility events, and transferring float balances.

### 8.2 Manager Float Withdrawal Protocol
Withdrawals transfer cash from a guard's custody into the facility safe:
1. Verified against `activeLocationId in manager.assignedLocationIds`.
2. Creates `/withdrawals` document (`status: 'COMPLETED'`).
3. Trusted server logic deducts withdrawal amount from guard's `outstandingFloat.cash`.

### 8.3 Cross-Location Guard Shift Transfer Protocol (SEC-03 Hardened)
Mediated by a **Trusted Server Boundary (Firebase Cloud Function / Admin SDK callable)**:
1. Verifies previous shift is closed (`COMPLETED` or `ENDED`).
2. Verifies `outstandingFloat.cash == 0`.
3. Verifies `outstandingFloat.upi == 0`.
4. Verifies zero pending incoming/outgoing handovers.
5. Activates new shift at target location.

---

### 8.4 Trusted Exit Fee Settlement Protocol (NF-04 Hardened)

To eliminate client-side arithmetic fee manipulation, exit settlement is executed strictly by an authenticated **Trusted Server Operation (`settleVehicleExit` Callable Endpoint)**:

```
                          VEHICLE EXIT REQUEST
                    (Guard submits exit settlement)
                                   │
                                   ▼
             ┌───────────────────────────────────────────┐
             │ 1. Caller Authentication & Active Shift   │── Invalid ──> [ABORT]
             └─────────────────────┬─────────────────────┘
                                   │ Valid
                                   ▼
             ┌───────────────────────────────────────────┐
             │ 2. Read parking_record within Transaction │
             │    - Verify status == 'ACTIVE'            │── Not Active ──> [Check Idempotency]
             └─────────────────────┬─────────────────────┘                  (Replay receipt if duplicate)
                                   │ Active
                                   ▼
             ┌───────────────────────────────────────────┐
             │ 3. Server Duration & Fee Calculation      │
             │    - duration = serverTimestamp - entry   │
             │    - Select rates from record.rateSnapshot│
             │      indexed by record.vehicleType        │
             │    - Apply first hr, addl hrs, 12h/24h cap│
             │    - grossCharge = calculated billable    │
             │    - netDue = max(0, gross - advance)     │
             │    - refund = max(0, advance - gross)     │
             └─────────────────────┬─────────────────────┘
                                   │
                                   ▼
             ┌───────────────────────────────────────────┐
             │ 4. Atomic Multi-Document Commit           │
             │    - Update parking_record to 'EXITED'    │
             │    - Append payment_transaction if final>0│
             │    - Append payment_transaction if refund>0│
             │    - Increment guard.outstandingFloat.cash│
             │    - Mark active_vehicles to 'VACATED'    │
             │    - Mark active_passes to 'EXITED'       │
             └─────────────────────┬─────────────────────┘
                                   │
                                   ▼
             ┌───────────────────────────────────────────┐
             │ 5. Return Signed Exit Slip Payload to POS │
             └───────────────────────────────────────────┘
```

#### Authoritative Exit Settlement Algorithm (Pseudocode)

```typescript
export async function settleVehicleExit(
  callerUid: string,
  ticketId: string,
  paymentMethod: 'cash' | 'upi',
  settlementIdempotencyKey: string
): Promise<ExitSettlementResult> {
  // 1. Authenticate & Authorize Guard
  const guardDoc = await adminDb.doc(`guards/${callerUid}`).get();
  if (!guardDoc.exists || !guardDoc.data()?.isActive) {
    throw new HttpsError('unauthenticated', 'Active staff account required.');
  }
  const guard = guardDoc.data()!;
  const activeLocationId = guard.shiftLocationId;
  if (!activeLocationId || !guard.currentShiftId) {
    throw new HttpsError('failed-precondition', 'Guard does not have an active shift.');
  }

  return await adminDb.runTransaction(async (transaction) => {
    const recordRef = adminDb.doc(`parking_records/${ticketId}`);
    const recordSnap = await transaction.get(recordRef);

    if (!recordSnap.exists) {
      throw new HttpsError('not-found', 'Parking ticket not found.');
    }
    const record = recordSnap.data()!;

    // Idempotency check: If already EXITED and matches idempotency key, replay receipt
    if (record.status === 'EXITED') {
      if (record.settlementIdempotencyKey === settlementIdempotencyKey) {
        return {
          ticketNumber: record.ticketNumber,
          grossCharge: record.grossCharge,
          finalAmount: record.finalAmount,
          refundAmount: record.refundAmount,
          isReplay: true
        };
      }
      throw new HttpsError('already-exists', 'Ticket has already been settled and closed.');
    }

    if (record.locationId !== activeLocationId) {
      throw new HttpsError('permission-denied', 'Cannot settle ticket originating from another location.');
    }

    const now = new Date();
    const entryTime = record.entryTime.toDate();
    const durationMinutes = Math.max(1, Math.ceil((now.getTime() - entryTime.getTime()) / (1000 * 60)));
    const durationHours = Math.ceil(durationMinutes / 60);

    let grossCharge = 0;
    if (record.isMonthlyPass) {
      grossCharge = 0;
    } else {
      const rates = record.rateSnapshot as LocationRates;
      const isCar = record.vehicleType === 'fourWheeler';
      const firstHourRate = isCar ? rates.fourWheelerFirstHourRate : rates.twoWheelerFirstHourRate;
      const addlHourRate = isCar ? rates.fourWheelerAdditionalHourRate : rates.twoWheelerAdditionalHourRate;
      const cap12 = isCar ? rates.fourWheeler12HourCap : rates.twoWheeler12HourCap;
      const cap24 = isCar ? rates.fourWheeler24HourCap : rates.twoWheeler24HourCap;

      if (durationHours <= 1) {
        grossCharge = firstHourRate;
      } else if (durationHours <= 12) {
        grossCharge = Math.min(cap12, firstHourRate + (durationHours - 1) * addlHourRate);
      } else if (durationHours <= 24) {
        grossCharge = Math.min(cap24, cap12 + (durationHours - 12) * addlHourRate);
      } else {
        const fullDays = Math.floor(durationHours / 24);
        const remainderHours = durationHours % 24;
        grossCharge = (fullDays * cap24) + Math.min(cap24, remainderHours * addlHourRate);
      }
    }

    const advancePaid = record.advanceAmount || 0;
    const finalAmount = Math.max(0, grossCharge - advancePaid);
    const refundAmount = Math.max(0, advancePaid - grossCharge);

    // Commit exit record
    transaction.update(recordRef, {
      status: 'EXITED',
      exitTime: FieldValue.serverTimestamp(),
      exitGuardUid: callerUid,
      exitGuardName: guard.name,
      exitShiftId: guard.currentShiftId,
      grossCharge,
      finalAmount,
      refundAmount,
      paymentMethod: finalAmount > 0 ? paymentMethod : (advancePaid > 0 ? record.advancePaymentMethod : 'none'),
      settlementIdempotencyKey,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Record payment transactions if funds exchanged
    if (finalAmount > 0) {
      const txnRef = adminDb.collection('payment_transactions').doc();
      transaction.set(txnRef, {
        id: txnRef.id,
        locationId: activeLocationId,
        ticketId,
        ticketNumber: record.ticketNumber,
        vehicleNumber: record.vehicleNumber,
        amount: finalAmount,
        paymentMethod,
        paymentType: 'FINAL',
        guardUid: callerUid,
        guardName: guard.name,
        shiftId: guard.currentShiftId,
        ownerUid: guard.ownerUid,
        createdAt: FieldValue.serverTimestamp()
      });

      if (paymentMethod === 'cash') {
        const guardRef = adminDb.doc(`guards/${callerUid}`);
        transaction.update(guardRef, {
          'outstandingFloat.cash': FieldValue.increment(finalAmount),
          'outstandingFloat.lastReconciledAt': FieldValue.serverTimestamp()
        });
      }
    }

    // Release active vehicle occupancy lease (NF-05)
    const occupancyRef = adminDb.doc(`active_vehicles/${activeLocationId}_${record.normalizedVehicleNumber}`);
    transaction.set(occupancyRef, {
      status: 'VACATED',
      vacatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // Release active pass lease if monthly pass (NF-02)
    if (record.monthlyPassId) {
      const passLeaseRef = adminDb.doc(`active_passes/${record.monthlyPassId}`);
      transaction.set(passLeaseRef, {
        status: 'EXITED',
        exitedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      const redemptionRef = adminDb.collection('monthly_pass_redemptions').doc();
      transaction.set(redemptionRef, {
        id: redemptionRef.id,
        passId: record.monthlyPassId,
        locationId: activeLocationId,
        ticketId,
        vehicleNumber: record.vehicleNumber,
        action: 'EXIT',
        guardUid: callerUid,
        guardName: guard.name,
        timestamp: FieldValue.serverTimestamp()
      });
    }

    return {
      ticketNumber: record.ticketNumber,
      grossCharge,
      finalAmount,
      refundAmount,
      isReplay: false
    };
  });
}
```

---

## 9. Legacy Compatibility & Future Migration Strategy

### 9.1 The Candidate Default Location: `loc_sangamner_01`
- **Naming Convention:** `loc_sangamner_01`
- **Display Name:** `Jay Ganesh Pay & Park`
- **Location Name:** `Sangamner Bus Stand`
- **Prefix:** `SMR`

### 9.2 Staged Migration Workflow & Deployment Hard Gates
```
STAGE 1: DUAL-READ SAFE COMPATIBILITY (Client Updated)
   - Read operations check: record.locationId || 'loc_sangamner_01'
   - Application never crashes on legacy records.

STAGE 2: PROVISION DEFAULT LOCATION (Offline Admin SDK)
   - Create document: /locations/loc_sangamner_01
   - Initialize counter: /counters/ticket_counter_loc_sangamner_01

STAGE 3: 3-TIER BACKFILL & QUARANTINE PIPELINE (SEC-12 Fix)
   - Valid records: Stamped with locationId: 'loc_sangamner_01', migrationStatus: 'MIGRATED'.
   - Ambiguous/corrupted records: Stamped with migrationStatus: 'QUARANTINED', quarantineReason: 'MISSING_MANDATORY_DATA'.
   - Excluded from active capacity and financial ledger totals.

[DEPLOYMENT HARD GATE - SEC-10 Fix]
   - Automated audit script runs: query count of docs where locationId == null.
   - If count > 0: DEPLOYMENT HALTED.
   - If count == 0: Proceed to Stage 4.

STAGE 4: SECURITY RULES ACTIVATION (Firebase Deploy)
   - Multi-location firestore.rules deployed.
   - Strict mandatory locationId check enabled.
```

### 9.3 Rollback Strategy
If any unforeseen issue arises during rollout:
1. Revert client build to single-location commit.
2. Because Phase 5B architecture strictly **extends** document schemas by adding fields rather than renaming or deleting existing fields, legacy code ignores the new `locationId` field and continues normal operation.
3. `/counters/ticket_counter` remains intact as a fallback counter.

---

## 10. Existing Code Impact Map

| File Path in Workspace | Status | Planned Future Modification | Risk / Invariant | Target Phase |
| :--- | :---: | :--- | :--- | :---: |
| [src/types/index.ts](file:///d:/car_parking_web/src/types/index.ts) | Verified | Add `ParkingLocationDoc`, `LocationRates`, `UserRole = 'owner' \| 'manager' \| 'guard' \| 'admin'`, `locationId` fields. | Invariant 1 | Phase 5C |
| [src/features/auth/AuthContext.tsx](file:///d:/car_parking_web/src/features/auth/AuthContext.tsx) | Verified | Expose `activeLocationId`, `assignedLocations`, and role context. | Invariant 2, 3 | Phase 5C |
| [src/features/auth/AuthGate.tsx](file:///d:/car_parking_web/src/features/auth/AuthGate.tsx) | Verified | Validate location assignment before rendering terminal. Prevent stranded logins. | Invariant 3, 4 | Phase 5C |
| [src/services/adminService.ts](file:///d:/car_parking_web/src/services/adminService.ts) | Verified | Add `locationId?: string` filter to all real-time listeners. Build Owner rollup queries. | Invariant 3, 13 | Phase 5D / 5E |
| [src/services/parkingService.ts](file:///d:/car_parking_web/src/services/parkingService.ts) | Verified | Implement idempotent two-phase entry transaction with verified `rateSnapshot`. | Invariant 4, 5, 6 | Phase 5F |
| [src/services/exitSettlementService.ts](file:///d:/car_parking_web/src/services/exitSettlementService.ts) | **NEW** | Invoke trusted Cloud Function / server endpoint `settleVehicleExit`. | Invariant 14 | Phase 5F |
| [src/services/guardService.ts](file:///d:/car_parking_web/src/services/guardService.ts) | Verified | Scope `getActiveGuardsList` to same location; enforce intra-location handovers. | Invariant 4, 11 | Phase 5E / 5F |
| [src/services/monthlyPassService.ts](file:///d:/car_parking_web/src/services/monthlyPassService.ts) | Verified | Implement hybrid pass validation algorithm & active pass lease tracking. | Invariant 8, 9, 10 | Phase 5D / 5F |
| [src/features/admin/AdminPortal.tsx](file:///d:/car_parking_web/src/features/admin/AdminPortal.tsx) | Verified | Add Location Switcher dropdown in header; add "Location Management" module. | Invariant 3 | Phase 5D |
| [src/features/guard/GuardPortal.tsx](file:///d:/car_parking_web/src/features/guard/GuardPortal.tsx) | Verified | Display fixed Location Badge; lock operations to active assigned branch. | Invariant 4 | Phase 5F |
| [firestore.rules](file:///d:/car_parking_web/firestore.rules) | Verified | Complete rewrite matching Section 5 security specifications. | All Invariants | Phase 5B Spec / 5G Test |
| `src/services/locationService.ts` | **NEW** | CRUD operations for locations, rates, manager assignments, and capacity limits. | Invariant 1, 2 | Phase 5D |

---

## 11. Threat & Risk Register

| Risk ID | Threat Category | Threat Description | Severity | Architectural Mitigation |
| :---: | :--- | :--- | :---: | :--- |
| **TR-01** | Cross-Location Data Leak | Guard at Branch A reads customer plates and photos from Branch B. | **CRITICAL** | Firestore Security Rules disallow open queries. Mandate `where('locationId', '==', guardLocId)`. |
| **TR-02** | Ticket Sequence Collision | Concurrent entries at Location A and Location B overwrite same ticket ID. | **CRITICAL** | Independent counters `/counters/ticket_counter_{locationId}`. Doc IDs compound-keyed. |
| **TR-03** | Gate Cross-Settlement Theft | Guard at Location B settles ticket from Location A, pocketing cash. | **CRITICAL** | Trusted `settleVehicleExit` endpoint asserts `record.locationId == guard.shiftLocationId`. |
| **TR-04** | Remote Float Laundering | Guard at Location A transfers float to friend at Location B. | **HIGH** | Handover modal and Security Rules strictly mandate identical `assignedLocationId`. |
| **TR-05** | Rate Configuration Tampering | Location Manager increases hourly rate to siphon off excess cash. | **HIGH** | Security rules restrict `rates` modification strictly to `isOwner()`. |
| **TR-06** | Historical Fee Distortion | Owner updates rate card; open or historical tickets recompute at new rates. | **HIGH** | Complete `rateSnapshot` embedded at entry; exit calculator strictly utilizes snapshot (`NF-01`). |
| **TR-07** | Pass Location Spoofing | Customer uses cheap rural branch pass at premium urban facility. | **HIGH** | Rules and gate algorithm verify `primaryLocationId` or explicit `eligibleLocationIds` whitelist (`NF-02`). |
| **TR-08** | Unauthorized Self-Assignment | Guard edits profile document to switch location assignment or erase float. | **CRITICAL** | Security rules mandate immutability on `role`, `assignedLocationId`, and `outstandingFloat` (`SEC-01`). |
| **TR-09** | Exit Fee Manipulation | Malicious guard reports ₹0 charge at exit and pockets collected cash. | **HIGH** | Trusted server endpoint computes and commits charges; client rules deny fee updates (`NF-04`). |
| **TR-10** | Pass Sharing / Tailgating | Same monthly pass used concurrently by two vehicles at gate. | **HIGH** | Atomic active pass lease `/active_passes/{passId}` blocks concurrent entries (`NF-02`). |
| **TR-11** | Duplicate Entry on Network Timeout | Network drops after transaction commit; retry increments counter again. | **MEDIUM** | Idempotency key & `/active_vehicles/{occupancyId}` index replays existing ticket (`NF-05`). |
| **TR-12** | Unmigrated Admin Privileges | Legacy admin elevates to owner or manages peers. | **HIGH** | Helper `isManager` restricts unmigrated admin strictly to `loc_sangamner_01` (`NF-03`). |

---

## 12. Future Implementation Roadmap (Phases 5C onward)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PHASED EXECUTION ROADMAP                        │
├──────────┬─────────────────────────────────────────────────────────────┤
│ Phase 5C │ Multi-Location Foundation & Context Engine                  │
│          │ - Refactor types/index.ts (Owner, Manager, Location schemas)│
│          │ - Implement locationService.ts                              │
│          │ - Refactor AuthContext.tsx & AuthGate.tsx                   │
├──────────┼─────────────────────────────────────────────────────────────┤
│ Phase 5D │ Owner Dashboard & Location Administration                   │
│          │ - Multi-location switcher header component                  │
│          │ - LocationManagementView.tsx (CRUD locations & rates)       │
│          │ - Consolidated enterprise analytics                         │
├──────────┼─────────────────────────────────────────────────────────────┤
│ Phase 5E │ Location Manager Portal & Scoped Workflows                  │
│          │ - Scoped Shift Management & Guard Rostering                 │
│          │ - Location Float Withdrawals modal & ledger                 │
│          │ - Location-scoped ReportsHubView & CSV export               │
├──────────┼─────────────────────────────────────────────────────────────┤
│ Phase 5F │ Guard Terminal Isolation & Gate Operations                  │
│          │ - Idempotent prefixed ticket generator (parkingService.ts)  │
│          │ - Trusted exit settlement callable service                  │
│          │ - Hybrid monthly pass gate validation & lease tracking      │
│          │ - Localized 58mm thermal slips (Entry & Exit)               │
├──────────┼─────────────────────────────────────────────────────────────┤
│ Phase 5G │ Integration Verification, Security Rules & Master Tests     │
│          │ - Deploy multi-tenant firestore.rules to emulator           │
│          │ - Execute automated integration suite (ISO-01 to ISO-35)    │
│          │ - Fail-closed build verification & production readiness     │
└──────────┴─────────────────────────────────────────────────────────────┘
```

---

## 13. Testing Matrix & Acceptance Criteria

When implementation is authorized, the following test matrix must be implemented and verified in the local Firebase Emulator.

> [!NOTE]
> All items below (except ISO-18 Phase 5A baseline) are classified as **`NOT VERIFIED — DOCUMENTATION ONLY`** as Phase 5B does not execute implementation code.

| Test ID | Scenario | Execution Setup | Expected Result | Status |
| :---: | :--- | :--- | :--- | :---: |
| **ISO-01** | Cross-Location Ticket Read | Guard A (`loc_a`) attempts `getDoc(doc('parking_records', 'loc_b_1001'))` | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-02** | Cross-Location Query Leak | Manager A (`loc_a`) runs `getDocs(collection('payment_transactions'))` | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-03** | Gate Cross-Exit Prevention | Guard B (`loc_b`) attempts to settle ticket originating from `loc_a` | **PERMISSION_DENIED** by trusted server | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-04** | Independent Counter Sequence | Concurrent entries generated at `loc_a` and `loc_b` | `SMR-1001` and `NSK-1001` (Zero collision) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-05** | Rate Authority Restriction | Manager A attempts to update `locations/loc_a.rates` | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-06** | Historical Rate Snapshot | Entry under Rate 1 (₹20); Owner updates to ₹40; Exit settled | Stay billed at Rate 1 (₹20 snapshot) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-07** | Fail-Closed Missing Rate | Entry initiated at location with null rates object | **REJECTED** (`RateConfigurationMissingException`) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-08** | Site Pass Cross-Redemption | Site-specific pass for `loc_a` scanned at `loc_b` gate | **PERMISSION_DENIED** (Rules reject entry) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-09** | Universal Pass Validation | Universal pass with `['loc_a', 'loc_b']` scanned at `loc_b` gate | **ACCEPTED** (Zero-charge entry) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-10** | Intra-Location Handover | Guard A (`loc_a`) initiates handover to Guard B (`loc_a`) | **SUCCESS** (`status: 'PENDING'`) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-11** | Cross-Location Handover Block | Guard A (`loc_a`) attempts handover to Guard C (`loc_b`) | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-12** | Manager Float Withdrawal | Manager A (`loc_a`) withdraws float from Guard A (`loc_a`) | **SUCCESS** (Withdrawal logged; float reduced) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-13** | Cross-Location Withdrawal Block | Manager B (`loc_b`) attempts withdrawal on Guard A (`loc_a`) | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-14** | Shift Transfer Gate (Unsettled) | Guard A with ₹500 float attempts to open shift at `loc_b` | **BLOCKED** by server boundary | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-15** | Shift Transfer Gate (Settled) | Guard A surrenders ₹500 float; opens shift at `loc_b` | **SUCCESS** (New shift opened at `loc_b`) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-16** | Profile Location Tamper | Guard attempts `updateDoc` to modify `assignedLocationId` | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-17** | Dual-Read Legacy Fallback | Legacy record with no `locationId` loaded in web client | Safely resolves to `loc_sangamner_01` | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-18** | Existing Unit Suite Regression | Master test suite (`npm run test`) executed | **124/124 PASSED** (Zero regression) | Verified (5A Baseline) |
| **ISO-19** | Direct SDK Float Erasure (SEC-01) | Guard attempts `updateDoc` to modify `outstandingFloat` | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-20** | Client Rate Snapshot Spoof (SEC-02/NF-01) | Guard attempts entry creation with modified rate snapshot | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-21** | Shift Start Bypass (SEC-03) | Guard directly calls `updateDoc` on shift without settling | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-22** | Manager Cross-Assignment (SEC-07) | Manager A assigns guard to `loc_b` | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-23** | Monthly Pass Term Tamper (SEC-06) | Manager attempts to extend pass `endDate` | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-24** | Pass Cross-Validation Entry (SEC-08) | Entry with fake `monthlyPassId` attempted | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-25** | Legacy Admin Scope (SEC-09) | Unmigrated `admin` accesses `loc_nashik_01` | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-26** | Pass Mismatched Vehicle Plate (NF-02) | Valid pass for MH12AB1234 used for entry with MH14CD5678 | **PERMISSION_DENIED** (Rule rejects) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-27** | Pass Unauthorized Location Gate (NF-02) | Site pass for `loc_sangamner_01` used at `loc_nashik_01` | **PERMISSION_DENIED** (Rule rejects) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-28** | Pass Expired / Not-Yet-Valid (NF-02) | Entry attempted with pass where `endDate < now` or `startDate > now` | **REJECTED** (Gate validator & status check) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-29** | Pass Concurrent Active Stay (NF-02) | Pass already active in lot scanned for second vehicle | **BLOCKED** (`MonthlyPassAlreadyInUse`) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-30** | Legacy Admin Staff Management at Default Loc (NF-03) | Legacy admin creates guard profile for `loc_sangamner_01` | **SUCCESS** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-31** | Legacy Admin Staff Management at Secondary Loc (NF-03) | Legacy admin attempts to create guard for `loc_nashik_01` | **PERMISSION_DENIED** | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-32** | Direct Client SDK Exit Fee Spoof (NF-04) | Guard attempts direct `updateDoc` on `grossCharge: 0` | **PERMISSION_DENIED** (Rules reject) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-33** | Duplicate / Concurrent Exit Requests (NF-04) | Two exit requests sent concurrently for same ticket | **ONE SUCCEEDS**, second returns replay/error | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-34** | Entry Network Timeout Retry Idempotency (NF-05) | Client resends entry request with same idempotencyKey | **SUCCESS** (Returns existing ticket; no new counter seq) | NOT VERIFIED — DOCUMENTATION ONLY |
| **ISO-35** | Valid Subsequent Visit After Stay Exit (NF-05) | Vehicle exits facility; later returns for new parking session | **SUCCESS** (New ticket generated normally) | NOT VERIFIED — DOCUMENTATION ONLY |

---

## 14. Technical Notes & Non-Blocking Design Observations

1. **Cloudinary Asset Tagging:** When vehicle photos are uploaded via [cloudinaryService.ts](file:///d:/car_parking_web/src/services/cloudinaryService.ts), the image public ID should incorporate the location prefix (e.g. `car_parking/vehicles/SMR/1001_timestamp.jpg`) to facilitate structured asset management in cloud storage.
2. **Thermal Receipt Font Sizing:** When displaying Marathi location names (`संगमनेर बसस्थानक`) on 58mm receipts via [EntrySlipModal.tsx](file:///d:/car_parking_web/src/features/guard/components/EntrySlipModal.tsx), Unicode font rendering should be tested on standard POS hardware to prevent character clipping.
3. **Offline IndexedDB Persistence:** When enabling multi-location caching in Firebase Web SDK, local IndexedDB caches should be cleared on user sign-out to prevent ambient data remnants between shared gate counter terminal devices.

---

## 15. Explicit Out-of-Scope Actions & Safety Confirmation

In compliance with Phase 5B constraints, the following safety invariants were strictly maintained during this specification work:

- [x] **Zero Production Network Writes:** No commands or scripts communicated with Google Cloud or production Firebase project `car-parking-system-2026`.
- [x] **Zero File Modifications to Source:** No existing application code files in `src/`, `public/`, or root (`package.json`, `vite.config.ts`, `firestore.rules`) were modified.
- [x] **Zero Migration or Backfill Execution:** No database migration scripts were generated or executed.
- [x] **Flutter Independence:** The mobile application at `D:\car_parking_system` was completely untouched.
- [x] **Pre-existing User Changes Preserved:** The local working state and pre-existing files were preserved without reset.
- [x] **Phase Boundary Respected:** Phase 5C implementation has not been started. All progress has stopped upon generating this specification artifact.

---
*End of Phase 5B Revised Specification (v1.1.1). Awaiting formal authorization for Phase 5C.*
