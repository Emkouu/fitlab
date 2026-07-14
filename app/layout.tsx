import type { Metadata } from "next";
import { Geist_Mono, Sofia_Sans, Unbounded } from "next/font/google";
import "./globals.css";
import { prisma } from "@/lib/db";
import { StickyPhoneButton } from "./_components/StickyPhoneButton";
import { PageLoader } from "./_components/PageLoader";
import { BottomNav } from "./_components/BottomNav";
import { createClient } from "@/lib/supabase/server";

// Display: Unbounded — variable, architectural energy, full Cyrillic support.
// Body: Sofia Sans — contemporary sans designed for Bulgarian Cyrillic.
// Avoids the Inter/Geist default look while keeping Bulgarian text crisp.
// Mono: Geist Mono for tabular numerals (time blocks).
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700", "800"],
});

const sofiaSans = Sofia_Sans({
  variable: "--font-sofia-sans",
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
  const [studio, supabase] = await Promise.all([
    prisma.studio.findUnique({
      where: { slug: "fitlab-varna" },
      select: { phone: true },
    }),
    createClient(),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let unreadCount = 0;
  if (user) {
    const profile = await prisma.user.findUnique({
      where: { supabaseUserId: user.id },
      select: { id: true },
    });
    if (profile) {
      unreadCount = await prisma.notification.count({
        where: { userId: profile.id, read: false },
      });
    }
  }

  return (
    <html
      lang="bg"
      className={`${unbounded.variable} ${sofiaSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-16 md:pb-0">
        {children}
        {studio?.phone && <StickyPhoneButton phone={studio.phone} />}
        <BottomNav unreadCount={unreadCount} />
        <PageLoader />
      </body>
    </html>
  );
}
