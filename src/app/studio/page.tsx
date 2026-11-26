import type { Metadata } from "next";
import { StudioPageView } from "@/components/image/studio-page-view";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Image Studio",
  description: "Generate and edit AI pictures in your private PROXIMA gallery.",
  robots: { index: false, follow: false },
};

export default async function StudioPage() {
  await requireUser("/studio");
  return <StudioPageView />;
}
