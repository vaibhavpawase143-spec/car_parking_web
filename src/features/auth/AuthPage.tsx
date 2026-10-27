import React, { useState } from 'react';
import { Lock, User, ShieldCheck, ArrowRight, AlertCircle, Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from './AuthContext';
import { ForgotPasswordModal } from './ForgotPasswordModal';

export const AuthPage: React.FC = () => {
  const { signIn, authStatus } = useAuth();
  const [activePortal, setActivePortal] = useState<'guard' | 'admin'>('guard');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your account password.');
      return;
    }

    setIsLoading(true);
    try {
      await signIn(cleanEmail, password);
      // Navigation is handled automatically by AuthGate observing auth state
    } catch (err: any) {
      console.error('[AuthPage] Login failure:', err);
      const code = err?.code || '';
      if (
        code === 'auth/invalid-credential' || 
        code === 'auth/wrong-password' || 
        code === 'auth/user-not-found'
      ) {
        setErrorMessage('Invalid credentials. Check your email and password.');
      } else if (code === 'auth/invalid-email') {
        setErrorMessage('Invalid email format. Please check for typos.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMessage('Too many failed login attempts. Please wait a few minutes.');
      } else if (code === 'auth/network-request-failed') {
        setErrorMessage('Network connection error. Check your internet connection.');
      } else {
        setErrorMessage(err?.message || 'Authentication failed. Please verify your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 px-4">
      <Card className="shadow-lg border-slate-200">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3 border border-brand-100 shadow-xs">
            {activePortal === 'admin' ? (
              <ShieldCheck className="w-6 h-6" />
            ) : (
              <User className="w-6 h-6" />
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {activePortal === 'admin' ? 'Administrator Login' : 'Guard Portal Sign In'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {activePortal === 'admin' 
              ? 'Enter facility admin credentials for executive and operational oversight.' 
              : 'Enter assigned guard credentials for gate ticketing and shift operations.'}
          </p>
        </div>

        {/* Portal selector tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-6 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setActivePortal('guard');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              activePortal === 'guard'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Guard Access
          </button>
          <button
            type="button"
            onClick={() => {
              setActivePortal('admin');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              activePortal === 'admin'
                ? 'bg-white text-brand-700 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Administrator
          </button>
        </div>

        {/* Error notification banner */}
        {errorMessage && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Unconfigured mode banner */}
        {authStatus === 'unconfigured' && (
          <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Environment Variables Pending
            </div>
            <p className="text-[11px] text-amber-700">
              Configure your <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">.env</code> file from <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">.env.example</code> to activate live Firebase Authentication.
            </p>
          </div>
        )}

        {/* Live Authentication form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={activePortal === 'admin' ? 'admin@parking.com' : 'guard1@parking.com'}
                className="w-full text-sm px-3.5 py-2.5 pl-10 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white"
                required
                disabled={isLoading}
              />
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700">
                Password
              </label>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(true)}
                className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-sm px-3.5 py-2.5 pl-10 pr-10 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white"
                required
                disabled={isLoading}
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full mt-3 py-2.5"
            disabled={isLoading}
            icon={isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          >
            {isLoading ? 'Verifying Credentials...' : `Sign in as ${activePortal === 'admin' ? 'Administrator' : 'Guard'}`}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-slate-400" />
            <span>Secure Firebase Auth Session</span>
          </div>
          <span>Project: car-parking-system-2026</span>
        </div>
      </Card>

      <ForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        defaultEmail={email}
      />
    </div>
  );
};
