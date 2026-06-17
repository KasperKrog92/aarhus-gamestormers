const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_SUGGESTIONS_OPEN_MONTHS_BEFORE = 2.8;
export const DEFAULT_VOTING_OPENS_MONTHS_BEFORE = 2.5;
export const DEFAULT_VOTING_CLOSES_MONTHS_BEFORE = 2.2;
export const DEFAULT_MEETING_TIMEZONE = 'Europe/Copenhagen';

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

function cleanTime(value) {
  const match = String(value || '').trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return match[1] + ':' + match[2];
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

export function cleanTimeOnly(value) {
  return cleanTime(value);
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
  votingOpensMonthsBefore = DEFAULT_VOTING_OPENS_MONTHS_BEFORE,
  votingClosesMonthsBefore = DEFAULT_VOTING_CLOSES_MONTHS_BEFORE
) {
  const meeting = parseDateOnly(meetingDate);
  if (!meeting) {
    return {
      suggestionsOpenAt: '',
      votingOpensAt: '',
      votingClosesAt: '',
    };
  }

  return {
    suggestionsOpenAt: dateBeforeMeeting(meeting, suggestionsOpenMonthsBefore),
    votingOpensAt: dateBeforeMeeting(meeting, votingOpensMonthsBefore),
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
  const votingHasStarted = !isBeforeDateOnly(today, round.voting_opens_at);
  return {
    suggestionsAreOpen: !isBeforeDateOnly(today, round.suggestions_open_at),
    votingHasStarted,
    votingIsOpen: votingHasStarted && !isAfterDateOnly(today, round.voting_closes_at),
  };
}

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function localPartsMillis(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function zonedLocalToUtc(date, time, timeZone) {
  const cleanDate = cleanDateOnly(date);
  const cleanMeetingTime = cleanTimeOnly(time);
  if (!cleanDate || !cleanMeetingTime) return '';

  const [year, month, day] = cleanDate.split('-').map(Number);
  const [hour, minute] = cleanMeetingTime.split(':').map(Number);
  const wanted = { year, month, day, hour, minute };
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  for (let i = 0; i < 3; i += 1) {
    const actual = getTimeZoneParts(guess, timeZone);
    const diff = localPartsMillis(wanted) - localPartsMillis(actual);
    if (diff === 0) return guess.toISOString();
    guess = new Date(guess.getTime() + diff);
  }

  return guess.toISOString();
}

export function meetingUtcRange(meetingDate, startTime, endTime, timeZone = DEFAULT_MEETING_TIMEZONE) {
  const cleanDate = cleanDateOnly(meetingDate);
  const cleanStart = cleanTimeOnly(startTime);
  const cleanEnd = cleanTimeOnly(endTime);
  if (!cleanDate || !cleanStart || !cleanEnd) return { startsAtUtc: '', endsAtUtc: '' };

  const startsAtUtc = zonedLocalToUtc(cleanDate, cleanStart, timeZone);
  let endDate = cleanDate;
  if (cleanEnd <= cleanStart) {
    const parsed = parseDateOnly(cleanDate);
    endDate = parsed ? dateOnly(addDays(parsed, 1)) : cleanDate;
  }
  const endsAtUtc = zonedLocalToUtc(endDate, cleanEnd, timeZone);
  return { startsAtUtc, endsAtUtc };
}

export function timeOnlyInZone(isoUtc, timeZone = DEFAULT_MEETING_TIMEZONE) {
  const date = new Date(isoUtc);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = getTimeZoneParts(date, timeZone);
  return String(parts.hour).padStart(2, '0') + ':' + String(parts.minute).padStart(2, '0');
}
