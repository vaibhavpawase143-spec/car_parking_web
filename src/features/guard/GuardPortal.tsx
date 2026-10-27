import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  LogIn,
  Car,
  LogOut,
  Clock,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { GuardTab, HandoverModel, ShiftModel } from '../../types';
import { subscribeToPendingHandovers, subscribeToGuardActiveShift } from '../../services/guardService';
import { MandatoryHandoverBarrier } from './components/MandatoryHandoverBarrier';
import { GuardDashboardView } from './tabs/GuardDashboardView';
import { GuardEntryView } from './tabs/GuardEntryView';
import { ActiveVehiclesView } from './tabs/ActiveVehiclesView';
import { GuardExitView } from './tabs/GuardExitView';
import { MyShiftView } from './tabs/MyShiftView';
import { Badge } from '../../components/common/Badge';

export const GuardPortal: React.FC = () => {
  const { currentUser, guardProfile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<GuardTab>('dashboard');
  const [exitInitialQuery, setExitInitialQuery] = useState<string | null>(null);

  // Real-time Handover and Shift State
  const [pendingHandovers, setPendingHandovers] = useState<HandoverModel[]>([]);
  const [activeShift, setActiveShift] = useState<ShiftModel | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<Error | null>(null);
  const [isVerifyingHandovers, setIsVerifyingHandovers] = useState<boolean>(true);

  // Subscribe to real-time pending handovers for currently authenticated guard
  useEffect(() => {
    const uid = currentUser?.uid || guardProfile?.uid;
    if (!uid) {
      setPendingHandovers([]);
      setIsVerifyingHandovers(false);
      return;
    }

    setIsVerifyingHandovers(true);
    setSubscriptionError(null);

    const unsubscribe = subscribeToPendingHandovers(
      uid,
      (handovers) => {
        setPendingHandovers(handovers);
        setIsVerifyingHandovers(false);
        setSubscriptionError(null);
      },
      (error) => {
        console.error('[GuardPortal] Handover subscription error:', error);
        setSubscriptionError(error);
        setIsVerifyingHandovers(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser?.uid, guardProfile?.uid]);

  // Subscribe to active shift
  useEffect(() => {
    const uid = currentUser?.uid || guardProfile?.uid;
    if (!uid) {
      setActiveShift(null);
      return;
    }

    const unsubscribe = subscribeToGuardActiveShift(
      uid,
      (shift) => {
        setActiveShift(shift);
      },
      (err) => {
        console.warn('[GuardPortal] Active shift listener warning:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser?.uid, guardProfile?.uid]);

  // Five Navigation Tabs matching Flutter
  const tabs: Array<{
    id: GuardTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    tag?: string;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'entry', label: 'Entry', icon: LogIn, tag: 'Gate In' },
    { id: 'active-vehicles', label: 'Active Vehicles', icon: Car, tag: 'Slots' },
    { id: 'exit', label: 'Exit', icon: LogOut, tag: 'Gate Out' },
    { id: 'my-shift', label: 'My Shift', icon: Clock, tag: 'Ops' },
  ];

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <GuardDashboardView
            onNavigateTab={(tab) => setActiveTab(tab)}
            activeShift={activeShift}
            pendingHandovers={pendingHandovers}
            isVerifyingHandovers={isVerifyingHandovers}
          />
        );
      case 'entry':
        return <GuardEntryView
            onReturnDashboard={() => setActiveTab('dashboard')}
            onViewActiveParking={() => setActiveTab('active-vehicles')}
            activeShift={activeShift}
          />;
      case 'active-vehicles':
        return <ActiveVehiclesView
            onNewEntryTap={() => setActiveTab('entry')}
            onProceedToExit={(record) => {
              if (!record) return;
              const query = typeof record === 'string' ? record : (record as any).ticketNumber || (record as any).vehicleNumber;
              console.log('[GuardPortal] Proceed to Exit shortcut for query:', query);
              setExitInitialQuery(query);
              setActiveTab('exit');
            }}
          />;
      case 'exit':
        return (
          <GuardExitView
            onReturnDashboard={() => setActiveTab('dashboard')}
            activeShift={activeShift}
            initialQuery={exitInitialQuery}
            onClearInitialQuery={() => setExitInitialQuery(null)}
          />
        );
      case 'my-shift':
        return <MyShiftView activeShift={activeShift} />;
      default:
        return (
          <GuardDashboardView
            onNavigateTab={(tab) => setActiveTab(tab)}
            activeShift={activeShift}
            pendingHandovers={pendingHandovers}
            isVerifyingHandovers={isVerifyingHandovers}
          />
        );
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] pb-20 md:pb-8">
      {/* 1. Mandatory Incoming-Handover Barrier Overlay */}
      <MandatoryHandoverBarrier
        pendingHandovers={pendingHandovers}
        subscriptionError={subscriptionError}
        onRetrySubscription={() => {
          setSubscriptionError(null);
          setIsVerifyingHandovers(true);
        }}
      />

      {/* 2. Guard Navigation Header / Sub-bar */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between py-3 gap-3">
            {/* Terminal Identity & Guard Profile */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm tracking-tight">
                    Guard Operations Terminal
                  </span>
                  <Badge variant="success">Phase 4A</Badge>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                  <span className="font-medium text-slate-700">{guardProfile?.name || 'Gate Attendant'}</span>
                  <span>"</span>
                  <span className="text-emerald-700 font-medium">
                    {activeShift ? 'Active Shift Rotation' : 'Standard Shift'}
                  </span>
                </div>
              </div>
            </div>

            {/* Desktop Navigation Tabs */}
            <div className="hidden md:flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200">
              {tabs.map((tab) => {
                const IconComponent = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/60 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    <IconComponent className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>{tab.label}</span>
                    {tab.tag && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded ${
                        isActive ? 'bg-emerald-50 text-emerald-700 font-mono' : 'bg-slate-200/60 text-slate-500'
                      }`}>
                        {tab.tag}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => signOut()}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-slate-200 hover:border-red-200 transition-colors"
                title="Sign out of guard terminal"
              >
                <span>Exit Terminal</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Tab Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderActiveTabContent()}
      </div>

      {/* 4. Mobile Bottom Navigation Bar matching Flutter GuardBottomNav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg px-2 py-1.5">
        <div className="grid grid-cols-5 gap-1">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all ${
                  isActive
                    ? 'text-emerald-700 bg-emerald-50 font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <IconComponent className={`w-5 h-5 mb-0.5 ${isActive ? 'text-emerald-600 scale-110' : 'text-slate-400'}`} />
                <span className="text-[10px] leading-tight truncate max-w-full">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GuardPortal;
