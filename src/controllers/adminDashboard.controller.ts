import { Request, Response } from "express";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { sendTsRestSuccess } from "../lib/responseHandler.js";
import Hub from "../models/storageHub.model.js";
import Booking from "../models/booking.model.js";
import Payment from "../models/payment.model.js";

// current-period-vs-previous-period growth, used by every stat card
const percentChange = (current: number, previous: number): number => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
};

type RangeKey = "today" | "7d" | "30d" | "custom";

const resolveRange = (
  req: Request,
): { start: Date; end: Date; previousStart: Date; previousEnd: Date } => {
  const now = new Date();
  const rangeKey = (req.query.range as RangeKey) || "30d";

  if (rangeKey === "custom") {
    const start = new Date(req.query.startDate as string);
    const end = new Date(req.query.endDate as string);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
      const durationMs = end.getTime() - start.getTime();
      return {
        start,
        end,
        previousStart: new Date(start.getTime() - durationMs),
        previousEnd: start,
      };
    }
  }
  if (rangeKey === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      start,
      end: now,
      previousStart: new Date(start.getTime() - 24 * 60 * 60 * 1000),
      previousEnd: start,
    };
  }
  const days = rangeKey === "7d" ? 7 : 30;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    start,
    end: now,
    previousStart: new Date(start.getTime() - days * 24 * 60 * 60 * 1000),
    previousEnd: start,
  };
};

export const getDashBoardOverview = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const { start, end, previousStart, previousEnd } = resolveRange(req);

    const [
      bookingsCurrent,
      bookingsPrevious,
      activeStorageCurrent,
      activeStoragePrevious,
      totalHubs,
      hubsCurrent,
      hubsPrevious,
      revenueCurrentAgg,
      revenuePreviousAgg,
    ] = await Promise.all([
      Booking.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      Booking.countDocuments({
        createdAt: { $gte: previousStart, $lt: previousEnd },
      }),
      Booking.countDocuments({ bookingStatus: "in_storage" }),
      Booking.countDocuments({
        bookingStatus: "in_storage",
        createdAt: { $gte: previousStart, $lt: previousEnd },
      }),
      Hub.countDocuments(),
      Hub.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      Hub.countDocuments({
        createdAt: { $gte: previousStart, $lt: previousEnd },
      }),
      Payment.aggregate([
        { $match: { status: "success", paidAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            status: "success",
            paidAt: { $gte: previousStart, $lt: previousEnd },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const revenueCurrent = revenueCurrentAgg[0]?.total ?? 0;
    const revenuePrevious = revenuePreviousAgg[0]?.total ?? 0;

    const stats = {
      totalBookings: {
        value: bookingsCurrent,
        change: percentChange(bookingsCurrent, bookingsPrevious),
      },
      activeStorage: {
        value: activeStorageCurrent,
        change: percentChange(activeStorageCurrent, activeStoragePrevious),
      },
      storageHubs: {
        value: totalHubs,
        change: percentChange(hubsCurrent, hubsPrevious),
      },
      revenue: {
        value: revenueCurrent,
        change: percentChange(revenueCurrent, revenuePrevious),
      },
    };

    const BUCKET_SIZE_DAYS: Record<string, number> = {
      daily: 1,
      weekly: 7,
      monthly: 30,
    };
    const chartGranularity =
      typeof req.query.granularity === "string"
        ? req.query.granularity
        : "weekly";
    const bucketSizeDays =
      BUCKET_SIZE_DAYS[chartGranularity] ?? BUCKET_SIZE_DAYS.weekly;
    const bucketSizeMs = bucketSizeDays * 24 * 60 * 60 * 1000;
    const bucketCount = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / bucketSizeMs),
    );

    const bookingsInRange = await Booking.find({
      createdAt: { $gte: start, $lte: end },
    })
      .select("bookingStatus createdAt")
      .lean();

    const bucketLabel = (i: number): string =>
      chartGranularity === "monthly"
        ? `Month ${i + 1}`
        : chartGranularity === "daily"
          ? `Day ${i + 1}`
          : `Week ${i + 1}`;

    const bookingActivityBuckets = Array.from(
      { length: bucketCount },
      (_, i) => ({
        label: bucketLabel(i),
        confirmed: 0,
        completed: 0,
        cancelled: 0,
      }),
    );
    for (const booking of bookingsInRange) {
      const daysSinceStart = Math.floor(
        (booking.createdAt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
      );
      const bucketIndex = Math.min(
        Math.floor(daysSinceStart / bucketSizeDays),
        bucketCount - 1,
      );
      const bucket = bookingActivityBuckets[bucketIndex];

      if (
        booking.bookingStatus === "confirmed" ||
        booking.bookingStatus === "in_storage"
      ) {
        bucket.confirmed += 1;
      } else if (booking.bookingStatus === "completed") {
        bucket.completed += 1;
      } else if (booking.bookingStatus === "cancelled") {
        bucket.cancelled += 1;
      }
      // "pending" bookings are intentionally left out of this chart
    }

    //storage utilization
    const hubs = await Hub.find()
      .select("state totalCapacity availableCapacity")
      .lean();

    const occupiedPercent = (
      totalCapacity: number,
      availableCapacity: number,
    ): number =>
      totalCapacity > 0
        ? parseFloat(
            (
              ((totalCapacity - availableCapacity) / totalCapacity) *
              100
            ).toFixed(1),
          )
        : 0;

    const utilizationBucket = (
      percent: number,
    ): "healthy" | "getting_full" | "nearly_full" => {
      if (percent >= 90) return "nearly_full";
      if (percent >= 70) return "getting_full";
      return "healthy";
    };

    const stateTotals: Record<
      string,
      { totalCapacity: number; availableCapacity: number }
    > = {};

    let overallTotalCapacity = 0;
    let overallAvailableCapacity = 0;

    for (const hub of hubs) {
      overallTotalCapacity += hub.totalCapacity;
      overallAvailableCapacity += hub.availableCapacity;

      if (!stateTotals[hub.state]) {
        stateTotals[hub.state] = { totalCapacity: 0, availableCapacity: 0 };
      }
      stateTotals[hub.state].totalCapacity += hub.totalCapacity;
      stateTotals[hub.state].availableCapacity += hub.availableCapacity;
    }

    const storageUtilization = {
      overallOccupiedPercent: occupiedPercent(
        overallTotalCapacity,
        overallAvailableCapacity,
      ),
      states: Object.entries(stateTotals)
        .map(([state, capacity]) => {
          const percent = occupiedPercent(
            capacity.totalCapacity,
            capacity.availableCapacity,
          );
          return {
            state,
            occupiedPercent: percent,
            bucket: utilizationBucket(percent),
          };
        })
        .sort((a, b) => b.occupiedPercent - a.occupiedPercent),
    };

    interface RecentBookingHub {
      name: string;
      state: string;
      lga: string;
    }

    interface RecentBookingLean {
      bookingId: string;
      fullName: string;
      hub: RecentBookingHub | null;
      cropType: string;
      quantity: number;
      unitType: string;
      totalAmount: number;
      bookingStatus: string;
    }

    const recentBookings = (await Booking.find({
      createdAt: { $gte: start, $lte: end },
    })
      .select(
        "bookingId fullName hub cropType quantity unitType totalAmount bookingStatus",
      )
      .populate("hub", "name state lga")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()) as unknown as RecentBookingLean[];

    const formattedRecentBookings = recentBookings.map((booking) => ({
      bookingId: booking.bookingId,
      farmerName: booking.fullName,
      storageHub: booking.hub?.name ?? null,
      location: booking.hub ? `${booking.hub.lga}, ${booking.hub.state}` : null,
      crop: booking.cropType,
      quantity: `${booking.quantity} ${booking.unitType}`,
      amount: booking.totalAmount,
      status: booking.bookingStatus,
    }));

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Dashboard overview retrieved successfully",
      data: {
        stats,
        bookingActivityBuckets,
        storageUtilization,
        recentBookings: formattedRecentBookings,
      },
    });
  },
);
