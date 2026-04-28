import { NextResponse, type NextRequest } from 'next/server';
import { restoreProgram } from '@/lib/programs/actions/archive-program';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await restoreProgram({ programId: id });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.redirect(new URL('/coach/programs?archived=1', req.url), 303);
}
