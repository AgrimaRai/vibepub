import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "VibePub · Your table. Your soundtrack.",
  description:
    "Request a track, back your favorites, and shape tonight’s soundtrack.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
