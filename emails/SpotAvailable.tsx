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

export type SpotAvailableProps = {
  greetingName: string | null;
  practiceName: string;
  dateText: string;
  timeText: string;
  durationMinutes: number;
  trainersText: string;
  studioName: string;
  studioAddress: string;
  scheduleUrl: string;
  logoUrl: string;
  footerSite: string;
};

const BRAND = "#0F172A";
const ACCENT = "#111827";
const MUTED = "#6B7280";
const SURFACE = "#F8FAFC";
const MAGENTA = "#EC4899";

export function SpotAvailable(props: SpotAvailableProps) {
  const {
    greetingName,
    practiceName,
    dateText,
    timeText,
    durationMinutes,
    trainersText,
    studioName,
    studioAddress,
    scheduleUrl,
    logoUrl,
    footerSite,
  } = props;

  const greeting = `Здравей, ${greetingName ?? "приятелю"}!`;
  const preview = `Освободи се място за ${practiceName} — ${dateText} в ${timeText}`;

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

            <Text style={{ fontSize: 20, fontWeight: 700, color: MAGENTA, margin: "8px 0 16px" }}>
              Освободи се място! 🎉
            </Text>

            <Text style={{ fontSize: 14, color: ACCENT, marginBottom: 16 }}>
              Класът, който чакаше, вече има свободно място. Бъди бърз — местата се запълват първо за първи.
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

            <Section style={{ textAlign: "center", marginBottom: 8 }}>
              <Button
                href={scheduleUrl}
                style={{
                  backgroundColor: MAGENTA,
                  color: "#FFFFFF",
                  padding: "12px 24px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Запази място сега →
              </Button>
            </Section>
          </Section>

          <Hr style={{ borderColor: "#E5E7EB", margin: "24px 0" }} />

          <Section style={{ textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: MUTED, margin: "4px 0" }}>
              {studioName} · {studioAddress}
            </Text>
            <Text style={{ fontSize: 12, color: MUTED, margin: "4px 0" }}>
              <Link href={footerSite} style={{ color: MUTED }}>
                {footerSite.replace(/^https?:\/\//, "")}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default SpotAvailable;
