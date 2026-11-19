/**
 * Runs once when the server starts. We use it to check your .env settings
 * and print a clear message if anything is missing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportEnv } = await import("@/lib/env");
    reportEnv();
  }
}
