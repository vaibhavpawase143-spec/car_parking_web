import React, { useState, useEffect } from 'react';
import {
  Search,
  QrCode,
  Car,
  ShieldCheck,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  Banknote,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';
import { ParkingRecord, ShiftModel } from '../../../types';
import { useAuth } from '../../auth/AuthContext';
import {
  searchTicketsForExit,
  settleVehicleExit,
  TicketNotFoundException,
  VehicleAlreadyExitedException,
  VehicleNotActiveException,
  CrossLocationSettlementException,
} from '../../../services/parkingService';
import { DEFAULT_LEGACY_LOCATION_ID } from '../../../services/locationService';
import { calculateParkingFee, FeeCalculationResult } from '../../../utils/feeCalculator';
import {
  formatCurrency,
  formatDateTime,
  formatVehicleType,
  normalizeVehicleNumber,
  formatLiveDuration
} from '../../../utils/formatters';
import { Button } from '../../../components/common/Button';
import { ExitSuccessModal } from '../components/ExitSuccessModal';
import { ExitReceiptModal } from '../components/ExitReceiptModal';
import { MatchingVehiclesModal } from '../components/MatchingVehiclesModal';

interface GuardExitViewProps {
  onReturnDashboard: () => void;
  activeShift?: ShiftModel | null;
  initialQuery?: string | null;
  onClearInitialQuery?: () => void;
}

type ExitStep = 'search' | 'verify' | 'settle';

export const GuardExitView: React.FC<GuardExitViewProps> = ({
  onReturnDashboard,
  activeShift,
  initialQuery,
  onClearInitialQuery,
}) => {
  const { currentUser, guardProfile, activeLocationId, activeLocation } = useAuth();
  const currentFacilityId = activeLocationId || activeLocation?.id || guardProfile?.assignedLocationId || DEFAULT_LEGACY_LOCATION_ID;

  // Search State
  const [searchQuery, setSearchQuery] = useState(initialQuery || '');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Vehicle Selection State
  const [matchedRecords, setMatchedRecords] = useState<ParkingRecord[]>([]);
  const [isMatchingModalOpen, setIsMatchingModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ParkingRecord | null>(null);
  const [currentStep, setCurrentStep] = useState<ExitStep>('search');

  // Settlement Preview State
  const [exitTime, setExitTime] = useState<Date>(new Date());
  const [calculation, setCalculation] = useState<FeeCalculationResult | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi'>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [upiConfirmed, setUpiConfirmed] = useState(false);
  const [refundConfirmed, setRefundConfirmed] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [settlementError, setSettlementError] = useState<string | null>(null);

  // Completed Settlement State
  const [settledRecord, setSettledRecord] = useState<ParkingRecord | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // If initialQuery is provided from Active Vehicles tab, trigger search automatically
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setSearchQuery(initialQuery.trim());
      handleExecuteSearch(initialQuery.trim());
      if (onClearInitialQuery) {
        onClearInitialQuery();
      }
    }
  }, [initialQuery]);

  // Handle Search Execution
  const handleExecuteSearch = async (queryToSearch?: string) => {
    const q = (queryToSearch ?? searchQuery).trim();
    if (!q) {
      setSearchError('Please enter a ticket number or vehicle registration plate');
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setSettlementError(null);

    try {
      const records = await searchTicketsForExit(q, currentFacilityId);
      if (records.length === 1) {
        // Exactly one match -> proceed directly to verification
        selectVehicleForExit(records[0]);
      } else if (records.length > 1) {
        // Multiple matches -> require guard to select
        setMatchedRecords(records);
        setIsMatchingModalOpen(true);
      }
    } catch (err: any) {
      if (err instanceof TicketNotFoundException) {
        setSearchError('No active parking record found for "' + q + '". Please verify the ticket or plate number.');
      } else if (err instanceof VehicleAlreadyExitedException) {
        setSearchError('Vehicle "' + q + '" has ALREADY EXITED this parking facility. Duplicate exit prevented.');
      } else if (err instanceof VehicleNotActiveException) {
        setSearchError('Vehicle record found, but parking status is NOT ACTIVE.');
      } else {
        setSearchError(err?.message || 'Error searching for vehicle. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Select vehicle and calculate initial fee
  const selectVehicleForExit = (record: ParkingRecord) => {
    setSelectedRecord(record);
    const now = new Date();
    setExitTime(now);

    const effectiveRates = record.rateSnapshot || activeLocation?.rates;
    const calc = calculateParkingFee({
      vehicleType: record.vehicleType,
      entryTime: record.entryTime,
      exitTime: now,
      advancePaid: record.advanceAmount || 0,
      isMonthlyPass: record.isMonthlyPass,
      rates: effectiveRates,
    });

    setCalculation(calc);
    setCashTendered(calc.balanceDue > 0 ? String(Math.ceil(calc.balanceDue)) : '0');
    setPaymentMethod('cash');
    setUpiConfirmed(false);
    setRefundConfirmed(false);
    setSettlementError(null);
    setCurrentStep('verify');
    setIsMatchingModalOpen(false);
  };

  // Recalculate fee to current second
  const handleRecalculate = () => {
    if (!selectedRecord) return;
    const now = new Date();
    setExitTime(now);

    const effectiveRates = selectedRecord.rateSnapshot || activeLocation?.rates;
    const calc = calculateParkingFee({
      vehicleType: selectedRecord.vehicleType,
      entryTime: selectedRecord.entryTime,
      exitTime: now,
      advancePaid: selectedRecord.advanceAmount || 0,
      isMonthlyPass: selectedRecord.isMonthlyPass,
      rates: effectiveRates,
    });

    setCalculation(calc);
    if (calc.balanceDue > 0) {
      setCashTendered(String(Math.ceil(calc.balanceDue)));
    } else {
      setCashTendered('0');
    }
    setSettlementError(null);
  };

  // Reset to search state
  const handleResetSearch = () => {
    setSearchQuery('');
    setSearchError(null);
    setSelectedRecord(null);
    setCalculation(null);
    setMatchedRecords([]);
    setCurrentStep('search');
    setSettlementError(null);
    setUpiConfirmed(false);
    setRefundConfirmed(false);
  };

  // Execute Settlement
  const handleConfirmExit = async () => {
    if (!selectedRecord || !calculation) return;

    // Safety checks
    if (calculation.balanceDue > 0 && paymentMethod === 'upi' && !upiConfirmed) {
      setSettlementError('Please confirm that the UPI payment has been received before proceeding.');
      return;
    }

    if (calculation.refundAmount > 0 && !refundConfirmed) {
      setSettlementError('Please confirm that the refund amount has been handed over in cash to the customer.');
      return;
    }

    const tenderedNum = parseFloat(cashTendered) || 0;
    if (calculation.balanceDue > 0 && paymentMethod === 'cash' && tenderedNum < calculation.balanceDue) {
      setSettlementError(`Cash tendered (${formatCurrency(tenderedNum)}) is less than balance due (${formatCurrency(calculation.balanceDue)}).`);
      return;
    }

    setIsSettling(true);
    setSettlementError(null);

    const guardUid = activeShift?.guardUid || currentUser?.uid || guardProfile?.uid || 'GUARD_TERMINAL';
    const guardName = activeShift?.guardName || guardProfile?.name || 'On-Duty Guard';
    const shift = activeShift?.shiftId || activeShift?.scheduleId || guardProfile?.currentShift || 'Shift 1';

    try {
      const updatedRecord = await settleVehicleExit({
        ticketId: selectedRecord.id || selectedRecord.ticketId || selectedRecord.ticketNumber,
        vehicleNumber: selectedRecord.vehicleNumber,
        vehicleType: selectedRecord.vehicleType,
        entryTime: selectedRecord.entryTime,
        exitTime: exitTime,
        grossCharge: calculation.grossCharge,
        advancePaid: selectedRecord.advanceAmount || 0,
        balanceDue: calculation.balanceDue,
        refundAmount: calculation.refundAmount,
        paymentMethod: calculation.balanceDue > 0 ? paymentMethod : (calculation.refundAmount > 0 ? 'cash' : 'cash'),
        exitGuardUid: guardUid,
        exitGuardName: guardName,
        exitGuardShift: shift,
        isMonthlyPass: selectedRecord.isMonthlyPass,
        monthlyPassId: selectedRecord.monthlyPassId,
        expectedLocationId: currentFacilityId,
      });

      setSettledRecord(updatedRecord);
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error('[GuardExitView] Settlement error:', err);
      if (err instanceof VehicleAlreadyExitedException) {
        setSettlementError('This vehicle was ALREADY EXITED by another terminal. Duplicate exit was prevented.');
      } else if (err instanceof CrossLocationSettlementException) {
        setSettlementError('Cross-location exit blocked: This ticket belongs to a different parking facility.');
      } else {
        setSettlementError(err?.message || 'Failed to complete exit settlement. Please try again.');
      }
    } finally {
      setIsSettling(false);
    }
  };

  // Calculations for UI
  const tenderedAmount = parseFloat(cashTendered) || 0;
  const changeDue = calculation ? Math.max(0, tenderedAmount - calculation.balanceDue) : 0;
  const isCashInsufficient = calculation && calculation.balanceDue > 0 && paymentMethod === 'cash' && tenderedAmount < calculation.balanceDue;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 1. Multiple Matches Selection Modal */}
      <MatchingVehiclesModal
        isOpen={isMatchingModalOpen}
        records={matchedRecords}
        searchQuery={searchQuery}
        onSelectRecord={(rec) => selectVehicleForExit(rec)}
        onClose={() => setIsMatchingModalOpen(false)}
      />

      {/* 2. Success Modal */}
      <ExitSuccessModal
        isOpen={showSuccessModal}
        record={settledRecord}
        onViewReceipt={() => {
          setShowSuccessModal(false);
          setShowReceiptModal(true);
        }}
        onExitAnother={() => {
          setShowSuccessModal(false);
          handleResetSearch();
        }}
        onReturnDashboard={() => {
          setShowSuccessModal(false);
          onReturnDashboard();
        }}
      />

      {/* 3. Digital 58mm Receipt Modal */}
      <ExitReceiptModal
        isOpen={showReceiptModal}
        record={settledRecord}
        onClose={() => {
          setShowReceiptModal(false);
          handleResetSearch();
        }}
      />

      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <span>Exit Settlement & Gate Out</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Phase 4E verified vehicle verification, live fee calculator & atomic exit settlement
          </p>
        </div>

        {currentStep !== 'search' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetSearch}
            className="flex items-center gap-1.5 text-xs text-slate-600 self-start"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Search Another</span>
          </Button>
        )}
      </div>

      {/* STEP 1: Search Form */}
      {currentStep === 'search' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Lookup Active Parking Ticket</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter vehicle registration plate (e.g. MH12AB1234 or suffix 1234) or scan ticket QR code
            </p>
          </div>

          {searchError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Lookup Failed</p>
                <p className="mt-0.5 text-red-700">{searchError}</p>
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleExecuteSearch();
            }}
            className="space-y-4"
          >
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchError(null);
                }}
                placeholder="Enter Ticket # or Vehicle Plate (e.g. MH12AB1234, 1234)..."
                className="w-full pl-11 pr-24 py-3.5 text-sm font-mono tracking-wide rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                autoFocus
              />
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />

              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="p-1.5 text-slate-500 hover:text-emerald-700"
                  title="Simulate Ticket QR Scan"
                  onClick={() => {
                    const sample = prompt('Scan / Enter Ticket Number (e.g. TKT-123456):');
                    if (sample && sample.trim()) {
                      setSearchQuery(sample.trim().toUpperCase());
                      handleExecuteSearch(sample.trim().toUpperCase());
                    }
                  }}
                >
                  <QrCode className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={isSearching || !searchQuery.trim()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-xs flex items-center justify-center gap-2"
            >
              {isSearching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Searching Active Records...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Verify Vehicle & Exit</span>
                </>
              )}
            </Button>
          </form>

          {/* Quick Guidance Box */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Safety Safeguards</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-slate-500">
              <li>Only searches currently ACTIVE parking sessions in the facility.</li>
              <li>Exited, cancelled, or missing records are safely rejected with descriptive errors.</li>
              <li>Supports vehicle suffix digits (e.g. "5656") or full normalized registration number.</li>
            </ul>
          </div>
        </div>
      )}

      {/* STEP 2: Vehicle Verification Preview */}
      {currentStep === 'verify' && selectedRecord && calculation && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Step 1 of 2: Vehicle Verification
              </span>
              <h2 className="text-lg font-black text-slate-900 mt-2">Confirm Vehicle Identity</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentStep('search')}
              className="text-xs text-slate-600 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </Button>
          </div>

          {/* Vehicle Plate Card */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xl">
                <Car className="w-7 h-7" />
              </div>
              <div>
                <div className="font-mono text-2xl font-black text-slate-900 tracking-wide">
                  {normalizeVehicleNumber(selectedRecord.vehicleNumber)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                    {formatVehicleType(selectedRecord.vehicleType)}
                  </span>
                  <span className="text-xs font-mono text-slate-500">#{selectedRecord.ticketNumber}</span>
                  {selectedRecord.isMonthlyPass && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      Monthly Pass Active
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Vehicle Photo if captured */}
            {(selectedRecord.vehiclePhotoUrl || (selectedRecord as any).photoUrl) && (
              <div className="relative group shrink-0">
                <img
                  src={selectedRecord.vehiclePhotoUrl || (selectedRecord as any).photoUrl}
                  alt="Vehicle at entry"
                  className="w-24 h-18 object-cover rounded-xl border border-slate-300 shadow-2xs"
                />
                <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5">
                  <ImageIcon className="w-2.5 h-2.5" />
                  <span>Entry</span>
                </span>
              </div>
            )}
          </div>

          {/* Session Overview Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <span className="text-[11px] font-semibold text-slate-500 block">Entry Time</span>
              <span className="text-xs font-medium text-slate-800 mt-1 block">
                {formatDateTime(selectedRecord.entryTime)}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Guard: {selectedRecord.entryGuardName}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <span className="text-[11px] font-semibold text-slate-500 block">Current Duration</span>
              <span className="text-xs font-bold text-emerald-700 mt-1 block">
                {formatLiveDuration(Math.max(0, exitTime.getTime() - selectedRecord.entryTime.getTime()))}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Billable: {calculation.billableHours} hr(s)
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <span className="text-[11px] font-semibold text-slate-500 block">Advance Deposit</span>
              <span className="text-xs font-bold text-slate-800 mt-1 block">
                {formatCurrency(selectedRecord.advanceAmount || 0)}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Mode: {(selectedRecord.advancePaymentMethod || 'cash').toUpperCase()}
              </span>
            </div>
          </div>

          {/* Proceed to Step 2 */}
          <div className="pt-2">
            <Button
              variant="primary"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-xs flex items-center justify-center gap-2"
              onClick={() => setCurrentStep('settle')}
            >
              <span>Proceed to Fee Settlement</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Fee Settlement & Gate Out */}
      {currentStep === 'settle' && selectedRecord && calculation && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Step 2 of 2: Fee Settlement & Gate Out
              </span>
              <h2 className="text-lg font-black text-slate-900 mt-2">Calculate Fee & Authorize Exit</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRecalculate}
                className="text-xs text-slate-700 flex items-center gap-1.5"
                title="Recalculate duration & fee to current second"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                <span>Recalculate</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep('verify')}
                className="text-xs text-slate-600 flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </Button>
            </div>
          </div>

          {settlementError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Settlement Blocked</p>
                <p className="mt-0.5 text-red-700">{settlementError}</p>
              </div>
            </div>
          )}

          {/* Itemized Calculation Summary Card */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-slate-900">
                  {normalizeVehicleNumber(selectedRecord.vehicleNumber)}
                </span>
                <span className="text-xs text-slate-500 font-mono">#{selectedRecord.ticketNumber}</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-700 block">
                  {formatLiveDuration(Math.max(0, exitTime.getTime() - selectedRecord.entryTime.getTime()))}
                </span>
                <span className="text-[10px] text-slate-400">
                  ({calculation.billableHours} billable hr{calculation.billableHours !== 1 ? 's' : ''})
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>Gross Parking Charge:</span>
                <span className="font-bold text-slate-800">{formatCurrency(calculation.grossCharge)}</span>
              </div>

              {selectedRecord.advanceAmount > 0 && (
                <div className="flex justify-between items-center text-emerald-700">
                  <span>Advance Payment Credit:</span>
                  <span className="font-bold">-{formatCurrency(selectedRecord.advanceAmount)}</span>
                </div>
              )}

              {selectedRecord.isMonthlyPass && (
                <div className="flex justify-between items-center text-blue-700 font-medium">
                  <span>Monthly Pass Exemption:</span>
                  <span>100% Waived (₹0)</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-black">
                {calculation.balanceDue > 0 ? (
                  <>
                    <span className="text-slate-900">Final Balance Due:</span>
                    <span className="text-emerald-700 text-lg font-mono">
                      {formatCurrency(calculation.balanceDue)}
                    </span>
                  </>
                ) : calculation.refundAmount > 0 ? (
                  <>
                    <span className="text-amber-800">Refund Due to Customer:</span>
                    <span className="text-amber-700 text-lg font-mono">
                      {formatCurrency(calculation.refundAmount)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-800">Final Balance Due:</span>
                    <span className="text-slate-600 text-base font-mono">₹0 (Fully Paid)</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* CASE A: Balance Due > 0 -> Select Payment Method */}
          {calculation.balanceDue > 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                  Payment Collection Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('cash');
                      setSettlementError(null);
                    }}
                    className={`p-3.5 rounded-xl border flex items-center justify-center gap-2.5 font-semibold text-xs transition-all ${
                      paymentMethod === 'cash'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Banknote className={`w-4 h-4 ${paymentMethod === 'cash' ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>Cash Payment</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('upi');
                      setSettlementError(null);
                    }}
                    className={`p-3.5 rounded-xl border flex items-center justify-center gap-2.5 font-semibold text-xs transition-all ${
                      paymentMethod === 'upi'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Smartphone className={`w-4 h-4 ${paymentMethod === 'upi' ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>UPI / QR Payment</span>
                  </button>
                </div>
              </div>

              {/* Cash Tender & Change Calculator */}
              {paymentMethod === 'cash' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-700">
                      Cash Tendered from Customer:
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">₹</span>
                      <input
                        type="number"
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        className="w-28 px-2.5 py-1.5 text-sm font-mono font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                      />
                    </div>
                  </div>

                  {/* Quick Cash Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-500">Quick:</span>
                    {[
                      Math.ceil(calculation.balanceDue),
                      50,
                      100,
                      200,
                      500
                    ].filter((val, idx, self) => val >= calculation.balanceDue && self.indexOf(val) === idx).map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setCashTendered(String(chip))}
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-100 font-mono font-semibold text-slate-700 transition-colors"
                      >
                        ₹{chip}
                      </button>
                    ))}
                  </div>

                  {/* Change Due Indicator */}
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs">
                    <span className="text-slate-600 font-medium">Change to Return:</span>
                    <span className={`font-mono font-bold text-sm ${isCashInsufficient ? 'text-red-600' : 'text-emerald-700'}`}>
                      {isCashInsufficient ? 'Insufficient Cash' : formatCurrency(changeDue)}
                    </span>
                  </div>
                </div>
              )}

              {/* UPI Receipt Confirmation Checkbox */}
              {paymentMethod === 'upi' && (
                <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200/80 space-y-2">
                  <p className="text-xs text-blue-900 font-medium">
                    Please present the facility UPI QR code to the customer for {formatCurrency(calculation.balanceDue)}.
                  </p>
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-800 pt-1">
                    <input
                      type="checkbox"
                      checked={upiConfirmed}
                      onChange={(e) => setUpiConfirmed(e.target.checked)}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-semibold">
                      I confirm that UPI payment of {formatCurrency(calculation.balanceDue)} has been credited to facility bank / soundbox.
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* CASE B: Refund Due > 0 -> Refund Confirmation */}
          {calculation.refundAmount > 0 && (
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 space-y-2">
              <div className="text-xs font-bold text-amber-900">
                Customer Overpaid Advance by {formatCurrency(calculation.refundAmount)}
              </div>
              <p className="text-xs text-amber-800">
                Advance paid was {formatCurrency(selectedRecord.advanceAmount)}, but gross stay charge was only {formatCurrency(calculation.grossCharge)}.
              </p>
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-amber-950 pt-1">
                <input
                  type="checkbox"
                  checked={refundConfirmed}
                  onChange={(e) => setRefundConfirmed(e.target.checked)}
                  className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                />
                <span className="font-bold">
                  I confirm that cash refund of {formatCurrency(calculation.refundAmount)} has been handed back to the driver.
                </span>
              </label>
            </div>
          )}

          {/* Confirm Button */}
          <div className="pt-2">
            <Button
              variant="primary"
              disabled={
                isSettling ||
                (calculation.balanceDue > 0 && paymentMethod === 'cash' && isCashInsufficient) ||
                (calculation.balanceDue > 0 && paymentMethod === 'upi' && !upiConfirmed) ||
                (calculation.refundAmount > 0 && !refundConfirmed)
              }
              onClick={handleConfirmExit}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm shadow-sm flex items-center justify-center gap-2"
            >
              {isSettling ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Executing Atomic Settlement & Gate Out...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    {calculation.balanceDue > 0
                      ? `Collect ${formatCurrency(calculation.balanceDue)} & Open Gate`
                      : calculation.refundAmount > 0
                      ? `Refund ${formatCurrency(calculation.refundAmount)} & Open Gate`
                      : 'Confirm Exit & Open Gate'}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
