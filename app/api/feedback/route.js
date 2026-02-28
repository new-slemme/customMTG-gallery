import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const setSlug = request.nextUrl.searchParams.get('set');
  const cardId = request.nextUrl.searchParams.get('card_id');
  if (!setSlug || !cardId) {
    return NextResponse.json({ error: 'set and card_id required' }, { status: 400 });
  }

  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM comments WHERE set_slug = ? AND card_id = ? ORDER BY created_at DESC')
    .all(setSlug, cardId);
  return NextResponse.json(rows);
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { set_slug, card_id, card_name, display_name, rating, comment } = body;
  if (!set_slug || !card_id || !card_name || !comment) {
    return NextResponse.json({ error: 'set_slug, card_id, card_name, comment required' }, { status: 400 });
  }
  if (String(comment).length > 2000) {
    return NextResponse.json({ error: 'comment exceeds 2000 characters' }, { status: 400 });
  }
  const parsedRating = rating === undefined || rating === null || rating === '' ? null : Number(rating);
  if (parsedRating !== null && (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5)) {
    return NextResponse.json({ error: 'rating must be integer 1-5' }, { status: 400 });
  }

  const createdAt = new Date().toISOString();
  const db = getDb();
  const result = db
    .prepare(
      'INSERT INTO comments (set_slug, card_id, card_name, display_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      String(set_slug),
      String(card_id),
      String(card_name),
      display_name ? String(display_name).slice(0, 100) : null,
      parsedRating,
      String(comment),
      createdAt
    );

  return NextResponse.json({ id: result.lastInsertRowid, created_at: createdAt });
}
