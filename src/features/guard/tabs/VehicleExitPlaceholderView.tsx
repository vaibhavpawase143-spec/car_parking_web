import React from 'react';
import {
  LogOut,
  QrCode,
  IndianRupee,
  Construction,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';

export const VehicleExitPlaceholderView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Gate Exit & Settlement (Gate Out)</h1>
            <Badge variant="primary">Phase 4D Upcoming</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Barcode ticket scan, automated fee settlement, advance credit deduction, and gate release.
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
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 space-y-1">
          <p className="font-semibold">Phase 4A Shell View</p>
          <p className="leading-relaxed">
            Camera QR/barcode scanning, automated exit duration calculation, and payment transactions will be implemented in <strong>Phase 4D</strong>.
          </p>
        </div>
      </div>

      {/* Scanner & Ticket Search Mock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <QrCode className="w-4 h-4 text-brand-600" />
            Ticket Lookup / Scanner
          </h3>

          <div className="aspect-video bg-slate-100 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-slate-400 p-4">
            <QrCode className="w-8 h-8 text-slate-300 mb-2" />
            <span className="text-xs font-medium text-slate-600">Camera QR Scanner Placeholder</span>
            <span className="text-[10px] text-slate-400 mt-1">Will scan 58mm thermal barcode ticket</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Manual Ticket Number or Plate</label>
            <div className="flex gap-2">
              <input
                type="text"
                disabled
                placeholder="e.g. TKT-20261017-001"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-400 cursor-not-allowed"
              />
              <button
                disabled
                className="px-3.5 py-2 bg-slate-200 text-slate-400 rounded-xl text-xs font-medium cursor-not-allowed"
              >
                Find
              </button>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-emerald-600" />
            Settlement Summary Preview
          </h3>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Gross Duration Fee:</span>
              <span className="font-mono text-slate-700">?--</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Advance Credit Applied:</span>
              <span className="font-mono text-emerald-600">-?--</span>
            </div>
            <div className="flex justify-between font-bold text-sm text-slate-900 pt-2 border-t border-slate-200">
              <span>Net Balance Due:</span>
              <span className="font-mono text-brand-700">?--</span>
            </div>
          </div>

          <button
            disabled
            className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-xs opacity-60 cursor-not-allowed flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Confirm Exit & Release Gate (Phase 4D)
          </button>
        </Card>
      </div>
    </div>
  );
};
