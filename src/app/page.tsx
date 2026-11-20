import type { Metadata } from "next";
import { Faq } from "@/components/landing/faq";
import { DeferredLiveDemo } from "@/components/landing/deferred-live-demo";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingEffects } from "@/components/landing/landing-effects";
import { SectionHeading } from "@/components/landing/magnetic";
import { ScrollFx } from "@/components/landing/scroll-fx";
import { MotionProvider } from "@/components/motion/motion-provider";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { Skills } from "@/components/landing/skills";
import { site } from "@/lib/site";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Tells Google what PROXIMA is (structured data). */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: site.name,
  alternateName: site.shortName,
  description: site.description,
  url: site.url,
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Any (web browser)",
  author: { "@type": "Person", name: site.developer, url: site.links.facebook },
};

/**
 * The PROXIMA landing page.
 * Static (built once, served instantly). Only the theme button and the motion
 * effects ship JavaScript up front; the live demo's chunk loads when you
 * approach it.
 */
export default function Home() {
  return (
    <MotionProvider>
      <div className="relative overflow-x-clip pr-safe pl-safe">
        <script
          type="application/ld+json"
          // Safe: our own constant data; "<" is escaped so it can't close the tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        <SiteHeader />
        <main id="main">
          <Hero />
          <Skills />
          <HowItWorks />
          <section id="demo" aria-labelledby="demo-title" className="px-4 py-24 sm:px-8 sm:py-32">
            <SectionHeading
              id="demo-title"
              eyebrow="Live demo"
              title="Try it right now."
              text="A real conversation, no account needed. Nothing is saved."
            />
            <div data-reveal className="mt-12">
              {/* The demo's code and JavaScript wait until it is near the screen. */}
              <DeferredLiveDemo />
            </div>
          </section>
          <Faq />
        </main>
        <SiteFooter />
        <LandingEffects />
        <ScrollFx />
      </div>
    </MotionProvider>
  );
}
