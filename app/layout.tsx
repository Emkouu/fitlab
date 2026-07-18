import type { Metadata, Viewport } from "next";
import { Geist_Mono, Sofia_Sans, Unbounded } from "next/font/google";
import "./globals.css";
import { prisma } from "@/lib/db";
import { StickyPhoneButton } from "./_components/StickyPhoneButton";
import { CookieBanner } from "./_components/CookieBanner";
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
  // Home-screen name when saved via iOS „Add to Home Screen" (the icon itself
  // is app/apple-icon.png, auto-linked by Next).
  appleWebApp: { title: "FitLab" },
};

// Lock the viewport: the app is a fixed mobile-first layout, so pinch-zoom
// only ever mis-scales it. maximumScale:1 + userScalable:false disable the
// accidental two-finger zoom on touch devices.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <CookieBanner />
        <PageLoader />
      </body>
    </html>
  );
}
