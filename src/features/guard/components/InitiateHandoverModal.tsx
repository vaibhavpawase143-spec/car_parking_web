import React, { useState, useEffect } from 'react';
import {
  X,
  Wallet,
  User,
  Banknote,
  QrCode,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { GuardProfile, ShiftModel } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { getActiveGuardsList, initiateHandover } from '../../../services/guardService';

interface InitiateHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGuard: GuardProfile;
  activeShift: ShiftModel | null;
  type: 'CASH' | 'UPI';
  amount: number;
  onSuccess?: () => void;
}

export const InitiateHandoverModal: React.FC<InitiateHandoverModalProps> = ({
  isOpen,
  onClose,
  currentGuard,
  activeShift,
  type,
  amount,
  onSuccess,
}) => {
  const [receivingGuards, setReceivingGuards] = useState<GuardProfile[]>([]);
  const [selectedGuardUid, setSelectedGuardUid] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isLoadingGuards, setIsLoadingGuards] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isCash = type === 'CASH';

  // Load available active guards when modal opens
  useEffect(() => {
    if (!isOpen) {
      setNotes('');
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    setIsLoadingGuards(true);
    setErrorMessage(null);

    getActiveGuardsList(currentGuard.uid)
      .then((guards) => {
        if (!isMounted) return;
        setReceivingGuards(guards);
        if (guards.length > 0) {
          setSelectedGuardUid(guards[0].uid);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('[InitiateHandoverModal] Failed to load guards:', err);
        setErrorMessage('Failed to load guard list. Please try again.');
      })
      .finally(() => {
        if (isMounted) setIsLoadingGuards(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentGuard.uid]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!selectedGuardUid) {
      setErrorMessage('Please select a relieving guard to receive the handover.');
      return;
    }

    const selectedGuard = receivingGuards.find((g) => g.uid === selectedGuardUid);
    if (!selectedGuard) {
      setErrorMessage('Selected guard could not be verified.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const shiftId = activeShift?.shiftId || currentGuard.currentShift || `shift_${Date.now()}`;

      await initiateHandover({
        fromGuardId: currentGuard.uid,
        fromGuardName: currentGuard.name,
        fromGuardEmail: currentGuard.email,
        toGuardId: selectedGuard.uid,
        toGuardName: selectedGuard.name,
        toGuardEmail: selectedGuard.email,
        shiftId,
        type,
        amount,
        notes: notes.trim() || undefined,
      });

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      console.error('[InitiateHandoverModal] Handover initiation failed:', err);
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
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isCash ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-100 text-brand-700'
              }`}
            >
              {isCash ? <Banknote className="w-5 h-5" /> : <QrCode className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Handover {type} Responsibility
              </h3>
              <p className="text-xs text-slate-500">
                Transfer financial responsibility to the next shift guard
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Amount Badge matching Flutter Partial-Handovers-Not-Permitted */}
          <div
            className={`p-4 rounded-2xl border ${
              isCash
                ? 'bg-emerald-50/70 border-emerald-200/80'
                : 'bg-brand-50/70 border-brand-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-500 tracking-wide uppercase">
                  Full {type} Outstanding Float
                </span>
                <div
                  className={`text-3xl font-extrabold font-mono mt-0.5 ${
                    isCash ? 'text-emerald-700' : 'text-brand-700'
                  }`}
                >
                  {formatCurrency(amount)}
                </div>
              </div>
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  isCash ? 'bg-emerald-100 text-emerald-800' : 'bg-brand-100 text-brand-800'
                }`}
              >
                <Wallet className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Info className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <span>Partial handovers are not permitted by system financial audit policy.</span>
            </div>
          </div>

          {/* Receiving Guard Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Select Relieving / Receiving Guard *
            </label>
            {isLoadingGuards ? (
              <div className="flex items-center gap-2 py-3 px-4 border border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                <span>Loading active guard roster...</span>
              </div>
            ) : receivingGuards.length === 0 ? (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  No other active guards found
                </p>
                <p className="text-[11px] leading-relaxed">
                  There are no other active guards currently registered in the system to receive this
                  handover. Contact Admin to register or activate the relieving guard.
                </p>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedGuardUid}
                  onChange={(e) => setSelectedGuardUid(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow appearance-none cursor-pointer"
                >
                  {receivingGuards.map((g) => (
                    <option key={g.uid} value={g.uid}>
                      {g.name} ({g.email || g.uid})
                    </option>
                  ))}
                </select>
                <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Handover Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Relieved for night shift rotation, float counter reconciled"
              rows={2}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submission Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || receivingGuards.length === 0 || amount <= 0}
              className={`flex-1 py-2.5 px-4 rounded-xl text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isCash ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-brand-600 hover:bg-brand-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Transfer...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Initiate Handover ({formatCurrency(amount)})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
