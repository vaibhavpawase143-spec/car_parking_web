import React, { useEffect, useState } from 'react';
import {
  IndianRupee,
  Search,
  Banknote,
  Smartphone,
  Lock,
  Receipt,
  History,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import { PaymentTransaction, WithdrawalRecord } from '../../../types';
import { subscribePaymentTransactions, subscribeWithdrawals } from '../../../services/adminService';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';

export const PaymentManagementView: React.FC = () => {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'transactions' | 'withdrawals'>('transactions');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    const unsubTxns = subscribePaymentTransactions((data) => {
      setTransactions(data);
    });
    const unsubWith = subscribeWithdrawals((data) => {
      setWithdrawals(data);
    });

    return () => {
      unsubTxns();
      unsubWith();
    };
  }, []);

  // Filtered transactions
  const filteredTxns = transactions.filter((t) => {
    const matchesMethod = methodFilter === 'all' || t.paymentMethod.toLowerCase() === methodFilter.toLowerCase();
    const matchesType = typeFilter === 'all' || t.paymentType.toLowerCase() === typeFilter.toLowerCase();
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      t.vehicleNumber.toLowerCase().includes(term) ||
      t.ticketId.toLowerCase().includes(term) ||
      t.guardName.toLowerCase().includes(term);

    return matchesMethod && matchesType && matchesSearch;
  });

  // Financial summary metrics calculated strictly like Flutter payment_service.dart
  let grossCash = 0;
  let grossUpi = 0;
  let refundsCash = 0;
  let refundsUpi = 0;
  let advanceSum = 0;
  let finalSum = 0;
  let monthlyPassSum = 0;

  transactions.forEach((t) => {
    const isUpi = t.paymentMethod === 'upi';
    if (t.paymentType === 'ADVANCE') {
      advanceSum += t.amount;
      if (isUpi) grossUpi += t.amount;
      else grossCash += t.amount;
    } else if (t.paymentType === 'FINAL') {
      finalSum += t.amount;
      if (isUpi) grossUpi += t.amount;
      else grossCash += t.amount;
    } else if (t.paymentType === 'MONTHLY_PASS') {
      monthlyPassSum += t.amount;
      if (isUpi) grossUpi += t.amount;
      else grossCash += t.amount;
    } else if (t.paymentType === 'REFUND') {
      if (isUpi) refundsUpi += t.amount;
      else refundsCash += t.amount;
    }
  });

  const netCash = Math.max(0, grossCash - refundsCash);
  const netUpi = Math.max(0, grossUpi - refundsUpi);
  const netTotal = netCash + netUpi;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Payment Ledger & Collections</h1>
            <Badge variant="neutral">{transactions.length} Transactions</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative financial transaction journal, Cash vs. UPI ledger, and admin withdrawal settlements.
          </p>
        </div>

        {/* Read-Only Notice */}
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg shadow-2xs font-medium">
          <Lock className="w-3.5 h-3.5 text-amber-600" />
          <span>Read-Only Audit Mode: Financial records immutable</span>
        </div>
      </div>

      {/* Financial Aggregation Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border-brand-200 bg-gradient-to-br from-white to-brand-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Net Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-100">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            {formatCurrency(netTotal)}
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <span>Gross: {formatCurrency(grossCash + grossUpi)}</span>
            <span className="text-red-600">Refunds: −{formatCurrency(refundsCash + refundsUpi)}</span>
          </div>
        </Card>

        <Card className="p-5 border-emerald-200 bg-gradient-to-br from-white to-emerald-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cash Collections</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-2 font-mono">
            {formatCurrency(netCash)}
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <span>Gross: {formatCurrency(grossCash)}</span>
            <span className="text-red-600">Refunds: −{formatCurrency(refundsCash)}</span>
          </div>
        </Card>

        <Card className="p-5 border-blue-200 bg-gradient-to-br from-white to-blue-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">UPI Collections</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-900 mt-2 font-mono">
            {formatCurrency(netUpi)}
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <span>Gross: {formatCurrency(grossUpi)}</span>
            <span className="text-red-600">Refunds: −{formatCurrency(refundsUpi)}</span>
          </div>
        </Card>

        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Revenue Streams</span>
            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center border border-slate-100">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Advance:</span>
              <span className="font-mono font-medium">{formatCurrency(advanceSum)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Exit Settlements:</span>
              <span className="font-mono font-medium">{formatCurrency(finalSum)}</span>
            </div>
            <div className="flex justify-between text-purple-700 font-semibold">
              <span>Monthly Passes:</span>
              <span className="font-mono">{formatCurrency(monthlyPassSum)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Tab Switcher: Transactions vs. Withdrawals */}
      <div className="border-b border-slate-200 flex items-center gap-6">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'transactions'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Payment Transactions Journal</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
            {filteredTxns.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'withdrawals'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Admin Withdrawal Settlements</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
            {withdrawals.length}
          </span>
        </button>
      </div>

      {/* Subview 1: Payment Transactions Journal */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search ticket #, vehicle number, or guard name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-500 shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              {/* Method Filter */}
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 shadow-2xs focus:outline-hidden"
              >
                <option value="all">All Payment Methods</option>
                <option value="cash">Cash Only</option>
                <option value="upi">UPI Only</option>
              </select>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 shadow-2xs focus:outline-hidden"
              >
                <option value="all">All Payment Types</option>
                <option value="advance">Advance Entry</option>
                <option value="final">Final Exit Fee</option>
                <option value="monthly_pass">Monthly Pass</option>
                <option value="refund">Refunds</option>
              </select>
            </div>
          </div>

          {/* Transactions Table */}
          {filteredTxns.length === 0 ? (
            <Card className="p-12 text-center text-slate-400">
              <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No Payment Records Match Criteria</p>
              <p className="text-xs text-slate-400 mt-1">Adjust filters or search keywords.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0 border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                    <tr>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Reference / Ticket</th>
                      <th className="py-3 px-4">Vehicle Number</th>
                      <th className="py-3 px-4">Payment Type</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Collector Staff</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTxns.map((t) => {
                      const isRefund = t.paymentType === 'REFUND';
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                            {formatDateTime(t.createdAt)}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-800">
                            #{t.ticketId || '-'}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {t.vehicleNumber || '-'}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={isRefund ? 'danger' : t.paymentType === 'MONTHLY_PASS' ? 'primary' : 'neutral'}>
                              {t.paymentType}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 uppercase text-[11px] font-semibold">
                            <span className={t.paymentMethod === 'upi' ? 'text-blue-700' : 'text-emerald-700'}>
                              {t.paymentMethod}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            <div className="font-medium">{t.guardName}</div>
                            {t.shift && <div className="text-[10px] text-slate-400">{t.shift}</div>}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {isRefund ? (
                              <span className="text-red-600">−{formatCurrency(t.amount)}</span>
                            ) : (
                              formatCurrency(t.amount)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Subview 2: Admin Withdrawal Settlements */}
      {activeTab === 'withdrawals' && (
        <div className="space-y-4">
          {withdrawals.length === 0 ? (
            <Card className="p-12 text-center text-slate-400">
              <History className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No Withdrawal Records Logged</p>
              <p className="text-xs text-slate-400 mt-1">Admin float settlements are recorded when cash/UPI is withdrawn from guards.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0 border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                    <tr>
                      <th className="py-3 px-4">Settlement Time</th>
                      <th className="py-3 px-4">Guard Account</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Admin Authorizer</th>
                      <th className="py-3 px-4">Previous Float</th>
                      <th className="py-3 px-4">Remaining Float</th>
                      <th className="py-3 px-4 text-right">Withdrawn Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {withdrawals.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {formatDateTime(w.createdAt)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {w.guardName}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={w.type === 'UPI' ? 'primary' : 'neutral'}>
                            {w.type}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-medium">
                          {w.adminName}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {w.previousOutstanding !== undefined ? formatCurrency(w.previousOutstanding) : '-'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {w.remainingOutstanding !== undefined ? formatCurrency(w.remainingOutstanding) : '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(w.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
