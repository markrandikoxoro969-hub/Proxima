import type { Metadata } from "next";
import { SandboxClientShell } from "@/components/sandbox/sandbox-client-shell";

export const metadata: Metadata = {
  title: "Code Sandbox — PROXIMA",
  description: "Full-screen live code sandbox, responsive preview, and command prompt for PROXIMA projects.",
  robots: { index: false, follow: false },
};

export default function SandboxPage() {
  return <SandboxClientShell />;
}
