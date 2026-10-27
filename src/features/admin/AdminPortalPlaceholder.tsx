import React from 'react';
import { 
  ShieldCheck, 
  Users, 
  Clock, 
  CreditCard, 
  FileText, 
  CreditCard as PassIcon, 
  Settings, 
  Layers, 
  Construction 
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';

export const AdminPortalPlaceholder: React.FC = () => {
  const adminModules = [
    {
      title: 'Real-time Dashboard',
      description: 'Live 2W/4W slot capacity gauges, active on-duty guards, and daily Cash/UPI revenue counters.',
      icon: <Layers className="w-5 h-5 text-brand-600" />,
      tag: 'Core Hub'
    },
    {
      title: 'Guard Management',
      description: 'Guard profile onboarding, active shift tracking, "Keep With Me" float balances, and deactivation controls.',
      icon: <Users className="w-5 h-5 text-indigo-600" />,
      tag: 'Personnel'
    },
    {
      title: 'Shift Management & Scheduling',
      description: 'Shift durations (8h, 12h, 24h), automated schedule rules, exceptions, and live rotation monitoring.',
      icon: <Clock className="w-5 h-5 text-purple-600" />,
      tag: 'Operations'
    },
    {
      title: 'Payment Ledger & Withdrawals',
      description: 'Immutable financial transactions ledger, cash settlements, and float withdrawal records.',
      icon: <CreditCard className="w-5 h-5 text-emerald-600" />,
      tag: 'Finance'
    },
    {
      title: 'Reports Hub & Analytics',
      description: 'Date-range revenue filters (Today, 7D, 15D, 30D, Custom), shift performance, and CSV exports.',
      icon: <FileText className="w-5 h-5 text-blue-600" />,
      tag: 'Reporting'
    },
    {
      title: 'Monthly Pass Management',
      description: 'Issue, renew, and track long-term passes with vehicle plate binding and historical access logs.',
      icon: <PassIcon className="w-5 h-5 text-amber-600" />,
      tag: 'Subscriptions'
    },
    {
      title: 'System Settings',
      description: 'Hourly rate charts, 12h rate caps, maximum slot capacities, and bilingual business metadata.',
      icon: <Settings className="w-5 h-5 text-slate-600" />,
      tag: 'Configuration'
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-200 mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Portal</h1>
            <Badge variant="primary">Phase 1 Placeholder</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Centralized administration hub for facility operations, revenue audits, and shift oversight.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-xs">
          <ShieldCheck className="w-4 h-4 text-brand-600" />
          <span>Role Guard: vaibhavpawase143@gmail.com</span>
        </div>
      </div>

      {/* Planned Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminModules.map((mod) => (
          <Card key={mod.title} className="hover:border-brand-200 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                {mod.icon}
              </div>
              <Badge variant="neutral">{mod.tag}</Badge>
            </div>
            <h3 className="font-semibold text-slate-900 text-base">{mod.title}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{mod.description}</p>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Construction className="w-3.5 h-3.5" />
                Under Development
              </span>
              <span className="text-[11px] font-mono">Phase 3</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
