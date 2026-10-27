import React, { useState, useEffect } from 'react';
import {
  Clock,
  Wallet,
  RotateCw,
  LogIn,
  LogOut,
  Calendar,
  User,
  Banknote,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  History,
  TrendingUp,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import {
  ShiftModel,
  ShiftStats,
  GuardFinancialResponsibility,
  HandoverModel,
  ResponsibilityEventModel,
  WithdrawalRecord,
  DashboardMetrics,
} from '../../../types';
import { useAuth } from '../../auth/AuthContext';
import { formatCurrency, formatDate, formatTime, formatDateTime } from '../../../utils/formatters';
import {
  subscribeGuardShifts,
  subscribeShiftStats,
  subscribeGuardHandovers,
  subscribeResponsibilityEvents,
  subscribeGuardWithdrawals,
  subscribeToGuardFinancialResponsibility,
  subscribeToGuardTodayMetrics,
  respondToHandover,
  cancelHandover,
} from '../../../services/guardService';
import { InitiateHandoverModal } from '../components/InitiateHandoverModal';
import { KeepWithMeConfirmModal } from '../components/KeepWithMeConfirmModal';

interface MyShiftViewProps {
  activeShift: ShiftModel | null;
}

export const MyShiftView: React.FC<MyShiftViewProps> = ({ activeShift }) => {
  const { currentUser, guardProfile } = useAuth();
  const guardUid = currentUser?.uid || guardProfile?.uid || '';
  const guardName = guardProfile?.name || 'Gate Attendant';
  const guardEmail = guardProfile?.email || currentUser?.email || '';

  // All Guard Shifts
  const [shifts, setShifts] = useState<ShiftModel[]>([]);

  // Shift Operational Stats for Active Shift
  const [shiftStats, setShiftStats] = useState<ShiftStats>({
    entriesCount: 0,
    exitsCount: 0,
    totalCollection: 0,
    cashCollection: 0,
    upiCollection: 0,
  });

  // Full-Day Performance Metrics (for clean separation from Shift Window)
  const [dailyMetrics, setDailyMetrics] = useState<DashboardMetrics | null>(null);

  // Live Financial Responsibility
  const [responsibility, setResponsibility] = useState<GuardFinancialResponsibility>({
    guardUid,
    guardName,
    totalCashCollected: 0,
    cashHandedOver: 0,
    cashReceived: 0,
    cashWithdrawn: 0,
    outstandingCash: 0,
    totalUpiCollected: 0,
    upiHandedOver: 0,
    upiReceived: 0,
    upiWithdrawn: 0,
    outstandingUpi: 0,
    totalOutstanding: 0,
  });

  // Handovers & Activity Ledger
  const [handovers, setHandovers] = useState<HandoverModel[]>([]);
  const [responsibilityEvents, setResponsibilityEvents] = useState<ResponsibilityEventModel[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);

  // Ledger Filter Tab
  type LedgerFilter = 'ALL' | 'PENDING_IN' | 'PENDING_OUT' | 'COMPLETED' | 'EVENTS';
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('ALL');

  // Float Breakdown Accordion
  const [showFloatBreakdown, setShowFloatBreakdown] = useState<boolean>(false);

  // Modals State
  const [handoverModalOpen, setHandoverModalOpen] = useState<boolean>(false);
  const [handoverType, setHandoverType] = useState<'CASH' | 'UPI'>('CASH');
  const [keepWithMeModalOpen, setKeepWithMeModalOpen] = useState<boolean>(false);
  const [keepWithMeType, setKeepWithMeType] = useState<'CASH' | 'UPI'>('CASH');

  // Inline Handover Action State
  const [processingHandoverId, setProcessingHandoverId] = useState<string | null>(null);
  const [ledgerActionError, setLedgerActionError] = useState<string | null>(null);

  // Live Elapsed / Remaining Clock (updates every 10s)
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  // 1. Subscribe to all Guard Shifts
  useEffect(() => {
    if (!guardUid) return;
    const unsub = subscribeGuardShifts(
      guardUid,
      guardEmail,
      guardName,
      (list) => {
        setShifts(list);
      },
      (err) => {
        console.error('[MyShiftView] Error loading shifts:', err);
      }
    );
    return () => unsub();
  }, [guardUid, guardEmail, guardName]);

  // 2. Subscribe to Shift Stats for the current active shift
  useEffect(() => {
    if (!activeShift) {
      setShiftStats({
        entriesCount: 0,
        exitsCount: 0,
        totalCollection: 0,
        cashCollection: 0,
        upiCollection: 0,
      });
      return;
    }
    const unsub = subscribeShiftStats(
      activeShift,
      (stats) => setShiftStats(stats),
      (err) => console.error('[MyShiftView] Error loading shift stats:', err)
    );
    return () => unsub();
  }, [activeShift]);

  // 3. Subscribe to Full Day Cumulative Performance Metrics
  useEffect(() => {
    if (!guardUid) return;
    const unsub = subscribeToGuardTodayMetrics(
      guardUid,
      guardName,
      (metrics) => setDailyMetrics(metrics),
      (err) => console.warn('[MyShiftView] Error loading daily metrics:', err)
    );
    return () => unsub();
  }, [guardUid, guardName]);

  // 4. Subscribe to Guard Financial Responsibility
  useEffect(() => {
    if (!guardUid) return;
    const unsub = subscribeToGuardFinancialResponsibility(
      guardUid,
      guardName,
      (resp) => setResponsibility(resp),
      (err) => console.error('[MyShiftView] Error loading responsibility:', err)
    );
    return () => unsub();
  }, [guardUid, guardName]);

  // 5. Subscribe to Handovers, Events, Withdrawals
  useEffect(() => {
    if (!guardUid) return;
    const unsubHandovers = subscribeGuardHandovers(guardUid, (list) => setHandovers(list));
    const unsubEvents = subscribeResponsibilityEvents(guardUid, (list) => setResponsibilityEvents(list));
    const unsubWithdrawals = subscribeGuardWithdrawals(guardUid, (list) => setWithdrawals(list));

    return () => {
      unsubHandovers();
      unsubEvents();
      unsubWithdrawals();
    };
  }, [guardUid]);

  // Categorize Shifts
  const currentActive = activeShift || shifts.find((s) => s.status === 'ACTIVE') || null;
  const upcomingShifts = shifts
    .filter((s) => s.status === 'ASSIGNED' && s.shiftId !== currentActive?.shiftId && s.startTime > now)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const completedShifts = shifts
    .filter((s) => s.status === 'COMPLETED' || (s.actualEndTime && s.shiftId !== currentActive?.shiftId))
    .sort((a, b) => (b.actualEndTime || b.endTime).getTime() - (a.actualEndTime || a.endTime).getTime());

  // Shift Name Helper matching Flutter displayShiftName
  const getShiftRotationName = (shift: ShiftModel): string => {
    const startHour = shift.startTime.getHours();
    if (startHour >= 5 && startHour < 13) return 'Shift 1 (Morning Rotation)';
    if (startHour >= 13 && startHour < 21) return 'Shift 2 (Afternoon Rotation)';
    return 'Shift 3 (Night Rotation)';
  };

  // Elapsed / Remaining Calculation
  let elapsedStr = '0h 0m';
  let remainingStr = '0h 0m';
  let isNearEnd = false;

  if (currentActive) {
    const sTime = currentActive.startTime.getTime();
    const eTime = currentActive.endTime.getTime();
    const nowTime = now.getTime();

    const elapsedMs = Math.max(0, Math.min(nowTime - sTime, eTime - sTime));
    const remainingMs = Math.max(0, eTime - nowTime);

    const elapsedH = Math.floor(elapsedMs / (1000 * 3600));
    const elapsedM = Math.floor((elapsedMs % (1000 * 3600)) / (1000 * 60));
    elapsedStr = `${elapsedH}h ${elapsedM}m`;

    const remainingH = Math.floor(remainingMs / (1000 * 3600));
    const remainingM = Math.floor((remainingMs % (1000 * 3600)) / (1000 * 60));
    remainingStr = `${remainingH}h ${remainingM}m`;

    isNearEnd = remainingMs < 3600 * 1000 && remainingMs > 0;
  }

  // Handle Inline Handover Actions
  const handleInlineAccept = async (handover: HandoverModel) => {
    setProcessingHandoverId(handover.handoverId);
    setLedgerActionError(null);
    try {
      await respondToHandover({
        handoverId: handover.handoverId,
        accept: true,
        guardUid,
        guardName,
      });
    } catch (err: unknown) {
      console.error('[MyShiftView] Inline accept failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setLedgerActionError(msg.replace(/^Exception:s*/i, ''));
    } finally {
      setProcessingHandoverId(null);
    }
  };

  const handleInlineReject = async (handover: HandoverModel) => {
    const confirmed = window.confirm(
      `Are you sure you want to REJECT the ${handover.type} handover of ${formatCurrency(
        handover.amount
      )} from ${handover.fromGuardName}?`
    );
    if (!confirmed) return;

    setProcessingHandoverId(handover.handoverId);
    setLedgerActionError(null);
    try {
      await respondToHandover({
        handoverId: handover.handoverId,
        accept: false,
        guardUid,
        guardName,
      });
    } catch (err: unknown) {
      console.error('[MyShiftView] Inline reject failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setLedgerActionError(msg.replace(/^Exception:s*/i, ''));
    } finally {
      setProcessingHandoverId(null);
    }
  };

  const handleInlineCancel = async (handover: HandoverModel) => {
    const confirmed = window.confirm(
      `Are you sure you want to CANCEL your outgoing ${handover.type} handover of ${formatCurrency(
        handover.amount
      )} to ${handover.toGuardName}?`
    );
    if (!confirmed) return;

    setProcessingHandoverId(handover.handoverId);
    setLedgerActionError(null);
    try {
      await cancelHandover({
        handoverId: handover.handoverId,
        guardUid,
        guardName,
      });
    } catch (err: unknown) {
      console.error('[MyShiftView] Inline cancel failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setLedgerActionError(msg.replace(/^Exception:s*/i, ''));
    } finally {
      setProcessingHandoverId(null);
    }
  };

  // Filtered Ledger Items
  const cleanGuardId = guardUid.toLowerCase();
  const pendingIncoming = handovers.filter(
    (h) => h.status === 'PENDING' && h.toGuardId.toLowerCase() === cleanGuardId
  );
  const pendingOutgoing = handovers.filter(
    (h) => h.status === 'PENDING' && h.fromGuardId.toLowerCase() === cleanGuardId
  );
  const completedHandovers = handovers.filter((h) => h.status !== 'PENDING');

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* 1. Header & Terminal Attendant Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              My Shift Operations & Float Responsibility
            </h1>
            <Badge variant="success">Phase 4G Active</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time shift timer, operational vehicle ledger, physical cash float, and relieving guard handover transfer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <span className="text-xs font-bold text-slate-900 block">{guardName}</span>
            <span className="text-[11px] text-slate-500 font-mono">{guardEmail || guardUid}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-sm">
            <User className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Current Active Shift Card matching Flutter _buildActiveShiftCard */}
      {currentActive ? (
        <Card className="p-6 border-emerald-200 bg-linear-to-br from-white via-emerald-50/20 to-white shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-inner">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">
                    {getShiftRotationName(currentActive)}
                  </h2>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <Badge variant="success">ACTIVE ROTATION</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatDate(currentActive.shiftDate)}</span>
                  <span>•</span>
                  <span>Scheduled: {formatTime(currentActive.startTime)} – {formatTime(currentActive.endTime)}</span>
                  <span>({currentActive.durationHours} Hours)</span>
                </div>
              </div>
            </div>

            {/* Elapsed / Remaining Tickers */}
            <div className="flex items-center gap-2 bg-emerald-50/80 p-2 rounded-2xl border border-emerald-100/80 self-start md:self-auto">
              <div className="px-3 py-1.5 rounded-xl bg-white border border-emerald-100 text-center">
                <span className="text-[10px] font-semibold text-slate-500 block uppercase tracking-wide">
                  Time Elapsed
                </span>
                <span className="font-mono text-sm font-bold text-emerald-800">
                  {elapsedStr}
                </span>
              </div>
              <div className={`px-3 py-1.5 rounded-xl bg-white border text-center ${
                isNearEnd ? 'border-amber-300 bg-amber-50/50' : 'border-emerald-100'
              }`}>
                <span className={`text-[10px] font-semibold block uppercase tracking-wide ${
                  isNearEnd ? 'text-amber-800' : 'text-slate-500'
                }`}>
                  Time Remaining
                </span>
                <span className={`font-mono text-sm font-bold ${
                  isNearEnd ? 'text-amber-700 animate-pulse' : 'text-slate-800'
                }`}>
                  {remainingStr}
                </span>
              </div>
            </div>
          </div>

          {/* Operational Shift Stats */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                Current Shift Operational Metrics
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Scoped strictly to shift start ({formatTime(currentActive.startTime)})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                  <LogIn className="w-4 h-4 text-emerald-600" />
                  <span>Shift Entries</span>
                </div>
                <div className="text-2xl font-bold font-mono text-slate-900">
                  {shiftStats.entriesCount}
                </div>
                <span className="text-[10px] text-slate-400">Parked in shift window</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                  <LogOut className="w-4 h-4 text-brand-600" />
                  <span>Shift Exits</span>
                </div>
                <div className="text-2xl font-bold font-mono text-slate-900">
                  {shiftStats.exitsCount}
                </div>
                <span className="text-[10px] text-slate-400">Settled in shift window</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span>Shift Cash</span>
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-700">
                  {formatCurrency(shiftStats.cashCollection)}
                </div>
                <span className="text-[10px] text-slate-400">Net physical collections</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                  <QrCode className="w-4 h-4 text-brand-600" />
                  <span>Shift UPI</span>
                </div>
                <div className="text-2xl font-bold font-mono text-brand-700">
                  {formatCurrency(shiftStats.upiCollection)}
                </div>
                <span className="text-[10px] text-slate-400">Net QR payments</span>
              </div>
            </div>

            {/* Daily Full Day Reference Banner */}
            {dailyMetrics && (
              <div className="mt-3.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-2">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  Today's Cumulative Performance (Full Day 00:00 – 23:59):
                </span>
                <div className="flex items-center gap-4 text-[11px] font-mono">
                  <span>Entries: <strong>{dailyMetrics.todayEntries}</strong></span>
                  <span>Exits: <strong>{dailyMetrics.todayExits}</strong></span>
                  <span>Total Collection: <strong className="text-emerald-700">{formatCurrency(dailyMetrics.todayCollection)}</strong></span>
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-6 border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-800">No Active Shift Currently In Rotation</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            There is no active shift rotation started for terminal attendant <strong>{guardName}</strong>.
            Shifts start automatically via the system shift daemon when your scheduled start window arrives.
          </p>
          {upcomingShifts.length > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-xs font-semibold">
              <Calendar className="w-3.5 h-3.5" />
              <span>Next upcoming shift: {formatDate(upcomingShifts[0].shiftDate)} at {formatTime(upcomingShifts[0].startTime)}</span>
            </div>
          )}
        </Card>
      )}

      {/* 3. Guard Financial Responsibility Ledger (Physical Cash Float & Digital UPI) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              Financial Responsibility & Float Holdings
            </h2>
            <p className="text-xs text-slate-500">
              Money currently with you: Collections – Handed Over (Out) + Received (In) – Admin Settlements
            </p>
          </div>
          <button
            onClick={() => setShowFloatBreakdown(!showFloatBreakdown)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 transition-colors"
          >
            <span>{showFloatBreakdown ? 'Hide Breakdown' : 'View Audit Breakdown'}</span>
            {showFloatBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Physical Cash Float */}
          <Card className="p-5 border-emerald-200 bg-emerald-50/20 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  Physical Cash Float
                </span>
                <Badge variant={responsibility.outstandingCash > 0 ? 'success' : 'neutral'}>
                  {responsibility.outstandingCash > 0 ? 'Float In Hand' : 'Settled'}
                </Badge>
              </div>
              <div className="text-3xl font-extrabold font-mono text-emerald-700">
                {formatCurrency(responsibility.outstandingCash)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Cash currency notes currently in physical counter float
              </span>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                disabled={responsibility.outstandingCash <= 0}
                onClick={() => {
                  setHandoverType('CASH');
                  setHandoverModalOpen(true);
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Handover Cash</span>
              </button>
              <button
                disabled={responsibility.outstandingCash <= 0}
                onClick={() => {
                  setKeepWithMeType('CASH');
                  setKeepWithMeModalOpen(true);
                }}
                title="Retain physical cash into your next shift"
                className="py-2 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Keep Float</span>
              </button>
            </div>
          </Card>

          {/* Card 2: Digital UPI Responsibility */}
          <Card className="p-5 border-brand-200 bg-brand-50/20 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-brand-600" />
                  Digital UPI Float
                </span>
                <Badge variant={responsibility.outstandingUpi > 0 ? 'primary' : 'neutral'}>
                  {responsibility.outstandingUpi > 0 ? 'Active Ledger' : 'Settled'}
                </Badge>
              </div>
              <div className="text-3xl font-extrabold font-mono text-brand-700">
                {formatCurrency(responsibility.outstandingUpi)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Direct QR payments collected under this attendant account
              </span>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                disabled={responsibility.outstandingUpi <= 0}
                onClick={() => {
                  setHandoverType('UPI');
                  setHandoverModalOpen(true);
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Handover UPI</span>
              </button>
              <button
                disabled={responsibility.outstandingUpi <= 0}
                onClick={() => {
                  setKeepWithMeType('UPI');
                  setKeepWithMeModalOpen(true);
                }}
                title="Retain UPI responsibility into your next shift"
                className="py-2 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Keep Float</span>
              </button>
            </div>
          </Card>

          {/* Card 3: Total Outstanding Net Responsibility */}
          <Card className="p-5 border-slate-300 bg-linear-to-br from-slate-900 to-slate-800 text-white flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                  Total Financial Float
                </span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-extrabold font-mono text-white">
                {formatCurrency(responsibility.totalOutstanding)}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Cash ({formatCurrency(responsibility.outstandingCash)}) + UPI ({formatCurrency(responsibility.outstandingUpi)})
              </span>
            </div>

            <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-300">
              <span>Relieving Status:</span>
              <strong className={responsibility.totalOutstanding > 0 ? 'text-amber-300' : 'text-emerald-400'}>
                {responsibility.totalOutstanding > 0 ? 'Handover Required at End' : 'Reconciled & Clear'}
              </strong>
            </div>
          </Card>
        </div>

        {/* Detailed Float Breakdown Card (Expandable) */}
        {showFloatBreakdown && (
          <Card className="p-5 bg-slate-50/80 border-slate-200 animate-in fade-in duration-150">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
              Mathematical Float Reconciler Ledger
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-500 text-[11px] block">1. Total Collections (+)</span>
                <span className="font-bold font-mono text-slate-900 block mt-0.5">
                  {formatCurrency(responsibility.totalCashCollected + responsibility.totalUpiCollected)}
                </span>
                <span className="text-[10px] text-slate-400">
                  Cash: {formatCurrency(responsibility.totalCashCollected)} | UPI: {formatCurrency(responsibility.totalUpiCollected)}
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-500 text-[11px] block">2. Received from Others (+)</span>
                <span className="font-bold font-mono text-emerald-700 block mt-0.5">
                  {formatCurrency(responsibility.cashReceived + responsibility.upiReceived)}
                </span>
                <span className="text-[10px] text-slate-400">
                  Cash: {formatCurrency(responsibility.cashReceived)} | UPI: {formatCurrency(responsibility.upiReceived)}
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-500 text-[11px] block">3. Transferred Out (-)</span>
                <span className="font-bold font-mono text-brand-700 block mt-0.5">
                  {formatCurrency(responsibility.cashHandedOver + responsibility.upiHandedOver)}
                </span>
                <span className="text-[10px] text-slate-400">
                  Cash: {formatCurrency(responsibility.cashHandedOver)} | UPI: {formatCurrency(responsibility.upiHandedOver)}
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-500 text-[11px] block">4. Admin Settlements (-)</span>
                <span className="font-bold font-mono text-purple-700 block mt-0.5">
                  {formatCurrency(responsibility.cashWithdrawn + responsibility.upiWithdrawn)}
                </span>
                <span className="text-[10px] text-slate-400">
                  Cash: {formatCurrency(responsibility.cashWithdrawn)} | UPI: {formatCurrency(responsibility.upiWithdrawn)}
                </span>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* 4. Handovers & Activity Ledger */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <History className="w-4 h-4 text-slate-600" />
              Handover & Responsibility Activity Ledger
            </h3>
            <p className="text-xs text-slate-500">
              Audit trails of transfers, pending settlements, retentions, and admin withdrawals
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setLedgerFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                ledgerFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({handovers.length + responsibilityEvents.length + withdrawals.length})
            </button>
            <button
              onClick={() => setLedgerFilter('PENDING_IN')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                ledgerFilter === 'PENDING_IN'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <span>Incoming Pending</span>
              {pendingIncoming.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {pendingIncoming.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setLedgerFilter('PENDING_OUT')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                ledgerFilter === 'PENDING_OUT'
                  ? 'bg-brand-600 text-white'
                  : 'bg-brand-50 text-brand-800 hover:bg-brand-100'
              }`}
            >
              Outgoing ({pendingOutgoing.length})
            </button>
            <button
              onClick={() => setLedgerFilter('COMPLETED')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                ledgerFilter === 'COMPLETED'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Completed ({completedHandovers.length})
            </button>
            <button
              onClick={() => setLedgerFilter('EVENTS')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                ledgerFilter === 'EVENTS'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              Audit Events ({responsibilityEvents.length + withdrawals.length})
            </button>
          </div>
        </div>

        {/* Action Error Message */}
        {ledgerActionError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-800">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{ledgerActionError}</span>
          </div>
        )}

        {/* Ledger Items Container */}
        <div className="mt-4 space-y-3">
          {/* A. Pending Incoming Transfers */}
          {(ledgerFilter === 'ALL' || ledgerFilter === 'PENDING_IN') &&
            pendingIncoming.map((h) => (
              <div
                key={h.handoverId}
                className="p-4 rounded-2xl border-2 border-amber-300 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        Incoming {h.type} Handover
                      </span>
                      <Badge variant="warning">AWAITING YOUR ACCEPTANCE</Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      <strong>{h.fromGuardName}</strong> transferred financial responsibility to you.
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 font-mono">
                      <span>Initiated: {formatDateTime(h.createdAt)}</span>
                      {h.shiftId && <span>Shift: {h.shiftId}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="text-right">
                    <span className="text-lg font-bold font-mono text-emerald-700 block">
                      {formatCurrency(h.amount)}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                      {h.type} Float
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleInlineAccept(h)}
                      disabled={processingHandoverId === h.handoverId}
                      className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {processingHandoverId === h.handoverId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>Accept</span>
                    </button>
                    <button
                      onClick={() => handleInlineReject(h)}
                      disabled={processingHandoverId === h.handoverId}
                      className="py-1.5 px-2.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 font-semibold text-xs transition-colors disabled:opacity-50"
                    >
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}

          {/* B. Pending Outgoing Transfers */}
          {(ledgerFilter === 'ALL' || ledgerFilter === 'PENDING_OUT') &&
            pendingOutgoing.map((h) => (
              <div
                key={h.handoverId}
                className="p-4 rounded-2xl border border-brand-200 bg-brand-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-800 flex items-center justify-center shrink-0">
                    <RotateCw className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        Outgoing {h.type} Handover
                      </span>
                      <Badge variant="primary">PENDING RECEIVER ACCEPTANCE</Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Transferred to <strong>{h.toGuardName}</strong>. Awaiting receiver confirmation.
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 font-mono">
                      <span>Initiated: {formatDateTime(h.createdAt)}</span>
                      {h.notes && <span>Notes: "{h.notes}"</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="text-right">
                    <span className="text-lg font-bold font-mono text-brand-700 block">
                      {formatCurrency(h.amount)}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                      {h.type} Float
                    </span>
                  </div>

                  <button
                    onClick={() => handleInlineCancel(h)}
                    disabled={processingHandoverId === h.handoverId}
                    className="py-1.5 px-3 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 font-semibold text-xs transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {processingHandoverId === h.handoverId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    <span>Cancel Transfer</span>
                  </button>
                </div>
              </div>
            ))}

          {/* C. Completed Handovers (Accepted / Rejected / Cancelled) */}
          {(ledgerFilter === 'ALL' || ledgerFilter === 'COMPLETED') &&
            completedHandovers.map((h) => {
              const isSender = h.fromGuardId.toLowerCase() === cleanGuardId;
              const statusVariant =
                h.status === 'ACCEPTED'
                  ? 'success'
                  : h.status === 'REJECTED'
                  ? 'danger'
                  : 'neutral';

              return (
                <div
                  key={h.handoverId}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        h.type === 'CASH' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700'
                      }`}
                    >
                      {h.type === 'CASH' ? <Banknote className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {isSender ? `Handover to ${h.toGuardName}` : `Received from ${h.fromGuardName}`}
                        </span>
                        <Badge variant={statusVariant}>{h.status}</Badge>
                        <span className="text-[10px] text-slate-400 uppercase font-mono">{h.type}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        <span>{formatDateTime(h.createdAt)}</span>
                        {h.acceptedAt && <span> • Settled: {formatDateTime(h.acceptedAt)}</span>}
                        {h.notes && <span> • "{h.notes}"</span>}
                      </div>
                    </div>
                  </div>

                  <div className="text-right self-end sm:self-auto font-mono">
                    <span
                      className={`text-sm font-bold ${
                        h.status === 'ACCEPTED'
                          ? isSender
                            ? 'text-brand-700'
                            : 'text-emerald-700'
                          : 'text-slate-500 line-through'
                      }`}
                    >
                      {formatCurrency(h.amount)}
                    </span>
                  </div>
                </div>
              );
            })}

          {/* D. Audit Events (Keep With Me, Withdrawals, Responsibility Events) */}
          {(ledgerFilter === 'ALL' || ledgerFilter === 'EVENTS') && (
            <>
              {responsibilityEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3.5 rounded-xl border border-purple-100 bg-purple-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                      <RotateCw className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{ev.action.replace(/_/g, ' ')}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                          {ev.status}
                        </span>
                        <span className="text-[10px] text-slate-400 uppercase font-mono">{ev.type}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        {formatDateTime(ev.createdAt)} • Shift: {ev.shiftId || 'Standard'}
                        {ev.targetGuardName && ` • Target: ${ev.targetGuardName}`}
                      </span>
                    </div>
                  </div>

                  <div className="text-right self-end sm:self-auto font-mono font-bold text-sm text-purple-800">
                    {formatCurrency(ev.amount)}
                  </div>
                </div>
              ))}

              {withdrawals.map((w) => (
                <div
                  key={w.id}
                  className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">Admin Settlement / Withdrawal</span>
                        <Badge variant="warning">SETTLED</Badge>
                        <span className="text-[10px] text-slate-400 uppercase font-mono">{w.type}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Settled by Admin ({w.adminName}) on {formatDateTime(w.createdAt)}
                        {w.notes && ` • Notes: ${w.notes}`}
                      </span>
                    </div>
                  </div>

                  <div className="text-right self-end sm:self-auto font-mono font-bold text-sm text-amber-800">
                    -{formatCurrency(w.amount)}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Empty State */}
          {handovers.length === 0 && responsibilityEvents.length === 0 && withdrawals.length === 0 && (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <History className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs">No handover or float activity records found for this guard.</p>
            </div>
          )}
        </div>
      </Card>

      {/* 5. Upcoming & Shift History Sections matching Flutter */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upcoming Assigned Shifts */}
        <Card className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-brand-600" />
              Upcoming Assigned Shifts
            </h4>
            <span className="text-[10px] font-mono font-semibold text-slate-500">
              {upcomingShifts.length} Scheduled
            </span>
          </div>

          {upcomingShifts.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-xs">
              No additional upcoming shifts assigned on your schedule.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {upcomingShifts.map((s) => (
                <div
                  key={s.shiftId}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-800 block">
                      {formatDate(s.shiftDate)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {formatTime(s.startTime)} – {formatTime(s.endTime)} ({s.durationHours}h)
                    </span>
                  </div>
                  <Badge variant="primary">ASSIGNED</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Completed Shift History */}
        <Card className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Recent Completed Shifts History
            </h4>
            <span className="text-[10px] font-mono font-semibold text-slate-500">
              {completedShifts.length} Completed
            </span>
          </div>

          {completedShifts.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-xs">
              No completed shifts recorded in history yet.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {completedShifts.slice(0, 5).map((s) => (
                <div
                  key={s.shiftId}
                  className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-800 block">
                      {formatDate(s.shiftDate)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Ended at {s.actualEndTime ? formatTime(s.actualEndTime) : formatTime(s.endTime)}
                    </span>
                  </div>
                  <Badge variant="neutral">COMPLETED</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 6. Handover & Retention Modals */}
      {guardProfile && (
        <>
          <InitiateHandoverModal
            isOpen={handoverModalOpen}
            onClose={() => setHandoverModalOpen(false)}
            currentGuard={guardProfile}
            activeShift={currentActive}
            type={handoverType}
            amount={handoverType === 'CASH' ? responsibility.outstandingCash : responsibility.outstandingUpi}
            onSuccess={() => {
              console.log('[MyShiftView] Handover initiated successfully.');
            }}
          />

          <KeepWithMeConfirmModal
            isOpen={keepWithMeModalOpen}
            onClose={() => setKeepWithMeModalOpen(false)}
            currentGuard={guardProfile}
            activeShift={currentActive}
            type={keepWithMeType}
            amount={keepWithMeType === 'CASH' ? responsibility.outstandingCash : responsibility.outstandingUpi}
            onSuccess={() => {
              console.log('[MyShiftView] Float retained successfully.');
            }}
          />
        </>
      )}
    </div>
  );
};
