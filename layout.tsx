import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MIDRICIFY | Procurement & Financial Management",
  description: "Procurement, budgets, payables, inventory, and accounting in one platform."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
