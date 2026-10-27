import React from 'react';
import { Printer } from 'lucide-react';

export const ReceiptTemplatePlaceholder: React.FC = () => {
  return (
    <div className="border border-dashed border-slate-300 rounded-lg p-6 bg-slate-50 text-center">
      <Printer className="w-8 h-8 text-slate-400 mx-auto mb-2" />
      <h4 className="text-sm font-semibold text-slate-700">58mm Thermal Print Engine Placeholder</h4>
      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
        HTML/CSS 58mm thermal templates utilizing @media print and OS print spooling will be implemented in a future phase.
      </p>
    </div>
  );
};
