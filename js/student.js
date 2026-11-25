const T = localStorage.getItem('sw_token'); let ME, cache = {};
const v = $('#v');
const call = (fn, a = {}) => rpc(fn, { p_token: T, ...a });
const state = (html, cls = 'empty') => v.innerHTML = `<p class="${cls}">${html}</p>`;
$('#out').onclick = e => { e.preventDefault(); localStorage.removeItem('sw_token'); location.href = 'index.html'; };
const diffTag = d => `<span class="tag gold">${esc(d)}</span>`;

async function dash() {
  const recent = ME.recent.map(r => `<li>${esc(r.title)} – attempt ${r.attempt}: ${r.pending ? 'awaiting review' : r.score + '/' + r.max_score} <small>(${fmtDate(r.submitted_at)})</small></li>`).join('');
  v.innerHTML = `<h1>Welcome, ${esc(ME.name)}!</h1><p>Class ${ME.class_no} · Student ID <b>${esc(ME.code)}</b></p>
  <div class="grid">${[['Worksheets available', ME.total], ['Completed', ME.completed], ['Total attempts', ME.attempts], ['Average score', ME.avg == null ? '–' : ME.avg + '%']]
    .map(([l, n]) => `<div class="card stat reveal"><b>${n}</b>${l}</div>`).join('')}</div>
  <div class="card reveal" style="margin-top:16px"><h3>Progress</h3>${worm(ME.total ? Math.round(ME.completed / ME.total * 100) : 0)}</div>
  <div class="card reveal" style="margin-top:16px"><h3>Recent activity</h3>${recent ? '<ul>' + recent + '</ul>' : '<p class="empty">No worksheets submitted yet.</p>'}</div>`;
}
async function notes(id) {
  state('Loading notes…'); const list = cache.notes = await call('student_notes');
  if (id) { const n = list.find(x => x.id === id); if (!n) return state('Note not found.');
    v.innerHTML = `<p><a href="#notes">← All notes</a></p><h1>${esc(n.topic)}</h1><span class="tag">${esc(n.subject)}</span><span class="tag">${esc(n.chapter)}</span><div class="card notes-body" style="margin-top:12px">${clean(n.body)}</div>`; return; }
  if (!list.length) return state('No notes have been published for your class yet. Check back soon.');
  const subs = [...new Set(list.map(n => n.subject))], pick = cache.subj || '';
  const g = {}; list.filter(n => !pick || n.subject === pick).forEach(n => ((g[n.subject] ??= {})[n.chapter] ??= []).push(n));
  v.innerHTML = `<h1>Notes</h1><select id="sf" style="max-width:260px"><option value="">All subjects</option>${subs.map(s => `<option ${s === pick ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` + Object.entries(g).map(([s, chs]) => `<h2>${esc(s)}</h2>` + Object.entries(chs).map(([c, ns]) =>
    `<details class="card reveal"><summary>${esc(c)}</summary><div>${ns.map(n => `<p><a href="#notes/${n.id}">${esc(n.topic)}</a></p>`).join('')}</div></details>`).join('')).join('');
  $('#sf').onchange = e => { cache.subj = e.target.value; notes(); };
}
async function wsList() {
  state('Loading worksheets…'); const list = await call('student_worksheets');
  if (!list.length) return state('No worksheets are available for your class yet.');
  v.innerHTML = '<h1>Worksheets</h1><div class="grid">' + list.map(w => `<a href="#ws/${w.id}" style="text-decoration:none;color:inherit"><div class="card hover reveal">
    <h3>${esc(w.title)}</h3><span class="tag">${esc(w.subject)}</span>${w.chapter ? `<span class="tag">${esc(w.chapter)}</span>` : ''}${diffTag(w.difficulty)}
    <p>${w.questions} questions · ${w.marks} marks</p>
    <span class="tag ${w.attempts ? 'ok' : ''}">${w.attempts ? `Completed · ${w.attempts} attempt${w.attempts > 1 ? 's' : ''} · best ${w.best}%` : 'Not attempted'}</span></div></a>`).join('') + '</div>';
}
const fmtKey = (q, k) => {
  const c = k?.correct; if (c == null || c === '') return '<i>No model answer provided.</i>';
  if (q.type === 'mcq') return esc(q.options[c]);
  if (q.type === 'multi') return c.map(i => esc(q.options[i])).join(', ');
  if (q.type === 'tf') return c ? 'True' : 'False';
  if (q.type === 'fill') return c.map(x => esc(String(x).split('|')[0])).join(', ');
  return esc(c);
};
function qHTML(q, i) {
  let body = '';
  if (q.type === 'mcq' || q.type === 'multi') body = q.options.map((o, j) => `<label class="opt"><input type="${q.type === 'mcq' ? 'radio' : 'checkbox'}" name="q${i}" value="${j}">${esc(o)}</label>`).join('');
  else if (q.type === 'tf') body = ['True', 'False'].map(o => `<label class="opt"><input type="radio" name="q${i}" value="${o === 'True'}">${o}</label>`).join('');
  else if (q.type === 'short') body = `<input name="q${i}" maxlength="300">`;
  else if (q.type === 'long') body = `<textarea name="q${i}" rows="5"></textarea>`;
  return `<div class="card q reveal" id="q${i}"><b>${i + 1}. ${q.type === 'fill' ? q.prompt.split('____').map(esc).join(`<input style="width:9em;display:inline" class="blank" aria-label="blank">`) : esc(q.prompt)}</b>
   <span class="tag gold">${q.marks} mark${q.marks == 1 ? '' : 's'}</span>${q.required ? '' : '<span class="tag">Optional</span>'}<div class="body">${body}</div>
   <div class="res"></div><button class="btn alt sm sa" disabled title="Submit the worksheet to unlock answers">Show Answer</button><div class="ans" hidden></div></div>`;
}
function collect(qs) {
  return Object.fromEntries(qs.map((q, i) => {
    const el = $('#q' + i); let a;
    if (q.type === 'mcq') { const r = el.querySelector('input:checked'); a = r ? +r.value : null; }
    else if (q.type === 'multi') a = [...el.querySelectorAll('input:checked')].map(x => +x.value);
    else if (q.type === 'tf') { const r = el.querySelector('input:checked'); a = r ? r.value === 'true' : null; }
    else if (q.type === 'fill') a = [...el.querySelectorAll('.blank')].map(x => x.value.trim());
    else a = el.querySelector('input,textarea').value.trim();
    return [q.id, a];
  }));
}
async function ws(id) {
  state('Loading worksheet…'); const w = await call('student_worksheet', { p_id: id });
  if (!w) return state('This worksheet is not available.');
  const qs = w.questions; let keys = null;
  v.innerHTML = `<p><a href="#ws">← All worksheets</a></p><h1>${esc(w.title)}</h1>${diffTag(w.difficulty)}<div id="sum"></div>
  <div id="bar" class="row" style="margin:12px 0"><button class="btn alt sm" id="all" disabled title="Submit to unlock answers">Show All Answers</button><button class="btn alt sm" id="none" disabled>Hide All Answers</button></div>
  ${qs.map(qHTML).join('')}<button class="btn gold" id="sub">Submit Worksheet</button>`;
  reveal(v);
  const toggle = (i, show) => { const el = $('#q' + i), b = el.querySelector('.sa'), a = el.querySelector('.ans'); const k = keys[qs[i].id];
    a.innerHTML = `<b>Correct answer:</b> ${fmtKey(qs[i], k)}${k?.explanation ? `<p>${esc(k.explanation)}</p>` : ''}`; a.hidden = !show; b.textContent = show ? 'Hide Answer' : 'Show Answer'; };
  $('#sub').onclick = async ev => {
    const btn = ev.target; btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      const r = await call('student_submit', { p_id: id, p_answers: collect(qs) }); keys = r.keys;
      const pct = r.max ? Math.round(r.score / r.max * 100) : 0;
      $('#sum').innerHTML = `<div class="card" style="margin:12px 0"><h2>${r.score} / ${r.max} marks${r.pending ? ' so far' : ''} (${pct}%)</h2>${worm(pct)}
        <p>Attempt ${r.attempt}.${r.pending ? ' Short and long answers will be marked by your teacher.' : ''}</p></div>`;
      qs.forEach((q, i) => { const el = $('#q' + i), x = r.results[q.id];
        el.querySelectorAll('input,textarea').forEach(n => n.disabled = true);
        el.querySelector('.res').innerHTML = x.pending ? '<span class="tag gold">Awaiting review</span>' : `<span class="tag ${x.got == x.max ? 'ok' : 'bad'}">${x.got == x.max ? 'Correct' : x.got > 0 ? 'Partly correct' : 'Incorrect'} · ${x.got}/${x.max}</span>`;
        const b = el.querySelector('.sa'); b.disabled = false; b.title = ''; b.onclick = () => toggle(i, el.querySelector('.ans').hidden); });
      const all = $('#all'), none = $('#none'); all.disabled = none.disabled = false; all.title = '';
      all.onclick = () => qs.forEach((_, i) => toggle(i, true)); none.onclick = () => qs.forEach((_, i) => toggle(i, false));
      btn.textContent = 'Submitted'; window.scrollTo({ top: 0, behavior: 'smooth' });
      ME = await call('student_me');
    } catch (e) { toast(e.message || 'Could not submit', true); btn.disabled = false; btn.textContent = 'Submit Worksheet'; }
  };
}
async function results() {
  state('Loading results…'); const h = await call('student_history');
  v.innerHTML = '<h1>My results</h1>' + (h.length ? h.map(x => `<div class="card reveal" style="margin-bottom:10px"><b>${esc(x.title)}</b> <span class="tag">Attempt ${x.attempt}</span><span class="tag ${x.pending ? 'gold' : 'ok'}">${x.pending ? 'Awaiting review (auto part ' + x.score + '/' + x.max + ')' : x.score + ' / ' + x.max}</span> <small>${fmtDate(x.at)}</small></div>`).join('') : '<p class="empty">You have not submitted any worksheets yet.</p>');
}
async function route() {
  const [p, id] = (location.hash.slice(1) || 'dash').split('/');
  document.querySelectorAll('.side a[href^="#"]').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + p));
  try { await ({ dash, notes, results, ws: id ? () => ws(id) : wsList }[p] || dash)(id); reveal(v); }
  catch (e) { state('Something went wrong: ' + esc(e.message) + '. Check your connection and refresh.', 'empty'); }
}
(async () => {
  if (!T) return location.replace('index.html');
  try { ME = await call('student_me'); } catch (e) { return state('Cannot reach the server: ' + esc(e.message)); }
  if (!ME) { localStorage.removeItem('sw_token'); return location.replace('index.html'); }
  addEventListener('hashchange', route); route();
})();
