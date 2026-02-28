import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM comments ORDER BY created_at DESC').all();

  const grouped = {};
  for (const row of rows) {
    grouped[row.set_slug] ??= {};
    grouped[row.set_slug][row.card_id] ??= {
      card_name: row.card_name,
      comments: []
    };
    grouped[row.set_slug][row.card_id].comments.push(row);
  }

  return NextResponse.json(grouped);
}
