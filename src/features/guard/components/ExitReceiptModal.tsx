import React, { useState } from 'react';
import { Printer, X, Check, Car, Clock, ShieldCheck } from 'lucide-react';
import { ParkingRecord } from '../../../types';
import { formatCurrency, formatDateTime, formatVehicleType, normalizeVehicleNumber, formatLiveDuration } from '../../../utils/formatters';
import { generateQrSvg } from '../../../utils/qrGenerator';
import { Button } from '../../../components/common/Button';

interface ExitReceiptModalProps {
  isOpen: boolean;
  record: ParkingRecord | null;
  onClose: () => void;
}

export const ExitReceiptModal: React.FC<ExitReceiptModalProps> = ({
  isOpen,
  record,
  onClose,
}) => {
  const [isPrinted, setIsPrinted] = useState(false);

  if (!isOpen || !record) return null;

  const qrSvg = generateQrSvg(record.qrReference || record.ticketNumber, 140);
  const normalizedPlate = normalizeVehicleNumber(record.vehicleNumber);
  const durationMs = Math.max(0, ((record.exitTime?.getTime() || Date.now()) - record.entryTime.getTime()));
  const durationStr = formatLiveDuration(durationMs);
  const paymentMethodLabel = (record.paymentMethod || 'cash').toUpperCase();
  const advanceMethodLabel = (record.advancePaymentMethod || 'cash').toUpperCase();

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=380,height=700');
    if (!printWindow) {
      window.print();
      setIsPrinted(true);
      return;
    }

    const advanceLine = record.advanceAmount > 0
      ? `<div class="row"><span>Advance Paid:</span><span>${formatCurrency(record.advanceAmount)} (${advanceMethodLabel})</span></div>
         <div class="row"><span>Advance Adjusted:</span><span>-${formatCurrency(record.advanceAmount)}</span></div>`
      : '';

    const balanceLine = (record.balanceDue || 0) > 0
      ? `<div class="row bold highlight"><span>Balance Paid:</span><span>${formatCurrency(record.balanceDue || 0)} (${paymentMethodLabel})</span></div>`
      : '';

    const refundLine = (record.refundAmount || 0) > 0
      ? `<div class="row bold highlight"><span>Refund Handed:</span><span>${formatCurrency(record.refundAmount || 0)} (${paymentMethodLabel})</span></div>`
      : '';

    const zeroSettlementLine = (!record.balanceDue && !record.refundAmount)
      ? `<div class="row bold"><span>Final Settlement:</span><span>₹0 (Full Exemption)</span></div>`
      : '';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Exit Receipt - ${record.ticketNumber}</title>
          <style>
            @page {
              size: 58mm auto;
              margin: 0;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              width: 58mm;
              margin: 0 auto;
              padding: 10px 4px;
              color: #000;
              font-size: 11px;
              line-height: 1.3;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; margin: 2px 0; font-size: 11px; }
            .plate { font-size: 15px; font-weight: bold; letter-spacing: 1px; border: 1px solid #000; padding: 4px; margin: 6px 0; text-align: center; }
            .qr { margin: 8px auto; text-align: center; }
            .qr svg { width: 120px; height: 120px; }
            .audit { font-size: 9px; color: #333; margin-top: 4px; }
            .badge { display: inline-block; padding: 2px 6px; border: 1px solid #000; font-weight: bold; font-size: 10px; margin-top: 6px; }
            .highlight { font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 13px;">BIZFLOW PARKING</div>
          <div class="center" style="font-size: 10px;">EXIT SETTLEMENT RECEIPT</div>
          <div class="divider"></div>

          <div class="qr">${qrSvg}</div>
          <div class="plate">${normalizedPlate}</div>
          <div class="center bold">${formatVehicleType(record.vehicleType)}</div>

          <div class="divider"></div>
          <div class="row"><span>Ticket No:</span><span class="bold">#${record.ticketNumber}</span></div>
          <div class="row"><span>Entry:</span><span>${formatDateTime(record.entryTime)}</span></div>
          <div class="row"><span>Exit:</span><span>${formatDateTime(record.exitTime || new Date())}</span></div>
          <div class="row bold"><span>Duration:</span><span>${durationStr}</span></div>

          <div class="divider"></div>
          <div class="bold" style="margin-bottom: 3px;">CHARGES & SETTLEMENT</div>
          <div class="row"><span>Gross Charge:</span><span>${formatCurrency(record.grossCharge || 0)}</span></div>
          ${advanceLine}
          ${balanceLine}
          ${refundLine}
          ${zeroSettlementLine}
          <div class="row"><span>Payment Mode:</span><span>${paymentMethodLabel}</span></div>

          <div class="divider"></div>
          <div class="bold" style="font-size: 10px;">CROSS-SHIFT AUDIT</div>
          <div class="audit">Entry: ${record.entryGuardName} (${record.entryShift})</div>
          ${record.advanceAmount > 0 ? `<div class="audit">Adv Coll: ${record.advanceCollectorGuardName || record.entryGuardName} (${record.advanceCollectorShift || record.entryShift})</div>` : ''}
          <div class="audit">Exit: ${record.exitGuardName || 'Duty Guard'} (${record.exitShift || 'Shift 1'})</div>

          <div class="divider"></div>
          <div class="center">
            <span class="badge">SETTLED & EXITED</span>
            <div style="font-size: 9px; margin-top: 6px;">Thank you for parking with us!</div>
            <div style="font-size: 8px;">Gate Out Authorized</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setIsPrinted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Exit Tax Invoice</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 58mm Thermal Invoice Body */}
        <div className="p-5 overflow-y-auto max-h-[75vh] space-y-3 font-mono text-xs text-slate-700 bg-white">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 font-bold text-sm text-slate-900">
              <Car className="w-4 h-4 text-emerald-600" />
              <span className="tracking-tight">BIZFLOW PARKING</span>
            </div>
            <p className="text-[10px] text-slate-500 font-sans">Official Exit Settlement Receipt</p>
          </div>

          <div className="border-t border-dashed border-slate-300 my-2" />

          {/* QR Code */}
          <div className="flex flex-col items-center justify-center py-1">
            <div
              className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <span className="text-[10px] text-slate-400 mt-1 font-mono">#{record.ticketNumber}</span>
          </div>

          {/* Vehicle Plate Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl py-2 px-3 text-center">
            <div className="font-sans text-xl font-black text-emerald-950 tracking-wider">
              {normalizedPlate}
            </div>
            <div className="text-[11px] font-semibold text-emerald-800 font-sans mt-0.5">
              {formatVehicleType(record.vehicleType)}
            </div>
          </div>

          <div className="border-t border-dashed border-slate-300 my-2" />

          {/* Timing Details */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Ticket No:</span>
              <span className="font-bold text-slate-800">#{record.ticketNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Entry:</span>
              <span>{formatDateTime(record.entryTime)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Exit:</span>
              <span>{formatDateTime(record.exitTime || new Date())}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 pt-0.5">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                Stay Duration:
              </span>
              <span className="text-emerald-700">{durationStr}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-300 my-2" />

          {/* Settlement Breakdown */}
          <div className="space-y-1.5 text-[11px]">
            <div className="font-bold text-slate-900 font-sans text-xs">Stay Charges & Breakdown</div>
            <div className="flex justify-between text-slate-600">
              <span>Gross Parking Fee:</span>
              <span>{formatCurrency(record.grossCharge || 0)}</span>
            </div>
            {record.advanceAmount > 0 && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>Advance Paid ({advanceMethodLabel}):</span>
                  <span>{formatCurrency(record.advanceAmount)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Advance Adjusted:</span>
                  <span>-{formatCurrency(record.advanceAmount)}</span>
                </div>
              </>
            )}
            {(record.balanceDue || 0) > 0 && (
              <div className="flex justify-between font-bold text-slate-900 pt-1 text-xs border-t border-dashed border-slate-200">
                <span>Final Balance Paid:</span>
                <span className="text-emerald-700">{formatCurrency(record.balanceDue || 0)} ({paymentMethodLabel})</span>
              </div>
            )}
            {(record.refundAmount || 0) > 0 && (
              <div className="flex justify-between font-bold text-amber-700 pt-1 text-xs border-t border-dashed border-slate-200">
                <span>Refund Handed Back:</span>
                <span>{formatCurrency(record.refundAmount || 0)} ({paymentMethodLabel})</span>
              </div>
            )}
            {(!record.balanceDue && !record.refundAmount) && (
              <div className="flex justify-between font-bold text-slate-800 pt-1 text-xs border-t border-dashed border-slate-200">
                <span>Settlement Status:</span>
                <span>₹0 (Full Exemption)</span>
              </div>
            )}
          </div>

          <div className="border-t border-dashed border-slate-300 my-2" />

          {/* Cross-Shift Audit Trail */}
          <div className="space-y-1 text-[10px] text-slate-500">
            <div className="font-bold text-slate-700 font-sans">Shift Audit Trail</div>
            <div>Entry Guard: {record.entryGuardName} ({record.entryShift})</div>
            {record.advanceAmount > 0 && (
              <div>Advance Coll: {record.advanceCollectorGuardName || record.entryGuardName} ({record.advanceCollectorShift || record.entryShift})</div>
            )}
            <div>Exit Guard: {record.exitGuardName || 'Duty Guard'} ({record.exitShift || 'Shift 1'})</div>
          </div>

          <div className="border-t border-dashed border-slate-300 my-2" />

          {/* Settled Badge */}
          <div className="text-center pt-1">
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold tracking-wide">
              <Check className="w-3 h-3" />
              SETTLED & EXITED
            </span>
            <p className="text-[10px] text-slate-400 mt-1">Thank you for parking with us</p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2">
          <Button
            variant="primary"
            className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs"
            onClick={handlePrint}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isPrinted ? 'Print Receipt Again' : 'Print Thermal Receipt (58mm)'}</span>
          </Button>

          <Button
            variant="outline"
            className="w-full py-1.5 text-xs font-medium text-slate-600"
            onClick={onClose}
          >
            Done & Close
          </Button>
        </div>
      </div>
    </div>
  );
};
