import { VehicleCategory } from '../types';

export interface FeeCalculationResult {
  durationMs: number;
  totalMinutes: number;
  billableHours: number;
  grossCharge: number;
  advancePaid: number;
  balanceDue: number;
  refundAmount: number;
}

export interface FeeRateConfig {
  twoWheelerFirstHourRate?: number;
  twoWheelerAdditionalHourRate?: number;
  twoWheeler12HourCap?: number;
  fourWheelerFirstHourRate?: number;
  fourWheelerAdditionalHourRate?: number;
  fourWheeler12HourCap?: number;
}

const DEFAULT_RATES: Required<FeeRateConfig> = {
  twoWheelerFirstHourRate: 20,
  twoWheelerAdditionalHourRate: 5,
  twoWheeler12HourCap: 60,
  fourWheelerFirstHourRate: 50,
  fourWheelerAdditionalHourRate: 10,
  fourWheeler12HourCap: 150,
};

/**
 * Calculates billable parking hours from total minutes stay.
 * Matches Flutter's FeeCalculator.calculateBillableHours:
 * - 0 minutes: 0 billable hours
 * - 1 to 60 minutes: 1 billable hour
 * - 61 to 120 minutes: 2 billable hours
 * - Each additional 60-minute interval adds 1 billable hour.
 */
export function calculateBillableHours(totalMinutes: number): number {
  if (totalMinutes <= 0) return 0;
  return Math.ceil(totalMinutes / 60);
}

/**
 * Calculates parking fee according to approved rates, 12-hour caps, and advance payment adjustments.
 * Matches Flutter's FeeCalculator.calculate.
 */
export function calculateParkingFee(params: {
  vehicleType: VehicleCategory;
  entryTime: Date;
  exitTime?: Date;
  advancePaid?: number;
  isMonthlyPass?: boolean;
  rates?: FeeRateConfig;
}): FeeCalculationResult {
  const {
    vehicleType,
    entryTime,
    exitTime = new Date(),
    advancePaid = 0,
    isMonthlyPass = false,
    rates = DEFAULT_RATES,
  } = params;

  const resolvedRates = { ...DEFAULT_RATES, ...rates };
  const typeStr = (vehicleType || 'fourWheeler').toLowerCase();
  const isTwoWheeler = typeStr.includes('two') || typeStr === '2w';

  const entryMs = entryTime instanceof Date ? entryTime.getTime() : new Date(entryTime).getTime();
  const exitMs = exitTime instanceof Date ? exitTime.getTime() : new Date(exitTime).getTime();
  const diffMs = Math.max(0, exitMs - entryMs);

  // If vehicle has a valid Monthly Pass, parking fee is strictly ₹0
  if (isMonthlyPass) {
    const totalMinutes = Math.floor(diffMs / 60000);
    return {
      durationMs: diffMs,
      totalMinutes,
      billableHours: 0,
      grossCharge: 0,
      advancePaid,
      balanceDue: 0,
      refundAmount: advancePaid > 0 ? advancePaid : 0,
    };
  }

  // True zero duration
  if (diffMs <= 0) {
    return {
      durationMs: 0,
      totalMinutes: 0,
      billableHours: 0,
      grossCharge: 0,
      advancePaid,
      balanceDue: 0,
      refundAmount: advancePaid > 0 ? advancePaid : 0,
    };
  }

  // Any started stay (>0s) has at least 1 minute billable basis
  const rawMinutes = Math.floor(diffMs / 60000);
  const totalMinutes = rawMinutes < 1 ? 1 : rawMinutes;
  const billableHours = calculateBillableHours(totalMinutes);

  const firstHourRate = isTwoWheeler
    ? resolvedRates.twoWheelerFirstHourRate
    : resolvedRates.fourWheelerFirstHourRate;

  const additionalHourRate = isTwoWheeler
    ? resolvedRates.twoWheelerAdditionalHourRate
    : resolvedRates.fourWheelerAdditionalHourRate;

  const twelveHourCap = isTwoWheeler
    ? resolvedRates.twoWheeler12HourCap
    : resolvedRates.fourWheeler12HourCap;

  let grossCharge = 0;
  if (billableHours <= 1) {
    grossCharge = firstHourRate;
  } else {
    const additionalHours = billableHours - 1;
    grossCharge = firstHourRate + additionalHours * additionalHourRate;
  }

  // Apply 12-hour cap
  if (billableHours <= 12) {
    grossCharge = Math.min(grossCharge, twelveHourCap);
  } else {
    const hoursBeyond12 = billableHours - 12;
    grossCharge = twelveHourCap + hoursBeyond12 * additionalHourRate;
  }

  const balanceDue = Math.max(0, grossCharge - advancePaid);
  const refundAmount = Math.max(0, advancePaid - grossCharge);

  return {
    durationMs: diffMs,
    totalMinutes,
    billableHours,
    grossCharge,
    advancePaid,
    balanceDue,
    refundAmount,
  };
}
