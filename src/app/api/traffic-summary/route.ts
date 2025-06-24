// src/app/api/traffic-summary/route.ts
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  // Fetch all traffic logs (for total and per country)
  const { data, error } = await supabase.from('traffic_logs').select('country, created_at');

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const total = data.length;

  // Count visitors per country
  const countryCounts: Record<string, number> = {};
  data.forEach(({ country }) => {
    if (country) {
      countryCounts[country] = (countryCounts[country] || 0) + 1;
    }
  });

  // Convert object to array format for countries
  const countries = Object.entries(countryCounts).map(([name, count]) => ({
    name,
    count,
  }));

  // Calculate visits in the last 7 days
  const countsByDate: Record<string, number> = {};

  // Initialize counts for all last 7 days to 0
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    countsByDate[key] = 0;
  }

  data.forEach(({ created_at }) => {
    if (!created_at) return;
    const dateKey = created_at.slice(0, 10); // YYYY-MM-DD
    if (countsByDate[dateKey] !== undefined) {
      countsByDate[dateKey]++;
    }
  });

  // Format the last7days array ordered from oldest to newest
  const last7days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7days.push({ date: key, count: countsByDate[key] });
  }

  return NextResponse.json({
    total,
    countries,
    last7days,
  });
}
