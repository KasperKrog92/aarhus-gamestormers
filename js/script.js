document.getElementById('year').textContent = new Date().getFullYear();

// Calendar dropdowns
document.querySelectorAll('.cal-btn').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var wrap = this.closest('.cal-wrap');
    var isOpen = wrap.classList.contains('open');
    document.querySelectorAll('.cal-wrap.open').forEach(function(w) {
      w.classList.remove('open');
      w.querySelector('.cal-btn').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      wrap.classList.add('open');
      this.setAttribute('aria-expanded', 'true');
    }
  });
});

document.addEventListener('click', function() {
  document.querySelectorAll('.cal-wrap.open').forEach(function(w) {
    w.classList.remove('open');
    w.querySelector('.cal-btn').setAttribute('aria-expanded', 'false');
  });
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.cal-wrap.open').forEach(function(w) {
      w.classList.remove('open');
      w.querySelector('.cal-btn').setAttribute('aria-expanded', 'false');
    });
  }
});

document.querySelectorAll('.cal-ics').forEach(function(link) {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    var d = this.dataset;
    function esc(s) {
      return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    }
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Aarhus Gamestormers//gamestormers.dk//DA',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'DTSTAMP:' + stamp,
      'UID:' + d.uid,
      'DTSTART:' + d.start,
      'DTEND:' + d.end,
      'SUMMARY:' + esc(d.title),
      'DESCRIPTION:' + esc(d.description),
      'LOCATION:' + esc(d.location),
      'URL:' + window.location.href,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = d.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});

function parseIcsDate(s) {
  return new Date(Date.UTC(
    +s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8),
    +s.slice(9,11), +s.slice(11,13), +s.slice(13,15)
  ));
}

// Reveal scheduled history cards after their event end time, and update the subtitle count
(function() {
  var revealed = false;
  document.querySelectorAll('.history-card[data-reveal]').forEach(function(card) {
    if (Date.now() > parseIcsDate(card.dataset.reveal).getTime()) {
      card.hidden = false;
      revealed = true;
    }
  });
  if (revealed) {
    var total = document.querySelectorAll('.history-card:not([hidden])').length;
    var sub = document.querySelector('.history-sub[data-count-template]');
    if (sub) sub.textContent = sub.dataset.countTemplate.replace(/\{n\}/g, total);
  }
})();

// Hide past event cards once their end time has passed
document.querySelectorAll('.event-card').forEach(function(card) {
  var ics = card.querySelector('.cal-ics[data-end]');
  if (!ics) return;
  if (Date.now() > parseIcsDate(ics.dataset.end).getTime()) {
    card.hidden = true;
  }
});

// Mark upcoming store links when the locally generated sale data says a game is discounted.
(function() {
  if (!window.fetch) return;

  var stores = [
    {
      name: 'Steam',
      dataUrl: '/data/steam-sales.json',
      rootKey: 'apps',
      selector: '.event-card:not([hidden]) .event-store-links a[href*="store.steampowered.com/app/"]',
      idFromLink: function(link) {
        var match = link.href.match(/store\.steampowered\.com\/app\/(\d+)/);
        return match ? match[1] : null;
      },
      saleLabelDa: 'Steam er på tilbud',
      saleLabelEn: 'Steam is on sale'
    },
    {
      name: 'GOG',
      dataUrl: '/data/gog-sales.json',
      rootKey: 'products',
      selector: '.event-card:not([hidden]) .event-store-links a[data-gog-id]',
      idFromLink: function(link) {
        return link.dataset.gogId || null;
      },
      saleLabelDa: 'GOG er på tilbud',
      saleLabelEn: 'GOG is on sale'
    }
  ];

  function applySaleBadges(store) {
    var links = Array.prototype.slice.call(document.querySelectorAll(store.selector));
    if (!links.length) return;

    var linksById = {};
    links.forEach(function(link) {
      var id = store.idFromLink(link);
      if (!id) return;
      if (!linksById[id]) linksById[id] = [];
      linksById[id].push(link);
    });
    if (!Object.keys(linksById).length) return;

    fetch(store.dataUrl, { cache: 'no-store' })
      .then(function(response) {
        if (!response.ok) throw new Error('No ' + store.name + ' sale data');
        return response.json();
      })
      .then(function(data) {
        var sales = data && data[store.rootKey] ? data[store.rootKey] : {};
        var isDanish = document.documentElement.lang === 'da';

        Object.keys(linksById).forEach(function(id) {
          var sale = sales[id];
          var discount = sale && Number(sale.discountPercent);
          if (!sale || !sale.onSale || !discount) return;

          linksById[id].forEach(function(link) {
            if (link.querySelector('.store-sale-tag')) return;
            var price = sale.finalFormatted ? ' · ' + sale.finalFormatted : '';
            var label = isDanish ? store.saleLabelDa : store.saleLabelEn;
            var tag = document.createElement('span');

            tag.className = 'store-sale-tag';
            tag.textContent = '-' + discount + '%';
            link.classList.add('store-link-on-sale');
            link.appendChild(tag);
            link.setAttribute('aria-label', label + ': -' + discount + '%' + price);
            link.title = label + ': -' + discount + '%' + price;
          });
        });
      })
      .catch(function() {});
  }

  stores.forEach(function(store) {
    applySaleBadges(store);
  });
})();

// Countdown to next meeting — reads dates from existing .cal-ics data-start attributes
(function() {
  var el = document.getElementById('gs-countdown');
  if (!el) return;

  var dates = [];
  document.querySelectorAll('.cal-ics[data-start]').forEach(function(l) {
    var d = parseIcsDate(l.dataset.start);
    if (!isNaN(d.getTime())) dates.push(d.getTime());
  });
  dates = dates.filter(function(t, i, a) { return a.indexOf(t) === i; });
  dates.sort(function(a,b){ return a-b; });

  function nextTarget() {
    var now = Date.now();
    for (var i = 0; i < dates.length; i++) {
      if (dates[i] > now) return dates[i];
    }
    return null;
  }

  var target = nextTarget();
  if (!target) { el.hidden = true; return; }

  var dEl = el.querySelector('.cd-d');
  var hEl = el.querySelector('.cd-h');
  var mEl = el.querySelector('.cd-m');
  var sEl = el.querySelector('.cd-s');
  var units = el.querySelector('.countdown-units');
  var label = el.querySelector('.countdown-label');

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function tick() {
    var diff = target - Date.now();
    if (diff <= 0) {
      label.textContent = el.dataset.today;
      units.hidden = true;
      return;
    }
    var s = Math.floor(diff / 1000);
    var m = Math.floor(s / 60); s %= 60;
    var h = Math.floor(m / 60); m %= 60;
    var d = Math.floor(h / 24); h %= 24;
    if (dEl) dEl.textContent = pad(d);
    if (hEl) hEl.textContent = pad(h);
    if (mEl) mEl.textContent = pad(m);
    if (sEl) sEl.textContent = pad(s);
  }

  tick();
  setInterval(tick, 1000);
})();

document.querySelectorAll('.history-card').forEach(function(card) {
  card.addEventListener('click', function() {
    var isOpen = this.classList.contains('open');
    document.querySelectorAll('.history-card').forEach(function(c) {
      c.classList.remove('open');
      c.setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      this.classList.add('open');
      this.setAttribute('aria-expanded', 'true');
    }
  });
  card.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.click();
    }
  });
});
