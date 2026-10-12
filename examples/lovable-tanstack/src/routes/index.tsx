import { createFileRoute } from "@tanstack/react-router";

import { CallToAction } from "@/components/CallToAction";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Navbar } from "@/components/Navbar";
import { Testimonials } from "@/components/Testimonials";
import { TodaysBakes } from "@/components/TodaysBakes";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <TodaysBakes />
        <Testimonials />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
