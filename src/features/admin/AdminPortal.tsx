import React, { useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  Clock,
  IndianRupee,
  BarChart3,
  CreditCard,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { AdminDashboardView } from './dashboard/AdminDashboardView';
import { OwnerDashboardView } from '../owner/OwnerDashboardView';
import { GuardManagementView } from './guards/GuardManagementView';
import { ShiftManagementView } from './shifts/ShiftManagementView';
import { PaymentManagementView } from './payments/PaymentManagementView';
import { ReportsHubView } from './reports/ReportsHubView';
import { MonthlyPassManagementView } from './passes/MonthlyPassManagementView';

export type AdminTab = 'dashboard' | 'locations' | 'guards' | 'shifts' | 'payments' | 'reports' | 'passes';

export const AdminPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const { guardProfile } = useAuth();

  const navItems = [
    { id: 'dashboard' as AdminTab, label: 'Dashboard', icon: LayoutDashboard, tag: 'Live' },
    { id: 'locations' as AdminTab, label: 'Owner Locations', icon: Building2, tag: 'Sites' },
    { id: 'guards' as AdminTab, label: 'Guard Management', icon: Users, tag: 'Float' },
    { id: 'shifts' as AdminTab, label: 'Shift Management', icon: Clock, tag: '8h' },
    { id: 'payments' as AdminTab, label: 'Payments & Ledger', icon: IndianRupee, tag: 'Audit' },
    { id: 'reports' as AdminTab, label: 'Reports & Export', icon: BarChart3, tag: 'CSV' },
    { id: 'passes' as AdminTab, label: 'Monthly Passes', icon: CreditCard, tag: '₹600' },
  ];

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <AdminDashboardView />;
      case 'locations':
        return <OwnerDashboardView />;
      case 'guards':
        return <GuardManagementView />;
      case 'shifts':
        return <ShiftManagementView />;
      case 'payments':
        return <PaymentManagementView />;
      case 'reports':
        return <ReportsHubView />;
      case 'passes':
        return <MonthlyPassManagementView />;
      default:
        return <AdminDashboardView />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Read-Only Governance Alert Banner */}
      <div className="mb-6 bg-slate-900 text-white rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white">Phase 3 Functional Admin Portal</span>
              <span className="bg-brand-500/20 text-brand-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-brand-500/30">
                READ-ONLY AUDIT
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Live read-only observation connected to <code className="text-brand-300 font-mono">car-parking-system-2026</code>. Mutation safeguards active.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto text-xs font-mono text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Admin: {guardProfile?.name || 'Administrator'}</span>
        </div>
      </div>

      {/* Main Admin Portal Grid: Sidebar + View Container */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Navigation Sidebar */}
        <aside className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-3 shadow-xs space-y-1">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Admin Modules
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 font-bold border border-brand-100 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                      isActive
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {item.tag}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="pt-3 mt-3 border-t border-slate-100 px-3">
            <div className="text-[11px] text-slate-400 font-mono">
              Jay Ganesh Pay & Park
            </div>
            <div className="text-[10px] text-slate-400">
              Sangamner Bus Stand
            </div>
          </div>
        </aside>

        {/* Dynamic View Container */}
        <main className="lg:col-span-4 min-h-[600px]">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
};

export default AdminPortal;
