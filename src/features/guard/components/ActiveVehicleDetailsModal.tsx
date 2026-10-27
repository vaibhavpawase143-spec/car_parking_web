import React from 'react';
import { LogOut, X, Clock, Shield, Calendar, User, Phone, CreditCard, Sparkles } from 'lucide-react';
import { ParkingRecord } from '../../../types';
import { formatCurrency, formatDateTime, formatLiveDuration, formatVehicleType, normalizeVehicleNumber } from '../../../utils/formatters';
import { calculateParkingFee } from '../../../utils/feeCalculator';
import { generateQrSvg } from '../../../utils/qrGenerator';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';

interface ActiveVehicleDetailsModalProps {
  isOpen: boolean;
  record: ParkingRecord | null;
  currentTime: Date;
  onClose: () => void;
  onProceedToExit: (ticketNumber: string) => void;
}

export const ActiveVehicleDetailsModal: React.FC<ActiveVehicleDetailsModalProps> = ({
  isOpen,
  record,
  currentTime,
  onClose,
  onProceedToExit,
}) => {
  if (!isOpen || !record) return null;

  const qrSvg = generateQrSvg(record.ticketNumber, 140);
  const normalizedPlate = normalizeVehicleNumber(record.vehicleNumber);
  const stayMs = Math.max(0, currentTime.getTime() - record.entryTime.getTime());
  const feeResult = calculateParkingFee({
    vehicleType: record.vehicleType,
    entryTime: record.entryTime,
    exitTime: currentTime,
    advancePaid: record.advanceAmount,
    isMonthlyPass: record.isMonthlyPass,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-base text-slate-900">{normalizedPlate}</span>
            <Badge variant="success">Parked</Badge>
            {record.isMonthlyPass && (
              <Badge variant="neutral" className="bg-purple-100 text-purple-800 border-purple-200">
                Monthly Pass
              </Badge>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Photo Preview (if available) */}
          {record.vehiclePhotoUrl ? (
            <div className="relative rounded-xl overflow-hidden aspect-16/9 bg-slate-900 border border-slate-200">
              <img
                src={record.vehiclePhotoUrl}
                alt={normalizedPlate}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-slate-400 text-xs">
              Vehicle photo unavailable
            </div>
          )}

          {/* Core Info Breakdown */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-400" /> Ticket Number:
              </span>
              <span className="font-mono font-bold text-slate-900">{record.ticketNumber}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Category:</span>
              <span className="font-bold text-slate-800">{formatVehicleType(record.vehicleType)}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Entry Time:
              </span>
              <span className="text-slate-800 font-medium">{formatDateTime(record.entryTime)}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600" /> Stay Duration:
              </span>
              <span className="font-mono font-bold text-emerald-700">
                {formatLiveDuration(stayMs)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" /> Entry Guard / Shift:
              </span>
              <span className="text-slate-700">{record.entryGuardName} ({record.entryShift})</span>
            </div>

            {record.customerMobile && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> Customer Mobile:
                </span>
                <span className="font-mono text-slate-800">{record.customerMobile}</span>
              </div>
            )}
          </div>

          {/* Fee & Advance Settlement Breakdown */}
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-2 text-xs">
            <div className="flex justify-between items-center font-semibold text-slate-900">
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-emerald-600" /> Estimated Current Fee:
              </span>
              <span className="text-sm font-bold text-emerald-800">
                {record.isMonthlyPass ? '₹0 (Pass Covered)' : formatCurrency(feeResult.grossCharge)}
              </span>
            </div>

            {record.advanceAmount > 0 && (
              <>
                <div className="flex justify-between items-center text-slate-700 pt-1 border-t border-emerald-200/60">
                  <span>Advance Deposited:</span>
                  <span className="font-medium text-emerald-700">
                    {formatCurrency(record.advanceAmount)} ({(record.advancePaymentMethod || 'cash').toUpperCase()})
                  </span>
                </div>
                <div className="flex justify-between items-center font-bold pt-1 border-t border-emerald-200/60">
                  <span>{feeResult.balanceDue > 0 ? 'Estimated Balance Due:' : 'Estimated Refund Due:'}</span>
                  <span className={feeResult.balanceDue > 0 ? 'text-rose-600' : 'text-emerald-700'}>
                    {formatCurrency(feeResult.balanceDue > 0 ? feeResult.balanceDue : feeResult.refundAmount)}
                  </span>
                </div>
              </>
            )}

            {record.isMonthlyPass && (
              <div className="flex items-center gap-1.5 text-purple-700 text-[11px] font-medium pt-1">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Monthly Pass verified. Zero fee accrued during pass validity.</span>
              </div>
            )}
          </div>

          {/* Vector QR Code */}
          <div className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-xl">
            <div
              className="p-1.5 bg-white rounded-md shadow-xs"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <span className="text-[10px] font-mono text-slate-400 mt-1">
              Ticket QR: {record.ticketNumber}
            </span>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs text-slate-600 hover:text-slate-900"
          >
            Close
          </Button>

          {/* Pure navigation shortcut - no database mutation */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onClose();
              onProceedToExit(record.ticketNumber);
            }}
            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
          >
            <LogOut className="w-3.5 h-3.5" />
            Proceed to Gate Out (Exit)
          </Button>
        </div>
      </div>
    </div>
  );
};
