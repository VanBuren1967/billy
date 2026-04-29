import { NextResponse, type NextRequest } from 'next/server';
import { unpublishPublicProfile } from '@/lib/public-profiles/actions/approve';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await unpublishPublicProfile(id);
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.redirect(new URL(`/coach/athletes/${id}`, req.url), 303);
}
