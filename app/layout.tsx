import type { Metadata } from "next";
import { Geist_Mono, Onest, Unbounded } from "next/font/google";
import "./globals.css";
import { prisma } from "@/lib/db";
import { StickyPhoneButton } from "./_components/StickyPhoneButton";
import { PageLoader } from "./_components/PageLoader";

// Display: Unbounded — variable, architectural energy, full Cyrillic support.
// Body: Onest — refined contemporary sans, Cyrillic. Avoids the Inter/Geist
// default look while keeping Bulgarian text crisp.
// Mono: Geist Mono for tabular numerals (time blocks).
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700", "800"],
});

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FitLab Varna — График",
  description: "Запиши се за тренировка във FitLab Varna.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const studio = await prisma.studio.findUnique({
    where: { slug: "fitlab-varna" },
    select: { phone: true },
  });
  return (
    <html
      lang="bg"
      className={`${unbounded.variable} ${onest.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {studio?.phone && <StickyPhoneButton phone={studio.phone} />}
        <PageLoader />
      </body>
    </html>
  );
}
