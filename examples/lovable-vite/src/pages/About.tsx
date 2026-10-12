import { Link } from "react-router-dom";
import { HandHeart, Sprout, Timer } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <section className="bg-gradient-hero">
          <div className="container max-w-3xl py-16 text-center md:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Our story</p>
            <h1 className="mt-3 text-5xl font-semibold md:text-6xl">A bakery built one loaf at a time</h1>
            <p className="mt-5 text-lg text-muted-foreground">
              From a folding table at the Saturday market to the corner of Maple Street.
            </p>
          </div>
        </section>

        <section className="container max-w-3xl py-16 md:py-20">
          <div className="space-y-6 text-lg leading-relaxed text-foreground/90">
            <p>
              Crumb & Co. started in 2014 with a secondhand deck oven, a jar of sourdough starter named Gus, and a
              stubborn belief that good bread shouldn't be rushed. Our founders, Maya and Theo Laurent, baked out of a
              rented kitchen three nights a week and sold their loaves from a folding table at the Saturday market.
            </p>
            <p>
              The table became a stall, the stall became a tiny shop on Maple Street, and the tiny shop slowly grew into
              the bakery you know today. Gus, remarkably, is still with us: every loaf we bake starts with a spoonful of
              him.
            </p>
            <p>
              We work with two local farms for our flour and dairy, and we mill our whole grains in-house every morning.
              It takes longer and costs more, but it makes the kind of bread we'd want to eat ourselves — and the kind
              we feed our own families.
            </p>
            <p>
              Our team of eleven bakers starts at 4:30am so the first croissants are cooling by the time the doors open.
              Whatever doesn't sell by closing time goes to the Maple Street Community Pantry. Nothing good goes to
              waste here.
            </p>
          </div>

          <blockquote className="my-14 border-l-4 border-primary pl-6 font-display text-2xl italic leading-snug md:text-3xl">
            “We're not in the business of fast. We're in the business of worth waiting for.”
            <footer className="mt-3 font-sans text-base not-italic text-muted-foreground">
              — Maya Laurent, co-founder
            </footer>
          </blockquote>

          <h2 className="text-3xl font-semibold md:text-4xl">What we believe in</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <Card className="border-border/70 shadow-soft">
              <CardContent className="p-6">
                <Timer className="h-8 w-8 text-primary" />
                <h3 className="mt-4 text-xl font-semibold">Slow by design</h3>
                <p className="mt-2 text-muted-foreground">
                  Every dough rests for at least 36 hours. Time does the work that additives usually do.
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-soft">
              <CardContent className="p-6">
                <Sprout className="h-8 w-8 text-primary" />
                <h3 className="mt-4 text-xl font-semibold">Local to the core</h3>
                <p className="mt-2 text-muted-foreground">
                  Flour from Hollow Creek Mill, butter from Willow Farm, fruit from the market down the road.
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-soft">
              <CardContent className="p-6">
                <HandHeart className="h-8 w-8 text-primary" />
                <h3 className="mt-4 text-xl font-semibold">Nothing wasted</h3>
                <p className="mt-2 text-muted-foreground">
                  Unsold bakes are donated every evening, and our spent grain feeds a neighbor's chickens.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-16 rounded-3xl bg-secondary/60 p-10 text-center">
            <h2 className="text-3xl font-semibold">Come say hello</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Stop by for a coffee and a warm slice. If you're curious, ask for a peek at the kitchen — we love showing
              off the ovens.
            </p>
            <Button asChild size="lg" className="mt-6 rounded-full px-8">
              <Link to="/menu">See what's baking</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;
