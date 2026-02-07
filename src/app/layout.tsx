import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SigmaRead",
  description: "AI-powered reading comprehension for Sigma School",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
