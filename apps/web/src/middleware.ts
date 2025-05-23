import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/constants";

export async function middleware(request: NextRequest) {
  const start = Date.now();
  const pathname = request.nextUrl.pathname;
  const publicRoutes = ["/sign-in", "/sign-up", "/forgot-password"];

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/api/trpc")
  ) {
    return NextResponse.next();
  }

  const sessionId = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (sessionId) {
    if (publicRoutes.includes(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-session-id", sessionId);

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    logRequest(
      request.method,
      pathname,
      response.status,
      Date.now() - start,
      "authenticated",
    );
    return response;
  }

  // No session cookie and trying to access protected route
  if (!publicRoutes.includes(pathname)) {
    const response = NextResponse.redirect(new URL("/sign-in", request.url));
    logRequest(
      request.method,
      pathname,
      response.status,
      Date.now() - start,
      null,
    );
    return response;
  }

  const response = NextResponse.next();
  logRequest(
    request.method,
    pathname,
    response.status,
    Date.now() - start,
    null,
  );
  return response;
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};

function logRequest(
  method: string,
  path: string,
  status: number,
  time: number,
  userId: string | null,
) {
  if (process.env.NODE_ENV === "production") {
    console.log(
      `=>[${method}] ${path} - ${status} - ${time}ms - User: ${userId ?? "anonymous"}`,
    );

    if (status === 302) {
      console.log("Redirecting to:", path);
    }
  }
}
