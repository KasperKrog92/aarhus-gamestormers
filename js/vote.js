/* Aarhus Gamestormers: game suggestion & approval-voting front end.
   Talks to the same-origin Pages Functions API (/api/*). Vanilla JS, no deps
   Bilingual via STRINGS[lang]. */
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
      'Foreslå et spil til mødet. Steam-spil får titel, billede, genrer og beskrivelse automatisk.',
    introVoting:
      'Sæt flueben ved <b>alle</b> de spil, du gerne vil spille. Spillet med flest stemmer vælges til mødet.',
    introVotingUpcoming: 'Afstemningen åbner på datoen herunder.',
    introVotingClosed: 'Afstemningen er lukket. Resultatet bliver delt, når det er klar.',
    introRevealed: 'Tak til alle der stemte. Her er resultatet, og vinderen er spillet til mødet.',
    loginTitle: 'Log ind for at deltage',
    loginSuggest: 'Log ind med Discord for at foreslå spil.',
    loginVote: 'Log ind med Discord for at stemme.',
    loginButton: 'Log ind med Discord',
    logoutButton: 'Log ud',
    loggedInAs: 'Logget ind som',
    nonMemberTitle: 'Du er logget ind, men mangler serveren',
    nonMemberText: 'Denne Discord-konto ser ikke ud til at være medlem af Aarhus Gamestormers-serveren endnu.',
    inviteLink: 'Gå til Discord-serveren',
    retryLogin: 'Log ud og ind igen, når du er med i serveren.',
    privacyNote: 'We use Discord login only to confirm membership in the Aarhus Gamestormers Discord server and prevent duplicate voting/suggestions. We do not access your messages, friends, or email.',
    authError: 'Discord-login lykkedes ikke. Prøv igen.',
    scheduleMeetingDate: 'Mødedato',
    scheduleSuggestionsOpen: 'Forslag åbner',
    scheduleVotingOpens: 'Afstemning åbner',
    scheduleVotingCloses: 'Afstemning lukker',
    nextRoundHeading: 'Næste runde',
    nextRoundIntro: 'Vil du være med igen? Her er den næste runde.',
    nextRoundMeeting: 'Næste møde',
    nextRoundSuggestionsOpen: 'Forslag åbner',
    countdownPrefix: 'Tid til',
    countdownNow: 'I dag',
    countdownDays: 'Dage',
    countdownHours: 'Timer',
    countdownMinutes: 'Minutter',
    countdownSeconds: 'Sekunder',
    timelineSuggestions: 'Forslag',
    timelineVoting: 'Afstemning',
    timelineWinner: 'Vinder',
    timelineMeeting: 'Klubaften',
    flowTitle: 'Sådan foregår et møde',
    flowSuggestTitle: 'Foreslå',
    flowSuggestText: 'Medlemmer foreslår spil, der passer til fælles spil og diskussion.',
    flowVoteTitle: 'Stem',
    flowVoteText: 'Når afstemningen åbner, stemmer du på alle de spil, du gerne vil spille.',
    flowWinnerTitle: 'Vinderen findes',
    flowWinnerText: 'Spillet med flest stemmer bliver valgt til mødet.',
    flowMeetingTitle: 'Spil og diskutér',
    flowMeetingText: 'Vi spiller hjemmefra og mødes til en fælles samtale i klubben.',
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
    showNameLabel: 'Vis mit Discord-navn på forslaget',
    showNameHint: 'Du kan ændre dette senere, når du er logget ind.',
    manageNamesTitle: 'Dit navn på dine forslag',
    manageNamesHint: 'Vælg selv, hvilke forslag der viser dit Discord-navn offentligt.',
    suggestionPending: 'Afventer godkendelse',
    suggestionApproved: 'Godkendt',
    suggestionRejected: 'Afvist',
    btnSuggest: 'Send forslag',
    suggestThanks: 'Tak! “{title}” er tilføjet til forslagene.',
    manualThanks: 'Tak! “{title}” bliver vist, når en admin har godkendt det.',
    approvedSoFar: 'Spilforslag',
    castBallot: 'Din stemme',
    btnVote: 'Stem',
    btnUpdateVote: 'Opdater stemme',
    btnVoted: 'Stemme afgivet ✓',
    alreadyVoted: 'Hvis du stemmer igen i denne runde, erstatter den nye stemme din tidligere stemme.',
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
      "Suggest a game for the meeting. Steam games get title, image, genres and description filled in automatically.",
    introVoting:
      'Tick <b>every</b> game you’d be happy to play. The game with the most ticks is chosen for the meeting.',
    introVotingUpcoming: 'Voting opens on the date below.',
    introVotingClosed: 'Voting is closed. The result will be shared when it is ready.',
    introRevealed: 'Thanks to everyone who voted. Here is the result, and the winner is the game for the meeting.',
    loginTitle: 'Log in to participate',
    loginSuggest: 'Log in with Discord to suggest games.',
    loginVote: 'Log in with Discord to vote.',
    loginButton: 'Log in with Discord',
    logoutButton: 'Log out',
    loggedInAs: 'Logged in as',
    nonMemberTitle: 'You are logged in, but not in the server yet',
    nonMemberText: 'This Discord account does not seem to be a member of the Aarhus Gamestormers Discord server yet.',
    inviteLink: 'Join the Discord server',
    retryLogin: 'Log out and log in again once you have joined the server.',
    privacyNote: 'We use Discord login only to confirm membership in the Aarhus Gamestormers Discord server and prevent duplicate voting/suggestions. We do not access your messages, friends, or email.',
    authError: 'Discord login did not complete. Please try again.',
    scheduleMeetingDate: 'Meeting date',
    scheduleSuggestionsOpen: 'Suggestions open',
    scheduleVotingOpens: 'Voting opens',
    scheduleVotingCloses: 'Voting closes',
    nextRoundHeading: 'Next round',
    nextRoundIntro: 'Want to join again? Here is the next round.',
    nextRoundMeeting: 'Next meeting',
    nextRoundSuggestionsOpen: 'Suggestions open',
    countdownPrefix: 'Time until',
    countdownNow: 'Today',
    countdownDays: 'Days',
    countdownHours: 'Hours',
    countdownMinutes: 'Minutes',
    countdownSeconds: 'Seconds',
    timelineSuggestions: 'Suggestions',
    timelineVoting: 'Voting',
    timelineWinner: 'Winner',
    timelineMeeting: 'Club night',
    flowTitle: 'How a meeting works',
    flowSuggestTitle: 'Suggest',
    flowSuggestText: 'Members suggest games that fit shared play and discussion.',
    flowVoteTitle: 'Vote',
    flowVoteText: 'When voting opens, tick every game you would be happy to play.',
    flowWinnerTitle: 'Winner picked',
    flowWinnerText: 'The game with the most votes is chosen for the meeting.',
    flowMeetingTitle: 'Play and discuss',
    flowMeetingText: 'We play at home and meet for a shared club conversation.',
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
    showNameLabel: 'Show my Discord name on this suggestion',
    showNameHint: 'You can change this later while you are logged in.',
    manageNamesTitle: 'Your name on your suggestions',
    manageNamesHint: 'Choose which suggestions publicly show your Discord name.',
    suggestionPending: 'Pending approval',
    suggestionApproved: 'Approved',
    suggestionRejected: 'Rejected',
    btnSuggest: 'Submit suggestion',
    suggestThanks: 'Thanks! “{title}” has been added to the suggestions.',
    manualThanks: 'Thanks! “{title}” will appear once an admin has approved it.',
    approvedSoFar: 'Game suggestions',
    castBallot: 'Your vote',
    btnVote: 'Vote',
    btnUpdateVote: 'Update vote',
    btnVoted: 'Vote cast ✓',
    alreadyVoted: 'If you vote again in this round, your new ballot replaces your previous one.',
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
  var flowSlot = document.getElementById('vote-flow-slot');

  var lang = document.documentElement.lang === 'en' ? 'en' : 'da';
  var T = STRINGS[lang];

  var session = { authenticated: false, user: null, discordInvite: 'https://discord.gg/N2h6DJxVDF' };
  var mySuggestions = [];
  var countdownTimerIds = [];

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

  function clearCountdowns() {
    countdownTimerIds.forEach(function (id) { clearInterval(id); });
    countdownTimerIds = [];
  }

  function clearApp() {
    clearCountdowns();
    clear(app);
  }

  function api(path, opts) {
    return fetch('/api' + path, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data && data.error ? data.error : T.errGeneric);
        return data;
      });
    });
  }

  function canParticipate() {
    return !!(session && session.authenticated && session.user && session.user.isMember);
  }

  function returnTo() {
    return window.location.pathname + window.location.search;
  }

  function loginUrl() {
    return '/api/auth/discord/start?returnTo=' + encodeURIComponent(returnTo());
  }

  function authQueryMessage() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.has('auth') ? T.authError : '';
    } catch {
      return '';
    }
  }

  function logout() {
    fetch('/api/auth/logout', { method: 'POST' })
      .then(function () { window.location.reload(); })
      .catch(function () { window.location.reload(); });
  }

  function authPanel(kind) {
    var message = kind === 'vote' ? T.loginVote : T.loginSuggest;
    var queryMessage = authQueryMessage();

    if (session && session.authenticated && session.user) {
      var user = session.user;
      var identity = el('div', { class: 'vote-auth-identity' }, [
        user.avatarUrl ? el('img', { src: user.avatarUrl, alt: '', loading: 'lazy', decoding: 'async' }) : null,
        el('span', null, [
          el('small', { text: T.loggedInAs }),
          el('strong', { text: user.username || 'Discord user' }),
        ]),
      ]);
      var logoutBtn = el('button', { class: 'btn-ghost vote-auth-logout', type: 'button', text: T.logoutButton, onclick: logout });

      if (user.isMember) {
        return el('aside', { class: 'vote-auth vote-auth-ok' }, [
          identity,
          logoutBtn,
        ]);
      }

      return el('aside', { class: 'vote-auth vote-auth-warning' }, [
        identity,
        el('div', { class: 'vote-auth-copy' }, [
          el('h2', { class: 'vote-panel-title', text: T.nonMemberTitle }),
          el('p', { text: T.nonMemberText }),
          el('p', { class: 'vote-hint', text: T.retryLogin }),
          el('a', { class: 'btn-green', href: session.discordInvite || 'https://discord.gg/N2h6DJxVDF', target: '_blank', rel: 'noopener', text: T.inviteLink }),
        ]),
        logoutBtn,
      ]);
    }

    return el('aside', { class: 'vote-auth' }, [
      el('div', { class: 'vote-auth-copy' }, [
        el('h2', { class: 'vote-panel-title', text: T.loginTitle }),
        el('p', { text: message }),
        queryMessage ? el('p', { class: 'vote-msg err', text: queryMessage }) : null,
        el('p', { class: 'vote-hint', text: T.privacyNote }),
      ]),
      el('a', { class: 'btn-green', href: loginUrl(), text: T.loginButton }),
    ]);
  }

  function findMySuggestion(id) {
    return mySuggestions.find(function (suggestion) { return Number(suggestion.id) === Number(id); }) || null;
  }

  function suggestionStatusText(value) {
    if (value === 'approved') return T.suggestionApproved;
    if (value === 'rejected') return T.suggestionRejected;
    return T.suggestionPending;
  }

  function syncSuggestionBylines(id) {
    var mine = findMySuggestion(id);
    if (!mine) return;
    document.querySelectorAll('[data-suggestion-card-id="' + Number(id) + '"] .suggestion-by').forEach(function (byline) {
      clear(byline);
      byline.appendChild(document.createTextNode(T.by + ' '));
      byline.appendChild(el('b', { text: mine.suggestedBy || 'Discord user' }));
      byline.hidden = !mine.showName;
    });
  }

  function renderOwnerPanelInto(slot) {
    clear(slot);
    slot.hidden = !mySuggestions.length;
    if (!mySuggestions.length) return;

    var list = el('div', { class: 'vote-owner-list' });
    mySuggestions.forEach(function (suggestion) {
      var checkbox = el('input', { type: 'checkbox' });
      checkbox.checked = !!suggestion.showName;
      var message = msgBox();
      checkbox.addEventListener('change', function () {
        var requested = checkbox.checked;
        checkbox.disabled = true;
        api('/suggestions/' + suggestion.id, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ showName: requested }),
        })
          .then(function (res) {
            mySuggestions = mySuggestions.map(function (item) {
              return Number(item.id) === Number(res.suggestion.id) ? res.suggestion : item;
            });
            syncSuggestionBylines(suggestion.id);
            refreshOwnerPanels();
          })
          .catch(function (err) {
            checkbox.checked = !requested;
            checkbox.disabled = false;
            showMsg(message, err.message, false);
          });
      });

      list.appendChild(el('div', { class: 'vote-owner-item' }, [
        el('div', { class: 'vote-owner-copy' }, [
          el('strong', { text: suggestion.title }),
          el('span', { class: 'vote-owner-status', text: suggestionStatusText(suggestion.status) }),
        ]),
        el('label', { class: 'vote-name-choice vote-owner-toggle' }, [
          checkbox,
          el('span', { text: T.showNameLabel }),
        ]),
        message,
      ]));
    });

    slot.appendChild(el('aside', { class: 'vote-panel vote-owner-panel' }, [
      el('h2', { class: 'vote-panel-title', text: T.manageNamesTitle }),
      el('p', { class: 'vote-hint', text: T.manageNamesHint }),
      list,
    ]));
  }

  function ownerVisibilitySlot() {
    var slot = el('div', { 'data-owner-visibility-panel': 'true' });
    renderOwnerPanelInto(slot);
    return slot;
  }

  function refreshOwnerPanels() {
    document.querySelectorAll('[data-owner-visibility-panel]').forEach(renderOwnerPanelInto);
  }

  function refreshMySuggestions() {
    if (!session || !session.authenticated) {
      mySuggestions = [];
      refreshOwnerPanels();
      return Promise.resolve();
    }
    return api('/suggestions/mine')
      .then(function (res) {
        mySuggestions = res.suggestions || [];
        refreshOwnerPanels();
        mySuggestions.forEach(function (suggestion) { syncSuggestionBylines(suggestion.id); });
      });
  }

  function nameVisibilityChoice(checkbox) {
    checkbox.checked = true;
    return el('div', { class: 'vote-name-field' }, [
      el('label', { class: 'vote-name-choice' }, [
        checkbox,
        el('span', { text: T.showNameLabel }),
      ]),
      el('p', { class: 'vote-hint', text: T.showNameHint }),
    ]);
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

  function parseDateOnly(dateString) {
    var match = String(dateString || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (
      date.getFullYear() !== Number(match[1]) ||
      date.getMonth() !== Number(match[2]) - 1 ||
      date.getDate() !== Number(match[3])
    ) {
      return null;
    }
    return date;
  }

  function timelineState(round, key) {
    var revealed = round.phase === 'revealed' || round.phase === 'closed';
    if (key === 'suggestions') return round.phase === 'suggesting' ? 'current' : 'done';
    if (key === 'voting') {
      if (revealed) return 'done';
      if (round.phase === 'voting') return 'current';
      return 'upcoming';
    }
    if (key === 'winner') return revealed ? 'current' : 'upcoming';
    return revealed ? 'current' : 'upcoming';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function segmentProgress(startDateString, endDateString) {
    var start = parseDateOnly(startDateString);
    var end = parseDateOnly(endDateString);
    if (!start || !end || end.getTime() <= start.getTime()) return 0;
    return clamp((Date.now() - start.getTime()) / (end.getTime() - start.getTime()), 0, 1);
  }

  function timelineProgress(round) {
    if (round.phase === 'suggesting') {
      if (round.suggestionsAreOpen === false) return 0;
      return segmentProgress(round.suggestionsOpenAt, round.votingOpensAt) / 3;
    }
    if (round.phase === 'voting') {
      return (1 / 3) + (segmentProgress(round.votingOpensAt, round.votingClosesAt) / 3);
    }
    if (round.phase === 'revealed') {
      return (2 / 3) + (segmentProgress(round.votingClosesAt, round.meetingDate) / 3);
    }
    if (round.phase === 'closed') return 1;
    return 0;
  }

  function phaseTimeline(round) {
    var steps = [
      ['suggestions', T.timelineSuggestions, round.suggestionsOpenAt],
      ['voting', T.timelineVoting, round.votingOpensAt],
      ['winner', T.timelineWinner, round.votingClosesAt],
      ['meeting', T.timelineMeeting, round.meetingDate],
    ];
    var states = steps.map(function (step) { return timelineState(round, step[0]); });
    var currentIndex = Math.max(0, states.indexOf('current'));
    var fill = Math.round(timelineProgress(round) * 1000) / 10;
    return el('ol', { class: 'vote-phase-timeline progress-' + currentIndex, style: '--vote-progress:' + fill + '%', 'aria-label': T.flowTitle }, steps.map(function (step, index) {
      var state = states[index];
      var date = formatDate(step[2]);
      return el('li', { class: 'vote-phase-step ' + state }, [
        el('span', { class: 'vote-phase-marker', text: state === 'done' ? '✓' : String(index + 1) }),
        el('span', { class: 'vote-phase-name', text: step[1] }),
        date ? el('time', { class: 'vote-phase-date', datetime: step[2], text: date }) : null,
      ]);
    }));
  }

  function countdownTarget(round) {
    if (round.phase === 'suggesting') {
      return round.suggestionsAreOpen === false
        ? [T.scheduleSuggestionsOpen, round.suggestionsOpenAt]
        : [T.scheduleVotingOpens, round.votingOpensAt];
    }
    if (round.phase === 'voting') {
      return round.votingHasStarted === false
        ? [T.scheduleVotingOpens, round.votingOpensAt]
        : [T.scheduleVotingCloses, round.votingClosesAt];
    }
    return null;
  }

  function countdownDetail(dateString, label) {
    var target = parseDateOnly(dateString);
    if (!target) return null;
    var valueNodes = {
      days: el('strong', { text: '0' }),
      hours: el('strong', { text: '0' }),
      minutes: el('strong', { text: '0' }),
      seconds: el('strong', { text: '0' }),
    };
    var note = el('span', { class: 'vote-countdown-note', text: formatDate(dateString) });
    var node = el('div', { class: 'vote-countdown' }, [
      el('span', { class: 'vote-countdown-label', text: T.countdownPrefix + ' ' + label.toLowerCase() }),
      el('div', { class: 'vote-countdown-grid' }, [
        el('span', null, [valueNodes.days, el('small', { text: T.countdownDays })]),
        el('span', null, [valueNodes.hours, el('small', { text: T.countdownHours })]),
        el('span', null, [valueNodes.minutes, el('small', { text: T.countdownMinutes })]),
        el('span', null, [valueNodes.seconds, el('small', { text: T.countdownSeconds })]),
      ]),
      note,
    ]);

    function update() {
      var diff = Math.max(0, target.getTime() - Date.now());
      var totalSeconds = Math.floor(diff / 1000);
      var days = Math.floor(totalSeconds / 86400);
      var hours = Math.floor((totalSeconds % 86400) / 3600);
      var minutes = Math.floor((totalSeconds % 3600) / 60);
      var seconds = totalSeconds % 60;
      valueNodes.days.textContent = String(days).padStart(2, '0');
      valueNodes.hours.textContent = String(hours).padStart(2, '0');
      valueNodes.minutes.textContent = String(minutes).padStart(2, '0');
      valueNodes.seconds.textContent = String(seconds).padStart(2, '0');
      if (diff === 0) note.textContent = T.countdownNow;
    }

    update();
    countdownTimerIds.push(setInterval(update, 1000));
    return node;
  }

  function nextDateDetail(round) {
    var item = countdownTarget(round);
    if (!item || !formatDate(item[1])) return null;
    return countdownDetail(item[1], item[0]);
  }

  function dateCard(label, dateString) {
    var formatted = formatDate(dateString);
    if (!formatted) return null;
    return el('div', { class: 'vote-date-card' }, [
      el('span', { class: 'vote-date-label', text: label }),
      el('time', { class: 'vote-date-value', datetime: dateString, text: formatted }),
    ]);
  }

  function roundHero(round, statusText) {
    var nextDate = nextDateDetail(round);
    return el('div', { class: 'vote-round-hero' }, [
      el('div', { class: 'vote-round-kicker' }, [
        status(statusText),
      ]),
      el('div', { class: 'vote-round-main' }, [
        meetingBadge(round),
        el('div', { class: 'vote-round-dates' }, [
          dateCard(T.scheduleMeetingDate, round.meetingDate),
          nextDate,
        ]),
      ]),
      phaseTimeline(round),
    ]);
  }

  // A small box pointing to the next round once this one is decided. Reuses the
  // guidelines/schedule styling so no new CSS is needed. Returns null when there
  // is no next round or it has no usable dates yet.
  function nextRoundNotice(nextRound) {
    if (!nextRound) return null;
    var countdown = countdownDetail(nextRound.suggestionsOpenAt, T.nextRoundSuggestionsOpen);
    var rows = [
      [T.nextRoundMeeting, roundLabel(nextRound)],
      [T.scheduleMeetingDate, formatDate(nextRound.meetingDate)],
      [T.nextRoundSuggestionsOpen, formatDate(nextRound.suggestionsOpenAt)],
    ].filter(function (row) { return row[1]; });
    if (rows.length < 2) return null; // need more than just the meeting label
    return el('aside', { class: 'vote-guidelines vote-next-round' }, [
      el('h2', { class: 'vote-guidelines-title', text: T.nextRoundHeading }),
      el('p', { class: 'vote-intro', text: T.nextRoundIntro }),
      countdown,
      el('dl', { class: 'vote-schedule' }, rows.map(function (row) {
        return el('div', { class: 'vote-schedule-item' }, [
          el('dt', { text: row[0] }),
          el('dd', { text: row[1] }),
        ]);
      })),
    ]);
  }

  // ── card builder ───────────────────────────────────────────────────────────
  function card(s, mode, opts) {
    opts = opts || {};
    var mine = findMySuggestion(s.id);
    var bylineName = s.suggestedBy || (mine && mine.suggestedBy) || '';
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
      bylineName ? el('p', {
        class: 'suggestion-by',
        html: T.by + ' <b>' + escapeHtml(bylineName) + '</b>',
        hidden: s.suggestedBy || (mine && mine.showName) ? null : 'hidden',
      }) : null,
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

    var node = el('article', { class: classes, 'data-suggestion-card-id': s.id }, [
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

  function meetingFlow() {
    var steps = [
      [T.flowSuggestTitle, T.flowSuggestText],
      [T.flowVoteTitle, T.flowVoteText],
      [T.flowWinnerTitle, T.flowWinnerText],
      [T.flowMeetingTitle, T.flowMeetingText],
    ];
    return el('details', { class: 'vote-flow' }, [
      el('summary', { class: 'vote-flow-trigger', text: T.flowTitle }),
      el('ol', { class: 'vote-flow-list' }, steps.map(function (step, index) {
        return el('li', { class: 'vote-flow-step' }, [
          el('span', { class: 'vote-flow-number', text: String(index + 1) }),
          el('span', { class: 'vote-flow-copy' }, [
            el('strong', { text: step[0] }),
            el('span', { text: step[1] }),
          ]),
        ]);
      })),
    ]);
  }

  function mountMeetingFlow() {
    if (!flowSlot) return;
    clear(flowSlot);
    flowSlot.appendChild(meetingFlow());
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
    clearApp();
    app.appendChild(el('div', { class: 'vote-round-hero vote-round-hero-empty' }, [
      status(T.statusNone),
    ]));
    app.appendChild(el('p', { class: 'vote-intro', text: T.introNone }));
  }

  function renderSuggesting(data) {
    var suggestionsOpen = data.round.suggestionsAreOpen !== false;
    clearApp();
    app.appendChild(roundHero(data.round, suggestionsOpen ? T.statusSuggesting : T.statusUpcoming));
    if (!suggestionsOpen) {
      if (session && session.authenticated) {
        app.appendChild(authPanel('suggest'));
        app.appendChild(ownerVisibilitySlot());
      }
      return;
    }
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

    app.appendChild(authPanel('suggest'));
    if (session && session.authenticated) app.appendChild(ownerVisibilitySlot());
    if (!canParticipate()) {
      renderSuggestionList();
      return;
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
            refreshMySuggestions().catch(function () {});
          })
          .catch(function (err) { showMsg(box, err.message, false); })
          .finally(function () { btn.disabled = false; });
      });
    }

    function showSteamForm() {
      clear(panel);
      var steam = el('input', { class: 'vote-input', type: 'url', placeholder: 'https://store.steampowered.com/app/…' });
      var pitch = el('textarea', { class: 'vote-textarea', placeholder: T.pitchPlaceholder, maxlength: '500' });
      var showName = el('input', { type: 'checkbox' });
      var box = msgBox();
      var btn = el('button', { class: 'btn-green', type: 'submit', text: T.btnSuggest });

      var form = el('form', { class: 'vote-panel' }, [
        el('div', { class: 'vote-panel-head' }, [el('h2', { class: 'vote-panel-title', text: T.formTitle }), backLink()]),
        field(T.labelSteam, steam, T.hintSteam),
        field(T.labelPitch, pitch),
        nameVisibilityChoice(showName),
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
            showName: showName.checked,
          };
        },
        function () { steam.value = pitch.value = ''; },
        T.suggestThanks
      );

      panel.appendChild(form);
    }

    function showManualForm() {
      clear(panel);
      var title = el('input', { class: 'vote-input', type: 'text', placeholder: T.titlePlaceholder, maxlength: '200' });
      var store = el('input', { class: 'vote-input', type: 'url', placeholder: T.storePlaceholder, maxlength: '400' });
      var genres = el('input', { class: 'vote-input', type: 'text', placeholder: T.genresPlaceholder, maxlength: '200' });
      var pitch = el('textarea', { class: 'vote-textarea', placeholder: T.pitchPlaceholder, maxlength: '500' });
      var showName = el('input', { type: 'checkbox' });
      var box = msgBox();
      var btn = el('button', { class: 'btn-green', type: 'submit', text: T.btnSuggest });

      var form = el('form', { class: 'vote-panel' }, [
        el('div', { class: 'vote-panel-head' }, [el('h2', { class: 'vote-panel-title', text: T.formTitle }), backLink()]),
        el('p', { class: 'vote-hint', text: T.manualNote }),
        field(T.labelTitle, title),
        field(T.labelStore, store),
        field(T.labelGenres, genres),
        field(T.labelPitch, pitch),
        nameVisibilityChoice(showName),
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
            showName: showName.checked,
          };
        },
        function () { title.value = store.value = genres.value = pitch.value = ''; },
        T.manualThanks
      );

      panel.appendChild(form);
    }

    app.appendChild(el('div', { class: 'vote-disclosure-wrap' }, [disclosureBtn, panel]));

    // Already-approved suggestions appear below the form (read-only).
    renderSuggestionList();
  }

  function renderVoting(data) {
    var votingOpen = data.round.votingIsOpen !== false;
    var votingHasStarted = data.round.votingHasStarted !== false;
    clearApp();
    app.appendChild(roundHero(data.round, votingOpen ? T.statusVoting : (votingHasStarted ? T.statusVotingClosed : T.statusVotingUpcoming)));
    app.appendChild(el('p', { class: 'vote-intro', html: votingOpen ? T.introVoting : (votingHasStarted ? T.introVotingClosed : T.introVotingUpcoming) }));
    var authMounted = false;
    if (session && session.authenticated) {
      app.appendChild(authPanel('vote'));
      app.appendChild(ownerVisibilitySlot());
      authMounted = true;
    }
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

    if (!canParticipate()) {
      if (!authMounted) app.appendChild(authPanel('vote'));
      app.appendChild(grid(data.suggestions.map(function (s) { return card(s, 'list'); })));
      return;
    }

    if (!authMounted) app.appendChild(authPanel('vote'));
    var cards = data.suggestions.map(function (s) { return card(s, 'vote'); });
    app.appendChild(grid(cards));

    var box = msgBox();
    var btn = el('button', { class: 'btn-green', type: 'submit', text: T.btnVote });

    var form = el('form', { class: 'vote-panel' }, [
      el('h2', { class: 'vote-panel-title', text: T.castBallot }),
      el('p', { class: 'vote-hint', text: T.alreadyVoted }),
      el('div', { class: 'vote-actions' }, [btn]),
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
        body: JSON.stringify({
          suggestionIds: ids,
        }),
      })
        .then(function () {
          showMsg(box, T.voteThanks, true);
          btn.textContent = T.btnVoted;
        })
        .catch(function (err) {
          showMsg(box, err.message, false);
          btn.disabled = false;
        });
    });

    app.appendChild(form);
  }

  function renderRevealed(data) {
    clearApp();
    app.appendChild(roundHero(data.round, T.statusRevealed));
    app.appendChild(el('p', { class: 'vote-intro', text: T.introRevealed }));
    if (session && session.authenticated) {
      app.appendChild(authPanel('vote'));
      app.appendChild(ownerVisibilitySlot());
    }

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
    mountMeetingFlow();
    app.appendChild(el('p', { class: 'vote-intro', text: T.loading }));
    Promise.all([
      api('/round/current'),
      api('/auth/session').catch(function () {
        return { authenticated: false, user: null, discordInvite: 'https://discord.gg/N2h6DJxVDF' };
      }),
    ])
      .then(function (results) {
        var data = results[0];
        session = results[1] || session;
        var mineRequest = session.authenticated
          ? api('/suggestions/mine').catch(function () { return { suggestions: [] }; })
          : Promise.resolve({ suggestions: [] });
        return mineRequest.then(function (mine) {
          mySuggestions = mine.suggestions || [];
          if (!data.round) return renderNone();
          if (data.round.phase === 'suggesting') return renderSuggesting(data);
          if (data.round.phase === 'voting') return renderVoting(data);
          return renderRevealed(data); // revealed | closed
        });
      })
      .catch(function (err) {
        clearApp();
        var box = msgBox();
        app.appendChild(box);
        showMsg(box, err.message, false);
      });
  }

  load();
})();
