import { z } from 'zod';
import { INDIAN_MOBILE_REGEX, LOCATION_CODE_REGEX, TIME_REGEX } from '../config/constants.js';

export const ratesSchema = z.object({
  fourWheelerFirstHourRate: z.number().min(0, '4W 1st hour rate must be >= 0'),
  fourWheelerAdditionalHourRate: z.number().min(0, '4W additional hour rate must be >= 0'),
  fourWheeler12HourCap: z.number().min(0, '4W 12-hour cap must be >= 0'),
  fourWheeler24HourCap: z.number().min(0, '4W 24-hour cap must be >= 0'),
  fourWheelerMonthlyRate: z.number().min(0, '4W monthly rate must be >= 0'),
  twoWheelerFirstHourRate: z.number().min(0, '2W 1st hour rate must be >= 0'),
  twoWheelerAdditionalHourRate: z.number().min(0, '2W additional hour rate must be >= 0'),
  twoWheeler12HourCap: z.number().min(0, '2W 12-hour cap must be >= 0'),
  twoWheeler24HourCap: z.number().min(0, '2W 24-hour cap must be >= 0'),
  twoWheelerMonthlyRate: z.number().min(0, '2W monthly rate must be >= 0'),
}).superRefine((rates, ctx) => {
  if (rates.fourWheeler12HourCap < rates.fourWheelerFirstHourRate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Four-Wheeler 12-hour cap cannot be less than 1st hour base rate.',
      path: ['fourWheeler12HourCap'],
    });
  }
  if (rates.fourWheeler24HourCap < rates.fourWheeler12HourCap) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Four-Wheeler 24-hour daily cap cannot be less than 12-hour cap.',
      path: ['fourWheeler24HourCap'],
    });
  }
  if (rates.twoWheeler12HourCap < rates.twoWheelerFirstHourRate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Two-Wheeler 12-hour cap cannot be less than 1st hour base rate.',
      path: ['twoWheeler12HourCap'],
    });
  }
  if (rates.twoWheeler24HourCap < rates.twoWheeler12HourCap) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Two-Wheeler 24-hour daily cap cannot be less than 12-hour cap.',
      path: ['twoWheeler24HourCap'],
    });
  }
});

export const capacitySchema = z.object({
  carTotal: z.number().int('Car capacity must be an integer').min(1, 'Car capacity must be at least 1'),
  twoWheelerTotal: z.number().int('2W capacity must be an integer').min(1, 'Two-Wheeler capacity must be at least 1'),
});

export const operatingHoursSchema = z.object({
  openTime: z.string().trim(),
  closeTime: z.string().trim(),
  is24Hours: z.boolean(),
}).superRefine((hours, ctx) => {
  if (!hours.is24Hours) {
    if (!TIME_REGEX.test(hours.openTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Opening time must be in 24-hour HH:mm format (e.g. 06:00).',
        path: ['openTime'],
      });
    }
    if (!TIME_REGEX.test(hours.closeTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Closing time must be in 24-hour HH:mm format (e.g. 23:00).',
        path: ['closeTime'],
      });
    }
  }
});

export const featuresSchema = z.object({
  cashEnabled: z.boolean().default(true),
  upiEnabled: z.boolean().default(true),
  advanceEnabled: z.boolean().default(true),
  overnightParkingAllowed: z.boolean().default(true),
  allowManagerRateEdits: z.boolean().optional().default(false),
});

export const createLocationSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(LOCATION_CODE_REGEX, 'Location code must be strictly 3 to 5 uppercase alphanumeric characters.'),
  name: z.string().trim().min(2, 'Location name is required (minimum 2 characters).'),
  marathiName: z.string().trim().min(2, 'Marathi location name is required.'),
  locationName: z.string().trim().min(2, 'Counter/landmark name is required.'),
  marathiLocationName: z.string().trim().min(2, 'Marathi counter/landmark name is required.'),
  address: z.string().trim().min(5, 'Physical address must be at least 5 characters.'),
  authorityLicenseText: z.string().trim().optional().default(''),
  contactMobile: z
    .string()
    .trim()
    .regex(INDIAN_MOBILE_REGEX, 'Contact mobile must be a valid 10-digit Indian mobile starting with 6, 7, 8, or 9.'),
  capacity: capacitySchema,
  rates: ratesSchema,
  operatingHours: operatingHoursSchema,
  features: featuresSchema,
});

export const updateLocationSchema = z.object({
  locationId: z.string().trim().min(3, 'Valid locationId is required.'),
  name: z.string().trim().min(2, 'Location name is required (minimum 2 characters).'),
  marathiName: z.string().trim().min(2, 'Marathi location name is required.'),
  locationName: z.string().trim().min(2, 'Counter/landmark name is required.'),
  marathiLocationName: z.string().trim().min(2, 'Marathi counter/landmark name is required.'),
  address: z.string().trim().min(5, 'Physical address must be at least 5 characters.'),
  authorityLicenseText: z.string().trim().optional(),
  contactMobile: z
    .string()
    .trim()
    .regex(INDIAN_MOBILE_REGEX, 'Contact mobile must be a valid 10-digit Indian mobile starting with 6, 7, 8, or 9.'),
  capacity: capacitySchema.optional(),
  rates: ratesSchema.optional(),
  operatingHours: operatingHoursSchema,
  features: featuresSchema,
});

export const deactivateLocationSchema = z.object({
  locationId: z.string().trim().min(3, 'Valid locationId is required.'),
  reason: z.string().trim().min(5, 'Deactivation reason must be at least 5 characters.'),
});
