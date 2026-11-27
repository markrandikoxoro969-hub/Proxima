"use client";

import dynamic from "next/dynamic";

const SandboxWorkspace = dynamic(
  () => import("./sandbox-workspace").then((m) => m.SandboxWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-bg text-fg">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-fg" />
        <p className="text-xs font-extrabold tracking-widest text-subtle uppercase">
          Opening Proxima Sandbox…
        </p>
      </div>
    ),
  },
);

export function SandboxClientShell() {
  return <SandboxWorkspace />;
}
