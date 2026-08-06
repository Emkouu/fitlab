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

export type ClassReminderProps = {
  greetingName: string | null;
  practiceName: string;
  // Pre-formatted Sofia-local strings so the email template stays presentational.
  dateText: string;          // e.g. "петък, 30.05.2026 г."
  timeText: string;          // e.g. "18:00 ч."
  durationMinutes: number;
  trainersText: string;      // e.g. "Даниил & Юна"
  studioName: string;
  studioAddress: string;
  studioPhone: string;
  cancelWindowHours: number;
  pendingDeposit: boolean;
  accountUrl: string;
  logoUrl: string;
  footerSite: string;
};

const BRAND = "#0F172A";
const ACCENT = "#111827";
const MUTED = "#6B7280";
const SURFACE = "#F8FAFC";

export function ClassReminder(props: ClassReminderProps) {
  const {
    greetingName,
    practiceName,
    dateText,
    timeText,
    durationMinutes,
    trainersText,
    studioName,
    studioAddress,
    studioPhone,
    cancelWindowHours,
    pendingDeposit,
    accountUrl,
    logoUrl,
    footerSite,
  } = props;

  const greeting = `Здравей, ${greetingName ?? "приятелю"}!`;
  const preview = `${practiceName} — ${dateText} в ${timeText}`;

  return (
    <Html lang="bg">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: SURFACE, fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
          <Section style={{ textAlign: "center", paddingBottom: 16 }}>
            <Img src={logoUrl} alt="FitLab Varna" width="120" height="auto" style={{ display: "inline-block" }} />
          </Section>

          <Section
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 12,
              padding: 24,
              border: `1px solid #E5E7EB`,
            }}
          >
            <Text style={{ fontSize: 16, color: ACCENT, marginTop: 0 }}>{greeting}</Text>

            <Text style={{ fontSize: 14, color: ACCENT, marginBottom: 16 }}>
              Напомняме ти за предстоящия клас:
            </Text>

            <Section
              style={{
                backgroundColor: SURFACE,
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: 700, color: BRAND, margin: "0 0 8px" }}>
                {practiceName}
              </Text>
              <Text style={{ fontSize: 14, color: ACCENT, margin: "4px 0" }}>
                {dateText} в {timeText}
              </Text>
              <Text style={{ fontSize: 14, color: ACCENT, margin: "4px 0" }}>
                Продължителност: {durationMinutes} мин
              </Text>
              <Text style={{ fontSize: 14, color: ACCENT, margin: "4px 0" }}>
                Треньор: {trainersText}
              </Text>
              <Text style={{ fontSize: 14, color: ACCENT, margin: "4px 0" }}>
                Студио: {studioName}
              </Text>
              <Text style={{ fontSize: 14, color: MUTED, margin: "4px 0" }}>
                Адрес: {studioAddress}
              </Text>
            </Section>

            {pendingDeposit && (
              <Text style={{ fontSize: 14, color: ACCENT, marginBottom: 12 }}>
                Не забравяй да платиш депозита на място преди класа.
              </Text>
            )}

            <Text style={{ fontSize: 14, color: ACCENT, marginBottom: 20 }}>
              Можеш да се отпишеш до {cancelWindowHours} часа преди класа. След това депозитът се усвоява.
            </Text>

            <Section style={{ textAlign: "center", marginBottom: 8 }}>
              <Button
                href={accountUrl}
                style={{
                  backgroundColor: BRAND,
                  color: "#FFFFFF",
                  padding: "12px 24px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Виж резервацията си
              </Button>
            </Section>
          </Section>

          <Hr style={{ borderColor: "#E5E7EB", margin: "24px 0" }} />

          <Section style={{ textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: MUTED, margin: "4px 0" }}>
              {studioName} · {studioAddress}
            </Text>
            <Text style={{ fontSize: 12, color: MUTED, margin: "4px 0" }}>
              Тел:{" "}
              <Link href={`tel:${studioPhone.replace(/\s+/g, "")}`} style={{ color: MUTED }}>
                {studioPhone}
              </Link>
            </Text>
            <Text style={{ fontSize: 12, color: MUTED, margin: "4px 0" }}>
              <Link href={footerSite} style={{ color: MUTED }}>
                {footerSite.replace(/^https?:\/\//, "")}
              </Link>
            </Text>
            <Text style={{ fontSize: 12, color: MUTED, margin: "8px 0 0" }}>
              <Link href="https://facebook.com/fitlabvarna" style={{ color: MUTED, marginRight: 12 }}>
                Facebook
              </Link>
              <Link href="https://instagram.com/fitlabvarna" style={{ color: MUTED }}>
                Instagram
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ClassReminder;
