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
 * returns the forfeiture verdict. Stripe refund logic is Phase 7.
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

  // If the deposit was NOT forfeited (timely cancel), return it — but only for
  // sources where a deposit actually moved. `balance` == a prepaid deposit was
  // consumed; returning it restores exactly one deposit. On-site bookings never
  // consumed a recorded deposit, so crediting them would mint a free deposit.
  const depositReturned =
    !result.depositForfeited &&
    (booking.source === "card" || booking.source === "balance");
  if (depositReturned) {
    await prisma.user.update({
      where: { id: fitlabUser.id },
      data: { depositBalance: { increment: DEPOSIT_UNIT_MINOR } },
    });
  }

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
