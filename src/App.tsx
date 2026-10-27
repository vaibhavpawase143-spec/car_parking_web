import React, { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { LandingPage } from './app/LandingPage';
import { AdminPortal } from './features/admin/AdminPortal';
import { GuardPortal } from './features/guard/GuardPortal';
import { AuthPage } from './features/auth/AuthPage';
import { NotFound } from './components/common/NotFound';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { AuthGate } from './features/auth/AuthGate';
import { isFirebaseConfigured } from './firebase/config';
import { Button } from './components/common/Button';
import { ShieldCheck, UserCheck, LogOut, ArrowRight, MapPin } from 'lucide-react';
import { Card } from './components/common/Card';

const AppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('landing');
  const { authStatus, guardProfile, activeLocation, isLegacyMode, signOut } = useAuth();
  const firebaseReady = isFirebaseConfigured();

  // If user signs in successfully while viewing the auth page, auto-route to their respective portal
  useEffect(() => {
    if (authStatus === 'authenticated' && guardProfile && currentTab === 'auth') {
      if (guardProfile.role === 'admin' || guardProfile.role === 'owner' || guardProfile.role === 'manager') {
        setCurrentTab('admin');
      } else if (guardProfile.role === 'guard') {
        setCurrentTab('guard');
      }
    }
  }, [authStatus, guardProfile, currentTab]);

  const renderContent = () => {
    switch (currentTab) {
      case 'landing':
        return (
          <LandingPage
            onNavigate={(tab) => setCurrentTab(tab)}
            isFirebaseConfigured={firebaseReady}
          />
        );

      case 'admin':
        return (
          <AuthGate requiredRole={['admin', 'owner', 'manager']} onNavigate={(tab) => setCurrentTab(tab)}>
            <AdminPortal />
          </AuthGate>
        );

      case 'guard':
        return (
          <AuthGate requiredRole={['guard', 'admin', 'owner', 'manager']} onNavigate={(tab) => setCurrentTab(tab)}>
            <GuardPortal />
          </AuthGate>
        );

      case 'auth':
        // If already authenticated, show active session summary
        if (authStatus === 'authenticated' && guardProfile) {
          const isAdminType = guardProfile.role === 'admin' || guardProfile.role === 'owner' || guardProfile.role === 'manager';

          return (
            <div className="max-w-md mx-auto my-16 px-4">
              <Card className="text-center p-8">
                <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4 border border-brand-100">
                  {isAdminType ? (
                    <ShieldCheck className="w-8 h-8" />
                  ) : (
                    <UserCheck className="w-8 h-8" />
                  )}
                </div>
                <h2 className="text-xl font-bold text-slate-900">Active Staff Session</h2>
                <p className="text-xs text-slate-500 mt-1">
                  You are currently authenticated as an active <strong className="text-slate-700 capitalize">{guardProfile.role}</strong>.
                </p>

                <div className="my-6 p-4 bg-slate-50 rounded-xl border border-slate-200 text-left text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Staff Name:</span>
                    <span className="font-semibold text-slate-800">{guardProfile.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Email:</span>
                    <span className="font-mono text-slate-800">{guardProfile.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Role:</span>
                    <span className="font-semibold uppercase text-brand-600">{guardProfile.role}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      Active Location:
                    </span>
                    <span className="font-medium text-slate-800">
                      {activeLocation?.locationName || activeLocation?.name || 'Sangamner Bus Stand'}
                    </span>
                  </div>
                  {isLegacyMode && (
                    <div className="pt-1 border-t border-slate-200/60 flex justify-between items-center">
                      <span className="text-[11px] text-amber-700">Compatibility Mode:</span>
                      <span className="text-[10px] font-mono bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                        Dual-Read Fallback
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status:</span>
                    <span className="text-emerald-700 font-medium">Active & Verified</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    variant="primary"
                    onClick={() => setCurrentTab(isAdminType ? 'admin' : 'guard')}
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    Go to {isAdminType ? 'Management Portal' : 'Guard Terminal'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => signOut()}
                    icon={<LogOut className="w-4 h-4" />}
                  >
                    Sign Out
                  </Button>
                </div>
              </Card>
            </div>
          );
        }
        return <AuthPage />;

      default:
        return <NotFound onGoHome={() => setCurrentTab('landing')} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <Header
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        isFirebaseReady={firebaseReady}
      />
      <main className="flex-1">
        {renderContent()}
      </main>
      <Footer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
