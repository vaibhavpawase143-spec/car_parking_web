import { httpsCallable } from 'firebase/functions';
import { functions, isEmulatorMode, isFirebaseConfigured } from '../firebase';
import { ParkingLocationDoc, UserRole } from '../types';
import { LocationFormData, validateLocationForm } from '../utils/locationValidation';
import { fetchLocationById } from './locationService';

export interface CallableOperationResult {
  success: boolean;
  doc?: ParkingLocationDoc;
  locationId?: string;
  errors?: Record<string, string>;
  isProductionBlocked?: boolean;
  errorCode?: string;
  message: string;
}

// In-flight request lock to prevent duplicate submissions
let isOperationInFlight = false;

/**
 * Phase 5F-1: Client Callable Adapter
 *
 * Integrates location management forms with trusted Cloud Functions:
 * - createLocation
 * - updateLocation
 * - deactivateLocation
 *
 * Safety Boundaries:
 * - Strictly EMULATOR-ONLY in this phase.
 * - Fails closed if not in emulator mode (production CRUD remains locked).
 * - Zero optimistic writes; UI updates only after server-side confirmation.
 * - Prevents duplicate double-click submissions.
 */
export class LocationAdminCallableService {
  /**
   * Checks whether the environment is safe to invoke emulator functions.
   */
  static isEmulatorActive(): boolean {
    return isEmulatorMode() && isFirebaseConfigured() && functions !== null;
  }

  /**
   * Create a new location via Cloud Function
   */
  static async createLocation(
    formData: LocationFormData,
    options: {
      existingLocations?: ParkingLocationDoc[];
      userRole?: UserRole;
    } = {}
  ): Promise<CallableOperationResult> {
    // 1. Client-side sanity validation (defensive pre-check)
    const validation = validateLocationForm(formData, {
      isEdit: false,
      existingLocations: options.existingLocations || [],
      userRole: options.userRole || 'owner',
    });

    if (!validation.isValid) {
      return {
        success: false,
        errors: validation.errors,
        message: 'Validation failed. Please correct the highlighted errors.',
      };
    }

    // 2. Production Safety Boundary
    if (!this.isEmulatorActive()) {
      return {
        success: false,
        isProductionBlocked: true,
        message: 'Production Persistence Disabled: Creating facilities in production is blocked pending Phase 5F deployment.',
      };
    }

    // 3. Duplicate submission lock
    if (isOperationInFlight) {
      return {
        success: false,
        message: 'Another operation is currently in progress. Please wait.',
      };
    }

    isOperationInFlight = true;

    try {
      const callable = httpsCallable<any, { success: true; locationId: string; code: string; message: string }>(
        functions!,
        'createLocation'
      );

      const res = await callable({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        marathiName: formData.marathiName.trim(),
        locationName: formData.locationName.trim(),
        marathiLocationName: formData.marathiLocationName.trim(),
        address: formData.address.trim(),
        authorityLicenseText: formData.authorityLicenseText?.trim() || '',
        contactMobile: formData.contactMobile.trim(),
        capacity: {
          carTotal: Number(formData.capacity.carTotal),
          twoWheelerTotal: Number(formData.capacity.twoWheelerTotal),
        },
        rates: formData.rates,
        operatingHours: formData.operatingHours,
        features: formData.features,
      });

      // 4. Fetch authoritative document from Firestore after confirmed server creation
      const createdDoc = await fetchLocationById(res.data.locationId);

      return {
        success: true,
        locationId: res.data.locationId,
        doc: createdDoc || undefined,
        message: res.data.message,
      };
    } catch (err: any) {
      return this.mapCallableError(err);
    } finally {
      isOperationInFlight = false;
    }
  }

  /**
   * Update an existing location via Cloud Function
   */
  static async updateLocation(
    formData: LocationFormData,
    options: {
      originalDoc: ParkingLocationDoc;
      userRole?: UserRole;
    }
  ): Promise<CallableOperationResult> {
    // 1. Client-side pre-validation
    const validation = validateLocationForm(formData, {
      isEdit: true,
      originalDoc: options.originalDoc,
      userRole: options.userRole || 'owner',
    });

    if (!validation.isValid) {
      return {
        success: false,
        errors: validation.errors,
        message: 'Validation failed. Please correct the highlighted errors.',
      };
    }

    // 2. Production Safety Boundary
    if (!this.isEmulatorActive()) {
      return {
        success: false,
        isProductionBlocked: true,
        message: 'Production Persistence Disabled: Modifying facility configuration in production is blocked pending Phase 5F deployment.',
      };
    }

    if (isOperationInFlight) {
      return {
        success: false,
        message: 'Another operation is currently in progress. Please wait.',
      };
    }

    isOperationInFlight = true;

    try {
      const callable = httpsCallable<any, { success: true; locationId: string; message: string }>(
        functions!,
        'updateLocation'
      );

      const targetId = options.originalDoc.id;

      const res = await callable({
        locationId: targetId,
        name: formData.name.trim(),
        marathiName: formData.marathiName.trim(),
        locationName: formData.locationName.trim(),
        marathiLocationName: formData.marathiLocationName.trim(),
        address: formData.address.trim(),
        authorityLicenseText: formData.authorityLicenseText?.trim(),
        contactMobile: formData.contactMobile.trim(),
        capacity: {
          carTotal: Number(formData.capacity.carTotal),
          twoWheelerTotal: Number(formData.capacity.twoWheelerTotal),
        },
        rates: formData.rates,
        operatingHours: formData.operatingHours,
        features: formData.features,
      });

      // Fetch freshly committed document
      const updatedDoc = await fetchLocationById(targetId);

      return {
        success: true,
        locationId: targetId,
        doc: updatedDoc || undefined,
        message: res.data.message,
      };
    } catch (err: any) {
      return this.mapCallableError(err);
    } finally {
      isOperationInFlight = false;
    }
  }

  /**
   * Deactivate a facility via Cloud Function
   */
  static async deactivateLocation(
    location: ParkingLocationDoc,
    reason: string = 'Administrative facility deactivation.'
  ): Promise<CallableOperationResult> {
    if (!this.isEmulatorActive()) {
      return {
        success: false,
        isProductionBlocked: true,
        message: 'Production Deactivation Disabled: Facility deactivation in production is blocked pending Phase 5F deployment.',
      };
    }

    if (isOperationInFlight) {
      return {
        success: false,
        message: 'Another operation is currently in progress. Please wait.',
      };
    }

    isOperationInFlight = true;

    try {
      const callable = httpsCallable<any, { success: true; locationId: string; isActive: false; message: string }>(
        functions!,
        'deactivateLocation'
      );

      const res = await callable({
        locationId: location.id,
        reason: reason.trim() || 'Administrative deactivation.',
      });

      return {
        success: true,
        locationId: res.data.locationId,
        message: res.data.message,
      };
    } catch (err: any) {
      return this.mapCallableError(err);
    } finally {
      isOperationInFlight = false;
    }
  }

  /**
   * Map Firebase Functions Callable errors into user-friendly UI messages and field errors
   */
  private static mapCallableError(err: any): CallableOperationResult {
    const rawCode = String(err?.code || '').toLowerCase();
    const rawMessage = String(err?.message || 'A server error occurred.').replace('FirebaseError: ', '');

    if (rawCode.includes('unauthenticated')) {
      return {
        success: false,
        errorCode: 'unauthenticated',
        message: 'Your authentication session has expired. Please sign in again.',
      };
    }

    if (rawCode.includes('permission-denied')) {
      return {
        success: false,
        errorCode: 'permission-denied',
        message: rawMessage,
      };
    }

    if (rawCode.includes('already-exists')) {
      return {
        success: false,
        errorCode: 'already-exists',
        errors: { code: 'This location code is already in use by another facility. Please choose a unique code.' },
        message: rawMessage,
      };
    }

    if (rawCode.includes('invalid-argument')) {
      const fieldErrors: Record<string, string> = {};
      // Extract field errors if formatted like 'rates.fourWheeler12HourCap: ...'
      if (rawMessage.includes('rates.')) {
        fieldErrors['rates'] = rawMessage;
      }
      if (rawMessage.includes('capacity.')) {
        fieldErrors['capacity'] = rawMessage;
      }
      return {
        success: false,
        errorCode: 'invalid-argument',
        errors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
        message: rawMessage,
      };
    }

    if (rawCode.includes('unavailable') || rawCode.includes('deadline-exceeded')) {
      return {
        success: false,
        errorCode: 'unavailable',
        message: 'The server is temporarily unavailable or timed out. Please check your network and retry explicitly.',
      };
    }

    return {
      success: false,
      errorCode: rawCode || 'internal',
      message: rawMessage,
    };
  }
}
