import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEventJsonLd, buildEventsJsonLd, mergeEventsIntoGraph } from '../js/meetings.js';

function meeting(overrides = {}) {
  return {
    id: 17,
    meetingDate: '2026-07-06',
    startsAtUtc: '2026-07-06T16:30:00Z',
    endsAtUtc: '2026-07-06T19:00:00Z',
    timezone: 'Europe/Copenhagen',
    venue: { name: 'Folkehuset Møllestien', address: 'Grønnegade 10, 8000 Aarhus C' },
    discordInvite: 'https://discord.gg/N2h6DJxVDF',
    status: 'revealed',
    game: {
      id: 5,
      title: 'Blue Prince',
      image: 'https://cdn.akamai.steamstatic.com/steam/apps/1569580/header.jpg',
      descriptionDa: 'Dansk spilbeskrivelse.',
      descriptionEn: 'English game description.',
    },
    copy: {
      da: { eventDescription: 'Dansk eventtekst.', historyDescription: '' },
      en: { eventDescription: 'English event copy.', historyDescription: '' },
    },
    calendar: { uid: 'gamestormers-17@gamestormers.dk', filename: 'gamestormers-17.ics' },
    ...overrides,
  };
}

test('buildEventJsonLd produces a schema.org Event from D1 dates and venue', () => {
  const node = buildEventJsonLd(meeting(), 'da');

  assert.equal(node['@type'], 'Event');
  assert.equal(node['@id'], 'https://www.gamestormers.dk/#event-17-2026-07-06');
  assert.equal(node.name, 'Aarhus Gamestormers: Blue Prince');
  assert.equal(node.description, 'Dansk eventtekst.');
  // Copenhagen summer time is +02:00
  assert.equal(node.startDate, '2026-07-06T18:30:00+02:00');
  assert.equal(node.endDate, '2026-07-06T21:00:00+02:00');
  assert.equal(node.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
  assert.equal(node.url, 'https://www.gamestormers.dk/#events');
  assert.equal(node.location.name, 'Folkehuset Møllestien');
  assert.deepEqual(node.location.address, {
    '@type': 'PostalAddress',
    streetAddress: 'Grønnegade 10',
    postalCode: '8000',
    addressLocality: 'Aarhus C',
    addressCountry: 'DK',
  });
  assert.equal(node.organizer['@id'], 'https://www.gamestormers.dk/#organization');
});

test('buildEventJsonLd uses the English url and copy', () => {
  const node = buildEventJsonLd(meeting(), 'en');
  assert.equal(node.url, 'https://www.gamestormers.dk/en/#events');
  assert.equal(node.description, 'English event copy.');
});

test('buildEventsJsonLd skips meetings without a selected game', () => {
  const nodes = buildEventsJsonLd([meeting(), { id: 18, game: null }], 'da');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0]['@id'], 'https://www.gamestormers.dk/#event-17-2026-07-06');
});

test('mergeEventsIntoGraph keeps non-Event nodes and replaces Event nodes', () => {
  const graph = [
    { '@type': 'Organization', '@id': 'https://www.gamestormers.dk/#organization' },
    { '@type': 'Event', '@id': 'https://www.gamestormers.dk/#event-old' },
  ];
  const events = buildEventsJsonLd([meeting()], 'da');
  const merged = mergeEventsIntoGraph(graph, events);

  assert.equal(merged.length, 2);
  assert.equal(merged[0]['@type'], 'Organization');
  assert.equal(merged[1]['@id'], 'https://www.gamestormers.dk/#event-17-2026-07-06');
  assert.equal(merged.some((n) => n['@id'] === 'https://www.gamestormers.dk/#event-old'), false);
});

test('mergeEventsIntoGraph removes stale Event nodes when D1 has no upcoming events', () => {
  const graph = [
    { '@type': 'Organization', '@id': 'https://www.gamestormers.dk/#organization' },
    { '@type': 'Event', '@id': 'https://www.gamestormers.dk/#event-old' },
  ];
  const merged = mergeEventsIntoGraph(graph, []);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]['@type'], 'Organization');
  assert.equal(merged.some((n) => n['@type'] === 'Event'), false);
});
