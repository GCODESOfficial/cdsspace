/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getGlashDbAdmin } from '@/lib/glashdb';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const glashdb = getGlashDbAdmin();

    const { error } = await glashdb.from('applications').insert([body]);

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
