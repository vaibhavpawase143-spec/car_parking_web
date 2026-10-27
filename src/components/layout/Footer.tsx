import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div>
          <span>© 2026 Jay Ganesh Pay & Park. Powered by </span>
          <span className="font-semibold text-slate-700">BIZFLOW</span>
          <span>. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-medium text-slate-600">Web Application • Phase 1 Foundation</span>
          <span>•</span>
          <span className="text-slate-400">Project: car-parking-system-2026</span>
        </div>
      </div>
    </footer>
  );
};
