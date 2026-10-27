import React, { useState } from 'react';
import {
  X,
  RotateCw,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { GuardProfile, ShiftModel } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { recordKeepWithMe } from '../../../services/guardService';

interface KeepWithMeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGuard: GuardProfile;
  activeShift: ShiftModel | null;
  type: 'CASH' | 'UPI';
  amount: number;
  onSuccess?: () => void;
}

export const KeepWithMeConfirmModal: React.FC<KeepWithMeConfirmModalProps> = ({
  isOpen,
  onClose,
  currentGuard,
  activeShift,
  type,
  amount,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const shiftId = activeShift?.shiftId || currentGuard.currentShift || `shift_${Date.now()}`;

      await recordKeepWithMe({
        guardId: currentGuard.uid,
        guardName: currentGuard.name,
        shiftId,
        type,
        amount,
      });

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      console.error('[KeepWithMeConfirmModal] Failed to record Keep With Me:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg.replace(/^Exception:s*/i, ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <RotateCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Keep Float With Me
              </h3>
              <p className="text-xs text-slate-500">Carry forward float across shift rotations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="my-5 space-y-4">
          <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80 text-center">
            <span className="text-[11px] font-bold text-purple-900 uppercase tracking-wide">
              {type} Float Retained
            </span>
            <div className="text-3xl font-extrabold font-mono text-purple-800 mt-1">
              {formatCurrency(amount)}
            </div>
            <p className="text-xs text-purple-700 mt-1">
              Guard: <strong className="font-semibold">{currentGuard.name}</strong>
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-800 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-purple-600" />
              What does "Keep With Me" do?
            </p>
            <p className="leading-relaxed text-[11px]">
              Retaining the float records a <strong>Carried Forward</strong> audit event. Your
              financial responsibility remains attached to your guard profile into your next shift,
              allowing continuous operation without intermediate handover settlement.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || amount <= 0}
            className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Recording...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Retention</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
