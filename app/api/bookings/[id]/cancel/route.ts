import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { cancelBooking } from "@/lib/booking/engine";
import { notifyWaitlist } from "@/lib/notifications/notifyWaitlist";

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

  // If deposit was NOT forfeited, add it to user's balance — but only for
  // sources where money actually moved (card charge or balance debit).
  // On-site deposits were never charged, so crediting them here would mint
  // free balance for the user.
  if (!result.depositForfeited && (booking.source === "card" || booking.source === "balance")) {
    // Fetch booking with deposit amount
    const bookingWithClass = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { scheduledClass: { select: { depositAmount: true } } },
    });

    if (bookingWithClass) {
      const depositAmount = bookingWithClass.scheduledClass.depositAmount;
      // Add deposit to user's balance
      await prisma.user.update({
        where: { id: fitlabUser.id },
        data: {
          depositBalance: {
            increment: depositAmount,
          },
        },
      });
    }
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
