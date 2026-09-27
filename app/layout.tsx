import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChessTutor — Practice with purpose",
  description: "A focused chess board with a local Stockfish opponent and an AI coach.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
