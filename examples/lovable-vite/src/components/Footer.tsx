import { Link } from "react-router-dom";
import { Clock, Croissant, Mail, MapPin, Phone } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const Footer = () => {
  return (
    <footer className="border-t border-border/60 bg-secondary/40">
      <div className="container py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-warm text-primary-foreground">
                <Croissant className="h-5 w-5" />
              </span>
              <span className="font-display text-xl font-semibold">Crumb &amp; Co.</span>
            </Link>
            <p className="mt-4 max-w-sm text-muted-foreground">
              Small-batch breads and pastries, baked by hand in the heart of the neighborhood since 2014.
            </p>
          </div>

          <div>
            <h3 className="font-sans text-sm font-semibold uppercase tracking-widest">Visit us</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>214 Maple Street, Portland, OR 97205</span>
              </li>
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>(503) 555-0142</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>hello@crumbandco.example</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-sans text-sm font-semibold uppercase tracking-widest">Opening hours</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Tuesday – Friday: 7am – 3pm</span>
              </li>
              <li className="pl-6">Saturday – Sunday: 8am – 2pm</li>
              <li className="pl-6">Closed on Mondays</li>
            </ul>
            <nav className="mt-6 flex gap-4 text-sm font-medium">
              <Link to="/" className="hover:text-primary">
                Home
              </Link>
              <Link to="/menu" className="hover:text-primary">
                Menu
              </Link>
              <Link to="/about" className="hover:text-primary">
                About
              </Link>
            </nav>
          </div>
        </div>

        <Separator className="my-10" />

        <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} Crumb & Co. All rights reserved.</p>
          <p>Made with butter, patience and a little flour on the floor.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
