import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  Wallet,
  Eye,
  Lock,
  Smartphone,
  Banknote,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { GuardWithFinancials, PaymentTransaction } from '../../../types';
import { subscribeGuardsWithResponsibility, subscribePaymentTransactions } from '../../../services/adminService';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';

export const GuardManagementView: React.FC = () => {
  const [guardsWithFin, setGuardsWithFin] = useState<GuardWithFinancials[]>([]);
  const [allTxns, setAllTxns] = useState<PaymentTransaction[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedGuard, setSelectedGuard] = useState<GuardWithFinancials | null>(null);

  useEffect(() => {
    const unsubGuards = subscribeGuardsWithResponsibility((data) => {
      setGuardsWithFin(data);
    });
    const unsubTxns = subscribePaymentTransactions((txns) => {
      setAllTxns(txns);
    });

    return () => {
      unsubGuards();
      unsubTxns();
    };
  }, []);

  const filteredGuards = guardsWithFin.filter((g) => {
    const term = searchTerm.toLowerCase();
    return (
      g.guard.name.toLowerCase().includes(term) ||
      g.guard.email.toLowerCase().includes(term) ||
      (g.guard.mobile && g.guard.mobile.includes(term))
    );
  });

  // Aggregate Float Totals
  const totalOutstandingCash = guardsWithFin.reduce((sum, g) => sum + g.responsibility.outstandingCash, 0);
  const totalOutstandingUpi = guardsWithFin.reduce((sum, g) => sum + g.responsibility.outstandingUpi, 0);
  const totalOutstandingAll = totalOutstandingCash + totalOutstandingUpi;

  // Selected Guard Transactions
  const guardTransactions = selectedGuard
    ? allTxns.filter((t) => t.guardUid === selectedGuard.guard.uid || t.guardName.toLowerCase() === selectedGuard.guard.name.toLowerCase())
    : [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Staff & Guard Registry</h1>
            <Badge variant="neutral">{guardsWithFin.length} Authorized Attendants</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative gate attendant profiles, real-time float custody, and shift reconciliations.
          </p>
        </div>

        {/* Read-Only Notice */}
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg shadow-2xs font-medium">
          <Lock className="w-3.5 h-3.5 text-amber-600" />
          <span>Read-Only Audit Mode: Staff modifications disabled</span>
        </div>
      </div>

      {/* Float Custody Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 border-emerald-200 bg-gradient-to-br from-white to-emerald-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Cash With Staff</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-2">
            {formatCurrency(totalOutstandingCash)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Calculated: Collections − Handovers − Admin Settlements
          </p>
        </Card>

        <Card className="p-5 border-blue-200 bg-gradient-to-br from-white to-blue-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total UPI With Staff</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-900 mt-2">
            {formatCurrency(totalOutstandingUpi)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Digital custody tracked across active terminals
          </p>
        </Card>

        <Card className="p-5 border-purple-200 bg-gradient-to-br from-white to-purple-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Float Custody</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-900 mt-2">
            {formatCurrency(totalOutstandingAll)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Total facility responsibility awaiting collection
          </p>
        </Card>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search guard by name, email, or mobile..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-2xs"
          />
        </div>
      </div>

      {/* Guard Cards Grid */}
      {filteredGuards.length === 0 ? (
        <Card className="p-12 text-center text-slate-400">
          <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">No Guard Records Matching Search</p>
          <p className="text-xs text-slate-400 mt-1">Try searching by a different name or email.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredGuards.map((item) => {
            const { guard, responsibility, transactionCount } = item;
            return (
              <Card
                key={guard.uid}
                className="p-5 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs"
              >
                <div>
                  {/* Card Header: Avatar & Status */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-700 font-bold flex items-center justify-center text-base border border-brand-100 shadow-2xs">
                        {guard.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{guard.name}</h3>
                        <p className="text-xs text-slate-500 font-mono truncate max-w-[180px]">{guard.email}</p>
                      </div>
                    </div>
                    <Badge variant={guard.isActive ? 'success' : 'neutral'}>
                      {guard.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  {/* Attributes */}
                  <div className="my-3 py-2 px-3 bg-slate-50 rounded-lg text-xs space-y-1 text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Mobile:</span>
                      <span className="font-mono text-slate-800">{guard.mobile || 'Not Registered'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Current Shift:</span>
                      <span className="font-medium text-slate-800">{guard.currentShift || 'Shift 1'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Txns Logged:</span>
                      <span className="font-semibold text-brand-600">{transactionCount}</span>
                    </div>
                  </div>

                  {/* Financial Float Responsibility Box */}
                  <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-100">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5 text-brand-600" />
                        Float in Hand
                      </span>
                      <span className="text-xs font-bold text-slate-900 font-mono">
                        {formatCurrency(responsibility.totalOutstanding)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                        <span className="text-emerald-700 block text-[10px] font-semibold uppercase">Cash Float</span>
                        <span className="font-bold text-emerald-900 font-mono text-xs">
                          {formatCurrency(responsibility.outstandingCash)}
                        </span>
                      </div>
                      <div className="bg-blue-50/60 p-2 rounded-lg border border-blue-100">
                        <span className="text-blue-700 block text-[10px] font-semibold uppercase">UPI Float</span>
                        <span className="font-bold text-blue-900 font-mono text-xs">
                          {formatCurrency(responsibility.outstandingUpi)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Action */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-mono">
                    UID: {guard.uid.slice(0, 8)}...
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedGuard(item)}
                    icon={<Eye className="w-3.5 h-3.5" />}
                  >
                    View Ledger
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal / Ledger Drawer for Selected Guard */}
      {selectedGuard && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedGuard.guard.name} — Financial Audit
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  UID: {selectedGuard.guard.uid} • {selectedGuard.guard.email}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedGuard(null)}
              >
                Close
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Responsibility Equation Summary */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
                  Reconciliation Breakdown
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Collections</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {formatCurrency(selectedGuard.responsibility.totalCashCollected + selectedGuard.responsibility.totalUpiCollected)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Handovers Given</span>
                    <span className="font-bold text-red-600 font-mono">
                      −{formatCurrency(selectedGuard.responsibility.cashHandedOver + selectedGuard.responsibility.upiHandedOver)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Handovers Received</span>
                    <span className="font-bold text-emerald-600 font-mono">
                      +{formatCurrency(selectedGuard.responsibility.cashReceived + selectedGuard.responsibility.upiReceived)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Admin Withdrawals</span>
                    <span className="font-bold text-purple-600 font-mono">
                      −{formatCurrency(selectedGuard.responsibility.cashWithdrawn + selectedGuard.responsibility.upiWithdrawn)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transactions Recorded by this Guard */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center justify-between">
                  <span>Logged Transactions ({guardTransactions.length})</span>
                  <span className="text-slate-400 font-normal">Real-time ledger</span>
                </h4>

                {guardTransactions.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    No payment transactions recorded for this staff member yet.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                        <tr>
                          <th className="py-2.5 px-3">Timestamp</th>
                          <th className="py-2.5 px-3">Ticket / Pass</th>
                          <th className="py-2.5 px-3">Vehicle</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Method</th>
                          <th className="py-2.5 px-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {guardTransactions.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-50/60">
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                              {formatDateTime(t.createdAt)}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                              #{t.ticketId || '-'}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                              {t.vehicleNumber || '-'}
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge variant={t.paymentType === 'REFUND' ? 'danger' : 'neutral'}>
                                {t.paymentType}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 uppercase text-[11px] font-semibold text-slate-600">
                              {t.paymentMethod}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                              {t.paymentType === 'REFUND' ? `-${formatCurrency(t.amount)}` : formatCurrency(t.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
