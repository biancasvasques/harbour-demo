import { timingSafeEqual } from 'node:crypto';

// The tools are called by the n8n workflow, never by the browser.
// n8n sends the shared secret in the x-harbour-key header.
export function toolsAuthorized(req: Request): boolean {
  const expected = process.env.TOOLS_SECRET ?? '';
  const got = req.headers.get('x-harbour-key') ?? '';
  if (expected.length < 24 || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
