import React from 'react';
import { AlertCircle, Home } from 'lucide-react';
import { Button } from './Button';

interface NotFoundProps {
  onGoHome: () => void;
}

export const NotFound: React.FC<NotFoundProps> = ({ onGoHome }) => {
  return (
    <div className="max-w-md mx-auto my-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
        <AlertCircle className="w-8 h-8" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Page Not Found</h2>
      <p className="text-sm text-slate-500 mt-2 mb-6">
        The route or view you are looking for does not exist or has been relocated.
      </p>
      <Button
        variant="primary"
        onClick={onGoHome}
        icon={<Home className="w-4 h-4" />}
      >
        Return to Overview
      </Button>
    </div>
  );
};
