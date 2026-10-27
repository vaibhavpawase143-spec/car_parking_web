export type UserRole = 'owner' | 'manager' | 'guard' | 'admin';

export interface LocationRates {
  fourWheelerFirstHourRate: number;
  fourWheelerAdditionalHourRate: number;
  fourWheeler12HourCap: number;
  fourWheeler24HourCap: number;
  fourWheelerMonthlyRate: number;
  twoWheelerFirstHourRate: number;
  twoWheelerAdditionalHourRate: number;
  twoWheeler12HourCap: number;
  twoWheeler24HourCap: number;
  twoWheelerMonthlyRate: number;
}

export interface LocationCapacity {
  carTotal: number;
  twoWheelerTotal: number;
}

export interface LocationOperatingHours {
  openTime: string;
  closeTime: string;
  is24Hours: boolean;
}

export interface LocationFeatures {
  cashEnabled: boolean;
  upiEnabled: boolean;
  advanceEnabled: boolean;
  overnightParkingAllowed: boolean;
  allowManagerRateEdits?: boolean;
}

export interface ParkingLocationDoc {
  id: string;
  code: string;
  name: string;
  marathiName: string;
  locationName: string;
  marathiLocationName: string;
  address: string;
  authorityLicenseText: string;
  contactMobile: string;
  ownerUid: string;
  managerUids: string[];
  isActive: boolean;
  capacity: LocationCapacity;
  rates: LocationRates;
  operatingHours: LocationOperatingHours;
  features: LocationFeatures;
  createdAt: any;
  updatedAt: any;
}

export interface LocationCodeDoc {
  code: string;
  locationId: string;
  ownerUid: string;
  createdAt: any;
}

export interface AuditLogDoc {
  id: string;
  timestamp: any;
  actorUid: string;
  actorRole: UserRole;
  action: 'LOCATION_CREATED' | 'LOCATION_UPDATED' | 'LOCATION_DEACTIVATED';
  entityType: 'LOCATION';
  entityId: string;
  locationId: string;
  details: Record<string, any>;
}

export interface UserStaffProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  ownerUid?: string;
  assignedLocationIds: string[];
}
