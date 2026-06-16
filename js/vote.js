/* Aarhus Gamestormers — game suggestion & approval-voting front end.
   Talks to the same-origin Pages Functions API (/api/*). Vanilla JS, no deps
   besides the Cloudflare Turnstile widget. Bilingual via STRINGS[lang]. */
var STRINGS = {
  da: {
    loading: 'Indlæser…',
    statusNone: 'Ingen aktiv afstemning',
    statusSuggesting: 'Forslag er åbne',
    statusVoting: 'Afstemning er åben',
    statusRevealed: 'Resultatet er klar',
    introNone: 'Der er ingen aktiv runde lige nu. Hold øje med Discord for næste afstemning.',
    introSuggesting:
      'Foreslå et spil til næste møde. Er det på Steam, henter vi titel, billede og genrer automatisk — ellers udfylder du det selv. Du skal bruge mødets kode fra Discord.',
    introVoting:
      'Sæt flueben ved <b>alle</b> de spil, du gerne vil spille — det med flest stemmer vinder. Du skal bruge mødets kode fra Discord.',
    introRevealed: 'Tak til alle der stemte! Her er resultatet — vinderen bliver næste mødes spil.',
    meetingFor: 'Forslag til {meeting}',
    formTitle: 'Foreslå et spil',
    suggestToggle: 'Foreslå nyt spil',
    hideSuggest: 'Skjul formular',
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
    labelPitch: 'Din pitch (valgfri)',
    pitchPlaceholder: 'Hvorfor skulle vi spille det? Et par linjer.',
    labelName: 'Dit navn (valgfri)',
    namePlaceholder: 'Vises på forslagskortet',
    labelCode: 'Mødekode',
    codePlaceholder: 'Koden fra Discord',
    hintCode: 'Koden deles på Discord.',
    btnSuggest: 'Send forslag',
    suggestThanks: 'Tak! “{title}” er tilføjet til forslagene.',
    manualThanks: 'Tak! “{title}” bliver vist, når en admin har godkendt det.',
    approvedSoFar: 'Forslag indtil videre',
    castBallot: 'Afgiv din stemme',
    btnVote: 'Stem',
    btnVoted: 'Stemme afgivet ✓',
    alreadyVoted: 'Det ser ud til, at du allerede har stemt i denne runde — du kan stemme igen, men kun den seneste tæller for dig.',
    voteThanks: 'Tak for din stemme!',
    noGames: 'Der er ingen spil på stemmesedlen endnu.',
    by: 'Foreslået af',
    approve: 'Jeg vil gerne spille det her',
    votes: 'stemmer',
    winnerTag: 'Vinder',
    playtime: '⏱ ~{h} t.',
    errGeneric: 'Noget gik galt. Prøv igen.',
    errPickOne: 'Vælg mindst ét spil.',
  },
  en: {
    loading: 'Loading…',
    statusNone: 'No active vote',
    statusSuggesting: 'Suggestions are open',
    statusVoting: 'Voting is open',
    statusRevealed: 'The result is in',
    introNone: 'There is no active round right now. Watch Discord for the next vote.',
    introSuggesting:
      "Suggest a game for the next meeting. If it’s on Steam we’ll pull in the title, image and genres automatically — otherwise you fill it in yourself. You’ll need the meeting code from Discord.",
    introVoting:
      'Tick <b>every</b> game you’d be happy to play — the one with the most ticks wins. You’ll need the meeting code from Discord.',
    introRevealed: 'Thanks to everyone who voted! Here’s the result — the winner becomes the next meeting’s game.',
    meetingFor: 'Suggestions for {meeting}',
    formTitle: 'Suggest a game',
    suggestToggle: 'Suggest new game',
    hideSuggest: 'Hide form',
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
    labelPitch: 'Your pitch (optional)',
    pitchPlaceholder: 'Why should we play it? A couple of lines.',
    labelName: 'Your name (optional)',
    namePlaceholder: 'Shown on the suggestion card',
    labelCode: 'Meeting code',
    codePlaceholder: 'Code from Discord',
    hintCode: 'The code is shared on Discord.',
    btnSuggest: 'Submit suggestion',
    suggestThanks: 'Thanks! “{title}” has been added to the suggestions.',
    manualThanks: 'Thanks! “{title}” will appear once an admin has approved it.',
    approvedSoFar: 'Suggestions so far',
    castBallot: 'Cast your ballot',
    btnVote: 'Vote',
    btnVoted: 'Vote cast ✓',
    alreadyVoted: 'Looks like you already voted in this round — you can vote again, but only your latest ballot counts for you.',
    voteThanks: 'Thanks for voting!',
    noGames: 'There are no games on the ballot yet.',
    by: 'Suggested by',
    approve: 'I’d play this',
    votes: 'votes',
    winnerTag: 'Winner',
    playtime: '⏱ ~{h} hrs.',
    errGeneric: 'Something went wrong. Please try again.',
    errPickOne: 'Pick at least one game.',
  },
};

(function () {
  var app = document.getElementById('vote-app');
  if (!app) return;

  var lang = document.documentElement.lang === 'en' ? 'en' : 'da';
  var sitekey = app.getAttribute('data-turnstile-sitekey') || '';
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

  function votedKey(roundId) { return 'gs-voted-r' + roundId; }

  function roundLabel(round) {
    var label = (lang === 'en' ? 'Meeting ' : 'Møde ') + round.id;
    var title = String(round.title || '').trim();
    var normalized = title.toLowerCase();
    if (title && normalized !== ('meeting ' + round.id).toLowerCase() && normalized !== ('møde ' + round.id).toLowerCase()) {
      label += ' · ' + title;
    }
    return label;
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
    var tags = [];
    (s.genres || []).slice(0, 3).forEach(function (g) {
      tags.push(el('span', { class: 'history-genre', text: g }));
    });
    if (s.playtimeHours) tags.push(el('span', { class: 'history-genre', text: playtimeText(s.playtimeHours) }));

    var storeLinks = [];
    if (s.storeUrl) storeLinks.push(el('a', { href: s.storeUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Steam' }));
    if (s.gogUrl) storeLinks.push(el('a', { href: s.gogUrl, target: '_blank', rel: 'noopener noreferrer', text: 'GOG' }));

    var body = [
      el('h3', { class: 'suggestion-title', text: s.title }),
      tags.length ? el('div', { class: 'suggestion-tags' }, tags) : null,
      s.pitch ? el('p', { class: 'suggestion-pitch', text: s.pitch }) : null,
      s.suggestedBy ? el('p', { class: 'suggestion-by', html: T.by + ' <b>' + escapeHtml(s.suggestedBy) + '</b>' }) : null,
      storeLinks.length ? el('div', { class: 'suggestion-store-links' }, storeLinks) : null,
    ];

    var classes = 'suggestion-card';

    if (mode === 'vote') {
      classes += ' is-selectable';
      var checkbox = el('input', { type: 'checkbox', value: s.id, 'aria-label': T.approve });
      // Plain div (not a <label>) so the card-level click handler is the single
      // source of truth for toggling — avoids a native+manual double toggle.
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
    return el('p', { class: 'vote-meeting', text: T.meetingFor.replace('{meeting}', roundLabel(round)) });
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
    app.appendChild(status(T.statusNone));
    app.appendChild(el('p', { class: 'vote-intro', text: T.introNone }));
  }

  function renderSuggesting(data) {
    clear(app);
    app.appendChild(status(T.statusSuggesting));
    app.appendChild(meetingBadge(data.round));
    app.appendChild(el('p', { class: 'vote-intro', html: T.introSuggesting }));

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
    if (data.suggestions.length) {
      app.appendChild(el('h2', { class: 'admin-section-title', text: T.approvedSoFar, style: 'color:var(--cream)' }));
      app.appendChild(grid(data.suggestions.map(function (s) { return card(s, 'list'); })));
    }
  }

  function renderVoting(data) {
    clear(app);
    app.appendChild(status(T.statusVoting));
    app.appendChild(meetingBadge(data.round));
    app.appendChild(el('p', { class: 'vote-intro', html: T.introVoting }));

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
    app.appendChild(status(T.statusRevealed));
    app.appendChild(meetingBadge(data.round));
    app.appendChild(el('p', { class: 'vote-intro', text: T.introRevealed }));

    if (!data.suggestions.length) {
      app.appendChild(el('p', { class: 'vote-empty', text: T.noGames }));
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
