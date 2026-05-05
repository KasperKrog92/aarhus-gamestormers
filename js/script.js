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
    var ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Aarhus Gamestormers//',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + d.uid,
      'DTSTART:' + d.start,
      'DTEND:' + d.end,
      'SUMMARY:' + d.title,
      'DESCRIPTION:' + d.description,
      'LOCATION:' + d.location,
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
