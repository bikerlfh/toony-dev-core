import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Toony Dev Core",
  description: "Project management for software development teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
