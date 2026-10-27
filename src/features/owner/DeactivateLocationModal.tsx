import React, { useState } from 'react';
import { X, AlertTriangle, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react';
import { ParkingLocationDoc } from '../../types';
import { Button } from '../../components/common/Button';
import { deactivateLocationPrototype } from '../../services/locationAdminService';
import { LocationAdminCallableService } from '../../services/locationAdminCallableService';

interface DeactivateLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: ParkingLocationDoc | null;
  onSuccess?: (locationId: string) => void;
}

export const DeactivateLocationModal: React.FC<DeactivateLocationModalProps> = ({
  isOpen,
  onClose,
  location,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  if (!isOpen || !location) return null;

  const handleDeactivate = async () => {
    setIsSubmitting(true);
    setFeedback(null);

    try {
      let res;
      if (LocationAdminCallableService.isEmulatorActive()) {
        res = await LocationAdminCallableService.deactivateLocation(location);
      } else {
        res = await deactivateLocationPrototype(location);
      }

      if (res.success) {
        setFeedback({ message: res.message, isError: false });
        setTimeout(() => {
          if (onSuccess) onSuccess(location.id);
          onClose();
        }, 1200);
      } else {
        setFeedback({ message: res.message, isError: true });
      }
    } catch (err: any) {
      setFeedback({ message: err?.message || 'Failed to deactivate location.', isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/50">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <h3 className="text-base font-bold text-slate-900">Deactivate Facility</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 leading-relaxed">
            <strong className="block font-bold mb-1">Hard Deletion Is Prohibited</strong>
            Parking locations cannot be deleted because historical parking tickets, cash ledgers, and staff handover records permanently reference this facility ID.
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Are you sure you want to deactivate <strong className="text-slate-900">{location.name} ({location.code})</strong>?
          </p>

          <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1 border border-slate-200">
            <div className="flex justify-between">
              <span className="text-slate-500">Facility Code:</span>
              <span className="font-mono font-bold text-slate-800">{location.code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Counter Landmark:</span>
              <span className="font-medium text-slate-800">{location.locationName || location.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Action:</span>
              <span className="font-semibold text-red-700">Set isActive to false</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex items-start gap-1.5 bg-slate-100 p-2.5 rounded-lg">
            <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>
              <strong>Operational Effect:</strong> Guards will be prevented from generating new vehicle entry slips at this site. Historical reports remain accessible.
            </span>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                feedback.isError
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {feedback.isError ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>{feedback.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDeactivate}
            disabled={isSubmitting}
            className="!bg-rose-600 hover:!bg-rose-700 !text-white"
            icon={isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
          >
            {isSubmitting ? 'Deactivating...' : 'Confirm Deactivation'}
          </Button>
        </div>
      </div>
    </div>
  );
};
