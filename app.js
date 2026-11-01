(() => {
  'use strict';
  const P = window.Planner;
  const { TYPES } = P;
  const KEY = 'lernplaner.v1';

  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pad = n => String(n).padStart(2, '0');

  const TIPS = {
    learn: 'Lies nicht nur: Fasse in eigenen Worten zusammen oder zeichne eine Mindmap.',
    practice: 'Active Recall: Unterlagen abdecken, Fragen selbst beantworten, Aufgaben ohne Lösung rechnen.',
    review: 'Nur noch Schwachstellen angehen und einen Selbsttest wie in der echten Prüfung machen.',
    homework: 'Handy weg, mit der schwierigsten Aufgabe anfangen, solange du frisch bist.',
    project: 'Kleine Teilziele setzen und am Ende der Einheit kurz notieren, wo du morgen weitermachst.',
  };
  const GENERAL_TIPS = [
    ['Verteilt lernen schlägt Büffeln', 'Mehrere kurze Einheiten über Tage bleiben viel besser hängen als ein langer Abend vor dem Test.'],
    ['Sich selbst abfragen', 'Active Recall (Karteikarten, Fragen ohne Spicken) ist effektiver als Wiederlesen oder Markieren.'],
    ['Pausen einplanen', '5–10 Minuten Pause nach jeder Einheit. Bewegen, trinken, Handy liegen lassen.'],
    ['Schwierigstes zuerst', 'Am Anfang des Lernblocks ist der Kopf am frischesten. Das Schwere gehört nach vorn.'],
    ['Schlaf ist Lernzeit', 'Im Schlaf festigt das Gehirn Gelerntes. Vor einem Test lieber früh ins Bett als noch eine Stunde dranhängen.'],
  ];

  const DEF = () => structuredClone(P.DEFAULT_SETTINGS);

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.items)) return { settings: { ...DEF(), ...s.settings }, items: s.items, log: s.log || [] };
    } catch { /* leer starten */ }
    return { settings: DEF(), items: [], log: [] };
  }
  let state = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Speicher gesperrt */ } };

  const hue = s => { let h = 0; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const color = s => `hsl(${hue(s)} 65% 50%)`;
  const fmtMin = m => (m >= 60 ? `${Math.floor(m / 60)} Std${m % 60 ? ` ${m % 60} Min` : ''}` : `${m} Min`);
  const fmtDate = s => P.parse(s).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' });
  const itemOf = id => state.items.find(i => i.id === id) || { subject: '?', title: '(gelöscht)', type: 'hausaufgabe' };
  function rel(s) {
    const d = P.diffDays(T, s);
    if (d === 0) return 'heute';
    if (d === 1) return 'morgen';
    if (d === -1) return 'gestern';
    return d > 1 ? `in ${d} Tagen` : `vor ${-d} Tagen`;
  }
  const dueChip = it => {
    const d = P.diffDays(T, it.due);
    const cls = d < 0 ? 'late' : d <= 2 ? 'soon' : '';
    return `<span class="chip ${cls}">${TYPES[it.type].icon} ${fmtDate(it.due)} · ${rel(it.due)}</span>`;
  };
  const isOpen = it => !it.done && !(P.SPREAD.has(it.type) && it.due < T);

  let view = 'today', PLAN, T;

  function render() {
    T = P.ymd(new Date());
    PLAN = P.plan(state, T);
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    $('#fab').hidden = view === 'settings' || view === 'learn';
    $('#view').innerHTML = ({ today: vToday, week: vWeek, tasks: vTasks, settings: vSettings, learn: vLearn })[view]();
    $('#view').className = view === 'learn' ? 'learn' : '';
    if (view !== 'learn') stopSpeak(); else paintTimer();
  }

  /* ---------- Heute ---------- */
  function sessCard(s, actionable) {
    const it = itemOf(s.itemId);
    const data = `data-item="${esc(s.itemId)}" data-min="${s.minutes}" data-label="${esc(s.label)}"`;
    return `<div class="card sess ${s.over ? 'over' : ''}" style="--c:${color(it.subject)}">
      <div class="main">
        <div class="sub">${esc(it.subject)} · ${TYPES[it.type].label}</div>
        <div class="ttl">${esc(it.title)}</div>
        <div class="meta">${esc(s.label)} · ${fmtMin(s.minutes)}${it.material ? ` · 📖 ${progressOf(it).pct}% gemeistert` : ''}${s.over ? ' · ⚠ über deiner Lernzeit' : ''}</div>
        ${actionable ? `<div class="tip">💡 ${esc(TIPS[s.phase])}</div>` : ''}
      </div>
      ${actionable ? `<div class="acts">
        ${it.material ? `<button class="ic" data-act="mat" data-id="${esc(it.id)}" data-min="${s.minutes}" data-label="${esc(s.label)}" aria-label="Lernstoff" title="Lernstoff">📖</button>` : ''}
        <button class="ic" data-act="focus" ${data} aria-label="Fokus-Timer">▶</button>
        <button class="ic ok" data-act="done" ${data} aria-label="Erledigt">✓</button></div>` : ''}
    </div>`;
  }

  function vToday() {
    const day = PLAN.days[0];
    const sessions = day ? day.sessions : [];
    const doneToday = state.log.filter(l => l.date === T);
    const doneMin = doneToday.reduce((a, l) => a + l.minutes, 0);
    const total = doneMin + sessions.reduce((a, s) => a + s.minutes, 0);
    const pct = total ? Math.round(doneMin / total * 100) : 0;
    const hour = new Date().getHours();
    const hello = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';

    const upcoming = state.items.filter(isOpen).sort((a, b) => (a.due < b.due ? -1 : 1)).slice(0, 4);
    const weekStart = P.addDays(T, -((P.weekIdx(T))));
    const weekMin = state.log.filter(l => l.date >= weekStart).reduce((a, l) => a + l.minutes, 0);

    let html = `<h1>${hello}, ${esc(state.settings.name)} 👋</h1>
      <div class="muted">${P.parse(T).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })} · Diese Woche gelernt: ${fmtMin(weekMin)}</div>`;

    if (!state.items.length) {
      return html + `<div class="empty"><div style="font-size:3rem">✨</div>
        <p>Trag deine erste Hausaufgabe oder deinen nächsten Test ein (Button unten rechts).<br>Der Plan entsteht automatisch.</p></div>`;
    }

    html += PLAN.warnings.map(w => `<div class="alert">⚠️ ${esc(w.text)}</div>`).join('');

    html += `<h2>Heute lernen</h2>`;
    if (total) html += `<div class="bar"><i style="width:${pct}%"></i></div>
      <div class="muted">${fmtMin(doneMin)} von ${fmtMin(total)} geschafft (${pct}%)</div>`;
    html += sessions.map(s => sessCard(s, true)).join('');
    html += doneToday.map(l => {
      const it = itemOf(l.itemId);
      return `<div class="card sess done" style="--c:${color(it.subject)}"><div class="main">
        <div class="sub">${esc(it.subject)}</div><div class="ttl">${esc(it.title)}</div>
        <div class="meta">${esc(l.label)} · ${fmtMin(l.minutes)} ✓</div></div>
        <div class="acts"><button class="ic" data-act="undo" data-id="${esc(l.id)}" aria-label="Rückgängig">↩</button></div></div>`;
    }).join('');
    if (!sessions.length && !doneToday.length) html += `<div class="empty">Heute ist nichts zu lernen. 🎉 Genieß den freien Tag.</div>`;
    else if (!sessions.length) html += `<div class="empty">Alles für heute erledigt. Stark! 🎉</div>`;
    else html += `<p class="hint">Nach jeder Einheit 5–10 Minuten Pause.</p>`;

    if (upcoming.length) {
      html += `<h2>Nächste Termine</h2>` + upcoming.map(it =>
        `<div class="dl">${dueChip(it)} <b>${esc(it.subject)}</b> – ${esc(it.title)}</div>`).join('');
    }
    return html;
  }

  /* ---------- Woche ---------- */
  function vWeek() {
    let html = `<h1>Wochenplan</h1><div class="muted">Die nächsten 14 Tage. Der Plan passt sich an, wenn du etwas änderst.</div>`;
    for (let k = 0; k < 14; k++) {
      const date = P.addDays(T, k);
      const day = PLAN.days.find(d => d.date === date);
      const due = state.items.filter(i => !i.done && i.due === date);
      const sessions = day ? day.sessions : [];
      const mins = sessions.reduce((a, s) => a + s.minutes, 0);
      html += `<div class="dayhead"><b>${k === 0 ? 'Heute' : k === 1 ? 'Morgen' : fmtDate(date)}</b>
        <span class="muted">${mins ? fmtMin(mins) : ''}${day && day.cap === 0 && !mins ? 'frei' : ''}</span></div>`;
      html += due.map(i => `<div class="dl"><span class="chip soon">${TYPES[i.type].icon} ${i.type === 'hausaufgabe' ? 'Abgabe' : 'Termin'}</span><b>${esc(i.subject)}</b> – ${esc(i.title)}</div>`).join('');
      html += sessions.map(s => {
        const it = itemOf(s.itemId);
        return `<div class="mini" style="--c:${color(it.subject)}"><b>${esc(it.subject)}</b> · ${esc(it.title)}<br>
          <span class="muted">${esc(s.label)} · ${fmtMin(s.minutes)}${s.over ? ' · ⚠' : ''}</span></div>`;
      }).join('');
      if (!sessions.length && !due.length) html += `<div class="muted" style="font-size:.85rem">–</div>`;
    }
    return html;
  }

  /* ---------- Einträge ---------- */
  function itemCard(it) {
    const est = P.estimate(it), lg = P.logged(state, it.id);
    const pct = Math.min(100, Math.round(lg / est * 100));
    return `<div class="card item" style="--c:${color(it.subject)}">
      <div class="main">
        <div class="sub">${esc(it.subject)}</div>
        <div class="ttl">${esc(it.title)}</div>
        <div>${dueChip(it)}<span class="chip">Schwierigkeit ${it.difficulty}/5</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="meta">${fmtMin(lg)} von ca. ${fmtMin(est)} gelernt${it.material ? ` · 📖 ${progressOf(it).pct}% Lernstoff gemeistert` : ''}</div>
      </div>
      <div class="acts">
        ${it.material ? `<button class="ic" data-act="mat" data-id="${esc(it.id)}" aria-label="Lernstoff" title="Lernstoff">📖</button>` : ''}
        <button class="ic" data-act="toggle" data-id="${esc(it.id)}" aria-label="Als erledigt markieren" title="${it.done ? 'Wieder öffnen' : 'Erledigt'}">${it.done ? '↩' : '✓'}</button>
        <button class="ic" data-act="edit" data-id="${esc(it.id)}" aria-label="Bearbeiten">✎</button>
        <button class="ic danger" data-act="del" data-id="${esc(it.id)}" aria-label="Löschen">🗑</button>
      </div>
    </div>`;
  }

  function vTasks() {
    const open = state.items.filter(isOpen).sort((a, b) => (a.due < b.due ? -1 : 1));
    const closed = state.items.filter(i => !isOpen(i)).sort((a, b) => (a.due < b.due ? 1 : -1));
    let html = `<h1>Einträge</h1>`;
    html += open.length ? open.map(itemCard).join('') : `<div class="empty">Keine offenen Einträge.</div>`;
    if (closed.length) html += `<h2>Erledigt / vorbei</h2>` + closed.map(itemCard).join('');
    return html;
  }

  /* ---------- Einstellungen ---------- */
  function vSettings() {
    const s = state.settings;
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    return `<h1>Mehr</h1>
      <h2>Name</h2>
      <input data-set="name" value="${esc(s.name)}" maxlength="30">
      <h2>Lernzeit pro Tag (Minuten)</h2>
      <div class="muted">So viel Zeit hast du an einem normalen Wochentag zum Lernen. Der Plan füllt nie mehr ein.</div>
      <div class="wk">${days.map((d, i) => `<label>${d}<input type="number" min="0" step="5" inputmode="numeric" data-wd="${i}" value="${s.week[i]}"></label>`).join('')}</div>
      <h2>Länge einer Lerneinheit</h2>
      <input type="number" min="15" max="90" step="5" data-set="chunk" value="${s.chunk}">
      <div class="muted">20–45 Minuten sind am effektivsten.</div>
      <h2>Freie Tage (keine Lernzeit)</h2>
      <div>${s.freeDays.filter(d => d >= T).sort().map(d => `<span class="chip free">${fmtDate(d)}<button data-act="rmfree" data-date="${d}" aria-label="Entfernen">✕</button></span>`).join('') || '<span class="muted">Keine</span>'}</div>
      <input type="date" data-set="addfree" min="${T}" style="margin-top:8px">
      <h2>Lerntipps</h2>
      ${GENERAL_TIPS.map(([t, d]) => `<div class="card tipcard"><b>${t}</b><span class="muted">${d}</span></div>`).join('')}
      <h2>KI-Auswertung (Claude)</h2>
      <div class="muted">Für „Mit KI auswerten“ beim Hochladen von Aufgaben und Lernstoff brauchst du einen API-Key von console.anthropic.com. Er bleibt nur in diesem Browser (nicht im Backup). Die hochgeladenen Dateien werden zur Auswertung an Anthropic gesendet. Setze dort am besten ein kleines Ausgabelimit.</div>
      <input type="password" data-set="apikey" autocomplete="off" placeholder="${getKey() ? '••••••• gespeichert – zum Ändern neu eingeben' : 'sk-ant-…'}">
      ${getKey() ? '<div class="row" style="justify-content:flex-start"><button class="ghost danger" data-act="rmkey">Key entfernen</button></div>' : ''}
      <h2>Daten</h2>
      <div class="muted">Deine Einträge werden nur in diesem Browser gespeichert. Mit einem Backup kannst du sie auf ein anderes Gerät mitnehmen.</div>
      <div class="row" style="justify-content:flex-start;flex-wrap:wrap">
        <button class="ghost" data-act="export">⬇ Backup speichern</button>
        <button class="ghost" data-act="import">⬆ Backup laden</button>
        <button class="ghost danger" data-act="reset">Alles löschen</button>
      </div>`;
  }

  /* ---------- Aktionen ---------- */
  function logSession(itemId, minutes, label, rerender = true) {
    state.log.push({ id: uid(), itemId, date: T, minutes, label });
    const it = state.items.find(i => i.id === itemId);
    if (it && it.type === 'hausaufgabe' && P.logged(state, it.id) >= P.estimate(it)) it.done = true;
    save(); if (rerender) render();
  }

  document.addEventListener('click', e => {
    const tab = e.target.closest('#tabs button');
    if (tab) { flushTimer(); view = tab.dataset.view; render(); scrollTo(0, 0); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const d = b.dataset;
    switch (d.act) {
      case 'done': logSession(d.item, +d.min, d.label); break;
      case 'focus': openTimer(d.item, +d.min, d.label); break;
      case 'undo': state.log = state.log.filter(l => l.id !== d.id); save(); render(); break;
      case 'toggle': { const it = state.items.find(i => i.id === d.id); it.done = !it.done; save(); render(); break; }
      case 'edit': openItem(d.id); break;
      case 'del': if (confirm('Diesen Eintrag löschen?')) { state.items = state.items.filter(i => i.id !== d.id); save(); render(); } break;
      case 'rmfree': state.settings.freeDays = state.settings.freeDays.filter(x => x !== d.date); save(); render(); break;
      case 'mat': openMaterial(d.id, { min: +d.min || 0, label: d.label }); break;
      case 'quiz': ensureRunning(); answerQuiz(b); break;
      case 'card': ensureRunning(); markCard(b); break;
      case 'speak': { ensureRunning(); const it = state.items.find(i => i.id === learnId); speak(speakText(it, d.kind, +d.i)); break; }
      case 'stopspeak': stopSpeak(); break;
      case 'lgo': if (lt) { if (lt.start) ltPause(); else ltRun(); paintTimer(); } break;
      case 'lstop': finishSession(); break;
      case 'back': flushTimer(); view = prevView; render(); scrollTo(0, 0); break;
      case 'lfilter': onlyWeak = !onlyWeak; render(); break;
      case 'more': generateMore(b); break;
      case 'rmkey': try { localStorage.removeItem(API_KEY); } catch { /* egal */ } render(); break;
      case 'export': exportData(); break;
      case 'import': $('#importFile').click(); break;
      case 'reset': if (confirm('Wirklich ALLE Einträge und Einstellungen löschen?')) { state = { settings: DEF(), items: [], log: [] }; save(); render(); } break;
    }
  });

  document.addEventListener('change', e => {
    const t = e.target, s = state.settings;
    if (t.dataset.set === 'rate') { speechRate = +t.value; return; }
    if (t.dataset.wd !== undefined) s.week[+t.dataset.wd] = Math.max(0, +t.value || 0);
    else if (t.dataset.set === 'name') s.name = t.value.trim() || 'Vincenzo';
    else if (t.dataset.set === 'apikey') { if (t.value.trim()) { try { localStorage.setItem(API_KEY, t.value.trim()); } catch { alert('Der Key konnte nicht gespeichert werden.'); } } }
    else if (t.dataset.set === 'chunk') s.chunk = Math.min(90, Math.max(15, +t.value || 40));
    else if (t.dataset.set === 'addfree') { if (t.value && !s.freeDays.includes(t.value)) s.freeDays.push(t.value); }
    else return;
    save(); render();
  });

  /* ---------- Eintrag-Dialog ---------- */
  const dlg = $('#itemDlg'), form = $('#itemForm');
  let editing = null;

  function openItem(id) {
    editing = id || null;
    const it = id ? state.items.find(i => i.id === id) : null;
    $('#itemDlgTitle').textContent = it ? 'Eintrag bearbeiten' : 'Neuer Eintrag';
    $('#subjects').innerHTML = [...new Set(state.items.map(i => i.subject))].map(s => `<option value="${esc(s)}">`).join('');
    form.type.value = it ? it.type : 'hausaufgabe';
    form.subject.value = it ? it.subject : '';
    form.title.value = it ? it.title : '';
    form.due.value = it ? it.due : P.addDays(P.ymd(new Date()), 1);
    form.difficulty.value = it ? it.difficulty : 3;
    form.effort.value = it && it.effort ? it.effort : '';
    $('#diffOut').textContent = form.difficulty.value;
    pendingMaterial = null;
    $('#matFiles').value = '';
    $('#matStatus').textContent = it && it.material ? '📖 Lernstoff vorhanden. Neue Dateien ersetzen ihn.' : '';
    dlg.showModal();
  }
  form.difficulty.addEventListener('input', () => { $('#diffOut').textContent = form.difficulty.value; });
  $('#itemCancel').addEventListener('click', () => dlg.close());
  $('#fab').addEventListener('click', () => openItem());
  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = {
      type: form.type.value,
      subject: form.subject.value.trim(),
      title: form.title.value.trim(),
      due: form.due.value,
      difficulty: +form.difficulty.value,
      effort: form.effort.value ? +form.effort.value : 0,
    };
    if (pendingMaterial) data.material = pendingMaterial;
    if (editing) Object.assign(state.items.find(i => i.id === editing), data);
    else state.items.push({ id: uid(), done: false, created: Date.now(), ...data });
    save(); dlg.close(); render();
  });

  /* ---------- Fokus-Timer ---------- */
  let tm = null;
  const tmDraw = () => {
    const s = Math.max(0, Math.ceil(tm.left / 1000));
    $('#tmTime').textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  };
  const tmRemaining = () => (tm.end ? tm.end - Date.now() : tm.left);
  function tmStop() { if (tm && tm.iv) clearInterval(tm.iv); }
  function openTimer(itemId, min, label) {
    const it = itemOf(itemId);
    tm = { itemId, min, label, left: min * 60000, end: null, iv: null };
    $('#tmTitle').textContent = `${it.subject} – ${it.title}`;
    $('#tmLabel').textContent = label;
    $('#tmGo').textContent = 'Start';
    $('#tmGo').disabled = false;
    tmDraw();
    $('#timerDlg').showModal();
  }
  function beep() {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      const o = a.createOscillator();
      o.connect(a.destination); o.frequency.value = 880; o.start();
      setTimeout(() => { o.stop(); a.close(); }, 500);
    } catch { /* kein Ton */ }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  $('#tmGo').addEventListener('click', () => {
    if (tm.end) {
      tm.left = tm.end - Date.now(); tm.end = null; tmStop();
      $('#tmGo').textContent = 'Weiter';
    } else {
      tm.end = Date.now() + tm.left;
      tm.iv = setInterval(() => {
        tm.left = tm.end - Date.now();
        if (tm.left <= 0) {
          tm.left = 0; tm.end = null; tmStop(); beep();
          $('#tmGo').textContent = 'Start'; $('#tmGo').disabled = true;
        }
        tmDraw();
      }, 250);
      $('#tmGo').textContent = 'Pause';
    }
  });
  $('#tmCancel').addEventListener('click', () => $('#timerDlg').close());
  $('#tmDone').addEventListener('click', () => {
    const elapsed = tm.min * 60000 - tmRemaining();
    const minutes = tmRemaining() <= 0 || elapsed < 60000 ? tm.min : Math.max(5, Math.round(elapsed / 60000));
    const { itemId, label } = tm;
    $('#timerDlg').close();
    logSession(itemId, minutes, label);
  });
  $('#timerDlg').addEventListener('close', tmStop);

  /* ---------- KI-Auswertung hochgeladener Dateien ---------- */
  const API_KEY = 'lernplaner.apikey';
  const MODEL = 'claude-sonnet-5-5';
  const MAX_FILE = 20 * 1024 * 1024;
  let pendingMaterial = null;

  function getKey() { try { return localStorage.getItem(API_KEY) || ''; } catch { return ''; } }

  const TOOL = {
    name: 'lernstoff',
    description: 'Liefert den aus den Unterlagen erstellten Lernstoff.',
    input_schema: {
      type: 'object',
      required: ['subject', 'title', 'difficulty', 'minutes', 'summary', 'points', 'cards', 'quiz'],
      properties: {
        subject: { type: 'string', description: 'Schulfach, kurz (z. B. Mathe)' },
        title: { type: 'string', description: 'Thema in max. 8 Wörtern' },
        difficulty: { type: 'integer', minimum: 1, maximum: 5 },
        minutes: { type: 'integer', description: 'Realistische Gesamt-Lernzeit in Minuten für diesen Stoff bzw. diese Aufgaben' },
        summary: { type: 'string', description: 'Verständliche Zusammenfassung, 5–10 Sätze' },
        points: { type: 'array', items: { type: 'string' }, description: 'Die wichtigsten Merkpunkte/Formeln/Begriffe' },
        cards: { type: 'array', items: { type: 'object', required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
        quiz: {
          type: 'array',
          items: {
            type: 'object', required: ['q', 'options', 'answer', 'why'],
            properties: {
              q: { type: 'string' },
              options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
              answer: { type: 'integer', minimum: 0, maximum: 3 },
              why: { type: 'string' },
            },
          },
        },
      },
    },
  };

  const toBase64 = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error('Datei konnte nicht gelesen werden.'));
    r.readAsDataURL(blob);
  });

  async function fileToBlock(f) {
    const name = f.name.toLowerCase();
    if (f.type.startsWith('image/')) {
      // verkleinern, damit Handy-Fotos nicht riesig übertragen werden
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
      return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await toBase64(blob) } };
    }
    if (f.size > MAX_FILE) throw new Error(`${f.name} ist zu groß (max. 20 MB).`);
    if (f.type === 'application/pdf' || name.endsWith('.pdf')) {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await toBase64(f) } };
    }
    if (f.type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
      return { type: 'text', text: `Datei „${f.name}“:\n${(await f.text()).slice(0, 100000)}` };
    }
    throw new Error(`${f.name}: Dieser Dateityp wird nicht unterstützt (PDF, Foto oder Text).`);
  }

  async function analyze(files, ctx) {
    const content = [];
    for (const f of files) content.push(await fileToBlock(f));
    content.push({
      type: 'text',
      text: `Du bist ein geduldiger Lerncoach für einen Schüler. Die Unterlagen oben sind Aufgaben und/oder Lernstoff (Art: ${ctx.type}` +
        `${ctx.subject ? `, Fach: ${ctx.subject}` : ''}${ctx.title ? `, Thema: ${ctx.title}` : ''}).\n` +
        'Lies alles genau und erstelle auf Deutsch den Lernstoff: eine verständliche Zusammenfassung, die wichtigsten Merkpunkte, ' +
        '8–15 Karteikarten zum Selbstabfragen und 5–8 Multiple-Choice-Fragen mit je 4 Antworten und kurzer Erklärung. ' +
        'Handelt es sich um Aufgaben, erkläre die nötigen Methoden und den Lösungsweg-Ansatz, verrate aber nicht einfach alle Lösungen. ' +
        'Schätze die Lernzeit realistisch. Antworte ausschließlich, indem du das Tool „lernstoff“ aufrufst, ohne zusätzlichen Text.',
    });
    return callClaude(content, TOOL);
  }

  async function callClaude(content, tool) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': getKey(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: 8000, tools: [tool],
        messages: [{ role: 'user', content }],
      }),
    });
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).error.message; } catch { /* keine Details */ }
      throw new Error(r.status === 401 ? 'Der API-Key ist ungültig.' : msg || `Fehler ${r.status}`);
    }
    const tu = (await r.json()).content.find(c => c.type === 'tool_use');
    if (!tu) throw new Error('Die KI hat keinen Lernstoff geliefert. Bitte nochmal versuchen.');
    return tu.input;
  }

  const str = x => String(x ?? '').trim();
  function normalize(m) {
    return {
      subject: str(m.subject).slice(0, 30),
      title: str(m.title).slice(0, 80),
      difficulty: Math.min(5, Math.max(1, Math.round(+m.difficulty || 3))),
      minutes: Math.min(1200, Math.max(10, Math.round((+m.minutes || 60) / 5) * 5)),
      summary: str(m.summary),
      points: (m.points || []).map(str).filter(Boolean),
      cards: (m.cards || []).map(c => ({ q: str(c.q), a: str(c.a) })).filter(c => c.q && c.a),
      quiz: (m.quiz || []).filter(q => Array.isArray(q.options) && q.options.length >= 2).map(q => ({
        q: str(q.q), options: q.options.slice(0, 4).map(str),
        answer: Math.min(q.options.length - 1, Math.max(0, +q.answer || 0)), why: str(q.why),
      })),
    };
  }

  const normCards = a => (a || []).map(c => ({ q: str(c.q), a: str(c.a) })).filter(c => c.q && c.a);
  const normQuiz = a => (a || []).filter(q => Array.isArray(q.options) && q.options.length >= 2).map(q => ({
    q: str(q.q), options: q.options.slice(0, 4).map(str),
    answer: Math.min(q.options.length - 1, Math.max(0, +q.answer || 0)), why: str(q.why),
  }));

  $('#matGo').addEventListener('click', async () => {
    const status = $('#matStatus'), files = [...$('#matFiles').files];
    if (!getKey()) { status.textContent = 'Trage zuerst unter „Mehr“ deinen API-Key ein.'; return; }
    if (!files.length) { status.textContent = 'Wähle zuerst eine Datei aus.'; return; }
    const btn = $('#matGo');
    btn.disabled = true;
    status.textContent = '⏳ Die KI liest deine Unterlagen … das kann bis zu einer Minute dauern.';
    try {
      const m = normalize(await analyze(files, { type: TYPES[form.type.value].label, subject: form.subject.value.trim(), title: form.title.value.trim() }));
      pendingMaterial = { summary: m.summary, points: m.points, cards: m.cards, quiz: m.quiz };
      if (!form.subject.value.trim()) form.subject.value = m.subject;
      if (!form.title.value.trim()) form.title.value = m.title;
      if (!form.effort.value) form.effort.value = m.minutes;
      if (!editing) { form.difficulty.value = m.difficulty; $('#diffOut').textContent = m.difficulty; }
      status.textContent = `✓ Fertig: ${m.cards.length} Karteikarten, ${m.quiz.length} Quizfragen. Wird beim Speichern zum Eintrag hinzugefügt.`;
    } catch (err) {
      status.textContent = `⚠ ${err.message || 'Auswertung fehlgeschlagen.'}`;
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------- Lernseite ---------- */
  let learnId = null, prevView = 'today', onlyWeak = false, speechRate = 1;

  const prog = it => (it.progress ||= { cards: {}, quiz: {} });

  function progressOf(it) {
    const m = it.material, p = it.progress || { cards: {}, quiz: {} };
    let ok = 0, bad = 0;
    m.cards.forEach((_, i) => { if (p.cards[i] === 1) ok++; else if (p.cards[i] === 0) bad++; });
    m.quiz.forEach((_, i) => { if (p.quiz[i] === 1) ok++; else if (p.quiz[i] === 0) bad++; });
    const total = m.cards.length + m.quiz.length;
    return { total, ok, bad, open: total - ok - bad, pct: total ? Math.round(ok / total * 100) : 0 };
  }

  function progressHtml(it) {
    const p = progressOf(it);
    return `<div class="bar"><i style="width:${p.pct}%"></i></div>
      <div><b>${p.pct}% gemeistert</b> · ✓ ${p.ok} gewusst · 🔁 ${p.bad} zu wiederholen · ${p.open} offen</div>
      ${p.bad ? `<div class="row" style="justify-content:flex-start;flex-wrap:wrap">
        <button class="ghost" data-act="lfilter">${onlyWeak ? 'Alles zeigen' : 'Nur Fehler zeigen'}</button>
        <button class="primary" data-act="more">🔁 Neue Übungen zu meinen Fehlern</button></div>` : ''}
      <div class="hint" id="lpMsg" style="text-align:left"></div>`;
  }

  function openMaterial(id, ctx = {}) {
    if (lt && lt.itemId !== id) flushTimer();
    if (!lt) lt = { itemId: id, label: ctx.label || 'Lernstoff', target: ctx.min || 0, acc: 0, start: null, iv: null };
    if (view !== 'learn') prevView = view;
    learnId = id; onlyWeak = false; view = 'learn';
    render(); scrollTo(0, 0);
  }

  function vLearn() {
    const it = state.items.find(i => i.id === learnId);
    if (!it || !it.material) { view = 'tasks'; return vTasks(); }
    const m = it.material, p = it.progress || { cards: {}, quiz: {} };
    const tts = 'speechSynthesis' in window;
    const sp = (kind, i = 0) => tts ? `<button class="ic sm" data-act="speak" data-kind="${kind}" data-i="${i}" aria-label="Vorlesen" title="Vorlesen">🔊</button>` : '';

    let html = `<button class="ghost" data-act="back">← Zurück</button>
      <h1>📖 ${esc(it.subject)} – ${esc(it.title)}</h1>
      <div class="card timerbar"><span id="ltime">00:00</span>
        <button class="primary" data-act="lgo" id="lgo">▶ Lernen starten</button>
        <button class="ok" data-act="lstop">⏹ Fertig</button>
        <div class="hint" id="lnote"></div></div>
      <div class="hint" style="text-align:left">Die Zeit startet automatisch, sobald du loslernst (Karte, Quiz, Vorlesen) oder auf Start tippst. Beim Verlassen der Seite wird sie als gelernte Zeit gespeichert.</div>
      <div class="card" id="lp">${progressHtml(it)}</div>`;

    if (tts) html += `<div class="card voice"><b>🔊 Vorlesen</b>
      <button class="ghost" data-act="speak" data-kind="summary">Zusammenfassung</button>
      <button class="ghost" data-act="speak" data-kind="points">Merkpunkte</button>
      <button class="ghost" data-act="stopspeak">⏹ Stopp</button>
      <label style="display:inline-block;margin:0 0 0 8px">Tempo
        <select data-set="rate" style="display:inline-block;width:auto">
          ${[[0.8, 'langsam'], [1, 'normal'], [1.25, 'schnell']].map(([v, l]) => `<option value="${v}" ${v === speechRate ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label></div>`;

    if (!onlyWeak) {
      if (m.summary) html += `<h2>Zusammenfassung ${sp('summary')}</h2><p>${esc(m.summary).replace(/\n/g, '<br>')}</p>`;
      if (m.points.length) html += `<h2>Merkpunkte ${sp('points')}</h2><ul>${m.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    }
    if ((m.notes || []).length) {
      html += `<h2>Nochmal erklärt</h2>` + m.notes.map((n, i) => `<div class="card"><div class="ctop"><span>${esc(n).replace(/\n/g, '<br>')}</span>${sp('note', i)}</div></div>`).join('');
    }

    const cards = m.cards.map((c, i) => ({ c, i })).filter(({ i }) => !onlyWeak || p.cards[i] === 0);
    if (cards.length) {
      html += `<h2>Karteikarten</h2><div class="muted">Erst überlegen, dann die Antwort aufklappen und ehrlich bewerten.</div>`;
      html += cards.map(({ c, i }) => `<div class="card lcard ${p.cards[i] === 1 ? 'known' : p.cards[i] === 0 ? 'unknown' : ''}">
        <div class="ctop"><b>${c.extra ? '<span class="chip">Wiederholung</span> ' : ''}${esc(c.q)}</b>${sp('cardq', i)}</div>
        <details><summary>Antwort zeigen</summary><p>${esc(c.a)} ${sp('carda', i)}</p>
          <div class="row">
            <button class="ghost" data-act="card" data-i="${i}" data-v="0">🔁 Nochmal üben</button>
            <button class="ok" data-act="card" data-i="${i}" data-v="1">✓ Gewusst</button>
          </div></details></div>`).join('');
    }

    const quiz = m.quiz.map((q, i) => ({ q, i })).filter(({ i }) => !onlyWeak || p.quiz[i] === 0);
    if (quiz.length) {
      html += `<h2>Quiz</h2>` + quiz.map(({ q, i }) => `<div class="card lcard ${p.quiz[i] === 1 ? 'known' : p.quiz[i] === 0 ? 'unknown' : ''}" data-quiz="${i}">
        <div class="ctop"><b>${q.extra ? '<span class="chip">Wiederholung</span> ' : ''}${esc(q.q)}</b>${sp('quiz', i)}</div>
        ${q.options.map((o, oi) => `<button class="qopt" data-act="quiz" data-id="${esc(it.id)}" data-qi="${i}" data-oi="${oi}">${esc(o)}</button>`).join('')}
        <div class="why" hidden></div></div>`).join('');
    }
    if (onlyWeak && !cards.length && !quiz.length) html += `<div class="empty">Keine Fehler mehr offen. 🎉</div>`;
    return html;
  }

  function answerQuiz(btn) {
    const it = state.items.find(i => i.id === btn.dataset.id);
    const qi = +btn.dataset.qi, q = it && it.material.quiz[qi];
    const box = btn.closest('[data-quiz]');
    if (!q || box.dataset.done) return;
    box.dataset.done = '1';
    const right = +btn.dataset.oi === q.answer;
    box.querySelectorAll('.qopt').forEach((b, i) => {
      if (i === q.answer) b.classList.add('right');
      else if (b === btn) b.classList.add('wrong');
    });
    const why = $('.why', box);
    why.textContent = (right ? '✓ Richtig. ' : '✗ Leider falsch. ') + q.why;
    why.hidden = false;
    prog(it).quiz[qi] = right ? 1 : 0;
    box.classList.remove('known', 'unknown');
    box.classList.add(right ? 'known' : 'unknown');
    save();
    $('#lp').innerHTML = progressHtml(it);
  }

  function markCard(btn) {
    const it = state.items.find(i => i.id === learnId);
    prog(it).cards[+btn.dataset.i] = +btn.dataset.v;
    save();
    const box = btn.closest('.lcard');
    box.classList.remove('known', 'unknown');
    box.classList.add(+btn.dataset.v ? 'known' : 'unknown');
    $('#lp').innerHTML = progressHtml(it);
  }

  /* Lernzeit-Stoppuhr: startet beim Loslernen, wird beim Verlassen gespeichert */
  let lt = null;
  const ltElapsed = () => (lt ? lt.acc + (lt.start ? Date.now() - lt.start : 0) : 0);
  function ltPause() {
    if (!lt || !lt.start) return;
    lt.acc += Date.now() - lt.start;
    lt.start = null;
    clearInterval(lt.iv);
  }
  function ltRun() {
    if (!lt || lt.start) return;
    lt.start = Date.now();
    lt.iv = setInterval(() => {
      if (!lt) return;
      if (lt.target && !lt.beeped && ltElapsed() >= lt.target * 60000) {
        lt.beeped = true; beep();
        lt.note = '🎉 Geplante Zeit erreicht. Du kannst weiterlernen oder auf „Fertig“ tippen.';
      }
      paintTimer();
    }, 1000);
    paintTimer();
  }
  const ensureRunning = () => { if (lt && !lt.start && !lt.acc) ltRun(); };
  function paintTimer() {
    const el = $('#ltime');
    if (!el || !lt) return;
    const f = ms => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
    el.textContent = f(ltElapsed()) + (lt.target ? ` / ${f(lt.target * 60000)}` : '');
    $('#lgo').textContent = lt.start ? '⏸ Pause' : ltElapsed() ? '▶ Weiter' : '▶ Lernen starten';
    $('#lnote').textContent = lt.note || '';
  }
  // beim Verlassen der Lernseite: erfasste Zeit als gelernt speichern
  function flushTimer() {
    if (!lt) return;
    ltPause();
    const minutes = Math.round(lt.acc / 60000);
    const { itemId, label } = lt;
    lt = null;
    if (minutes >= 1) logSession(itemId, minutes, label, false);
  }
  function finishSession() {
    if (!lt) return;
    ltPause();
    const minutes = Math.round(lt.acc / 60000);
    if (minutes < 1) { lt.note = 'Noch keine Lernzeit erfasst.'; paintTimer(); return; }
    const { itemId, label } = lt;
    lt = { itemId, label, target: 0, acc: 0, start: null, iv: null, note: `✓ ${minutes} Min Lernzeit gespeichert. Gut gemacht!` };
    logSession(itemId, minutes, label);
  }

  /* Vorlesen (Browser-Sprachausgabe) */
  function speakText(it, kind, i) {
    const m = it.material;
    switch (kind) {
      case 'summary': return m.summary;
      case 'points': return m.points.join('. ');
      case 'note': return m.notes[i];
      case 'cardq': return m.cards[i].q;
      case 'carda': return m.cards[i].a;
      case 'quiz': return `${m.quiz[i].q} ${m.quiz[i].options.map((o, k) => `${'ABCD'[k]}: ${o}`).join('. ')}`;
      default: return '';
    }
  }
  function stopSpeak() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  function speak(text) {
    stopSpeak();
    if (!text || !('speechSynthesis' in window)) return;
    const voice = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('de'));
    // satzweise vorlesen, sonst bricht die Ausgabe bei langen Texten in manchen Browsern ab
    text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean).forEach(s => {
      const u = new SpeechSynthesisUtterance(s);
      u.lang = 'de-DE';
      if (voice) u.voice = voice;
      u.rate = speechRate;
      speechSynthesis.speak(u);
    });
  }

  /* Neue Übungen zu den Fehlern */
  const MORE_TOOL = {
    name: 'uebungen',
    description: 'Liefert neue Übungen zu den Schwächen des Schülers.',
    input_schema: {
      type: 'object',
      required: ['explain', 'cards', 'quiz'],
      properties: {
        explain: { type: 'string', description: 'Kurze, einfache Erklärung der Konzepte, die der Schüler nicht sicher konnte' },
        cards: TOOL.input_schema.properties.cards,
        quiz: TOOL.input_schema.properties.quiz,
      },
    },
  };

  async function generateMore(btn) {
    const it = state.items.find(i => i.id === learnId);
    const msg = t => { const el = $('#lpMsg'); if (el) el.textContent = t; };
    if (!getKey()) { msg('Trage zuerst unter „Mehr“ deinen API-Key ein.'); return; }
    const m = it.material, p = it.progress || { cards: {}, quiz: {} };
    const weak = [];
    m.cards.forEach((c, i) => { if (p.cards[i] === 0) weak.push(`Karteikarte – Frage: ${c.q} | Antwort: ${c.a}`); });
    m.quiz.forEach((q, i) => { if (p.quiz[i] === 0) weak.push(`Quizfrage: ${q.q} | richtig: ${q.options[q.answer]} | Erklärung: ${q.why}`); });
    if (!weak.length) { msg('Es gibt keine Fehler zum Wiederholen.'); return; }
    btn.disabled = true;
    msg('⏳ Die KI erstellt neue Übungen zu deinen Fehlern …');
    try {
      const r = await callClaude([{
        type: 'text',
        text: `Du bist ein geduldiger Lerncoach. Ein Schüler lernt „${it.subject} – ${it.title}“. Zusammenfassung des Stoffs:\n${m.summary.slice(0, 3000)}\n\n` +
          `Diese Aufgaben hat er nicht gewusst oder falsch beantwortet:\n- ${weak.join('\n- ')}\n\n` +
          'Erkläre die zugrunde liegenden Konzepte noch einmal anders und einfacher (explain). Erstelle dann neue Übungen, die dieselben Konzepte ' +
          'anders abfragen, damit er nicht nur Antworten auswendig lernt: 1–2 neue Karteikarten und 1–2 Multiple-Choice-Fragen (4 Antworten, mit Erklärung) pro Schwäche. ' +
          'Antworte ausschließlich, indem du das Tool „uebungen“ aufrufst, ohne zusätzlichen Text.',
      }], MORE_TOOL);
      const cards = normCards(r.cards).map(c => ({ ...c, extra: true }));
      const quiz = normQuiz(r.quiz).map(q => ({ ...q, extra: true }));
      (m.notes ||= []).push(str(r.explain));
      m.cards.push(...cards);
      m.quiz.push(...quiz);
      save(); onlyWeak = false; render();
      msg(`✓ ${cards.length} neue Karteikarten und ${quiz.length} Quizfragen erstellt (weiter unten, markiert als „Wiederholung“).`);
    } catch (err) {
      btn.disabled = false;
      msg(`⚠ ${err.message || 'Das hat nicht geklappt.'}`);
    }
  }


  /* ---------- Backup ---------- */
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lernplaner-backup-${P.ymd(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!Array.isArray(s.items)) throw new Error('Ungültiges Format');
      if (!confirm(`Backup mit ${s.items.length} Einträgen laden? Aktuelle Daten werden ersetzt.`)) return;
      state = { settings: { ...DEF(), ...s.settings }, items: s.items, log: s.log || [] };
      save(); render();
    } catch { alert('Die Datei konnte nicht gelesen werden.'); }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden && view !== 'learn' && !dlg.open && !$('#timerDlg').open) render(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  render();
})();
