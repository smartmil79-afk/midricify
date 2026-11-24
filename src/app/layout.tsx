import type { Metadata } from "next";
import "./globals.css";
import { ActionFeedback } from "./components/ActionFeedback";
import { AppSidebar } from "./components/AppSidebar";

export const metadata: Metadata = {
  title: "MIDRICIFY | Procurement & Financial Management",
  description: "Procurement, budgets, payables, inventory, and accounting in one platform."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppSidebar /><div className="md:ml-64 min-h-screen pt-14 md:pt-0">{children}</div><ActionFeedback /></body></html>;
}
