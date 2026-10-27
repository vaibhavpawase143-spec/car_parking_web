import React, { useEffect, useState } from 'react';
import {
  Wallet,
  AlertTriangle,
  Clock,
  User,
  Banknote,
  QrCode,
  ShieldAlert,
  LogOut,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { HandoverModel } from '../../../types';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';
import { Badge } from '../../../components/common/Badge';
import { useAuth } from '../../auth/AuthContext';
import {
  respondToHandover,
  getAuthoritativeHandover,
} from '../../../services/guardService';

interface MandatoryHandoverBarrierProps {
  pendingHandovers: HandoverModel[];
  subscriptionError: Error | null;
  onRetrySubscription?: () => void;
}

export const MandatoryHandoverBarrier: React.FC<MandatoryHandoverBarrierProps> = ({
  pendingHandovers,
  subscriptionError,
  onRetrySubscription,
}) => {
  const { guardProfile, signOut } = useAuth();
  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Strict modal barrier safeguard: Block Escape key from dismissing or bubbling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, []);

  // 1. Subscription / Permission Error State
  // NEVER silently treat a failed subscription as proof that no handover exists.
  if (subscriptionError) {
    return (
      <div
        className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto select-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="handover-error-title"
      >
        <div
          className="bg-white rounded-2xl border-2 border-red-500 shadow-2xl max-w-lg w-full p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-100 text-red-600 mx-auto mb-4 border border-red-200">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <h2
            id="handover-error-title"
            className="text-xl font-bold text-center text-slate-900 tracking-tight"
          >
            Handover Verification Barrier
          </h2>

          <div className="my-4 p-4 bg-red-50 border border-red-200 rounded-xl text-left">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-800 space-y-1">
                <p className="font-semibold">Security Integrity Check Failed</p>
                <p className="leading-relaxed">
                  The terminal could not verify incoming financial handover records from the database.
                  Access to gate counters and parking operations is strictly blocked until verified.
                </p>
                <p className="font-mono text-[11px] text-red-900 mt-2 bg-red-100/60 p-2 rounded">
                  {subscriptionError.message}
                </p>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-slate-500 mb-6">
            Please retry verification or sign out of the terminal.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            {onRetrySubscription && (
              <button
                type="button"
                onClick={onRetrySubscription}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white font-semibold text-xs hover:bg-brand-700 shadow-sm transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Verification
              </button>
            )}
            <button
              type="button"
              onClick={() => signOut()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-medium text-xs hover:bg-slate-50 hover:text-red-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out Securely
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If no pending handovers and no error, barrier does not render
  if (!pendingHandovers || pendingHandovers.length === 0) {
    return null;
  }

  // Handle multiple pending handovers safely, one at a time (Flutter: pendingHandovers.first)
  const currentHandover = pendingHandovers[0];
  const isCash = currentHandover.type === 'CASH';
  const totalPending = pendingHandovers.length;

  const handleAccept = async () => {
    if (isAccepting || isRejecting) return;
    setIsAccepting(true);
    setActionError(null);

    const guardUid = guardProfile?.uid || '';
    const guardName = guardProfile?.name || 'Gate Attendant';

    try {
      await respondToHandover({
        handoverId: currentHandover.handoverId,
        accept: true,
        guardUid,
        guardName,
      });
      // On success, real-time Firestore stream automatically clears pendingHandovers
    } catch (err: unknown) {
      console.error('[MandatoryHandoverBarrier] Error accepting handover:', err);

      // Timeout / network fallback check: re-read authoritative doc
      let isActuallyAccepted = false;
      try {
        const authoritative = await getAuthoritativeHandover(currentHandover.handoverId);
        if (authoritative && authoritative.status === 'ACCEPTED') {
          isActuallyAccepted = true;
        }
      } catch (checkErr) {
        console.warn('[MandatoryHandoverBarrier] Authoritative fallback check error:', checkErr);
      }

      if (!isActuallyAccepted) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setActionError(errMsg.replace(/^Exception:s*/i, ''));
      }
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    if (isAccepting || isRejecting) return;
    const confirmed = window.confirm(
      `Are you sure you want to REJECT this ${currentHandover.type} handover of ${formatCurrency(
        currentHandover.amount
      )} from ${currentHandover.fromGuardName}?`
    );
    if (!confirmed) return;

    setIsRejecting(true);
    setActionError(null);

    const guardUid = guardProfile?.uid || '';
    const guardName = guardProfile?.name || 'Gate Attendant';

    try {
      await respondToHandover({
        handoverId: currentHandover.handoverId,
        accept: false,
        guardUid,
        guardName,
      });
    } catch (err: unknown) {
      console.error('[MandatoryHandoverBarrier] Error rejecting handover:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setActionError(errMsg.replace(/^Exception:s*/i, ''));
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto select-none"
      onClick={(e) => e.stopPropagation()}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mandatory-handover-title"
      key="mandatory_handover_barrier"
    >
      <div
        className="bg-white rounded-3xl border border-brand-200 shadow-2xl max-w-lg w-full p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Icon matching Flutter MandatoryHandoverPopup */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 border border-emerald-100 shadow-inner">
            <Wallet className="w-8 h-8" />
          </div>

          <div className="flex items-center gap-2 mb-1">
            <h2
              id="mandatory-handover-title"
              className="text-2xl font-bold text-slate-900 tracking-tight"
            >
              Handover Received
            </h2>
            <Badge variant="warning">
              <Clock className="w-3 h-3 mr-1" />
              PENDING
            </Badge>
          </div>

          <p className="text-xs text-slate-500 max-w-sm">
            A previous shift guard has transferred financial responsibility to your terminal.
          </p>

          {totalPending > 1 && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
              <span>Transfer Queue: 1 of {totalPending} pending transfers</span>
            </div>
          )}
        </div>

        {/* Handover Details Card */}
        <div className="my-6 p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3.5 text-xs text-slate-700">
          {/* Outgoing Guard */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
            <span className="flex items-center gap-2 text-slate-500 font-medium">
              <User className="w-4 h-4 text-slate-400" />
              From Guard
            </span>
            <div className="text-right">
              <span className="font-semibold text-slate-900 text-sm">
                {currentHandover.fromGuardName}
              </span>
              {currentHandover.fromGuardEmail && (
                <div className="text-[10px] text-slate-400 font-mono">
                  {currentHandover.fromGuardEmail}
                </div>
              )}
            </div>
          </div>

          {/* Payment Method / Type */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
            <span className="flex items-center gap-2 text-slate-500 font-medium">
              {isCash ? (
                <Banknote className="w-4 h-4 text-emerald-600" />
              ) : (
                <QrCode className="w-4 h-4 text-brand-600" />
              )}
              Payment Method
            </span>
            <Badge variant={isCash ? 'success' : 'primary'} className="font-semibold">
              {currentHandover.type}
            </Badge>
          </div>

          {/* Handover Amount */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
            <span className="flex items-center gap-2 text-slate-500 font-medium">
              <Wallet className="w-4 h-4 text-slate-400" />
              Transfer Amount
            </span>
            <span className="text-2xl font-bold font-mono text-emerald-700">
              {formatCurrency(currentHandover.amount)}
            </span>
          </div>

          {/* Timestamp */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-slate-500 font-medium">
              <Clock className="w-4 h-4 text-slate-400" />
              Initiated At
            </span>
            <span className="text-slate-600 font-mono text-[11px]">
              {formatDateTime(currentHandover.createdAt)}
            </span>
          </div>

          {currentHandover.shiftId && (
            <div className="pt-2 text-[10px] text-slate-400 flex justify-between border-t border-slate-200/40">
              <span>Shift ID:</span>
              <span className="font-mono text-slate-600">{currentHandover.shiftId}</span>
            </div>
          )}

          {currentHandover.notes && (
            <div className="pt-2 text-[11px] text-slate-600 border-t border-slate-200/40">
              <span className="font-semibold text-slate-700">Notes: </span>
              <span>{currentHandover.notes}</span>
            </div>
          )}
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-left flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900 leading-relaxed font-medium">
              {actionError}
            </div>
          </div>
        )}

        {/* Prompt Instruction */}
        <p className="text-center text-xs font-medium text-slate-500 mb-4">
          All portal tabs and gate workflows are blocked until this handover is accepted.
        </p>

        {/* Action Buttons Boundary matching Flutter MandatoryHandoverPopup */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleAccept}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAccepting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Validating & Accepting...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Accept Handover ({formatCurrency(currentHandover.amount)})</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleReject}
            className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-700 font-medium text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRejecting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Rejecting...</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" />
                <span>Reject / Dispute Handover</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => signOut()}
            className="w-full mt-2 inline-flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-red-700 transition-colors py-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Wrong staff account? Sign out of terminal</span>
          </button>
        </div>
      </div>
    </div>
  );
};
