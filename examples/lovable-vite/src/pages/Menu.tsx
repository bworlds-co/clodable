import { Leaf, Nut } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { menuSections } from "@/data/menu";

const Menu = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <section className="bg-gradient-hero">
          <div className="container py-16 text-center md:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Our menu</p>
            <h1 className="mx-auto mt-3 max-w-3xl text-5xl font-semibold md:text-6xl">
              Everything we bake, all in one place
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              Our menu shifts a little with the seasons, but these favorites are on the counter most days. Prices are
              per item unless noted otherwise.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {menuSections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="rounded-full border border-border bg-background/70 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-background"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="container max-w-4xl py-16 md:py-20">
          <div className="space-y-16">
            {menuSections.map((section) => (
              <div key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="text-3xl font-semibold md:text-4xl">{section.title}</h2>
                <p className="mt-2 text-muted-foreground">{section.description}</p>
                <Separator className="my-6" />
                <ul className="space-y-6">
                  {section.items.map((item) => (
                    <li key={item.name} className="flex items-start justify-between gap-6">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-xl font-semibold">{item.name}</h3>
                          {item.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="gap-1 rounded-full font-normal">
                              {tag === "Vegan" ? <Leaf className="h-3 w-3" /> : <Nut className="h-3 w-3" />}
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-1 text-muted-foreground">{item.description}</p>
                      </div>
                      <span className="shrink-0 font-display text-xl font-semibold text-primary">
                        ${item.price.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <Card className="mt-20 border-dashed bg-secondary/40">
            <CardContent className="flex flex-col items-center gap-6 p-10 text-center md:flex-row md:text-left">
              <div className="flex-1">
                <h2 className="text-2xl font-semibold">Planning a party?</h2>
                <p className="mt-2 text-muted-foreground">
                  We bake celebration cakes, pastry boxes and bread baskets to order with 48 hours' notice.
                </p>
              </div>
              <Button
                size="lg"
                className="rounded-full px-8"
                onClick={() =>
                  toast("Thanks for asking!", { description: "Call us at (503) 555-0142 to plan your order." })
                }
              >
                Ask about catering
              </Button>
            </CardContent>
          </Card>

          <p className="mt-10 text-center text-sm text-muted-foreground">
            Have an allergy? Please ask our team — we're happy to walk you through every ingredient.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Menu;
