import React, { useEffect, useState } from 'react';
import {
  LogIn,
  Car,
  Bike,
  Camera,
  AlertTriangle,
  RefreshCw,
  CreditCard,
  Check,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { ParkingRecord, ShiftModel, VehiclePassCheckResult } from '../../../types';
import { useAuth } from '../../auth/AuthContext';
import {
  isValidCustomerMobile,
  isValidVehicleNumber,
  normalizeVehicleNumber,
} from '../../../utils/formatters';
import { checkVehiclePass } from '../../../services/monthlyPassService';
import {
  CapacityFullException,
  createVehicleEntry,
  getAvailableCapacity,
  VehicleAlreadyParkedException,
  InactiveLocationException,
} from '../../../services/parkingService';
import { WebCameraModal } from '../../../components/camera/WebCameraModal';
import { EntrySuccessModal } from '../components/EntrySuccessModal';
import { EntrySlipModal } from '../components/EntrySlipModal';

interface GuardEntryViewProps {
  onReturnDashboard: () => void;
  onViewActiveParking: () => void;
  activeShift: ShiftModel | null;
}

export const GuardEntryView: React.FC<GuardEntryViewProps> = ({
  onReturnDashboard,
  onViewActiveParking,
  activeShift,
}) => {
  const { currentUser, guardProfile, activeLocationId, activeLocation } = useAuth();
  const currentFacilityId = activeLocationId || activeLocation?.id || guardProfile?.assignedLocationId || 'loc_sangamner_01';

  // Form State
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<'twoWheeler' | 'fourWheeler'>('fourWheeler');
  const [customerMobile, setCustomerMobile] = useState('');
  const [takeAdvance, setTakeAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('20');
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState<'cash' | 'upi'>('cash');

  // Photo State
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Capacity State
  const [capacity2W, setCapacity2W] = useState<number>(50);
  const [capacity4W, setCapacity4W] = useState<number>(50);
  const [isLoadingCapacity, setIsLoadingCapacity] = useState(false);

  // Monthly Pass Detection
  const [passCheckResult, setPassCheckResult] = useState<VehiclePassCheckResult | null>(null);
  const [isCheckingPass, setIsCheckingPass] = useState(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdRecord, setCreatedRecord] = useState<ParkingRecord | null>(null);

  // Modal Flow
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);

  // Load live capacities
  const refreshCapacities = async () => {
    setIsLoadingCapacity(true);
    try {
      const [c2, c4] = await Promise.all([
        getAvailableCapacity('twoWheeler', currentFacilityId),
        getAvailableCapacity('fourWheeler', currentFacilityId),
      ]);
      setCapacity2W(c2);
      setCapacity4W(c4);
    } catch (e) {
      console.warn('[GuardEntryView] Error reading capacity:', e);
    } finally {
      setIsLoadingCapacity(false);
    }
  };

  useEffect(() => {
    refreshCapacities();
  }, [currentFacilityId]);

  // Update default advance when category changes
  const handleCategoryChange = (cat: 'twoWheeler' | 'fourWheeler') => {
    if (passCheckResult?.hasValidPass) return;
    setVehicleType(cat);
    setAdvanceAmount(cat === 'twoWheeler' ? '20' : '50');
  };

  // Debounced Monthly Pass check on vehicle number changes
  useEffect(() => {
    const clean = normalizeVehicleNumber(vehicleNumber);
    setPassCheckResult(null);

    if (clean.length < 4) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingPass(true);
      try {
        const result = await checkVehiclePass(clean, currentFacilityId);
        setPassCheckResult(result);

        if (result.hasValidPass && result.validPass) {
          // Auto-lock category and advance to 0 matching Flutter
          setVehicleType(result.validPass.vehicleType === 'twoWheeler' ? 'twoWheeler' : 'fourWheeler');
          setTakeAdvance(false);
          setAdvanceAmount('0');
        }
      } catch (err) {
        console.warn('[GuardEntryView] Pass check error:', err);
      } finally {
        setIsCheckingPass(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [vehicleNumber, currentFacilityId]);

  const handleClearForm = () => {
    setVehicleNumber('');
    setCustomerMobile('');
    setPhotoBlob(null);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
    setTakeAdvance(false);
    setAdvanceAmount('20');
    setAdvancePaymentMethod('cash');
    setPassCheckResult(null);
    setErrorMessage(null);
    refreshCapacities();
  };

  const handlePhotoCaptured = (blob: Blob, previewUrl: string) => {
    setPhotoBlob(blob);
    setPhotoPreviewUrl(previewUrl);
    setErrorMessage(null);
  };

  const currentAvailable = vehicleType === 'twoWheeler' ? capacity2W : capacity4W;
  const isCapacityFull = currentAvailable <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);

    const cleanPlate = normalizeVehicleNumber(vehicleNumber);
    if (!cleanPlate) {
      setErrorMessage('Vehicle number cannot be empty.');
      return;
    }

    if (!isValidVehicleNumber(cleanPlate)) {
      setErrorMessage('Invalid Indian registration plate format (e.g. MH12AB1234 or 22BH1234AA).');
      return;
    }

    const cleanMobile = customerMobile.trim();
    if (!cleanMobile) {
      setErrorMessage('Customer 10-digit mobile number is required.');
      return;
    }

    if (!isValidCustomerMobile(cleanMobile)) {
      setErrorMessage('Mobile number must be exactly 10 digits starting with 6, 7, 8, or 9.');
      return;
    }

    if (!photoBlob) {
      setErrorMessage('Mandatory vehicle photo required before issuing ticket.');
      return;
    }

    if (isCapacityFull) {
      setErrorMessage(
        (vehicleType === 'twoWheeler' ? 'Two-Wheeler' : 'Four-Wheeler') + ' parking is full. Entry blocked.'
      );
      return;
    }

    const guardUid = currentUser?.uid || guardProfile?.uid || 'guard';
    const guardName = guardProfile?.name || currentUser?.displayName || 'Guard';
    const shiftLabel = activeShift
      ? (activeShift.shiftId || 'Shift 1')
      : 'Standard Shift';

    const numAdvance = takeAdvance ? Number(advanceAmount) || 0 : 0;

    setIsSubmitting(true);

    try {
      const record = await createVehicleEntry({
        vehicleNumber: cleanPlate,
        vehicleType: vehicleType,
        vehiclePhotoBlob: photoBlob,
        customerMobile: cleanMobile,
        guardUid: guardUid,
        guardName: guardName,
        guardShift: shiftLabel,
        advanceAmount: passCheckResult?.hasValidPass ? 0 : numAdvance,
        advancePaymentMethod: advancePaymentMethod,
        isMonthlyPass: Boolean(passCheckResult?.hasValidPass),
        monthlyPassId: passCheckResult?.validPass?.id,
        locationId: currentFacilityId,
        locationCode: activeLocation?.code,
      });

      setCreatedRecord(record);
      setIsSuccessModalOpen(true);
      handleClearForm();
    } catch (err: unknown) {
      console.error('[GuardEntryView] Submission failed:', err);
      if (err instanceof InactiveLocationException) {
        setErrorMessage(err.message);
      } else if (err instanceof VehicleAlreadyParkedException) {
        setErrorMessage('This vehicle is already parked with an active ticket.');
      } else if (err instanceof CapacityFullException) {
        setErrorMessage((err.vehicleType === 'twoWheeler' ? 'Two-Wheeler' : 'Four-Wheeler') + ' parking is at full capacity.');
      } else {
        const error = err as Error;
        setErrorMessage(error.message || 'Failed to create vehicle entry. Please verify network.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Gate Entry (Gate In)</h1>
            <Badge variant="success">Phase 4C Live</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time vehicle registration, monthly pass detection, mandatory photo capture, and slip generation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Active Shift Indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs">
            <Clock className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-slate-600">Shift:</span>
            <span className="font-bold text-slate-900">
              {activeShift ? 'Active Assigned' : 'Standard Rotation'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshCapacities}
            disabled={isLoadingCapacity}
            className="text-xs gap-1.5"
            title="Refresh capacity counts"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (isLoadingCapacity ? 'animate-spin' : '')} />
            Capacity
          </Button>
        </div>
      </div>

      {/* 2. Error Banner */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-900 space-y-1">
            <p className="font-bold">Entry Blocked</p>
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* 3. Main Form Grid */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Vehicle & Pass Info */}
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <LogIn className="w-4 h-4 text-emerald-600" />
              Vehicle Details
            </h3>
            {normalizeVehicleNumber(vehicleNumber) && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold">
                {normalizeVehicleNumber(vehicleNumber)}
              </span>
            )}
          </div>

          {/* Vehicle Number Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span>Vehicle Number</span>
              <span className="text-[10px] text-slate-400 font-normal">State / BH series</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="e.g. MH 12 AB 1234 or 22BH1234AA"
                required
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold tracking-wider text-slate-900 uppercase focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              {isCheckingPass && (
                <div className="absolute right-3 top-3">
                  <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              Auto-normalizes spaces & hyphens (MH-12 AB 1234 &rarr; MH12AB1234)
            </p>
          </div>

          {/* Monthly Pass Feedback Banner */}
          {passCheckResult?.hasValidPass && passCheckResult.validPass && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <div className="text-xs text-purple-950 space-y-0.5">
                <div className="font-bold flex items-center gap-1.5">
                  <span>Active Monthly Pass Found</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-purple-200 text-purple-800 font-mono">
                    {passCheckResult.validPass.passNumber}
                  </span>
                </div>
                <p className="text-[11px] text-purple-800 leading-tight">
                  Holder: {passCheckResult.validPass.customerName}. Vehicle category locked & advance forced to ₹0.
                </p>
              </div>
            </div>
          )}

          {passCheckResult?.isUpcoming && passCheckResult.upcomingPass && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
              <p className="font-semibold">Upcoming Pass on Record</p>
              <p className="text-[11px] text-blue-700">
                Starts on {new Date(passCheckResult.upcomingPass.startDate).toLocaleDateString()}. Regular rates apply today.
              </p>
            </div>
          )}

          {passCheckResult?.isExpired && passCheckResult.expiredPass && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              <p className="font-semibold">Pass Expired</p>
              <p className="text-[11px] text-amber-700">
                Expired on {new Date(passCheckResult.expiredPass.endDate).toLocaleDateString()}. Standard rates apply.
              </p>
            </div>
          )}

          {/* Vehicle Category Toggle */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span>Vehicle Category</span>
              {passCheckResult?.hasValidPass && (
                <span className="text-[10px] text-purple-700 font-medium">Locked to Pass Category</span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* 2-Wheeler Button */}
              <button
                type="button"
                disabled={Boolean(passCheckResult?.hasValidPass)}
                onClick={() => handleCategoryChange('twoWheeler')}
                className={'p-3.5 rounded-xl border-2 flex items-center gap-3 transition-all text-left ' +
                  (vehicleType === 'twoWheeler'
                    ? 'border-emerald-500 bg-emerald-50/60 shadow-xs'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50') +
                  (passCheckResult?.hasValidPass ? ' opacity-90 cursor-not-allowed' : '')}
              >
                <div className={'w-9 h-9 rounded-lg flex items-center justify-center ' +
                  (vehicleType === 'twoWheeler' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600')}>
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900">2-Wheeler</div>
                  <div className="text-[11px] text-slate-500">₹20 1st hr</div>
                  <div className={'text-[10px] font-bold mt-0.5 ' +
                    (capacity2W > 0 ? 'text-emerald-700' : 'text-rose-600')}>
                    {capacity2W > 0 ? (capacity2W + ' slots avail') : 'FULL - BLOCKED'}
                  </div>
                </div>
              </button>

              {/* 4-Wheeler Button */}
              <button
                type="button"
                disabled={Boolean(passCheckResult?.hasValidPass)}
                onClick={() => handleCategoryChange('fourWheeler')}
                className={'p-3.5 rounded-xl border-2 flex items-center gap-3 transition-all text-left ' +
                  (vehicleType === 'fourWheeler'
                    ? 'border-emerald-500 bg-emerald-50/60 shadow-xs'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50') +
                  (passCheckResult?.hasValidPass ? ' opacity-90 cursor-not-allowed' : '')}
              >
                <div className={'w-9 h-9 rounded-lg flex items-center justify-center ' +
                  (vehicleType === 'fourWheeler' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600')}>
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900">4-Wheeler</div>
                  <div className="text-[11px] text-slate-500">₹50 1st hr</div>
                  <div className={'text-[10px] font-bold mt-0.5 ' +
                    (capacity4W > 0 ? 'text-emerald-700' : 'text-rose-600')}>
                    {capacity4W > 0 ? (capacity4W + ' slots avail') : 'FULL - BLOCKED'}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Customer Mobile Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Customer Mobile (10 Digits)</label>
            <input
              type="tel"
              value={customerMobile}
              onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="e.g. 9876543210"
              required
              maxLength={10}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[10px] text-slate-400">Used for WhatsApp digital slip and customer contact</p>
          </div>
        </Card>

        {/* Right Column: Photo Capture & Advance Deposit */}
        <div className="space-y-6">
          {/* Mandatory Photo Card */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-600" />
                Mandatory Vehicle Photo
              </h3>
              {photoBlob ? (
                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Captured
                </span>
              ) : (
                <span className="text-[11px] font-bold text-rose-600">Photo Required</span>
              )}
            </div>

            {photoPreviewUrl ? (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden aspect-16/9 bg-slate-900 border border-slate-200">
                  <img src={photoPreviewUrl} alt="Vehicle Preview" className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2">
                    <span className="bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-sm font-mono">
                      Ready for Cloudinary
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCameraOpen(true)}
                  className="w-full text-xs gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retake Vehicle Photo
                </Button>
              </div>
            ) : (
              <div
                onClick={() => setIsCameraOpen(true)}
                className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-emerald-50/30 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 group-hover:border-emerald-300 group-hover:scale-105 transition-all text-slate-600 group-hover:text-emerald-600 flex items-center justify-center mx-auto mb-2 shadow-xs">
                  <Camera className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-800">Click to Open Camera</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Capture plate & vehicle frame</p>
              </div>
            )}
          </Card>

          {/* Advance Collection Card */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                Advance Deposit
              </h3>
              {passCheckResult?.hasValidPass && (
                <span className="text-[11px] text-purple-700 font-bold">Waived (Monthly Pass)</span>
              )}
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="space-y-0.5">
                <label htmlFor="takeAdvance" className="text-xs font-semibold text-slate-800 cursor-pointer">
                  Collect Advance Now?
                </label>
                <p className="text-[10px] text-slate-500">Credited towards final parking charge at exit</p>
              </div>
              <input
                id="takeAdvance"
                type="checkbox"
                disabled={Boolean(passCheckResult?.hasValidPass)}
                checked={takeAdvance}
                onChange={(e) => setTakeAdvance(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded-sm border-slate-300 focus:ring-emerald-500 cursor-pointer"
              />
            </div>

            {takeAdvance && !passCheckResult?.hasValidPass && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Amount (₹)</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Payment Mode</label>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setAdvancePaymentMethod('cash')}
                        className={'py-1.5 rounded-lg text-xs font-bold transition-all ' +
                          (advancePaymentMethod === 'cash'
                            ? 'bg-white text-emerald-800 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900')}
                      >
                        Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdvancePaymentMethod('upi')}
                        className={'py-1.5 rounded-lg text-xs font-bold transition-all ' +
                          (advancePaymentMethod === 'upi'
                            ? 'bg-white text-emerald-800 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900')}
                      >
                        UPI
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submission Actions */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || isCapacityFull}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 font-bold text-sm justify-center shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Committing Entry to Firestore...
                  </span>
                ) : isCapacityFull ? (
                  'Entry Blocked - ' + (vehicleType === 'twoWheeler' ? '2W' : '4W') + ' Full'
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="w-4 h-4" />
                    Issue Ticket & Create Entry
                  </span>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearForm}
                className="w-full text-xs text-slate-500 hover:text-slate-800"
              >
                Reset Form
              </Button>
            </div>
          </Card>
        </div>
      </form>

      {/* Camera Dialog Modal */}
      <WebCameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onPhotoCaptured={handlePhotoCaptured}
      />

      {/* Entry Success Modal */}
      <EntrySuccessModal
        isOpen={isSuccessModalOpen}
        record={createdRecord}
        onViewSlip={() => {
          setIsSuccessModalOpen(false);
          setIsSlipModalOpen(true);
        }}
        onNewEntry={() => {
          setIsSuccessModalOpen(false);
          setCreatedRecord(null);
        }}
        onReturnDashboard={() => {
          setIsSuccessModalOpen(false);
          onReturnDashboard();
        }}
        onViewActiveParking={() => {
          setIsSuccessModalOpen(false);
          onViewActiveParking();
        }}
      />

      {/* 58mm Digital Slip & WhatsApp Modal */}
      <EntrySlipModal
        isOpen={isSlipModalOpen}
        record={createdRecord}
        onClose={() => {
          setIsSlipModalOpen(false);
          setCreatedRecord(null);
        }}
        onReturnDashboard={() => {
          setIsSlipModalOpen(false);
          setCreatedRecord(null);
          onReturnDashboard();
        }}
      />
    </div>
  );
};
