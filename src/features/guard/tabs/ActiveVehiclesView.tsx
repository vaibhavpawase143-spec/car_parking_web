import React, { useEffect, useMemo, useState } from 'react';
import {
  Car,
  Bike,
  Search,
  RefreshCw,
  LogOut,
  Clock,
  CreditCard,
  ArrowUpDown,
  X,
  PlusCircle,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { ParkingRecord } from '../../../types';
import {
  formatCurrency,
  formatDateTime,
  formatLiveDuration,
  normalizeVehicleNumber,
} from '../../../utils/formatters';
import { calculateParkingFee } from '../../../utils/feeCalculator';
import { subscribeToActiveParkingRecords, getAvailableCapacity } from '../../../services/parkingService';
import { ActiveVehicleDetailsModal } from '../components/ActiveVehicleDetailsModal';
import { useAuth } from '../../auth/AuthContext';

export type ActiveSortOption =
  | 'newest'
  | 'oldest'
  | 'longest'
  | 'shortest'
  | 'plateAZ'
  | 'plateZA'
  | 'highestFee'
  | 'lowestFee';

interface ActiveVehiclesViewProps {
  onNewEntryTap: () => void;
  onProceedToExit: (ticketNumber?: string) => void;
}

export const ActiveVehiclesView: React.FC<ActiveVehiclesViewProps> = ({
  onNewEntryTap,
  onProceedToExit,
}) => {
  const { activeLocationId, activeLocation } = useAuth();
  const currentFacilityId = activeLocationId || activeLocation?.id || 'loc_sangamner_01';

  // Live Active Records from Firestore
  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorState, setErrorState] = useState<{ isPermission: boolean; message: string } | null>(null);

  // Live Capacity State
  const [capacity2W, setCapacity2W] = useState<number>(50);
  const [capacity4W, setCapacity4W] = useState<number>(50);

  // Local Live Clock (updates every 1s without querying Firestore)
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'twoWheeler' | 'fourWheeler' | 'advanceOnly'>('all');
  const [sortOption, setSortOption] = useState<ActiveSortOption>('newest');

  // Selected Record for Details Modal
  const [selectedRecord, setSelectedRecord] = useState<ParkingRecord | null>(null);

  // 1. Subscribe to Live Firestore Active Records (scoped by location)
  useEffect(() => {
    setIsLoading(true);
    setErrorState(null);

    const unsubscribe = subscribeToActiveParkingRecords(
      (updatedRecords) => {
        setRecords(updatedRecords);
        setIsLoading(false);
        setErrorState(null);
      },
      (err) => {
        console.error('[ActiveVehiclesView] Subscription error:', err);
        const isPermission =
          err.message?.toLowerCase().includes('permission') ||
          err.message?.toLowerCase().includes('insufficient');
        setErrorState({
          isPermission,
          message: isPermission
            ? 'Access restricted: guard session lacks read permissions for active parking records.'
            : err.message || 'Network error streaming active parking records.',
        });
        setIsLoading(false);
      },
      currentFacilityId
    );

    return () => {
      unsubscribe();
    };
  }, [currentFacilityId]);

  // 2. Local 1-second interval for stay duration clock (zero Firestore reads)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  // 3. Load capacity limits (scoped by location)
  const refreshCapacities = async () => {
    try {
      const [c2, c4] = await Promise.all([
        getAvailableCapacity('twoWheeler', currentFacilityId),
        getAvailableCapacity('fourWheeler', currentFacilityId),
      ]);
      setCapacity2W(c2);
      setCapacity4W(c4);
    } catch (e) {
      console.warn('[ActiveVehiclesView] Could not refresh capacity:', e);
    }
  };

  useEffect(() => {
    refreshCapacities();
  }, [records.length, currentFacilityId]);

  // Count active cars & bikes
  const active2WCount = useMemo(
    () => records.filter((r) => r.vehicleType === 'twoWheeler').length,
    [records]
  );
  const active4WCount = useMemo(
    () => records.filter((r) => r.vehicleType === 'fourWheeler').length,
    [records]
  );

  // 4. Filtering & Sorting Logic
  const filteredAndSortedRecords = useMemo(() => {
    let result = [...records];

    // Category filter
    if (categoryFilter === 'twoWheeler') {
      result = result.filter((r) => r.vehicleType === 'twoWheeler');
    } else if (categoryFilter === 'fourWheeler') {
      result = result.filter((r) => r.vehicleType === 'fourWheeler');
    } else if (categoryFilter === 'advanceOnly') {
      result = result.filter((r) => (r.advanceAmount || 0) > 0);
    }

    // Search query: vehicle plate (normalized) or ticket number
    const q = searchQuery.trim();
    if (q) {
      const qNorm = normalizeVehicleNumber(q);
      const qUpper = q.toUpperCase();
      result = result.filter((r) => {
        const plateNorm = normalizeVehicleNumber(r.vehicleNumber);
        const ticketUpper = (r.ticketNumber || '').toUpperCase();
        return (
          (qNorm && plateNorm.includes(qNorm)) ||
          r.vehicleNumber.toUpperCase().includes(qUpper) ||
          ticketUpper.includes(qUpper)
        );
      });
    }

    // Sorting
    const now = currentTime;
    result.sort((a, b) => {
      switch (sortOption) {
        case 'newest':
          return b.entryTime.getTime() - a.entryTime.getTime();
        case 'oldest':
          return a.entryTime.getTime() - b.entryTime.getTime();
        case 'longest':
          return a.entryTime.getTime() - b.entryTime.getTime();
        case 'shortest':
          return b.entryTime.getTime() - a.entryTime.getTime();
        case 'plateAZ':
          return a.vehicleNumber.localeCompare(b.vehicleNumber);
        case 'plateZA':
          return b.vehicleNumber.localeCompare(a.vehicleNumber);
        case 'highestFee': {
          const feeA = calculateParkingFee({ vehicleType: a.vehicleType, entryTime: a.entryTime, exitTime: now, isMonthlyPass: a.isMonthlyPass }).grossCharge;
          const feeB = calculateParkingFee({ vehicleType: b.vehicleType, entryTime: b.entryTime, exitTime: now, isMonthlyPass: b.isMonthlyPass }).grossCharge;
          return feeB - feeA;
        }
        case 'lowestFee': {
          const feeA = calculateParkingFee({ vehicleType: a.vehicleType, entryTime: a.entryTime, exitTime: now, isMonthlyPass: a.isMonthlyPass }).grossCharge;
          const feeB = calculateParkingFee({ vehicleType: b.vehicleType, entryTime: b.entryTime, exitTime: now, isMonthlyPass: b.isMonthlyPass }).grossCharge;
          return feeA - feeB;
        }
        default:
          return b.entryTime.getTime() - a.entryTime.getTime();
      }
    });

    return result;
  }, [records, categoryFilter, searchQuery, sortOption, currentTime]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Active Vehicles Monitor</h1>
            <Badge variant="success">Phase 4D Live</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time live query of active parking records with local 1-second stay timers and search filtering.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshCapacities}
            className="text-xs gap-1.5"
            title="Refresh capacity status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onNewEntryTap}
            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            New Entry
          </Button>
        </div>
      </div>

      {/* 2. Live Capacity Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 2W Capacity Card */}
        <Card className="p-4 flex items-center justify-between border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-400 uppercase font-semibold">2-Wheeler Active</span>
              <p className="text-lg font-bold text-slate-900">
                {active2WCount} <span className="text-xs font-normal text-slate-500">/ {capacity2W + active2WCount} Capacity</span>
              </p>
            </div>
          </div>
          <div>
            {capacity2W <= 0 ? (
              <Badge variant="danger" className="animate-pulse">FULL - BLOCKED</Badge>
            ) : (
              <span className="text-xs font-bold text-emerald-700 font-mono">
                {capacity2W} Available
              </span>
            )}
          </div>
        </Card>

        {/* 4W Capacity Card */}
        <Card className="p-4 flex items-center justify-between border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-400 uppercase font-semibold">4-Wheeler Active</span>
              <p className="text-lg font-bold text-slate-900">
                {active4WCount} <span className="text-xs font-normal text-slate-500">/ {capacity4W + active4WCount} Capacity</span>
              </p>
            </div>
          </div>
          <div>
            {capacity4W <= 0 ? (
              <Badge variant="danger" className="animate-pulse">FULL - BLOCKED</Badge>
            ) : (
              <span className="text-xs font-bold text-blue-700 font-mono">
                {capacity4W} Available
              </span>
            )}
          </div>
        </Card>
      </div>

      {/* 3. Error Banner (if any) */}
      {errorState && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-900 space-y-1">
            <p className="font-bold">{errorState.isPermission ? 'Permission Denied' : 'Network Error'}</p>
            <p className="leading-relaxed">{errorState.message}</p>
          </div>
        </div>
      )}

      {/* 4. Search & Filter Bar */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by vehicle registration plate or ticket #..."
              className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase text-slate-900 placeholder:normal-case placeholder:font-sans focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as ActiveSortOption)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="newest">Newest Entry First</option>
              <option value="oldest">Oldest Entry First</option>
              <option value="longest">Longest Parked</option>
              <option value="shortest">Shortest Parked</option>
              <option value="plateAZ">Plate (A &rarr; Z)</option>
              <option value="plateZA">Plate (Z &rarr; A)</option>
              <option value="highestFee">Highest Current Fee</option>
              <option value="lowestFee">Lowest Current Fee</option>
            </select>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2 pt-1 overflow-x-auto">
          <button
            onClick={() => setCategoryFilter('all')}
            className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-all ' +
              (categoryFilter === 'all'
                ? 'bg-slate-900 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
          >
            All Active ({records.length})
          </button>
          <button
            onClick={() => setCategoryFilter('fourWheeler')}
            className={'px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ' +
              (categoryFilter === 'fourWheeler'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
          >
            <Car className="w-3.5 h-3.5" />
            Cars ({active4WCount})
          </button>
          <button
            onClick={() => setCategoryFilter('twoWheeler')}
            className={'px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ' +
              (categoryFilter === 'twoWheeler'
                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
          >
            <Bike className="w-3.5 h-3.5" />
            Bikes ({active2WCount})
          </button>
          <button
            onClick={() => setCategoryFilter('advanceOnly')}
            className={'px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ' +
              (categoryFilter === 'advanceOnly'
                ? 'bg-amber-600 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
          >
            <CreditCard className="w-3.5 h-3.5" />
            With Advance Only
          </button>
        </div>
      </Card>

      {/* 5. Main Active Vehicles Stream Display */}
      {isLoading ? (
        <Card className="p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-600">Connecting to real-time active parking stream...</p>
        </Card>
      ) : filteredAndSortedRecords.length === 0 ? (
        /* Empty State */
        <Card className="p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Car className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              {searchQuery || categoryFilter !== 'all' ? 'No Matching Vehicles' : 'No Active Vehicles'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery || categoryFilter !== 'all'
                ? 'No parked vehicles match your search filter criteria.'
                : 'There are currently no active parked vehicles in the lot. All parking bays are open.'}
            </p>
          </div>
          {searchQuery || categoryFilter !== 'all' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('all');
              }}
              className="text-xs"
            >
              Clear Filters
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={onNewEntryTap}
              className="text-xs bg-emerald-600 hover:bg-emerald-700"
            >
              Issue Vehicle Entry
            </Button>
          )}
        </Card>
      ) : (
        /* Vehicle Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAndSortedRecords.map((record) => {
            const stayMs = Math.max(0, currentTime.getTime() - record.entryTime.getTime());
            const feeResult = calculateParkingFee({
              vehicleType: record.vehicleType,
              entryTime: record.entryTime,
              exitTime: currentTime,
              advancePaid: record.advanceAmount,
              isMonthlyPass: record.isMonthlyPass,
            });

            const isCar = record.vehicleType === 'fourWheeler';

            return (
              <Card
                key={record.id}
                className="p-4 hover:border-slate-300 transition-all hover:shadow-xs flex flex-col justify-between space-y-3"
              >
                {/* Top Section */}
                <div className="flex items-start gap-3">
                  {/* Thumbnail / Category Icon */}
                  {record.vehiclePhotoUrl ? (
                    <img
                      src={record.vehiclePhotoUrl}
                      alt={record.vehicleNumber}
                      className="w-14 h-14 object-cover rounded-xl border border-slate-200 shrink-0 bg-slate-900"
                    />
                  ) : (
                    <div
                      className={'w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ' +
                        (isCar ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600')}
                    >
                      {isCar ? <Car className="w-6 h-6" /> : <Bike className="w-6 h-6" />}
                    </div>
                  )}

                  {/* Identification & Category */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900 tracking-wider truncate">
                        {normalizeVehicleNumber(record.vehicleNumber)}
                      </span>
                      <span
                        className={'text-[10px] px-2 py-0.5 rounded-md font-bold uppercase shrink-0 ' +
                          (isCar ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800')}
                      >
                        {isCar ? '4W / Car' : '2W / Bike'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span className="font-mono">#{record.ticketNumber}</span>
                      <span>&bull;</span>
                      <span>{record.entryGuardName}</span>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Entry: {formatDateTime(record.entryTime)}
                    </div>
                  </div>
                </div>

                {/* Middle Section: Live Stay Duration & Current Fee */}
                <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
                  {/* Stay Timer */}
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-mono font-bold text-slate-900">
                      {formatLiveDuration(stayMs)}
                    </span>
                  </div>

                  {/* Fee Indicator */}
                  <div className="flex items-center gap-2">
                    {record.isMonthlyPass ? (
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-sm">
                        Monthly Pass
                      </span>
                    ) : (
                      <span className="font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        Fee: {formatCurrency(feeResult.grossCharge)}
                      </span>
                    )}

                    {record.advanceAmount > 0 && (
                      <span className="text-[10px] text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded-sm font-medium">
                        Adv: ₹{record.advanceAmount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedRecord(record)}
                    className="text-xs flex-1 justify-center"
                  >
                    Details & QR
                  </Button>

                  {/* Pure navigation shortcut - no database mutation */}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onProceedToExit(record.ticketNumber)}
                    className="text-xs flex-1 justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Proceed to Exit
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Details & QR Modal */}
      <ActiveVehicleDetailsModal
        isOpen={Boolean(selectedRecord)}
        record={selectedRecord}
        currentTime={currentTime}
        onClose={() => setSelectedRecord(null)}
        onProceedToExit={(ticketNumber) => {
          setSelectedRecord(null);
          onProceedToExit(ticketNumber);
        }}
      />
    </div>
  );
};
