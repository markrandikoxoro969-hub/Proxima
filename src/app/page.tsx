import { Faq } from "@/components/landing/faq";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingEffects } from "@/components/landing/landing-effects";
import { LiveDemo } from "@/components/landing/live-demo";
import { SectionHeading } from "@/components/landing/magnetic";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { Skills } from "@/components/landing/skills";
import { Slides } from "@/components/landing/slides";

/**
 * The PROXIMA landing page.
 * Static (built once, served instantly). Only the slides, the live demo,
 * the theme button and the motion effects ship JavaScript.
 */
export default function Home() {
  return (
    <div className="relative overflow-x-clip pr-safe pl-safe">
      <SiteHeader />
      <main id="main">
        <Hero />
        <Skills />
        <HowItWorks />
        <Slides />
        <section id="demo" aria-labelledby="demo-title" className="px-4 py-24 sm:px-8 sm:py-32">
          <SectionHeading
            id="demo-title"
            eyebrow="Live demo"
            title="Try it right now."
            text="A real conversation with Proxima — no account needed. Ask anything."
          />
          <div data-reveal className="mt-12">
            <LiveDemo />
          </div>
        </section>
        <Faq />
      </main>
      <SiteFooter />
      <LandingEffects />
    </div>
  );
}
