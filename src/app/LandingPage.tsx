import React from 'react';
import { 
  ShieldCheck, 
  UserCheck, 
  Database, 
  ArrowRight, 
  CheckCircle2, 
  Smartphone, 
  Monitor 
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';

interface LandingPageProps {
  onNavigate: (tab: string) => void;
  isFirebaseConfigured: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  isFirebaseConfigured,
}) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-2xl text-white p-8 sm:p-12 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <Badge variant="primary" className="bg-brand-500/20 text-brand-200 border-brand-400/30 mb-4">
            Phase 1 • Web Foundation Ready
          </Badge>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            BIZFLOW <span className="text-brand-400">CAR PARKING</span> SYSTEM
          </h1>
          <p className="text-sm font-semibold text-slate-300 uppercase tracking-widest mt-2">
            Jay Ganesh Pay & Park
          </p>
          <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
            Dedicated desktop and web terminal application built with React, Vite, and TypeScript.
            Safely shares the authoritative Firebase backend and Firestore data concurrently with the existing Flutter mobile application.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={() => onNavigate('admin')}
              icon={<ShieldCheck className="w-5 h-5" />}
            >
              Explore Admin Portal
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => onNavigate('guard')}
              className="bg-white/10 text-white border-white/20 hover:bg-white/20"
              icon={<UserCheck className="w-5 h-5" />}
            >
              Explore Guard Terminal
            </Button>
          </div>
        </div>

        {/* Background decorative grid */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none hidden lg:block">
          <div className="h-full w-full bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
        </div>
      </div>

      {/* Architecture Separation & Safety Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-l-brand-600">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">New Web Application</h3>
              <p className="text-[11px] text-slate-500">React + Vite + TypeScript</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Optimized for counter desktop workstations, laptops, and wide screens with high-density data tables and browser-based 58 mm printing.
          </p>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-brand-700 font-medium">
            <span>Path: D:\car_parking_web</span>
            <Badge variant="primary">Active</Badge>
          </div>
        </Card>

        <Card className="border-l-4 border-l-emerald-600">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Original Mobile App</h3>
              <p className="text-[11px] text-slate-500">Flutter + Dart (Handhelds)</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Remains 100% untouched and preserved. Tailored for handheld Android gate operators with direct Classic Bluetooth thermal printing.
          </p>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-700 font-medium">
            <span>Path: D:\car_parking_system</span>
            <Badge variant="success">Protected</Badge>
          </div>
        </Card>

        <Card className="border-l-4 border-l-purple-600">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Shared Cloud Backend</h3>
              <p className="text-[11px] text-slate-500">Firebase Cloud Firestore</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Both applications read and write concurrently to project <code className="font-mono text-purple-700 font-semibold">car-parking-system-2026</code> with atomic transactions.
          </p>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-purple-700 font-medium">
            <span>Server: auto_shift_daemon.py</span>
            <Badge variant="neutral">Authoritative</Badge>
          </div>
        </Card>
      </div>

      {/* Implementation Status Checklist */}
      <Card title="Phase 1 Foundation Checklist" subtitle="Verified deliverables in the current phase">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-slate-800">Isolated Project Path</p>
              <p className="text-slate-500 text-[11px]">D:\car_parking_web initialized without touching Flutter app.</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-slate-800">TypeScript & Tailwind CSS</p>
              <p className="text-slate-500 text-[11px]">Strict typechecking enabled with utility-first modern design.</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-slate-800">Firebase Web SDK Prepared</p>
              <p className="text-slate-500 text-[11px]">Safe env config template with zero hardcoded secret keys.</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-slate-800">Domain Types & Schemas</p>
              <p className="text-slate-500 text-[11px]">Full TypeScript interfaces mirroring Dart models.</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-slate-800">Portal Separation</p>
              <p className="text-slate-500 text-[11px]">Clean separation between Auth, Admin, and Guard modules.</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-slate-800">58mm Thermal Prep</p>
              <p className="text-slate-500 text-[11px]">Dedicated template location reserved for future @media print.</p>
            </div>
          </div>
        </div>

        {/* Environment configuration note */}
        <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-semibold text-slate-800">Firebase Web Credentials Status: </span>
            <span className={isFirebaseConfigured ? 'text-emerald-700 font-medium' : 'text-slate-600'}>
              {isFirebaseConfigured ? 'Active (Connected)' : '.env.example template ready for user configuration'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('auth')}
            icon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            Go to Authentication
          </Button>
        </div>
      </Card>
    </div>
  );
};
