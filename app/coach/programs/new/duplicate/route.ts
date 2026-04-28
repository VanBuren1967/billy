import { NextResponse, type NextRequest } from 'next/server';
import { createProgram } from '@/lib/programs/actions/create-program';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const sourceId = url.searchParams.get('source');
  const mode = url.searchParams.get('mode');
  if (!sourceId) return NextResponse.json({ error: 'missing source' }, { status: 400 });
  const apiMode =
    mode === 'duplicate-template' ? 'duplicate_template' :
    mode === 'duplicate-program' ? 'duplicate_program' :
    null;
  if (!apiMode) return NextResponse.json({ error: 'invalid mode' }, { status: 400 });

  const r = await createProgram({ mode: apiMode, sourceProgramId: sourceId });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.redirect(new URL(`/coach/programs/${r.programId}/edit`, req.url));
}
