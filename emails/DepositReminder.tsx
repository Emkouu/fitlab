import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * „Депозитът не е платен" — for a client who reached the bank's card page and
 * left without finishing.
 *
 * Deliberately not a receipt and not a warning. Nothing has been charged, the
 * spot is still theirs for now, and the two ways out are both stated: finish
 * the payment, or leave the deposit at the studio. It also says plainly that
 * the spot is not guaranteed indefinitely, because it isn't — a later booking
 * on the same class reclaims an unpaid hold.
 */
export type DepositReminderProps = {
  greetingName: string | null;
  practiceName: string;
  /** Pre-formatted Sofia-local strings; the template stays presentational. */
  dateText: string;
  timeText: string;
  depositText: string;
  payUrl: string;
  studioName: string;
  studioAddress: string;
  studioPhone: string;
  logoUrl: string;
  footerSite: string;
};

const BRAND = "#0F172A";
const ACCENT = "#111827";
const MUTED = "#6B7280";
const SURFACE = "#F8FAFC";

export function DepositReminder(props: DepositReminderProps) {
  const {
    greetingName,
    practiceName,
    dateText,
    timeText,
    depositText,
    payUrl,
    studioName,
    studioAddress,
    studioPhone,
    logoUrl,
    footerSite,
  } = props;

  return (
    <Html lang="bg">
      <Head />
      <Preview>{`Депозитът за ${practiceName} още не е платен`}</Preview>
      <Body style={{ backgroundColor: SURFACE, margin: 0, padding: "24px 0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        <Container style={{ backgroundColor: "#FFFFFF", borderRadius: 16, maxWidth: 520, margin: "0 auto", padding: "32px 28px" }}>
          <Section style={{ textAlign: "center", marginBottom: 24 }}>
            <Img src={logoUrl} alt={studioName} width={150} height={75} style={{ margin: "0 auto" }} />
          </Section>

          <Text style={{ color: ACCENT, fontSize: 20, fontWeight: 700, margin: "0 0 12px" }}>
            {greetingName ? `${greetingName}, ` : ""}резервацията ти чака депозит
          </Text>

          <Text style={{ color: BRAND, fontSize: 15, lineHeight: "24px", margin: "0 0 20px" }}>
            Запази място за <strong>{practiceName}</strong> на {dateText} в{" "}
            {timeText}, но плащането на депозита не беше завършено. Нищо не е
            удържано от картата ти.
          </Text>

          <Section style={{ backgroundColor: SURFACE, borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
            <Text style={{ color: MUTED, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>
              Дължим депозит
            </Text>
            <Text style={{ color: ACCENT, fontSize: 22, fontWeight: 700, margin: 0 }}>
              {depositText}
            </Text>
            <Text style={{ color: MUTED, fontSize: 13, lineHeight: "20px", margin: "8px 0 0" }}>
              Депозитът е еднократен и остава по профила ти — не е цена на
              тренировката и не се приспада от нея.
            </Text>
          </Section>

          <Section style={{ textAlign: "center", marginBottom: 20 }}>
            <Button
              href={payUrl}
              style={{ backgroundColor: ACCENT, borderRadius: 12, color: "#FFFFFF", fontSize: 15, fontWeight: 700, padding: "14px 28px", textDecoration: "none" }}
            >
              Плати депозита
            </Button>
          </Section>

          <Text style={{ color: BRAND, fontSize: 14, lineHeight: "22px", margin: "0 0 20px" }}>
            Може и без карта — остави депозита на рецепцията, преди тренировката.
            Ако не искаш да идваш, не е нужно да правиш нищо.
          </Text>

          <Text style={{ color: MUTED, fontSize: 13, lineHeight: "20px", margin: "0 0 20px" }}>
            Мястото се пази, докато депозитът не е платен, но не е гарантирано:
            ако друг клиент запази същата тренировка, незаплатената резервация се
            освобождава.
          </Text>

          <Hr style={{ borderColor: "#E5E7EB", margin: "24px 0 16px" }} />

          <Text style={{ color: MUTED, fontSize: 12, lineHeight: "18px", margin: 0 }}>
            {studioName} · {studioAddress}
            <br />
            {studioPhone}
            <br />
            <Link href={footerSite} style={{ color: MUTED }}>
              {footerSite.replace(/^https?:\/\//, "")}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
