import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/api/observer/status",  // subscription check — requires Clerk auth
  "/dashboard",
]);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) {
    auth().protect();
  }
});

export const config = {
  // Only run Clerk on routes that actually need auth.
  // Keeping "/" and public API routes out prevents Clerk's session handshake
  // from redirecting crawlers/bots before they can read the page.
  matcher: [
    "/dashboard(.*)",
    "/api/observer/status(.*)",
    "/sign-in(.*)",
    "/sign-up(.*)",
  ],
};
