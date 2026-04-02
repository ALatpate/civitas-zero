import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/api/observer/status",  // subscription check — requires Clerk auth
  "/dashboard",
]);

// Known crawler / bot user-agents — must never get a Clerk redirect
const BOT_UA = /bot|crawler|spider|googlebot|bingbot|yandex|baidu|duckduck|facebookexternalhit|twitterbot|linkedinbot|slurp|semrush|ahref|mj12bot|dotbot|rogerbot|archive\.org|mediapartners|adsbot|apis-google|feedfetcher|curl|wget|python-requests|node-fetch|lighthouse/i;

export default clerkMiddleware((auth, req) => {
  // Never intercept bots / crawlers — always let them through
  const ua = req.headers.get("user-agent") || "";
  if (BOT_UA.test(ua)) {
    return NextResponse.next();
  }

  if (isProtectedRoute(req)) {
    auth().protect();
  }
});

export const config = {
  // Only run Clerk on routes that actually need auth.
  // Keeping "/" and public routes out prevents Clerk's session handshake
  // from redirecting crawlers/bots before they can read the page.
  matcher: [
    "/dashboard(.*)",
    "/api/observer/status(.*)",
    "/sign-in(.*)",
    "/sign-up(.*)",
  ],
};
