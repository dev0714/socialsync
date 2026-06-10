import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SocialSync",
  description: "AI-assisted social media publishing.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
