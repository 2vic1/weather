import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "آسمان‌نگار | سامانه جامع هواشناسی و رصد جوّ ایران",
  description:
    "نقشه لایو هواشناسی با رادار بارش، تصاویر ماهواره، حرکت توده‌های هوا، لایه‌های جو و پیش‌بینی هوشمند با هوش مصنوعی برای تمام شهرهای ایران و جهان",
  keywords: [
    "هواشناسی",
    "پیش‌بینی هوا",
    "رادار بارش",
    "ماهواره هواشناسی",
    "لایه‌های جو",
    "طوفان حاره‌ای",
    "توده هوا",
    "آب و هوا",
  ],
  icons: {
    icon: "/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0f1e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@33.003/Vazirmatn-font-face.css"
        />
        <link
          rel="preconnect"
          href="https://tilecache.rainviewer.com"
          crossOrigin=""
        />
      </head>
      <body className="antialiased bg-background text-foreground font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
