import React, { useEffect, useState, useMemo } from 'react';
import {
  Search,
  Users,
  Clock,
  Car,
  FileSpreadsheet,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import {
  GuardCollectionSummary,
  ParkingRecord,
  PaymentTransaction,
  ShiftCollectionSummary,
} from '../../../types';
import {
  subscribeParkingRecords,
  subscribePaymentTransactions,
} from '../../../services/adminService';
import {
  formatCurrency,
  formatDateTime,
  formatDate,
  formatDuration,
  formatVehicleType,
} from '../../../utils/formatters';
import { formatCsv, downloadCsv } from '../../../utils/csvExport';

type PeriodOption = 'today' | '7days' | '15days' | '30days' | 'custom';

export const ReportsHubView: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>('today');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [activeReportTab, setActiveReportTab] = useState<'vehicles' | 'guards' | 'shifts'>('vehicles');

  const [allRecords, setAllRecords] = useState<ParkingRecord[]>([]);
  const [allTxns, setAllTxns] = useState<PaymentTransaction[]>([]);
  const [vehicleSearch, setVehicleSearch] = useState<string>('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('all');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState<string>('all');

  useEffect(() => {
    const unsubRecs = subscribeParkingRecords((data) => setAllRecords(data));
    const unsubTxns = subscribePaymentTransactions((data) => setAllTxns(data));

    return () => {
      unsubRecs();
      unsubTxns();
    };
  }, []);

  // Compute selected date range
  const dateRange = useMemo<{ start: Date; end: Date }>(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (selectedPeriod === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return { start, end };
    }
    if (selectedPeriod === '7days') {
      const start = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    if (selectedPeriod === '15days') {
      const start = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    if (selectedPeriod === '30days') {
      const start = new Date(now.getTime() - 29 * 24 * 3600 * 1000);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    if (selectedPeriod === 'custom' && customStart && customEnd) {
      const start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
      const cEnd = new Date(customEnd);
      cEnd.setHours(23, 59, 59, 999);
      return { start, end: cEnd };
    }

    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return { start, end };
  }, [selectedPeriod, customStart, customEnd]);

  // Filter parking records strictly within range
  const periodRecords = useMemo(() => {
    return allRecords.filter((r) => {
      const entryTime = r.entryTime.getTime();
      const inRange = entryTime >= dateRange.start.getTime() && entryTime <= dateRange.end.getTime();
      const isActiveNow = r.status === 'ACTIVE' && dateRange.end >= new Date();
      return inRange || isActiveNow;
    });
  }, [allRecords, dateRange]);

  // Filter payment transactions within range
  const periodTxns = useMemo(() => {
    return allTxns.filter((t) => {
      const time = t.createdAt.getTime();
      return time >= dateRange.start.getTime() && time <= dateRange.end.getTime();
    });
  }, [allTxns, dateRange]);

  // Financial aggregates
  let cashSum = 0;
  let upiSum = 0;
  periodTxns.forEach((t) => {
    const isUpi = t.paymentMethod === 'upi';
    if (t.paymentType === 'REFUND') {
      if (isUpi) upiSum -= t.amount;
      else cashSum -= t.amount;
    } else {
      if (isUpi) upiSum += t.amount;
      else cashSum += t.amount;
    }
  });
  const netCash = Math.max(0, cashSum);
  const netUpi = Math.max(0, upiSum);
  const netRevenue = netCash + netUpi;

  // Entries & Exits count
  const entriesCount = periodRecords.filter((r) => r.entryTime >= dateRange.start && r.entryTime <= dateRange.end).length;
  const exitsCount = periodRecords.filter((r) => r.exitTime && r.exitTime >= dateRange.start && r.exitTime <= dateRange.end).length;
  const currentlyParkedCount = allRecords.filter((r) => r.status === 'ACTIVE').length;

  // Filtered vehicle records for table
  const filteredVehicles = useMemo(() => {
    return periodRecords.filter((r) => {
      const term = vehicleSearch.toLowerCase();
      const matchesSearch =
        r.vehicleNumber.toLowerCase().includes(term) ||
        r.ticketNumber.toLowerCase().includes(term) ||
        r.entryGuardName.toLowerCase().includes(term);

      const matchesType =
        vehicleTypeFilter === 'all' ||
        (vehicleTypeFilter === 'two' && String(r.vehicleType).toLowerCase().includes('two')) ||
        (vehicleTypeFilter === 'four' && !String(r.vehicleType).toLowerCase().includes('two'));

      const matchesStatus =
        vehicleStatusFilter === 'all' ||
        r.status.toLowerCase() === vehicleStatusFilter.toLowerCase();

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [periodRecords, vehicleSearch, vehicleTypeFilter, vehicleStatusFilter]);

  // Guard-wise Aggregation
  const guardSummaries = useMemo<GuardCollectionSummary[]>(() => {
    const map = new Map<string, PaymentTransaction[]>();
    periodTxns.forEach((t) => {
      const key = t.guardUid || t.guardName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });

    const list: GuardCollectionSummary[] = [];
    map.forEach((txns, key) => {
      const guardName = txns[0]?.guardName || key;
      let cash = 0;
      let upi = 0;
      let advance = 0;
      let final = 0;
      let refund = 0;

      txns.forEach((t) => {
        if (t.paymentType === 'ADVANCE') advance += t.amount;
        else if (t.paymentType === 'FINAL') final += t.amount;
        else if (t.paymentType === 'REFUND') refund += t.amount;

        if (t.paymentType === 'REFUND') {
          if (t.paymentMethod === 'upi') upi -= t.amount;
          else cash -= t.amount;
        } else {
          if (t.paymentMethod === 'upi') upi += t.amount;
          else cash += t.amount;
        }
      });

      const nCash = Math.max(0, cash);
      const nUpi = Math.max(0, upi);
      list.push({
        guardUid: key,
        guardName,
        totalCash: nCash,
        totalUpi: nUpi,
        netTotal: nCash + nUpi,
        transactionCount: txns.length,
        advanceTotal: advance,
        finalTotal: final,
        refundTotal: refund,
      });
    });

    list.sort((a, b) => b.netTotal - a.netTotal);
    return list;
  }, [periodTxns]);

  // Shift-wise Aggregation
  const shiftSummaries = useMemo<ShiftCollectionSummary[]>(() => {
    const map = new Map<string, PaymentTransaction[]>();
    periodTxns.forEach((t) => {
      const key = t.shift || 'Unassigned Shift';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });

    const list: ShiftCollectionSummary[] = [];
    map.forEach((txns, shiftName) => {
      const guardName = txns[0]?.guardName || 'Staff';
      const firstDate = txns[0]?.createdAt || new Date();
      let cash = 0;
      let upi = 0;

      txns.forEach((t) => {
        if (t.paymentType === 'REFUND') {
          if (t.paymentMethod === 'upi') upi -= t.amount;
          else cash -= t.amount;
        } else {
          if (t.paymentMethod === 'upi') upi += t.amount;
          else cash += t.amount;
        }
      });

      const nCash = Math.max(0, cash);
      const nUpi = Math.max(0, upi);
      list.push({
        shiftName,
        guardName,
        shiftDate: firstDate,
        startTime: firstDate,
        endTime: new Date(firstDate.getTime() + 8 * 3600 * 1000),
        totalCash: nCash,
        totalUpi: nUpi,
        netTotal: nCash + nUpi,
        transactionCount: txns.length,
      });
    });

    list.sort((a, b) => b.netTotal - a.netTotal);
    return list;
  }, [periodTxns]);

  // CSV Export Handler
  const handleExportCsv = () => {
    if (activeReportTab === 'vehicles') {
      const headers = [
        'Ticket #',
        'Vehicle Number',
        'Category',
        'Entry Time',
        'Exit Time',
        'Duration',
        'Status',
        'Advance Paid',
        'Final Fee',
        'Entry Staff',
        'Exit Staff',
      ];
      const rows = filteredVehicles.map((r) => {
        const duration = r.exitTime
          ? formatDuration(r.exitTime.getTime() - r.entryTime.getTime())
          : formatDuration(Date.now() - r.entryTime.getTime());
        return [
          r.ticketNumber,
          r.vehicleNumber,
          formatVehicleType(r.vehicleType),
          formatDateTime(r.entryTime),
          r.exitTime ? formatDateTime(r.exitTime) : '-',
          duration,
          r.status,
          r.advanceAmount,
          r.finalCharge || 0,
          r.entryGuardName,
          r.exitGuardName || '-',
        ];
      });

      const csv = formatCsv(headers, rows);
      downloadCsv(`Parking_Vehicles_Report_${selectedPeriod}_${formatDate(dateRange.start)}.csv`, csv);
    } else if (activeReportTab === 'guards') {
      const headers = ['Staff Name', 'Staff UID', 'Transactions', 'Cash (INR)', 'UPI (INR)', 'Net Total (INR)'];
      const rows = guardSummaries.map((g) => [
        g.guardName,
        g.guardUid,
        g.transactionCount,
        g.totalCash,
        g.totalUpi,
        g.netTotal,
      ]);
      const csv = formatCsv(headers, rows);
      downloadCsv(`Guard_Collection_Report_${selectedPeriod}.csv`, csv);
    } else if (activeReportTab === 'shifts') {
      const headers = ['Shift Name', 'Staff Name', 'Transactions', 'Cash (INR)', 'UPI (INR)', 'Net Total (INR)'];
      const rows = shiftSummaries.map((s) => [
        s.shiftName,
        s.guardName,
        s.transactionCount,
        s.totalCash,
        s.totalUpi,
        s.netTotal,
      ]);
      const csv = formatCsv(headers, rows);
      downloadCsv(`Shift_Collection_Report_${selectedPeriod}.csv`, csv);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Audit & Analytics Hub</h1>
            <Badge variant="primary" className="font-mono text-[11px]">RFC-4180 CSV READY</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Reconcile parking activity, financial collections, and staff duty periods with Excel-ready export.
          </p>
        </div>

        {/* Period Selector Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { key: 'today', label: 'Today' },
              { key: '7days', label: 'Last 7 Days' },
              { key: '15days', label: 'Last 15 Days' },
              { key: '30days', label: 'Last 30 Days' },
              { key: 'custom', label: 'Custom Range' },
            ] as const
          ).map((p) => (
            <button
              key={p.key}
              onClick={() => setSelectedPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedPeriod === p.key
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {selectedPeriod === 'custom' && (
        <Card className="p-4 bg-slate-50 border-slate-200 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Start Date:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">End Date:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800"
            />
          </div>
          <span className="text-xs text-slate-400">
            Filtered: {formatDate(dateRange.start)} – {formatDate(dateRange.end)}
          </span>
        </Card>
      )}

      {/* Selected Period Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200">
          <span className="text-[11px] font-semibold uppercase text-slate-500 block">Period Total Revenue</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block font-mono">{formatCurrency(netRevenue)}</span>
          <div className="flex justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>Cash: <strong className="text-emerald-700">{formatCurrency(netCash)}</strong></span>
            <span>UPI: <strong className="text-blue-700">{formatCurrency(netUpi)}</strong></span>
          </div>
        </Card>

        <Card className="p-4 border-slate-200">
          <span className="text-[11px] font-semibold uppercase text-slate-500 block">Period Inflow (Entries)</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">{entriesCount}</span>
          <p className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
            Ticketing slips generated
          </p>
        </Card>

        <Card className="p-4 border-slate-200">
          <span className="text-[11px] font-semibold uppercase text-slate-500 block">Period Outflow (Exits)</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">{exitsCount}</span>
          <p className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
            Settled departures
          </p>
        </Card>

        <Card className="p-4 border-slate-200">
          <span className="text-[11px] font-semibold uppercase text-slate-500 block">Currently Parked</span>
          <span className="text-2xl font-bold text-blue-600 mt-1 block">{currentlyParkedCount}</span>
          <p className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
            Live occupied slots right now
          </p>
        </Card>
      </div>

      {/* Report Sub-Tabs & Export CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 gap-4 pb-2">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveReportTab('vehicles')}
            className={`pb-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeReportTab === 'vehicles'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>Vehicle Parking Records</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
              {filteredVehicles.length}
            </span>
          </button>

          <button
            onClick={() => setActiveReportTab('guards')}
            className={`pb-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeReportTab === 'guards'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Staff / Guard Performance</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
              {guardSummaries.length}
            </span>
          </button>

          <button
            onClick={() => setActiveReportTab('shifts')}
            className={`pb-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeReportTab === 'shifts'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Shift Reconciliations</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
              {shiftSummaries.length}
            </span>
          </button>
        </div>

        {/* CSV Export Action Button */}
        <Button
          variant="primary"
          size="sm"
          onClick={handleExportCsv}
          icon={<FileSpreadsheet className="w-4 h-4" />}
        >
          Export CSV (Excel UTF-8)
        </Button>
      </div>

      {/* Subtab 1: Vehicle Records Table */}
      {activeReportTab === 'vehicles' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search ticket #, vehicle number, or staff..."
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-500 shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <select
                value={vehicleTypeFilter}
                onChange={(e) => setVehicleTypeFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 shadow-2xs focus:outline-hidden"
              >
                <option value="all">All Vehicle Types</option>
                <option value="four">Four-Wheelers (4W)</option>
                <option value="two">Two-Wheelers (2W)</option>
              </select>

              <select
                value={vehicleStatusFilter}
                onChange={(e) => setVehicleStatusFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 shadow-2xs focus:outline-hidden"
              >
                <option value="all">All Statuses</option>
                <option value="active">Currently Parked</option>
                <option value="exited">Exited</option>
              </select>
            </div>
          </div>

          {filteredVehicles.length === 0 ? (
            <Card className="p-12 text-center text-slate-400">
              <Car className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No Vehicle Records In Range</p>
              <p className="text-xs text-slate-400 mt-1">Try selecting a wider date range or clearing filters.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0 border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                    <tr>
                      <th className="py-3 px-4">Ticket</th>
                      <th className="py-3 px-4">Vehicle Number</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Entry Timestamp</th>
                      <th className="py-3 px-4">Exit Timestamp</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Fee / Advance</th>
                      <th className="py-3 px-4">Attendant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVehicles.map((r) => {
                      const duration = r.exitTime
                        ? formatDuration(r.exitTime.getTime() - r.entryTime.getTime())
                        : formatDuration(Date.now() - r.entryTime.getTime());
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                            #{r.ticketNumber}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {r.vehicleNumber}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {formatVehicleType(r.vehicleType)}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                            {formatDateTime(r.entryTime)}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                            {r.exitTime ? formatDateTime(r.exitTime) : '-'}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-700">
                            {duration}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={r.status === 'ACTIVE' ? 'success' : 'neutral'}>
                              {r.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {r.finalCharge ? formatCurrency(r.finalCharge) : formatCurrency(r.advanceAmount)}
                          </td>
                          <td className="py-3 px-4 text-slate-600 text-[11px]">
                            <div>In: {r.entryGuardName}</div>
                            {r.exitGuardName && <div>Out: {r.exitGuardName}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Subtab 2: Guard-wise Summary Table */}
      {activeReportTab === 'guards' && (
        <Card className="overflow-hidden p-0 border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <tr>
                  <th className="py-3 px-4">Staff Name</th>
                  <th className="py-3 px-4">Staff Identifier</th>
                  <th className="py-3 px-4 text-center">Transactions</th>
                  <th className="py-3 px-4 text-right">Cash Collected</th>
                  <th className="py-3 px-4 text-right">UPI Collected</th>
                  <th className="py-3 px-4 text-right">Net Responsibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {guardSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No collections recorded by staff in selected period.
                    </td>
                  </tr>
                ) : (
                  guardSummaries.map((g) => (
                    <tr key={g.guardUid} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{g.guardName}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{g.guardUid}</td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">{g.transactionCount}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-800 font-medium">
                        {formatCurrency(g.totalCash)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-blue-800 font-medium">
                        {formatCurrency(g.totalUpi)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(g.netTotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Subtab 3: Shift-wise Summary Table */}
      {activeReportTab === 'shifts' && (
        <Card className="overflow-hidden p-0 border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <tr>
                  <th className="py-3 px-4">Shift Name</th>
                  <th className="py-3 px-4">Attendant</th>
                  <th className="py-3 px-4 text-center">Transactions</th>
                  <th className="py-3 px-4 text-right">Cash (INR)</th>
                  <th className="py-3 px-4 text-right">UPI (INR)</th>
                  <th className="py-3 px-4 text-right">Shift Net Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shiftSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No shifts recorded transactions in selected period.
                    </td>
                  </tr>
                ) : (
                  shiftSummaries.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{s.shiftName}</td>
                      <td className="py-3 px-4 font-medium text-slate-700">{s.guardName}</td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">{s.transactionCount}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-800 font-medium">
                        {formatCurrency(s.totalCash)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-blue-800 font-medium">
                        {formatCurrency(s.totalUpi)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(s.netTotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
