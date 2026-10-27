import React from 'react';
import { CheckCircle2, QrCode, RotateCcw, Car } from 'lucide-react';
import { ParkingRecord } from '../../../types';
import { formatCurrency, formatDateTime, formatVehicleType, normalizeVehicleNumber } from '../../../utils/formatters';
import { Button } from '../../../components/common/Button';

interface EntrySuccessModalProps {
  isOpen: boolean;
  record: ParkingRecord | null;
  onViewSlip: () => void;
  onNewEntry: () => void;
  onReturnDashboard: () => void;
  onViewActiveParking: () => void;
}

export const EntrySuccessModal: React.FC<EntrySuccessModalProps> = ({
  isOpen,
  record,
  onViewSlip,
  onNewEntry,
  onReturnDashboard,
  onViewActiveParking,
}) => {
  if (!isOpen || !record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Entry Confirmed</h2>
            <p className="text-xs text-slate-500 mt-0.5">Parking record committed to live database</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Ticket Number:</span>
              <span className="font-mono font-bold text-base text-emerald-700">{record.ticketNumber}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Vehicle Number:</span>
              <span className="font-mono font-bold text-slate-900">
                {normalizeVehicleNumber(record.vehicleNumber)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Category:</span>
              <span className="font-medium text-slate-800">{formatVehicleType(record.vehicleType)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Entry Time:</span>
              <span className="text-slate-700">{formatDateTime(record.entryTime)}</span>
            </div>
            {record.customerMobile && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Mobile:</span>
                <span className="font-mono text-slate-700">{record.customerMobile}</span>
              </div>
            )}
            {record.advanceAmount > 0 && (
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-emerald-800">
                <span>Advance Paid:</span>
                <span>{formatCurrency(record.advanceAmount)} ({(record.advancePaymentMethod || 'cash').toUpperCase()})</span>
              </div>
            )}
            {record.isMonthlyPass && (
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-purple-700">
                <span>Monthly Pass:</span>
                <span>ACTIVE PASS (No Advance)</span>
              </div>
            )}
          </div>

          {record.vehiclePhotoUrl && (
            <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-200">
              <img
                src={record.vehiclePhotoUrl}
                alt="Plate"
                className="w-12 h-10 object-cover rounded-sm border border-slate-200"
              />
              <span className="text-[11px] text-slate-600 font-medium">Photo securely synced to Cloudinary</span>
            </div>
          )}

          {/* Primary Action */}
          <Button
            variant="primary"
            onClick={onViewSlip}
            className="w-full gap-2 justify-center py-2.5 bg-emerald-600 hover:bg-emerald-700 font-bold text-sm"
          >
            <QrCode className="w-4 h-4" />
            View Entry Slip & QR
          </Button>

          {/* Auxiliary Navigation Actions */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={onNewEntry}
              className="gap-1.5 text-xs justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              New Entry
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onViewActiveParking}
              className="gap-1.5 text-xs justify-center"
            >
              <Car className="w-3.5 h-3.5" />
              Active Slots
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onReturnDashboard}
            className="w-full text-xs text-slate-500 hover:text-slate-800"
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};
