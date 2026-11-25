

let mode = 'new';
const setMode = next => {
  mode = next;
  $('#registerFields').hidden = mode !== 'new';
  $('#loginFields').hidden = mode !== 'returning';
  $('#continueBtn').textContent = mode === 'new' ? 'Register' : 'Log in';
  $('#newMode').className = mode === 'new' ? 'btn' : 'btn alt';
  $('#returnMode').className = mode === 'returning' ? 'btn' : 'btn alt';
  $('#e').textContent = ''; $('#newCode').hidden = true;
};
$('#newMode').onclick = () => setMode('new');
$('#returnMode').onclick = () => setMode('returning');
(async () => {
  const t = localStorage.getItem('sw_token');
  if (t) { try { if (await rpc('student_me', { p_token: t })) return location.replace('student.html'); } catch (e) {} localStorage.removeItem('sw_token'); }
})();
$('#f').addEventListener('submit', async ev => {
  ev.preventDefault(); const err = $('#e'), btn = $('#continueBtn'); err.textContent = '';
  let fn, args;
  if (mode === 'new') {
    const name = $('#n').value.trim(), cls = +$('#c').value;
    if (name.length < 2) return err.textContent = 'Please enter your full name.';
    if (!cls) return err.textContent = 'Please choose your class.';
    fn = 'student_register'; args = { p_name: name, p_class: cls };
  } else {
    const code = $('#code').value.trim().toUpperCase();
    if (!/^SW-[A-F0-9]{5}$/.test(code)) return err.textContent = 'Enter your Student ID exactly as shown.';
    fn = 'student_login'; args = { p_code: code };
  }
  btn.disabled = true; btn.textContent = 'Please wait…';
  try {
    const r = await rpc(fn, args);
    if (!r || !r.token) throw new Error('Student account not found. Check your Student ID.');
    localStorage.setItem('sw_token', r.token);
    if (mode === 'new') {
      $('#newCode').hidden = false;
      $('#newCode').innerHTML = `<b>Your Student ID: ${esc(r.code)}</b><p>Write down or save this ID. You will need it to log in again.</p><button type="button" class="btn" id="enterStudent">Continue to student page</button>`;
      btn.disabled = false; btn.textContent = 'Registered';
      $('#enterStudent').onclick = () => location.href = 'student.html';
      return;
    }
    location.href = 'student.html';
  } catch (e) { err.textContent = e.message || 'Check your internet and try again.'; btn.disabled = false; btn.textContent = mode === 'new' ? 'Register' : 'Log in'; }
});
