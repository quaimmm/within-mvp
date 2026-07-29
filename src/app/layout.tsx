import type { Metadata } from "next";
import { WalletProvider } from "@/components/wallet-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Within — Programmable company spending",
  applicationName: "Within",
  description: "Programmable company spending on Arc.",
  openGraph: {
    title: "Within — Programmable company spending",
    description: "Set spending rules, approve decisions and access employee credit through one clear workspace built on Arc.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning><WalletProvider>{children}</WalletProvider></body>
    </html>
  );
}
