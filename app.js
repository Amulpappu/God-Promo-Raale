/* NoteNinja — Senior-to-Junior Knowledge Sharing + Smart Timetable & Reminders
   Plain JavaScript. All writes go through validated Postgres functions (Supabase RPC). */
const SB_URL = 'https://rnsokogscsyjyoupajgg.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc29rb2dzY3N5anlvdXBhamdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NDQ3ODMsImV4cCI6MjExMDMyMDc4M30.x8c7HqBjh6fv6MUk-4S_y6O-o_YMq-_4jnLE_w3XLlg';
const BUCKET = 'nn-resources';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['pdf', 'docx', 'pptx', 'png', 'jpg', 'jpeg'];
const TYPES = { notes: 'Notes', previous_paper: 'Previous paper', tips: 'Tips' };
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
async function rpc(fn, args = {}) {
  let res;
  try {
    res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
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
  $('#navUser').textContent = me ? `${me.name.split(' (')[0]} · Sign out` : 'Sign in';
  $('#navUser').href = me ? '#/signout' : '#/signin';
}
$('#menuBtn').onclick = () => { const n = $('#nav'); const open = n.classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', open); };

/* ---------- Router ---------- */
const routes = [
  [/^\/$/, 'home', renderDashboard],
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
  [/^\/signout$/, '', () => { me = null; store.del('nn_user'); toast('Signed out'); location.hash = '#/'; }],
];
async function router() {
  clearInterval(pollTimer);
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
    <div class="head"><div><h1>Sign in</h1><p class="muted">Demo environment: choose an account, or create your own.</p></div></div>
    <h2>Demo accounts</h2>
    <div class="users">${users.map((u) => `<button class="user-pick" data-id="${u.id}"><b>${esc(u.name)}</b><br><span class="muted small">${esc(u.role)} · ${esc(u.department)} · Year ${u.year}</span></button>`).join('')}</div>
    <h2 style="margin-top:28px">Create an account</h2>
    <form class="form card" id="newUser" novalidate>
      <div class="form-row">
        <label class="field">Full name<input name="name" required maxlength="60"></label>
        <label class="field">College email<input name="email" type="email" required></label>
      </div>
      <div class="form-row">
        <label class="field">Department<select name="department"><option>CSE</option><option>CSE (Cyber Security)</option><option>AI&DS</option><option>ECE</option><option>IT</option><option>MECH</option></select></label>
        <label class="field">Year<select name="year"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
      </div>
      <label class="field">I am a<select name="role"><option value="junior">Junior (I want resources)</option><option value="senior">Senior (I want to share)</option></select></label>
      <p class="err" id="nuErr"></p>
      <div><button class="btn">Create account</button></div>
    </form>`;
  app.querySelectorAll('.user-pick').forEach((b) => (b.onclick = () => {
    me = users.find((u) => u.id === b.dataset.id); store.set('nn_user', me);
    toast(`Signed in as ${me.name}`); location.hash = '#/';
  }));
  $('#newUser').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const id = await rpc('nn_create_user', { p_name: f.get('name'), p_email: f.get('email'), p_department: f.get('department'), p_year: Number(f.get('year')), p_role: f.get('role') });
      me = { id, name: f.get('name').trim(), department: f.get('department'), year: Number(f.get('year')), role: f.get('role') };
      store.set('nn_user', me); toast('Account created'); location.hash = '#/';
    } catch (err) { $('#nuErr').textContent = err.message; }
  };
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
  $('#dl').onclick = async () => {
    try {
      const url = r.file_url ? r.file_url : await signedUrl(r.file_path);
      window.open(url, '_blank', 'noopener');
    } catch (e) { toast(e.message, true); }
  };
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
    fb.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { vote = vote === b.dataset.v ? null : b.dataset.v; fb.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x.dataset.v === vote)); }));
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
  if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('NoteNinja reminder', { body: text, icon: 'favicon.svg' }); } catch { /* ignore */ } }
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
  app.innerHTML = `
    <div class="head"><div><h1>Subject communities</h1><p class="muted">Ask doubts in each subject's room. Teachers can pin important messages.</p></div></div>
    <div class="grid">${rows.map((c) => `<div class="card res-card"><span class="badge b-type">Semester ${c.semester}</span><h3>${esc(c.name)}</h3>
      <div class="meta"><span>${esc(c.code)}</span><span>${esc(c.department)}</span><span>${c.members} members</span></div>
      <div class="actions" style="margin-top:6px">${c.joined || (me && ['teacher', 'moderator'].includes(me.role)) ? `<a class="btn btn-sm" href="#/community/${c.id}">Open room</a>` : `<button class="btn btn-sm" data-join="${c.id}">Join</button>`}</div></div>`).join('')}</div>`;
  app.querySelectorAll('[data-join]').forEach((b) => (b.onclick = async () => {
    if (!me) { location.hash = '#/signin'; return; }
    try { await rpc('nn_join_community', { p_user: me.id, p_subject: Number(b.dataset.join) }); location.hash = `#/community/${b.dataset.join}`; } catch (e) { toast(e.message, true); }
  }));
}
async function renderCommunityRoom(sid) {
  if (!me) return needSignIn('Community');
  const subs = await subjects(); const s = subs.find((x) => String(x.id) === sid);
  const teacher = ['teacher', 'moderator'].includes(me.role);
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
      return `<div class="card list-row"><div><b>${esc(p.name)}</b> ${roleBadge(p.role)}<br><span class="muted small">${esc(p.department)} · Year ${p.year}</span></div><div class="actions">${action}</div></div>`;
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
    <form class="chat-form" id="dm"><input name="body" maxlength="1000" placeholder="${ok ? 'Type a message…' : 'Connect first to send messages'}" ${ok ? '' : 'disabled'} aria-label="Message"><button class="btn" ${ok ? '' : 'disabled'}>Send</button></form><p class="err" id="dErr"></p></div>`;
  if (!ok) return;
  const load = async () => {
    try {
      const msgs = await rpc('nn_get_dms', { p_user: me.id, p_with: uid });
      const log = $('#log'); if (!log) return;
      log.innerHTML = msgs.length ? msgs.map((m) => `<div class="msg ${m.mine ? 'mine' : ''}"><div class="who">${fmtDateTime(m.created_at)}</div><div class="body">${esc(m.body)}</div></div>`).join('') : '<p class="muted">Say hi 👋</p>';
      log.scrollTop = log.scrollHeight;
    } catch (e) { $('#log').innerHTML = errorBox(e); }
  };
  await load(); pollTimer = setInterval(load, 4000);
  $('#dm').onsubmit = async (e) => {
    e.preventDefault(); const inp = e.target.body;
    try { await rpc('nn_send_dm', { p_user: me.id, p_to: uid, p_body: inp.value }); inp.value = ''; $('#dErr').textContent = ''; load(); }
    catch (err) { $('#dErr').textContent = err.message; }
  };
}

router();
checkReminders();
