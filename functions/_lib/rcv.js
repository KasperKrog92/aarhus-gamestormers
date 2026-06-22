const MAJORITY_THRESHOLD_NOTE = 'more than half of active ballots';

function normalizeCandidateIds(candidateIds) {
  const seen = new Set();
  const normalized = [];
  for (const value of Array.isArray(candidateIds) ? candidateIds : []) {
    const id = Number(value);
    if (!Number.isInteger(id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

function normalizeBallots(ballots, candidateSet) {
  return (Array.isArray(ballots) ? ballots : []).map((ballot) => {
    const seen = new Set();
    const ranking = [];
    for (const value of Array.isArray(ballot) ? ballot : []) {
      const id = Number(value);
      if (!Number.isInteger(id) || !candidateSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      ranking.push(id);
    }
    return ranking;
  });
}

function assignBallots(ballots, standing) {
  const counts = new Map([...standing].map((id) => [id, 0]));
  const assignments = [];
  let exhausted = 0;

  for (const ballot of ballots) {
    const assignedId = ballot.find((id) => standing.has(id)) ?? null;
    assignments.push(assignedId);
    if (assignedId == null) {
      exhausted += 1;
    } else {
      counts.set(assignedId, counts.get(assignedId) + 1);
    }
  }

  return { assignments, counts, exhausted };
}

function sortedCounts(standing, counts) {
  return [...standing]
    .map((id) => ({ id, votes: counts.get(id) || 0 }))
    .sort((a, b) => b.votes - a.votes || a.id - b.id);
}

function incomingTransfers(previousAssignments, assignments) {
  if (!previousAssignments) return {};
  const transfers = {};
  for (let i = 0; i < assignments.length; i += 1) {
    const previousId = previousAssignments[i];
    const nextId = assignments[i];
    if (previousId != null && nextId != null && previousId !== nextId) {
      transfers[nextId] = (transfers[nextId] || 0) + 1;
    }
  }
  return transfers;
}

function countFor(round, id) {
  const entry = round.counts.find((count) => count.id === id);
  return entry ? entry.votes : 0;
}

function chooseElimination(tiedIds, firstRound, priorRounds) {
  let tied = [...tiedIds];

  const fewestFirstPreferences = Math.min(...tied.map((id) => countFor(firstRound, id)));
  tied = tied.filter((id) => countFor(firstRound, id) === fewestFirstPreferences);
  if (tied.length === 1) return tied[0];

  for (let i = priorRounds.length - 1; i >= 0; i -= 1) {
    const prior = priorRounds[i];
    const votes = tied.map((id) => countFor(prior, id));
    if (new Set(votes).size === 1) continue;
    const fewestPriorVotes = Math.min(...votes);
    tied = tied.filter((id) => countFor(prior, id) === fewestPriorVotes);
    if (tied.length === 1) return tied[0];
  }

  return Math.min(...tied);
}

function emptyResult(totalBallots) {
  return {
    winnerId: null,
    blocked: { reason: 'no_ballots', tied: [] },
    majorityThresholdNote: MAJORITY_THRESHOLD_NOTE,
    totalBallots,
    rounds: [],
  };
}

export function runIrv({ ballots = [], candidateIds = [] } = {}) {
  const candidates = normalizeCandidateIds(candidateIds);
  const normalizedBallots = normalizeBallots(ballots, new Set(candidates));
  const totalBallots = normalizedBallots.length;

  if (totalBallots === 0 || candidates.length === 0) return emptyResult(totalBallots);

  const result = {
    winnerId: null,
    blocked: null,
    majorityThresholdNote: MAJORITY_THRESHOLD_NOTE,
    totalBallots,
    rounds: [],
  };
  const standing = new Set(candidates);
  let previousAssignments = null;

  while (standing.size > 0) {
    const { assignments, counts, exhausted } = assignBallots(normalizedBallots, standing);
    const activeBallots = totalBallots - exhausted;
    const majority = Math.floor(activeBallots / 2) + 1;
    const round = {
      round: result.rounds.length + 1,
      counts: sortedCounts(standing, counts),
      activeBallots,
      exhausted,
      majority,
      eliminatedId: null,
      winnerId: null,
      transfersInto: incomingTransfers(previousAssignments, assignments),
    };

    if (standing.size === 1) {
      const [winnerId] = standing;
      round.winnerId = winnerId;
      result.winnerId = winnerId;
      result.rounds.push(round);
      return result;
    }

    const majorityWinner = round.counts.find((candidate) => candidate.votes >= majority);
    if (majorityWinner && activeBallots > 0) {
      round.winnerId = majorityWinner.id;
      result.winnerId = majorityWinner.id;
      result.rounds.push(round);
      return result;
    }

    const lowestVotes = Math.min(...round.counts.map((candidate) => candidate.votes));
    const lowestIds = round.counts
      .filter((candidate) => candidate.votes === lowestVotes)
      .map((candidate) => candidate.id);

    if (standing.size === 2 && lowestIds.length === 2) {
      result.blocked = {
        reason: 'tie',
        tied: round.counts.map(({ id, votes }) => ({ id, votes })),
      };
      result.rounds.push(round);
      return result;
    }

    const eliminatedId = lowestIds.length === 1
      ? lowestIds[0]
      : chooseElimination(lowestIds, result.rounds[0] || round, result.rounds);
    round.eliminatedId = eliminatedId;
    result.rounds.push(round);
    standing.delete(eliminatedId);
    previousAssignments = assignments;
  }

  return result;
}
