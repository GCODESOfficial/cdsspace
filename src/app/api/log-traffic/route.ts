import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Record one visit per IP per day.
 *
 * The table is kept at most 200 rows by a Postgres trigger — see
 * supabase/migrations/traffic_logs_trim.sql. This route just inserts; the
 * trigger handles trimming atomically regardless of RLS.
 */

function getClientIp(req: NextRequest) {
    return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

export async function POST(req: NextRequest) {
    try {
        const ip_address = getClientIp(req);
        const { country } = await req.json();

        if (!country) {
            return NextResponse.json({ message: 'Country missing, skipped' });
        }

        // Dedupe: one log per IP per UTC day.
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const { data: existingVisits } = await supabase
            .from('traffic_logs')
            .select('id')
            .eq('ip_address', ip_address)
            .gte('created_at', todayStart.toISOString())
            .limit(1)
            .maybeSingle();

        if (existingVisits) {
            return NextResponse.json({ message: 'Visit already logged today' });
        }

        await supabase.from('traffic_logs').insert({
            ip_address,
            country,
            created_at: new Date().toISOString(),
        });

        return NextResponse.json({ message: 'Visit logged' });
    } catch {
        return NextResponse.json({ message: 'Operation finished' });
    }
}
