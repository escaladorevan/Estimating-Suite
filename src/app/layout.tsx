import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estimating Suite",
  description: "FS bid tracking, estimating, job tracking, file storage, and historical margin analysis."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
