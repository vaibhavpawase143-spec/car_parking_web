import React from 'react';
import { CheckCircle2, Receipt, RotateCcw, LayoutDashboard, ArrowRightCircle } from 'lucide-react';
import { ParkingRecord } from '../../../types';
import { formatCurrency, formatVehicleType, normalizeVehicleNumber } from '../../../utils/formatters';
import { Button } from '../../../components/common/Button';

interface ExitSuccessModalProps {
  isOpen: boolean;
  record: ParkingRecord | null;
  onViewReceipt: () => void;
  onExitAnother: () => void;
  onReturnDashboard: () => void;
}

export const ExitSuccessModal: React.FC<ExitSuccessModalProps> = ({
  isOpen,
  record,
  onViewReceipt,
  onExitAnother,
  onReturnDashboard,
}) => {
  if (!isOpen || !record) return null;

  const normalizedPlate = normalizeVehicleNumber(record.vehicleNumber);
  const hasRefund = (record.refundAmount || 0) > 0;
  const hasBalance = (record.balanceDue || 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm ring-8 ring-emerald-50">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Settlement Complete</h2>
            <p className="text-xs text-slate-500 mt-0.5">Parking record marked EXITED & slot released</p>
          </div>

          {/* Vehicle & Ticket Header */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
            <div className="font-mono text-2xl font-black text-slate-900 tracking-wide">
              {normalizedPlate}
            </div>
            <div className="flex items-center justify-center gap-2 mt-1 text-xs text-slate-600">
              <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                {formatVehicleType(record.vehicleType)}
              </span>
              <span>•</span>
              <span className="font-mono">#{record.ticketNumber}</span>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-left space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-600">
              <span>Gross Parking Charge:</span>
              <span className="font-semibold text-slate-800">{formatCurrency(record.grossCharge || 0)}</span>
            </div>
            {record.advanceAmount > 0 && (
              <div className="flex justify-between items-center text-emerald-700">
                <span>Advance Credit:</span>
                <span className="font-semibold">-{formatCurrency(record.advanceAmount)}</span>
              </div>
            )}
            {hasBalance && (
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-sm text-slate-900">
                <span>Final Balance Paid:</span>
                <span className="text-emerald-700 font-mono">
                  {formatCurrency(record.balanceDue || 0)} ({(record.paymentMethod || 'cash').toUpperCase()})
                </span>
              </div>
            )}
            {hasRefund && (
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-sm text-amber-700">
                <span>Refund Handed Back:</span>
                <span className="font-mono">
                  {formatCurrency(record.refundAmount || 0)} ({(record.paymentMethod || 'cash').toUpperCase()})
                </span>
              </div>
            )}
            {!hasBalance && !hasRefund && (
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-sm text-slate-900">
                <span>Final Settlement:</span>
                <span className="text-slate-700 font-mono">₹0 (Fully Settled)</span>
              </div>
            )}
            {record.isMonthlyPass && (
              <div className="text-[11px] text-blue-700 bg-blue-50 p-2 rounded-lg border border-blue-200/60 mt-1 font-medium">
                Active Monthly Pass — No fee charged
              </div>
            )}
          </div>

          {/* Gate Out Status Banner */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-center gap-2 text-emerald-800 text-xs font-bold tracking-wide">
            <ArrowRightCircle className="w-4 h-4 text-emerald-600" />
            <span>GATE OPEN — EXIT AUTHORIZED</span>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <Button
              variant="primary"
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm"
              onClick={onViewReceipt}
            >
              <Receipt className="w-4 h-4" />
              <span>View & Print Exit Receipt</span>
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold"
                onClick={onExitAnother}
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Exit Another</span>
              </Button>

              <Button
                variant="outline"
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold"
                onClick={onReturnDashboard}
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-slate-500" />
                <span>Dashboard</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
