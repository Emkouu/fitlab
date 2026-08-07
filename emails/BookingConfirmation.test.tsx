import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { BookingConfirmation, type BookingConfirmationProps } from "./BookingConfirmation";

/**
 * The confirmation email doubles as the electronic receipt the acquirer
 * requires (Fibank instruction §I.15), so this test guards two things at once:
 *
 * 1. That the email renders at all. `resend` renders React emails through
 *    `@react-email/render`, which it declares as an *optional* peer dependency —
 *    if that package goes missing, every send fails at runtime with „Failed to
 *    render React component" while the build and the type-check stay green.
 *    That happened in production; this test is the tripwire.
 * 2. That every field the bank prescribes actually reaches the HTML. A
 *    refactor that drops the merchant line or the order reference would breach
 *    what we told the acquirer, and nothing else in the suite would notice.
 */
const PROPS: BookingConfirmationProps = {
  greetingName: "Емил",
  practiceName: "Пилатес",
  dateText: "петък, 07.08.2026",
  timeText: "18:15 ч.",
  durationMinutes: 55,
  trainersText: "Йоанна Петрова",
  studioName: "FitLab Varna",
  studioAddress: "ул. Патриарх Евтимий 7а, Варна",
  studioPhone: "088 241 4863",
  depositText: "10,00 €",
  depositStatusText: "Платено онлайн",
  cancelWindowHours: 4,
  accountUrl: "https://fitlabvarna.com/account",
  logoUrl: "https://fitlabvarna.com/logo.png",
  footerSite: "https://fitlabvarna.com",
  bookingReference: "cm0abc123xyz",
  clientName: "Емил Атанасов",
  transactionDateText: "07.08.2026 г., 13:15",
  siteUrl: "https://fitlabvarna.com",
  classPriceText: "10,00 €",
  receiptUrl: "https://fitlabvarna.com/receipt/cm0abc123xyz",
  cardMask: "4***********6789",
};

describe("BookingConfirmation", () => {
  it("renders to HTML", async () => {
    const html = await render(BookingConfirmation(PROPS));
    expect(html).toContain("<html");
    expect(html.length).toBeGreaterThan(1000);
  });

  it("carries every electronic-receipt field the acquirer prescribes", async () => {
    const html = await render(BookingConfirmation(PROPS));

    // Име на търговеца + ЕИК
    expect(html).toContain("ФИЗИОЛАЙФ 22 ЕООД");
    expect(html).toContain("207009324");
    // Адрес на страницата в интернет
    expect(html).toContain("fitlabvarna.com");
    // Описание на услугата
    expect(html).toContain("Пилатес");
    // Дата на транзакцията
    expect(html).toContain("07.08.2026 г., 13:15");
    // Стойност на транзакцията
    expect(html).toContain("10,00");
    // Уникален номер на поръчката
    expect(html).toContain("cm0abc123xyz");
    // Име на клиента
    expect(html).toContain("Емил Атанасов");
    // Място на изпълнение
    expect(html).toContain("ул. Патриарх Евтимий 7а, Варна");
    // Указание клиентът да запази или отпечата разписката
    expect(html).toContain("отпечатай");
  });

  it("shows the card mask only when the deposit was paid by card", async () => {
    const withCard = await render(BookingConfirmation(PROPS));
    expect(withCard).toContain("4***********6789");

    const onSite = await render(BookingConfirmation({ ...PROPS, cardMask: null }));
    expect(onSite).not.toContain("4***********6789");
    // …and the rest of the receipt is unaffected.
    expect(onSite).toContain("cm0abc123xyz");
  });

  it("states that the class price is settled on site", async () => {
    const html = await render(BookingConfirmation(PROPS));
    expect(html).toContain("на място");
  });
});
