// Flosmosis API Validation Schemas
// Compatible with: Next.js App Router, TypeScript strict mode, React Hook Form, Zod v4
// Source: research/zod-schemas.ts — integrated pre-Sprint 2 (updated for Zod v4)

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Shared Utilities
// ─────────────────────────────────────────────────────────────────────────────

const australianPhoneRegex = /^\+61\d{9}$/;

const australianPhoneField = z
  .string()
  .regex(australianPhoneRegex, 'Enter a valid Australian mobile number');

// ─────────────────────────────────────────────────────────────────────────────
// 1. WorkerPhoneVerifySchema
// ─────────────────────────────────────────────────────────────────────────────

export const WorkerPhoneVerifySchema = z.object({
  phone: australianPhoneField,
});

export type WorkerPhoneVerifyInput = z.infer<typeof WorkerPhoneVerifySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 2. ShiftStartSchema
// ─────────────────────────────────────────────────────────────────────────────

const DeviceMetadataSchema = z.object({
  userAgent: z.string(),
  platform: z.string(),
  timestamp: z.string().datetime({
    message: 'Device timestamp must be a valid ISO 8601 datetime string',
  }),
});

export type DeviceMetadataInput = z.infer<typeof DeviceMetadataSchema>;

export const ShiftStartSchema = z.object({
  workerId: z.string().uuid({ message: 'Worker ID must be a valid UUID' }),
  siteId: z.string().uuid({ message: 'Site ID must be a valid UUID' }),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
  gpsAccuracyMetres: z
    .number()
    .positive({ message: 'GPS accuracy must be a positive number of metres' })
    .optional(),
  deviceMetadata: DeviceMetadataSchema.optional(),
});

export type ShiftStartInput = z.infer<typeof ShiftStartSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 3. ShiftEndSchema
// ─────────────────────────────────────────────────────────────────────────────

// Zod v4: errorMap option removed from z.union — use .describe() or .refine() for custom messages
const BreakMinutesSchema = z.union([
  z.literal(0),
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal(60),
]).describe('Break duration must be 0, 15, 30, 45, or 60 minutes');

export type BreakMinutesInput = z.infer<typeof BreakMinutesSchema>;

export const ShiftEndSchema = z.object({
  shiftId: z.string().uuid({ message: 'Shift ID must be a valid UUID' }),
  endTime: z.string().datetime({
    message: 'End time must be a valid ISO 8601 datetime string',
  }),
  breakMinutes: BreakMinutesSchema,
  workerNote: z
    .string()
    .max(500, { message: 'Worker note must be 500 characters or fewer' })
    .optional(),
});

export type ShiftEndInput = z.infer<typeof ShiftEndSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 4. WorkerCreateSchema
// ─────────────────────────────────────────────────────────────────────────────

const payRateTransformer = z
  .string()
  .transform((val, ctx) => {
    const trimmed = val.trim();
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(trimmed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pay rate must be a valid hourly rate',
      });
      return z.NEVER;
    }
    const parsed = parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pay rate must be a valid hourly rate',
      });
      return z.NEVER;
    }
    return Math.round(parsed * 100) / 100;
  })
  .pipe(z.number().positive());

export const WorkerCreateSchema = z.object({
  firstName: z
    .string()
    .min(1, { message: 'First name is required' })
    .max(50, { message: 'First name must be 50 characters or fewer' }),
  lastName: z
    .string()
    .min(1, { message: 'Last name is required' })
    .max(50, { message: 'Last name must be 50 characters or fewer' }),
  phone: australianPhoneField,
  email: z
    .string()
    .email({ message: 'Enter a valid email address' })
    .optional()
    .or(z.literal('')),
  employeeId: z.string().min(1, {
    message: 'Employee ID is required for payroll export',
  }),
  payRate: payRateTransformer,
  awardClassification: z.string().optional(),
});

export type WorkerCreateInput = z.infer<typeof WorkerCreateSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 5. SiteCreateSchema
// ─────────────────────────────────────────────────────────────────────────────

export const SiteCreateSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'Site name is required' })
    .max(100, { message: 'Site name must be 100 characters or fewer' }),
  address: z.string().min(1, { message: 'Site address is required' }),
  siteCode: z
    .string()
    .min(1, { message: 'Site code is required' })
    .max(20, { message: 'Site code must be 20 characters or fewer' }),
  geofenceLat: z
    .number()
    .min(-90, { message: 'Latitude must be between -90 and 90 degrees' })
    .max(90, { message: 'Latitude must be between -90 and 90 degrees' })
    .optional(),
  geofenceLng: z
    .number()
    .min(-180, { message: 'Longitude must be between -180 and 180 degrees' })
    .max(180, { message: 'Longitude must be between -180 and 180 degrees' })
    .optional(),
  // Day 3 P3 bound — matches sites.geofence_radius_bounded CHECK
  // constraint added in migrations/202604220910_geofence_radius_cap.sql.
  // 50m floor prevents zero-area geofences; 1000m ceiling keeps the
  // Privacy Policy claim that geofences are work-site scoped meaningful.
  geofenceRadiusMetres: z
    .number()
    .int({ message: 'Geofence radius must be a whole number of metres' })
    .min(50, { message: 'Geofence radius must be at least 50 metres' })
    .max(1000, { message: 'Geofence radius must be no more than 1000 metres' })
    .default(200),
});

export type SiteCreateInput = z.infer<typeof SiteCreateSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema Registry
// ─────────────────────────────────────────────────────────────────────────────

export const schemas = {
  WorkerPhoneVerifySchema,
  ShiftStartSchema,
  ShiftEndSchema,
  WorkerCreateSchema,
  SiteCreateSchema,
} as const;
