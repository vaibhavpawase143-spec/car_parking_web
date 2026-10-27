import React from 'react';
import { Car, X, ChevronRight, Clock } from 'lucide-react';
import { ParkingRecord } from '../../../types';
import { formatCurrency, formatDateTime, formatVehicleType, normalizeVehicleNumber } from '../../../utils/formatters';
import { Button } from '../../../components/common/Button';

interface MatchingVehiclesModalProps {
  isOpen: boolean;
  records: ParkingRecord[];
  searchQuery: string;
  onSelectRecord: (record: ParkingRecord) => void;
  onClose: () => void;
}

export const MatchingVehiclesModal: React.FC<MatchingVehiclesModalProps> = ({
  isOpen,
  records,
  searchQuery,
  onSelectRecord,
  onClose,
}) => {
  if (!isOpen || records.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Multiple Active Vehicles Found</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Query "{searchQuery}" matches {records.length} vehicles currently parked. Select the vehicle to exit.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2.5">
          {records.map((record) => {
            const normalizedPlate = normalizeVehicleNumber(record.vehicleNumber);
            return (
              <div
                key={record.id}
                onClick={() => onSelectRecord(record)}
                className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-500 bg-white hover:bg-emerald-50/30 transition-all cursor-pointer flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-emerald-100 text-slate-600 group-hover:text-emerald-700 flex items-center justify-center transition-colors">
                    <Car className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-slate-900 group-hover:text-emerald-800">
                        {normalizedPlate}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {formatVehicleType(record.vehicleType)}
                      </span>
                      {record.isMonthlyPass && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                          Pass
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="font-mono">#{record.ticketNumber}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatDateTime(record.entryTime)}
                      </span>
                      {record.advanceAmount > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-700 font-medium">Adv: {formatCurrency(record.advanceAmount)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-1.5 px-3 flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRecord(record);
                    }}
                  >
                    <span>Select</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};
