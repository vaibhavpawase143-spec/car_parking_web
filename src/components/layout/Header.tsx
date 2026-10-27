import React, { useState } from 'react';
import { Car, ShieldCheck, UserCheck, HelpCircle, LogOut, Loader2, Database } from 'lucide-react';
import { Badge } from '../common/Badge';
import { LocationSwitcher } from './LocationSwitcher';
import { useAuth } from '../../features/auth/AuthContext';
import { isEmulatorMode } from '../../firebase';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isFirebaseReady: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  isFirebaseReady,
}) => {
  const { currentUser, guardProfile, authStatus, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const emulatorActive = isEmulatorMode();

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      onSelectTab('landing');
    } catch (err) {
      console.error('[Header] Sign out error:', err);
    } finally {
      setIsSigningOut(false);
    }
  };

  const userRole = guardProfile?.role;
  const isManagement = userRole === 'owner' || userRole === 'manager' || userRole === 'admin';
  const isGuard = userRole === 'guard';
  const isAuthenticated = authStatus === 'authenticated' && !!guardProfile;

  const getRoleBadge = () => {
    switch (userRole) {
      case 'owner':
        return { label: 'Owner', variant: 'primary' as const };
      case 'manager':
        return { label: 'Manager', variant: 'warning' as const };
      case 'admin':
        return { label: 'Admin', variant: 'primary' as const };
      case 'guard':
      default:
        return { label: 'Guard', variant: 'success' as const };
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand identity */}
        <div
          className="flex items-center gap-3 cursor-pointer group select-none"
          onClick={() => onSelectTab('landing')}
        >
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:bg-brand-700 transition-colors">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 tracking-tight text-base sm:text-lg">
                BIZFLOW
              </span>
              <span className="text-xs uppercase font-medium text-brand-600 tracking-wider hidden sm:inline">
                PARKING SYSTEM
              </span>
              {emulatorActive && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded">
                  <Database className="w-3 h-3 text-amber-600" />
                  EMULATOR
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium">Jay Ganesh Pay & Park</p>
          </div>
        </div>

        {/* Navigation tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => onSelectTab('landing')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
              currentTab === 'landing'
                ? 'bg-slate-100 text-slate-900 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Overview
          </button>

          {/* Admin portal nav tab */}
          {(isManagement || !isAuthenticated) && (
            <button
              onClick={() => onSelectTab('admin')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                currentTab === 'admin'
                  ? 'bg-brand-50 text-brand-700 font-semibold border border-brand-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-brand-600" />
              <span>Admin Portal</span>
            </button>
          )}

          {/* Guard terminal nav tab */}
          {(isGuard || isManagement || !isAuthenticated) && (
            <button
              onClick={() => onSelectTab('guard')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                currentTab === 'guard'
                  ? 'bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>Guard Portal</span>
            </button>
          )}

          {/* Unauthenticated login button */}
          {!isAuthenticated && (
            <button
              onClick={() => onSelectTab('auth')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
                currentTab === 'auth'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Sign In
            </button>
          )}
        </nav>

        {/* Location Switcher & User profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isAuthenticated && <LocationSwitcher />}

          {isAuthenticated && guardProfile ? (
            <div className="flex items-center gap-3 pl-2 sm:pl-3 border-l border-slate-200">
              <div className="hidden sm:flex flex-col text-right">
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="text-xs font-semibold text-slate-800">{guardProfile.name}</span>
                  <Badge variant={getRoleBadge().variant}>
                    {getRoleBadge().label}
                  </Badge>
                </div>
                <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                  {guardProfile.email || currentUser?.email}
                </span>
              </div>

              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors"
                title="Sign out of your session"
              >
                {isSigningOut ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-600" />
                )}
                <span className="hidden md:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="hidden lg:flex items-center gap-2 border-l border-slate-200 pl-4">
              <Badge variant={isFirebaseReady ? (emulatorActive ? 'warning' : 'success') : 'neutral'}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isFirebaseReady ? (emulatorActive ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-400'}`} />
                {isFirebaseReady ? (emulatorActive ? 'Offline Emulator' : 'Firebase Ready') : 'Local Preview'}
              </Badge>
              <div title="Phase 2 Authentication: Secure session management via Firebase Auth and Firestore /guards">
                <HelpCircle className="w-4 h-4 text-slate-400 hover:text-slate-600 cursor-pointer" />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

