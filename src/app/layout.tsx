import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MangaWave",
  description: "Mobile-first manga and manhwa reader for self-hosted libraries.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
