// Dev-only route (/__error-test). It throws during render on purpose so that
// error capture (overlay, toolbar, logs) can be exercised. It is only
// registered when import.meta.env.DEV is true — see App.tsx.
const ErrorTest = () => {
  throw new Error("[Crumb & Co.] Intentional render error from /__error-test");
};

export default ErrorTest;
