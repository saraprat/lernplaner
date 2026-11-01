(() => {
  'use strict';
  const P = window.Planner;
  const { TYPES } = P;
  const KEY = 'lernplaner.v1';

  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const p2 = n => String(n).padStart(2, '0');

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
    $('#fab').hidden = ['settings', 'learn', 'write', 'pairs'].includes(view);
    $('#view').innerHTML = ({ today: vToday, week: vWeek, tasks: vTasks, settings: vSettings, learn: vLearn, write: vWrite, pairs: vPairs })[view]();
    $('#view').className = ['learn', 'write', 'pairs'].includes(view) ? 'learn' : '';
    if (view !== 'learn') stopSpeak(); else paintTimer();
    if (view === 'write') { initCanvas(); const ti = $('#tinp'); if (ti) ti.focus(); }
  }

  /* ---------- Heute ---------- */
  function sessCard(s, actionable) {
    const it = itemOf(s.itemId);
    const data = `data-item="${esc(s.itemId)}" data-min="${s.minutes}" data-label="${esc(s.label)}"`;
    return `<div class="card sess ${s.over ? 'over' : ''}" style="--c:${color(it.subject)}">
      <div class="main">
        <div class="sub">${esc(it.subject)} · ${TYPES[it.type].label}</div>
        <div class="ttl">${esc(it.title)}</div>
        <div class="meta">${esc(s.label)} · ${fmtMin(s.minutes)}${hasMat(it) ? ` · 📖 ${progressOf(it).pct}% gemeistert` : ''}${s.over ? ' · ⚠ über deiner Lernzeit' : ''}</div>
        ${actionable ? `<div class="tip">💡 ${esc(TIPS[s.phase])}</div>` : ''}
      </div>
      ${actionable ? `<div class="acts">
        <button class="ic" data-act="mat" data-id="${esc(it.id)}" data-min="${s.minutes}" data-label="${esc(s.label)}" aria-label="Lernen" title="Lernen">📖</button>
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
        <div class="meta">${fmtMin(lg)} von ca. ${fmtMin(est)} gelernt${hasMat(it) ? ` · 📖 ${progressOf(it).pct}% Lernstoff gemeistert` : ''}</div>
      </div>
      <div class="acts">
        <button class="ic" data-act="mat" data-id="${esc(it.id)}" aria-label="Lernen" title="Lernen">📖</button>
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
      case 'write': startDrill(d.mode); break;
      case 'pairs': startPairs(); break;
      case 'ptile': pairTap(+d.t); break;
      case 'wback': view = 'learn'; render(); scrollTo(0, 0); break;
      case 'wclear': padClear(); break;
      case 'wundo': padUndo(); break;
      case 'wcheck': writeCheck(b); break;
      case 'wopt': pickOption(b); break;
      case 'wshow': showAnswer(); break;
      case 'wgrade': wr.verdict = d.v === '1' ? 'ok' : 'bad'; writeNext(); break;
      case 'wretry': padClear(); { const ti = $('#tinp'); if (ti) { ti.value = ''; ti.focus(); } } wres(''); wr.verdict = null; break;
      case 'woverride': wr.verdict = 'ok'; wres(wokHtml('', '', 'ok')); break;
      case 'wnext': writeNext(); break;
      case 'wagain': writeAgain(); break;
      case 'addvocab': addVocab(); break;
      case 'mnemo': mnemonic(b); break;
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
    if (t.dataset.set === 'wswap') { wr.swap = t.checked; wr.opts = null; render(); return; }
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
    $('#tmTime').textContent = `${p2(Math.floor(s / 60))}:${p2(s % 60)}`;
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
        cards: { type: 'array', items: { type: 'object', required: ['q', 'a'], properties: {
          q: { type: 'string', description: 'Frage; nennt klar, welche Antwortform gewünscht ist (z. B. „Übersetze: …“, „Ergänze: …“, „Wie heißt …?“)' },
          a: { type: 'string', description: 'Vollständige Antwort bzw. Erklärung' },
          key: { type: 'string', description: 'Sehr kurze Prüfantwort (Wort, Zahl oder Formel, max. 3 Wörter), die man eintippen oder schreiben kann; leer lassen, wenn es keine kurze eindeutige Antwort gibt' },
        } } },
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
        'Jede Karteikarten-Frage muss für sich allein verständlich sein und die gewünschte Antwortform nennen (z. B. „Übersetze: …“, „Ergänze den Satz: …“, „Wie heißt …?“). ' +
        'Gib bei jeder Karte, wenn es eine kurze eindeutige Antwort gibt, zusätzlich im Feld „key“ nur diese kurze Antwort an (max. 3 Wörter). ' +
        'Handelt es sich um Aufgaben, erkläre die nötigen Methoden und den Lösungsweg-Ansatz, verrate aber nicht einfach alle Lösungen. ' +
        'Schätze die Lernzeit realistisch. Antworte ausschließlich, indem du das Tool „lernstoff“ aufrufst, ohne zusätzlichen Text.',
    });
    return callClaude(content, TOOL);
  }

  async function callClaude(content, tool, maxTokens = 8000) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': getKey(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: maxTokens, tools: [tool],
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
      cards: (m.cards || []).map(c => ({ q: str(c.q), a: str(c.a), key: str(c.key) })).filter(c => c.q && c.a),
      quiz: (m.quiz || []).filter(q => Array.isArray(q.options) && q.options.length >= 2).map(q => ({
        q: str(q.q), options: q.options.slice(0, 4).map(str),
        answer: Math.min(q.options.length - 1, Math.max(0, +q.answer || 0)), why: str(q.why),
      })),
    };
  }

  const normCards = a => (a || []).map(c => ({ q: str(c.q), a: str(c.a), key: str(c.key) })).filter(c => c.q && c.a);
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

  const hasMat = it => !!it.material && it.material.cards.length + it.material.quiz.length > 0;

  function openMaterial(id, ctx = {}) {
    const cur = state.items.find(i => i.id === id);
    if (cur && !cur.material) cur.material = { summary: '', points: [], cards: [], quiz: [] };
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

    if (m.cards.length) {
      const due = dueCount(it);
      html += `<div class="card"><b>🧠 Lernmodi</b>
        <div class="muted">Verschiedene Wege, den Stoff ins Gedächtnis zu bekommen. Wechsle ab, das merkt sich besser. Richtig gewusste Karten kommen nach und nach in größeren Abständen wieder.</div>
        <div class="modes">
          <button class="ghost" data-act="write" data-mode="due">📅 Heute fällig (${due})</button>
          <button class="ghost" data-act="write" data-mode="flash">🃏 Karteikarten</button>
          <button class="ghost" data-act="write" data-mode="type">⌨️ Tippen</button>
          <button class="ghost" data-act="write" data-mode="choice">🎯 Multiple Choice</button>
          <button class="ghost" data-act="write" data-mode="write">✍️ Mit Stift schreiben</button>
          <button class="ghost" data-act="pairs">🧩 Paare finden</button>
          ${m.summary || m.points.length ? '<button class="ghost" data-act="write" data-mode="cloze">🕳 Lückentext</button>' : ''}
        </div></div>`;
    }
    html += `<h2>Vokabeln hinzufügen</h2><div class="muted">Eine pro Zeile, z. B. „das Haus = the house“.</div>
      <textarea id="vocab" rows="4" placeholder="das Haus = the house"></textarea>
      <div class="row" style="justify-content:flex-start"><button class="ghost" data-act="addvocab">＋ Hinzufügen</button></div>`;
    if (!m.summary && !m.cards.length && !m.quiz.length) html += '<div class="empty">Noch kein Lernstoff. Füge oben Vokabeln hinzu oder lade beim Bearbeiten des Eintrags Dateien hoch.</div>';
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
          ${c.mnemonic ? `<div class="why">💡 ${esc(c.mnemonic)}</div>` : `<button class="ghost" data-act="mnemo" data-i="${i}">💡 Eselsbrücke</button>`}
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
    gradeCard(it, +btn.dataset.i, +btn.dataset.v === 1);
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
    const f = ms => { const s = Math.floor(ms / 1000); return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`; };
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

  /* ---------- Lernmodi: Wiederholungsplan, Training, Handschrift, Paare ---------- */
  let wr = null, pad = null, pr = null, penSeen = false;

  const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);

  // Wiederholungsplan (Leitner): richtig → nächste Box, größerer Abstand; falsch → zurück auf Box 1
  const INTERVALS = [0, 1, 3, 7, 14, 30];
  function gradeCard(it, i, ok) {
    const p = prog(it);
    p.cards[i] = ok ? 1 : 0;
    const s = (p.srs ||= {});
    const box = ok ? Math.min(5, ((s[i] && s[i].box) || 0) + 1) : 1;
    s[i] = { box, due: P.addDays(T, INTERVALS[box]) };
  }
  const isDue = (it, i) => { const e = it.progress && it.progress.srs && it.progress.srs[i]; return !e || e.due <= T; };
  const dueCount = it => it.material.cards.reduce((n, _, i) => n + (isDue(it, i) ? 1 : 0), 0);

  const normW = s => str(s).normalize('NFC').replace(/\s+/g, ' ').replace(/^[\s.,;:!?"„“'’]+|[\s.,;:!?"„“'’]+$/g, '');
  function compareWord(got, want) {
    const g = normW(got);
    const alts = want.split(/\s*[;/]\s*/).map(normW).filter(Boolean);
    if (alts.some(a => a === g)) return 'ok';
    if (alts.some(a => a.toLowerCase() === g.toLowerCase())) return 'case';
    return 'bad';
  }

  // Lückentext aus Zusammenfassung und Merkpunkten: das längste Wort wird zur Lücke
  function makeCloze(m) {
    const sents = [...m.points, ...(m.summary ? m.summary.split(/(?<=[.!?])\s+/) : [])]
      .map(s => s.trim()).filter(s => s.length >= 25 && s.length <= 220);
    const out = [];
    for (const s of sents) {
      const words = s.match(/[A-Za-zÄÖÜäöüß0-9]{6,}/g);
      if (!words) continue;
      const w = words.reduce((a, b) => (b.length > a.length ? b : a));
      out.push({ cloze: true, ask: s.replace(w, '_____'), want: w });
    }
    return shuffle(out).slice(0, 12);
  }

  const lpMsg = t => { const el = $('#lpMsg'); if (el) el.textContent = t; };
  const TITLES = { due: '📅 Heute fällig', flash: '🃏 Karteikarten', type: '⌨️ Tippen', choice: '🎯 Multiple Choice', write: '✍️ Schreib-Training', cloze: '🕳 Lückentext' };

  function startDrill(mode) {
    const it = state.items.find(i => i.id === learnId), m = it.material;
    const p = it.progress || { cards: {} };
    if (mode === 'choice' && m.cards.length < 2) { lpMsg('Für Multiple Choice brauchst du mindestens 2 Karteikarten.'); return; }
    let items;
    if (mode === 'cloze') items = makeCloze(m);
    else {
      let idx = m.cards.map((_, i) => i);
      if (mode === 'type' || mode === 'write') {
        // ganze Sätze lassen sich nicht fair per Tippen/Schreiben prüfen
        idx = idx.filter(i => shortAns(wantOf(m.cards[i], wr ? wr.swap : false)));
        if (!idx.length) { lpMsg('Die Antworten sind hier ganze Sätze und zu lang zum Tippen oder Schreiben. Nimm Karteikarten oder Multiple Choice.'); return; }
      }
      if (mode === 'due') idx = idx.filter(i => isDue(it, i));
      else if (idx.some(i => p.cards[i] !== 1)) idx = idx.filter(i => p.cards[i] !== 1);
      items = shuffle(idx).map(i => ({ i }));
    }
    if (!items.length) { lpMsg(mode === 'due' ? 'Heute ist nichts fällig. 🎉' : 'Dafür gibt es noch keine Aufgaben.'); return; }
    wr = { mode: mode === 'due' ? 'flash' : mode, title: TITLES[mode], items, pos: 0, swap: wr ? wr.swap : false, ok: 0, bad: 0, badItems: [], verdict: null, opts: null, answered: false };
    ensureRunning();
    view = 'write'; render(); scrollTo(0, 0);
  }

  function drillTexts(it) {
    const cur = wr.items[wr.pos];
    if (cur.cloze) return { ask: cur.ask, want: cur.want };
    const c = it.material.cards[cur.i];
    return wr.swap ? { ask: c.a, want: c.q } : { ask: c.q, want: c.key || c.a, full: c.a };
  }

  // kurze Prüfantwort: bei KI-Karten das Feld „key“, sonst die Antwort selbst
  const wantOf = (c, swap) => (swap ? c.q : c.key || c.a);
  const shortAns = s => s.length <= 40 && s.split(/\s+/).length <= 5;

  function makeOpts(it, want) {
    const side = wr.swap ? 'q' : 'a';
    const pool = [...new Set(it.material.cards.map(c => c[side]).filter(x => x !== want))];
    return shuffle([want, ...shuffle(pool).slice(0, 3)]);
  }

  function vWrite() {
    const it = state.items.find(i => i.id === learnId);
    if (!wr || !it || !it.material) { view = 'tasks'; return vTasks(); }
    const n = wr.items.length;
    let html = `<button class="ghost" data-act="wback">← Zurück</button><h1>${wr.title}</h1>`;
    if (wr.pos >= n) {
      return html + `<div class="card"><h2 style="margin-top:0">${wr.bad ? 'Gut gemacht!' : 'Perfekt! 🎉'}</h2>
        <div>${wr.ok} von ${n} richtig.</div>
        <div class="row" style="justify-content:flex-start;flex-wrap:wrap">
          ${wr.badItems.length ? `<button class="primary" data-act="wagain">🔁 Fehler nochmal (${wr.badItems.length})</button>` : ''}
          <button class="ghost" data-act="wback">Zurück zum Lernstoff</button></div></div>`;
    }
    const cur = wr.items[wr.pos], t = drillTexts(it);
    const speakBtn = !cur.cloze && 'speechSynthesis' in window
      ? `<button class="ic sm" data-act="speak" data-kind="${wr.swap ? 'carda' : 'cardq'}" data-i="${cur.i}" aria-label="Vorlesen">🔊</button>` : '';
    let input = '';
    if (wr.mode === 'write') {
      input = `<div class="padwrap"><canvas id="pad"></canvas></div>
        <div class="row" style="justify-content:space-between;align-items:center">
          <div><button class="ic" data-act="wundo" aria-label="Letzten Strich löschen">↶</button>
            <button class="ic" data-act="wclear" aria-label="Alles löschen">🗑</button></div>
          <button class="primary big" data-act="wcheck">✔ Prüfen</button></div>
        <div class="hint">Auf dem Tablet mit dem Stift schreiben. Die Handschrift wird per KI erkannt.</div>`;
    } else if (wr.mode === 'type' || wr.mode === 'cloze') {
      input = `<input id="tinp" class="tinp" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Antwort eintippen">
        <div class="row"><button class="primary big" data-act="wcheck">✔ Prüfen</button></div>`;
    } else if (wr.mode === 'choice') {
      wr.opts ||= makeOpts(it, t.want);
      input = wr.opts.map((o, k) => `<button class="qopt" data-act="wopt" data-o="${k}">${esc(o)}</button>`).join('');
    } else {
      input = `<div class="row"><button class="primary big" data-act="wshow">Antwort zeigen</button></div>`;
    }
    const swapBox = wr.mode === 'cloze' ? '' :
      `<label class="inl"><input type="checkbox" data-set="wswap" ${wr.swap ? 'checked' : ''}> Richtung tauschen (Frage ↔ Antwort)</label>`;
    return html + `<div class="muted">Aufgabe ${wr.pos + 1} von ${n} · ✓ ${wr.ok} · ✗ ${wr.bad}</div>
      <div class="bar"><i style="width:${Math.round(wr.pos / n * 100)}%"></i></div>${swapBox}
      <div class="card"><div class="sub">${wr.mode === 'cloze' ? 'Ergänze die Lücke:' : wr.mode === 'flash' ? 'Frage:' : t.full && t.full !== t.want ? 'Kurze Antwort (Stichwort) zu:' : 'Antworte zu:'}</div>
        <div class="ctop"><div class="bigprompt">${esc(t.ask)}</div>${speakBtn}</div></div>
      ${input}<div id="wres"></div>`;
  }

  const wres = html => { const el = $('#wres'); if (el) el.innerHTML = html; };
  const wokHtml = (got, want, v, more = '') => `<div class="card lcard known"><b>✓ Richtig!</b>
    ${got ? `<div>Erkannt: „${esc(got)}“</div>` : ''}
    ${v === 'case' ? `<div class="why">Achte auf die Groß-/Kleinschreibung: ${esc(want)}</div>` : ''}${more}
    <div class="row"><button class="primary" data-act="wnext">Weiter →</button></div></div>`;
  function showVerdict(got, want, v) {
    const t = drillTexts(state.items.find(i => i.id === learnId));
    const more = t.full && t.full !== want ? `<div class="why">Vollständige Antwort: ${esc(t.full)}</div>` : '';
    wr.verdict = v === 'bad' ? 'bad' : 'ok';
    wres(v !== 'bad' ? wokHtml(got, want, v, more) : `<div class="card lcard unknown"><b>✗ Noch nicht ganz.</b>
      <div>Eingabe: „${esc(got)}“</div><div>Richtig wäre: <b>${esc(want)}</b></div>${more}
      <div class="row" style="flex-wrap:wrap">
        <button class="ghost" data-act="wretry">Nochmal versuchen</button>
        <button class="ghost" data-act="woverride">Doch richtig (gleichwertig / Erkennung falsch)</button>
        <button class="primary" data-act="wnext">Weiter →</button></div></div>`);
  }

  function checkTyped() {
    const ti = $('#tinp');
    if (!ti || !ti.value.trim()) { wres('<div class="alert">Tippe zuerst deine Antwort ein.</div>'); return; }
    const want = drillTexts(state.items.find(i => i.id === learnId)).want;
    showVerdict(ti.value.trim(), want, compareWord(ti.value, want));
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'tinp') { e.preventDefault(); checkTyped(); }
  });

  function pickOption(btn) {
    if (wr.answered) return;
    wr.answered = true;
    const it = state.items.find(i => i.id === learnId), want = drillTexts(it).want;
    const right = wr.opts[+btn.dataset.o] === want;
    document.querySelectorAll('.qopt').forEach((b, k) => {
      if (wr.opts[k] === want) b.classList.add('right');
      else if (b === btn) b.classList.add('wrong');
    });
    wr.verdict = right ? 'ok' : 'bad';
    wres(`<div class="card lcard ${right ? 'known' : 'unknown'}"><b>${right ? '✓ Richtig!' : '✗ Leider falsch.'}</b>
      ${right ? '' : `<div>Richtig wäre: <b>${esc(want)}</b></div>`}
      <div class="row"><button class="primary" data-act="wnext">Weiter →</button></div></div>`);
  }

  function showAnswer() {
    const t = drillTexts(state.items.find(i => i.id === learnId));
    wres(`<div class="card"><div class="sub">Antwort</div><div class="bigprompt">${esc(t.want)}</div>
      <div class="muted">Hast du es gewusst?</div>
      <div class="row"><button class="ghost" data-act="wgrade" data-v="0">🔁 Nochmal üben</button>
        <button class="ok" data-act="wgrade" data-v="1">✓ Gewusst</button></div></div>`);
  }

  function writeNext() {
    const it = state.items.find(i => i.id === learnId), cur = wr.items[wr.pos], ok = wr.verdict === 'ok';
    if (cur.i != null) gradeCard(it, cur.i, ok);
    if (ok) wr.ok++; else { wr.bad++; wr.badItems.push(cur); }
    wr.verdict = null; wr.opts = null; wr.answered = false; wr.pos++;
    save(); render(); scrollTo(0, 0);
  }
  function writeAgain() {
    wr = { ...wr, items: wr.badItems, pos: 0, ok: 0, bad: 0, badItems: [], verdict: null, opts: null, answered: false };
    render(); scrollTo(0, 0);
  }

  /* Handschrift: Zeichenfläche (Stift mit Druck; Handballen werden ignoriert, sobald ein Stift benutzt wurde) */
  const HAND_TOOL = {
    name: 'handschrift',
    description: 'Liefert die exakte Abschrift des Handgeschriebenen.',
    input_schema: {
      type: 'object',
      required: ['text'],
      properties: { text: { type: 'string', description: 'Exakte Abschrift, Zeichen für Zeichen' } },
    },
  };

  function padRedraw() {
    const { ctx, w, h } = pad;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = ctx.fillStyle = '#111';
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const s of pad.strokes) {
      if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0].x, s[0].y, s[0].w / 2, 0, 7); ctx.fill(); continue; }
      for (let k = 1; k < s.length; k++) padSeg(s[k - 1], s[k]);
    }
  }
  function padSeg(a, b) {
    const { ctx } = pad;
    ctx.lineWidth = b.w;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  function initCanvas() {
    const cv = $('#pad');
    if (!cv) { pad = null; return; }
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    pad = { cv, ctx, dpr, w: cv.clientWidth, h: cv.clientHeight, strokes: [], cur: null };
    padRedraw();
    const pt = e => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: e.pointerType === 'pen' ? 1.8 + (e.pressure || 0.5) * 3 : 3 };
    };
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType === 'pen') penSeen = true;
      if (e.pointerType === 'touch' && penSeen) return;
      cv.setPointerCapture(e.pointerId);
      pad.cur = [pt(e)];
      pad.strokes.push(pad.cur);
      padRedraw();
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      if (!pad.cur) return;
      const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      for (const ev of evs.length ? evs : [e]) {
        const p = pt(ev);
        padSeg(pad.cur[pad.cur.length - 1], p);
        pad.cur.push(p);
      }
    });
    const end = () => { pad.cur = null; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }
  function padClear() { if (pad) { pad.strokes = []; padRedraw(); } }
  function padUndo() { if (pad) { pad.strokes.pop(); padRedraw(); } }

  // Ausschnitt um die Schrift, auf weißem Grund, als PNG (Base64)
  function exportPad() {
    const pts = pad.strokes.flat(), m = 24;
    const lo = k => pts.reduce((a, p) => Math.min(a, p[k]), Infinity), hi = k => pts.reduce((a, p) => Math.max(a, p[k]), -Infinity);
    const x0 = Math.max(0, lo('x') - m), y0 = Math.max(0, lo('y') - m);
    const x1 = Math.min(pad.w, hi('x') + m), y1 = Math.min(pad.h, hi('y') + m);
    const sw = x1 - x0, sh = y1 - y0, k = Math.min(1, 900 / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(pad.cv, x0 * pad.dpr, y0 * pad.dpr, sw * pad.dpr, sh * pad.dpr, 0, 0, c.width, c.height);
    return c.toDataURL('image/png').split(',')[1];
  }

  async function writeCheck(btn) {
    if (wr.mode !== 'write') { checkTyped(); return; }
    if (!getKey()) { wres('<div class="alert">Trage zuerst unter „Mehr“ deinen API-Key ein.</div>'); return; }
    if (!pad || !pad.strokes.length) { wres('<div class="alert">Schreibe zuerst die Antwort auf die Fläche.</div>'); return; }
    btn.disabled = true;
    wres('<div class="muted">⏳ Schrift wird erkannt …</div>');
    try {
      const r = await callClaude([
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: exportPad() } },
        { type: 'text', text: 'Das Bild zeigt ein handgeschriebenes Wort oder eine kurze Wortgruppe eines Schülers beim Vokabellernen. ' +
          'Schreibe exakt ab, was handschriftlich dort steht, Zeichen für Zeichen, mit allen Akzenten, Umlauten und der Groß-/Kleinschreibung wie geschrieben. ' +
          'Korrigiere keine Rechtschreibfehler, ergänze nichts und rate nicht, was gemeint sein könnte. Unleserliche Zeichen schreibst du als „?“. ' +
          'Antworte ausschließlich, indem du das Tool „handschrift“ aufrufst, ohne zusätzlichen Text.' },
      ], HAND_TOOL, 300);
      const got = str(r.text), want = drillTexts(state.items.find(i => i.id === learnId)).want;
      showVerdict(got, want, compareWord(got, want));
    } catch (err) {
      wres(`<div class="alert">⚠ ${esc(err.message || 'Die Erkennung hat nicht geklappt.')}</div>`);
    } finally {
      btn.disabled = false;
    }
  }

  /* Paare finden (Memory) */
  function startPairs() {
    const it = state.items.find(i => i.id === learnId), m = it.material, p = it.progress || { cards: {} };
    if (m.cards.length < 2) { lpMsg('Für „Paare finden“ brauchst du mindestens 2 Karteikarten.'); return; }
    const all = m.cards.map((_, i) => i);
    const idx = [...shuffle(all.filter(i => p.cards[i] !== 1)), ...shuffle(all.filter(i => p.cards[i] === 1))].slice(0, 6);
    pr = {
      tiles: shuffle(idx.flatMap(i => [{ i, side: 'q', text: m.cards[i].q }, { i, side: 'a', text: m.cards[i].a }])),
      sel: [], moves: 0, miss: {}, lock: false,
    };
    ensureRunning();
    view = 'pairs'; render(); scrollTo(0, 0);
  }
  function vPairs() {
    if (!pr) { view = 'learn'; return vLearn(); }
    let html = `<button class="ghost" data-act="wback">← Zurück</button><h1>🧩 Paare finden</h1>`;
    if (pr.tiles.every(t => t.done)) {
      return html + `<div class="card"><h2 style="margin-top:0">Geschafft! 🎉</h2><div>${pr.moves} Züge für ${pr.tiles.length / 2} Paare.</div>
        <div class="row" style="justify-content:flex-start"><button class="primary" data-act="pairs">Nochmal</button>
        <button class="ghost" data-act="wback">Zurück zum Lernstoff</button></div></div>`;
    }
    return html + `<div class="muted">Tippe zwei Kärtchen an, die zusammengehören (Frage und Antwort). Züge: ${pr.moves}</div>
      <div class="tiles">${pr.tiles.map((t, k) => `<button class="tile ${t.done ? 'done' : ''} ${pr.sel.includes(k) ? (pr.lock ? 'bad' : 'sel') : ''}" data-act="ptile" data-t="${k}" ${t.done ? 'disabled' : ''}>${esc(t.text)}</button>`).join('')}</div>`;
  }
  function pairTap(k) {
    if (pr.lock || pr.tiles[k].done || pr.sel.includes(k)) return;
    pr.sel.push(k);
    if (pr.sel.length === 2) {
      const [x, y] = pr.sel.map(j => pr.tiles[j]);
      pr.moves++;
      if (x.i === y.i) {
        x.done = y.done = true; pr.sel = [];
        if (pr.tiles.every(t => t.done)) {
          const it = state.items.find(i => i.id === learnId);
          for (const i of new Set(pr.tiles.map(t => t.i))) gradeCard(it, i, !pr.miss[i]);
          save();
        }
      } else {
        pr.miss[x.i] = (pr.miss[x.i] || 0) + 1; pr.miss[y.i] = (pr.miss[y.i] || 0) + 1;
        pr.lock = true;
        setTimeout(() => { if (!pr) return; pr.sel = []; pr.lock = false; if (view === 'pairs') render(); }, 900);
      }
    }
    render();
  }

  /* Eselsbrücke per KI */
  const MNEMO_TOOL = {
    name: 'eselsbruecke',
    description: 'Liefert eine einprägsame Eselsbrücke.',
    input_schema: { type: 'object', required: ['text'], properties: { text: { type: 'string', description: 'Kurze, einprägsame Eselsbrücke oder Merkgeschichte, max. 2 Sätze' } } },
  };
  async function mnemonic(btn) {
    const it = state.items.find(i => i.id === learnId), c = it.material.cards[+btn.dataset.i];
    if (!getKey()) { btn.textContent = 'Trage zuerst unter „Mehr“ deinen API-Key ein'; return; }
    btn.disabled = true; btn.textContent = '⏳ …';
    try {
      const r = await callClaude([{ type: 'text', text: `Erfinde für einen Schüler eine kurze, witzige, einprägsame Eselsbrücke (max. 2 Sätze), mit der er sich Folgendes merkt.\nFrage: ${c.q}\nAntwort: ${c.a}\nAntworte ausschließlich über das Tool „eselsbruecke“, ohne zusätzlichen Text.` }], MNEMO_TOOL, 400);
      c.mnemonic = str(r.text);
      save();
      btn.outerHTML = `<div class="why">💡 ${esc(c.mnemonic)}</div>`;
    } catch (err) {
      btn.disabled = false; btn.textContent = `💡 Eselsbrücke (${err.message || 'Fehler'})`;
    }
  }

  function addVocab() {
    const it = state.items.find(i => i.id === learnId);
    const cards = $('#vocab').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [q, ...rest] = l.split(/\s*(?:=|\t|;| [-–] )\s*/);
      return { q: str(q), a: str(rest.join(' ')) };
    }).filter(c => c.q && c.a);
    if (!cards.length) { lpMsg('Schreibe pro Zeile: Wort = Übersetzung'); return; }
    it.material.cards.push(...cards);
    save(); render();
    lpMsg(`✓ ${cards.length} Vokabeln hinzugefügt.`);
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
          'Jede Karteikarten-Frage muss die gewünschte Antwortform nennen; gib bei einer kurzen eindeutigen Antwort zusätzlich das Feld „key“ an. ' +
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

  document.addEventListener('visibilitychange', () => { if (!document.hidden && !['learn', 'write', 'pairs'].includes(view) && !dlg.open && !$('#timerDlg').open) render(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  render();
})();
