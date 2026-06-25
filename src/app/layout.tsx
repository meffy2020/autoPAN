import type { Metadata, Viewport } from "next";

import { PWARegister } from "@/components/pwa-register";

import "./globals.css";

export const metadata: Metadata = {
  title: "나놀다판 운영 자동화",
  description: "노원청소년센터 나놀다판 현장 접수, 대기열, 결제기록, TTS 호출을 위한 운영 시스템",
  applicationName: "나놀다판 운영 자동화",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "나놀다판",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[color:var(--background)] text-[color:var(--foreground)]">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
