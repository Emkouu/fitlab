import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { DepositReminder, type DepositReminderProps } from "./DepositReminder";

/**
 * Same tripwire as the confirmation email: `@react-email/render` is an optional
 * peer of `resend`, so a missing render package fails only at send time while
 * the build stays green. Beyond that, this email is about money that has NOT
 * been taken — so the test guards the wording that makes that true.
 */
const PROPS: DepositReminderProps = {
  greetingName: "Емил",
  practiceName: "Пилатес",
  dateText: "петък, 21.08.2026",
  timeText: "18:15 ч.",
  depositText: "10,00 €",
  payUrl: "https://fitlabvarna.com/pay/cm0abc123xyz",
  studioName: "FitLab Varna",
  studioAddress: "ул. Патриарх Евтимий 7а, Варна",
  studioPhone: "088 241 4863",
  logoUrl: "https://fitlabvarna.com/logo.png",
  footerSite: "https://fitlabvarna.com",
};

describe("DepositReminder", () => {
  it("renders", async () => {
    const html = await render(DepositReminder(PROPS));
    expect(html).toContain("Пилатес");
    expect(html).toContain("21.08.2026");
    expect(html).toContain("10,00 €");
  });

  it("says nothing was charged — the client abandoned before paying", async () => {
    const html = await render(DepositReminder(PROPS));
    expect(html).toContain("Нищо не е");
    expect(html).toContain("удържано");
  });

  it("links back to this booking's own payment page", async () => {
    const html = await render(DepositReminder(PROPS));
    expect(html).toContain("https://fitlabvarna.com/pay/cm0abc123xyz");
  });

  it("offers the desk as an alternative to the card", async () => {
    const html = await render(DepositReminder(PROPS));
    expect(html).toContain("рецепцията");
  });

  it("warns that an unpaid spot is not guaranteed", async () => {
    const html = await render(DepositReminder(PROPS));
    expect(html).toContain("не е гарантирано");
  });

  it("survives a client with no name on the profile", async () => {
    const html = await render(DepositReminder({ ...PROPS, greetingName: null }));
    expect(html).toContain("резервацията ти чака депозит");
  });
});
