import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CallToAction() {
  const [email, setEmail] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email address.");
      return;
    }
    toast.success("You're on the list!", {
      description: "Look out for Friday's bake schedule in your inbox.",
    });
    setEmail("");
  };

  return (
    <section className="py-20 md:py-28">
      <div className="container">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-warm px-6 py-16 text-center text-primary-foreground shadow-warm md:px-16">
          <div
            className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10"
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-white/10"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-2xl">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
              <Mail className="h-6 w-6" />
            </span>
            <h2 className="mt-6 text-4xl font-semibold md:text-5xl">Never miss a fresh batch</h2>
            <p className="mt-4 text-lg text-primary-foreground/85">
              Join 2,400 neighbors who get our weekly bake schedule, seasonal specials and the
              occasional free cookie.
            </p>

            <form
              onSubmit={handleSubmit}
              className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
            >
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="h-12 rounded-full border-white/30 bg-white/95 px-5 text-foreground placeholder:text-muted-foreground"
              />
              <Button
                type="submit"
                size="lg"
                variant="secondary"
                className="h-12 rounded-full px-8"
              >
                Subscribe
              </Button>
            </form>
            <p className="mt-4 text-sm text-primary-foreground/75">
              No spam, ever. Unsubscribe with one click.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
