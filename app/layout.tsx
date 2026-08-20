import type { Metadata } from "next";
import "./globals.css";
import "./enhancements.css";
export const metadata: Metadata = {
  title: "Accelerator Daily Inspection",
  description:
    "Startup and shutdown inspection records, signatures, exception tracking and printable archiving.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
