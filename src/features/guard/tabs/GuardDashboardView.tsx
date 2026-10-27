import React, { useState, useEffect } from 'react';
import {
  Car,
  Bike,
  LogIn,
  LogOut,
  Clock,
  Wallet,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  ArrowRight,
  TrendingUp,
  Inbox,
  AlertCircle,
  Banknote,
  QrCode,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import {
  CapacityData,
  DashboardMetrics,
  GuardFinancialResponsibility,
  GuardTab,
  HandoverModel,
  ParkingRecord,
  ShiftModel,
} from '../../../types';
import {
  subscribeToLiveCapacity,
  subscribeToGuardTodayMetrics,
  subscribeToGuardFinancialResponsibility,
  subscribeToRecentParkingActivity,
} from '../../../services/guardService';
import { formatCurrency, formatTime } from '../../../utils/formatters';
import { useAuth } from '../../auth/AuthContext';

interface GuardDashboardViewProps {
  onNavigateTab: (tab: GuardTab) => void;
  activeShift: ShiftModel | null;
  pendingHandovers: HandoverModel[];
  isVerifyingHandovers: boolean;
}

export const GuardDashboardView: React.FC<GuardDashboardViewProps> = ({
  onNavigateTab,
  activeShift,
  pendingHandovers,
  isVerifyingHandovers,
}) => {
  const { currentUser, guardProfile } = useAuth();
  const guardUid = currentUser?.uid || guardProfile?.uid || '';
  const guardName = guardProfile?.name || 'Gate Attendant';

  // Live Streams State
  const [capacity, setCapacity] = useState<CapacityData | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [responsibility, setResponsibility] = useState<GuardFinancialResponsibility | null>(null);
  const [recentRecords, setRecentRecords] = useState<ParkingRecord[]>([]);

  // Distinct Errors
  const [capacityError, setCapacityError] = useState<Error | null>(null);
  const [metricsError, setMetricsError] = useState<Error | null>(null);
  const [respError, setRespError] = useState<Error | null>(null);

  // Time Remaining Countdown for Active Shift
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // 1. Subscribe to Live Capacity
  useEffect(() => {
    setCapacityError(null);
    const unsub = subscribeToLiveCapacity(
      (cap) => {
        setCapacity(cap);
        setCapacityError(null);
      },
      (err) => {
        console.error('[GuardDashboard] Capacity error:', err);
        setCapacityError(err);
      }
    );
    return () => unsub();
  }, []);

  // 2. Subscribe to Today's Guard Metrics
  useEffect(() => {
    if (!guardUid) return;
    setMetricsError(null);
    const unsub = subscribeToGuardTodayMetrics(
      guardUid,
      guardName,
      (m) => {
        setMetrics(m);
        setMetricsError(null);
      },
      (err) => {
        console.error('[GuardDashboard] Metrics error:', err);
        setMetricsError(err);
      }
    );
    return () => unsub();
  }, [guardUid, guardName]);

  // 3. Subscribe to Guard Financial Responsibility
  useEffect(() => {
    if (!guardUid) return;
    setRespError(null);
    const unsub = subscribeToGuardFinancialResponsibility(
      guardUid,
      guardName,
      (resp) => {
        setResponsibility(resp);
        setRespError(null);
      },
      (err) => {
        console.error('[GuardDashboard] Responsibility error:', err);
        setRespError(err);
      }
    );
    return () => unsub();
  }, [guardUid, guardName]);

  // 4. Subscribe to Recent Activity (5 records)
  useEffect(() => {
    const unsub = subscribeToRecentParkingActivity(
      5,
      (records) => {
        setRecentRecords(records);
      },
      (err) => {
        console.warn('[GuardDashboard] Recent records warning:', err);
      }
    );
    return () => unsub();
  }, []);

  // 5. Shift Timer Countdown
  useEffect(() => {
    if (!activeShift?.endTime) {
      setTimeRemaining('');
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const end = activeShift.endTime.getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeRemaining('Shift schedule completed');
        return;
      }

      const totalMinutes = Math.floor(diff / (1000 * 60));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      setTimeRemaining(`${hours}h ${minutes}m remaining`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [activeShift]);

  // Capacity calculations with clamp safeguards
  const carTotal = capacity?.carTotal ?? 50;
  const carOccupied = capacity?.carOccupied ?? 0;
  const carAvailable = Math.max(0, capacity?.carAvailable ?? (carTotal - carOccupied));
  const carIsFull = carAvailable <= 0;
  const carFraction = carTotal > 0 ? Math.min(1, Math.max(0, carOccupied / carTotal)) : 0;
  const carPercentage = Math.round(carFraction * 100);

  const bikeTotal = capacity?.twoWheelerTotal ?? 50;
  const bikeOccupied = capacity?.twoWheelerOccupied ?? 0;
  const bikeAvailable = Math.max(0, capacity?.twoWheelerAvailable ?? (bikeTotal - bikeOccupied));
  const bikeIsFull = bikeAvailable <= 0;
  const bikeFraction = bikeTotal > 0 ? Math.min(1, Math.max(0, bikeOccupied / bikeTotal)) : 0;
  const bikePercentage = Math.round(bikeFraction * 100);

  return (
    <div className="space-y-6">
      {/* SECTION A: Guard Identity & Active Shift Information Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white">
                {guardName}
              </span>
              <Badge variant={activeShift ? 'success' : 'warning'}>
                {activeShift ? 'ACTIVE SHIFT' : 'NO SHIFT ASSIGNED'}
              </Badge>
              <span className="bg-slate-800 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded-full border border-slate-700">
                ROLE: GUARD
              </span>
            </div>

            <div className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {activeShift ? (
                <>
                  <span className="font-medium text-emerald-400">
                    Schedule: {formatTime(activeShift.startTime)} - {formatTime(activeShift.endTime)}
                  </span>
                  <span>"</span>
                  <span className="text-slate-300 font-mono">
                    {timeRemaining || `${activeShift.durationHours}h shift`}
                  </span>
                </>
              ) : (
                <span className="text-amber-300 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  No active rotation assigned. Please contact Admin if on active duty.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live System Indicators */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 text-[11px] font-mono text-slate-300 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Read-Only Live Firestore</span>
          </div>
        </div>
      </div>

      {/* Handover Alert Widget */}
      {pendingHandovers.length > 0 ? (
        <div className="p-4 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-600">
              <RotateCw className="w-5 h-5 animate-spin" />
            </div>
            <div>
              <p className="font-bold text-amber-900 text-sm">
                Mandatory Handover Barrier Active ({pendingHandovers.length} Pending)
              </p>
              <p className="text-xs text-amber-700">
                Financial responsibility transfer awaiting review. Terminal operations remain safely guarded.
              </p>
            </div>
          </div>
          <Badge variant="warning">BARRIER LOCKED</Badge>
        </div>
      ) : (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Incoming Handover Queue:</span>
            <span className="font-medium text-slate-800">
              {isVerifyingHandovers ? 'Verifying live status...' : 'Clear (No Pending Transfers)'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Listener active</span>
        </div>
      )}

      {/* SECTION B: Real-Time Parking Capacity from Firestore */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Car className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Live Facility Capacity & Occupancy
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              Live Occupancy
            </span>
          </div>
        </div>

        {capacityError ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900">
              <p className="font-semibold">Capacity Query Error:</p>
              <p className="font-mono text-[11px] mt-0.5">{capacityError.message}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 4-Wheeler Capacity Card */}
            <Card className="p-5 border-slate-200 shadow-xs">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-brand-50 text-brand-700 border border-brand-100">
                    <Car className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Four-Wheeler (4W)</h3>
                    <p className="text-xs text-slate-500">Cars & Commercial Vehicles</p>
                  </div>
                </div>

                {carIsFull ? (
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-red-600 text-white tracking-wider animate-pulse shadow-xs">
                    FULL - ENTRY BLOCKED
                  </span>
                ) : (
                  <span className={`text-xs font-bold ${carFraction > 0.85 ? 'text-amber-600' : 'text-emerald-700'}`}>
                    {carPercentage}% Occupied
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="mt-4 mb-4">
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${
                      carIsFull
                        ? 'bg-red-600'
                        : carFraction > 0.85
                        ? 'bg-amber-500'
                        : 'bg-emerald-600'
                    }`}
                    style={{ width: `${carPercentage}%` }}
                  />
                </div>
              </div>

              {/* Slots breakdown */}
              <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-100">
                <div className="p-2 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Configured</span>
                  <span className="text-sm font-bold text-slate-800">{carTotal}</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Occupied</span>
                  <span className="text-sm font-bold text-slate-800">{carOccupied}</span>
                </div>
                <div className={`p-2 rounded-xl ${carIsFull ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
                  <span className="text-[10px] uppercase font-semibold block">Available</span>
                  <span className="text-sm font-bold">{carAvailable}</span>
                </div>
              </div>
            </Card>

            {/* 2-Wheeler Capacity Card */}
            <Card className="p-5 border-slate-200 shadow-xs">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                    <Bike className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Two-Wheeler (2W)</h3>
                    <p className="text-xs text-slate-500">Motorcycles & Scooters</p>
                  </div>
                </div>

                {bikeIsFull ? (
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-red-600 text-white tracking-wider animate-pulse shadow-xs">
                    FULL - ENTRY BLOCKED
                  </span>
                ) : (
                  <span className={`text-xs font-bold ${bikeFraction > 0.85 ? 'text-amber-600' : 'text-emerald-700'}`}>
                    {bikePercentage}% Occupied
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="mt-4 mb-4">
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${
                      bikeIsFull
                        ? 'bg-red-600'
                        : bikeFraction > 0.85
                        ? 'bg-amber-500'
                        : 'bg-emerald-600'
                    }`}
                    style={{ width: `${bikePercentage}%` }}
                  />
                </div>
              </div>

              {/* Slots breakdown */}
              <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-100">
                <div className="p-2 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Configured</span>
                  <span className="text-sm font-bold text-slate-800">{bikeTotal}</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Occupied</span>
                  <span className="text-sm font-bold text-slate-800">{bikeOccupied}</span>
                </div>
                <div className={`p-2 rounded-xl ${bikeIsFull ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
                  <span className="text-[10px] uppercase font-semibold block">Available</span>
                  <span className="text-sm font-bold">{bikeAvailable}</span>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* SECTION C: Today's Operational Statistics from Firestore */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Today's Operational Statistics
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            Attributed to {guardName} (Local Day)
          </span>
        </div>

        {metricsError ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900">
              <p className="font-semibold">Metrics Query Error:</p>
              <p className="font-mono text-[11px] mt-0.5">{metricsError.message}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Today Entries */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">Today's Entries</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <LogIn className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900">
                {metrics ? metrics.todayEntries : '--'}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Total vehicle gate entries</p>
            </Card>

            {/* Today Exits */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">Today's Exits</span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <LogOut className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900">
                {metrics ? metrics.todayExits : '--'}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Completed exit sessions</p>
            </Card>

            {/* Today Cash Collection */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">Cash Collections</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <Banknote className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-700">
                {metrics ? formatCurrency(metrics.cashCollection) : '--'}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Advances & final settlements</p>
            </Card>

            {/* Today UPI Collection */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">UPI Collections</span>
                <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
                  <QrCode className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold font-mono text-brand-700">
                {metrics ? formatCurrency(metrics.upiCollection) : '--'}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Digital QR scan receipts</p>
            </Card>
          </div>
        )}
      </div>

      {/* SECTION D: Shift & Financial Responsibility Ledger */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-purple-600" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Guard Financial Responsibility (Read-Only)
            </h2>
          </div>
          <span className="text-xs text-purple-700 font-semibold bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
            Current Float
          </span>
        </div>

        {respError ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900">
              <p className="font-semibold">Financial Responsibility Query Error:</p>
              <p className="font-mono text-[11px] mt-0.5">{respError.message}</p>
            </div>
          </div>
        ) : (
          <Card className="p-6 bg-gradient-to-br from-slate-50 via-white to-purple-50/30 border-purple-100">
            {/* Top Outstanding Summaries */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-5 border-b border-slate-200/80">
              <div className="p-4 rounded-2xl bg-white border border-emerald-100 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Outstanding Cash
                </span>
                <span className="text-2xl font-bold font-mono text-emerald-700 block mt-1">
                  {responsibility ? formatCurrency(responsibility.outstandingCash) : '--'}
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Physical cash float</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-brand-100 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Outstanding UPI
                </span>
                <span className="text-2xl font-bold font-mono text-brand-700 block mt-1">
                  {responsibility ? formatCurrency(responsibility.outstandingUpi) : '--'}
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Digital responsibility</span>
              </div>

              <div className="p-4 rounded-2xl bg-purple-900 text-white shadow-sm">
                <span className="text-[11px] font-semibold text-purple-200 uppercase tracking-wider block">
                  Total Outstanding Float
                </span>
                <span className="text-2xl font-bold font-mono text-white block mt-1">
                  {responsibility ? formatCurrency(responsibility.totalOutstanding) : '--'}
                </span>
                <span className="text-[11px] text-purple-300 mt-0.5 block">Total custody with guard</span>
              </div>
            </div>

            {/* Sub-Ledger Breakdown */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Collected</span>
                <p className="font-semibold text-slate-800 font-mono mt-0.5">
                  {responsibility ? formatCurrency(responsibility.totalCashCollected + responsibility.totalUpiCollected) : '--'}
                </p>
                <span className="text-[10px] text-slate-500">Advances + Finals - Refunds</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Handed Over (Out)</span>
                <p className="font-semibold text-amber-700 font-mono mt-0.5">
                  {responsibility ? formatCurrency(responsibility.cashHandedOver + responsibility.upiHandedOver) : '--'}
                </p>
                <span className="text-[10px] text-slate-500">Transferred to next guard</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Received In</span>
                <p className="font-semibold text-emerald-700 font-mono mt-0.5">
                  {responsibility ? formatCurrency(responsibility.cashReceived + responsibility.upiReceived) : '--'}
                </p>
                <span className="text-[10px] text-slate-500">Accepted from previous shift</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Admin Withdrawn</span>
                <p className="font-semibold text-purple-700 font-mono mt-0.5">
                  {responsibility ? formatCurrency(responsibility.cashWithdrawn + responsibility.upiWithdrawn) : '--'}
                </p>
                <span className="text-[10px] text-slate-500">Settled with Administrator</span>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* SECTION E: Recent Parking Activity Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Recent Parking Activity
            </h2>
          </div>
          <span className="text-xs text-slate-500">Latest 5 Firestore records</span>
        </div>

        {recentRecords.length === 0 ? (
          <Card className="p-8 text-center text-slate-400">
            <Inbox className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700 text-sm">No Recent Parking Activity</p>
            <p className="text-xs text-slate-400 mt-1">Vehicle entries and exits will appear here in real-time.</p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {recentRecords.map((rec) => {
              const is2W = String(rec.vehicleType).toLowerCase().includes('two') || String(rec.vehicleType) === '2w';
              const isActive = rec.status === 'ACTIVE';

              return (
                <Card key={rec.id} className="p-3.5 hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${is2W ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600'}`}>
                        {is2W ? <Bike className="w-5 h-5" /> : <Car className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-sm">
                            {rec.vehicleNumber}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                            {is2W ? '2-Wheeler' : '4-Wheeler'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>In: {formatTime(rec.entryTime)}</span>
                          <span>"</span>
                          <span>Ticket: {rec.ticketNumber}</span>
                          {rec.entryGuardName && (
                            <>
                              <span>"</span>
                              <span>By: {rec.entryGuardName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <Badge variant={isActive ? 'success' : 'neutral'}>
                        {isActive ? 'ACTIVE' : 'EXITED'}
                      </Badge>
                      {rec.advanceAmount > 0 && (
                        <div className="text-[10px] text-slate-400 font-mono mt-1">
                          Adv: {formatCurrency(rec.advanceAmount)}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION F: Operations Quick Actions Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Operational Terminal Modules
            </h2>
          </div>
          <span className="text-xs text-slate-500">Switch tabs</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div
            className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 hover:border-emerald-300 transition-all cursor-pointer group"
            onClick={() => onNavigateTab('entry')}
          >
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 w-fit mb-3 group-hover:scale-105 transition-transform">
              <LogIn className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm group-hover:text-emerald-700">Vehicle Entry</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Gate In & Slips</p>
            <div className="mt-3 flex items-center text-xs text-emerald-600 font-medium">
              <span>Open</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1 transform group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          <div
            className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 hover:border-blue-300 transition-all cursor-pointer group"
            onClick={() => onNavigateTab('active-vehicles')}
          >
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 w-fit mb-3 group-hover:scale-105 transition-transform">
              <Car className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-700">Active Parking</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Live parked slots</p>
            <div className="mt-3 flex items-center text-xs text-blue-600 font-medium">
              <span>Open</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1 transform group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          <div
            className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 hover:border-amber-300 transition-all cursor-pointer group"
            onClick={() => onNavigateTab('exit')}
          >
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 w-fit mb-3 group-hover:scale-105 transition-transform">
              <LogOut className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm group-hover:text-amber-700">Vehicle Exit</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Gate Out & Pay</p>
            <div className="mt-3 flex items-center text-xs text-amber-600 font-medium">
              <span>Open</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1 transform group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          <div
            className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 hover:border-purple-300 transition-all cursor-pointer group"
            onClick={() => onNavigateTab('my-shift')}
          >
            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 w-fit mb-3 group-hover:scale-105 transition-transform">
              <Clock className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm group-hover:text-purple-700">My Shift</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Float & Handover</p>
            <div className="mt-3 flex items-center text-xs text-purple-600 font-medium">
              <span>Open</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1 transform group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
