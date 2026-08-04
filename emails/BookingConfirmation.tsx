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
import { COMPANY } from "@/lib/legal/company";

export type BookingConfirmationProps = {
  greetingName: string | null;
  practiceName: string;
  dateText: string;
  timeText: string;
  durationMinutes: number;
  trainersText: string;
  studioName: string;
  studioAddress: string;
  studioPhone: string;
  depositText: string; // pre-formatted (e.g. "€20.00")
  depositStatusText: string; // "Платено онлайн" | "Ще платиш на място" | "Платено с баланс"
  cancelWindowHours: number;
  accountUrl: string;
  logoUrl: string;
  footerSite: string;
  // Electronic-receipt fields (acquirer instruction §I.15): unique order
  // reference, client name, and transaction date must appear on the receipt.
  bookingReference: string;
  clientName: string;
  transactionDateText: string;
};

const BRAND = "#0F172A";
const ACCENT = "#111827";
const MUTED = "#6B7280";
const SURFACE = "#F8FAFC";
const MAGENTA = "#EC4899";

export function BookingConfirmation(props: BookingConfirmationProps) {
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
    depositText,
    depositStatusText,
    cancelWindowHours,
    accountUrl,
    logoUrl,
    footerSite,
    bookingReference,
    clientName,
    transactionDateText,
  } = props;

  const greeting = `Здравей, ${greetingName ?? "приятелю"}!`;
  const preview = `Записан/а си! ${practiceName} — ${dateText} в ${timeText}`;

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
            <Text style={{ fontSize: 20, fontWeight: 700, color: MAGENTA, margin: "0 0 4px" }}>
              Записан/а си! 🎉
            </Text>
            <Text style={{ fontSize: 16, color: ACCENT, marginTop: 8 }}>{greeting}</Text>

            <Text style={{ fontSize: 14, color: ACCENT, marginBottom: 16 }}>
              Успешно запази място за:
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
                {durationMinutes} мин · {trainersText}
              </Text>
              <Text style={{ fontSize: 14, color: ACCENT, margin: "4px 0" }}>
                {studioName}
              </Text>
              <Text style={{ fontSize: 14, color: MUTED, margin: "4px 0" }}>
                {studioAddress}
              </Text>
            </Section>

            {/* Electronic receipt (acquirer instruction §I.15) */}
            <Section
              style={{
                border: "1px solid #E5E7EB",
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px" }}>
                Електронна разписка
              </Text>
              <ReceiptRow label="Референция" value={bookingReference} mono />
              <ReceiptRow label="Клиент" value={clientName} />
              <ReceiptRow label="Дата на транзакция" value={transactionDateText} />
              <ReceiptRow label="Услуга" value={`${practiceName} — ${dateText}, ${timeText}`} />
              <ReceiptRow label="Депозит" value={`${depositText} — ${depositStatusText}`} />
              <ReceiptRow
                label="Търговец"
                value={`${COMPANY.legalName}, ЕИК ${COMPANY.eik}`}
              />
              <ReceiptRow label="Обект" value={`${studioName}, ${studioAddress}`} />
              <Text style={{ fontSize: 11, color: MUTED, margin: "8px 0 0" }}>
                Запази този имейл — той е твоята разписка за направената поръчка.
              </Text>
            </Section>

            <Text style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>
              ⚠️ Можеш да откажеш до {cancelWindowHours} часа преди класа.
              След това депозитът се удържа.
            </Text>

            <Section style={{ textAlign: "center", marginBottom: 8 }}>
              <Button
                href={accountUrl}
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
                Виж резервацията си →
              </Button>
            </Section>
          </Section>

          <Hr style={{ borderColor: "#E5E7EB", margin: "24px 0" }} />

          <Section style={{ textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: MUTED, margin: "4px 0" }}>
              {studioName} · {studioAddress}
            </Text>
            <Text style={{ fontSize: 12, color: MUTED, margin: "4px 0" }}>
              {COMPANY.legalName} · ЕИК {COMPANY.eik}
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
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function ReceiptRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Text style={{ fontSize: 13, color: ACCENT, margin: "4px 0" }}>
      <span style={{ color: MUTED }}>{label}: </span>
      <span style={mono ? { fontFamily: "Courier, monospace", fontSize: 12 } : undefined}>
        {value}
      </span>
    </Text>
  );
}

export default BookingConfirmation;
