const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_SUGGESTIONS_OPEN_MONTHS_BEFORE = 2.5;
export const DEFAULT_VOTING_CLOSES_MONTHS_BEFORE = 2;

function parseDateOnly(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function addMonthsClamped(date, deltaMonths) {
  const sourceYear = date.getUTCFullYear();
  const sourceMonth = date.getUTCMonth();
  const sourceDay = date.getUTCDate();
  const targetMonthIndex = sourceYear * 12 + sourceMonth + deltaMonths;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(sourceDay, lastDay)));
}

export function cleanDateOnly(value) {
  const date = parseDateOnly(value);
  return date ? dateOnly(date) : '';
}

export function cleanMonthsBefore(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 24) return fallback;
  return Math.round(number * 10) / 10;
}

function dateBeforeMeeting(meeting, monthsBefore) {
  const wholeMonths = Math.trunc(monthsBefore);
  const days = Math.round((monthsBefore - wholeMonths) * 30);
  return dateOnly(addDays(addMonthsClamped(meeting, -wholeMonths), -days));
}

export function defaultScheduleForMeetingDate(
  meetingDate,
  suggestionsOpenMonthsBefore = DEFAULT_SUGGESTIONS_OPEN_MONTHS_BEFORE,
  votingClosesMonthsBefore = DEFAULT_VOTING_CLOSES_MONTHS_BEFORE
) {
  const meeting = parseDateOnly(meetingDate);
  if (!meeting) {
    return {
      suggestionsOpenAt: '',
      votingClosesAt: '',
    };
  }

  return {
    suggestionsOpenAt: dateBeforeMeeting(meeting, suggestionsOpenMonthsBefore),
    votingClosesAt: dateBeforeMeeting(meeting, votingClosesMonthsBefore),
  };
}

export function todayDateOnly(now = new Date()) {
  return dateOnly(now);
}

export function isBeforeDateOnly(date, boundary) {
  const cleanDate = cleanDateOnly(date);
  const cleanBoundary = cleanDateOnly(boundary);
  return Boolean(cleanDate && cleanBoundary && cleanDate < cleanBoundary);
}

export function isAfterDateOnly(date, boundary) {
  const cleanDate = cleanDateOnly(date);
  const cleanBoundary = cleanDateOnly(boundary);
  return Boolean(cleanDate && cleanBoundary && cleanDate > cleanBoundary);
}

export function roundScheduleState(round, now = new Date()) {
  const today = todayDateOnly(now);
  return {
    suggestionsAreOpen: !isBeforeDateOnly(today, round.suggestions_open_at),
    votingIsOpen: !isAfterDateOnly(today, round.voting_closes_at),
  };
}
