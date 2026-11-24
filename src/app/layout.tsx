import type { Metadata } from "next";
import "./globals.css";
import { ActionFeedback } from "./components/ActionFeedback";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { ProcessingOverlay } from "./components/ProcessingOverlay";

export const metadata: Metadata = {
  title: "MIDRICIFY | Procurement & Financial Management",
  description: "Procurement, budgets, payables, inventory, and accounting in one platform."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><WorkspaceShell>{children}</WorkspaceShell><ActionFeedback /><ProcessingOverlay /></body></html>;
}
