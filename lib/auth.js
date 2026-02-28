import { cookies } from 'next/headers';

const COOKIE_NAME = 'gallery_auth';

export function passwordEnabled() {
  return Boolean(process.env.GALLERY_PASSWORD && process.env.GALLERY_PASSWORD.trim());
}

export function hasAuthCookie() {
  if (!passwordEnabled()) return true;
  return cookies().get(COOKIE_NAME)?.value === 'ok';
}

export function cookieName() {
  return COOKIE_NAME;
}
