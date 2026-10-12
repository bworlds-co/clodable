import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Croissant, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-hero">
      <div className="container grid items-center gap-12 py-20 md:py-28 lg:grid-cols-2">
        <div className="space-y-8">
          <Badge variant="secondary" className="rounded-full px-4 py-1 text-sm font-medium">
            Neighborhood bakery · Est. 2014
          </Badge>

          <h1 className="text-5xl font-semibold leading-[1.05] md:text-6xl lg:text-7xl">
            Baked before sunrise, <span className="text-primary">gone by noon.</span>
          </h1>

          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            Crumb & Co. is a small-batch bakery on Maple Street. We mill our own flour, ferment our
            dough for 36 hours, and pull every loaf from the oven before the city wakes up.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full px-8 shadow-warm">
              <a href="#bakes">
                See today's bakes
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full bg-background/60 px-8"
            >
              <Link to="/about">Visit the bakery</Link>
            </Button>
          </div>

          <dl className="grid max-w-md grid-cols-3 gap-6 pt-4">
            <div>
              <dt className="text-sm text-muted-foreground">Slow fermentation</dt>
              <dd className="font-display text-3xl font-semibold">36h</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Ovens fired up</dt>
              <dd className="font-display text-3xl font-semibold">4:30am</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Fresh bakes daily</dt>
              <dd className="font-display text-3xl font-semibold">12</dd>
            </div>
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="aspect-square rounded-[2.5rem] bg-gradient-warm p-10 shadow-warm">
            <div className="flex h-full w-full flex-col items-center justify-center rounded-[2rem] border border-white/30 bg-white/10 text-primary-foreground backdrop-blur-sm">
              <Croissant className="h-32 w-32" strokeWidth={1.25} />
              <p className="mt-6 font-display text-2xl font-semibold">Butter. Flour. Time.</p>
              <p className="mt-2 text-sm text-primary-foreground/80">That's the whole recipe.</p>
            </div>
          </div>

          <div className="absolute -bottom-6 -left-4 flex items-center gap-3 rounded-2xl border bg-card px-5 py-4 shadow-soft md:-left-8">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Flame className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Fresh batch</p>
              <p className="text-xs text-muted-foreground">Sourdough out at 7:00am</p>
            </div>
          </div>

          <div className="absolute -right-2 -top-4 hidden items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-soft sm:flex">
            <Clock className="h-4 w-4 text-primary" />
            <span>Open today until 3pm</span>
          </div>
        </div>
      </div>
    </section>
  );
}
