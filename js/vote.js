/* Aarhus Gamestormers: game suggestion & approval-voting front end.
   Talks to the same-origin Pages Functions API (/api/*). Vanilla JS, no deps
   besides the Cloudflare Turnstile widget. Bilingual via STRINGS[lang]. */
var STRINGS = {
  da: {
    loading: 'Indlæser…',
    statusNone: 'Ingen aktiv afstemning',
    statusUpcoming: 'Forslag åbner snart',
    statusSuggesting: 'Forslag er åbne',
    statusVotingUpcoming: 'Afstemning åbner snart',
    statusVoting: 'Afstemning er åben',
    statusVotingClosed: 'Afstemningen er lukket',
    statusRevealed: 'Resultatet er klar',
    introNone: 'Der er ingen aktiv runde lige nu. Hold øje med Discord for næste afstemning.',
    introUpcoming: 'Forslag åbner snart.',
    introSuggesting:
      'Foreslå et spil til mødet. Steam-spil får titel, billede, genrer og beskrivelse automatisk. Brug mødets kode fra Discord.',
    introVoting:
      'Sæt flueben ved <b>alle</b> de spil, du gerne vil spille. Spillet med flest stemmer vælges til mødet. Brug koden fra Discord.',
    introVotingUpcoming: 'Afstemningen åbner på datoen herunder.',
    introVotingClosed: 'Afstemningen er lukket. Resultatet bliver delt, når det er klar.',
    introRevealed: 'Tak til alle der stemte. Her er resultatet, og vinderen er spillet til mødet.',
    scheduleMeetingDate: 'Mødedato',
    scheduleSuggestionsOpen: 'Forslag åbner',
    scheduleVotingOpens: 'Afstemning åbner',
    scheduleVotingCloses: 'Afstemning lukker',
    nextRoundHeading: 'Næste runde',
    nextRoundIntro: 'Vil du være med igen? Her er den næste runde.',
    nextRoundMeeting: 'Næste møde',
    nextRoundSuggestionsOpen: 'Forslag åbner',
    formTitle: 'Foreslå et spil',
    suggestToggle: 'Foreslå nyt spil',
    hideSuggest: 'Skjul formular',
    guidelinesTitle: 'Hvilke spil passer godt?',
    guidelinesPc: 'Spillet skal kunne spilles på PC.',
    guidelinesLength: 'Det bør som regel tage ca. 10 timer eller mindre at gennemføre.',
    guidelinesLong: 'Længere spil og spil uden fast slutning er velkomne, bare skriv det tydeligt i din pitch.',
    guidelinesCheckPrefix: 'Tjek ',
    guidelinesUpcoming: 'kommende spil',
    guidelinesCheckMiddle: ' og ',
    guidelinesHistory: 'tidligere spil',
    guidelinesCheckSuffix: ', før du foreslår noget.',
    steamQuestion: 'Er spillet på Steam?',
    steamYes: 'Ja, det er på Steam',
    steamNo: 'Nej / ikke på Steam',
    changeChoice: '← Vælg igen',
    labelSteam: 'Steam-link',
    hintSteam: 'Fx https://store.steampowered.com/app/753640/Outer_Wilds/',
    labelTitle: 'Spillets titel',
    titlePlaceholder: 'Fx Hollow Knight: Silksong',
    labelStore: 'Butikslink (valgfri)',
    storePlaceholder: 'Link til GOG, Epic, itch.io …',
    labelGenres: 'Genrer (valgfri)',
    genresPlaceholder: 'Kommasepareret, fx Puzzle, Horror',
    manualNote: 'Spil uden Steam-side bliver gennemset af en admin, før de vises på listen.',
    gameDescription: 'Spilbeskrivelse',
    suggestedPitch: 'Pitch fra forslagsstiller',
    labelPitch: 'Din pitch (valgfri)',
    pitchPlaceholder: 'Hvorfor skulle vi spille det? Skriv et par linjer på engelsk.',
    labelName: 'Dit navn (valgfri)',
    namePlaceholder: 'Vises på forslagskortet',
    labelCode: 'Mødekode',
    codePlaceholder: 'Koden fra Discord',
    hintCode: 'Koden deles på Discord.',
    btnSuggest: 'Send forslag',
    suggestThanks: 'Tak! “{title}” er tilføjet til forslagene.',
    manualThanks: 'Tak! “{title}” bliver vist, når en admin har godkendt det.',
    approvedSoFar: 'Spilforslag',
    castBallot: 'Din stemme',
    btnVote: 'Stem',
    btnVoted: 'Stemme afgivet ✓',
    alreadyVoted: 'Det ser ud til, at du allerede har stemt i denne runde. Du kan stemme igen, men kun den seneste tæller for dig.',
    voteThanks: 'Tak for din stemme!',
    noGames: 'Der er ingen spil på stemmesedlen endnu.',
    by: 'Foreslået af',
    approve: 'Jeg vil gerne spille det her',
    votes: 'stemmer',
    winnerTag: 'Vinder',
    playtime: '⏱ ~{h} t.',
    platformPrefix: 'Tilgængelig på ',
    platformAnd: ' og ',
    errGeneric: 'Noget gik galt. Prøv igen.',
    errPickOne: 'Vælg mindst ét spil.',
  },
  en: {
    loading: 'Loading…',
    statusNone: 'No active vote',
    statusUpcoming: 'Suggestions open soon',
    statusSuggesting: 'Suggestions are open',
    statusVotingUpcoming: 'Voting opens soon',
    statusVoting: 'Voting is open',
    statusVotingClosed: 'Voting is closed',
    statusRevealed: 'The result is in',
    introNone: 'There is no active round right now. Watch Discord for the next vote.',
    introUpcoming: 'Suggestions open soon.',
    introSuggesting:
      "Suggest a game for the meeting. Steam games get title, image, genres and description filled in automatically. Use the meeting code from Discord.",
    introVoting:
      'Tick <b>every</b> game you’d be happy to play. The game with the most ticks is chosen for the meeting. Use the code from Discord.',
    introVotingUpcoming: 'Voting opens on the date below.',
    introVotingClosed: 'Voting is closed. The result will be shared when it is ready.',
    introRevealed: 'Thanks to everyone who voted. Here is the result, and the winner is the game for the meeting.',
    scheduleMeetingDate: 'Meeting date',
    scheduleSuggestionsOpen: 'Suggestions open',
    scheduleVotingOpens: 'Voting opens',
    scheduleVotingCloses: 'Voting closes',
    nextRoundHeading: 'Next round',
    nextRoundIntro: 'Want to join again? Here is the next round.',
    nextRoundMeeting: 'Next meeting',
    nextRoundSuggestionsOpen: 'Suggestions open',
    formTitle: 'Suggest a game',
    suggestToggle: 'Suggest new game',
    hideSuggest: 'Hide form',
    guidelinesTitle: 'What kind of game works well?',
    guidelinesPc: 'The game must be playable on PC.',
    guidelinesLength: 'It should usually take about 10 hours or less to finish.',
    guidelinesLong: 'Longer games and never-ending games are welcome, just make that clear in your pitch.',
    guidelinesCheckPrefix: 'Check ',
    guidelinesUpcoming: 'upcoming games',
    guidelinesCheckMiddle: ' and ',
    guidelinesHistory: 'games already played',
    guidelinesCheckSuffix: ' before suggesting.',
    steamQuestion: 'Is the game on Steam?',
    steamYes: 'Yes, it’s on Steam',
    steamNo: 'No / not on Steam',
    changeChoice: '← Choose again',
    labelSteam: 'Steam link',
    hintSteam: 'e.g. https://store.steampowered.com/app/753640/Outer_Wilds/',
    labelTitle: 'Game title',
    titlePlaceholder: 'e.g. Hollow Knight: Silksong',
    labelStore: 'Store link (optional)',
    storePlaceholder: 'Link to GOG, Epic, itch.io …',
    labelGenres: 'Genres (optional)',
    genresPlaceholder: 'Comma-separated, e.g. Puzzle, Horror',
    manualNote: 'Games without a Steam page are reviewed by an admin before they appear on the list.',
    gameDescription: 'Game description',
    suggestedPitch: 'Suggested pitch',
    labelPitch: 'Your pitch (optional)',
    pitchPlaceholder: 'Why should we play it? Please write a couple of lines in English.',
    labelName: 'Your name (optional)',
    namePlaceholder: 'Shown on the suggestion card',
    labelCode: 'Meeting code',
    codePlaceholder: 'Code from Discord',
    hintCode: 'The code is shared on Discord.',
    btnSuggest: 'Submit suggestion',
    suggestThanks: 'Thanks! “{title}” has been added to the suggestions.',
    manualThanks: 'Thanks! “{title}” will appear once an admin has approved it.',
    approvedSoFar: 'Game suggestions',
    castBallot: 'Your vote',
    btnVote: 'Vote',
    btnVoted: 'Vote cast ✓',
    alreadyVoted: 'Looks like you already voted in this round. You can vote again, but only your latest ballot counts for you.',
    voteThanks: 'Thanks for voting!',
    noGames: 'There are no games on the ballot yet.',
    by: 'Suggested by',
    approve: 'I’d play this',
    votes: 'votes',
    winnerTag: 'Winner',
    playtime: '⏱ ~{h} hrs.',
    platformPrefix: 'Available on ',
    platformAnd: ' and ',
    errGeneric: 'Something went wrong. Please try again.',
    errPickOne: 'Pick at least one game.',
  },
};

(function () {
  var app = document.getElementById('vote-app');
  if (!app) return;

  var TURNSTILE_TEST_SITEKEY = '1x00000000000000000000AA';
  var lang = document.documentElement.lang === 'en' ? 'en' : 'da';
  var isLocalPreview = ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
  var sitekey = isLocalPreview ? TURNSTILE_TEST_SITEKEY : (app.getAttribute('data-turnstile-sitekey') || '');
  var T = STRINGS[lang];

  var tsWidgetId = null;
  var tsToken = '';

  // ── helpers ───────────────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function api(path, opts) {
    return fetch('/api' + path, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data && data.error ? data.error : T.errGeneric);
        return data;
      });
    });
  }

  function playtimeText(h) {
    return T.playtime.replace('{h}', h);
  }

  // Steam platform name -> sprite symbol id (the sprite lives in the page body).
  var PLATFORM_ICONS = { Windows: 'gs-icon-windows', macOS: 'gs-icon-apple', Linux: 'gs-icon-linux' };

  // Small icon row showing which platforms the game runs on, per Steam. Built via
  // innerHTML so the SVG <use> references resolve in the SVG namespace.
  function platformIcons(platforms) {
    var list = (platforms || []).filter(function (p) { return PLATFORM_ICONS[p]; });
    if (!list.length) return null;
    var svg = list
      .map(function (p) { return '<svg class="platform-icon" aria-hidden="true"><use href="#' + PLATFORM_ICONS[p] + '"/></svg>'; })
      .join('');
    var names = list.length > 1 ? list.slice(0, -1).join(', ') + T.platformAnd + list[list.length - 1] : list[0];
    return el('span', { class: 'platform-icons', role: 'img', 'aria-label': T.platformPrefix + names, html: svg });
  }

  function votedKey(roundId) { return 'gs-voted-r' + roundId; }

  function roundNumberText(round) {
    return (lang === 'en' ? 'Meeting ' : 'Møde ') + round.id;
  }

  function roundTitleExtra(round) {
    var title = String(round.title || '').trim();
    var normalized = title.toLowerCase();
    if (title && normalized !== ('meeting ' + round.id).toLowerCase() && normalized !== ('møde ' + round.id).toLowerCase()) {
      return title;
    }
    return '';
  }

  function roundLabel(round) {
    var extra = roundTitleExtra(round);
    return roundNumberText(round) + (extra ? ' · ' + extra : '');
  }

  function formatDate(dateString) {
    var match = String(dateString || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'da-DK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  }

  function nextDateDetail(round) {
    var item = null;
    if (round.suggestionsAreOpen === false) {
      item = [T.scheduleSuggestionsOpen, round.suggestionsOpenAt];
    } else if (round.votingHasStarted === false) {
      item = [T.scheduleVotingOpens, round.votingOpensAt];
    } else if (round.votingIsOpen !== false) {
      item = [T.scheduleVotingCloses, round.votingClosesAt];
    }
    if (!item || !formatDate(item[1])) return null;
    return el('dl', { class: 'vote-schedule' }, [
      el('div', { class: 'vote-schedule-item' }, [
        el('dt', { text: item[0] }),
        el('dd', { text: formatDate(item[1]) }),
      ]),
    ]);
  }

  function roundHero(round, statusText) {
    var meetingDate = formatDate(round.meetingDate);
    var nextDate = nextDateDetail(round);
    return el('div', { class: 'vote-round-hero' }, [
      el('div', { class: 'vote-round-kicker' }, [
        status(statusText),
      ]),
      el('div', { class: 'vote-round-main' }, [
        meetingBadge(round),
        el('div', { class: 'vote-round-dates' }, [
          meetingDate ? el('div', { class: 'vote-date-card' }, [
            el('span', { class: 'vote-date-label', text: T.scheduleMeetingDate }),
            el('time', { class: 'vote-date-value', datetime: round.meetingDate, text: meetingDate }),
          ]) : null,
          nextDate,
        ]),
      ]),
    ]);
  }

  // A small box pointing to the next round once this one is decided. Reuses the
  // guidelines/schedule styling so no new CSS is needed. Returns null when there
  // is no next round or it has no usable dates yet.
  function nextRoundNotice(nextRound) {
    if (!nextRound) return null;
    var rows = [
      [T.nextRoundMeeting, roundLabel(nextRound)],
      [T.scheduleMeetingDate, formatDate(nextRound.meetingDate)],
      [T.nextRoundSuggestionsOpen, formatDate(nextRound.suggestionsOpenAt)],
    ].filter(function (row) { return row[1]; });
    if (rows.length < 2) return null; // need more than just the meeting label
    return el('aside', { class: 'vote-guidelines vote-next-round' }, [
      el('h2', { class: 'vote-guidelines-title', text: T.nextRoundHeading }),
      el('p', { class: 'vote-intro', text: T.nextRoundIntro }),
      el('dl', { class: 'vote-schedule' }, rows.map(function (row) {
        return el('div', { class: 'vote-schedule-item' }, [
          el('dt', { text: row[0] }),
          el('dd', { text: row[1] }),
        ]);
      })),
    ]);
  }

  // ── Turnstile (explicit render so it survives dynamic DOM) ─────────────────
  function mountTurnstile(container) {
    tsToken = '';
    if (!window.turnstile || !sitekey) {
      // Render once the script is ready; retry briefly.
      if (!sitekey) return;
      return void setTimeout(function () { mountTurnstile(container); }, 300);
    }
    if (tsWidgetId !== null) {
      try { window.turnstile.remove(tsWidgetId); } catch (e) {}
      tsWidgetId = null;
    }
    tsWidgetId = window.turnstile.render(container, {
      sitekey: sitekey,
      callback: function (token) { tsToken = token; },
      'expired-callback': function () { tsToken = ''; },
      'error-callback': function () { tsToken = ''; },
    });
  }

  // ── card builder ───────────────────────────────────────────────────────────
  function card(s, mode, opts) {
    opts = opts || {};
    var description = lang === 'en' ? (s.descriptionEn || s.descriptionDa) : (s.descriptionDa || s.descriptionEn);
    var tags = [];
    (s.genres || []).slice(0, 3).forEach(function (g) {
      tags.push(el('span', { class: 'history-genre', text: g }));
    });
    if (s.playtimeHours) tags.push(el('span', { class: 'history-genre', text: playtimeText(s.playtimeHours) }));

    // Title row: game title on the left, platform icons and store links on the
    // right, sharing one line (the cards have no left-side badge like the event
    // cards do, so the title fills that space).
    var storeLinks = [];
    var platforms = platformIcons(s.platforms);
    if (platforms) storeLinks.push(platforms);
    if (s.storeUrl) storeLinks.push(el('a', { href: s.storeUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Steam' }));
    if (s.gogUrl) storeLinks.push(el('a', { href: s.gogUrl, target: '_blank', rel: 'noopener noreferrer', text: 'GOG' }));

    var body = [
      el('div', { class: 'suggestion-head' }, [
        el('h3', { class: 'suggestion-title', text: s.title }),
        storeLinks.length ? el('div', { class: 'suggestion-store-links' }, storeLinks) : null,
      ]),
      tags.length ? el('div', { class: 'suggestion-tags' }, tags) : null,
      description ? el('div', { class: 'suggestion-copy suggestion-copy-description' }, [
        el('span', { class: 'suggestion-copy-label', text: T.gameDescription }),
        el('p', { class: 'suggestion-description', text: description }),
      ]) : null,
      s.pitch ? el('div', { class: 'suggestion-copy suggestion-copy-pitch' }, [
        el('span', { class: 'suggestion-copy-label', text: T.suggestedPitch }),
        el('p', { class: 'suggestion-pitch', text: s.pitch }),
      ]) : null,
      s.suggestedBy ? el('p', { class: 'suggestion-by', html: T.by + ' <b>' + escapeHtml(s.suggestedBy) + '</b>' }) : null,
    ];

    var classes = 'suggestion-card';

    if (mode === 'vote') {
      classes += ' is-selectable';
      var checkbox = el('input', { type: 'checkbox', value: s.id, 'aria-label': T.approve });
      // Plain div (not a <label>) so the card-level click handler is the single
      // source of truth for toggling, avoiding a native+manual double toggle.
      var toggle = el('div', { class: 'vote-toggle' }, [checkbox, el('span', { class: 'vote-toggle-label', text: T.approve })]);
      body.push(toggle);
    }

    if (mode === 'result') {
      var max = opts.maxVotes || 1;
      var pct = Math.round(((s.votes || 0) / max) * 100);
      var isWinner = opts.winnerId === s.id;
      if (isWinner) classes += ' winner';
      var head = el('div', { class: 'vote-result-head' }, [
        el('span', { class: 'vote-count', text: (s.votes || 0) + ' ' + T.votes }),
        isWinner ? el('span', { class: 'vote-winner-tag', text: T.winnerTag }) : null,
      ]);
      var bar = el('div', { class: 'vote-bar-track' }, [el('div', { class: 'vote-bar-fill' })]);
      var result = el('div', { class: 'vote-result' }, [head, bar]);
      body.push(result);
      // animate width after insertion
      setTimeout(function () { bar.firstChild.style.width = pct + '%'; }, 30);
    }

    var node = el('article', { class: classes }, [
      el('img', { class: 'suggestion-cover', src: s.image, alt: s.title, loading: 'lazy', decoding: 'async' }),
      el('div', { class: 'suggestion-body' }, body),
    ]);

    if (mode === 'vote') {
      var cb = node.querySelector('input[type=checkbox]');
      node.addEventListener('click', function (e) {
        if (e.target !== cb) cb.checked = !cb.checked;
        node.classList.toggle('selected', cb.checked);
      });
    }
    return node;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function grid(cards) {
    return el('div', { class: 'suggestion-grid' }, cards);
  }

  function status(text) {
    return el('span', { class: 'vote-status', text: text });
  }

  function meetingBadge(round) {
    var extra = roundTitleExtra(round);
    return el('div', { class: 'vote-meeting' }, [
      el('span', { class: 'vote-meeting-label', text: lang === 'en' ? 'Meeting' : 'Møde' }),
      el('strong', { class: 'vote-meeting-number', text: String(round.id) }),
      extra ? el('span', { class: 'vote-meeting-title', text: extra }) : null,
    ]);
  }

  function suggestionGuidelines() {
    var eventsHref = lang === 'en' ? '/en/#events' : '/#events';
    var historyHref = lang === 'en' ? '/en/#history' : '/#history';
    return el('aside', { class: 'vote-guidelines' }, [
      el('h2', { class: 'vote-guidelines-title', text: T.guidelinesTitle }),
      el('ul', null, [
        el('li', { text: T.guidelinesPc }),
        el('li', { text: T.guidelinesLength }),
        el('li', { text: T.guidelinesLong }),
        el('li', null, [
          T.guidelinesCheckPrefix,
          el('a', { href: eventsHref, text: T.guidelinesUpcoming }),
          T.guidelinesCheckMiddle,
          el('a', { href: historyHref, text: T.guidelinesHistory }),
          T.guidelinesCheckSuffix,
        ]),
      ]),
    ]);
  }

  function msgBox() {
    return el('div', { class: 'vote-msg', role: 'status', hidden: 'hidden' });
  }
  function showMsg(box, text, ok) {
    box.className = 'vote-msg ' + (ok ? 'ok' : 'err');
    box.textContent = text;
    box.hidden = false;
  }

  // ── phase renderers ─────────────────────────────────────────────────────────
  function renderNone() {
    clear(app);
    app.appendChild(el('div', { class: 'vote-round-hero vote-round-hero-empty' }, [
      status(T.statusNone),
    ]));
    app.appendChild(el('p', { class: 'vote-intro', text: T.introNone }));
  }

  function renderSuggesting(data) {
    var suggestionsOpen = data.round.suggestionsAreOpen !== false;
    clear(app);
    app.appendChild(roundHero(data.round, suggestionsOpen ? T.statusSuggesting : T.statusUpcoming));
    app.appendChild(el('p', { class: 'vote-intro', html: suggestionsOpen ? T.introSuggesting : T.introUpcoming }));
    if (!suggestionsOpen) return;
    var suggestionItems = data.suggestions.slice();
    var suggestionHeading = el('h2', { class: 'vote-list-title', text: T.approvedSoFar });
    var suggestionGrid = grid([]);
    var suggestionListMounted = false;

    function renderSuggestionList() {
      clear(suggestionGrid);
      suggestionItems.forEach(function (s) {
        suggestionGrid.appendChild(card(s, 'list'));
      });

      if (!suggestionListMounted && suggestionItems.length) {
        app.appendChild(suggestionHeading);
        app.appendChild(suggestionGrid);
        suggestionListMounted = true;
      }
    }

    function addApprovedSuggestion(suggestion) {
      if (!suggestion || suggestion.id == null) return;
      var exists = suggestionItems.some(function (s) { return s.id === suggestion.id; });
      if (!exists) suggestionItems.push(suggestion);
      renderSuggestionList();
    }

    // The disclosure reveals a container that walks through: a Steam yes/no
    // question → the matching form. Switching forms simply re-renders `panel`.
    var panel = el('div');
    panel.hidden = true;

    var disclosureText = el('span', { text: T.suggestToggle });
    var disclosureChevron = el('span', { class: 'vote-disclosure-chevron', text: 'v', 'aria-hidden': 'true' });
    var disclosureBtn = el('button', { class: 'vote-disclosure', type: 'button', 'aria-expanded': 'false' }, [
      disclosureText,
      disclosureChevron,
    ]);

    disclosureBtn.addEventListener('click', function () {
      var opening = panel.hidden;
      panel.hidden = !opening;
      disclosureBtn.setAttribute('aria-expanded', opening ? 'true' : 'false');
      disclosureText.textContent = opening ? T.hideSuggest : T.suggestToggle;
      if (opening) showChoice();
      else clear(panel);
    });

    function backLink() {
      return el('button', { class: 'vote-back', type: 'button', text: T.changeChoice, onclick: showChoice });
    }

    function showChoice() {
      clear(panel);
      var yesBtn = el('button', { class: 'btn-green', type: 'button', text: T.steamYes, onclick: showSteamForm });
      var noBtn = el('button', { class: 'vote-choice-alt', type: 'button', text: T.steamNo, onclick: showManualForm });
      panel.appendChild(suggestionGuidelines());
      panel.appendChild(el('div', { class: 'vote-panel vote-choice' }, [
        el('h2', { class: 'vote-panel-title', text: T.steamQuestion }),
        el('div', { class: 'vote-choice-btns' }, [yesBtn, noBtn]),
      ]));
    }

    // Shared submit: posts the payload, shows the right thanks message, resets.
    function wireSubmit(form, btn, box, buildBody, clearInputs, thanks) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        btn.disabled = true;
        api('/suggest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildBody()),
        })
          .then(function (res) {
            showMsg(box, thanks.replace('{title}', res.game.title), true);
            if (!res.pending) addApprovedSuggestion(res.game);
            clearInputs();
            if (window.turnstile && tsWidgetId !== null) window.turnstile.reset(tsWidgetId);
          })
          .catch(function (err) { showMsg(box, err.message, false); })
          .finally(function () { btn.disabled = false; });
      });
    }

    function showSteamForm() {
      clear(panel);
      var steam = el('input', { class: 'vote-input', type: 'url', placeholder: 'https://store.steampowered.com/app/…' });
      var pitch = el('textarea', { class: 'vote-textarea', placeholder: T.pitchPlaceholder, maxlength: '500' });
      var name = el('input', { class: 'vote-input', type: 'text', placeholder: T.namePlaceholder, maxlength: '80' });
      var code = el('input', { class: 'vote-input', type: 'text', placeholder: T.codePlaceholder, maxlength: '40' });
      var tsBox = el('div');
      var box = msgBox();
      var btn = el('button', { class: 'btn-green', type: 'submit', text: T.btnSuggest });

      var form = el('form', { class: 'vote-panel' }, [
        el('div', { class: 'vote-panel-head' }, [el('h2', { class: 'vote-panel-title', text: T.formTitle }), backLink()]),
        field(T.labelSteam, steam, T.hintSteam),
        field(T.labelPitch, pitch),
        field(T.labelName, name),
        field(T.labelCode, code, T.hintCode),
        tsBox,
        el('div', { class: 'vote-actions' }, [btn]),
        box,
      ]);

      wireSubmit(
        form, btn, box,
        function () {
          return {
            onSteam: true,
            steamUrl: steam.value,
            pitch: pitch.value,
            suggestedBy: name.value,
            stormCode: code.value,
            turnstileToken: tsToken,
          };
        },
        function () { steam.value = pitch.value = name.value = ''; },
        T.suggestThanks
      );

      panel.appendChild(form);
      mountTurnstile(tsBox);
    }

    function showManualForm() {
      clear(panel);
      var title = el('input', { class: 'vote-input', type: 'text', placeholder: T.titlePlaceholder, maxlength: '200' });
      var store = el('input', { class: 'vote-input', type: 'url', placeholder: T.storePlaceholder, maxlength: '400' });
      var genres = el('input', { class: 'vote-input', type: 'text', placeholder: T.genresPlaceholder, maxlength: '200' });
      var pitch = el('textarea', { class: 'vote-textarea', placeholder: T.pitchPlaceholder, maxlength: '500' });
      var name = el('input', { class: 'vote-input', type: 'text', placeholder: T.namePlaceholder, maxlength: '80' });
      var code = el('input', { class: 'vote-input', type: 'text', placeholder: T.codePlaceholder, maxlength: '40' });
      var tsBox = el('div');
      var box = msgBox();
      var btn = el('button', { class: 'btn-green', type: 'submit', text: T.btnSuggest });

      var form = el('form', { class: 'vote-panel' }, [
        el('div', { class: 'vote-panel-head' }, [el('h2', { class: 'vote-panel-title', text: T.formTitle }), backLink()]),
        el('p', { class: 'vote-hint', text: T.manualNote }),
        field(T.labelTitle, title),
        field(T.labelStore, store),
        field(T.labelGenres, genres),
        field(T.labelPitch, pitch),
        field(T.labelName, name),
        field(T.labelCode, code, T.hintCode),
        tsBox,
        el('div', { class: 'vote-actions' }, [btn]),
        box,
      ]);

      wireSubmit(
        form, btn, box,
        function () {
          return {
            onSteam: false,
            title: title.value,
            storeUrl: store.value,
            genres: genres.value,
            pitch: pitch.value,
            suggestedBy: name.value,
            stormCode: code.value,
            turnstileToken: tsToken,
          };
        },
        function () { title.value = store.value = genres.value = pitch.value = name.value = ''; },
        T.manualThanks
      );

      panel.appendChild(form);
      mountTurnstile(tsBox);
    }

    app.appendChild(el('div', { class: 'vote-disclosure-wrap' }, [disclosureBtn, panel]));

    // Already-approved suggestions appear below the form (read-only).
    renderSuggestionList();
  }

  function renderVoting(data) {
    var votingOpen = data.round.votingIsOpen !== false;
    var votingHasStarted = data.round.votingHasStarted !== false;
    clear(app);
    app.appendChild(roundHero(data.round, votingOpen ? T.statusVoting : (votingHasStarted ? T.statusVotingClosed : T.statusVotingUpcoming)));
    app.appendChild(el('p', { class: 'vote-intro', html: votingOpen ? T.introVoting : (votingHasStarted ? T.introVotingClosed : T.introVotingUpcoming) }));
    if (!votingHasStarted) return;
    if (!votingOpen) {
      var closedNotice = nextRoundNotice(data.nextRound);
      if (closedNotice) app.appendChild(closedNotice);
      return;
    }

    if (!data.suggestions.length) {
      app.appendChild(el('p', { class: 'vote-empty', text: T.noGames }));
      return;
    }

    var cards = data.suggestions.map(function (s) { return card(s, 'vote'); });
    app.appendChild(grid(cards));

    var name = el('input', { class: 'vote-input', type: 'text', placeholder: T.namePlaceholder, maxlength: '80' });
    var code = el('input', { class: 'vote-input', type: 'text', placeholder: T.codePlaceholder, maxlength: '40' });
    var tsBox = el('div');
    var box = msgBox();
    var btn = el('button', { class: 'btn-green', type: 'submit', text: T.btnVote });

    var alreadyVoted = !!localStorage.getItem(votedKey(data.round.id));
    var note = alreadyVoted ? el('p', { class: 'vote-hint', text: T.alreadyVoted }) : null;

    var form = el('form', { class: 'vote-panel' }, [
      el('h2', { class: 'vote-panel-title', text: T.castBallot }),
      field(T.labelName, name),
      field(T.labelCode, code, T.hintCode),
      tsBox,
      el('div', { class: 'vote-actions' }, [btn]),
      note,
      box,
    ]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ids = cards
        .filter(function (c) { return c.querySelector('input[type=checkbox]').checked; })
        .map(function (c) { return Number(c.querySelector('input[type=checkbox]').value); });
      if (!ids.length) return showMsg(box, T.errPickOne, false);

      btn.disabled = true;
      api('/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suggestionIds: ids, voterName: name.value, stormCode: code.value, turnstileToken: tsToken }),
      })
        .then(function (res) {
          localStorage.setItem(votedKey(data.round.id), res.ballotId);
          showMsg(box, T.voteThanks, true);
          btn.textContent = T.btnVoted;
        })
        .catch(function (err) {
          showMsg(box, err.message, false);
          btn.disabled = false;
        });
    });

    app.appendChild(form);
    mountTurnstile(tsBox);
  }

  function renderRevealed(data) {
    clear(app);
    app.appendChild(roundHero(data.round, T.statusRevealed));
    app.appendChild(el('p', { class: 'vote-intro', text: T.introRevealed }));

    if (!data.suggestions.length) {
      app.appendChild(el('p', { class: 'vote-empty', text: T.noGames }));
      var emptyNotice = nextRoundNotice(data.nextRound);
      if (emptyNotice) app.appendChild(emptyNotice);
      return;
    }

    var maxVotes = Math.max.apply(null, data.suggestions.map(function (s) { return s.votes || 0; }).concat([1]));
    var winnerId = data.round.winnerSuggestionId;
    if (winnerId == null) {
      // fall back to the top-tally suggestion
      var top = data.suggestions.slice().sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); })[0];
      winnerId = top ? top.id : null;
    }

    var sorted = data.suggestions.slice().sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); });
    app.appendChild(grid(sorted.map(function (s) { return card(s, 'result', { maxVotes: maxVotes, winnerId: winnerId }); })));

    var notice = nextRoundNotice(data.nextRound);
    if (notice) app.appendChild(notice);
  }

  function field(label, control, hint) {
    return el('div', { class: 'vote-field' }, [
      el('label', { class: 'vote-label', text: label }),
      control,
      hint ? el('p', { class: 'vote-hint', html: hint }) : null,
    ]);
  }

  // ── boot ─────────────────────────────────────────────────────────────────
  function load() {
    app.appendChild(el('p', { class: 'vote-intro', text: T.loading }));
    api('/round/current')
      .then(function (data) {
        if (!data.round) return renderNone();
        if (data.round.phase === 'suggesting') return renderSuggesting(data);
        if (data.round.phase === 'voting') return renderVoting(data);
        return renderRevealed(data); // revealed | closed
      })
      .catch(function (err) {
        clear(app);
        var box = msgBox();
        app.appendChild(box);
        showMsg(box, err.message, false);
      });
  }

  load();
})();
