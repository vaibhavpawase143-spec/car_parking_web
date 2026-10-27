import React from 'react';
import {
  Car,
  Search,
  Bike,
  Construction,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';

export const ActiveVehiclesPlaceholderView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Active Vehicles Monitor</h1>
            <Badge variant="primary">Phase 4C Upcoming</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time parked vehicle count, capacity tracking, live duration timers, and plate search.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral">
            <Construction className="w-3.5 h-3.5 mr-1" />
            Operational Workflow Placeholder
          </Badge>
        </div>
      </div>

      {/* Safety Safeguard Notice */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 space-y-1">
          <p className="font-semibold">Phase 4A Shell View</p>
          <p className="leading-relaxed">
            Live query of active parking records with elapsed duration counters and search filtering will be implemented in <strong>Phase 4C</strong>.
          </p>
        </div>
      </div>

      {/* Capacity Summary Mock */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-400 uppercase font-semibold">2-Wheeler Capacity</span>
              <p className="text-lg font-bold text-slate-900">-- / 50 Slots</p>
            </div>
          </div>
          <Badge variant="success">Available</Badge>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-400 uppercase font-semibold">4-Wheeler Capacity</span>
              <p className="text-lg font-bold text-slate-900">-- / 50 Slots</p>
            </div>
          </div>
          <Badge variant="primary">Available</Badge>
        </Card>
      </div>

      {/* Search Bar Mock */}
      <Card className="p-4">
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            disabled
            placeholder="Search active parked vehicles by plate number..."
            className="w-full bg-transparent text-xs text-slate-500 cursor-not-allowed outline-none"
          />
        </div>

        <div className="mt-4 p-8 text-center text-slate-400 space-y-2">
          <Car className="w-10 h-10 mx-auto text-slate-300" />
          <p className="text-xs font-medium text-slate-600">Active Parking Grid Preview</p>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
            Real-time Firestore stream of parked vehicles with dynamic hourly rate accumulators will activate in Phase 4C.
          </p>
        </div>
      </Card>
    </div>
  );
};
