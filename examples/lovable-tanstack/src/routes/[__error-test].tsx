import { createFileRoute, notFound } from "@tanstack/react-router";

// Dev-only route (/__error-test). The file name is bracket-escaped so the
// leading underscores stay part of the URL instead of marking a pathless
// layout route. Its component throws during render on purpose so error capture
// (SSR error handling, the root ErrorComponent, logs) can be exercised.
// Outside `vite dev` it behaves like an unknown URL. Not linked anywhere.
export const Route = createFileRoute("/__error-test")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  component: ErrorTest,
});

function ErrorTest(): never {
  throw new Error("[Crumb & Co.] Intentional render error from /__error-test");
}
