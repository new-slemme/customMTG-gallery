import { NextResponse } from 'next/server';

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.GALLERY_PASSWORD?.trim();

  if (!expected || password !== expected) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('gallery_auth', 'ok', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  });
  return res;
}
