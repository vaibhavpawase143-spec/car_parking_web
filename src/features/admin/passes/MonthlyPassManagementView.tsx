import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  Search,
  Lock,
  Car,
  Bike,
  Eye,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { MonthlyPass, ParkingRecord } from '../../../types';
import { subscribeMonthlyPasses, subscribeParkingRecords } from '../../../services/adminService';
import { formatCurrency, formatDate, formatDateTime, formatVehicleType } from '../../../utils/formatters';

export const MonthlyPassManagementView: React.FC = () => {
  const [passes, setPasses] = useState<MonthlyPass[]>([]);
  const [allRecords, setAllRecords] = useState<ParkingRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPass, setSelectedPass] = useState<MonthlyPass | null>(null);

  useEffect(() => {
    const unsubPasses = subscribeMonthlyPasses((data) => {
      setPasses(data);
    });
    const unsubRecs = subscribeParkingRecords((data) => {
      setAllRecords(data);
    });

    return () => {
      unsubPasses();
      unsubRecs();
    };
  }, []);

  const filteredPasses = passes.filter((p) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      p.passNumber.toLowerCase().includes(term) ||
      p.vehicleNumber.toLowerCase().includes(term) ||
      p.customerName.toLowerCase().includes(term) ||
      p.customerMobile.includes(term);

    let matchesStatus = true;
    if (statusFilter === 'active') {
      matchesStatus = p.dynamicStatus === 'ACTIVE';
    } else if (statusFilter === 'expiring_soon') {
      matchesStatus = p.isExpiringSoon;
    } else if (statusFilter === 'expired') {
      matchesStatus = p.dynamicStatus === 'EXPIRED';
    } else if (statusFilter === 'upcoming') {
      matchesStatus = p.dynamicStatus === 'UPCOMING';
    } else if (statusFilter === 'cancelled') {
      matchesStatus = p.dynamicStatus === 'CANCELLED';
    }

    return matchesSearch && matchesStatus;
  });

  const activePassesCount = passes.filter((p) => p.dynamicStatus === 'ACTIVE').length;
  const expiringSoonCount = passes.filter((p) => p.isExpiringSoon).length;
  const expiredPassesCount = passes.filter((p) => p.dynamicStatus === 'EXPIRED').length;
  const totalPassRevenue = passes.reduce((sum, p) => sum + p.amountPaid, 0);

  // Historical parking entries under this pass
  const passUsageRecords = selectedPass
    ? allRecords.filter(
        (r) =>
          r.isMonthlyPass ||
          r.monthlyPassId === selectedPass.id ||
          r.normalizedVehicleNumber === selectedPass.normalizedVehicleNumber
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Monthly Passes (Subscription Registry)</h1>
            <Badge variant="neutral">{passes.length} Registered Passes</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Standard ₹600 monthly parking passes, active subscription validity, and historical vehicle entries.
          </p>
        </div>

        {/* Read-Only Notice */}
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg shadow-2xs font-medium">
          <Lock className="w-3.5 h-3.5 text-amber-600" />
          <span>Read-Only Audit Mode: Pass issuance & renewal disabled</span>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-4 border-emerald-200 bg-emerald-50/30">
          <span className="text-xs font-semibold uppercase text-emerald-700 block">Active Passes</span>
          <span className="text-2xl font-bold text-emerald-900 mt-1 block">{activePassesCount}</span>
        </Card>

        <Card className="p-4 border-amber-200 bg-amber-50/30">
          <span className="text-xs font-semibold uppercase text-amber-700 block">Expiring Soon (≤ 7 Days)</span>
          <span className="text-2xl font-bold text-amber-900 mt-1 block">{expiringSoonCount}</span>
        </Card>

        <Card className="p-4 border-slate-200">
          <span className="text-xs font-semibold uppercase text-slate-500 block">Expired Passes</span>
          <span className="text-2xl font-bold text-slate-800 mt-1 block">{expiredPassesCount}</span>
        </Card>

        <Card className="p-4 border-brand-200 bg-brand-50/30">
          <span className="text-xs font-semibold uppercase text-brand-700 block">Total Pass Collections</span>
          <span className="text-2xl font-bold text-brand-900 mt-1 block font-mono">
            {formatCurrency(totalPassRevenue)}
          </span>
        </Card>
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by pass #, vehicle number, customer name, mobile..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-500 shadow-2xs"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { key: 'all', label: 'All Passes' },
            { key: 'active', label: 'Active' },
            { key: 'expiring_soon', label: 'Expiring Soon' },
            { key: 'expired', label: 'Expired' },
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'cancelled', label: 'Cancelled' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setStatusFilter(item.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === item.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Passes Table */}
      {filteredPasses.length === 0 ? (
        <Card className="p-12 text-center text-slate-400">
          <CreditCard className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">No Monthly Passes Found</p>
          <p className="text-xs text-slate-400 mt-1">Try clearing your search query or selecting a different status.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0 border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <tr>
                  <th className="py-3 px-4">Pass Number</th>
                  <th className="py-3 px-4">Vehicle Details</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Validity Period</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Fee & Method</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPasses.map((p) => {
                  let badgeVariant: 'success' | 'danger' | 'neutral' | 'primary' = 'neutral';
                  if (p.dynamicStatus === 'ACTIVE') badgeVariant = 'success';
                  else if (p.dynamicStatus === 'EXPIRED') badgeVariant = 'danger';
                  else if (p.dynamicStatus === 'UPCOMING') badgeVariant = 'primary';

                  const isTwo = String(p.vehicleType).toLowerCase().includes('two');

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-slate-900">{p.passNumber}</div>
                        <div className="text-[10px] text-slate-400">Issued by {p.createdBy}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-slate-900">{p.vehicleNumber}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          {isTwo ? <Bike className="w-3 h-3 text-purple-600" /> : <Car className="w-3 h-3 text-blue-600" />}
                          {formatVehicleType(p.vehicleType)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{p.customerName}</div>
                        <div className="font-mono text-[11px] text-slate-400">{p.customerMobile || '-'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-700">
                        <div>From: {formatDate(p.startDate)}</div>
                        <div>To: {formatDate(p.endDate)}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={badgeVariant}>{p.dynamicStatus}</Badge>
                          {p.isExpiringSoon && (
                            <Badge variant="danger" className="text-[10px]">Expiring Soon</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono font-bold text-slate-900">{formatCurrency(p.amountPaid)}</div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">{p.paymentMethod} • {p.paymentStatus}</div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedPass(p)}
                          icon={<Eye className="w-3.5 h-3.5" />}
                        >
                          Usage
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Historical Pass Usage Modal */}
      {selectedPass && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedPass.passNumber} — Usage History
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {selectedPass.vehicleNumber} • {selectedPass.customerName} ({selectedPass.customerMobile})
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedPass(null)}
              >
                Close
              </Button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Validity Window</span>
                  <span className="font-semibold text-slate-800">
                    {formatDate(selectedPass.startDate)} – {formatDate(selectedPass.endDate)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Category</span>
                  <span className="font-semibold text-slate-800">{formatVehicleType(selectedPass.vehicleType)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Payment Settlement</span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    {formatCurrency(selectedPass.amountPaid)} ({selectedPass.paymentMethod.toUpperCase()})
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                  Recorded Gate Passes Under This Vehicle ({passUsageRecords.length})
                </h4>

                {passUsageRecords.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    No individual gate ticketing records found for this vehicle.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                        <tr>
                          <th className="py-2.5 px-3">Ticket #</th>
                          <th className="py-2.5 px-3">Entry Time</th>
                          <th className="py-2.5 px-3">Exit Time</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Attendant</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {passUsageRecords.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                              #{r.ticketNumber}
                            </td>
                            <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">
                              {formatDateTime(r.entryTime)}
                            </td>
                            <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">
                              {r.exitTime ? formatDateTime(r.exitTime) : 'Still Parked'}
                            </td>
                            <td className="py-2 px-3">
                              <Badge variant={r.status === 'ACTIVE' ? 'success' : 'neutral'}>
                                {r.status}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {r.entryGuardName}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
