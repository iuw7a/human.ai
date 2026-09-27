import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Human AI",
  description:
    "Human AI — a fast, minimal AI chat platform. Ask anything, analyze images, keep your history.",
  icons: { icon: "/logo.webp" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ink-950 font-sans text-zinc-100">{children}</body>
    </html>
  );
}
