export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
  }).format(rounded);
}

export function formatDate(date: Date | string | number | null | undefined): string {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatTime(date: Date | string | number | null | undefined): string {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function formatDateTime(date: Date | string | number | null | undefined): string {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';

  return `${formatDate(d)}, ${formatTime(d)}`;
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 0) durationMs = 0;
  const totalMinutes = Math.floor(durationMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Normalizes an Indian vehicle registration number:
 * - Removes all whitespace
 * - Removes all hyphens
 * - Converts to uppercase
 */
export function normalizeVehicleNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/[\s\-]/g, '').toUpperCase();
}

/**
 * Validates an Indian vehicle registration number.
 * Accepts standard state-code registrations (e.g. MH12AB1234, MH12A1234, MH12AB123)
 * and Bharat (BH) series registrations (e.g. 22BH1234AA).
 */
export function isValidVehicleNumber(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = normalizeVehicleNumber(value);
  if (normalized.length < 5 || normalized.length > 13) return false;

  const standardPattern = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,5}[A-Z]?$/;
  const bhPattern = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

  return standardPattern.test(normalized) || bhPattern.test(normalized);
}

/**
 * Validates a customer's local Indian mobile number:
 * - Exactly 10 numeric digits
 * - First digit must be 6, 7, 8, or 9
 */
export function isValidCustomerMobile(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length !== 10) return false;
  return /^[6-9]\d{9}$/.test(trimmed);
}

export function formatVehicleType(type: string): string {
  const clean = type.toLowerCase();
  if (clean.includes('two') || clean === '2w') return 'Two-Wheeler';
  if (clean.includes('four') || clean === '4w') return 'Four-Wheeler';
  return type;
}

/**
 * Formats duration with live seconds for elapsed parking timers:
 * e.g. "1h 24m 35s" or "14m 20s" or "45s"
 */
export function formatLiveDuration(durationMs: number): string {
  if (durationMs < 0) durationMs = 0;
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
