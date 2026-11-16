import { z } from 'zod';
import { VEHICLE_CLASSES } from '@d-services/charging';

export const id = z.uuid();
export const idParam = z.object({ id });
export const cents = z.number().int().min(0).max(2_000_000_000);
export const vehicleClass = z.enum(VEHICLE_CLASSES);

export const place = z.object({
  address: z.string().trim().min(1).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** A fee is either a percentage (in basis points) or a fixed amount in cents. */
export const feeRule = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PERCENTAGE'), bps: z.number().int().min(0).max(10000) }),
  z.object({ type: z.literal('FIXED'), cents }),
]);
export type FeeRuleInput = z.infer<typeof feeRule>;

export const feeColumns = (fee: FeeRuleInput) => ({
  feeType: fee.type,
  feeBps: fee.type === 'PERCENTAGE' ? fee.bps : 0,
  feeFixedCents: fee.type === 'FIXED' ? fee.cents : 0,
});
