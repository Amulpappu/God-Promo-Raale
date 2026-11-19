/* NoteNinja — Senior-to-Junior Knowledge Sharing + Smart Timetable & Reminders
   Plain JavaScript. All writes go through validated Postgres functions (Supabase RPC). */
const SB_URL = 'https://rnsokogscsyjyoupajgg.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc29rb2dzY3N5anlvdXBhamdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NDQ3ODMsImV4cCI6MjExMDMyMDc4M30.x8c7HqBjh6fv6MUk-4S_y6O-o_YMq-_4jnLE_w3XLlg';
const BUCKET = 'nn-resources';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['pdf', 'docx', 'pptx', 'png', 'jpg', 'jpeg'];
const TYPES = { notes: 'Notes', previous_paper: 'Previous paper', tips: 'Tips' };
const DEPARTMENTS = ['CSE', 'CSE (Cyber Security)', 'CSE (AI & ML)', 'AI&DS', 'IT', 'CSBS', 'ECE', 'EEE', 'MECH', 'CIVIL', 'BME', 'Agriculture', 'MBA', 'MCA'];
const EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '🔥', '🎉', '📚', '✅', '❤️', '🤔', '😅'];
const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
let me = store.get('nn_user');
let pollTimer = null;

/* ---------- API ---------- */
async function rpc(fn, args = {}, token = null) {
  let res;
  try {
    res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token || SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch { throw new Error('No internet connection. Check your Wi-Fi and try again.'); }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && (data.message || data.error)) || `Request failed (${res.status})`);
  return data;
}
async function uploadFile(path, file) {
  const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
    body: file,
  });
  if (!res.ok) {
    let msg = 'File upload failed';
    try { const j = await res.json(); msg = j.message || j.error || msg; } catch { /* ignore */ }
    if (/size/i.test(msg)) msg = 'File is too large. Maximum size is 10 MB';
    if (/mime|type/i.test(msg)) msg = 'This file type is not allowed. Use PDF, DOCX, PPTX, PNG or JPG';
    throw new Error(msg);
  }
}
async function signedUrl(path) {
  const res = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 600 }),
  });
  if (!res.ok) throw new Error('This file is not available for download');
  const j = await res.json();
  return `${SB_URL}/storage/v1${j.signedURL}`;
}
async function sha256(file) {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- UI helpers ---------- */
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 4200);
}
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const starText = (n) => (n ? '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)) : '☆☆☆☆☆');
const statusBadge = (s) => (s === 'approved' ? '<span class="badge b-verified">✓ Verified</span>'
  : s === 'pending' ? '<span class="badge b-pending">⏳ Pending review</span>' : '<span class="badge b-rejected">✕ Rejected</span>');
const roleBadge = (r) => (r === 'teacher' ? '<span class="badge b-teacher">Teacher</span>' : r === 'moderator' ? '<span class="badge b-mod">Moderator</span>'
  : r === 'senior' ? '<span class="badge b-type">Senior</span>' : '');
function empty(title, text, action = '') { return `<div class="empty"><b>${esc(title)}</b>${esc(text)}${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`; }
function errorBox(e) { return `<div class="alert alert-err">${esc(e.message || e)}</div>`; }
function needSignIn(what) {
  app.innerHTML = `<div class="head"><h1>${esc(what)}</h1></div>${empty('Please sign in first', 'Pick a demo account or create your own in seconds.', '<a class="btn" href="#/signin">Sign in</a>')}`;
}
function setNav(route) {
  document.querySelectorAll('.nav a[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === route));
  $('#navModerate').hidden = !(me && me.role === 'moderator');
  $('#navUser').textContent = me ? `${me.name.split(' (')[0]}` : 'Sign in';
  $('#navUser').href = me ? '#/profile' : '#/signin';
  $('#bellBtn').hidden = !me;
  if (me) refreshBell();
}
const applyTheme = (t) => { document.documentElement.dataset.theme = t; $('#themeBtn').textContent = t === 'light' ? '🌙' : '☀️'; $('#themeBtn').setAttribute('aria-label', t === 'light' ? 'Switch to dark mode' : 'Switch to light mode'); };
applyTheme(store.get('nn_theme') || 'dark');
$('#themeBtn').onclick = () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; store.set('nn_theme', t); applyTheme(t); };
$('#bellBtn').onclick = () => toggleDrawer();
$('#menuBtn').onclick = () => { const n = $('#nav'); const open = n.classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', open); };

/* ---------- Router ---------- */
const routes = [
  [/^\/$/, 'home', () => (me ? renderDashboard() : renderLanding())],
  [/^\/notes$/, 'notes', renderCatalogue],
  [/^\/upload$/, 'upload', renderUpload],
  [/^\/resource\/([\w-]+)$/, 'notes', renderResource],
  [/^\/timetable$/, 'timetable', renderTimetable],
  [/^\/my$/, 'my', renderMy],
  [/^\/moderate$/, 'moderate', renderModerate],
  [/^\/community$/, 'community', renderCommunities],
  [/^\/community\/(\d+)$/, 'community', renderCommunityRoom],
  [/^\/people$/, 'people', renderPeople],
  [/^\/messages$/, 'messages', renderMessages],
  [/^\/messages\/([\w-]+)$/, 'messages', renderChat],
  [/^\/signin$/, '', renderSignIn],
  [/^\/profile$/, 'profile', renderProfile],
  [/^\/signout$/, '', () => { me = null; store.del('nn_user'); store.del('nn_token'); toast('Signed out'); location.hash = '#/'; }],
];
async function router() {
  clearInterval(pollTimer);
  if (/access_token=/.test(location.hash)) return finishOAuth();
  if (/error_description=/.test(location.hash)) { const q = new URLSearchParams(location.hash.slice(1)); toast(q.get('error_description') || 'Sign-in failed', true); location.hash = '#/signin'; return; }
  $('#nav').classList.remove('open');
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  for (const [re, nav, fn] of routes) {
    const m = path.match(re);
    if (m) {
      setNav(nav);
      app.innerHTML = '<p class="muted">Loading…</p>';
      try { await fn(...m.slice(1)); } catch (e) { app.innerHTML = errorBox(e); }
      window.scrollTo(0, 0);
      return;
    }
  }
  app.innerHTML = empty('Page not found', 'This link does not exist.', '<a class="btn" href="#/">Go home</a>');
}
window.addEventListener('hashchange', router);

/* ---------- Sign in (demo environment) ---------- */
async function renderSignIn() {
  const users = await rpc('nn_list_users');
  app.innerHTML = `
    <div class="signin-card card"><img src="assets/icon-192.png" alt="" width="72" height="72" style="border-radius:16px"><h1>Sign in to NoteNinja</h1><p class="muted">Use your Google or GitHub account.</p></div>
    <div class="actions" style="margin-bottom:24px;justify-content:center"><button class="btn btn-oauth" data-oauth="google"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> Continue with Google</button><button class="btn btn-oauth" data-oauth="github"><svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg> Continue with GitHub</button></div>
    <h2>Demo accounts <span class="muted small">(for judges)</span></h2>
    <div class="users">${users.map((u) => `<button class="user-pick" data-id="${u.id}"><b>${esc(u.name)}</b><br><span class="muted small">${esc(u.role)} · ${esc(u.department)} · Year ${u.year}</span></button>`).join('')}</div>
    <p class="muted small" style="text-align:center;margin-top:18px">New here? Continue with Google or GitHub — you'll create your profile (department, year, GitHub and LinkedIn) right after.</p>`;
  app.querySelectorAll('[data-oauth]').forEach((b) => (b.onclick = () => {
    const back = location.origin + location.pathname;
    location.href = `${SB_URL}/auth/v1/authorize?provider=${b.dataset.oauth}&redirect_to=${encodeURIComponent(back)}`;
  }));
  app.querySelectorAll('.user-pick').forEach((b) => (b.onclick = () => {
    me = users.find((u) => u.id === b.dataset.id); store.set('nn_user', me);
    toast(`Signed in as ${me.name}`); location.hash = '#/notes';
  }));
}

async function finishOAuth() {
  const q = new URLSearchParams(location.hash.slice(1));
  const token = q.get('access_token');
  history.replaceState(null, '', location.pathname + '#/');
  store.set('nn_token', token);
  try {
    const p = await rpc('nn_auth_profile', {}, token);
    if (p.needs_profile) return renderProfileSetup(p, token);
    me = { id: p.id, name: p.name, department: p.department, year: p.year, role: p.role };
    store.set('nn_user', me); toast(`Welcome, ${me.name}`); location.hash = '#/'; router();
  } catch (e) { app.innerHTML = errorBox(e); }
}
function profileFields(p = {}) {
  return `<div class="form-row">
      <label class="field">Full name<input name="name" maxlength="60" value="${esc(p.name || '')}" required></label>
      <label class="field">I am a<select name="role"><option value="junior" ${p.role === 'junior' ? 'selected' : ''}>Junior (I want resources)</option><option value="senior" ${p.role === 'senior' ? 'selected' : ''}>Senior (I want to share)</option></select></label>
    </div>
    <div class="form-row">
      <label class="field">Department<select name="department">${DEPARTMENTS.map((d) => `<option ${p.department === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
      <label class="field">Year<select name="year">${[1, 2, 3, 4, 5].map((y) => `<option ${Number(p.year) === y ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
    </div>
    <div class="form-row">
      <label class="field">GitHub profile <small>(optional)</small><input name="github" placeholder="https://github.com/username" value="${esc(p.github_url || p.github || '')}"></label>
      <label class="field">LinkedIn profile <small>(optional)</small><input name="linkedin" placeholder="https://linkedin.com/in/your-name" value="${esc(p.linkedin_url || '')}"></label>
    </div>`;
}
function renderProfileSetup(p, token) {
  app.innerHTML = `<div class="head"><div><h1>Create your profile</h1><p class="muted">Signed in as ${esc(p.email || '')}. Choose your department and year so we can show the right subjects.</p></div></div>
    <form class="form card" id="ps" novalidate>${profileFields(p)}<p class="err" id="psErr"></p><div><button class="btn">Create profile</button></div></form>`;
  $('#ps').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    try {
      const r = await rpc('nn_auth_create_profile', { p_name: f.get('name'), p_department: f.get('department'), p_year: Number(f.get('year')), p_role: f.get('role'), p_github: f.get('github'), p_linkedin: f.get('linkedin') }, token);
      me = { id: r.id, name: r.name, department: r.department, year: r.year, role: r.role };
      store.set('nn_user', me); toast('Profile created'); location.hash = '#/';
    } catch (err) { $('#psErr').textContent = err.message; }
  };
}
async function renderProfile() {
  if (!me) return needSignIn('My profile');
  const [p] = await rpc('nn_get_profile', { p_id: me.id });
  app.innerHTML = `<div class="head"><div><h1>My profile</h1><p class="muted">${roleBadge(p.role)} ${esc(p.department)} · Year ${p.year}</p></div><a class="btn btn-quiet" href="#/signout">Sign out</a></div>
    <form class="form card" id="pf" novalidate>${profileFields(p)}<p class="err" id="pfErr"></p><div><button class="btn">Save profile</button></div></form>`;
  $('#pf').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    try {
      await rpc('nn_update_profile', { p_user: me.id, p_name: f.get('name'), p_department: f.get('department'), p_year: Number(f.get('year')), p_role: f.get('role'), p_github: f.get('github'), p_linkedin: f.get('linkedin') });
      me = { ...me, name: f.get('name').trim(), department: f.get('department'), year: Number(f.get('year')), role: me.role === 'moderator' ? 'moderator' : f.get('role') };
      store.set('nn_user', me); setNav('profile'); toast('Profile saved');
    } catch (err) { $('#pfErr').textContent = err.message; }
  };
}
function links(p) {
  return `${p.github_url ? `<a class="icon-link" href="${esc(p.github_url)}" target="_blank" rel="noopener" aria-label="GitHub">GitHub</a>` : ''}${p.linkedin_url ? `<a class="icon-link" href="${esc(p.linkedin_url)}" target="_blank" rel="noopener" aria-label="LinkedIn">LinkedIn</a>` : ''}`;
}

/* ---------- Notifications drawer ---------- */
async function refreshBell() {
  try {
    const n = await rpc('nn_notifications', { p_user: me.id });
    const tasks = await rpc('nn_list_assignments', { p_user: me.id });
    const due = tasks.filter((t) => !t.done && new Date(t.due_at) - Date.now() < 24 * 3600e3);
    const items = [...due.map((t) => ({ kind: t.overdue ? 'overdue' : 'deadline', text: t.overdue ? `Overdue: ${t.title}` : `Due soon: ${t.title}`, link: '#/timetable', at: t.due_at })), ...n];
    refreshBell.items = items;
    const c = $('#bellCount'); c.textContent = items.length; c.hidden = items.length === 0;
    if (!$('#drawer').hidden) drawDrawer();
  } catch { /* offline */ }
}
function drawDrawer() {
  const items = refreshBell.items || [];
  const icon = { connection: '🤝', message: '💬', upload: '📄', deadline: '⏰', overdue: '⚠️' };
  $('#drawerList').innerHTML = items.length ? items.map((i) => `<a class="note-item" href="${i.link}"><span>${icon[i.kind] || '🔔'}</span><span><b>${esc(i.text)}</b><br><span class="muted small">${i.at ? fmtDateTime(i.at) : ''}</span></span></a>`).join('')
    : '<p class="muted">You are all caught up 🎉</p>';
}
function toggleDrawer(force) {
  const d = $('#drawer'); const open = force ?? d.hidden; d.hidden = !open;
  if (open) drawDrawer();
}
$('#drawerClose').onclick = () => toggleDrawer(false);
$('#drawerList').onclick = (e) => { if (e.target.closest('a')) toggleDrawer(false); };
setInterval(() => me && refreshBell(), 20000);

function renderLanding() {
  app.innerHTML = `
    <section class="landing">
      <img src="assets/logo-wordmark.png" alt="NoteNinja" width="420" height="126" class="land-logo">
      <h1>Notes from seniors.<br><span>Reminders that keep you on time.</span></h1>
      <p class="muted">NoteNinja is one campus dashboard for Rathinam students: find verified notes, previous question papers and tips from seniors, and never miss a class, lab or assignment deadline.</p>
      <div class="actions" style="justify-content:center"><a class="btn" href="#/signin">Get started — sign in</a><a class="btn btn-quiet" href="#/notes">Browse resources</a></div>
    </section>
    <div class="grid land-feats">
      <div class="card"><h3>📚 Verified resources</h3><p class="muted">Seniors upload notes, papers and tips. A moderator checks each one before juniors see it.</p></div>
      <div class="card"><h3>🔍 Find in seconds</h3><p class="muted">Search and filter by department, semester, subject and type. Sort by top rated.</p></div>
      <div class="card"><h3>⏰ Smart timetable</h3><p class="muted">Classes, labs and deadlines in one place, with clash checks and reminders sent once.</p></div>
      <div class="card"><h3>💬 Communities & chat</h3><p class="muted">Subject rooms by semester, LinkedIn-style connections and personal chats.</p></div>
      <div class="card"><h3>⭐ Ratings & history</h3><p class="muted">Stars, likes and reviews show which resources really help.</p></div>
      <div class="card"><h3>🥷 Ask Ninja</h3><p class="muted">Your assistant makes a study plan from your timetable and finds the right notes.</p></div>
    </div>`;
}

/* ---------- Dashboard: both challenges in one place ---------- */
async function renderDashboard() {
  const greeting = me ? `Hi ${esc(me.name.split(' (')[0])} 👋` : 'Welcome to NoteNinja';
  const [latest, slots, tasks] = await Promise.all([
    rpc('nn_search_resources', { p_sort: 'newest' }),
    me ? rpc('nn_list_slots', { p_user: me.id }) : [],
    me ? rpc('nn_list_assignments', { p_user: me.id }) : [],
  ]);
  const today = isoDay(new Date());
  const todays = slots.filter((s) => s.day === today);
  const nowMin = minutesNow();
  const pending = tasks.filter((t) => !t.done);
  app.innerHTML = `
    <section class="hero">
      <div><h1>${greeting}</h1><p>Notes, previous papers and tips from your seniors, plus your timetable and deadline reminders, in one dashboard.</p></div>
      <div class="actions"><a class="btn" href="#/notes">Find resources</a><a class="btn btn-quiet" href="#/upload">Share notes</a><a class="btn btn-quiet" href="#/timetable">My timetable</a></div>
    </section>
    ${me ? '' : '<div class="alert alert-info" style="margin-bottom:18px">Sign in to see your timetable and reminders. <a href="#/signin">Sign in</a></div>'}
    <div class="detail">
      <section class="card">
        <div class="list-row"><h2>Today · ${DAYS[today]}</h2><a href="#/timetable" class="small">Full timetable</a></div>
        ${!me ? '<p class="muted">Sign in to see your classes.</p>' : todays.length === 0 ? '<p class="muted">No classes or labs today. 🎉</p>'
          : `<div class="list">${todays.map((s) => {
            const st = toMin(s.start_time), en = toMin(s.end_time);
            const state = nowMin >= en ? '<span class="badge b-type" style="opacity:.6">Done</span>' : nowMin >= st ? '<span class="badge b-verified">● Now</span>'
              : st - nowMin <= 15 ? `<span class="badge b-pending">In ${st - nowMin} min</span>` : '';
            return `<div class="list-row"><div><b>${esc(s.title)}</b> <span class="muted small">${s.kind === 'lab' ? '🧪 Lab' : '📘 Class'} · ${esc(s.venue || '')}</span></div><div class="row-badges"><span class="muted small">${s.start_time}–${s.end_time}</span>${state}</div></div>`;
          }).join('')}</div>`}
      </section>
      <section class="card">
        <div class="list-row"><h2>Deadlines</h2><a href="#/timetable" class="small">Manage</a></div>
        ${!me ? '<p class="muted">Sign in to track assignments.</p>' : pending.length === 0 ? '<p class="muted">No pending assignments.</p>'
          : `<div class="list">${pending.slice(0, 5).map((t) => `<div class="list-row"><div><b>${esc(t.title)}</b><br><span class="muted small">${esc(t.subject || '')}</span></div>${dueBadge(t)}</div>`).join('')}</div>`}
        ${me ? notifyButton() : ''}
      </section>
    </div>
    <section style="margin-top:22px">
      <div class="list-row" style="margin-bottom:12px"><h2>Latest from seniors</h2><a href="#/notes" class="small">Browse all</a></div>
      ${latest.length ? `<div class="grid">${latest.slice(0, 6).map(resCard).join('')}</div>` : empty('No resources yet', 'Be the first senior to share notes.', '<a class="btn" href="#/upload">Upload</a>')}
    </section>`;
  bindNotify();
}

function burst(el, emoji) {
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('span'); s.className = 'burst'; s.textContent = emoji;
    s.style.left = `${r.left + r.width / 2 + (Math.random() * 60 - 30)}px`; s.style.top = `${r.top + window.scrollY}px`;
    s.style.animationDelay = `${i * 60}ms`; document.body.appendChild(s); setTimeout(() => s.remove(), 1400);
  }
}

/* ---------- Challenge 1: catalogue ---------- */
function resCard(r) {
  return `<a class="card res-card" href="#/resource/${r.id}">
    <div class="row-badges"><span class="badge b-type">${TYPES[r.type]}</span>${statusBadge(r.status)}</div>
    <h3>${esc(r.title)}</h3>
    <p>${esc(r.description || '')}</p>
    <div class="meta"><span>${esc(r.subject_code)} · ${esc(r.subject_name)}</span><span>Sem ${r.semester}</span><span>${esc(r.department)}</span></div>
    <div class="meta"><span>By ${esc(r.uploader_name)}</span><span>${fmtDate(r.created_at)}</span></div>
    <div class="stats"><span class="stars" aria-label="${r.avg_stars || 0} out of 5">${starText(r.avg_stars)}</span><span>${r.avg_stars ?? '–'} (${r.review_count})</span><span>👍 ${r.likes}</span><span>👎 ${r.dislikes}</span></div>
  </a>`;
}
let subjectsCache = null;
async function subjects() { if (!subjectsCache) subjectsCache = await rpc('nn_list_subjects'); return subjectsCache; }

async function renderCatalogue() {
  const subs = await subjects();
  const depts = [...new Set(subs.map((s) => s.department))];
  app.innerHTML = `
    <div class="head"><div><h1>Resources</h1><p class="muted">Only moderator-approved resources appear here.</p></div><a class="btn" href="#/upload">+ Share a resource</a></div>
    <form class="filters" id="filters" role="search">
      <input class="search" name="q" placeholder="Search title, subject or code…" aria-label="Search">
      <select name="department" aria-label="Department"><option value="">All departments</option>${depts.map((d) => `<option>${esc(d)}</option>`).join('')}</select>
      <select name="semester" aria-label="Semester"><option value="">All semesters</option>${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}">Semester ${n}</option>`).join('')}</select>
      <select name="subject" aria-label="Subject"><option value="">All subjects</option>${subs.map((s) => `<option value="${s.id}">${esc(s.code)} · ${esc(s.name)}</option>`).join('')}</select>
      <select name="type" aria-label="Type"><option value="">All types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select name="sort" aria-label="Sort"><option value="newest">Newest</option><option value="top">Top rated</option></select>
    </form>
    <div id="results"><p class="muted">Loading…</p></div>`;
  const form = $('#filters');
  const run = async () => {
    const f = new FormData(form);
    try {
      const rows = await rpc('nn_search_resources', {
        p_q: f.get('q') || null, p_department: f.get('department') || null,
        p_semester: f.get('semester') ? Number(f.get('semester')) : null,
        p_subject: f.get('subject') ? Number(f.get('subject')) : null, p_type: f.get('type') || null, p_sort: f.get('sort'),
      });
      $('#results').innerHTML = rows.length
        ? `<p class="muted small">${rows.length} resource${rows.length > 1 ? 's' : ''} found</p><div class="grid">${rows.map(resCard).join('')}</div>`
        : empty('No resources found', 'Try another subject, semester or search word.', '<a class="btn btn-quiet" href="#/upload">Share one yourself</a>');
    } catch (e) { $('#results').innerHTML = errorBox(e); }
  };
  let t; form.oninput = () => { clearTimeout(t); t = setTimeout(run, 250); };
  form.onsubmit = (e) => { e.preventDefault(); run(); };
  run();
}

/* ---------- Challenge 1: upload ---------- */
async function renderUpload() {
  if (!me) return needSignIn('Share a resource');
  const subs = await subjects();
  app.innerHTML = `
    <div class="head"><div><h1>Share a resource</h1><p class="muted">New uploads stay "Pending" until a moderator verifies them.</p></div></div>
    <form class="form card" id="up" novalidate>
      <label class="field">Title<input name="title" maxlength="120" placeholder="e.g. Data Structures Unit 2 notes"></label>
      <label class="field">Description <small>(optional)</small><textarea name="description" maxlength="1000" placeholder="What does it cover? Any exam tips?"></textarea></label>
      <div class="form-row">
        <label class="field">Type<select name="type"><option value="">Choose type</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label class="field">Subject<select name="subject"><option value="">Choose subject</option>${subs.map((s) => `<option value="${s.id}">Sem ${s.semester} · ${esc(s.code)} · ${esc(s.name)}</option>`).join('')}</select></label>
      </div>
      <label class="field">File <small>PDF, DOCX, PPTX, PNG or JPG · max 10 MB</small><input name="file" type="file" accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg"></label>
      <div id="upMsg"></div>
      <div><button class="btn" id="upBtn">Upload</button></div>
    </form>`;
  $('#up').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target); const file = f.get('file'); const msg = $('#upMsg'); const btn = $('#upBtn');
    const fail = (m) => { msg.innerHTML = `<div class="alert alert-err">${esc(m)}</div>`; };
    // quick checks in the browser; the database checks everything again
    if (!f.get('title').trim()) return fail('Title is required (at least 3 characters)');
    if (!f.get('type')) return fail('Choose a resource type: notes, previous paper or tips');
    if (!f.get('subject')) return fail('Choose a subject');
    if (!file || !file.name) return fail('Choose a file to upload');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED.includes(ext)) return fail(`File type .${ext} is not allowed. Use PDF, DOCX, PPTX, PNG or JPG`);
    if (file.size === 0) return fail('This file is empty');
    if (file.size > MAX_BYTES) return fail(`File is too large (${(file.size / 1048576).toFixed(1)} MB). Maximum size is 10 MB`);
    btn.disabled = true; btn.textContent = 'Uploading…'; msg.innerHTML = '';
    let created;
    try {
      created = await rpc('nn_create_resource', {
        p_uploader: me.id, p_title: f.get('title'), p_description: f.get('description'), p_type: f.get('type'),
        p_subject: Number(f.get('subject')), p_file_name: file.name, p_file_size: file.size, p_file_mime: file.type, p_file_hash: await sha256(file),
      });
      await uploadFile(created.file_path, file);
      msg.innerHTML = `<div class="alert alert-ok">✓ Uploaded. Status: <b>Pending review</b>. A moderator will verify it before juniors can see it. <a href="#/resource/${created.id}">View it</a></div>`;
      e.target.reset(); toast('Upload received, pending review');
    } catch (err) {
      if (created) { try { await rpc('nn_cancel_upload', { p_uploader: me.id, p_id: created.id }); } catch { /* ignore */ } }
      fail(err.message);
    } finally { btn.disabled = false; btn.textContent = 'Upload'; }
  };
}

/* ---------- Challenge 1: details, reviews, bookmark, report ---------- */
async function renderResource(id) {
  let r;
  try { r = await rpc('nn_get_resource', { p_viewer: me ? me.id : null, p_id: id }); }
  catch (e) { app.innerHTML = empty('Resource not found', 'It may have been removed, or it is still waiting for review.', '<a class="btn" href="#/notes">Back to resources</a>'); return; }
  const mine = me && me.id === r.uploader_id;
  const my = r.my_review || {};
  app.innerHTML = `
    <p class="small"><a href="#/notes">← All resources</a></p>
    <div class="detail">
      <section class="card">
        <div class="row-badges"><span class="badge b-type">${TYPES[r.type]}</span>${statusBadge(r.status)}</div>
        <h1 style="margin-top:10px">${esc(r.title)}</h1>
        <p class="muted">${esc(r.description || 'No description.')}</p>
        <dl class="kv">
          <dt>Subject</dt><dd>${esc(r.subject.code)} · ${esc(r.subject.name)}</dd>
          <dt>Semester</dt><dd>${r.subject.semester} · ${esc(r.subject.department)}</dd>
          <dt>Uploaded by</dt><dd>${esc(r.uploader_name)} ${roleBadge(r.uploader_role)}</dd>
          <dt>Uploaded on</dt><dd>${fmtDate(r.created_at)}</dd>
          <dt>File</dt><dd>${esc(r.file_name || '')}${r.file_size ? ` · ${(r.file_size / 1024).toFixed(0)} KB` : ''}</dd>
          <dt>Rating</dt><dd><span class="stars">${starText(r.avg_stars)}</span> ${r.avg_stars ?? '–'} (${r.review_count} reviews) · 👍 ${r.likes} · 👎 ${r.dislikes}</dd>
        </dl>
        <div class="actions">
          <button class="btn" id="dl">⬇ Download / preview</button>
          ${me ? `<button class="btn btn-quiet" id="bm">${r.bookmarked ? '★ Bookmarked' : '☆ Bookmark'}</button>` : ''}
          ${me ? '<button class="btn btn-quiet" id="rp">⚑ Report</button>' : ''}
          ${mine ? '<button class="btn btn-danger" id="del">Delete</button>' : ''}
        </div>
        <div id="rpBox"></div>
        <div id="preview"></div>
        <h2 style="margin-top:22px">History</h2>
        <ul class="timeline" id="hist"><li class="muted">Loading…</li></ul>
      </section>
      <section class="card">
        <h2>Rate this resource</h2>
        ${r.status !== 'approved' ? '<p class="muted">Reviews open after a moderator approves it.</p>'
          : !me ? '<p class="muted"><a href="#/signin">Sign in</a> to rate and review.</p>'
          : mine ? '<p class="muted">You cannot review your own upload.</p>'
          : `<form id="fb" class="form" novalidate>
              <div class="star-pick" role="radiogroup" aria-label="Stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-s="${n}" class="${n <= (my.stars || 0) ? 'on' : ''}" aria-label="${n} stars">★</button>`).join('')}</div>
              <div class="actions"><button type="button" class="btn btn-quiet btn-sm ${my.vote === 'like' ? 'on' : ''}" data-v="like">👍 Like</button><button type="button" class="btn btn-quiet btn-sm ${my.vote === 'dislike' ? 'on' : ''}" data-v="dislike">👎 Dislike</button></div>
              <textarea name="comment" maxlength="300" placeholder="Was it useful? (optional)">${esc(my.comment || '')}</textarea>
              <p class="err" id="fbErr"></p>
              <div><button class="btn">${my.stars ? 'Update review' : 'Submit review'}</button></div>
            </form>`}
        <h2 style="margin-top:20px">Reviews</h2>
        ${r.reviews.length ? r.reviews.map((v) => `<div class="review"><div class="list-row"><b>${esc(v.user_name)}</b><span class="stars">${starText(v.stars)}</span></div>
          ${v.vote ? `<span class="small muted">${v.vote === 'like' ? '👍 Liked' : '👎 Disliked'}</span>` : ''}${v.comment ? `<p style="margin:4px 0 0">${esc(v.comment)}</p>` : ''}</div>`).join('')
          : '<p class="muted">No reviews yet.</p>'}
      </section>
    </div>`;
  rpc('nn_resource_history', { p_id: r.id }).then((h) => {
    const box = $('#hist'); if (box) box.innerHTML = h.map((x) => `<li><b>${esc(x.event)}</b> · ${esc(x.by_name)} <span class="muted small">${fmtDateTime(x.at)}</span></li>`).join('');
  }).catch(() => {});
  const hist = (store.get('nn_history') || []).filter((x) => x.id !== r.id);
  hist.unshift({ id: r.id, title: r.title, type: r.type, at: new Date().toISOString() }); store.set('nn_history', hist.slice(0, 20));
  const fileUrl = async () => (r.file_url ? r.file_url : await signedUrl(r.file_path));
  $('#dl').onclick = async () => { try { window.open(await fileUrl(), '_blank', 'noopener'); } catch (e) { toast(e.message, true); } };
  (async () => {
    try {
      const u = await fileUrl(); const n = (r.file_name || '').toLowerCase();
      if (n.endsWith('.pdf')) $('#preview').innerHTML = `<h2 style="margin-top:22px">Preview</h2><iframe class="pdf-view" src="${esc(u)}" title="Preview of ${esc(r.title)}"></iframe>`;
      else if (/\.(png|jpe?g)$/.test(n)) $('#preview').innerHTML = `<h2 style="margin-top:22px">Preview</h2><img class="img-view" src="${esc(u)}" alt="${esc(r.title)}">`;
    } catch { /* no preview */ }
  })();
  if ($('#bm')) $('#bm').onclick = async () => {
    try { const on = await rpc('nn_bookmark', { p_user: me.id, p_resource: r.id }); $('#bm').textContent = on ? '★ Bookmarked' : '☆ Bookmark'; toast(on ? 'Saved to bookmarks' : 'Removed from bookmarks'); }
    catch (e) { toast(e.message, true); }
  };
  if ($('#rp')) $('#rp').onclick = () => {
    $('#rpBox').innerHTML = `<form id="rpf" class="form" style="margin-top:14px" novalidate><label class="field">What is wrong?<textarea name="reason" maxlength="300" placeholder="e.g. wrong subject, unreadable, copied material"></textarea></label><p class="err" id="rpErr"></p><div><button class="btn btn-danger">Send report</button></div></form>`;
    $('#rpf').onsubmit = async (e) => {
      e.preventDefault();
      try { await rpc('nn_report', { p_user: me.id, p_resource: r.id, p_reason: new FormData(e.target).get('reason') }); $('#rpBox').innerHTML = '<div class="alert alert-ok" style="margin-top:14px">Report sent to the moderators. Thank you.</div>'; }
      catch (err) { $('#rpErr').textContent = err.message; }
    };
  };
  if ($('#del')) $('#del').onclick = async () => {
    try { await rpc('nn_delete_resource', { p_user: me.id, p_id: r.id }); toast('Deleted'); location.hash = '#/my'; } catch (e) { toast(e.message, true); }
  };
  const fb = $('#fb');
  if (fb) {
    let stars = my.stars || 0; let vote = my.vote || null;
    fb.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { stars = Number(b.dataset.s); fb.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', Number(x.dataset.s) <= stars)); }));
    fb.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => {
      vote = vote === b.dataset.v ? null : b.dataset.v;
      fb.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x.dataset.v === vote));
      if (vote) burst(b, b.dataset.v === 'like' ? '👍' : '👎');
    }));
    fb.onsubmit = async (e) => {
      e.preventDefault();
      if (!stars) { $('#fbErr').textContent = 'Choose a rating from 1 to 5 stars'; return; }
      try { await rpc('nn_submit_feedback', { p_user: me.id, p_resource: r.id, p_stars: stars, p_vote: vote, p_comment: new FormData(fb).get('comment') }); toast('Thanks for your review'); renderResource(id); }
      catch (err) { $('#fbErr').textContent = err.message; }
    };
  }
}

async function renderMy() {
  if (!me) return needSignIn('My uploads');
  const [ups, bms] = await Promise.all([rpc('nn_my_uploads', { p_user: me.id }), rpc('nn_my_bookmarks', { p_user: me.id })]);
  app.innerHTML = `
    <div class="head"><h1>My uploads</h1><a class="btn" href="#/upload">+ Upload</a></div>
    ${ups.length ? `<div class="list">${ups.map((u) => `<a class="card list-row" href="#/resource/${u.id}" style="color:var(--text)"><div><b>${esc(u.title)}</b><br><span class="muted small">${TYPES[u.type]} · ${esc(u.subject_name)} · ${fmtDate(u.created_at)}</span></div>${statusBadge(u.status)}</a>`).join('')}</div>`
      : empty('No uploads yet', 'Share your notes or previous papers to help juniors.')}
    <h2 style="margin-top:28px">Recently viewed</h2>
    ${(store.get('nn_history') || []).length ? `<div class="list">${store.get('nn_history').map((h) => `<a class="card list-row" href="#/resource/${h.id}" style="color:var(--text)"><b>${esc(h.title)}</b><span class="muted small">${TYPES[h.type]} · viewed ${fmtDateTime(h.at)}</span></a>`).join('')}</div>` : '<p class="muted">Resources you open will appear here.</p>'}
    <h2 style="margin-top:28px">Bookmarks</h2>
    ${bms.length ? `<div class="list">${bms.map((b) => `<a class="card list-row" href="#/resource/${b.id}" style="color:var(--text)"><b>${esc(b.title)}</b><span class="muted small">${TYPES[b.type]} · ${esc(b.subject_name)}</span></a>`).join('')}</div>`
      : '<p class="muted">Nothing bookmarked yet.</p>'}`;
}

async function renderModerate() {
  if (!me || me.role !== 'moderator') { app.innerHTML = empty('Moderators only', 'Sign in with the moderator demo account to review uploads.', '<a class="btn" href="#/signin">Sign in</a>'); return; }
  const [pend, reps] = await Promise.all([rpc('nn_pending', { p_moderator: me.id }), rpc('nn_list_reports', { p_moderator: me.id })]);
  app.innerHTML = `
    <div class="head"><div><h1>Moderation</h1><p class="muted">Approve resources before they appear in the catalogue.</p></div></div>
    <h2>Pending uploads (${pend.length})</h2>
    ${pend.length ? `<div class="list">${pend.map((p) => `<div class="card list-row"><div><a href="#/resource/${p.id}"><b>${esc(p.title)}</b></a><br><span class="muted small">${TYPES[p.type]} · ${esc(p.subject_name)} · by ${esc(p.uploader_name)} · ${esc(p.file_name || '')}</span></div>
      <div class="actions"><button class="btn btn-sm" data-ok="${p.id}">Approve</button><button class="btn btn-danger btn-sm" data-no="${p.id}">Reject</button></div></div>`).join('')}</div>`
      : '<p class="muted">Nothing waiting for review.</p>'}
    <h2 style="margin-top:28px">Reports</h2>
    ${reps.length ? `<div class="list">${reps.map((p) => `<div class="card list-row"><div><a href="#/resource/${p.resource_id}"><b>${esc(p.title)}</b></a><br><span class="small">${esc(p.reason)}</span><br><span class="muted small">by ${esc(p.reporter)} · ${fmtDate(p.created_at)}</span></div>
      ${p.status === 'open' ? `<button class="btn btn-quiet btn-sm" data-res="${p.id}">Mark resolved</button>` : '<span class="badge b-verified">Resolved</span>'}</div>`).join('')}</div>` : '<p class="muted">No reports.</p>'}`;
  const act = async (fn, args, msg) => { try { await rpc(fn, args); toast(msg); renderModerate(); } catch (e) { toast(e.message, true); } };
  app.querySelectorAll('[data-ok]').forEach((b) => (b.onclick = () => act('nn_review_resource', { p_moderator: me.id, p_id: b.dataset.ok, p_decision: 'approved' }, 'Approved — now visible to juniors')));
  app.querySelectorAll('[data-no]').forEach((b) => (b.onclick = () => act('nn_review_resource', { p_moderator: me.id, p_id: b.dataset.no, p_decision: 'rejected' }, 'Rejected')));
  app.querySelectorAll('[data-res]').forEach((b) => (b.onclick = () => act('nn_resolve_report', { p_moderator: me.id, p_report: b.dataset.res }, 'Report resolved')));
}

/* ---------- Challenge 2: timetable, assignments, reminders ---------- */
const isoDay = (d) => (d.getDay() === 0 ? 7 : d.getDay());
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const minutesNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
function dueBadge(t) {
  if (t.done) return '<span class="badge b-verified">✓ Done</span>';
  const ms = new Date(t.due_at) - Date.now();
  if (ms < 0) return `<span class="badge b-rejected">Overdue · ${fmtDateTime(t.due_at)}</span>`;
  if (ms < 24 * 3600e3) return `<span class="badge b-pending">Due in ${Math.max(1, Math.round(ms / 3600e3))} h</span>`;
  return `<span class="badge b-type">Due ${fmtDateTime(t.due_at)}</span>`;
}
function notifyButton() {
  if (!('Notification' in window)) return '<p class="muted small" style="margin-top:12px">Reminders show inside the app.</p>';
  return Notification.permission === 'granted' ? '<p class="small" style="margin-top:12px;color:var(--green-ink)">🔔 Browser reminders are on.</p>'
    : '<button class="btn btn-quiet btn-sm" id="notifyBtn" style="margin-top:12px">🔔 Turn on browser reminders</button>';
}
function bindNotify() {
  const b = $('#notifyBtn');
  if (b) b.onclick = async () => { await Notification.requestPermission(); router(); };
}

async function renderTimetable() {
  if (!me) return needSignIn('My timetable');
  const [slots, tasks] = await Promise.all([rpc('nn_list_slots', { p_user: me.id }), rpc('nn_list_assignments', { p_user: me.id })]);
  const today = isoDay(new Date());
  const overdue = tasks.filter((t) => t.overdue).length;
  app.innerHTML = `
    <div class="head"><div><h1>Timetable &amp; reminders</h1><p class="muted">You get a reminder 15 minutes before each class or lab, and 24 hours and 1 hour before each deadline. Each reminder is sent only once.</p></div>${notifyButton()}</div>
    ${overdue ? `<div class="alert alert-err" style="margin-bottom:16px">⚠ You have ${overdue} overdue assignment${overdue > 1 ? 's' : ''}.</div>` : ''}
    <div class="detail">
      <section class="card">
        <h2>Weekly timetable</h2>
        ${[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const list = slots.filter((s) => s.day === d);
          if (!list.length && d > 5) return '';
          return `<div style="margin-bottom:14px"><h3 style="${d === today ? 'color:var(--green-ink)' : ''}">${DAYS[d]}${d === today ? ' · Today' : ''}</h3>
            ${list.length ? list.map((s) => `<div class="list-row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${s.kind === 'lab' ? '🧪' : '📘'} <b>${esc(s.title)}</b> <span class="muted small">${esc(s.venue || '')}</span></span><span class="row-badges"><span class="muted small">${s.start_time}–${s.end_time}</span><button class="btn btn-quiet btn-sm" data-ds="${s.id}" aria-label="Remove">✕</button></span></div>`).join('') : '<p class="muted small">Free day</p>'}</div>`;
        }).join('')}
        <h3 style="margin-top:14px">Add class or lab</h3>
        <form id="slotF" class="form" novalidate>
          <div class="form-row"><label class="field">Subject<input name="title" maxlength="80" placeholder="e.g. Data Structures"></label>
          <label class="field">Type<select name="kind"><option value="class">Class</option><option value="lab">Lab</option></select></label></div>
          <div class="form-row"><label class="field">Day<select name="day">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}" ${d === today ? 'selected' : ''}>${DAYS[d]}</option>`).join('')}</select></label>
          <label class="field">Venue<input name="venue" maxlength="60" placeholder="e.g. Room 204"></label></div>
          <div class="form-row"><label class="field">Start<input name="start" type="time" required></label><label class="field">End<input name="end" type="time" required></label></div>
          <p class="err" id="slotErr"></p>
          <div><button class="btn">Add to timetable</button></div>
        </form>
      </section>
      <section class="card">
        <h2>Assignments</h2>
        ${tasks.length ? `<div class="list">${tasks.map((t) => `<div class="list-row" style="padding:6px 0;border-bottom:1px solid var(--line)">
          <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-done="${t.id}" ${t.done ? 'checked' : ''} style="width:auto;margin-top:5px"><span><b style="${t.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.title)}</b><br><span class="muted small">${esc(t.subject || '')}</span></span></label>
          <span class="row-badges">${dueBadge(t)}<button class="btn btn-quiet btn-sm" data-da="${t.id}" aria-label="Remove">✕</button></span></div>`).join('')}</div>` : '<p class="muted">No assignments yet.</p>'}
        <h3 style="margin-top:14px">Add assignment</h3>
        <form id="asF" class="form" novalidate>
          <label class="field">Title<input name="title" maxlength="120" placeholder="e.g. DS Assignment 3"></label>
          <label class="field">Subject<input name="subject" maxlength="80"></label>
          <div class="form-row"><label class="field">Due date<input name="date" type="date"></label><label class="field">Due time<input name="time" type="time" value="23:59"></label></div>
          <p class="err" id="asErr"></p>
          <div><button class="btn">Add assignment</button></div>
        </form>
      </section>
    </div>`;
  bindNotify();
  $('#slotF').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    if (!f.get('start') || !f.get('end')) { $('#slotErr').textContent = 'Enter a valid start and end time'; return; }
    try { await rpc('nn_add_slot', { p_user: me.id, p_kind: f.get('kind'), p_title: f.get('title'), p_venue: f.get('venue'), p_day: Number(f.get('day')), p_start: f.get('start'), p_end: f.get('end') }); toast('Added to timetable'); renderTimetable(); }
    catch (err) { $('#slotErr').textContent = err.message; }
  };
  $('#asF').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    if (!f.get('date') || !f.get('time')) { $('#asErr').textContent = 'Enter a valid due date and time'; return; }
    const due = new Date(`${f.get('date')}T${f.get('time')}`);
    if (isNaN(due)) { $('#asErr').textContent = 'Enter a valid due date and time'; return; }
    try { await rpc('nn_add_assignment', { p_user: me.id, p_title: f.get('title'), p_subject: f.get('subject'), p_due: due.toISOString() }); toast('Assignment added'); renderTimetable(); }
    catch (err) { $('#asErr').textContent = err.message; }
  };
  app.querySelectorAll('[data-ds]').forEach((b) => (b.onclick = async () => { try { await rpc('nn_delete_slot', { p_user: me.id, p_id: b.dataset.ds }); renderTimetable(); } catch (e) { toast(e.message, true); } }));
  app.querySelectorAll('[data-da]').forEach((b) => (b.onclick = async () => { try { await rpc('nn_delete_assignment', { p_user: me.id, p_id: b.dataset.da }); renderTimetable(); } catch (e) { toast(e.message, true); } }));
  app.querySelectorAll('[data-done]').forEach((c) => (c.onchange = async () => { try { await rpc('nn_set_assignment_done', { p_user: me.id, p_id: c.dataset.done, p_done: c.checked }); renderTimetable(); } catch (e) { toast(e.message, true); } }));
}

/* Reminder engine: checks every 30 s, fires each reminder once (no duplicates). */
const fired = new Set(store.get('nn_fired') || []);
function remind(key, text) {
  if (fired.has(key)) return;
  fired.add(key); store.set('nn_fired', [...fired].slice(-300));
  toast('🔔 ' + text);
  if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('NoteNinja reminder', { body: text, icon: 'assets/icon-192.png' }); } catch { /* ignore */ } }
}
async function checkReminders() {
  if (!me) return;
  try {
    const [slots, tasks] = await Promise.all([rpc('nn_list_slots', { p_user: me.id }), rpc('nn_list_assignments', { p_user: me.id })]);
    const d = new Date(); const day = isoDay(d); const now = minutesNow(); const dateKey = d.toISOString().slice(0, 10);
    slots.filter((s) => s.day === day).forEach((s) => {
      const diff = toMin(s.start_time) - now;
      if (diff >= 0 && diff <= 15) remind(`slot:${s.id}:${dateKey}`, `${s.kind === 'lab' ? 'Lab' : 'Class'} "${s.title}" starts at ${s.start_time}${s.venue ? ' in ' + s.venue : ''}`);
    });
    tasks.filter((t) => !t.done).forEach((t) => {
      const ms = new Date(t.due_at) - Date.now();
      if (ms > 0 && ms <= 3600e3) remind(`task1h:${t.id}`, `"${t.title}" is due within 1 hour`);
      else if (ms > 0 && ms <= 24 * 3600e3) remind(`task24h:${t.id}`, `"${t.title}" is due within 24 hours`);
    });
  } catch { /* offline: try again next time */ }
}
setInterval(checkReminders, 30000);

/* ---------- Community (subject rooms with teachers) ---------- */
async function renderCommunities() {
  const rows = await rpc('nn_communities', { p_user: me ? me.id : null });
  const sems = [...new Set(rows.map((c) => c.semester))].sort((a, b) => a - b);
  const topic = (n) => (/english/i.test(n) ? '🗣️' : /math|calculus|statistic|discrete|probab|numerical/i.test(n) ? '➗' : /physics|chem|electric|environment/i.test(n) ? '🔬' : '💻');
  app.innerHTML = `
    <div class="head"><div><h1>Subject communities</h1><p class="muted">One room per subject, arranged by semester. Ask doubts and share tips with seniors.</p></div></div>
    ${sems.map((sem) => `<section class="sem"><h2>Semester ${sem}</h2><div class="grid">${rows.filter((c) => c.semester === sem).map((c) => `<div class="card res-card">
      <div class="row-badges"><span class="badge b-type">${topic(c.name)} ${esc(c.code)}</span>${c.joined ? '<span class="badge b-verified">Joined</span>' : ''}</div><h3>${esc(c.name)}</h3>
      <div class="meta"><span>${esc(c.department)}</span><span>${c.members} member${c.members === 1 ? '' : 's'}</span></div>
      <div class="actions" style="margin-top:6px">${c.joined || (me && me.role === 'moderator') ? `<a class="btn btn-sm" href="#/community/${c.id}">Open room</a>` : `<button class="btn btn-sm" data-join="${c.id}">Join</button>`}</div></div>`).join('')}</div></section>`).join('')}`;
  app.querySelectorAll('[data-join]').forEach((b) => (b.onclick = async () => {
    if (!me) { location.hash = '#/signin'; return; }
    try { await rpc('nn_join_community', { p_user: me.id, p_subject: Number(b.dataset.join) }); location.hash = `#/community/${b.dataset.join}`; } catch (e) { toast(e.message, true); }
  }));
}
async function renderCommunityRoom(sid) {
  if (!me) return needSignIn('Community');
  const subs = await subjects(); const s = subs.find((x) => String(x.id) === sid);
  const teacher = me.role === 'moderator';
  app.innerHTML = `<p class="small"><a href="#/community">← All communities</a></p>
    <div class="card chat"><div class="list-row"><h2>${esc(s ? s.name : 'Community')}</h2><span class="muted small">${esc(s ? s.code : '')}</span></div>
    <div class="chat-log" id="log"><p class="muted">Loading…</p></div>
    <form class="chat-form" id="cf"><input name="body" maxlength="1000" placeholder="Ask a doubt or share a tip…" aria-label="Message"><button class="btn">Send</button></form><p class="err" id="cErr"></p></div>`;
  const load = async () => {
    try {
      const msgs = await rpc('nn_community_feed', { p_user: me.id, p_subject: Number(sid) });
      const log = $('#log'); if (!log) return;
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
      log.innerHTML = msgs.length ? msgs.map((m) => `<div class="msg ${m.pinned ? 'pinned' : ''} ${m.user_name === me.name ? 'mine' : ''}"><div class="who"><b>${esc(m.user_name)}</b>${roleBadge(m.user_role)}${m.pinned ? '<span>📌 Pinned</span>' : ''}<span>${fmtDateTime(m.created_at)}</span>
        ${teacher ? `<button class="btn btn-quiet btn-sm" data-pin="${m.id}" data-p="${!m.pinned}">${m.pinned ? 'Unpin' : 'Pin'}</button><button class="btn btn-quiet btn-sm" data-del="${m.id}">Delete</button>` : ''}</div><div class="body">${esc(m.body)}</div></div>`).join('')
        : '<p class="muted">No messages yet. Start the conversation!</p>';
      if (atBottom) log.scrollTop = log.scrollHeight;
      log.querySelectorAll('[data-pin]').forEach((b) => (b.onclick = async () => { await rpc('nn_pin_message', { p_user: me.id, p_message: b.dataset.pin, p_pinned: b.dataset.p === 'true' }); load(); }));
      log.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { await rpc('nn_delete_message', { p_user: me.id, p_message: b.dataset.del }); load(); }));
    } catch (e) { $('#log').innerHTML = errorBox(e); }
  };
  await load(); $('#log').scrollTop = $('#log').scrollHeight;
  pollTimer = setInterval(load, 4000);
  $('#cf').onsubmit = async (e) => {
    e.preventDefault(); const inp = e.target.body;
    try { await rpc('nn_post_community', { p_user: me.id, p_subject: Number(sid), p_body: inp.value }); inp.value = ''; $('#cErr').textContent = ''; await load(); $('#log').scrollTop = $('#log').scrollHeight; }
    catch (err) { $('#cErr').textContent = err.message; }
  };
}

/* ---------- People, connections and personal chats ---------- */
async function renderPeople() {
  if (!me) return needSignIn('People');
  app.innerHTML = `<div class="head"><div><h1>People</h1><p class="muted">Connect with seniors and classmates. You can chat only after they accept.</p></div></div>
    <input id="pq" placeholder="Search by name or department…" aria-label="Search people" style="margin-bottom:16px"><div id="plist"><p class="muted">Loading…</p></div>`;
  const load = async () => {
    const rows = await rpc('nn_people', { p_user: me.id, p_q: $('#pq').value || null });
    $('#plist').innerHTML = rows.length ? `<div class="list">${rows.map((p) => {
      let action;
      if (p.connection_status === 'accepted') action = `<a class="btn btn-sm" href="#/messages/${p.id}">Message</a>`;
      else if (p.connection_status === 'pending' && p.i_requested) action = '<span class="badge b-pending">Request sent</span>';
      else if (p.connection_status === 'pending') action = `<button class="btn btn-sm" data-acc="${p.connection_id}">Accept</button><button class="btn btn-quiet btn-sm" data-rej="${p.connection_id}">Reject</button>`;
      else if (p.connection_status === 'rejected') action = '<span class="muted small">Not connected</span>';
      else action = `<button class="btn btn-sm" data-con="${p.id}">Connect</button>`;
      return `<div class="card list-row"><div><b>${esc(p.name)}</b> ${roleBadge(p.role)}<br><span class="muted small">${esc(p.department)} · Year ${p.year}</span> ${links(p)}</div><div class="actions">${action}</div></div>`;
    }).join('')}</div>` : empty('No people found', 'Try another name.');
    const act = async (fn, args, msg) => { try { await rpc(fn, args); toast(msg); load(); } catch (e) { toast(e.message, true); } };
    $('#plist').querySelectorAll('[data-con]').forEach((b) => (b.onclick = () => act('nn_request_connection', { p_user: me.id, p_to: b.dataset.con }, 'Connection request sent')));
    $('#plist').querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => act('nn_respond_connection', { p_user: me.id, p_connection: b.dataset.acc, p_accept: true }, 'Connected! You can now chat')));
    $('#plist').querySelectorAll('[data-rej]').forEach((b) => (b.onclick = () => act('nn_respond_connection', { p_user: me.id, p_connection: b.dataset.rej, p_accept: false }, 'Request rejected')));
  };
  let t; $('#pq').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  load();
}
async function renderMessages() {
  if (!me) return needSignIn('Messages');
  const rows = (await rpc('nn_people', { p_user: me.id, p_q: null }));
  const conn = rows.filter((p) => p.connection_status === 'accepted');
  const incoming = rows.filter((p) => p.connection_status === 'pending' && !p.i_requested);
  app.innerHTML = `<div class="head"><div><h1>Messages</h1><p class="muted">Personal chats with your accepted connections.</p></div><a class="btn btn-quiet" href="#/people">Find people</a></div>
    ${incoming.length ? `<div class="alert alert-info" style="margin-bottom:14px">You have ${incoming.length} connection request${incoming.length > 1 ? 's' : ''}. <a href="#/people">Review</a></div>` : ''}
    ${conn.length ? `<div class="list">${conn.map((p) => `<a class="card list-row" href="#/messages/${p.id}" style="color:var(--text)"><div><b>${esc(p.name)}</b> ${roleBadge(p.role)}<br><span class="muted small">${esc(p.department)}</span></div><span class="btn btn-sm">Open chat</span></a>`).join('')}</div>`
      : empty('No connections yet', 'Connect with someone first, then chat here.', '<a class="btn" href="#/people">Find people</a>')}`;
}
async function renderChat(uid) {
  if (!me) return needSignIn('Messages');
  const people = await rpc('nn_people', { p_user: me.id, p_q: null });
  const other = people.find((p) => p.id === uid);
  const ok = other && other.connection_status === 'accepted';
  app.innerHTML = `<p class="small"><a href="#/messages">← Messages</a></p>
    <div class="card chat"><div class="list-row"><h2>${esc(other ? other.name : 'Chat')}</h2>${other ? roleBadge(other.role) : ''}</div>
    <div class="chat-log" id="log">${ok ? '<p class="muted">Loading…</p>' : ''}</div>
    ${ok ? '' : '<div class="alert alert-info">Connect first to send messages. <a href="#/people">Go to People</a></div>'}
    ${ok ? `<div class="emoji-bar" id="emo">${EMOJIS.map((e) => `<button type="button" aria-label="Add ${e}">${e}</button>`).join('')}</div>` : ''}
    <form class="chat-form" id="dm"><label class="btn btn-quiet attach" title="Attach image or PDF (max 5 MB)" aria-label="Attach file">📎<input type="file" id="dmFile" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp" hidden ${ok ? '' : 'disabled'}></label><input name="body" maxlength="1000" placeholder="${ok ? 'Type a message…' : 'Connect first to send messages'}" ${ok ? '' : 'disabled'} aria-label="Message"><button class="btn" ${ok ? '' : 'disabled'}>Send</button></form><p class="small muted" id="dmFileName"></p><p class="err" id="dErr"></p></div>`;
  if (!ok) return;
  const load = async () => {
    try {
      const msgs = await rpc('nn_get_dms', { p_user: me.id, p_with: uid });
      const log = $('#log'); if (!log) return;
      log.innerHTML = msgs.length ? msgs.map((m) => `<div class="msg ${m.mine ? 'mine' : ''}"><div class="who">${fmtDateTime(m.created_at)}</div>${m.body ? `<div class="body">${esc(m.body)}</div>` : ''}
        ${m.file_url ? (/\.(png|jpe?g|gif|webp)$/i.test(m.file_name || '') ? `<a href="${esc(m.file_url)}" target="_blank" rel="noopener"><img class="chat-img" src="${esc(m.file_url)}" alt="${esc(m.file_name)}"></a>` : `<a class="file-chip" href="${esc(m.file_url)}" target="_blank" rel="noopener">📄 ${esc(m.file_name)}</a>`) : ''}</div>`).join('') : '<p class="muted">Say hi 👋</p>';
      log.scrollTop = log.scrollHeight;
    } catch (e) { $('#log').innerHTML = errorBox(e); }
  };
  await load(); pollTimer = setInterval(load, 4000);
  let file = null;
  $('#emo').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const inp = $('#dm').body; inp.value += b.textContent; inp.focus(); };
  $('#dmFile').onchange = (e) => {
    file = e.target.files[0] || null; $('#dErr').textContent = '';
    if (file && file.size > 5 * 1024 * 1024) { $('#dErr').textContent = 'File is too large. Maximum 5 MB in chat'; file = null; }
    $('#dmFileName').textContent = file ? `📎 ${file.name}` : '';
  };
  $('#dm').onsubmit = async (e) => {
    e.preventDefault(); const inp = e.target.body;
    try {
      let url = null, name = null;
      if (file) {
        const path = `${me.id}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`;
        const res = await fetch(`${SB_URL}/storage/v1/object/nn-chat/${path}`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': file.type }, body: file });
        if (!res.ok) throw new Error('File upload failed. Use an image or PDF under 5 MB');
        url = `${SB_URL}/storage/v1/object/public/nn-chat/${path}`; name = file.name;
      }
      await rpc('nn_send_dm2', { p_user: me.id, p_to: uid, p_body: inp.value, p_file_url: url, p_file_name: name });
      inp.value = ''; file = null; $('#dmFile').value = ''; $('#dmFileName').textContent = ''; $('#dErr').textContent = ''; load();
    } catch (err) { $('#dErr').textContent = err.message; }
  };
}

window.NN = { me: () => me, rpc, TYPES, DAYS, isoDay };
router();
checkReminders();
