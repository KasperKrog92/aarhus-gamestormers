// GET /api/round/current — public view of the current round + approved games.
// Vote tallies are returned ONLY once the round is revealed (avoids bandwagon).
import { json, fail } from '../../_lib/http.js';
import { getCurrentRound, getSuggestions, getTallies, toCard } from '../../_lib/db.js';

export async function onRequestGet({ env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const round = await getCurrentRound(db);
  if (!round) return json({ round: null, suggestions: [] });

  const revealed = round.phase === 'revealed' || round.phase === 'closed';
  const suggestions = await getSuggestions(db, round.id, { approvedOnly: true });
  const tallies = revealed ? await getTallies(db, round.id) : null;

  const cards = suggestions.map((s) => toCard(s, revealed ? tallies[s.id] || 0 : null));

  return json({
    round: {
      id: round.id,
      title: round.title,
      phase: round.phase, // suggesting | voting | revealed | closed
      votingClosesAt: round.voting_closes_at,
      winnerSuggestionId: round.winner_suggestion_id,
    },
    suggestions: cards,
    // storm_code is intentionally NOT exposed here.
  });
}
