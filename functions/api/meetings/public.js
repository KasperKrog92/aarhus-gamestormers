// GET /api/meetings/public - public-safe homepage meeting data.
import { json, fail } from '../../_lib/http.js';
import { getPublicMeetings } from '../../_lib/db.js';

export async function onRequestGet({ env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const meetings = await getPublicMeetings(db);
  return json({ meetings });
}
