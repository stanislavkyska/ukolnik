import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Úkolník",
  description: "Úkoly a plán dne na jednom místě",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Úkolník", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf0ee" },
    { media: "(prefers-color-scheme: dark)", color: "#10191c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;500;700&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
