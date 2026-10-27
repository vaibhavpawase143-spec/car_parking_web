import React, { useState } from 'react';
import { Printer, Share2, X } from 'lucide-react';
import { ParkingRecord } from '../../../types';
import { formatCurrency, formatDateTime, formatVehicleType, normalizeVehicleNumber } from '../../../utils/formatters';
import { generateQrSvg } from '../../../utils/qrGenerator';
import { Button } from '../../../components/common/Button';

interface EntrySlipModalProps {
  isOpen: boolean;
  record: ParkingRecord | null;
  onClose: () => void;
  onReturnDashboard: () => void;
}

export const EntrySlipModal: React.FC<EntrySlipModalProps> = ({
  isOpen,
  record,
  onClose,
  onReturnDashboard,
}) => {
  const [isPrinted, setIsPrinted] = useState(false);
  const [whatsAppOpened, setWhatsAppOpened] = useState(false);

  if (!isOpen || !record) return null;

  const qrSvg = generateQrSvg(record.ticketNumber, 150);
  const normalizedPlate = normalizeVehicleNumber(record.vehicleNumber);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
      window.print();
      setIsPrinted(true);
      return;
    }

    const advanceLine = record.advanceAmount > 0
      ? '<div class="row"><span class="bold">Advance:</span><span class="bold">' + formatCurrency(record.advanceAmount) + ' (' + (record.advancePaymentMethod || 'cash').toUpperCase() + ')</span></div>'
      : '';
    const passLine = record.isMonthlyPass
      ? '<div class="row"><span class="bold">Pass:</span><span class="bold">MONTHLY PASS VALID</span></div>'
      : '';
    const mobileLine = record.customerMobile
      ? '<div class="row"><span>Mobile:</span><span>' + record.customerMobile + '</span></div>'
      : '';

    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt-' + record.ticketNumber + '</title><style>@page { size: 58mm auto; margin: 0; } body { width: 54mm; margin: 0 auto; padding: 3mm 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #000; font-size: 11px; line-height: 1.25; } .center { text-align: center; } .bold { font-weight: bold; } .title { font-size: 14px; margin-bottom: 2px; } .subtitle { font-size: 9px; color: #333; margin-bottom: 6px; } .divider { border-bottom: 1px dashed #000; margin: 4px 0; } .row { display: flex; justify-content: space-between; margin: 2px 0; } .qr { margin: 6px auto; display: flex; justify-content: center; } .footer { font-size: 8px; text-align: center; margin-top: 6px; }</style></head><body><div class="center bold title">PARKING RECEIPT</div><div class="center subtitle">Car Parking System</div><div class="divider"></div><div class="row"><span class="bold">Ticket:</span><span class="bold">' + record.ticketNumber + '</span></div><div class="row"><span>Vehicle:</span><span class="bold">' + normalizedPlate + '</span></div><div class="row"><span>Type:</span><span>' + formatVehicleType(record.vehicleType) + '</span></div><div class="row"><span>Entry:</span><span>' + formatDateTime(record.entryTime) + '</span></div><div class="row"><span>Guard:</span><span>' + record.entryGuardName + '</span></div><div class="row"><span>Shift:</span><span>' + record.entryShift + '</span></div>' + mobileLine + advanceLine + passLine + '<div class="divider"></div><div class="qr">' + qrSvg + '</div><div class="divider"></div><div class="footer">Please retain slip for exit verification.<br/>BizFlow Parking Solutions</div></body></html>';

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      setIsPrinted(true);
    }, 250);
  };

  const handleSendWhatsApp = () => {
    const advanceLine = record.advanceAmount > 0
      ? '\nAdvance Paid: ' + formatCurrency(record.advanceAmount) + ' (' + (record.advancePaymentMethod || 'CASH').toUpperCase() + ')'
      : '';
    const passLine = record.isMonthlyPass ? '\nStatus: Monthly Pass Holder (Zero Advance)' : '';

    const message = 'Car Parking Entry Confirmation\n\nTicket No: ' + record.ticketNumber +
      '\nVehicle No: ' + normalizedPlate +
      '\nVehicle Type: ' + formatVehicleType(record.vehicleType) +
      '\nEntry Time: ' + formatDateTime(record.entryTime) + advanceLine + passLine +
      '\n\nPlease keep this message for exit verification.\n\nTicket / QR Reference:\n' + record.ticketNumber;

    const encoded = encodeURIComponent(message);
    const mobile = (record.customerMobile || '').trim();
    const url = mobile.length === 10
      ? 'https://wa.me/91' + mobile + '?text=' + encoded
      : 'https://wa.me/?text=' + encoded;

    window.open(url, '_blank', 'noopener,noreferrer');
    setWhatsAppOpened(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <span className="font-bold text-xs text-slate-800">58mm Digital Parking Slip</span>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Ticket Body */}
        <div className="p-6 bg-white space-y-4 font-mono text-xs text-slate-800">
          <div className="text-center space-y-1">
            <div className="font-bold text-base tracking-tight text-slate-900">PARKING RECEIPT</div>
            <div className="text-[10px] text-slate-500 uppercase">Bizflow Parking Terminal</div>
          </div>

          <div className="border-t border-dashed border-slate-300 pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Ticket No:</span>
              <span className="font-bold text-slate-900">{record.ticketNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Vehicle:</span>
              <span className="font-bold text-emerald-700">{normalizedPlate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Category:</span>
              <span>{formatVehicleType(record.vehicleType)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Entry Time:</span>
              <span>{formatDateTime(record.entryTime)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Guard / Shift:</span>
              <span>{record.entryGuardName} ({record.entryShift})</span>
            </div>
            {record.customerMobile && (
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Mobile:</span>
                <span>{record.customerMobile}</span>
              </div>
            )}
            {record.advanceAmount > 0 && (
              <div className="flex justify-between font-bold text-emerald-800 pt-1 border-t border-slate-100">
                <span className="font-sans">Advance Paid:</span>
                <span>{formatCurrency(record.advanceAmount)} ({(record.advancePaymentMethod || 'cash').toUpperCase()})</span>
              </div>
            )}
            {record.isMonthlyPass && (
              <div className="flex justify-between font-bold text-purple-700 pt-1 border-t border-slate-100">
                <span className="font-sans">Pass Status:</span>
                <span>VALID PASS</span>
              </div>
            )}
          </div>

          {/* QR Code Container */}
          <div className="border-t border-dashed border-slate-300 pt-3 flex flex-col items-center justify-center">
            <div
              className="p-2 bg-white border border-slate-200 rounded-lg shadow-xs"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <span className="text-[10px] text-slate-400 mt-1 font-mono tracking-wider">
              {record.ticketNumber}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 text-xs w-full justify-center"
            >
              <Printer className="w-3.5 h-3.5" />
              {isPrinted ? 'Print Again' : 'Print Slip'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSendWhatsApp}
              className="gap-1.5 text-xs w-full justify-center bg-emerald-600 hover:bg-emerald-700"
            >
              <Share2 className="w-3.5 h-3.5" />
              {whatsAppOpened ? 'WhatsApp Sent' : 'WhatsApp Slip'}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReturnDashboard}
            className="w-full text-xs text-slate-600 hover:text-slate-900"
          >
            Done & Return to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};
