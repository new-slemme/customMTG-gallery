import { NextResponse } from 'next/server';

const COOKIE_NAME = 'gallery_auth';

export function middleware(request) {
  const password = process.env.GALLERY_PASSWORD?.trim();
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/_next') || pathname.startsWith('/public')) {
    return NextResponse.next();
  }

  const openApi = pathname.startsWith('/api/feedback/export');
  if (openApi) return NextResponse.next();

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie === 'ok') return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!api/login).*)']
};
