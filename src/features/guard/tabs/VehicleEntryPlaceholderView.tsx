import React from 'react';
import {
  LogIn,
  Car,
  Bike,
  Camera,
  Printer,
  CreditCard,
  Construction,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';

export const VehicleEntryPlaceholderView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Gate Entry (Gate In)</h1>
            <Badge variant="primary">Phase 4B Upcoming</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Vehicle entry ticketing, category detection, advance deposits, and WhatsApp slip sharing.
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
            Live vehicle entry records, Cloudinary camera uploads, and ticket generation are scheduled for <strong>Phase 4B</strong>. This interface confirms navigation shell integration without issuing live parking entries.
          </p>
        </div>
      </div>

      {/* Mock Interactive Entry Form Preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <LogIn className="w-4 h-4 text-emerald-600" />
            Vehicle Details & Normalization
          </h3>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Vehicle Number</label>
            <input
              type="text"
              disabled
              placeholder="e.g. MH 17 BV 8055"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono text-slate-400 cursor-not-allowed uppercase"
            />
            <span className="text-[10px] text-slate-400">Auto-normalizes to MH17BV8055</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Vehicle Category</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/50 flex items-center gap-3 cursor-not-allowed opacity-80">
                <Bike className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="font-bold text-xs text-slate-900">2-Wheeler</div>
                  <div className="text-[10px] text-slate-500">?20 First Hr</div>
                </div>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-3 cursor-not-allowed opacity-60">
                <Car className="w-5 h-5 text-slate-600" />
                <div>
                  <div className="font-bold text-xs text-slate-900">4-Wheeler</div>
                  <div className="text-[10px] text-slate-500">?50 First Hr</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Customer Mobile (Optional)</label>
            <input
              type="tel"
              disabled
              placeholder="10-digit mobile for WhatsApp slip"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-400 cursor-not-allowed"
            />
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-brand-600" />
            Advance Collection & Thermal Slip
          </h3>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Advance Deposit:</span>
              <span className="font-bold text-slate-900">?0 / ?20 / ?50</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Slip Dispatch:</span>
              <span className="text-emerald-700 font-medium">Thermal Print & WhatsApp</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Camera Capture:</span>
              <span className="text-slate-600">Cloudinary Secure Upload</span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-2">
            <button
              disabled
              className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs opacity-60 cursor-not-allowed flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Generate Entry Slip (Phase 4B)
            </button>
            <div className="flex gap-2">
              <button
                disabled
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-400 text-xs font-medium opacity-60 cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                Capture Photo
              </button>
              <button
                disabled
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-400 text-xs font-medium opacity-60 cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                58mm Print
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
