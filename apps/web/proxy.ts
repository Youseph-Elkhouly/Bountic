import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const protectedPath = ["/dashboard", "/onboarding", "/bounties/new", "/agents/new"].some((path) => request.nextUrl.pathname.startsWith(path));
  if (!url || !key) return protectedPath ? NextResponse.redirect(new URL("/login?setup=supabase", request.url)) : NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  if (protectedPath && !data?.claims?.sub) return NextResponse.redirect(new URL("/login", request.url));
  return response;
}

export const config = { matcher: ["/dashboard/:path*", "/onboarding/:path*", "/bounties/new/:path*", "/agents/new/:path*"] };
