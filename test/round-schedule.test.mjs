import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultScheduleForMeetingDate, roundScheduleState } from '../functions/_lib/schedule.js';

test('default round schedule is based on the meeting date', () => {
  assert.deepEqual(defaultScheduleForMeetingDate('2026-09-15'), {
    suggestionsOpenAt: '2026-06-30',
    votingClosesAt: '2026-07-15',
  });
});

test('default round schedule clamps calendar month ends', () => {
  assert.deepEqual(defaultScheduleForMeetingDate('2026-03-31'), {
    suggestionsOpenAt: '2026-01-16',
    votingClosesAt: '2026-01-31',
  });
});

test('round schedule can use custom month offsets', () => {
  assert.deepEqual(defaultScheduleForMeetingDate('2026-09-15', 3, 1.5), {
    suggestionsOpenAt: '2026-06-15',
    votingClosesAt: '2026-07-31',
  });
});

test('round schedule state respects suggestion start and inclusive voting close date', () => {
  const round = {
    suggestions_open_at: '2026-06-30',
    voting_closes_at: '2026-07-15',
  };

  assert.deepEqual(roundScheduleState(round, new Date('2026-06-29T12:00:00Z')), {
    suggestionsAreOpen: false,
    votingIsOpen: true,
  });
  assert.deepEqual(roundScheduleState(round, new Date('2026-07-15T12:00:00Z')), {
    suggestionsAreOpen: true,
    votingIsOpen: true,
  });
  assert.deepEqual(roundScheduleState(round, new Date('2026-07-16T12:00:00Z')), {
    suggestionsAreOpen: true,
    votingIsOpen: false,
  });
});
