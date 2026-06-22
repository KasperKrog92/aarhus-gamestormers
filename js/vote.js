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
      'Rangér spillene i den rækkefølge, du helst vil spille dem. Du behøver ikke rangere dem alle.',
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
    privacyToggle: 'Om Discord-login og data',
    privacyNote: 'Vi bruger kun Discord-login til at bekræfte medlemskab af Aarhus Gamestormers Discord-serveren og til at forhindre dobbelte stemmer og forslag. Vi har ikke adgang til dine beskeder, venner eller e-mail.',
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
    flowVoteText: 'Når afstemningen åbner, rangerer du spillene i din foretrukne rækkefølge.',
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
    editPitchLabel: 'Din pitch',
    savePitch: 'Gem pitch',
    pitchSaved: 'Din pitch er opdateret.',
    managePitchTitle: 'Dine forslag',
    managePitchHint: 'Rediger din pitch og vælg, om dit Discord-navn vises offentligt.',
    suggestionPending: 'Afventer godkendelse',
    suggestionApproved: 'Godkendt',
    suggestionRejected: 'Afvist',
    statsSummary: '{games} foreslået af {people}',
    statsGamesOne: 'spil',
    statsGamesOther: 'spil',
    statsPeopleOne: 'medlem',
    statsPeopleOther: 'medlemmer',
    btnSuggest: 'Send forslag',
    suggestThanks: 'Tak! “{title}” er tilføjet til forslagene.',
    manualThanks: 'Tak! “{title}” bliver vist, når en admin har godkendt det.',
    approvedSoFar: 'Spilforslag',
    castBallot: 'Din stemme',
    btnVote: 'Stem',
    btnUpdateVote: 'Opdater rangering',
    voteThanks: 'Tak for din stemme!',
    rankingTitle: 'Din rangering',
    rankingHint: 'Tilføj spil i din foretrukne rækkefølge. Spil, du ikke tilføjer, er ikke på din stemmeseddel. En lavere placering tæller kun, hvis dine højere valg bliver elimineret undervejs.',
    rankingEmpty: 'Du har ikke tilføjet nogen spil endnu. Vælg de spil, du gerne vil rangere.',
    addToRanking: 'Tilføj til min rangering',
    removeFromRanking: 'Fjern',
    moveUp: 'Flyt op',
    moveDown: 'Flyt ned',
    participationOne: '{n} medlem har afgivet sin rangering',
    participationOther: '{n} medlemmer har afgivet deres rangering',
    noGames: 'Der er ingen spil på stemmesedlen endnu.',
    by: 'Foreslået af',
    votes: 'stemmer',
    winnerTag: 'Vinder',
    breakdownTitle: 'Sådan blev vinderen fundet',
    breakdownIntro: 'Stemmerne blev talt med ranglisteafstemning (instant-runoff). I hver runde elimineres spillet med færrest stemmer, og dets stemmer flyttes til næste valg på sedlen, indtil ét spil har et flertal.',
    rcvRound: 'Runde {n}',
    rcvMajority: 'Flertal: {n} af {active}',
    rcvExhaustedOne: '{n} udtømt stemmeseddel',
    rcvExhaustedOther: '{n} udtømte stemmesedler',
    rcvEliminated: 'Elimineret',
    rcvWinnerRound: 'Nåede et flertal og vinder.',
    rcvTransferred: '+{n} overført',
    playtime: '⏱ ~{h} t.',
    platformPrefix: 'Tilgængelig på ',
    platformAnd: ' og ',
    errGeneric: 'Noget gik galt. Prøv igen.',
    errPickOne: 'Tilføj mindst ét spil til din rangering.',
    errSteamUrl: 'Indsæt et gyldigt Steam-link (store.steampowered.com/app/…).',
    errTitleRequired: 'Skriv spillets titel.',
    errStoreUrl: 'Butikslinket skal være en gyldig http(s)-adresse.',
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
      "Rank the games in your order of preference. You don't have to rank them all.",
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
    privacyToggle: 'About Discord login and data',
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
    flowVoteText: 'When voting opens, rank the games in your order of preference.',
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
    editPitchLabel: 'Your pitch',
    savePitch: 'Save pitch',
    pitchSaved: 'Your pitch has been updated.',
    managePitchTitle: 'Your suggestions',
    managePitchHint: 'Edit your pitch and choose whether your Discord name is shown publicly.',
    suggestionPending: 'Pending approval',
    suggestionApproved: 'Approved',
    suggestionRejected: 'Rejected',
    statsSummary: '{games} suggested by {people}',
    statsGamesOne: 'game',
    statsGamesOther: 'games',
    statsPeopleOne: 'member',
    statsPeopleOther: 'members',
    btnSuggest: 'Submit suggestion',
    suggestThanks: 'Thanks! “{title}” has been added to the suggestions.',
    manualThanks: 'Thanks! “{title}” will appear once an admin has approved it.',
    approvedSoFar: 'Game suggestions',
    castBallot: 'Your vote',
    btnVote: 'Vote',
    btnUpdateVote: 'Update ranking',
    voteThanks: 'Thanks for voting!',
    rankingTitle: 'Your ranking',
    rankingHint: "Add games in your order of preference. Games you don't add are not on your ballot. A lower rank only matters if your higher choices are eliminated along the way.",
    rankingEmpty: "You haven't added any games yet. Pick the games you want to rank.",
    addToRanking: 'Add to my ranking',
    removeFromRanking: 'Remove',
    moveUp: 'Move up',
    moveDown: 'Move down',
    participationOne: '{n} member has submitted their ranking',
    participationOther: '{n} members have submitted their ranking',
    noGames: 'There are no games on the ballot yet.',
    by: 'Suggested by',
    votes: 'votes',
    winnerTag: 'Winner',
    breakdownTitle: 'How the winner was decided',
    breakdownIntro: "Votes were counted with ranked-choice (instant-runoff). Each round, the game with the fewest votes is eliminated and its votes move to each ballot's next choice, until one game holds a majority.",
    rcvRound: 'Round {n}',
    rcvMajority: 'Majority: {n} of {active}',
    rcvExhaustedOne: '{n} exhausted ballot',
    rcvExhaustedOther: '{n} exhausted ballots',
    rcvEliminated: 'Eliminated',
    rcvWinnerRound: 'Reached a majority and wins.',
    rcvTransferred: '+{n} transferred',
    playtime: '⏱ ~{h} hrs.',
    platformPrefix: 'Available on ',
    platformAnd: ' and ',
    errGeneric: 'Something went wrong. Please try again.',
    errPickOne: 'Add at least one game to your ranking.',
    errSteamUrl: 'Please paste a valid Steam store link (store.steampowered.com/app/…).',
    errTitleRequired: 'Please enter the game title.',
    errStoreUrl: 'Store link must be a valid http(s) URL.',
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
  var pitchEditable = false;
  var countdownTimerIds = [];
  var lastCountdownReload = 0;

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

  // Mirror the server's link check so we can show a translated message in-page
  // instead of leaving validation to the browser's locale-specific native bubble.
  function isHttpUrl(value) {
    try {
      var u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

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

  var DISCORD_GLYPH = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>';
  var LOCK_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var CHEVRON_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

  function discordLoginButton() {
    return el('a', { class: 'btn-green vote-auth-login', href: loginUrl() }, [
      el('span', { class: 'btn-glyph', html: DISCORD_GLYPH }),
      el('span', { text: T.loginButton }),
    ]);
  }

  function privacyDisclosure() {
    return el('details', { class: 'vote-privacy' }, [
      el('summary', { class: 'vote-privacy-summary' }, [
        el('span', { class: 'vote-privacy-icon', html: LOCK_GLYPH }),
        el('span', { class: 'vote-privacy-label', text: T.privacyToggle }),
        el('span', { class: 'vote-privacy-chevron', html: CHEVRON_GLYPH }),
      ]),
      el('p', { class: 'vote-privacy-text', text: T.privacyNote }),
    ]);
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

    return el('aside', { class: 'vote-auth vote-auth-login-card' }, [
      el('div', { class: 'vote-auth-copy' }, [
        el('h2', { class: 'vote-panel-title', text: T.loginTitle }),
        el('p', { text: message }),
        queryMessage ? el('p', { class: 'vote-msg err', text: queryMessage }) : null,
        privacyDisclosure(),
      ]),
      discordLoginButton(),
    ]);
  }

  // Compact social-proof line for the suggestions heading: how many games are on
  // the board and how many members suggested them. Returns null when nothing has
  // been suggested yet so the heading stays clean. Counts and nouns are static,
  // so the bolded numbers are safe to inject as HTML.
  function suggestionStatsSummary(stats) {
    if (!stats || !stats.games) return null;
    var games = '<b>' + stats.games + '</b> ' + (stats.games === 1 ? T.statsGamesOne : T.statsGamesOther);
    var people = '<b>' + stats.people + '</b> ' + (stats.people === 1 ? T.statsPeopleOne : T.statsPeopleOther);
    return el('span', {
      class: 'vote-stats-summary',
      html: T.statsSummary.replace('{games}', games).replace('{people}', people),
    });
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

  // Reflect an edited pitch on any visible suggestion card without a full
  // reload: update the pitch block in place, create it when a pitch was added,
  // or remove it when the pitch was cleared.
  function syncSuggestionPitch(id, pitch) {
    document.querySelectorAll('[data-suggestion-card-id="' + Number(id) + '"]').forEach(function (cardEl) {
      var bodyEl = cardEl.querySelector('.suggestion-body');
      if (!bodyEl) return;
      var block = bodyEl.querySelector('.suggestion-copy-pitch');
      if (!pitch) {
        if (block) block.remove();
        return;
      }
      if (!block) {
        block = el('div', { class: 'suggestion-copy suggestion-copy-pitch' }, [
          el('span', { class: 'suggestion-copy-label', text: T.suggestedPitch }),
          el('p', { class: 'suggestion-pitch', text: pitch }),
        ]);
        var byline = bodyEl.querySelector('.suggestion-by');
        if (byline) bodyEl.insertBefore(block, byline);
        else bodyEl.appendChild(block);
        return;
      }
      var p = block.querySelector('.suggestion-pitch');
      if (p) p.textContent = pitch;
    });
  }

  // Pitch editor for one owned suggestion, shown only while suggestions are open.
  function buildPitchEditor(suggestion, message) {
    var textarea = el('textarea', { class: 'vote-textarea', maxlength: '500', placeholder: T.pitchPlaceholder });
    textarea.value = suggestion.pitch || '';
    var saveBtn = el('button', { class: 'btn-green', type: 'button', text: T.savePitch });

    saveBtn.addEventListener('click', function () {
      var requested = textarea.value;
      saveBtn.disabled = true;
      api('/suggestions/' + suggestion.id, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pitch: requested }),
      })
        .then(function (res) {
          mySuggestions = mySuggestions.map(function (item) {
            return Number(item.id) === Number(res.suggestion.id) ? res.suggestion : item;
          });
          textarea.value = res.suggestion.pitch || '';
          syncSuggestionPitch(suggestion.id, res.suggestion.pitch);
          showMsg(message, T.pitchSaved, true);
        })
        .catch(function (err) {
          showMsg(message, err.message, false);
        })
        .finally(function () { saveBtn.disabled = false; });
    });

    return el('div', { class: 'vote-owner-pitch' }, [
      el('label', { class: 'vote-label', text: T.editPitchLabel }),
      textarea,
      el('div', { class: 'vote-actions' }, [saveBtn]),
    ]);
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

      var pitchEditor = pitchEditable ? buildPitchEditor(suggestion, message) : null;

      list.appendChild(el('div', { class: 'vote-owner-item' }, [
        el('div', { class: 'vote-owner-copy' }, [
          el('strong', { text: suggestion.title }),
          el('span', { class: 'vote-owner-status', text: suggestionStatusText(suggestion.status) }),
        ]),
        el('label', { class: 'vote-name-choice vote-owner-toggle' }, [
          checkbox,
          el('span', { text: T.showNameLabel }),
        ]),
        pitchEditor,
        message,
      ]));
    });

    slot.appendChild(el('aside', { class: 'vote-panel vote-owner-panel' }, [
      el('h2', { class: 'vote-panel-title', text: pitchEditable ? T.managePitchTitle : T.manageNamesTitle }),
      el('p', { class: 'vote-hint', text: pitchEditable ? T.managePitchHint : T.manageNamesHint }),
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

  // Re-fetch and re-render when a watched countdown reaches zero. Throttled so a
  // small client/server clock skew (the server may flip a few seconds later)
  // polls every few seconds instead of hammering the API, and stops once the new
  // state renders and the zeroed countdown is gone.
  function autoReload() {
    var now = Date.now();
    if (now - lastCountdownReload < 5000) return;
    lastCountdownReload = now;
    fetchState().catch(function () {});
  }

  function countdownDetail(dateString, label, onComplete) {
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
      if (diff === 0) {
        note.textContent = T.countdownNow;
        if (onComplete) onComplete();
      }
    }

    update();
    countdownTimerIds.push(setInterval(update, 1000));
    return node;
  }

  function nextDateDetail(round) {
    var item = countdownTarget(round);
    if (!item || !formatDate(item[1])) return null;
    // Suggestions opening is a pure date boundary (not a scheduler phase flip),
    // so it is the one transition that goes live at local midnight. Auto-refresh
    // when its countdown hits zero; other transitions wait on the 09:00 scheduler.
    var onZero = round.phase === 'suggesting' && round.suggestionsAreOpen === false ? autoReload : null;
    return countdownDetail(item[1], item[0], onZero);
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
      // Ranking control: a position badge (shown once the game is on the ballot)
      // and a single add/remove toggle button. renderVoting owns the click
      // wiring and keeps the badge/label in sync with the ranking order.
      var rankBadge = el('span', { class: 'vote-rank-position', hidden: 'hidden', 'aria-hidden': 'true' });
      var rankBtn = el('button', { class: 'vote-rank-toggle', type: 'button', 'aria-pressed': 'false' }, [
        el('span', { class: 'vote-rank-toggle-label', text: T.addToRanking }),
      ]);
      body.push(el('div', { class: 'vote-rank-row' }, [rankBadge, rankBtn]));
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
    var suggestionHeading = el('div', { class: 'vote-list-header' }, [
      el('h2', { class: 'vote-list-title', text: T.approvedSoFar }),
      suggestionStatsSummary(data.stats),
    ]);
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
    function wireSubmit(form, btn, box, buildBody, clearInputs, thanks, validate) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (validate) {
          var problem = validate();
          if (problem) return showMsg(box, problem, false);
        }
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
      var steam = el('input', { class: 'vote-input', type: 'url', inputmode: 'url', placeholder: 'https://store.steampowered.com/app/…' });
      var pitch = el('textarea', { class: 'vote-textarea', placeholder: T.pitchPlaceholder, maxlength: '500' });
      var showName = el('input', { type: 'checkbox' });
      var box = msgBox();
      var btn = el('button', { class: 'btn-green', type: 'submit', text: T.btnSuggest });

      var form = el('form', { class: 'vote-panel', novalidate: '' }, [
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
        T.suggestThanks,
        function () {
          var url = steam.value.trim();
          if (!url || !isHttpUrl(url)) return T.errSteamUrl;
          return null;
        }
      );

      panel.appendChild(form);
    }

    function showManualForm() {
      clear(panel);
      var title = el('input', { class: 'vote-input', type: 'text', placeholder: T.titlePlaceholder, maxlength: '200' });
      var store = el('input', { class: 'vote-input', type: 'url', inputmode: 'url', placeholder: T.storePlaceholder, maxlength: '400' });
      var genres = el('input', { class: 'vote-input', type: 'text', placeholder: T.genresPlaceholder, maxlength: '200' });
      var pitch = el('textarea', { class: 'vote-textarea', placeholder: T.pitchPlaceholder, maxlength: '500' });
      var showName = el('input', { type: 'checkbox' });
      var box = msgBox();
      var btn = el('button', { class: 'btn-green', type: 'submit', text: T.btnSuggest });

      var form = el('form', { class: 'vote-panel', novalidate: '' }, [
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
        T.manualThanks,
        function () {
          if (!title.value.trim()) return T.errTitleRequired;
          var url = store.value.trim();
          if (url && !isHttpUrl(url)) return T.errStoreUrl;
          return null;
        }
      );

      panel.appendChild(form);
    }

    app.appendChild(el('div', { class: 'vote-disclosure-wrap' }, [disclosureBtn, panel]));

    // Already-approved suggestions appear below the form (read-only).
    renderSuggestionList();
  }

  // Turnout line ("12 members have submitted their ranking"). This is the only
  // vote-derived number shown during voting: a single count, never per-game, so
  // it reveals participation without hinting at which game is ahead.
  function participationText(count) {
    var n = Math.max(0, Number(count) || 0);
    return (n === 1 ? T.participationOne : T.participationOther).replace('{n}', n);
  }

  function renderVoting(data) {
    var votingOpen = data.round.votingIsOpen !== false;
    var votingHasStarted = data.round.votingHasStarted !== false;
    clearApp();
    app.appendChild(roundHero(data.round, votingOpen ? T.statusVoting : (votingHasStarted ? T.statusVotingClosed : T.statusVotingUpcoming)));
    app.appendChild(el('p', { class: 'vote-intro', html: votingOpen ? T.introVoting : (votingHasStarted ? T.introVotingClosed : T.introVotingUpcoming) }));

    var participationNode = null;
    if (votingOpen) {
      participationNode = el('p', { class: 'vote-participation', text: participationText(data.round.ballotCount) });
      app.appendChild(participationNode);
    }
    function refreshParticipation() {
      if (!participationNode) return;
      api('/round/current')
        .then(function (fresh) {
          if (fresh.round && typeof fresh.round.ballotCount === 'number') {
            participationNode.textContent = participationText(fresh.round.ballotCount);
          }
        })
        .catch(function () {});
    }

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

    // ── ranking state ────────────────────────────────────────────────────────
    var suggestionsById = {};
    data.suggestions.forEach(function (s) { suggestionsById[Number(s.id)] = s; });
    var ranking = []; // ordered suggestion ids, first = top preference
    var hadBallot = false;

    var cards = data.suggestions.map(function (s) { return card(s, 'vote'); });
    var cardsById = {};
    cards.forEach(function (node) {
      cardsById[Number(node.getAttribute('data-suggestion-card-id'))] = node;
    });
    app.appendChild(grid(cards));

    function toggleRank(id) {
      var i = ranking.indexOf(id);
      if (i === -1) ranking.push(id);
      else ranking.splice(i, 1);
      syncAll();
    }

    function moveRank(id, delta) {
      var i = ranking.indexOf(id);
      var j = i + delta;
      if (i === -1 || j < 0 || j >= ranking.length) return;
      var moved = ranking[i];
      ranking[i] = ranking[j];
      ranking[j] = moved;
      syncAll();
    }

    // Wire each card: clicking the card or its toggle button adds/removes the
    // game. Clicks on the store links are ignored so they keep opening normally.
    cards.forEach(function (node) {
      var id = Number(node.getAttribute('data-suggestion-card-id'));
      var btn = node.querySelector('.vote-rank-toggle');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleRank(id);
      });
      node.addEventListener('click', function (e) {
        if (e.target.closest('a') || e.target.closest('.vote-rank-toggle')) return;
        toggleRank(id);
      });
    });

    // ── ranking panel ────────────────────────────────────────────────────────
    var rankingList = el('ol', { class: 'vote-ranking-list' });
    var emptyHint = el('p', { class: 'vote-ranking-empty vote-hint', text: T.rankingEmpty });
    var box = msgBox();
    var btn = el('button', { class: 'btn-green', type: 'submit', text: T.btnVote });

    function renderRankingList() {
      clear(rankingList);
      var has = ranking.length > 0;
      rankingList.hidden = !has;
      emptyHint.hidden = has;
      ranking.forEach(function (id, index) {
        var s = suggestionsById[id];
        var title = s ? s.title : ('#' + id);
        var up = el('button', {
          class: 'vote-ranking-move', type: 'button', text: '↑',
          'aria-label': T.moveUp + ': ' + title,
          disabled: index === 0 ? 'disabled' : null,
        });
        var down = el('button', {
          class: 'vote-ranking-move', type: 'button', text: '↓',
          'aria-label': T.moveDown + ': ' + title,
          disabled: index === ranking.length - 1 ? 'disabled' : null,
        });
        var remove = el('button', {
          class: 'vote-ranking-remove', type: 'button', text: '✕',
          'aria-label': T.removeFromRanking + ': ' + title,
        });
        up.addEventListener('click', function () { moveRank(id, -1); });
        down.addEventListener('click', function () { moveRank(id, 1); });
        remove.addEventListener('click', function () { toggleRank(id); });
        rankingList.appendChild(el('li', { class: 'vote-ranking-item' }, [
          el('span', { class: 'vote-ranking-num', text: String(index + 1) }),
          el('span', { class: 'vote-ranking-name', text: title }),
          el('div', { class: 'vote-ranking-controls' }, [up, down, remove]),
        ]));
      });
    }

    function syncAll() {
      Object.keys(cardsById).forEach(function (key) {
        var id = Number(key);
        var node = cardsById[id];
        var pos = ranking.indexOf(id);
        var ranked = pos !== -1;
        node.classList.toggle('selected', ranked);
        var badge = node.querySelector('.vote-rank-position');
        var toggle = node.querySelector('.vote-rank-toggle');
        var label = toggle.querySelector('.vote-rank-toggle-label');
        badge.hidden = !ranked;
        badge.textContent = ranked ? String(pos + 1) : '';
        toggle.classList.toggle('is-ranked', ranked);
        toggle.setAttribute('aria-pressed', ranked ? 'true' : 'false');
        label.textContent = ranked ? T.removeFromRanking : T.addToRanking;
      });
      renderRankingList();
    }

    var form = el('form', { class: 'vote-panel' }, [
      el('h2', { class: 'vote-panel-title', text: T.rankingTitle }),
      el('p', { class: 'vote-hint', text: T.rankingHint }),
      emptyHint,
      rankingList,
      el('div', { class: 'vote-actions' }, [btn]),
      box,
    ]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!ranking.length) return showMsg(box, T.errPickOne, false);

      btn.disabled = true;
      api('/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rankings: ranking.slice() }),
      })
        .then(function () {
          hadBallot = true;
          btn.textContent = T.btnUpdateVote;
          showMsg(box, T.voteThanks, true);
          refreshParticipation();
        })
        .catch(function (err) {
          showMsg(box, err.message, false);
        })
        .finally(function () { btn.disabled = false; });
    });

    app.appendChild(form);

    // Pre-fill from the member's existing ballot so it shows and stays editable.
    syncAll();
    api('/vote/mine')
      .then(function (res) {
        var prefilled = (res.rankings || [])
          .map(Number)
          .filter(function (id) { return suggestionsById[id]; });
        if (prefilled.length) {
          ranking = prefilled;
          hadBallot = true;
          btn.textContent = T.btnUpdateVote;
          syncAll();
        }
      })
      .catch(function () {});
  }

  // Round-by-round explanation of the instant-runoff count, rendered under the
  // headline winner cards. Aggregate only (per-round counts, transfers, exhausted
  // and majority numbers); never individual ballots. Returns null when there is
  // no rcvResult (historical approval rounds and ballot-less rounds), so the
  // legacy headline-card fallback in renderRevealed stands on its own.
  function rcvBreakdown(rcvResult, suggestions) {
    var rounds = (rcvResult && rcvResult.rounds) || [];
    if (!rounds.length) return null;

    var titleById = {};
    suggestions.forEach(function (s) { titleById[Number(s.id)] = s.title; });
    function titleFor(id) { return titleById[Number(id)] || ('#' + id); }

    var roundEls = rounds.map(function (r) {
      var active = r.activeBallots || 0;
      var denom = active > 0 ? active : 1;
      var transfers = r.transfersInto || {};

      var meta = [T.rcvMajority.replace('{n}', r.majority).replace('{active}', active)];
      if (r.exhausted) {
        meta.push((r.exhausted === 1 ? T.rcvExhaustedOne : T.rcvExhaustedOther).replace('{n}', r.exhausted));
      }

      var candidateEls = r.counts.map(function (c) {
        var isWinner = r.winnerId === c.id;
        var isEliminated = r.eliminatedId === c.id;
        var cls = 'vote-breakdown-candidate';
        if (isWinner) cls += ' is-winner';
        if (isEliminated) cls += ' is-eliminated';

        var tags = [];
        var transferred = transfers[c.id];
        if (transferred) tags.push(el('span', { class: 'vote-breakdown-transfer', text: T.rcvTransferred.replace('{n}', transferred) }));
        if (isWinner) tags.push(el('span', { class: 'vote-winner-tag', text: T.winnerTag }));
        else if (isEliminated) tags.push(el('span', { class: 'vote-breakdown-elim-tag', text: T.rcvEliminated }));

        // Bar fill and the majority marker share the active-ballot denominator so
        // the marker sits at the line a candidate must cross to win that round.
        var fill = el('div', { class: 'vote-bar-fill' });
        var track = el('div', { class: 'vote-bar-track' }, [
          el('div', { class: 'vote-breakdown-majority', style: 'left:' + (r.majority / denom * 100) + '%', 'aria-hidden': 'true' }),
          fill,
        ]);
        setTimeout(function () { fill.style.width = (c.votes / denom * 100) + '%'; }, 30);

        return el('li', { class: cls }, [
          el('div', { class: 'vote-breakdown-candidate-head' }, [
            el('span', { class: 'vote-breakdown-name', text: titleFor(c.id) }),
            tags.length ? el('span', { class: 'vote-breakdown-tags' }, tags) : null,
            el('span', { class: 'vote-count', text: c.votes + ' ' + T.votes }),
          ]),
          track,
        ]);
      });

      return el('li', { class: 'vote-breakdown-round' + (r.winnerId != null ? ' is-final' : '') }, [
        el('div', { class: 'vote-breakdown-round-head' }, [
          el('span', { class: 'vote-breakdown-round-num', text: T.rcvRound.replace('{n}', r.round) }),
          el('span', { class: 'vote-breakdown-meta', text: meta.join(' · ') }),
        ]),
        el('ul', { class: 'vote-breakdown-candidates' }, candidateEls),
        r.winnerId != null ? el('p', { class: 'vote-breakdown-winner-note', text: T.rcvWinnerRound }) : null,
      ]);
    });

    return el('section', { class: 'vote-breakdown' }, [
      el('h2', { class: 'vote-breakdown-title', text: T.breakdownTitle }),
      el('p', { class: 'vote-hint vote-breakdown-intro', text: T.breakdownIntro }),
      el('ol', { class: 'vote-breakdown-rounds' }, roundEls),
    ]);
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

    var breakdown = rcvBreakdown(data.rcvResult, data.suggestions);
    if (breakdown) app.appendChild(breakdown);

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
  function renderRound(data) {
    pitchEditable = !!(data.round && data.round.phase === 'suggesting' && data.round.suggestionsAreOpen);
    if (!data.round) return renderNone();
    if (data.round.phase === 'suggesting') return renderSuggesting(data);
    if (data.round.phase === 'voting') return renderVoting(data);
    return renderRevealed(data); // revealed | closed
  }

  // Re-fetch round + session state and re-render. Used on first load and when a
  // countdown reaches zero so the page reflects the new state without a manual
  // reload. Each phase renderer clears the app, so this safely replaces the view.
  function fetchState() {
    return Promise.all([
      api('/round/current'),
      api('/auth/session').catch(function () {
        return { authenticated: false, user: null, discordInvite: 'https://discord.gg/N2h6DJxVDF' };
      }),
    ]).then(function (results) {
      var data = results[0];
      session = results[1] || session;
      var mineRequest = session.authenticated
        ? api('/suggestions/mine').catch(function () { return { suggestions: [] }; })
        : Promise.resolve({ suggestions: [] });
      return mineRequest.then(function (mine) {
        mySuggestions = mine.suggestions || [];
        return renderRound(data);
      });
    });
  }

  function load() {
    mountMeetingFlow();
    app.appendChild(el('p', { class: 'vote-intro', text: T.loading }));
    fetchState().catch(function (err) {
      clearApp();
      var box = msgBox();
      app.appendChild(box);
      showMsg(box, err.message, false);
    });
  }

  load();
})();
