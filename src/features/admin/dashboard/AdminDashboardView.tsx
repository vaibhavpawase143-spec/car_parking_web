import React, { useEffect, useState } from 'react';
import {
  Car,
  Bike,
  IndianRupee,
  LogIn,
  LogOut,
  Clock,
  Shield,
  Activity,
  Layers,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import {
  CapacityData,
  DashboardMetrics,
  ParkingRecord,
  ShiftModel,
  SystemConfig,
} from '../../../types';
import {
  DEFAULT_SYSTEM_CONFIG,
  subscribeCapacity,
  subscribeParkingRecords,
  subscribeShifts,
  subscribeSystemConfig,
  subscribeTodayMetrics,
} from '../../../services/adminService';
import { formatCurrency, formatDateTime, formatVehicleType } from '../../../utils/formatters';

export const AdminDashboardView: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [capacity, setCapacity] = useState<CapacityData>({
    carTotal: 50,
    carOccupied: 0,
    twoWheelerTotal: 50,
    twoWheelerOccupied: 0,
    carAvailable: 50,
    twoWheelerAvailable: 50,
  });
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    todayEntries: 0,
    todayExits: 0,
    activeParked: 0,
    todayCollection: 0,
    cashCollection: 0,
    upiCollection: 0,
  });
  const [recentRecords, setRecentRecords] = useState<ParkingRecord[]>([]);
  const [activeShift, setActiveShift] = useState<ShiftModel | null>(null);

  useEffect(() => {
    const unsubConfig = subscribeSystemConfig((cfg) => setConfig(cfg));
    const unsubCap = subscribeCapacity((cap) => {
      setCapacity(cap);
    });
    const unsubMetrics = subscribeTodayMetrics((met) => setMetrics(met));
    const unsubRecords = subscribeParkingRecords((recs) => {
      setRecentRecords(recs.slice(0, 6));
    });
    const unsubShifts = subscribeShifts((shifts) => {
      const active = shifts.find((s) => s.status === 'ACTIVE') || null;
      setActiveShift(active);
    });

    return () => {
      unsubConfig();
      unsubCap();
      unsubMetrics();
      unsubRecords();
      unsubShifts();
    };
  }, []);

  const carPercent = capacity.carTotal > 0 ? Math.round((capacity.carOccupied / capacity.carTotal) * 100) : 0;
  const bikePercent = capacity.twoWheelerTotal > 0 ? Math.round((capacity.twoWheelerOccupied / capacity.twoWheelerTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner & Facility Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Facility Overview</h1>
            <Badge variant="primary" className="font-mono text-[11px]">LIVE STREAM</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {config.englishName} • {config.englishLocation} • Real-time operational pulse
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg shadow-2xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Firestore Cloud Synced
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Revenue */}
        <Card className="p-5 border-brand-200 shadow-xs relative overflow-hidden bg-gradient-to-br from-white via-white to-brand-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Today's Revenue</span>
            <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-100">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatCurrency(metrics.todayCollection)}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Cash: <strong className="text-emerald-700 font-semibold">{formatCurrency(metrics.cashCollection)}</strong></span>
              <span>UPI: <strong className="text-blue-700 font-semibold">{formatCurrency(metrics.upiCollection)}</strong></span>
            </div>
          </div>
        </Card>

        {/* Card 2: Active Occupancy */}
        <Card className="p-5 border-slate-200 shadow-xs relative overflow-hidden bg-gradient-to-br from-white via-white to-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Parked Vehicles</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {capacity.carOccupied + capacity.twoWheelerOccupied}
              <span className="text-xs font-normal text-slate-400 ml-1.5">
                / {capacity.carTotal + capacity.twoWheelerTotal} total slots
              </span>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Cars: <strong className="text-slate-800 font-medium">{capacity.carOccupied}</strong></span>
              <span>2-Wheelers: <strong className="text-slate-800 font-medium">{capacity.twoWheelerOccupied}</strong></span>
            </div>
          </div>
        </Card>

        {/* Card 3: Today's Entries */}
        <Card className="p-5 border-slate-200 shadow-xs relative overflow-hidden bg-gradient-to-br from-white via-white to-emerald-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Today's Inflow</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <LogIn className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {metrics.todayEntries} <span className="text-xs font-normal text-slate-400">vehicles</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 truncate">
              Total ticketing slips issued today
            </p>
          </div>
        </Card>

        {/* Card 4: Today's Exits */}
        <Card className="p-5 border-slate-200 shadow-xs relative overflow-hidden bg-gradient-to-br from-white via-white to-amber-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Today's Outflow</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <LogOut className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {metrics.todayExits} <span className="text-xs font-normal text-slate-400">vehicles</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 truncate">
              Settled exits recorded at terminal
            </p>
          </div>
        </Card>
      </div>

      {/* Real-Time Parking Capacity & Slot Availability */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Four-Wheeler Gauge */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Four-Wheeler Capacity (4W)</h3>
                <p className="text-xs text-slate-500">Cars, SUVs & commercial parking bays</p>
              </div>
            </div>
            <Badge variant={carPercent >= 90 ? 'danger' : 'neutral'}>
              {carPercent}% Full
            </Badge>
          </div>

          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden my-3">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                carPercent >= 90 ? 'bg-red-500' : carPercent >= 70 ? 'bg-amber-500' : 'bg-blue-600'
              }`}
              style={{ width: `${Math.min(100, carPercent)}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
            <div>
              <div className="text-xs text-slate-400">Configured</div>
              <div className="text-lg font-bold text-slate-800">{capacity.carTotal}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Occupied</div>
              <div className="text-lg font-bold text-blue-600">{capacity.carOccupied}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Available</div>
              <div className={`text-lg font-bold ${capacity.carAvailable === 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {capacity.carAvailable}
              </div>
            </div>
          </div>
        </Card>

        {/* Two-Wheeler Gauge */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                <Bike className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Two-Wheeler Capacity (2W)</h3>
                <p className="text-xs text-slate-500">Motorcycles & scooters parking bays</p>
              </div>
            </div>
            <Badge variant={bikePercent >= 90 ? 'danger' : 'neutral'}>
              {bikePercent}% Full
            </Badge>
          </div>

          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden my-3">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                bikePercent >= 90 ? 'bg-red-500' : bikePercent >= 70 ? 'bg-amber-500' : 'bg-purple-600'
              }`}
              style={{ width: `${Math.min(100, bikePercent)}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
            <div>
              <div className="text-xs text-slate-400">Configured</div>
              <div className="text-lg font-bold text-slate-800">{capacity.twoWheelerTotal}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Occupied</div>
              <div className="text-lg font-bold text-purple-600">{capacity.twoWheelerOccupied}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Available</div>
              <div className={`text-lg font-bold ${capacity.twoWheelerAvailable === 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {capacity.twoWheelerAvailable}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Operational Pulse: Current Shift & Live Recent Parking Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Active Shift Status Card */}
        <Card className="p-6 lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Gate Shift Status</h3>
              </div>
              {activeShift ? (
                <Badge variant="success">ACTIVE</Badge>
              ) : (
                <Badge variant="neutral">OFFLINE</Badge>
              )}
            </div>

            {activeShift ? (
              <div className="space-y-3.5">
                <div className="flex items-center gap-3 p-3 bg-brand-50/50 rounded-xl border border-brand-100">
                  <div className="w-10 h-10 rounded-lg bg-brand-600 text-white font-bold flex items-center justify-center text-sm shadow-2xs">
                    {activeShift.guardName.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{activeShift.guardName}</h4>
                    <p className="text-xs text-slate-500 font-mono">{activeShift.guardEmail || 'Staff Attendant'}</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Scheduled Duration:</span>
                    <span className="font-semibold text-slate-800">{activeShift.durationHours} Hours</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Start Time:</span>
                    <span className="font-mono text-slate-800">{formatDateTime(activeShift.startTime)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Expected End:</span>
                    <span className="font-mono text-slate-800">{formatDateTime(activeShift.endTime)}</span>
                  </div>
                  {activeShift.startedBy && (
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-400">Clocked In By:</span>
                      <span className="text-slate-600">{activeShift.startedBy}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400">
                <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">No Active Shift Currently In Session</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                  Assigned guards clock in at the terminal. Visit Shift Management to inspect scheduled shifts.
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Read-only supervision</span>
            <span className="font-mono">8h Fixed Cycle</span>
          </div>
        </Card>

        {/* Right Column: Live Recent Parking Activity */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Latest Parking Records</h3>
            </div>
            <span className="text-xs text-slate-400">Real-time entry & exit stream</span>
          </div>

          {recentRecords.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs">No recent parking activity found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-medium">
                    <th className="pb-2.5">Ticket #</th>
                    <th className="pb-2.5">Vehicle</th>
                    <th className="pb-2.5">Category</th>
                    <th className="pb-2.5">Entry Time</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5 text-right">Advance / Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentRecords.map((r) => {
                    const isTwo = String(r.vehicleType).toLowerCase().includes('two');
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 font-mono font-semibold text-slate-900">
                          #{r.ticketNumber}
                        </td>
                        <td className="py-3 font-mono font-bold text-slate-800">
                          {r.vehicleNumber}
                        </td>
                        <td className="py-3 text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            {isTwo ? <Bike className="w-3.5 h-3.5 text-purple-600" /> : <Car className="w-3.5 h-3.5 text-blue-600" />}
                            {formatVehicleType(r.vehicleType)}
                          </span>
                        </td>
                        <td className="py-3 text-slate-500 font-mono text-[11px]">
                          {formatDateTime(r.entryTime)}
                        </td>
                        <td className="py-3">
                          <Badge variant={r.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right font-mono font-semibold text-slate-900">
                          {r.finalCharge ? formatCurrency(r.finalCharge) : formatCurrency(r.advanceAmount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
