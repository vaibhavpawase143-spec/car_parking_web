import React from 'react';
import { ShieldAlert, LogOut, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from './AuthContext';

export const AccessDeniedScreen: React.FC = () => {
  const { currentUser, accessDeniedReason, signOut, refreshProfile } = useAuth();

  return (
    <div className="max-w-lg mx-auto my-16 px-4">
      <Card className="border-red-200 shadow-md">
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-200 shadow-xs">
            <ShieldAlert className="w-9 h-9" />
          </div>

          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Access Restricted</h2>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">
            Jay Ganesh Pay & Park Security Policy
          </p>

          <div className="mt-6 p-4 bg-red-50/80 rounded-xl border border-red-200 text-left text-xs text-red-900 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-red-950">Denial Reason:</span>
                <span className="text-red-800 text-[11px] leading-relaxed">
                  {accessDeniedReason || 'Account profile missing or inactive in Firestore /guards collection.'}
                </span>
              </div>
            </div>

            {currentUser && (
              <div className="pt-2 border-t border-red-200/60 text-[11px] text-red-700 flex flex-col gap-0.5">
                <div>
                  <span className="font-medium">Authenticated Account: </span>
                  <span className="font-mono">{currentUser.email || 'No email associated'}</span>
                </div>
                <div>
                  <span className="font-medium">Firebase UID: </span>
                  <span className="font-mono text-[10px]">{currentUser.uid}</span>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 mt-5 leading-relaxed max-w-sm mx-auto">
            Only active personnel with an assigned <strong className="text-slate-700 font-semibold">admin</strong> or <strong className="text-slate-700 font-semibold">guard</strong> role in the facility registry are authorized to access this portal.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <Button
              variant="outline"
              className="w-full sm:flex-1"
              onClick={() => refreshProfile()}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Re-verify Account
            </Button>
            <Button
              variant="secondary"
              className="w-full sm:flex-1"
              onClick={() => signOut()}
              icon={<LogOut className="w-4 h-4" />}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
