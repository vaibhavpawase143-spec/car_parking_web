import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X, Check, AlertCircle } from 'lucide-react';
import { Button } from '../common/Button';

interface WebCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCaptured: (blob: Blob, previewUrl: string) => void;
}

export const WebCameraModal: React.FC<WebCameraModalProps> = ({
  isOpen,
  onClose,
  onPhotoCaptured,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [deviceCount, setDeviceCount] = useState<number>(1);

  // Stop all active tracks
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async (mode: 'environment' | 'user') => {
    setIsLoading(true);
    setErrorMessage(null);
    stopStream();

    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setDeviceCount(videoDevices.length);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setIsLoading(false);
    } catch (err: unknown) {
      setIsLoading(false);
      const error = err as Error;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setErrorMessage('Camera permission was denied. Please allow camera access in browser settings.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setErrorMessage('No camera device was detected on this system.');
      } else {
        setErrorMessage('Camera initialization error: ' + (error.message || 'Unknown error'));
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedBlob(null);
      setCapturedUrl(null);
      startCamera(facingMode);
    } else {
      stopStream();
      if (capturedUrl) {
        URL.revokeObjectURL(capturedUrl);
      }
    }
    return () => {
      stopStream();
    };
  }, [isOpen]);

  const handleSwitchCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const handleCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedUrl(url);
        stopStream();
      },
      'image/jpeg',
      0.85
    );
  };

  const handleRetake = () => {
    if (capturedUrl) {
      URL.revokeObjectURL(capturedUrl);
      setCapturedUrl(null);
      setCapturedBlob(null);
    }
    startCamera(facingMode);
  };

  const handleConfirm = () => {
    if (capturedBlob && capturedUrl) {
      onPhotoCaptured(capturedBlob, capturedUrl);
      stopStream();
      onClose();
    }
  };

  const handleCancel = () => {
    stopStream();
    if (capturedUrl) {
      URL.revokeObjectURL(capturedUrl);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Vehicle Photo Capture</h3>
              <p className="text-[11px] text-slate-500">Required photo of vehicle and number plate</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewport Area */}
        <div className="relative bg-slate-950 aspect-4/3 flex items-center justify-center overflow-hidden">
          {errorMessage ? (
            <div className="p-6 text-center text-white space-y-3 max-w-xs">
              <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
              <p className="text-xs text-rose-200">{errorMessage}</p>
              <Button size="sm" variant="outline" className="text-white border-white/20 hover:bg-white/10" onClick={() => startCamera(facingMode)}>
                Retry Camera
              </Button>
            </div>
          ) : capturedUrl ? (
            <img src={capturedUrl} alt="Captured Vehicle" className="w-full h-full object-cover" />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {isLoading && (
                <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center text-white text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  Starting camera stream...
                </div>
              )}
            </>
          )}

          {/* Guidelines Overlay */}
          {!capturedUrl && !errorMessage && !isLoading && (
            <div className="absolute inset-6 border-2 border-dashed border-white/40 rounded-xl pointer-events-none flex items-center justify-center">
              <span className="text-[10px] text-white/70 bg-black/40 px-2 py-0.5 rounded-sm">
                Center number plate and vehicle
              </span>
            </div>
          )}
        </div>

        {/* Control Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          {capturedUrl ? (
            <>
              <Button variant="outline" size="sm" onClick={handleRetake} className="gap-1.5 text-xs">
                <RefreshCw className="w-3.5 h-3.5" />
                Retake
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirm} className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700">
                <Check className="w-3.5 h-3.5" />
                Confirm & Use Photo
              </Button>
            </>
          ) : (
            <>
              {deviceCount > 1 ? (
                <Button variant="outline" size="sm" onClick={handleSwitchCamera} className="gap-1.5 text-xs">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Flip Camera
                </Button>
              ) : (
                <div />
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleCapture}
                disabled={isLoading || Boolean(errorMessage)}
                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 px-5"
              >
                <Camera className="w-3.5 h-3.5" />
                Capture Photo
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
