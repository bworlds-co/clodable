import { Link } from "react-router-dom";
import { ArrowRight, CakeSlice, Cherry, Cookie, Croissant, Info, Sparkles, Wheat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

const bakes = [
  {
    name: "Butter Croissant",
    description: "Seventy-two hours of laminating for shattering, honeycomb layers and a deeply golden crust.",
    price: 3.75,
    tag: "Bestseller",
    allergens: "Contains wheat, dairy and egg",
    icon: Croissant,
  },
  {
    name: "Country Sourdough",
    description: "Naturally leavened with Gus, our ten-year-old starter, and baked dark for a crackly crust.",
    price: 8.5,
    tag: "Signature",
    allergens: "Contains wheat",
    icon: Wheat,
  },
  {
    name: "Cardamom Knot",
    description: "A Swedish-style twist with fresh-ground cardamom, brown butter and pearl sugar.",
    price: 4.25,
    tag: "New",
    allergens: "Contains wheat, dairy and egg",
    icon: Sparkles,
  },
  {
    name: "Pain au Chocolat",
    description: "Two batons of dark chocolate tucked into our classic croissant dough.",
    price: 4,
    tag: "Classic",
    allergens: "Contains wheat, dairy, egg and soy",
    icon: CakeSlice,
  },
  {
    name: "Seasonal Fruit Galette",
    description: "Rustic, flaky pastry folded around whatever looked best at the market this week.",
    price: 5.5,
    tag: "Seasonal",
    allergens: "Contains wheat and dairy",
    icon: Cherry,
  },
  {
    name: "Brown Butter Cookie",
    description: "Crisp edges, a chewy middle and a pinch of flaky sea salt on top.",
    price: 2.75,
    tag: "Kids' pick",
    allergens: "Contains wheat, dairy and egg",
    icon: Cookie,
  },
];

const TodaysBakes = () => {
  const { toast } = useToast();

  return (
    <section id="bakes" className="scroll-mt-20 py-20 md:py-28">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Fresh this morning</p>
          <h2 className="mt-3 text-4xl font-semibold md:text-5xl">Today's bakes</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything below came out of the oven a few hours ago. When it's gone, it's gone — so come early for the
            croissants.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {bakes.map((bake) => {
            const Icon = bake.icon;
            return (
              <Card
                key={bake.name}
                className="group flex flex-col overflow-hidden border-border/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-warm"
              >
                <div className="relative flex h-40 items-center justify-center bg-gradient-hero">
                  <Icon
                    className="h-16 w-16 text-primary transition-transform duration-300 group-hover:scale-110"
                    strokeWidth={1.5}
                  />
                  <Badge className="absolute left-4 top-4 rounded-full">{bake.tag}</Badge>
                </div>
                <CardHeader className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className="font-display text-2xl">{bake.name}</CardTitle>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="mt-1 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={`Allergens for ${bake.name}`}
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{bake.allergens}</TooltipContent>
                    </Tooltip>
                  </div>
                  <CardDescription className="text-base leading-relaxed">{bake.description}</CardDescription>
                </CardHeader>
                <CardFooter className="flex items-center justify-between">
                  <span className="font-display text-2xl font-semibold">${bake.price.toFixed(2)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() =>
                      toast({
                        title: "Reserved!",
                        description: `We'll hold a ${bake.name} for you until 11am.`,
                      })
                    }
                  >
                    Reserve
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Button asChild variant="link" className="text-base">
            <Link to="/menu">
              Browse the full menu
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default TodaysBakes;
