import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/', // Homepage should be public
  '/auth/login(.*)',
  '/auth/signup(.*)',
  '/widget(.*)', // Widget page must be public for iframe embedding
  '/api/webhooks/clerk(.*)', // Webhook endpoint must be public
  '/api/analytics(.*)', // Analytics for widget
  '/api/chat(.*)', // Chat API for widget
]);

export default clerkMiddleware(async (auth, req) => {
  // For API routes, we let them handle their own authentication and rate limiting
  // Page routes use auth.protect() which redirects to login
  if (!isPublicRoute(req) && !req.nextUrl.pathname.startsWith('/api/')) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};