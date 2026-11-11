// Shared hub validation + pricing calculation used by both the public and admin booking flows.
// Keeping this in one place avoids the two flows drifting apart (e.g. one applying the bulk
// discount and the other not).

export const DEPOSIT_RATE = 0.3;
export const BULK_UNIT_THRESHOLD = 100;
export const LONG_TERM_DURATION_THRESHOLD = 30;

export interface BookingHub {
  availableCapacity: number;
  supportedCrops: string[];
  unitType: string;
  pricePerBagPerDay: number;
  pricePerCratePerDay: number;
  priceBulk100Units: number;
  priceLongTerm100Units: number;
  serviceFeeRate: number;
  bulkDiscountEnabled: boolean;
  longTermDiscountEnabled: boolean;
}

export interface ValidationError {
  status: number;
  message: string;
}

export interface BookingPricing {
  dailyPricePerUnit: number;
  storageFee: number;
  serviceFee: number;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
}

export const normalizeUnitType = (unitType?: string): string =>
  (unitType || "bags").toLowerCase();

export const isCrateUnit = (unitType: string): boolean =>
  unitType === "crates" || unitType === "crate";

// Checks capacity, crop support and unit-type compatibility for a hub. Returns
// null when the request is valid, or the first validation error encountered.
export const validateHubForBooking = (
  hub: BookingHub,
  quantity: number,
  selectedCrop: string,
  unitType: string,
): ValidationError | null => {
  if (quantity > hub.availableCapacity) {
    return {
      status: 400,
      message: `Requested quantity (${quantity}) exceeds available hub capacity (${hub.availableCapacity})`,
    };
  }

  const isCropSupported = hub.supportedCrops.some(
    (crop) => crop.toLowerCase() === selectedCrop.toLowerCase(),
  );
  if (!isCropSupported) {
    return {
      status: 400,
      message: `This storage hub does not support "${selectedCrop}". Supported crops: ${hub.supportedCrops.join(", ")}`,
    };
  }

  const hubUnitType = hub.unitType.toLowerCase();
  if (hubUnitType !== "both" && hubUnitType !== unitType) {
    return {
      status: 400,
      message: `This storage facility only supports "${hub.unitType}" storage. You selected "${unitType}".`,
    };
  }

  return null;
};

// Whole days between drop-off and pick-up. Callers are responsible for
// rejecting a result < 1.
export const calculateDurationInDays = (
  dropOffDate: string | Date,
  pickUpDate: string | Date,
): number => {
  const start = new Date(dropOffDate).getTime();
  const end = new Date(pickUpDate).getTime();
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
};

export type BookingPricingResult = BookingPricing | ValidationError;

export const isPricingError = (
  result: BookingPricingResult,
): result is ValidationError => "status" in result;

export const calculateBookingPricing = (
  hub: BookingHub,
  quantity: number,
  unitType: string,
  totalDays: number,
  // "full" collapses the deposit/balance split into a single fully-paid amount.
  // Used by the admin flow when the customer already paid in full offline.
  paymentType: "deposit" | "full" = "deposit",
): BookingPricingResult => {
  const baseDailyRate = isCrateUnit(unitType)
    ? hub.pricePerCratePerDay
    : hub.pricePerBagPerDay;

  if (!baseDailyRate || baseDailyRate <= 0) {
    return {
      status: 400,
      message: `This facility does not offer valid pricing for ${unitType} storage`,
    };
  }

  // Highest eligible discount only — long-term (8%) takes priority over
  // bulk (5%) when a booking qualifies for both, rather than stacking them.
  const isBulk = quantity >= BULK_UNIT_THRESHOLD;
  const isLongTerm = isBulk && totalDays >= LONG_TERM_DURATION_THRESHOLD;

  let dailyPricePerUnit = baseDailyRate;
  if (isLongTerm && hub.longTermDiscountEnabled) {
    dailyPricePerUnit = hub.priceLongTerm100Units;
  } else if (isBulk && hub.bulkDiscountEnabled) {
    dailyPricePerUnit = hub.priceBulk100Units;
  }

  const storageFee = Math.round(dailyPricePerUnit * quantity * totalDays);
  const serviceFee = Math.round(storageFee * hub.serviceFeeRate);
  const totalAmount = storageFee + serviceFee;
  const depositAmount =
    paymentType === "full" ? totalAmount : Math.round(totalAmount * DEPOSIT_RATE);
  const balanceAmount = totalAmount - depositAmount;

  return {
    dailyPricePerUnit: parseFloat(dailyPricePerUnit.toFixed(2)),
    storageFee,
    serviceFee,
    totalAmount,
    depositAmount,
    balanceAmount,
  };
};
