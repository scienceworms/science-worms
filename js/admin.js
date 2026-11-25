const root = $('#root'); let subjects = [];
let PW = sessionStorage.getItem('sw_admin_pw') || '';
async function adm(action, args = {}) {
  const r = await rpc('admin_call', { p_password: PW, p_action: action, p_args: args });
  if (r.error) { if (r.error === 'denied') { PW = ''; sessionStorage.removeItem('sw_admin_pw'); loginView('Session ended. Please log in again.'); }
    throw new Error(r.error === 'locked' ? 'Too many wrong attempts. Try again in 5 minutes.' : r.error === 'denied' ? 'Wrong password.' : r.error); }
  return r.data;
}
const act = async (a, args) => { try { await adm(a, args); return true; } catch (e) { fail(e); return false; } };
const fail = e => toast(e.message || 'Something went wrong', true);

function loginView(msg = '') {
  root.innerHTML = `<div class="hero"><form class="card" id="lf"><div class="brand">${wormLogo}SCIENCE WORMS</div><h1>Admin login</h1>
  <label for="pw">Admin password</label><input id="pw" type="password" autocomplete="current-password">
  <p style="color:var(--bad);min-height:1.4em">${esc(msg)}</p><button class="btn" style="width:100%">Log in</button><p><a href="index.html">Student page</a></p></form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const b = e.submitter; b.disabled = true;
    PW = $('#pw').value; try { await adm('ping'); } catch (err) { PW = ''; return loginView(err.message); }
    sessionStorage.setItem('sw_admin_pw', PW); start();
  };
}
function start() { if (!PW) return loginView(); shell(); }
function shell() {
  root.innerHTML = `<div class="shell"><nav class="side"><div class="brand">${wormLogo}</div>
  ${['dash:Dashboard', 'subjects:Subjects', 'notes:Notes', 'ws:Worksheets', 'students:Students', 'settings:Settings'].map(x => `<a href="#${x.split(':')[0]}">${x.split(':')[1]}</a>`).join('')}
  <div class="grow"></div><a href="#" id="out">Log out</a></nav><main id="v"></main></div>`;
  $('#out').onclick = async e => { e.preventDefault(); PW = ''; sessionStorage.removeItem('sw_admin_pw'); loginView(); };
  addEventListener('hashchange', route); route();
}
async function loadSubjects() { subjects = await adm('subjects_list'); }
const subjOpts = (cls, sel) => subjects.filter(s => s.classes.includes(+cls)).map(s => `<option value="${s.id}"${s.id === sel ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
async function dash(v) {
  const d = await adm('dashboard'), rec = d.recent;
  const per = CLASSES.map(c => `Class ${c}: ${d.per_class[c] || 0}`).join(' · ');
  v.innerHTML = `<h1>Dashboard</h1><div class="grid">${[['Students', d.students], ['Notes', d.notes], ['Worksheets', d.worksheets], ['Submissions', d.submissions]].map(([l, n]) => `<div class="card stat reveal"><b>${n}</b>${l}</div>`).join('')}</div>
  <p>${per}</p>
  <div class="card reveal"><h3>Recent activity</h3>${rec.length ? '<ul>' + rec.map(r => `<li>${esc(r.name)} (Class ${r.class_no}) – ${esc(r.title)}, attempt ${r.attempt}: ${r.pending ? 'needs review' : r.score + '/' + r.max_score} <small>${fmtDate(r.submitted_at)}</small></li>`).join('') + '</ul>' : '<p class="empty">No student activity yet.</p>'}</div>`;
}
async function subjectsView(v) {
  await loadSubjects();
  v.innerHTML = `<h1>Subjects</h1><form class="card" id="sf"><label for="sn">New subject</label><input id="sn" maxlength="60" required>
  <label>Classes that study it</label><div class="row">${CLASSES.map(c => `<label class="opt"><input type="checkbox" value="${c}" checked>Class ${c}</label>`).join('')}</div><button class="btn" style="margin-top:12px">Add subject</button></form>
  <h2 style="margin-top:20px">Existing subjects</h2>${subjects.length ? subjects.map(s => `<div class="card" style="margin-bottom:10px"><b>${esc(s.name)}</b> <span class="tag">Classes ${s.classes.join(', ')}</span>
  <button class="btn bad sm" data-del="${s.id}" style="float:right">Delete</button></div>`).join('') : '<p class="empty">Add your first subject above (for example Science).</p>'}`;
  $('#sf').onsubmit = async e => { e.preventDefault(); const cl = [...v.querySelectorAll('#sf input[type=checkbox]:checked')].map(x => +x.value);
    if (!cl.length) return toast('Choose at least one class', true);
    if (!await act('subject_add', { name: $('#sn').value.trim(), classes: cl })) return; toast('Subject added'); route(); };
  v.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Delete this subject and all its notes and worksheets?')) return;
    if (!await act('subject_delete', { id: b.dataset.del })) return; route(); });
}
const tb = [['H2', 'formatBlock', 'h2'], ['H3', 'formatBlock', 'h3'], ['¶', 'formatBlock', 'p'], ['B', 'bold'], ['I', 'italic'], ['• List', 'insertUnorderedList'], ['1. List', 'insertOrderedList']];
async function notesView(v) {
  await loadSubjects();
  const list = await adm('notes_list');
  v.innerHTML = `<h1>Notes</h1>${subjects.length ? `<form class="card" id="nf"><div class="row"><div><label>Class</label><select id="nc">${classOpts(9)}</select></div><div><label>Subject</label><select id="ns"></select></div></div>
  <div class="row"><div><label>Chapter</label><input id="nch" required></div><div><label>Topic</label><input id="nt" required></div></div>
  <label>Notes</label><div class="toolbar">${tb.map((b, i) => `<button type="button" class="btn alt sm" data-t="${i}">${b[0]}</button>`).join('')}<button type="button" class="btn alt sm" id="pv">Preview</button></div>
  <div class="editor" id="ed" contenteditable="true"></div><div id="pvb" class="card notes-body" hidden></div>
  <div class="row" style="margin-top:12px"><button class="btn" data-pub="1">Publish</button><button class="btn alt" data-pub="0">Save as draft</button></div></form>` : '<p class="empty">Add a subject first (Subjects page).</p>'}
  <h2 style="margin-top:20px">Your notes</h2>${list.length ? list.map(n => `<div class="card" style="margin-bottom:10px"><b>${esc(n.topic)}</b> <span class="tag">Class ${n.class_no}</span><span class="tag">${esc(n.subject)}</span><span class="tag">${esc(n.chapter)}</span>
  <span class="tag ${n.published ? 'ok' : 'gold'}">${n.published ? 'Published' : 'Draft'}</span><div style="margin-top:8px"><button class="btn alt sm" data-edit="${n.id}">Edit</button> <button class="btn alt sm" data-tog="${n.id}" data-p="${n.published}">${n.published ? 'Unpublish' : 'Publish'}</button> <button class="btn bad sm" data-del="${n.id}">Delete</button></div></div>`).join('') : '<p class="empty">No notes yet.</p>'}`;
  let editId = null;
  if (subjects.length) {
    const ed = $('#ed'), sync = () => $('#ns').innerHTML = subjOpts($('#nc').value) || '<option value="">No subject for this class</option>';
    sync(); $('#nc').onchange = sync;
    v.querySelectorAll('[data-t]').forEach(b => b.onmousedown = e => { e.preventDefault(); const t = tb[b.dataset.t]; document.execCommand(t[1], false, t[2]); });
    ed.addEventListener('paste', e => { e.preventDefault(); const h = e.clipboardData.getData('text/html'), t = e.clipboardData.getData('text/plain'); document.execCommand('insertHTML', false, h ? clean(h) : esc(t).replace(/\n/g, '<br>')); });
    $('#pv').onclick = () => { const b = $('#pvb'); b.hidden = !b.hidden; b.innerHTML = clean(ed.innerHTML); };
    $('#nf').onsubmit = e => e.preventDefault();
    v.querySelectorAll('[data-pub]').forEach(b => b.onclick = async () => {
      const body = clean(ed.innerHTML); if (!ed.textContent.trim()) return toast('Write some notes first', true);
      if (!$('#ns').value || !$('#nch').value.trim() || !$('#nt').value.trim()) return toast('Fill in subject, chapter and topic', true);
      const row = { class_no: +$('#nc').value, subject_id: $('#ns').value, chapter: $('#nch').value.trim(), topic: $('#nt').value.trim(), body, published: b.dataset.pub === '1', updated_at: new Date().toISOString() };
      if (!await act('note_save', { id: editId, row })) return;
      toast(row.published ? 'Published' : 'Draft saved'); route(); });
    v.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => { let data; try { data = await adm('note_get', { id: b.dataset.edit }); } catch (e) { return fail(e); } editId = data.id;
      $('#nc').value = data.class_no; sync(); $('#ns').value = data.subject_id; $('#nch').value = data.chapter; $('#nt').value = data.topic; ed.innerHTML = clean(data.body); scrollTo({ top: 0, behavior: 'smooth' }); toast('Editing – press Publish to save changes'); });
  }
  v.querySelectorAll('[data-tog]').forEach(b => b.onclick = async () => { if (!await act('note_toggle', { id: b.dataset.tog, published: b.dataset.p !== 'true' })) return; route(); });
  v.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Delete these notes permanently?')) return; if (!await act('note_delete', { id: b.dataset.del })) return; route(); });
}
const TYPES = { mcq: 'Multiple choice', multi: 'Multiple select', tf: 'True / False', short: 'Short answer', long: 'Long answer', fill: 'Fill in the blanks' };
const newQ = type => ({ type, prompt: '', options: type === 'mcq' || type === 'multi' ? ['', ''] : [], correct: type === 'multi' ? [] : type === 'tf' ? true : type === 'fill' ? [''] : type === 'mcq' ? 0 : '', explanation: '', marks: 1, required: true });
async function wsView(v) {
  await loadSubjects();
  const list = await adm('ws_list');
  let Q = [newQ('mcq')], editId = null;
  v.innerHTML = `<h1>Worksheets</h1>${subjects.length ? `<div class="card"><h3>New worksheet</h3><div class="row"><div><label>Title</label><input id="wt"></div><div><label>Class</label><select id="wc">${classOpts(9)}</select></div><div><label>Subject</label><select id="wsub"></select></div></div>
  <div class="row"><div><label>Chapter</label><input id="wch"></div><div><label>Difficulty</label><select id="wd"><option>Easy</option><option selected>Medium</option><option>Hard</option></select></div></div></div>
  <div id="qs"></div><div class="row" style="margin:12px 0"><select id="nty">${Object.entries(TYPES).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select><button class="btn alt" id="aq">Add question</button></div>
  <div class="row"><button class="btn" data-pub="1">Publish worksheet</button><button class="btn alt" data-pub="0">Save as draft</button></div>` : '<p class="empty">Add a subject first (Subjects page).</p>'}
  <h2 style="margin-top:24px">Your worksheets</h2>${list.length ? list.map(w => `<div class="card" style="margin-bottom:10px"><b>${esc(w.title)}</b> <span class="tag">Class ${w.class_no}</span><span class="tag">${esc(w.subject)}</span><span class="tag">${w.questions} questions</span>
  <span class="tag ${w.published ? 'ok' : 'gold'}">${w.published ? 'Published' : 'Draft'}</span><div style="margin-top:8px"><button class="btn alt sm" data-edit="${w.id}">Edit</button> <button class="btn alt sm" data-tog="${w.id}" data-p="${w.published}">${w.published ? 'Unpublish' : 'Publish'}</button> <button class="btn bad sm" data-del="${w.id}">Delete</button></div></div>`).join('') : '<p class="empty">No worksheets yet.</p>'}`;
  if (subjects.length) {
    const sync = () => $('#wsub').innerHTML = subjOpts($('#wc').value) || '<option value="">No subject for this class</option>'; sync(); $('#wc').onchange = sync;
    const draw = () => { $('#qs').innerHTML = Q.map((x, i) => `<div class="card q" data-i="${i}"><div class="row"><b>Question ${i + 1} · ${TYPES[x.type]}</b><span style="text-align:right"><button class="btn alt sm" data-m="up">↑</button> <button class="btn alt sm" data-m="down">↓</button> <button class="btn bad sm" data-m="del">Delete</button></span></div>
      <label>Question${x.type === 'fill' ? ' (type ____ where each blank goes)' : ''}</label><textarea data-f="prompt" rows="2">${esc(x.prompt)}</textarea>
      ${x.type === 'mcq' || x.type === 'multi' ? x.options.map((o, j) => `<div class="row"><label class="opt" style="flex:0 0 auto"><input type="${x.type === 'mcq' ? 'radio' : 'checkbox'}" name="c${i}" data-c="${j}" ${(x.type === 'mcq' ? x.correct === j : x.correct.includes(j)) ? 'checked' : ''}>Correct</label><input data-o="${j}" value="${esc(o)}" placeholder="Option ${j + 1}"><button class="btn alt sm" data-m="rm${j}" style="flex:0 0 auto">✕</button></div>`).join('') + '<button class="btn alt sm" data-m="addo">Add option</button>' : ''}
      ${x.type === 'tf' ? `<label>Correct answer</label><select data-f="tf"><option value="true" ${x.correct ? 'selected' : ''}>True</option><option value="false" ${x.correct ? '' : 'selected'}>False</option></select>` : ''}
      ${x.type === 'fill' ? `<label>Correct answers, one per blank, separated by ; (alternatives with |)</label><input data-f="fill" value="${esc(x.correct.join('; '))}">` : ''}
      ${x.type === 'short' || x.type === 'long' ? `<label>Model answer (shown to students after submitting; you mark these by hand)</label><textarea data-f="correct" rows="2">${esc(x.correct)}</textarea>` : ''}
      <label>Explanation</label><textarea data-f="explanation" rows="2">${esc(x.explanation)}</textarea>
      <div class="row"><div><label>Marks</label><input type="number" min="0" step="0.5" data-f="marks" value="${x.marks}"></div><label class="opt"><input type="checkbox" data-f="required" ${x.required ? 'checked' : ''}>Compulsory</label></div></div>`).join(''); };
    draw();
    $('#qs').addEventListener('input', e => { const i = +e.target.closest('[data-i]').dataset.i, x = Q[i], d = e.target.dataset;
      if (d.o !== undefined) x.options[+d.o] = e.target.value;
      else if (d.c !== undefined) { const j = +d.c; if (x.type === 'mcq') x.correct = j; else x.correct = e.target.checked ? [...x.correct, j] : x.correct.filter(k => k !== j); }
      else if (d.f === 'tf') x.correct = e.target.value === 'true'; else if (d.f === 'fill') x.correct = e.target.value.split(';').map(s => s.trim());
      else if (d.f === 'required') x.required = e.target.checked; else if (d.f === 'marks') x.marks = +e.target.value; else if (d.f) x[d.f] = e.target.value; });
    $('#qs').addEventListener('click', e => { const m = e.target.dataset.m; if (!m) return; const i = +e.target.closest('[data-i]').dataset.i, x = Q[i];
      if (m === 'del') Q.splice(i, 1); else if (m === 'up' && i > 0) [Q[i - 1], Q[i]] = [Q[i], Q[i - 1]]; else if (m === 'down' && i < Q.length - 1) [Q[i + 1], Q[i]] = [Q[i], Q[i + 1]];
      else if (m === 'addo') x.options.push(''); else if (m.startsWith('rm') && x.options.length > 2) { const j = +m.slice(2); x.options.splice(j, 1); x.correct = x.type === 'mcq' ? 0 : x.correct.filter(k => k !== j).map(k => k > j ? k - 1 : k); }
      draw(); });
    v.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => {
      let w, qs; try { ({ w, qs } = await adm('ws_get', { id: b.dataset.edit })); } catch (e) { return fail(e); }
      editId = w.id; $('#wt').value = w.title; $('#wc').value = w.class_no; sync(); $('#wsub').value = w.subject_id; $('#wch').value = w.chapter || ''; $('#wd').value = w.difficulty;
      Q = qs.map(x => { return { type: x.type, prompt: x.prompt, options: x.options, marks: +x.marks, required: x.required, correct: x.correct ?? newQ(x.type).correct, explanation: x.explanation || '' }; });
      draw(); scrollTo({ top: 0, behavior: 'smooth' }); toast('Editing – press Publish or Save as draft to save changes'); });
    $('#aq').onclick = () => { Q.push(newQ($('#nty').value)); draw(); };
    v.querySelectorAll('[data-pub]').forEach(b => b.onclick = async () => {
      if (!$('#wt').value.trim() || !$('#wsub').value) return toast('Add a title and subject', true);
      if (!Q.length) return toast('Add at least one question', true);
      for (const [i, x] of Q.entries()) { const bad = !x.prompt.trim() ? 'is empty' : (x.type === 'mcq' || x.type === 'multi') && x.options.some(o => !o.trim()) ? 'has an empty option' : x.type === 'multi' && !x.correct.length ? 'needs a correct option' : x.type === 'fill' && (!x.prompt.includes('____') || x.correct.some(c => !c)) ? 'needs ____ blanks and an answer for each' : (x.marks < 0 || isNaN(x.marks)) ? 'has invalid marks' : '';
        if (bad) return toast(`Question ${i + 1} ${bad}`, true);
        if (x.type === 'fill' && x.prompt.split('____').length - 1 !== x.correct.length) return toast(`Question ${i + 1}: number of blanks and answers must match`, true); }
      b.disabled = true;
      try { await adm('ws_save', { w: { id: editId, class_no: +$('#wc').value, subject_id: $('#wsub').value, chapter: $('#wch').value.trim(), title: $('#wt').value.trim(), difficulty: $('#wd').value, published: b.dataset.pub === '1' }, qs: Q }); toast('Worksheet saved'); route(); }
      catch (e) { fail(e); b.disabled = false; } });
  }
  v.querySelectorAll('[data-tog]').forEach(b => b.onclick = async () => { if (!await act('ws_toggle', { id: b.dataset.tog, published: b.dataset.p !== 'true' })) return; route(); });
  v.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Delete this worksheet and all student submissions for it?')) return; if (!await act('ws_delete', { id: b.dataset.del })) return; route(); });
}
async function settings(v) {
  v.innerHTML = `<h1>Settings</h1><form class="card" id="pf"><h3>Change admin password</h3><label>Current password</label><input type="password" id="p0" autocomplete="current-password">
  <label>New password (at least 8 characters)</label><input type="password" id="p1" autocomplete="new-password"><label>Repeat new password</label><input type="password" id="p2" autocomplete="new-password"><br><br><button class="btn">Change password</button></form>`;
  $('#pf').onsubmit = async e => { e.preventDefault();
    if ($('#p1').value.length < 8) return toast('New password must be at least 8 characters', true);
    if ($('#p1').value !== $('#p2').value) return toast('The new passwords do not match', true);
    try { const r = await rpc('admin_call', { p_password: $('#p0').value, p_action: 'change_password', p_args: { new: $('#p1').value } });
      if (r.error) return toast(r.error === 'locked' ? 'Too many wrong attempts. Try again in 5 minutes.' : 'Current password is wrong', true);
      PW = $('#p1').value; sessionStorage.setItem('sw_admin_pw', PW); toast('Password changed'); e.target.reset(); } catch (err) { fail(err); } };
}
async function studentsView(v) {
  const data = await adm('students_list');
  v.innerHTML = `<h1>Students</h1><div class="row"><input id="ss" placeholder="Search by name or ID"><select id="sc"><option value="">All classes</option>${classOpts()}</select></div><div id="sl"></div>`;
  const draw = () => { const t = $('#ss').value.toLowerCase(), c = $('#sc').value;
    const L = data.filter(s => (!c || s.class_no == c) && (s.name.toLowerCase().includes(t) || s.code.toLowerCase().includes(t)));
    $('#sl').innerHTML = L.length ? L.map(s => { const p = s.progress, avg = p.length ? Math.round(p.reduce((a, x) => a + (+x.best || 0), 0) / p.length) + '%' : '–';
      return `<details class="card"><summary>${esc(s.name)} <span class="tag">Class ${s.class_no}</span><span class="tag">${esc(s.code)}</span><span class="tag ok">${p.length} attempted</span><span class="tag gold">Avg ${avg}</span><small> Last active ${fmtDate(s.last_active)}</small></summary>
      <div>${p.length ? p.map(x => `<p>${esc(x.title)} – best ${Math.round(x.best)}% · ${x.attempts} attempt${x.attempts > 1 ? 's' : ''}</p>`).join('') : 'No worksheets attempted yet.'}<p><button class="btn alt sm" data-student-delete="${esc(s.id)}">Delete student</button></p></div></details>`; }).join('') : '<p class="empty">No students found.</p>'; };
  $('#ss').oninput = $('#sc').onchange = draw; draw();
  $('#sl').addEventListener('click', async e => {
    const b = e.target.closest('[data-student-delete]'); if (!b) return;
    const student = data.find(x => x.id === b.dataset.studentDelete); if (!student) return;
    if (!confirm(`Delete ${student.name} (Class ${student.class_no}) and permanently remove their submissions and progress?`)) return;
    b.disabled = true; b.textContent = 'Deleting…';
    try { const r = await rpc('admin_delete_student', { p_password: PW, p_student_id: student.id });
      if (r.error) throw new Error(r.error === 'denied' ? 'Admin session expired. Log in again.' : r.error);
      const i = data.findIndex(x => x.id === student.id); if (i >= 0) data.splice(i, 1); draw(); toast('Student deleted');
    } catch (err) { b.disabled = false; b.textContent = 'Delete student'; fail(err); }
  });
}
async function route() {
  const v = $('#v'), p = location.hash.slice(1) || 'dash';
  document.querySelectorAll('.side a[href^="#"]').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + p));
  v.innerHTML = '<p class="empty">Loading…</p>';
  try { await ({ dash, subjects: subjectsView, notes: notesView, ws: wsView, students: studentsView, settings }[p] || dash)(v); reveal(v); }
  catch (e) { v.innerHTML = `<p class="empty">Could not load this page: ${esc(e.message)}</p>`; }
}
start();
