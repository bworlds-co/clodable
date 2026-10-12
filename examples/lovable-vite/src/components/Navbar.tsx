import { useState } from "react";
import { Link } from "react-router-dom";
import { Croissant, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/menu", label: "Menu" },
  { to: "/about", label: "About" },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <nav className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-warm text-primary-foreground shadow-soft">
            <Croissant className="h-5 w-5" />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">Crumb &amp; Co.</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              activeClassName="text-foreground"
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="hidden md:block">
          <Button asChild className="rounded-full px-5">
            <Link to="/menu">Order ahead</Link>
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground md:hidden"
          onClick={() => setIsOpen((open) => !open)}
          aria-label="Toggle menu"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {isOpen && (
        <div className="border-t border-border/60 bg-background md:hidden">
          <div className="container flex flex-col gap-1 py-4">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end
                onClick={() => setIsOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                activeClassName="bg-muted text-foreground"
              >
                {link.label}
              </NavLink>
            ))}
            <Button asChild className="mt-2 rounded-full">
              <Link to="/menu" onClick={() => setIsOpen(false)}>
                Order ahead
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
