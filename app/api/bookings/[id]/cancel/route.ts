import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { cancelBooking } from "@/lib/booking/engine";
import { DEPOSIT_UNIT_MINOR } from "@/lib/deposit";
import { notifyWaitlist } from "@/lib/notifications/notifyWaitlist";
import { notifyBookingCancelled } from "@/lib/notifications/notifyBookingCancelled";

/**
 * POST /api/bookings/[id]/cancel
 * 
 * Server-side cancellation handler. Validates auth, calls the engine,
 * returns the forfeiture verdict; the money action lives in the caller.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const bookingId = id;

  // Verify the booking belongs to the authenticated user
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    return NextResponse.json(
      { error: "Booking not found" },
      { status: 404 },
    );
  }

  // Get user from DB to cross-check
  const fitlabUser = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
  });

  if (!fitlabUser || booking.userId !== fitlabUser.id) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  // Call the engine
  const result = await cancelBooking(prisma, bookingId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: 400 },
    );
  }

  // Money side (lib/deposit.ts): the deposit was never debited by the booking,
  // so a timely cancel moves nothing — the client keeps it. A LATE cancel is
  // exactly the case the deposit exists for: burn one. On-site bookings never
  // had a recorded deposit behind them, so they stay untouched.
  const depositBurned =
    result.depositForfeited &&
    (booking.source === "card" || booking.source === "balance");
  if (depositBurned) {
    await prisma.user.updateMany({
      where: { id: fitlabUser.id, depositBalance: { gte: DEPOSIT_UNIT_MINOR } },
      data: { depositBalance: { decrement: DEPOSIT_UNIT_MINOR } },
    });
  }
  // The client keeps their deposit whenever it wasn't burned.
  const depositReturned = !result.depositForfeited;

  // Notify the client (confirmation) + admins (freed spot). Best-effort.
  try {
    await notifyBookingCancelled(bookingId, { byAdmin: false, depositReturned });
  } catch (err) {
    console.error("[cancel] notifyBookingCancelled failed", err);
  }

  // Spot just opened up — walk the waitlist (best effort, never blocks).
  try {
    await notifyWaitlist(booking.scheduledClassId);
  } catch (err) {
    console.error("[cancel] notifyWaitlist failed", err);
  }

  // Return the verdict
  return NextResponse.json({
    ok: true,
    depositForfeited: result.depositForfeited,
  });
}
