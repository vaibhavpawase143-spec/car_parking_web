import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Lock,
  Car,
  Bike,
  Clock,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { LocationRates, ParkingLocationDoc, UserRole } from '../../types';
import { Button } from '../../components/common/Button';
import { DEFAULT_LEGACY_RATES } from '../../services/locationService';
import { LocationFormData } from '../../utils/locationValidation';
import { saveLocationPrototype } from '../../services/locationAdminService';
import { LocationAdminCallableService } from '../../services/locationAdminCallableService';

interface LocationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  locationDoc?: ParkingLocationDoc | null;
  existingLocations: ParkingLocationDoc[];
  userRole: UserRole;
  onSaveSuccess?: (savedDoc: ParkingLocationDoc) => void;
}

export const LocationFormModal: React.FC<LocationFormModalProps> = ({
  isOpen,
  onClose,
  locationDoc,
  existingLocations,
  userRole,
  onSaveSuccess,
}) => {
  const isEdit = Boolean(locationDoc);
  const isManager = userRole === 'manager';

  const defaultRates: LocationRates = locationDoc?.rates || { ...DEFAULT_LEGACY_RATES };

  const [formData, setFormData] = useState<LocationFormData>({
    id: locationDoc?.id || '',
    code: locationDoc?.code || '',
    name: locationDoc?.name || '',
    marathiName: locationDoc?.marathiName || '',
    locationName: locationDoc?.locationName || '',
    marathiLocationName: locationDoc?.marathiLocationName || '',
    address: locationDoc?.address || '',
    authorityLicenseText: locationDoc?.authorityLicenseText || '',
    contactMobile: locationDoc?.contactMobile || '',
    ownerUid: locationDoc?.ownerUid || '',
    isActive: locationDoc?.isActive !== false,
    capacity: {
      carTotal: locationDoc?.capacity?.carTotal || 50,
      twoWheelerTotal: locationDoc?.capacity?.twoWheelerTotal || 100,
    },
    rates: { ...defaultRates },
    operatingHours: {
      openTime: locationDoc?.operatingHours?.openTime || '06:00',
      closeTime: locationDoc?.operatingHours?.closeTime || '23:00',
      is24Hours: locationDoc?.operatingHours?.is24Hours ?? true,
    },
    features: {
      cashEnabled: locationDoc?.features?.cashEnabled ?? true,
      upiEnabled: locationDoc?.features?.upiEnabled ?? true,
      advanceEnabled: locationDoc?.features?.advanceEnabled ?? true,
      overnightParkingAllowed: locationDoc?.features?.overnightParkingAllowed ?? true,
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setFeedback(null);

    if (locationDoc) {
      setFormData({
        id: locationDoc.id,
        code: locationDoc.code,
        name: locationDoc.name,
        marathiName: locationDoc.marathiName || '',
        locationName: locationDoc.locationName || '',
        marathiLocationName: locationDoc.marathiLocationName || '',
        address: locationDoc.address || '',
        authorityLicenseText: locationDoc.authorityLicenseText || '',
        contactMobile: locationDoc.contactMobile || '',
        ownerUid: locationDoc.ownerUid || '',
        isActive: locationDoc.isActive !== false,
        capacity: {
          carTotal: locationDoc.capacity?.carTotal || 50,
          twoWheelerTotal: locationDoc.capacity?.twoWheelerTotal || 100,
        },
        rates: { ...locationDoc.rates },
        operatingHours: {
          openTime: locationDoc.operatingHours?.openTime || '06:00',
          closeTime: locationDoc.operatingHours?.closeTime || '23:00',
          is24Hours: locationDoc.operatingHours?.is24Hours ?? true,
        },
        features: {
          cashEnabled: locationDoc.features?.cashEnabled ?? true,
          upiEnabled: locationDoc.features?.upiEnabled ?? true,
          advanceEnabled: locationDoc.features?.advanceEnabled ?? true,
          overnightParkingAllowed: locationDoc.features?.overnightParkingAllowed ?? true,
        },
      });
    } else {
      setFormData({
        code: '',
        name: '',
        marathiName: '',
        locationName: '',
        marathiLocationName: '',
        address: '',
        authorityLicenseText: 'म. रा. मा. परिवहन महामंडळाचे अधिकृत वाहनतळ',
        contactMobile: '',
        isActive: true,
        capacity: { carTotal: 50, twoWheelerTotal: 100 },
        rates: { ...DEFAULT_LEGACY_RATES },
        operatingHours: { openTime: '06:00', closeTime: '23:00', is24Hours: true },
        features: { cashEnabled: true, upiEnabled: true, advanceEnabled: true, overnightParkingAllowed: true },
      });
    }
  }, [isOpen, locationDoc]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});
    setFeedback(null);

    try {
      let res;
      if (LocationAdminCallableService.isEmulatorActive()) {
        if (isEdit && locationDoc) {
          res = await LocationAdminCallableService.updateLocation(formData, {
            originalDoc: locationDoc,
            userRole,
          });
        } else {
          res = await LocationAdminCallableService.createLocation(formData, {
            existingLocations,
            userRole,
          });
        }
      } else {
        res = await saveLocationPrototype(formData, {
          isEdit,
          originalDoc: locationDoc,
          existingLocations,
          userRole,
        });
      }

      if (res.success && res.doc) {
        setFeedback({ message: res.message, isError: false });
        setTimeout(() => {
          if (onSaveSuccess && res.doc) onSaveSuccess(res.doc);
          onClose();
        }, 1200);
      } else {
        if (res.errors) {
          setErrors(res.errors);
        }
        setFeedback({ message: res.message, isError: true });
      }
    } catch (err: any) {
      setFeedback({ message: err?.message || 'Submission error.', isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-100">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isEdit ? `Edit Facility: ${locationDoc?.name} (${locationDoc?.code})` : 'Register New Parking Location'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Phase 5D-2 Location Management Form & Validation Workflow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prototype Persistence Barrier Notice */}
        <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Isolated Prototype Mode:</strong> Production Firestore persistence is disabled. Changes are validated and applied to isolated emulator/mock context only.
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-200/60 font-bold uppercase shrink-0">
            EMULATOR / IN-MEMORY
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Section 1: Facility Identity */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
              <Building2 className="w-3.5 h-3.5 text-brand-600" />
              1. Facility Identity & Signage
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Location Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={5}
                  disabled={isEdit}
                  placeholder="e.g. SMR, PUN"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className={`w-full px-3 py-2 rounded-lg border font-mono font-bold ${
                    isEdit
                      ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-brand-500'
                  }`}
                />
                {isEdit && <span className="text-[10px] text-slate-400">Code is immutable once provisioned</span>}
                {errors.code && <p className="text-[11px] text-red-600 mt-1">{errors.code}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  English Facility Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Jay Ganesh Pay & Park"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:border-brand-500"
                />
                {errors.name && <p className="text-[11px] text-red-600 mt-1">{errors.name}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Marathi Facility Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="जय गणेश पे अँड पार्क"
                  value={formData.marathiName}
                  onChange={(e) => setFormData({ ...formData, marathiName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                />
                {errors.marathiName && <p className="text-[11px] text-red-600 mt-1">{errors.marathiName}</p>}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Specific Counter / Landmark <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Sangamner Bus Stand"
                  value={formData.locationName}
                  onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                />
                {errors.locationName && <p className="text-[11px] text-red-600 mt-1">{errors.locationName}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Marathi Counter / Landmark <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="संगमनेर बसस्थानक"
                  value={formData.marathiLocationName}
                  onChange={(e) => setFormData({ ...formData, marathiLocationName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                />
                {errors.marathiLocationName && <p className="text-[11px] text-red-600 mt-1">{errors.marathiLocationName}</p>}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Contact Mobile <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="9690793434"
                  value={formData.contactMobile}
                  onChange={(e) => setFormData({ ...formData, contactMobile: e.target.value.replace(/\D/g, '') })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono"
                />
                {errors.contactMobile && <p className="text-[11px] text-red-600 mt-1">{errors.contactMobile}</p>}
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Full Physical Address <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Bus Stand Compound, Sangamner, Maharashtra 422605"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              />
              {errors.address && <p className="text-[11px] text-red-600 mt-1">{errors.address}</p>}
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Official Authority License Text</label>
              <input
                type="text"
                placeholder="म. रा. मा. परिवहन महामंडळाचे अधिकृत वाहनतळ"
                value={formData.authorityLicenseText}
                onChange={(e) => setFormData({ ...formData, authorityLicenseText: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              />
            </div>
          </div>

          {/* Section 2: Capacity & Operating Hours */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
              <Car className="w-3.5 h-3.5 text-brand-600" />
              2. Capacity Allotment & Hours
            </h4>

            {isManager && (
              <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Capacity alterations are locked: Location Managers are restricted per Phase 5B rules.</span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Car Bay Total</label>
                <input
                  type="number"
                  min={1}
                  disabled={isManager}
                  value={formData.capacity.carTotal}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      capacity: { ...formData.capacity, carTotal: parseInt(e.target.value, 10) || 0 },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-bold"
                />
                {errors['capacity.carTotal'] && <p className="text-[11px] text-red-600 mt-1">{errors['capacity.carTotal']}</p>}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">2W Bay Total</label>
                <input
                  type="number"
                  min={1}
                  disabled={isManager}
                  value={formData.capacity.twoWheelerTotal}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      capacity: { ...formData.capacity, twoWheelerTotal: parseInt(e.target.value, 10) || 0 },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-bold"
                />
                {errors['capacity.twoWheelerTotal'] && (
                  <p className="text-[11px] text-red-600 mt-1">{errors['capacity.twoWheelerTotal']}</p>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Open Time (24h)</label>
                <input
                  type="text"
                  placeholder="06:00"
                  disabled={formData.operatingHours.is24Hours}
                  value={formData.operatingHours.openTime}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      operatingHours: { ...formData.operatingHours, openTime: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 font-mono"
                />
                {errors['operatingHours.openTime'] && (
                  <p className="text-[11px] text-red-600 mt-1">{errors['operatingHours.openTime']}</p>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Close Time (24h)</label>
                <input
                  type="text"
                  placeholder="23:00"
                  disabled={formData.operatingHours.is24Hours}
                  value={formData.operatingHours.closeTime}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      operatingHours: { ...formData.operatingHours, closeTime: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 font-mono"
                />
                {errors['operatingHours.closeTime'] && (
                  <p className="text-[11px] text-red-600 mt-1">{errors['operatingHours.closeTime']}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="is24HoursToggle"
                checked={formData.operatingHours.is24Hours}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    operatingHours: { ...formData.operatingHours, is24Hours: e.target.checked },
                  })
                }
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="is24HoursToggle" className="font-medium text-slate-700 cursor-pointer">
                Facility operates 24 hours continuously
              </label>
            </div>
          </div>

          {/* Section 3: Feature Capabilities */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-600" />
              3. Operational Payment Capabilities
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.features.cashEnabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      features: { ...formData.features, cashEnabled: e.target.checked },
                    })
                  }
                  className="rounded text-brand-600"
                />
                <span className="font-medium text-slate-800">Cash Collections</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.features.upiEnabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      features: { ...formData.features, upiEnabled: e.target.checked },
                    })
                  }
                  className="rounded text-brand-600"
                />
                <span className="font-medium text-slate-800">UPI Payments</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.features.advanceEnabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      features: { ...formData.features, advanceEnabled: e.target.checked },
                    })
                  }
                  className="rounded text-brand-600"
                />
                <span className="font-medium text-slate-800">Gate Advance Deposit</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.features.overnightParkingAllowed}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      features: { ...formData.features, overnightParkingAllowed: e.target.checked },
                    })
                  }
                  className="rounded text-brand-600"
                />
                <span className="font-medium text-slate-800">Overnight Parking</span>
              </label>
            </div>
          </div>

          {/* Section 4: Canonical 10-Rate Card */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-600" />
              4. Canonical 10-Field Rate Schedule
            </h4>

            {isManager && (
              <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Rate card modification locked: Location Managers are restricted per Phase 5B rules.</span>
              </div>
            )}

            {errors.ratesPermission && (
              <p className="text-xs text-red-600 font-semibold">{errors.ratesPermission}</p>
            )}

            {/* Four-Wheeler Rates */}
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
              <div className="font-semibold text-blue-900 flex items-center gap-1.5 text-xs">
                <Car className="w-4 h-4 text-blue-600" />
                Four-Wheeler Pricing (₹)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">1st Hour (₹)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isManager}
                    value={formData.rates.fourWheelerFirstHourRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rates: { ...formData.rates, fourWheelerFirstHourRate: Number(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-bold bg-white text-slate-800"
                  />
                  {errors['rates.fourWheelerFirstHourRate'] && (
                    <p className="text-[10px] text-red-600 mt-0.5">{errors['rates.fourWheelerFirstHourRate']}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Addl Hour (₹)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isManager}
                    value={formData.rates.fourWheelerAdditionalHourRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rates: { ...formData.rates, fourWheelerAdditionalHourRate: Number(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-bold bg-white text-slate-800"
                  />
                  {errors['rates.fourWheelerAdditionalHourRate'] && (
                    <p className="text-[10px] text-red-600 mt-0.5">{errors['rates.fourWheelerAdditionalHourRate']}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">12h Cap (₹)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isManager}
                    value={formData.rates.fourWheeler12HourCap}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rates: { ...formData.rates, fourWheeler12HourCap: Number(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-bold bg-white text-slate-800"
                  />
                  {errors['rates.fourWheeler12HourCap'] && (
                    <p className="text-[10px] text-red-600 mt-0.5">{errors['rates.fourWheeler12HourCap']}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">24h Cap (₹)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isManager}
                    value={formData.rates.fourWheeler24HourCap}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rates: { ...formData.rates, fourWheeler24HourCap: Number(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-bold bg-white text-slate-800"
                  />
                  {errors['rates.fourWheeler24HourCap'] && (
                    <p className="text-[10px] text-red-600 mt-0.5">{errors['rates.fourWheeler24HourCap']}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Monthly Pass (₹)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isManager}
                    value={formData.rates.fourWheelerMonthlyRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rates: { ...formData.rates, fourWheelerMonthlyRate: Number(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-bold bg-white text-slate-800"
                  />
                  {errors['rates.fourWheelerMonthlyRate'] && (
                    <p className="text-[10px] text-red-600 mt-0.5">{errors['rates.fourWheelerMonthlyRate']}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Two-Wheeler Rates */}
            <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-2">
              <div className="font-semibold text-emerald-900 flex items-center gap-1.5 text-xs">
                <Bike className="w-4 h-4 text-emerald-600" />
                Two-Wheeler Pricing (₹)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">1st Hour (₹)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isManager}
                    value={formData.rates.twoWheelerFirstHourRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rates: { ...formData.rates, twoWheelerFirstHourRate: Number(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-bold bg-white text-slate-800"
                  />
                  {errors['rates.twoWheelerFirstHourRate'] && (
                    <p className="text-[10px] text-red-600 mt-0.5">{errors['rates.twoWheelerFirstHourRate']}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Addl Hour (₹)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isManager}
                    value={formData.rates.twoWheelerAdditionalHourRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rates: { ...formData.rates, twoWheelerAdditionalHourRate: Number(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-bold bg-white text-slate-800"
                  />
                  {errors['rates.twoWheelerAdditionalHourRate'] && (
                    <p className="text-[10px] text-red-600 mt-0.5">{errors['rates.twoWheelerAdditionalHourRate']}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">12h Cap (₹)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isManager}
                    value={formData.rates.twoWheeler12HourCap}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rates: { ...formData.rates, twoWheeler12HourCap: Number(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-bold bg-white text-slate-800"
                  />
                  {errors['rates.twoWheeler12HourCap'] && (
                    <p className="text-[10px] text-red-600 mt-0.5">{errors['rates.twoWheeler12HourCap']}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">24h Cap (₹)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isManager}
                    value={formData.rates.twoWheeler24HourCap}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rates: { ...formData.rates, twoWheeler24HourCap: Number(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-bold bg-white text-slate-800"
                  />
                  {errors['rates.twoWheeler24HourCap'] && (
                    <p className="text-[10px] text-red-600 mt-0.5">{errors['rates.twoWheeler24HourCap']}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Monthly Pass (₹)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isManager}
                    value={formData.rates.twoWheelerMonthlyRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rates: { ...formData.rates, twoWheelerMonthlyRate: Number(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-bold bg-white text-slate-800"
                  />
                  {errors['rates.twoWheelerMonthlyRate'] && (
                    <p className="text-[10px] text-red-600 mt-0.5">{errors['rates.twoWheelerMonthlyRate']}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Feedback & Error Banner */}
          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                feedback.isError
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {feedback.isError ? (
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={isSubmitting}
              icon={isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              {isSubmitting
                ? 'Validating...'
                : isEdit
                ? 'Save Configuration (Prototype)'
                : 'Register Location (Prototype)'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
