const C = window.SW_CONFIG;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function rpc(name, args, client = sb) { const { data, error } = await client.rpc(name, args); if (error) throw error; return data; }
function toast(msg, bad) {
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
}
const ALLOWED = new Set(['P', 'H2', 'H3', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'BLOCKQUOTE']);
function clean(html) { // keeps basic formatting only; strips scripts and attributes
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  (function walk(n) {
    [...n.childNodes].forEach(c => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1) return c.remove();
      if (!ALLOWED.has(c.tagName)) { walk(c); c.replaceWith(...c.childNodes); return; }
      [...c.attributes].forEach(a => c.removeAttribute(a.name)); walk(c);
    });
  })(doc.body);
  return doc.body.innerHTML;
}
function reveal(root = document) {
  const els = root.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) return els.forEach(e => e.classList.add('in'));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  els.forEach(e => io.observe(e));
}
const CLASSES = [6, 7, 8, 9, 10, 11, 12];
const classOpts = sel => CLASSES.map(c => `<option value="${c}"${c == sel ? ' selected' : ''}>Class ${c}</option>`).join('');
const fmtDate = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const wormLogo = `<svg class="logo" viewBox="0 0 64 32" aria-hidden="true"><g fill="#1C87A1"><circle cx="8" cy="22" r="6"/><circle cx="20" cy="14" r="6"/><circle cx="32" cy="22" r="6"/><circle cx="44" cy="14" r="6"/></g><circle cx="54" cy="20" r="8" fill="#F2A65A"/><circle cx="52" cy="18" r="1.8" fill="#0F2B33"/><circle cx="58" cy="18" r="1.8" fill="#0F2B33"/></svg>`;
const worm = pct => `<div class="worm" role="img" aria-label="${pct}%">${Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(pct / 10) ? 'on' : ''}" style="--d:${i * 60}ms"></i>`).join('')}</div>`;
