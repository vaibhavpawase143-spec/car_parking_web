export type UserRole = 'owner' | 'manager' | 'guard' | 'admin';

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
  code: string;                       // e.g. "SMR"
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
    carTotal: number;
    twoWheelerTotal: number;
  };
  rates: LocationRates;
  operatingHours: {
    openTime: string;                 // "06:00" (24h format)
    closeTime: string;                // "23:00"
    is24Hours: boolean;
  };
  features: {
    cashEnabled: boolean;
    upiEnabled: boolean;
    advanceEnabled: boolean;
    overnightParkingAllowed: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface GuardProfile {
  uid: string;
  name: string;
  email: string;
  mobile?: string;
  role: UserRole;
  isActive: boolean;
  ownerUid?: string;
  assignedLocationId?: string;        // Mandatory for guard
  assignedLocationIds?: string[];     // Mandatory for manager
  currentShift?: string;
  currentShiftId?: string | null;
  shiftStatus?: 'active' | 'ended' | 'offline';
  shiftStartTime?: string | null;
  shiftLocationId?: string | null;
  outstandingFloat?: {
    cash: number;
    upi: number;
    lastReconciledAt?: Date | null;
  };
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type AuthStatus = 
  | 'loading' 
  | 'unauthenticated' 
  | 'authenticated' 
  | 'access_denied' 
  | 'unconfigured';

export interface AuthContextType {
  currentUser: import('firebase/auth').User | null;
  guardProfile: GuardProfile | null;
  authStatus: AuthStatus;
  accessDeniedReason: string | null;
  userRole: UserRole | null;
  activeLocationId: string | null;
  assignedLocationIds: string[];
  assignedLocations: ParkingLocationDoc[];
  activeLocation: ParkingLocationDoc | null;
  isLegacyMode: boolean;
  setActiveLocationId: (locationId: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export type VehicleCategory = 'twoWheeler' | 'fourWheeler' | 'TWO_WHEELER' | 'FOUR_WHEELER';

export interface SystemConfig {
  carTotalCapacity: number;
  twoWheelerTotalCapacity: number;
  fourWheelerFirstHourRate: number;
  twoWheelerFirstHourRate: number;
  fourWheelerAdditionalHourRate: number;
  twoWheelerAdditionalHourRate: number;
  fourWheeler12HourCap: number;
  twoWheeler12HourCap: number;
  fourWheelerMonthlyRate: number;
  twoWheelerMonthlyRate: number;
  defaultShiftDurationHours: number;
  allowedShiftDurations: number[];
  englishName: string;
  englishLocation: string;
  marathiName: string;
  marathiLocation: string;
  marathiAuthority: string;
  mobile: string;
  marathiMobile: string;
  cashEnabled: boolean;
  upiEnabled: boolean;
  advanceEnabled: boolean;
  bizflowBrandingEnabled: boolean;
  singleActiveDeviceEnabled: boolean;
}

export interface CapacityData {
  carTotal: number;
  carOccupied: number;
  twoWheelerTotal: number;
  twoWheelerOccupied: number;
  carAvailable: number;
  twoWheelerAvailable: number;
}

export interface ParkingRecord {
  id: string;
  ticketId: string;
  ticketNumber: string;
  locationId?: string;
  locationCode?: string;
  locationName?: string;
  vehicleNumber: string;
  normalizedVehicleNumber: string;
  vehicleType: VehicleCategory;
  customerMobile?: string;
  entryTime: Date;
  exitTime?: Date | null;
  status: 'ACTIVE' | 'EXITED' | 'CANCELLED';
  advanceAmount: number;
  grossCharge?: number;
  finalCharge?: number;
  paidAmount?: number;
  finalAmount?: number;
  refundAmount?: number;
  balanceDue?: number;
  paymentMethod?: string | null;
  advancePaymentMethod?: string | null;
  advanceCollectorGuardName?: string;
  advanceCollectorShift?: string;
  entryGuardName: string;
  entryGuardUid?: string;
  exitGuardName?: string;
  exitGuardUid?: string;
  entryShift: string;
  exitShift?: string;
  isMonthlyPass?: boolean;
  monthlyPassId?: string;
  vehiclePhotoUrl?: string;
  qrReference?: string;
  rateSnapshot?: LocationRates;
  idempotencyKey?: string;
  settlementIdempotencyKey?: string;
}

export interface PaymentTransaction {
  id: string;
  locationId?: string;
  ownerUid?: string;
  ticketId: string;
  vehicleNumber: string;
  amount: number;
  paymentMethod: 'cash' | 'upi';
  paymentType: 'ADVANCE' | 'FINAL' | 'REFUND' | 'MONTHLY_PASS';
  guardUid: string;
  guardName: string;
  shift: string;
  createdAt: Date;
}

export interface ShiftModel {
  id: string;
  shiftId: string;
  locationId?: string;
  scheduleId?: string;
  guardId: string;
  guardUid?: string;
  guardEmail?: string;
  guardName: string;
  shiftDate: Date;
  startTime: Date;
  endTime: Date;
  durationHours: number;
  status: 'ASSIGNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  cancellationReason?: string | null;
  actualStartTime?: Date | null;
  actualEndTime?: Date | null;
  startedBy?: string | null;
  endedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MonthlyPass {
  id: string;
  passNumber: string;
  passType?: 'SITE_SPECIFIC' | 'UNIVERSAL';
  primaryLocationId?: string;
  eligibleLocationIds?: string[];
  isUniversal?: boolean;
  ownerUid?: string;
  vehicleNumber: string;
  normalizedVehicleNumber: string;
  vehicleType: VehicleCategory;
  customerName: string;
  customerMobile: string;
  startDate: Date;
  endDate: Date;
  amount: number;
  amountPaid: number;
  outstandingAmount: number;
  paymentStatus: 'PAID';
  paymentMethod: 'cash' | 'upi';
  status: 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'CANCELLED';
  dynamicStatus: 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'CANCELLED';
  isExpiringSoon: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface WithdrawalRecord {
  id: string;
  withdrawalId: string;
  locationId?: string;
  ownerUid?: string;
  guardId: string;
  guardName: string;
  shiftId: string;
  type: 'CASH' | 'UPI';
  amount: number;
  adminUid: string;
  adminName: string;
  status: 'COMPLETED';
  notes?: string;
  previousOutstanding?: number;
  remainingOutstanding?: number;
  createdAt: Date;
}

export type HandoverStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface HandoverRecord {
  id: string;
  handoverId: string;
  locationId?: string;
  fromGuardId: string;
  fromGuardName: string;
  fromGuardEmail?: string;
  toGuardId: string;
  toGuardName: string;
  toGuardEmail?: string;
  shiftId: string;
  toShiftId?: string;
  amount: number;
  type: 'CASH' | 'UPI';
  action?: string;
  status: HandoverStatus;
  sourceBalanceBefore?: number;
  acceptedAt?: Date | null;
  acceptedBy?: string | null;
  rejectedAt?: Date | null;
  rejectedBy?: string | null;
  cancelledAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
}

export type HandoverModel = HandoverRecord;

export type GuardTab = 'dashboard' | 'entry' | 'active-vehicles' | 'exit' | 'my-shift';

export interface GuardFinancialResponsibility {
  guardUid: string;
  guardName: string;
  totalCashCollected: number;
  cashHandedOver: number;
  cashReceived: number;
  cashWithdrawn: number;
  outstandingCash: number;
  totalUpiCollected: number;
  upiHandedOver: number;
  upiReceived: number;
  upiWithdrawn: number;
  outstandingUpi: number;
  totalOutstanding: number;
}

export interface GuardWithFinancials {
  guard: GuardProfile;
  responsibility: GuardFinancialResponsibility;
  transactionCount: number;
  lastActive?: Date;
}

export interface DashboardMetrics {
  todayEntries: number;
  todayExits: number;
  activeParked: number;
  todayCollection: number;
  cashCollection: number;
  upiCollection: number;
}

export interface GuardCollectionSummary {
  guardUid: string;
  guardName: string;
  totalCash: number;
  totalUpi: number;
  netTotal: number;
  transactionCount: number;
  advanceTotal: number;
  finalTotal: number;
  refundTotal: number;
}

export interface ShiftCollectionSummary {
  shiftName: string;
  guardName: string;
  shiftDate: Date;
  startTime: Date;
  endTime: Date;
  totalCash: number;
  totalUpi: number;
  netTotal: number;
  transactionCount: number;
}

export interface VehiclePassCheckResult {
  hasValidPass: boolean;
  validPass: MonthlyPass | null;
  upcomingPass: MonthlyPass | null;
  expiredPass: MonthlyPass | null;
  isUpcoming?: boolean;
  isExpired?: boolean;
  isLocationMismatch?: boolean;
  locationMismatchMessage?: string;
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  bytes: number;
  format: string;
  deleteToken?: string;
}

export interface CreateVehicleEntryParams {
  vehicleNumber: string;
  vehicleType: 'twoWheeler' | 'fourWheeler';
  vehiclePhotoBlob: Blob;
  customerMobile: string;
  guardUid: string;
  guardName: string;
  guardShift: string;
  advanceAmount?: number;
  advancePaymentMethod?: 'cash' | 'upi';
  isMonthlyPass?: boolean;
  monthlyPassId?: string;
  locationId?: string;
  locationCode?: string;
}

export interface SettleVehicleExitParams {
  ticketId: string;
  vehicleNumber: string;
  vehicleType: VehicleCategory;
  entryTime: Date;
  exitTime: Date;
  grossCharge: number;
  advancePaid: number;
  balanceDue: number;
  refundAmount: number;
  paymentMethod: 'cash' | 'upi';
  exitGuardUid: string;
  exitGuardName: string;
  exitGuardShift: string;
  isMonthlyPass?: boolean;
  monthlyPassId?: string;
  expectedLocationId?: string;
}

// ==========================================
// Phase 4G: Shift Operations & Handover Types
// ==========================================

export type ResponsibilityAction =
  | "KEEP_WITH_ME"
  | "HANDOVER_INITIATED"
  | "HANDOVER_OUT"
  | "HANDOVER_IN"
  | "WITHDRAWAL"
  | "HANDOVER_REJECTED"
  | "HANDOVER_CANCELLED";

export type ResponsibilityStatus =
  | "Carried Forward"
  | "Transferred"
  | "Settled"
  | "Pending"
  | "Rejected"
  | "Cancelled";

export interface ResponsibilityEventModel {
  id: string;
  guardId: string;
  guardName: string;
  guardEmail?: string;
  shiftId: string;
  type: "CASH" | "UPI";
  action: ResponsibilityAction;
  status: ResponsibilityStatus | string;
  amount: number;
  createdAt: Date;
  targetGuardId?: string;
  targetGuardName?: string;
  adminUid?: string;
  adminName?: string;
  notes?: string;
}

export interface ShiftStats {
  entriesCount: number;
  exitsCount: number;
  totalCollection: number;
  cashCollection: number;
  upiCollection: number;
}

export interface InitiateHandoverParams {
  fromGuardId: string;
  fromGuardName: string;
  fromGuardEmail?: string;
  toGuardId: string;
  toGuardName: string;
  toGuardEmail?: string;
  shiftId: string;
  toShiftId?: string;
  type: "CASH" | "UPI";
  amount: number;
  notes?: string;
}

export interface RespondToHandoverParams {
  handoverId: string;
  accept: boolean;
  guardUid: string;
  guardName: string;
}

export interface CancelHandoverParams {
  handoverId: string;
  guardUid: string;
  guardName: string;
}

export interface KeepWithMeParams {
  guardId: string;
  guardName: string;
  shiftId: string;
  type: "CASH" | "UPI";
  amount: number;
}
