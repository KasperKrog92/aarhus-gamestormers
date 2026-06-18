import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultScheduleForMeetingDate,
  meetingUtcRange,
  midpointDateOnly,
  roundScheduleState,
  timeOnlyInZone,
} from '../functions/_lib/schedule.js';

test('default round schedule is based on the meeting date', () => {
  assert.deepEqual(defaultScheduleForMeetingDate('2026-09-15'), {
    suggestionsOpenAt: '2026-06-21',
    votingOpensAt: '2026-06-30',
    votingClosesAt: '2026-07-09',
  });
});

test('default round schedule clamps calendar month ends', () => {
  assert.deepEqual(defaultScheduleForMeetingDate('2026-03-31'), {
    suggestionsOpenAt: '2026-01-07',
    votingOpensAt: '2026-01-16',
    votingClosesAt: '2026-01-25',
  });
});

test('round schedule can use custom month offsets', () => {
  assert.deepEqual(defaultScheduleForMeetingDate('2026-09-15', 3, 2, 1.5), {
    suggestionsOpenAt: '2026-06-15',
    votingOpensAt: '2026-07-15',
    votingClosesAt: '2026-07-31',
  });
});

test('round schedule state respects suggestion start and inclusive voting close date', () => {
  const round = {
    suggestions_open_at: '2026-06-21',
    voting_opens_at: '2026-06-30',
    voting_closes_at: '2026-07-09',
  };

  assert.deepEqual(roundScheduleState(round, new Date('2026-06-20T12:00:00Z')), {
    suggestionsAreOpen: false,
    votingHasStarted: false,
    votingIsOpen: false,
  });
  assert.deepEqual(roundScheduleState(round, new Date('2026-06-30T12:00:00Z')), {
    suggestionsAreOpen: true,
    votingHasStarted: true,
    votingIsOpen: true,
  });
  assert.deepEqual(roundScheduleState(round, new Date('2026-07-10T12:00:00Z')), {
    suggestionsAreOpen: true,
    votingHasStarted: true,
    votingIsOpen: false,
  });
});

test('midpointDateOnly floors the halfway day between two dates', () => {
  // Reveal anchor 2026-07-08, next suggestions open 2026-07-12 -> 4-day gap, midpoint 07-10.
  assert.equal(midpointDateOnly('2026-07-08', '2026-07-12'), '2026-07-10');
  // Odd gap floors toward the start date.
  assert.equal(midpointDateOnly('2026-07-08', '2026-07-13'), '2026-07-10');
  // Invalid input yields an empty string so callers skip the close.
  assert.equal(midpointDateOnly('2026-07-08', ''), '');
  assert.equal(midpointDateOnly('', '2026-07-12'), '');
});

test('meetingUtcRange converts Copenhagen meeting times to UTC with daylight saving', () => {
  assert.deepEqual(meetingUtcRange('2026-08-03', '18:30', '21:00'), {
    startsAtUtc: '2026-08-03T16:30:00.000Z',
    endsAtUtc: '2026-08-03T19:00:00.000Z',
  });

  assert.equal(timeOnlyInZone('2026-08-03T16:30:00.000Z'), '18:30');
});
