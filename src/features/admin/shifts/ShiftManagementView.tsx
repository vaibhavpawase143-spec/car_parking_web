import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Search,
  Lock,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import { ShiftModel } from '../../../types';
import { subscribeShifts } from '../../../services/adminService';
import { formatDate, formatTime, formatDuration } from '../../../utils/formatters';

export const ShiftManagementView: React.FC = () => {
  const [shifts, setShifts] = useState<ShiftModel[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    const unsub = subscribeShifts((data) => {
      setShifts(data);
    });

    return () => unsub();
  }, []);

  const filteredShifts = shifts.filter((s) => {
    const matchesStatus = filterStatus === 'all' || s.status.toLowerCase() === filterStatus.toLowerCase();
    const matchesSearch =
      s.guardName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.guardEmail && s.guardEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
      s.shiftId.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const activeCount = shifts.filter((s) => s.status === 'ACTIVE').length;
  const assignedCount = shifts.filter((s) => s.status === 'ASSIGNED').length;
  const completedCount = shifts.filter((s) => s.status === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Shift Lifecycle & Rostering</h1>
            <Badge variant="neutral">{shifts.length} Total Logs</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Admin scheduled 8-hour gate shifts, active duty sessions, and completed handovers.
          </p>
        </div>

        {/* Read-Only Notice */}
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg shadow-2xs font-medium">
          <Lock className="w-3.5 h-3.5 text-amber-600" />
          <span>Read-Only Audit Mode: Shift assignment disabled</span>
        </div>
      </div>

      {/* KPI Shift Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200">
          <span className="text-xs font-semibold uppercase text-slate-500 block">Total Shift Cycles</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">{shifts.length}</span>
        </Card>
        <Card className="p-4 border-emerald-200 bg-emerald-50/30">
          <span className="text-xs font-semibold uppercase text-emerald-700 block">Currently Active</span>
          <span className="text-2xl font-bold text-emerald-900 mt-1 block">{activeCount}</span>
        </Card>
        <Card className="p-4 border-blue-200 bg-blue-50/30">
          <span className="text-xs font-semibold uppercase text-blue-700 block">Upcoming Assigned</span>
          <span className="text-2xl font-bold text-blue-900 mt-1 block">{assignedCount}</span>
        </Card>
        <Card className="p-4 border-slate-200">
          <span className="text-xs font-semibold uppercase text-slate-500 block">Completed</span>
          <span className="text-2xl font-bold text-slate-800 mt-1 block">{completedCount}</span>
        </Card>
      </div>

      {/* Search & Status Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by guard name, email, or shift ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-2xs"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {['all', 'active', 'assigned', 'completed', 'cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                filterStatus === st
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Shifts Table */}
      {filteredShifts.length === 0 ? (
        <Card className="p-12 text-center text-slate-400">
          <Calendar className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">No Shift Records Found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting the status filter or search query.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0 border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <tr>
                  <th className="py-3 px-4">Guard Details</th>
                  <th className="py-3 px-4">Shift Date</th>
                  <th className="py-3 px-4">Scheduled Window</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Actual Duty Window</th>
                  <th className="py-3 px-4">Audit / Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredShifts.map((s) => {
                  let badgeVariant: 'success' | 'primary' | 'neutral' | 'danger' = 'neutral';
                  if (s.status === 'ACTIVE') badgeVariant = 'success';
                  else if (s.status === 'ASSIGNED') badgeVariant = 'primary';
                  else if (s.status === 'CANCELLED') badgeVariant = 'danger';

                  const actualDuration =
                    s.actualStartTime && s.actualEndTime
                      ? formatDuration(s.actualEndTime.getTime() - s.actualStartTime.getTime())
                      : s.actualStartTime
                      ? formatDuration(Date.now() - s.actualStartTime.getTime())
                      : null;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{s.guardName}</div>
                        <div className="font-mono text-[11px] text-slate-400">{s.guardEmail || s.guardId}</div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {formatDate(s.shiftDate)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                        {formatTime(s.startTime)} – {formatTime(s.endTime)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {s.durationHours} Hours
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant={badgeVariant}>{s.status}</Badge>
                      </td>
                      <td className="py-3.5 px-4 text-[11px]">
                        {s.actualStartTime ? (
                          <div className="space-y-0.5">
                            <div className="text-slate-800 font-mono">
                              In: {formatTime(s.actualStartTime)}
                              {s.actualEndTime && ` • Out: ${formatTime(s.actualEndTime)}`}
                            </div>
                            {actualDuration && (
                              <div className="text-emerald-700 font-medium">
                                Elapsed: {actualDuration}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not clocked in</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[11px] text-slate-500">
                        {s.cancellationReason ? (
                          <span className="text-red-600 font-medium">{s.cancellationReason}</span>
                        ) : s.startedBy ? (
                          <span>Started: {s.startedBy}</span>
                        ) : (
                          <span className="font-mono text-[10px] text-slate-400">ID: {s.shiftId.slice(0, 8)}...</span>
                        )}
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
  );
};
