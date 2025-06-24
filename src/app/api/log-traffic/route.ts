import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

function getClientIp(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  const ip_address = getClientIp(req);
  const { country } = await req.json();

  if (!country) {
    return NextResponse.json({ error: 'Country is required' }, { status: 400 });
  }

  // Get today's date start and end in ISO strings
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCHours(23, 59, 59, 999);

  // Check if this IP already logged a visit today
  const { data: existingVisits, error } = await supabase
    .from('traffic_logs')
    .select('id')
    .eq('ip_address', ip_address)
    .gte('created_at', todayStart.toISOString())
    .lte('created_at', todayEnd.toISOString())
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found, ignore that error
    return NextResponse.json({ error }, { status: 500 });
  }

  if (existingVisits) {
    // Already logged today, ignore
    return NextResponse.json({ message: 'Visit already logged today' });
  }

  // Insert new visit
  const { error: insertError } = await supabase.from('traffic_logs').insert({
    ip_address,
    country,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    return NextResponse.json({ error: insertError }, { status: 500 });
  }

  return NextResponse.json({ message: 'Visit logged' });
}
