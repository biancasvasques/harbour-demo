import { NextResponse } from 'next/server';
import { freeSlots } from '@/lib/booking';
import { toolsAuthorized } from '@/lib/tools-auth';

export const dynamic = 'force-dynamic';

// Tool for the agent workflow: free consultation times.
export async function GET(req: Request) {
  if (!toolsAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const slots = await freeSlots();
  return NextResponse.json({ count: slots.length, slots });
}
