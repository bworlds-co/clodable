import { Quote, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const testimonials = [
  {
    quote:
      "I've tried croissants in Paris that weren't this good. The Saturday line is real, but it moves fast and it's worth every minute.",
    name: "Priya Raman",
    role: "Regular since 2016",
  },
  {
    quote:
      "Their country sourdough is the only bread my kids will eat without arguing. We buy two loaves every week and freeze one.",
    name: "Marcus Bell",
    role: "Maple Street neighbor",
  },
  {
    quote:
      "We order pastry boxes for every team offsite. Always on time, always beautiful, and somehow nobody ever has leftovers.",
    name: "Elena Fischer",
    role: "Office manager, Northwind Studio",
  },
];

export function Testimonials() {
  return (
    <section className="bg-secondary/50 py-20 md:py-28">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Kind words</p>
          <h2 className="mt-3 text-4xl font-semibold md:text-5xl">Loved by the neighborhood</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            We've been baking for the same few streets for over a decade. Here's what some of our
            regulars have to say.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.name} className="border-border/70 bg-card/80 shadow-soft">
              <CardContent className="flex h-full flex-col gap-6 p-8">
                <Quote className="h-8 w-8 text-primary/40" />
                <p className="flex-1 text-lg leading-relaxed">{testimonial.quote}</p>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                  <div className="flex gap-0.5 text-primary" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
