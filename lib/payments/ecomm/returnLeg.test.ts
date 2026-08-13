import { describe, expect, it } from "vitest";
import {
  describeUnidentifiedReturn,
  resolveReturnBookingId,
} from "./returnLeg";

/** A cross-site form POST shaped like the bank's return leg. */
function bankPost(fields: Record<string, string>, headers: HeadersInit = {}) {
  const body = new URLSearchParams(fields).toString();
  return new Request("https://fitlabvarna.com/api/payments/ecomm/return", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body,
  });
}

describe("resolveReturnBookingId", () => {
  it("prefers the cookie — it is ours, the body is not", async () => {
    const r = await resolveReturnBookingId(
      bankPost({ booking_id: "from-body" }),
      "from-cookie",
    );
    expect(r).toEqual({ bookingId: "from-cookie", source: "cookie" });
  });

  it("falls back to booking_id when the cross-site cookie never arrived", async () => {
    const r = await resolveReturnBookingId(bankPost({ booking_id: "abc123" }), undefined);
    expect(r).toEqual({ bookingId: "abc123", source: "body" });
  });

  it("treats a blank cookie as absent", async () => {
    const r = await resolveReturnBookingId(bankPost({ booking_id: "abc123" }), "   ");
    expect(r).toEqual({ bookingId: "abc123", source: "body" });
  });

  it("trims both sources", async () => {
    expect(
      await resolveReturnBookingId(bankPost({ booking_id: " padded " }), undefined),
    ).toEqual({ bookingId: "padded", source: "body" });
    expect(await resolveReturnBookingId(bankPost({}), " padded ")).toEqual({
      bookingId: "padded",
      source: "cookie",
    });
  });

  it("reports `none` when neither path carries an id", async () => {
    const r = await resolveReturnBookingId(bankPost({ trans_id: "x" }), undefined);
    expect(r).toEqual({ bookingId: null, source: "none" });
  });

  it("survives a body that is not a form — a probe, not the bank", async () => {
    const request = new Request("https://fitlabvarna.com/api/payments/ecomm/return", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"hello":"world"}',
    });
    await expect(resolveReturnBookingId(request, undefined)).resolves.toEqual({
      bookingId: null,
      source: "none",
    });
  });

  it("survives a GET with no body at all", async () => {
    const request = new Request("https://fitlabvarna.com/api/payments/ecomm/return");
    await expect(resolveReturnBookingId(request, undefined)).resolves.toEqual({
      bookingId: null,
      source: "none",
    });
  });
});

describe("describeUnidentifiedReturn", () => {
  it("separates a bare probe from a real return leg", () => {
    const probe = new Request("https://fitlabvarna.com/api/payments/ecomm/return", {
      headers: { "user-agent": "curl/8.4.0" },
    });
    const line = describeUnidentifiedReturn(probe);
    expect(line).toContain("method=GET");
    expect(line).toContain("cookie-header=absent");
    expect(line).toContain("curl/8.4.0");
  });

  it("records that a cookie header did arrive, without echoing it", () => {
    const line = describeUnidentifiedReturn(
      bankPost({}, { cookie: "ecomm_booking=secret-value" }),
    );
    expect(line).toContain("method=POST");
    expect(line).toContain("cookie-header=present");
    expect(line).not.toContain("secret-value");
  });

  it("says so plainly when there is no user agent", () => {
    expect(
      describeUnidentifiedReturn(
        new Request("https://fitlabvarna.com/api/payments/ecomm/return"),
      ),
    ).toContain("<no user-agent>");
  });

  it("caps a hostile user agent instead of writing it whole into the log", () => {
    const line = describeUnidentifiedReturn(
      new Request("https://fitlabvarna.com/api/payments/ecomm/return", {
        headers: { "user-agent": "A".repeat(5000) },
      }),
    );
    expect(line.length).toBeLessThan(300);
  });
});
