import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "MDX Image Publisher",
  description: "Local image publishing workflow for MDX blogs."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
