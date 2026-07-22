import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Within — Programmable company spending",
  description: "Within helps companies create spending rules in plain English, review exceptions, and settle approved payments through Arc.",
  openGraph: {
    title: "Within — Programmable company spending",
    description: "Create spending rules in plain English, review exceptions, and settle approved payments through Arc.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
