/* Planungslogik – reine Funktionen ohne DOM (auch in Node testbar).
 *
 * Lernprinzipien, die der Planer umsetzt:
 *  - Verteiltes Lernen: Tests/Prüfungen werden auf mehrere Tage verteilt statt am Vorabend gepaukt.
 *  - Kurze Einheiten (Standard 40 Min) mit Pausen dazwischen.
 *  - Phasen: erst erarbeiten, dann üben/abfragen (Active Recall), am Ende wiederholen.
 *  - Nähere Deadlines haben Vorrang; schwierige Fächer kommen am Tag zuerst dran.
 */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  const weekIdx = s => (parse(s).getDay() + 6) % 7; // Mo = 0

  const TYPES = {
    hausaufgabe: { label: 'Hausaufgabe', icon: '📝' },
    test:        { label: 'Test',        icon: '📚' },
    pruefung:    { label: 'Prüfung',     icon: '🎯' },
    projekt:     { label: 'Projekt',     icon: '🧩' },
  };
  // Typen, die über mehrere Tage verteilt werden und nach dem Termin erledigt sind
  const SPREAD = new Set(['test', 'pruefung']);

  const DEFAULT_SETTINGS = {
    name: 'Vincenzo',
    week: [90, 90, 90, 90, 60, 120, 60], // Lernminuten Mo..So
    chunk: 40,                           // gewünschte Länge einer Lerneinheit
    freeDays: [],                        // Daten ohne Lernzeit
  };

  const LABELS = {
    learn: 'Stoff erarbeiten',
    practice: 'Üben & Abfragen',
    review: 'Wiederholen & Selbsttest',
    homework: 'Hausaufgabe',
  };

  function estimate(item) {
    if (item.effort > 0) return item.effort;
    const d = item.difficulty || 3;
    switch (item.type) {
      case 'test':     return 30 + 45 * d;
      case 'pruefung': return 60 + 60 * d;
      case 'projekt':  return 45 + 45 * d;
      default:         return 10 + 10 * d;
    }
  }

  const logged = (state, id) =>
    state.log.reduce((a, l) => a + (l.itemId === id ? l.minutes : 0), 0);

  function splitChunks(total, size) {
    if (total <= 0) return [];
    const n = Math.max(1, Math.ceil(total / size));
    const base = Math.max(5, Math.round(total / n / 5) * 5);
    const out = [];
    let left = total;
    for (let i = 0; i < n - 1 && left > 0; i++) {
      const m = Math.min(base, left);
      out.push(m);
      left -= m;
    }
    if (left > 0) out.push(left);
    return out;
  }

  function phaseFor(type, i, n) {
    if (type === 'hausaufgabe') return 'homework';
    if (type === 'projekt') return 'project';
    if (n === 1 || i === n - 1) return 'review';
    return i === 0 ? 'learn' : 'practice';
  }

  function plan(state, today) {
    const s = Object.assign({}, DEFAULT_SETTINGS, state.settings);
    const open = state.items.filter(i => !i.done && !(SPREAD.has(i.type) && i.due < today));
    const warnings = [];

    const horizon = Math.min(120, open.reduce((m, i) => Math.max(m, diffDays(today, i.due)), 0));
    const loggedToday = state.log.filter(l => l.date === today).reduce((a, l) => a + l.minutes, 0);

    const days = [];
    for (let k = 0; k <= horizon; k++) {
      const date = addDays(today, k);
      let cap = s.freeDays.includes(date) ? 0 : (s.week[weekIdx(date)] || 0);
      if (k === 0) cap = Math.max(0, cap - loggedToday);
      days.push({ date, cap, free: cap, sessions: [] });
    }

    const order = open.slice().sort((a, b) =>
      a.due < b.due ? -1 : a.due > b.due ? 1 : (b.difficulty || 3) - (a.difficulty || 3));

    for (const item of order) {
      const rem = estimate(item) - logged(state, item.id);
      if (rem <= 0) continue;

      const dueIn = diffDays(today, item.due);
      // Tests/Prüfungen/Hausaufgaben: letzter Lerntag ist der Tag vor dem Termin
      let last = Math.max(0, Math.min(dueIn - 1, horizon));
      if (dueIn < 0) warnings.push({ itemId: item.id, text: `${item.subject} – ${item.title} ist überfällig.` });

      const chunks = splitChunks(rem, s.chunk);
      const n = chunks.length;
      const spread = item.type !== 'hausaufgabe';
      const mine = [];
      let missing = 0;

      chunks.forEach((minutes, i) => {
        const target = !spread ? 0 : n === 1 ? last : Math.round(i * last / (n - 1));
        let need = minutes;
        while (need > 0) {
          const d = findDay(days, target, last, Math.min(15, need));
          if (d < 0) break;
          const take = Math.min(need, days[d].free);
          days[d].free -= take;
          mine.push({ itemId: item.id, date: days[d].date, minutes: take, over: false });
          need -= take;
        }
        if (need > 0) {
          // Kein Platz mehr: auf den freiesten Tag legen und markieren
          let best = 0;
          for (let k = 0; k <= last; k++) if (days[k].free > days[best].free) best = k;
          days[best].free -= need;
          mine.push({ itemId: item.id, date: days[best].date, minutes: need, over: true });
          missing += need;
        }
      });

      mine.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      mine.forEach((m, i) => {
        m.phase = phaseFor(item.type, i, mine.length);
        m.label = m.phase === 'project' ? `Projekt – Teil ${i + 1}/${mine.length}` : LABELS[m.phase];
        days[diffDays(today, m.date)].sessions.push(Object.assign(m, { difficulty: item.difficulty || 3, due: item.due }));
      });

      if (missing > 0) {
        warnings.push({
          itemId: item.id,
          text: `${item.subject} – ${item.title}: ${missing} Min passen nicht in deine Lernzeit bis zum Termin. Plane mehr Zeit ein oder fang früher an.`,
        });
      }
    }

    for (const d of days) {
      d.sessions.sort((a, b) => b.difficulty - a.difficulty || (a.due < b.due ? -1 : 1));
    }
    return { days, warnings };
  }

  // nächster Tag zum Zieltag (im Fenster 0..last) mit genug Platz; bei Gleichstand der frühere
  function findDay(days, target, last, minFree) {
    for (let dist = 0; dist <= last; dist++) {
      const a = target - dist, b = target + dist;
      if (a >= 0 && a <= last && days[a].free >= minFree) return a;
      if (b >= 0 && b <= last && days[b].free >= minFree) return b;
    }
    return -1;
  }

  root.Planner = { TYPES, SPREAD, DEFAULT_SETTINGS, ymd, parse, addDays, diffDays, weekIdx, estimate, logged, plan };
  if (typeof module !== 'undefined') module.exports = root.Planner;
})(typeof window !== 'undefined' ? window : globalThis);
