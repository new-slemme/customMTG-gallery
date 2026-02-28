import fs from 'fs';
import path from 'path';
import { SETS_DIR } from '@/lib/config';

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

export async function GET(_req, { params }) {
  const segments = params.path || [];
  const unsafe = segments.some((part) => part.includes('..') || part.includes('/'));
  if (unsafe || segments.length < 3) {
    return new Response('Not found', { status: 404 });
  }

  const relPath = path.join(...segments);
  const absPath = path.join(SETS_DIR, relPath);
  const normalizedBase = path.resolve(SETS_DIR);
  const normalizedTarget = path.resolve(absPath);
  if (!normalizedTarget.startsWith(normalizedBase)) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!fs.existsSync(normalizedTarget) || !fs.statSync(normalizedTarget).isFile()) {
    return new Response('Not found', { status: 404 });
  }

  const ext = path.extname(normalizedTarget).toLowerCase();
  const type = CONTENT_TYPES[ext] || 'application/octet-stream';
  const file = fs.readFileSync(normalizedTarget);
  return new Response(file, { headers: { 'content-type': type, 'cache-control': 'public, max-age=300' } });
}
