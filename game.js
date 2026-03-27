// ── CLIENT SUPABASE ───────────────────────────────────
const sb = {
  async insert(table, rows){
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method:'POST',
      headers:{
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(Array.isArray(rows)?rows:[rows])
    });
    if(!r.ok){ const e=await r.text(); console.error('sb.insert error',r.status,e); return null; }
    return r.json();
  },
  async update(table, id, data){
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method:'PATCH',
      headers:{
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    });
    return r.ok;
  },
  async delete(table, id){
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method:'DELETE',
      headers:{
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    return r.ok;
  },
  async select(table, filter=''){
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${filter}`, {
      headers:{
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if(!r.ok){ console.error('sb.select error',r.status); return null; }
    return r.json();
  }
};

// ── LOGIN ──────────────────────────────────────────────
let currentAlumne = '';
let currentUserObj = null; // objecte complet {id, nom_complet, alias, rol}

async function doLogin(){
  const input = document.getElementById('login-input');
  const alias = input.value.trim().toLowerCase();
  if(alias.length < 2){
    document.getElementById('login-error').textContent = 'Escriu el teu àlies (mínim 2 caràcters)';
    input.focus(); return;
  }
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Verificant…';

  // Cerca l'usuari a la taula usuaris
  const data = await sb.select('usuaris', `&alias=eq.${encodeURIComponent(alias)}&actiu=eq.true`);
  btn.disabled = false;
  btn.textContent = 'Entrar al joc →';

  if(!data || data.length === 0){
    document.getElementById('login-error').textContent = '❌ Àlies no reconegut. Consulta el professor.';
    input.focus(); return;
  }

  const user = data[0];
  if(user.rol === 'profe'){
    document.getElementById('login-error').textContent = '👩‍🏫 Ets professor/a. Usa el botó "Profe" per accedir al tauler.';
    return;
  }

  currentAlumne = user.alias;
  currentUserObj = user;
  try{ localStorage.setItem('fl_alias', user.alias); }catch(e){}
  document.getElementById('login-error').textContent = '';
  updateNavAlumne();
  showScreen('home');
  setNav('inici');
}

function updateNavAlumne(){
  const actions = document.getElementById('nav-actions');
  const nom = currentUserObj ? currentUserObj.nom_complet : currentAlumne;
  actions.innerHTML = `
    <div class="login-alumne-pill">
      👤 ${escHtml(nom)}
      <button onclick="logOut()" title="Canviar usuari">✕</button>
    </div>
    <button class="nav-btn active" id="nav-inici" onclick="goHome()">🏠 Inici</button>
    <button class="nav-btn" id="nav-progress" onclick="goProgress()">📊 Progrés</button>`;
}

function logOut(){
  currentAlumne = '';
  currentUserObj = null;
  try{ localStorage.removeItem('fl_alias'); }catch(e){}
  const actions = document.getElementById('nav-actions');
  actions.innerHTML = `
    <button class="nav-btn active" id="nav-inici" onclick="goHome()">🏠 Inici</button>
    <button class="nav-btn" id="nav-progress" onclick="goProgress()">📊 Progrés</button>`;
  showScreen('login');
}

// ── TOAST ──────────────────────────────────────────────
function showToast(msg, type='ok', ms=2800){
  const t = document.getElementById('saving-toast');
  t.textContent = msg;
  t.className = `saving-toast show ${type}`;
  setTimeout(()=>{ t.className='saving-toast'; }, ms);
}

// ── GUARDAR PUNTUACIÓ ─────────────────────────────────
async function saveScore(jocIdx, jocNom, nivell, punts, puntsMax, pctEncert){
  if(!currentAlumne) return;
  const row = {
    alumne: currentUserObj ? currentUserObj.nom_complet : currentAlumne,
    user_alias: currentAlumne,
    joc_idx: jocIdx,
    joc_nom: jocNom,
    nivell,
    punts,
    punts_max: puntsMax,
    pct_encert: pctEncert
  };
  showToast('💾 Guardant…', 'ok', 99999);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/puntuacions`, {
      method:'POST',
      headers:{
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });
    if(r.ok) showToast('✅ Puntuació guardada!', 'ok');
    else { const e=await r.text(); console.error('saveScore error',r.status,e); showToast('⚠️ Error guardant: '+r.status, 'err', 5000); }
  } catch(e) {
    console.error('saveScore fetch error',e);
    showToast('⚠️ Error de xarxa', 'err', 5000);
  }
}

// ══════════════════════════════════════════════════════
// ── TAULER DEL PROFESSOR ──────────────────────────────
// ══════════════════════════════════════════════════════
let teacherAllData = [];
let teacherUsuaris = [];
let teacherView = 'ranking'; // 'ranking' | 'alumne' | 'historial' | 'usuaris'
let teacherSelectedAlias = null;

function goTeacher(){ showScreen('teacher-login'); }

function doTeacherLogin(){
  const pwd = document.getElementById('teacher-pwd-input').value;
  if(pwd === TEACHER_PASSWORD){
    document.getElementById('teacher-pwd-error').textContent = '';
    document.getElementById('teacher-pwd-input').value = '';
    showScreen('teacher');
    loadTeacherAll();
  } else {
    document.getElementById('teacher-pwd-error').textContent = 'Contrasenya incorrecta';
  }
}

async function loadTeacherAll(){
  showTeacherLoading();
  const [partides, usuaris] = await Promise.all([
    sb.select('puntuacions','&order=creat_at.desc&limit=1000'),
    sb.select('usuaris','&order=nom_complet.asc')
  ]);
  teacherAllData = partides || [];
  teacherUsuaris = usuaris || [];
  if(teacherView === 'ranking') renderRanking();
  else if(teacherView === 'historial') renderHistorial(teacherAllData);
  else if(teacherView === 'usuaris') renderGestioUsuaris();
  updateTeacherGlobalStats();
}

function showTeacherLoading(){
  document.getElementById('teacher-main-content').innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--text-muted)">⏳ Carregant…</div>';
}

// ── STATS GLOBALS ──
function updateTeacherGlobalStats(){
  const alumnes = teacherUsuaris.filter(u=>u.rol==='alumne' && u.actiu);
  document.getElementById('t-stat-alumnes').textContent = alumnes.length;
  document.getElementById('t-stat-partides').textContent = teacherAllData.length;
  const pcts = teacherAllData.map(r=>r.pct_encert).filter(Boolean);
  document.getElementById('t-stat-pct').textContent = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length)+'%' : '—';
}

// ── VISTA: RÀNQUING D'ALUMNES ──
function renderRanking(){
  teacherView = 'ranking';
  setTeacherTab('tab-ranking');
  // Per cada alumne, calcula: suma de millors puntuacions per joc
  const alumnes = teacherUsuaris.filter(u=>u.rol==='alumne' && u.actiu);
  const rows = alumnes.map(u=>{
    const partides = teacherAllData.filter(p=>p.user_alias===u.alias || p.alumne===u.nom_complet);
    // Millor puntuació per cada joc (joc_idx)
    const bestPerJoc = {};
    partides.forEach(p=>{
      const k = p.joc_idx;
      if(bestPerJoc[k]===undefined || p.punts > bestPerJoc[k]) bestPerJoc[k]=p.punts;
    });
    const total = Object.values(bestPerJoc).reduce((a,b)=>a+b,0);
    const pcts = partides.map(p=>p.pct_encert).filter(Boolean);
    const pctMig = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length) : null;
    const ultima = partides[0] ? new Date(partides[0].creat_at) : null;
    return { u, total, jocsDistints: Object.keys(bestPerJoc).length, pctMig, ultima, partides: partides.length };
  }).sort((a,b)=>b.total-a.total);

  const html = `
    <table class="teacher-table">
      <thead><tr>
        <th>#</th><th>Alumne</th><th>Àlies</th>
        <th>Puntuació total</th><th>Jocs jugats</th>
        <th>% Encert mig</th><th>Darrera activitat</th>
      </tr></thead>
      <tbody>
        ${rows.length===0 ? '<tr><td colspan="7" class="teacher-empty">Encara no hi ha alumnes amb partides.</td></tr>' :
          rows.map((r,i)=>{
            const cls = r.pctMig>=75?'high':r.pctMig>=50?'mid':r.pctMig!==null?'low':'';
            const data = r.ultima ? `${r.ultima.getDate().toString().padStart(2,'0')}/${(r.ultima.getMonth()+1).toString().padStart(2,'0')}` : '—';
            return `<tr class="clickable-row" onclick="showAlumneDetail('${escHtml(r.u.alias)}')">
              <td style="color:var(--text-muted);font-family:var(--mono)">${i+1}</td>
              <td><strong>${escHtml(r.u.nom_complet)}</strong></td>
              <td style="font-family:var(--mono);color:var(--accent4)">${escHtml(r.u.alias)}</td>
              <td><strong style="font-family:var(--mono);font-size:1.05rem">${r.total}</strong> pts</td>
              <td>${r.jocsDistints} <span style="color:var(--text-muted);font-size:0.8rem">(${r.partides} partides)</span></td>
              <td>${r.pctMig!==null?`<span class="pct-badge ${cls}">${r.pctMig}%</span>`:'—'}</td>
              <td style="color:var(--text-muted);font-size:0.85rem">${data}</td>
            </tr>`;
          }).join('')
        }
      </tbody>
    </table>`;
  document.getElementById('teacher-main-content').innerHTML = html;
}

// ── VISTA: DETALL ALUMNE ──
function showAlumneDetail(alias){
  teacherView = 'alumne';
  teacherSelectedAlias = alias;
  const u = teacherUsuaris.find(x=>x.alias===alias);
  if(!u) return;
  const partides = teacherAllData.filter(p=>p.user_alias===alias || p.alumne===u.nom_complet);

  // Millor per joc
  const bestPerJoc = {};
  partides.forEach(p=>{
    const k = p.joc_nom;
    if(!bestPerJoc[k] || p.punts > bestPerJoc[k].punts) bestPerJoc[k] = p;
  });
  const totalPts = Object.values(bestPerJoc).reduce((a,b)=>a+b.punts,0);
  const pcts = partides.map(p=>p.pct_encert).filter(Boolean);
  const pctMig = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length) : null;
  const ultima = partides[0] ? new Date(partides[0].creat_at) : null;
  const ultimaStr = ultima ? `${ultima.getDate().toString().padStart(2,'0')}/${(ultima.getMonth()+1).toString().padStart(2,'0')}/${ultima.getFullYear()} ${ultima.getHours().toString().padStart(2,'0')}:${ultima.getMinutes().toString().padStart(2,'0')}` : '—';

  const jocRows = Object.values(bestPerJoc).sort((a,b)=>a.joc_nom.localeCompare(b.joc_nom)).map(p=>{
    const pct = p.pct_encert;
    const cls = pct>=75?'high':pct>=50?'mid':'low';
    const niv = '⭐'.repeat(p.nivell);
    return `<tr>
      <td>${escHtml(p.joc_nom)}</td>
      <td>${niv}</td>
      <td><strong>${p.punts}</strong> / ${p.punts_max}</td>
      <td><span class="pct-badge ${cls}">${pct}%</span></td>
    </tr>`;
  }).join('');

  document.getElementById('teacher-main-content').innerHTML = `
    <div style="margin-bottom:16px">
      <button class="back-btn" onclick="renderRanking()">← Tornar al rànquing</button>
    </div>
    <div class="alumne-detail-header">
      <div>
        <div class="alumne-detail-nom">${escHtml(u.nom_complet)}</div>
        <div class="alumne-detail-alias">@${escHtml(u.alias)}</div>
      </div>
      <div class="alumne-detail-stats">
        <div class="alumne-stat"><div class="alumne-stat-val">${totalPts}</div><div class="alumne-stat-label">Punts totals</div></div>
        <div class="alumne-stat"><div class="alumne-stat-val">${pctMig!==null?pctMig+'%':'—'}</div><div class="alumne-stat-label">% Encert mig</div></div>
        <div class="alumne-stat"><div class="alumne-stat-val" style="font-size:0.85rem">${ultimaStr}</div><div class="alumne-stat-label">Darrera activitat</div></div>
      </div>
    </div>
    <div class="teacher-table-wrap" style="margin-top:16px">
      <table class="teacher-table">
        <thead><tr><th>Joc</th><th>Millor nivell</th><th>Millor puntuació</th><th>% Encert</th></tr></thead>
        <tbody>${jocRows || '<tr><td colspan="4" class="teacher-empty">Encara no ha jugat cap joc.</td></tr>'}</tbody>
      </table>
    </div>`;
}

// ── VISTA: HISTORIAL GLOBAL ──
function renderHistorial(rows){
  teacherView = 'historial';
  setTeacherTab('tab-historial');
  if(!rows) rows = teacherAllData;
  const html = `
    <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">
      ${['Tots','És funció?','Domini','Continuïtat','Punts tall','Creixement','Analitza','Associa: Tipus','Associa: Creixement','Associa: Domini'].map((nom,i)=>
        `<button class="filter-btn" onclick="filterHistorial(${i===0?'null':i-1},this)">${nom}</button>`
      ).join('')}
    </div>
    <div class="teacher-table-wrap">
      <table class="teacher-table">
        <thead><tr><th>Alumne</th><th>Joc</th><th>Nivell</th><th>Punts</th><th>Màxim</th><th>% Encert</th><th>Data</th></tr></thead>
        <tbody id="historial-tbody">
          ${renderHistorialRows(rows)}
        </tbody>
      </table>
    </div>`;
  document.getElementById('teacher-main-content').innerHTML = html;
  // Marca el primer botó (Tots) com actiu
  document.querySelector('#teacher-main-content .filter-btn').classList.add('active');
}

function renderHistorialRows(rows){
  if(!rows.length) return '<tr><td colspan="7" class="teacher-empty">Sense dades.</td></tr>';
  return rows.map(r=>{
    const d=new Date(r.creat_at);
    const data=`${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    const pct=r.pct_encert; const cls=pct>=75?'high':pct>=50?'mid':'low';
    const niv='⭐'.repeat(r.nivell||1);
    const alias = r.user_alias ? `<span style="color:var(--text-muted);font-size:0.8rem"> @${escHtml(r.user_alias)}</span>` : '';
    return `<tr>
      <td><strong>${escHtml(r.alumne)}</strong>${alias}</td>
      <td>${escHtml(r.joc_nom)}</td><td>${niv}</td>
      <td><strong>${r.punts}</strong></td>
      <td style="color:var(--text-muted)">${r.punts_max}</td>
      <td><span class="pct-badge ${cls}">${pct}%</span></td>
      <td style="color:var(--text-muted);font-size:0.8rem">${data}</td>
    </tr>`;
  }).join('');
}

function filterHistorial(jocIdx, btn){
  document.querySelectorAll('#teacher-main-content .filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = jocIdx===null ? teacherAllData : teacherAllData.filter(r=>r.joc_idx===jocIdx);
  document.getElementById('historial-tbody').innerHTML = renderHistorialRows(filtered);
}

// ── VISTA: GESTIÓ D'USUARIS ──
function renderGestioUsuaris(){
  teacherView = 'usuaris';
  setTeacherTab('tab-usuaris');
  const alumnes = teacherUsuaris.filter(u=>u.rol==='alumne');
  const profes  = teacherUsuaris.filter(u=>u.rol==='profe');

  const renderUserRow = u => `
    <tr>
      <td><strong>${escHtml(u.nom_complet)}</strong></td>
      <td style="font-family:var(--mono);color:var(--accent4)">@${escHtml(u.alias)}</td>
      <td><span class="role-badge ${u.rol}">${u.rol==='profe'?'👩‍🏫 Profe':'🎓 Alumne'}</span></td>
      <td><span class="actiu-badge ${u.actiu?'actiu':'inactiu'}">${u.actiu?'Actiu':'Inactiu'}</span></td>
      <td>
        <button class="tbl-btn edit" onclick="editUser('${u.id}')">✏️ Editar</button>
        <button class="tbl-btn ${u.actiu?'deactivate':'activate'}" onclick="toggleUserActiu('${u.id}',${!u.actiu})">${u.actiu?'⏸ Desactivar':'▶ Activar'}</button>
        <button class="tbl-btn delete" onclick="deleteUser('${u.id}','${escHtml(u.nom_complet)}')">🗑</button>
      </td>
    </tr>`;

  document.getElementById('teacher-main-content').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="login-btn" style="width:auto;padding:10px 24px" onclick="showUserForm()">+ Nou usuari</button>
    </div>

    <div id="user-form-wrap"></div>

    <div class="teacher-section-title">🎓 Alumnes (${alumnes.length})</div>
    <div class="teacher-table-wrap" style="margin-bottom:20px">
      <table class="teacher-table">
        <thead><tr><th>Nom complet</th><th>Àlies</th><th>Rol</th><th>Estat</th><th>Accions</th></tr></thead>
        <tbody>${alumnes.map(renderUserRow).join('') || '<tr><td colspan="5" class="teacher-empty">Sense alumnes</td></tr>'}</tbody>
      </table>
    </div>

    <div class="teacher-section-title">👩‍🏫 Professors (${profes.length})</div>
    <div class="teacher-table-wrap">
      <table class="teacher-table">
        <thead><tr><th>Nom complet</th><th>Àlies</th><th>Rol</th><th>Estat</th><th>Accions</th></tr></thead>
        <tbody>${profes.map(renderUserRow).join('') || '<tr><td colspan="5" class="teacher-empty">Sense professors</td></tr>'}</tbody>
      </table>
    </div>`;
}

function showUserForm(id){
  const u = id ? teacherUsuaris.find(x=>x.id===id) : null;
  const wrap = document.getElementById('user-form-wrap');
  wrap.innerHTML = `
    <div class="user-form-card">
      <div class="user-form-title">${u ? '✏️ Editar usuari' : '+ Nou usuari'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <label class="login-label">Nom complet</label>
          <input class="login-input" id="uf-nom" value="${u?escHtml(u.nom_complet):''}" placeholder="ex: Maria García">
        </div>
        <div>
          <label class="login-label">Àlies (per fer login)</label>
          <input class="login-input" id="uf-alias" value="${u?escHtml(u.alias):''}" placeholder="ex: maria.g" ${u?'readonly style="opacity:0.6"':''}>
        </div>
      </div>
      <div style="margin-bottom:16px">
        <label class="login-label">Rol</label>
        <select class="login-input" id="uf-rol" style="cursor:pointer">
          <option value="alumne" ${(!u||u.rol==='alumne')?'selected':''}>🎓 Alumne</option>
          <option value="profe" ${u&&u.rol==='profe'?'selected':''}>👩‍🏫 Professor/a</option>
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <button class="login-btn" style="flex:1" onclick="saveUser('${u?u.id:''}')">${u?'Guardar canvis':'Crear usuari'}</button>
        <button class="back-btn" style="flex:1;text-align:center" onclick="document.getElementById('user-form-wrap').innerHTML=''">Cancel·lar</button>
      </div>
      <div class="login-error" id="uf-error"></div>
    </div>`;
  wrap.scrollIntoView({behavior:'smooth'});
}

function editUser(id){ showUserForm(id); }

async function saveUser(id){
  const nom = document.getElementById('uf-nom').value.trim();
  const alias = document.getElementById('uf-alias').value.trim().toLowerCase();
  const rol = document.getElementById('uf-rol').value;
  const errEl = document.getElementById('uf-error');

  if(nom.length < 2){ errEl.textContent='El nom ha de tenir mínim 2 caràcters'; return; }
  if(!id && alias.length < 2){ errEl.textContent='L\'àlies ha de tenir mínim 2 caràcters'; return; }

  errEl.textContent = '';
  if(id){
    // Editar — només nom i rol (àlies no canvia)
    const ok = await sb.update('usuaris', id, {nom_complet:nom, rol});
    if(ok){ showToast('✅ Usuari actualitzat', 'ok'); await loadTeacherAll(); }
    else errEl.textContent = 'Error actualitzant l\'usuari';
  } else {
    // Crear
    const result = await sb.insert('usuaris', [{nom_complet:nom, alias, rol, actiu:true}]);
    if(result){ showToast('✅ Usuari creat', 'ok'); await loadTeacherAll(); }
    else errEl.textContent = 'Error creant l\'usuari (potser l\'àlies ja existeix)';
  }
}

async function toggleUserActiu(id, nouEstat){
  const ok = await sb.update('usuaris', id, {actiu: nouEstat});
  if(ok){ showToast(nouEstat?'✅ Usuari activat':'⏸ Usuari desactivat', 'ok'); await loadTeacherAll(); }
  else showToast('⚠️ Error', 'err');
}

async function deleteUser(id, nom){
  if(!confirm(`Segur que vols eliminar "${nom}"? Aquesta acció no es pot desfer.`)) return;
  const ok = await sb.delete('usuaris', id);
  if(ok){ showToast('🗑 Usuari eliminat', 'ok'); await loadTeacherAll(); }
  else showToast('⚠️ Error eliminant l\'usuari', 'err');
}

function setTeacherTab(activeId){
  ['tab-ranking','tab-historial','tab-usuaris'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.toggle('active', el.id===activeId);
  });
}

function escHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// ── STATE ──────────────────────────────────────────────
let currentLevel=1, currentGame=-1, currentGameIsMatch=false, currentMatchIdx=-1;
let currentQ=0, gameScore=0, gameAnswers=[], questions=[];
// gameBestScores[gameIdx][level] i matchBestScores[matchIdx][level]
const gameBestScores  = {0:{1:0,2:0,3:0},1:{1:0,2:0,3:0},2:{1:0,2:0,3:0},3:{1:0,2:0,3:0},4:{1:0,2:0,3:0},5:{1:0,2:0,3:0}};
const matchBestScores = {0:{1:0,2:0,3:0},1:{1:0,2:0,3:0},2:{1:0,2:0,3:0}};
let totalGamesPlayed=0, totalCorrect=0, totalAnswered=0;
const gameNames=['És funció?','Domini i recorregut','Continuïtat','Punts de tall','Creixement i extrems','Analitza la gràfica'];
const matchNames=['Associa: Tipus de gràfica','Associa: Creixement','Associa: Domini'];
const gameColors=['#e63946','#3a7bd5','#f4a261','#2a9d8f','#7b5ea7','#e76f51'];
const matchColors=['#3a7bd5','#2a9d8f','#7b5ea7'];

// Puntuació creixent per nivell: N1=10, N2=15, N3=20
// Màxims per joc i nivell
const GAME_MAX = {
  0: {1: 6*10,   2: 6*15,   3: 8*20  },   //  60 /  90 / 160
  1: {1: 4*10,   2: 4*2*15, 3: 4*2*20},   //  40 / 120 / 160
  2: {1: 4*10,   2: 5*15,   3: 6*20  },   //  40 /  75 / 120
  3: {1: 4*2*10, 2: 4*2*15, 3: 5*2*20},   //  80 / 120 / 200
  4: {1: 3*2*10, 2: 3*4*15, 3: 4*4*20},   //  60 / 180 / 320
  5: {1: 11*10,  2: 18*15,  3: 17*20 },   // 110 / 270 / 340
};
const MATCH_MAX = {
  0: {1: 3*10, 2: 4*15, 3: 3*20},   //  30 /  60 /  60
  1: {1: 3*10, 2: 3*15, 3: 3*20},   //  30 /  45 /  60
  2: {1: 3*10, 2: 4*15, 3: 3*20},   //  30 /  60 /  60
};

// Suma màxims d'un nivell concret (tots els jocs + matches)
function totalMaxPerLevel(lv){
  const g = Object.values(GAME_MAX).reduce((s,m)=>s+(m[lv]||0),0);
  const m = Object.values(MATCH_MAX).reduce((s,m)=>s+(m[lv]||0),0);
  return g+m;
}
// Suma obtinguda d'un nivell concret
function totalObtingutPerLevel(lv){
  const g = Object.keys(gameBestScores).reduce((s,i)=>s+(gameBestScores[i][lv]||0),0);
  const m = Object.keys(matchBestScores).reduce((s,i)=>s+(matchBestScores[i][lv]||0),0);
  return g+m;
}

// ── BADGES I RESUM DE PUNTUACIÓ ──────────────────────────
function updateBadges(){
  // Targetes individuals: mostra la millor del nivell actual
  for(let i=0;i<6;i++){
    const el=document.getElementById(`badge-${i}`);
    if(!el) continue;
    const best=gameBestScores[i][currentLevel]||0;
    const max=GAME_MAX[i]?.[currentLevel]||0;
    el.textContent = best>0 ? `${best} / ${max} pts` : `Màx: ${max} pts`;
  }
  for(let i=0;i<3;i++){
    const el=document.getElementById(`badge-m${i}`);
    if(!el) continue;
    const best=matchBestScores[i][currentLevel]||0;
    const max=MATCH_MAX[i]?.[currentLevel]||0;
    el.textContent = best>0 ? `${best} / ${max} pts` : `Màx: ${max} pts`;
  }
  // Resum per nivells davant de les seccions
  renderLevelSummary();
}

function renderLevelSummary(){
  const el = document.getElementById('level-score-summary');
  if(!el) return;
  const lvls=[1,2,3];
  const stars=['⭐','⭐⭐','⭐⭐⭐'];
  let totalObt=0, totalMax=0;
  const pills = lvls.map((lv,i)=>{
    const obt=totalObtingutPerLevel(lv);
    const max=totalMaxPerLevel(lv);
    totalObt+=obt; totalMax+=max;
    const txt = obt>0 ? `${obt}/${max}` : `${max}`;
    const style = obt>0 ? 'color:var(--accent4);font-weight:800' : 'color:var(--text-muted)';
    return `<span class="lv-pill ${obt>0?'active':''}"><span class="lv-stars">${stars[i]}</span><span class="lv-score" style="${style}">${txt}</span></span>`;
  }).join('');
  const totalTxt = totalObt>0 ? `${totalObt}/${totalMax}` : `Màx: ${totalMax}`;
  el.innerHTML = `${pills}<span class="lv-total">Total: <strong>${totalTxt}</strong></span>`;
}

// ── SVG ───────────────────────────────────────────────
const W=320,H=240,MX=160,MY=120,SC=30;
function px(x){return MX+x*SC;} function py(y){return MY-y*SC;}
function ns(tag,a){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(a))e.setAttribute(k,v);return e;}

function makeBase(svg){
  svg.innerHTML='';
  for(let i=-5;i<=5;i++){
    const xp=MX+i*SC, yp=MY+i*SC, main=i===0;
    const sc=main?'rgba(0,0,0,0.28)':'rgba(58,123,213,0.1)', sw=main?1.8:1, da=main?'':'3,3';
    const la=ns('line',{x1:xp,y1:12,x2:xp,y2:H-12,stroke:sc,'stroke-width':sw});if(da)la.setAttribute('stroke-dasharray',da);svg.appendChild(la);
    const lb=ns('line',{y1:yp,x1:12,y2:yp,x2:W-12,stroke:sc,'stroke-width':sw});if(da)lb.setAttribute('stroke-dasharray',da);svg.appendChild(lb);
  }
  svg.appendChild(ns('line',{x1:12,y1:MY,x2:W-12,y2:MY,stroke:'rgba(0,0,0,0.35)','stroke-width':2}));
  svg.appendChild(ns('line',{x1:MX,y1:12,x2:MX,y2:H-12,stroke:'rgba(0,0,0,0.35)','stroke-width':2}));
  svg.appendChild(ns('polygon',{points:`${MX-5},16 ${MX},6 ${MX+5},16`,fill:'rgba(0,0,0,0.28)'}));
  svg.appendChild(ns('polygon',{points:`${W-16},${MY-5} ${W-6},${MY} ${W-16},${MY+5}`,fill:'rgba(0,0,0,0.28)'}));
  const tx=ns('text',{x:W-9,y:MY+14,'font-size':11,fill:'rgba(0,0,0,0.55)','font-family':'Space Mono'});tx.textContent='x';svg.appendChild(tx);
  const ty=ns('text',{x:MX+5,y:15,'font-size':11,fill:'rgba(0,0,0,0.55)','font-family':'Space Mono'});ty.textContent='y';svg.appendChild(ty);
  for(let i=-4;i<=4;i++){if(!i)continue;const ta=ns('text',{x:MX+i*SC-3,y:MY+14,'font-size':9,fill:'rgba(0,0,0,0.52)','font-family':'Space Mono','text-anchor':'middle'});ta.textContent=i;svg.appendChild(ta);const tb=ns('text',{x:MX-16,y:MY-i*SC+4,'font-size':9,fill:'rgba(0,0,0,0.52)','font-family':'Space Mono','text-anchor':'middle'});tb.textContent=i;svg.appendChild(tb);}
  return svg;
}

// Límits visuals del SVG en unitats de gràfica (calculats una vegada)
const X_VIS=(W/2-12)/SC;   // ≈4.93
const Y_VIS=(H/2-12)/SC;   // ≈3.60

// Dibuixa fletxa amb PUNTA al punt (tipXpx,tipYpx), base cap a l'interior
function _drawArrow(tipXpx,tipYpx,slope,side,color,svg,scX,scY){
  scX=scX||SC; scY=scY||SC;
  const rawDx=scX,rawDy=-slope*scY,mag=Math.sqrt(rawDx*rawDx+rawDy*rawDy);
  if(mag<0.001)return;
  const sign=side==='right'?1:-1,ux=sign*rawDx/mag,uy=sign*rawDy/mag;
  const L=13,Ww=5,baseX=tipXpx-ux*L,baseY=tipYpx-uy*L;
  const ppx=-uy*Ww,ppy=ux*Ww;
  svg.appendChild(ns('polygon',{points:`${tipXpx.toFixed(1)},${tipYpx.toFixed(1)} ${(baseX+ppx).toFixed(1)},${(baseY+ppy).toFixed(1)} ${(baseX-ppx).toFixed(1)},${(baseY-ppy).toFixed(1)}`,fill:color}));
}

// Troba el punt exacte on la corba desapareix del marc i col·loca la fletxa
function _placeArrow(fn,a,b,side,color,svg,pxF,pyF,yVis,scX,scY){
  pxF=pxF||px; pyF=pyF||py; yVis=yVis||Y_VIS; scX=scX||SC; scY=scY||SC;
  const xEdge=side==='right'?b:a;
  const yEdge=fn(xEdge);
  let xTip=xEdge,yTip=yEdge;
  if(!isFinite(yEdge)||Math.abs(yEdge)>yVis){
    // Surt pel costat Y: bisecció per trobar on |y|=yVis
    const step=side==='right'?-0.05:0.05;
    let xIn=xEdge+step;
    for(let i=0;i<200;i++){const y=fn(xIn);if(isFinite(y)&&Math.abs(y)<=yVis)break;xIn+=step;if(Math.abs(xIn-xEdge)>15)break;}
    let xa=xIn,xb=xEdge;
    for(let it=0;it<60;it++){const xm=(xa+xb)/2,ym=fn(xm);if(isFinite(ym)&&Math.abs(ym)<=yVis)xa=xm;else xb=xm;}
    xTip=xa; yTip=Math.max(-yVis,Math.min(yVis,fn(xa)));
  }
  const h=0.001,slope=(fn(xTip+h)-fn(xTip-h))/(2*h);
  if(!isFinite(slope))return;
  _drawArrow(pxF(xTip),pyF(yTip),slope,side,color,svg,scX,scY);
}

// plotFn principal — ara integra les fletxes directament (mateixa lambda, impossible desacoblar)
// arrows: null | 'left' | 'right' | 'both'
function plotFn(fn,a,b,color,svg,sw,arrows){
  let d='',first=true;
  for(let i=0;i<=400;i++){const x=a+(b-a)*i/400,y=fn(x);if(!isFinite(y)||y>Y_VIS*1.1||y<-Y_VIS*1.1){first=true;continue;}d+=(first?'M':'L')+px(x).toFixed(1)+','+py(y).toFixed(1);first=false;}
  if(d)svg.appendChild(ns('path',{d,stroke:color||'#3a7bd5','stroke-width':sw||2.6,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'}));
  if(arrows==='left'||arrows==='both')_placeArrow(fn,a,b,'left',color,svg);
  if(arrows==='right'||arrows==='both')_placeArrow(fn,a,b,'right',color,svg);
}

// plotFnS: versió escalada (per a makeBaseScaled), també amb fletxes integrades
function plotFnS(fn,a,b,color,svg,sw,arrows){
  const pxF=svg._pxS||px,pyF=svg._pyS||py,yr=svg._yr||5,scX=svg._scX||SC,scY=svg._scY||SC;
  const yLim=yr*1.05;
  let d='',first=true;
  for(let i=0;i<=400;i++){const x=a+(b-a)*i/400,y=fn(x);if(!isFinite(y)||y>yLim||y<-yLim){first=true;continue;}d+=(first?'M':'L')+pxF(x).toFixed(1)+','+pyF(y).toFixed(1);first=false;}
  if(d)svg.appendChild(ns('path',{d,stroke:color||'#3a7bd5','stroke-width':sw||2.6,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'}));
  const yVis=yr*0.96;
  if(arrows==='left'||arrows==='both')_placeArrow(fn,a,b,'left',color,svg,pxF,pyF,yVis,scX,scY);
  if(arrows==='right'||arrows==='both')_placeArrow(fn,a,b,'right',color,svg,pxF,pyF,yVis,scX,scY);
}
// Fletxa direccional fixa en un punt de la gràfica (up/down/left/right)
// x,y en coordenades de gràfica; dir = 'up'|'down'|'left'|'right'
function arrowContinues(x,y,dir,color,svg){
  const tx=px(x), ty=py(y), L=13, Ww=5;
  let ux=0,uy=0;
  if(dir==='up')   {ux=0;uy=-1;}
  if(dir==='down') {ux=0;uy=1;}
  if(dir==='left') {ux=-1;uy=0;}
  if(dir==='right'){ux=1;uy=0;}
  const baseX=tx-ux*L, baseY=ty-uy*L;
  const ppx=-uy*Ww, ppy=ux*Ww;
  svg.appendChild(ns('polygon',{
    points:`${tx.toFixed(1)},${ty.toFixed(1)} ${(baseX+ppx).toFixed(1)},${(baseY+ppy).toFixed(1)} ${(baseX-ppx).toFixed(1)},${(baseY-ppy).toFixed(1)}`,
    fill:color
  }));
}

function plotSeg(x1,y1,x2,y2,color,c1,c2,svg){
  svg.appendChild(ns('line',{x1:px(x1),y1:py(y1),x2:px(x2),y2:py(y2),stroke:color||'#3a7bd5','stroke-width':2.6}));
  dot(x1,y1,color,c1!==false,svg); dot(x2,y2,color,c2!==false,svg);
}
function dot(x,y,color,filled,svg){svg.appendChild(ns('circle',{cx:px(x),cy:py(y),r:5,fill:filled?color:'#f8faff',stroke:color,'stroke-width':2.2}));}

// ── SISTEMA DE COORDENADES ESCALABLE ──────────────────────────────────
// Per defecte: yRange = 5 (mostra de -5 a +5)
// makeBaseScaled permet canviar el rang Y per a funcions que surten del marc

function makeBaseScaled(svg, yRange, xRange){
  const yr = yRange || 5;
  const xr = xRange || 5;
  svg.innerHTML='';
  svg._yr = yr; svg._xr = xr;  // guard per a px/py locals

  // Fem servir les funcions globals px/py que usen SC i MX/MY
  // però aquí creem línies de graella amb el rang demanat
  const scY = (H - 24) / (2 * yr);  // píxels per unitat Y
  const scX = (W - 24) / (2 * xr);  // píxels per unitat X
  const mx = W/2, my = H/2;

  // Línies de graella — salts de 1 si yr<=5, de 2 si yr<=10, de 5 si yr<=25
  const stepY = yr <= 5 ? 1 : yr <= 10 ? 2 : 5;
  const stepX = xr <= 5 ? 1 : xr <= 10 ? 2 : 5;

  for(let i = -yr; i <= yr; i += stepY){
    const yp = my - i*scY;
    const main = i===0;
    const sc2 = main?'rgba(0,0,0,0.28)':'rgba(58,123,213,0.1)';
    const sw2 = main?1.8:1;
    const lb = ns('line',{y1:yp,x1:12,y2:yp,x2:W-12,stroke:sc2,'stroke-width':sw2});
    if(!main) lb.setAttribute('stroke-dasharray','3,3');
    svg.appendChild(lb);
  }
  for(let i = -xr; i <= xr; i += stepX){
    const xp2 = mx + i*scX;
    const main = i===0;
    const sc2 = main?'rgba(0,0,0,0.28)':'rgba(58,123,213,0.1)';
    const sw2 = main?1.8:1;
    const la = ns('line',{x1:xp2,y1:12,x2:xp2,y2:H-12,stroke:sc2,'stroke-width':sw2});
    if(!main) la.setAttribute('stroke-dasharray','3,3');
    svg.appendChild(la);
  }

  // Eixos
  svg.appendChild(ns('line',{x1:12,y1:my,x2:W-12,y2:my,stroke:'rgba(0,0,0,0.35)','stroke-width':2}));
  svg.appendChild(ns('line',{x1:mx,y1:12,x2:mx,y2:H-12,stroke:'rgba(0,0,0,0.35)','stroke-width':2}));
  // Fletxes eixos
  svg.appendChild(ns('polygon',{points:`${mx-5},16 ${mx},6 ${mx+5},16`,fill:'rgba(0,0,0,0.28)'}));
  svg.appendChild(ns('polygon',{points:`${W-16},${my-5} ${W-6},${my} ${W-16},${my+5}`,fill:'rgba(0,0,0,0.28)'}));
  // Labels eixos
  const tx2=ns('text',{x:W-9,y:my+13,'font-size':10,fill:'rgba(0,0,0,0.28)','font-family':'Space Mono'});tx2.textContent='x';svg.appendChild(tx2);
  const ty2=ns('text',{x:mx+5,y:15,'font-size':10,fill:'rgba(0,0,0,0.28)','font-family':'Space Mono'});ty2.textContent='y';svg.appendChild(ty2);

  // Etiquetes numèriques dels eixos
  for(let i=-xr;i<=xr;i+=stepX){
    if(!i)continue;
    const xp2=mx+i*scX;
    const t=ns('text',{x:xp2-3,y:my+13,'font-size':8,fill:'rgba(0,0,0,0.18)','font-family':'Space Mono','text-anchor':'middle'});
    t.textContent=i; svg.appendChild(t);
  }
  for(let i=-yr;i<=yr;i+=stepY){
    if(!i)continue;
    const yp2=my-i*scY;
    const t=ns('text',{x:mx-14,y:yp2+4,'font-size':8,fill:'rgba(0,0,0,0.18)','font-family':'Space Mono','text-anchor':'middle'});
    t.textContent=i; svg.appendChild(t);
  }

  // Emmagatzema les funcions de conversió a l'SVG per a plotFnS i arrowFnS
  svg._pxS = x => mx + x*scX;
  svg._pyS = y => my - y*scY;
  svg._scX = scX; svg._scY = scY;
  svg._yr = yr; svg._xr = xr;
  return svg;
}

// plotFn escalable: usa les funcions de conversió de l'SVG si existeixen
function plotFnS(fn, a, b, color, svg, sw){
  const pxF = svg._pxS || px;
  const pyF = svg._pyS || py;
  const yr  = svg._yr  || 5;
  let d='', first=true;
  for(let i=0;i<=400;i++){
    const x=a+(b-a)*i/400, y=fn(x);
    if(!isFinite(y)||y>yr*1.1||y<-yr*1.1){first=true;continue;}
    d+=(first?'M':'L')+pxF(x).toFixed(1)+','+pyF(y).toFixed(1);
    first=false;
  }
  svg.appendChild(ns('path',{d,stroke:color||'#3a7bd5','stroke-width':sw||2.6,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'}));
}




// arrowFnScaled: afegeix fletxes a una funció plotejada amb makeBaseScaled
function arrowFnScaled(fn, a, b, sides, color, svg){
  const pxF = svg._pxS || px;
  const pyF = svg._pyS || py;
  const yVis = svg._yr  || 5;
  const scX  = svg._scX || SC;
  const scY  = svg._scY || SC;
  if(sides==='both'||sides==='left')  _placeArrow(fn,a,b,'left', color,svg,pxF,pyF,yVis,scX,scY);
  if(sides==='both'||sides==='right') _placeArrow(fn,a,b,'right',color,svg,pxF,pyF,yVis,scX,scY);
}
// Cada nivell té el seu propi conjunt de funcions, sense reutilitzar les del nivell anterior.

// ═══════════════════════════════════════════════════════
// GAME 0: ÉS FUNCIÓ?
// ═══════════════════════════════════════════════════════
function esFuncioBank(level){

  // ── Helper: dibuixa una corba paramètrica (t→[x(t),y(t)]) ──────────
  function paramCurve(s, xt, yt, t0, t1, steps, color, sw){
    let d='', first=true;
    for(let i=0;i<=steps;i++){
      const t=t0+(t1-t0)*i/steps;
      const xv=xt(t), yv=yt(t);
      if(!isFinite(xv)||!isFinite(yv)||Math.abs(yv)>5.3||Math.abs(xv)>5.3){first=true;continue;}
      d+=(first?'M':'L')+px(xv).toFixed(1)+','+py(yv).toFixed(1);
      first=false;
    }
    s.appendChild(ns('path',{d,stroke:color||'#e63946','stroke-width':sw||2.6,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'}));
  }

  const L1=[
    // FUNCIONS simples
    {draw(s){makeBase(s);plotFn(x=>0.6*x+1,-4,4,'#3a7bd5',s,2.6,'both');},isFn:true,explain:'Recta creixent: a cada x li correspon exactament un y. SÍ és funció.'},
    {draw(s){makeBase(s);plotFn(x=>-0.8*x+2,-4,4,'#2a9d8f',s,2.6,'both');},isFn:true,explain:'Recta decreixent: a cada x un sol y. SÍ és funció.'},
    {draw(s){makeBase(s);plotFn(x=>2,-4,4,'#7b5ea7',s,2.6,'both');},isFn:true,explain:'Recta horitzontal (funció constant y=2): sempre el mateix valor. SÍ és funció.'},
    {draw(s){makeBaseScaled(s,12,4);plotFnS(x=>x*x-1,-4,4,'#3a7bd5',s,2.6,'both');},isFn:true,explain:'Paràbola: per a cada x hi ha un únic y. SÍ és funció.'},
    {draw(s){makeBase(s);plotFn(x=>Math.abs(x)-1,-4,4,'#f4a261',s,2.6,'both');},isFn:true,explain:'Valor absolut: un sol y per cada x. SÍ és funció.'},
    // NO FUNCIONS clàssiques
    {draw(s){makeBase(s);s.appendChild(ns('circle',{cx:px(0),cy:py(0),r:SC*2.5,stroke:'#e63946','stroke-width':2.6,fill:'none'}));},isFn:false,explain:'Circumferència: per a molts valors de x hi ha dos punts (dalt i baix). NO és funció.'},
    {draw(s){makeBase(s);s.appendChild(ns('line',{x1:px(2),y1:py(-4.5),x2:px(2),y2:py(4.5),stroke:'#e63946','stroke-width':2.6}));arrowContinues(2,4.3,'up','#e63946',s);arrowContinues(2,-4.3,'down','#e63946',s);},isFn:false,explain:'Recta vertical a x=2: infinits valors de y per al mateix x. NO és funció.'},
    // Paràbola horitzontal (x=y²) — clàssica imatge 3
    {draw(s){makeBase(s);
      let d='';for(let y=-3.5;y<=3.5;y+=0.04){const x=y*y*0.5;if(x>4.8)continue;d+=(d===''?'M':'L')+px(x).toFixed(1)+','+py(y).toFixed(1);}
      s.appendChild(ns('path',{d,stroke:'#e63946','stroke-width':2.6,fill:'none','stroke-linecap':'round'}));
    },isFn:false,explain:'Paràbola horitzontal (x=0.5y²): per a cada x>0 hi ha dos valors de y, un positiu i un negatiu. NO és funció.'},
    // Oval / el·lipse completa — NO funció
    {draw(s){makeBase(s);
      let d='';for(let t=0;t<=2*Math.PI+0.05;t+=0.04){const xv=3*Math.cos(t),yv=2*Math.sin(t);d+=(t<0.05?'M':'L')+px(xv).toFixed(1)+','+py(yv).toFixed(1);}
      s.appendChild(ns('path',{d,stroke:'#e63946','stroke-width':2.6,fill:'none','stroke-linecap':'round'}));
    },isFn:false,explain:'El·lipse tancada: per a la majoria de valors de x hi ha dos punts. NO és funció.'},
  ];

  const L2=[
    // FUNCIONS menys òbvies
    {draw(s){makeBase(s);plotFn(x=>x*x*x*0.15,-4,4,'#7b5ea7',s,2.6,'both');},isFn:true,explain:'Cúbica: sempre creixent, un únic y per cada x. SÍ és funció.'},
    {draw(s){makeBase(s);plotFn(x=>Math.sqrt(Math.abs(x)),-4,4,'#2a9d8f',s,2.6,'both');},isFn:true,explain:'√|x|: forma de V suavitzada, un sol y per cada x. SÍ és funció.'},
    {draw(s){makeBase(s);plotSeg(-3,2,0,2,'#3a7bd5',true,true,s);dot(0,-1,'#3a7bd5',false,s);plotSeg(0,-1,3,-1,'#3a7bd5',false,true,s);},isFn:true,explain:'Punt tancat a y=2 i obert a y=−1 per a x=0: un únic valor. SÍ és funció.'},
    {draw(s){makeBase(s);plotFn(x=>1/(x*x+1)*3,-4,4,'#f4a261',s,2.6,'both');},isFn:true,explain:'Campana: simètrica, però un sol y per cada x. SÍ és funció.'},
    {draw(s){makeBase(s);plotFn(x=>Math.sin(x)*2,-4,4,'#3a7bd5',s,2.6,'both');},isFn:true,explain:'Sinusoide: ondulada però a cada x li correspon un únic y. SÍ és funció.'},
    // NO FUNCIONS
    // Corba en S horitzontal (imatge 1): cúbica girada — com y³=x
    {draw(s){makeBase(s);
      let d='';for(let y=-3.5;y<=3.5;y+=0.04){const x=y*y*y*0.12;if(Math.abs(x)>4.8)continue;d+=(d===''?'M':'L')+px(x).toFixed(1)+','+py(y).toFixed(1);}
      s.appendChild(ns('path',{d,stroke:'#e63946','stroke-width':2.6,fill:'none','stroke-linecap':'round'}));
    },isFn:false,explain:'Corba en S horitzontal (x=0.12y³): és la cúbica girada 90°. Per a alguns valors de x hi ha tres valors de y. NO és funció.'},
    // Corba en 8 / lemniscata (imatge 2)
    {draw(s){makeBase(s);
      paramCurve(s, t=>3*Math.cos(t)/(1+Math.sin(t)*Math.sin(t)), t=>3*Math.sin(t)*Math.cos(t)/(1+Math.sin(t)*Math.sin(t)), 0, 2*Math.PI, 300, '#e63946', 2.6);
    },isFn:false,explain:'Lemniscata (corba en forma de 8): per als valors centrals de x hi ha múltiples punts. NO és funció.'},
    // Circumferència desplaçada
    {draw(s){makeBase(s);
      let d='';for(let t=0;t<=2*Math.PI+0.05;t+=0.04){const xv=1+2*Math.cos(t),yv=2*Math.sin(t);d+=(t<0.05?'M':'L')+px(xv).toFixed(1)+','+py(yv).toFixed(1);}
      s.appendChild(ns('path',{d,stroke:'#e63946','stroke-width':2.6,fill:'none'}));
    },isFn:false,explain:'Circumferència centrada a (1,0): per a x entre −1 i 3 hi ha dos punts (dalt i baix). NO és funció.'},
    // Dos punts tancats al mateix x=0 — NO funció
    {draw(s){makeBase(s);plotSeg(-3,2,0,2,'#e63946',true,true,s);dot(0,-1,'#e63946',true,s);plotSeg(0,-1,3,-1,'#e63946',true,true,s);},isFn:false,explain:'A x=0 hi ha DOS punts tancats: y=2 i y=−1. Dos valors de y per al mateix x. NO és funció.'},
  ];

  const L3=[
    // FUNCIONS complexes
    {draw(s){makeBase(s);plotFn(x=>x*Math.sin(x)*0.5,-4,4,'#7b5ea7',s,2.6,'both');},isFn:true,explain:'Producte x·sin(x): corba complexa però a cada x un únic y. SÍ és funció.'},
    {draw(s){makeBase(s);plotFn(x=>0.1*x*x*x*x-x*x+1,-4,4,'#3a7bd5',s,2.6,'both');},isFn:true,explain:'Polinomi grau 4: té tres extrems, però un sol y per cada x. SÍ és funció.'},
    {draw(s){makeBase(s);plotFn(x=>Math.pow(Math.abs(x),1/3)*(x<0?-1:1),-4,4,'#2a9d8f',s,2.6,'both');},isFn:true,explain:'Arrel cúbica: sempre creixent i definida per a tots els reals. SÍ és funció.'},
    {draw(s){makeBase(s);
      plotFn(x=>-x-2,-4,-1,'#3a7bd5',s,2.6,'left');dot(-1,-1,'#3a7bd5',true,s);
      plotSeg(-1,1,1,1,'#3a7bd5',false,false,s);dot(-1,1,'#3a7bd5',false,s);dot(1,1,'#3a7bd5',false,s);
      plotFn(x=>x-2,1,4,'#3a7bd5',s,2.6,'right');dot(1,-1,'#3a7bd5',true,s);
    },isFn:true,explain:'Tres trams: a cada x li correspon exactament un valor de y. SÍ és funció.'},
    {draw(s){makeBase(s);plotFn(x=>x*x*x-4*x,-3,3,'#f4a261',s,2.6,'both');},isFn:true,explain:'Cúbic x³−4x: talla X tres vegades, però cada x té un sol y. SÍ és funció.'},
    // NO FUNCIONS subtils
    // Corba en 8 vertical (cardioide deformada)
    {draw(s){makeBase(s);
      paramCurve(s, t=>2*Math.sin(t), t=>2*Math.sin(t)*Math.cos(t), 0, 2*Math.PI, 300, '#e63946', 2.6);
    },isFn:false,explain:'Corba en 8 vertical: per a valors de x prop del centre hi ha múltiples punts (dalt i baix). NO és funció.'},
    // Espiral
    {draw(s){makeBase(s);
      const pts=[];for(let t=0;t<=4*Math.PI;t+=0.05){const r=t/4;pts.push([r*Math.cos(t),r*Math.sin(t)]);}
      let d='';pts.forEach((p,i)=>{if(Math.abs(p[1])>5.2||Math.abs(p[0])>5.2)return;d+=(i===0||d===''?'M':'L')+px(p[0]).toFixed(1)+','+py(p[1]).toFixed(1);});
      s.appendChild(ns('path',{d,stroke:'#e63946','stroke-width':2.4,fill:'none'}));
    },isFn:false,explain:'Espiral: a mesura que gira, per a molts valors de x hi ha múltiples punts. NO és funció.'},
    // Corba ondulada horitzontal (imatge 4): sinusoide girada
    {draw(s){makeBase(s);
      let d='';for(let y=-4;y<=4;y+=0.04){const x=Math.sin(y*1.2)*3;d+=(d===''?'M':'L')+px(x).toFixed(1)+','+py(y).toFixed(1);}
      s.appendChild(ns('path',{d,stroke:'#e63946','stroke-width':2.6,fill:'none','stroke-linecap':'round'}));
    },isFn:false,explain:'Sinusoide horitzontal (x=3·sin(1.2y)): la corba s\'encreua amb moltes rectes verticals en múltiples punts. NO és funció.'},
    // Paràbola horitzontal més evident
    {draw(s){makeBase(s);
      let d='';for(let y=-3.8;y<=3.8;y+=0.04){const x=y*y*0.4-2;if(Math.abs(x)>4.8)continue;d+=(d===''?'M':'L')+px(x).toFixed(1)+','+py(y).toFixed(1);}
      s.appendChild(ns('path',{d,stroke:'#e63946','stroke-width':2.6,fill:'none','stroke-linecap':'round'}));
    },isFn:false,explain:'Paràbola horitzontal desplaçada: oberta cap a la dreta, per a x>−2 hi ha dos valors de y. NO és funció.'},
    // Figura tancada (cor simplificat)
    {draw(s){makeBase(s);
      paramCurve(s, t=>2*Math.sin(t)*Math.sin(t)*Math.sin(t), t=>2*(Math.cos(t)-Math.cos(t*2)*0.35-Math.cos(t*3)*0.1-Math.cos(t*4)*0.06), 0, 2*Math.PI, 300, '#e63946', 2.6);
    },isFn:false,explain:'Corba tancada (forma de cor): és una figura tancada, per a molts valors de x hi ha dos o més punts. NO és funció.'},
  ];

  const banks={1:L1,2:L2,3:L3};
  return shuffleArr([...banks[level]]).slice(0,level===1?6:level===2?6:8);
}

function dominiBank(level){
  const L1=[
    {draw(s){makeBase(s);plotFn(x=>x+1,-4,4,'#3a7bd5',s,2.6,'both');},domOpts:['(−∞,+∞)','[−4, 4]','[0,+∞)','(0,4)'],domAns:0,recOpts:['(−∞,+∞)','[0,+∞)','[−3,5]','(−∞,0)'],recAns:0,domExplain:'Recta sense restriccions: domini = (−∞,+∞).',recExplain:'Recta: pren tots els valors reals. Recorregut = (−∞,+∞).'},
    {draw(s){makeBaseScaled(s,12,4);plotFnS(x=>x*x,-4,4,'#2a9d8f',s,2.6,'both');},domOpts:['(−∞,+∞)','[0,+∞)','[−3,3]','(−∞,0)'],domAns:0,recOpts:['[0,+∞)','(−∞,+∞)','(0,+∞)','[0,9]'],recAns:0,domExplain:'Paràbola definida per tot x: domini = (−∞,+∞).',recExplain:'x² ≥ 0 sempre (i arriba a tots els valors positius): recorregut = [0, +∞). Compte: (0,+∞) exclouria el 0, però x=0 → y=0, que sí s\'assoleix.'},
    {draw(s){makeBase(s);plotSeg(-3,-2,2,3,'#7b5ea7',true,true,s);},domOpts:['[−3, 2]','(−3, 2)','[−3, 2)','(−3, 2]'],domAns:0,recOpts:['[−2, 3]','(−2, 3)','[−2, 3)','(−2, 3]'],recAns:0,domExplain:'Segment tancat als dos extrems: domini = [−3, 2].',recExplain:'Valors de y tancats als dos extrems: recorregut = [−2, 3].'},
    {draw(s){makeBaseScaled(s,8,4);plotFnS(x=>-x*x+4,-4,4,'#f4a261',s,2.6,'both');},domOpts:['(−∞,+∞)','[0,4]','[−2,2]','(0,+∞)'],domAns:0,recOpts:['(−∞, 4]','(−∞,+∞)','[0,4]','[−4,4]'],recAns:0,domExplain:'Paràbola sense restriccions: domini = (−∞,+∞).',recExplain:'Màxim a y=4, decreix cap a −∞: recorregut = (−∞, 4].'},
    {draw(s){makeBase(s);plotSeg(-2,1,3,1,'#e63946',true,false,s);},domOpts:['[−2, 3)','[−2, 3]','(−2, 3)','(−2, 3]'],domAns:0,recOpts:['{1}','[1,3)','[0,1]','(1,3)'],recAns:0,domExplain:'Extrem esquerre tancat (−2), dret obert (3): domini = [−2, 3).',recExplain:'La funció és constant y=1: recorregut = {1}.'},
  ];
  const L2=[
    {draw(s){makeBase(s);plotFn(x=>Math.sqrt(x),0,4.5,'#3a7bd5',s,2.6,'right');dot(0,0,'#3a7bd5',true,s);},domOpts:['[0, +∞)','(0, +∞)','(−∞,+∞)','[0, 4]'],domAns:0,recOpts:['[0, +∞)','(0, +∞)','(−∞,+∞)','[0, 4]'],recAns:0,domExplain:'√x necessita x ≥ 0: domini = [0, +∞).',recExplain:'√x ≥ 0 sempre: recorregut = [0, +∞).'},
    {draw(s){makeBase(s);plotFn(x=>2/x,-4,-0.3,'#e63946',s,2.6,'both');plotFn(x=>2/x,0.3,4,'#e63946',s,2.6,'both');},domOpts:['(−∞,0)∪(0,+∞)','(0,+∞)','(−∞,+∞)','[−4,4]'],domAns:0,recOpts:['(−∞,0)∪(0,+∞)','(0,+∞)','(−∞,+∞)','(−2,2)'],recAns:0,domExplain:'No es pot dividir per 0: domini = (−∞,0)∪(0,+∞).',recExplain:'2/x mai val 0: recorregut = (−∞,0)∪(0,+∞).'},
    {draw(s){makeBase(s);plotFn(x=>Math.sqrt(4-x*x),-2,2,'#7b5ea7',s);dot(-2,0,'#7b5ea7',true,s);dot(2,0,'#7b5ea7',true,s);},domOpts:['[−2, 2]','(−2, 2)','[0, 2]','(−∞,+∞)'],domAns:0,recOpts:['[0, 2]','(0, 2)','[−2, 2]','(−∞,+∞)'],recAns:0,domExplain:'4−x²≥0 → −2≤x≤2: domini = [−2, 2].',recExplain:'Semicercle superior: y entre 0 i 2. Recorregut = [0, 2].'},
    {draw(s){makeBase(s);plotSeg(-4,2,-1,2,'#2a9d8f',false,true,s);plotSeg(-1,-1,3,-1,'#2a9d8f',false,true,s);},domOpts:['(−4,−1]∪(−1,3]','(−4,3]','[−4,3]','(−4,−1)∪(−1,3]'],domAns:[0,1],recOpts:['{−1, 2}','[−1,2]','(−1,2)','(−∞,+∞)'],recAns:0,domExplain:'Dos trams: (−4,−1]∪(−1,3]. Com que −1 no pertany a cap dels dos, és equivalent a (−4,3]. Les dues opcions són correctes!',recExplain:'Pren dos valors: recorregut = {−1, 2}.'},
    {draw(s){makeBase(s);plotFn(x=>Math.abs(x-1)-2,-4,4,'#f4a261',s,2.6,'both');},domOpts:['(−∞,+∞)','[0,+∞)','[−1,+∞)','[1,+∞)'],domAns:0,recOpts:['[−2,+∞)','(−∞,+∞)','[0,+∞)','(−2,+∞)'],recAns:0,domExplain:'Valor absolut definit per tot x: domini = (−∞,+∞).',recExplain:'Mínim a x=1 → y=−2, creix cap a +∞: recorregut = [−2, +∞).'},
  ];
  const L3=[
    {draw(s){makeBase(s);plotFn(x=>Math.sqrt(3-Math.abs(x)),-3,3,'#3a7bd5',s);dot(-3,0,'#3a7bd5',true,s);dot(3,0,'#3a7bd5',true,s);},domOpts:['[−3, 3]','(−3, 3)','[0, 3]','(−∞,+∞)'],domAns:0,recOpts:['[0, √3] ≈ [0, 1.73]','[0, 3]','(0, √3)','[0,+∞)'],recAns:0,domExplain:'3−|x|≥0 → |x|≤3: domini = [−3, 3].',recExplain:'Màxim a x=0: y=√3≈1.73. Mínims als extrems x=±3: y=0. Recorregut = [0, √3].'},
    {draw(s){makeBase(s);
      plotFn(x=>x+1,-4,4,'#7b5ea7',s,2.4,'both');
      dot(1,2,'#7b5ea7',false,s);
    },domOpts:['(−∞,1)∪(1,+∞)','(−∞,+∞)','(1,+∞)','[0,+∞)'],domAns:0,recOpts:['(−∞,2)∪(2,+∞)','(−∞,+∞)','(2,+∞)','[0,+∞)'],recAns:0,domExplain:'(x²−1)/(x−1) = x+1 però x≠1: domini = (−∞,1)∪(1,+∞).',recExplain:'La recta x+1 sense el punt (1,2): recorregut = (−∞,2)∪(2,+∞).'},
    {draw(s){makeBase(s);plotFn(x=>1/(x*x),-4,-0.3,'#e63946',s,2.6,'both');plotFn(x=>1/(x*x),0.3,4,'#e63946',s,2.6,'both');},domOpts:['(−∞,0)∪(0,+∞)','(0,+∞)','(−∞,+∞)','[0,+∞)'],domAns:0,recOpts:['(0, +∞)','(−∞,0)∪(0,+∞)','[0,+∞)','(−∞,+∞)'],recAns:0,domExplain:'x²≠0 → x≠0: domini = (−∞,0)∪(0,+∞).',recExplain:'1/x²>0 sempre: recorregut = (0, +∞).'},
    {draw(s){makeBase(s);
      plotFn(x=>-x-3,-4,-1,'#2a9d8f',s,2.6,'left');dot(-1,-2,'#2a9d8f',true,s);
      plotFn(x=>x*x-2,-1,2,'#2a9d8f',s);dot(-1,-1,'#2a9d8f',false,s);dot(2,2,'#2a9d8f',false,s);
      plotFn(x=>3,2,4,'#2a9d8f',s,2.6,'right');dot(2,3,'#2a9d8f',true,s);
    },domOpts:['[−4, 4)','(−4,4)','[−4,+∞)','(−∞,+∞)'],domAns:0,recOpts:['[−2, 3]','(−∞,+∞)','(−2,3)','[−2,+∞)'],recAns:0,domExplain:'Definida de x=−4 (tancat) fins x=4 (obert per la fletxa del tram constant): domini = [−4, 4).',recExplain:'Tram 1: y∈[−2,1], tram 2: y∈(−1,2), tram 3: y=3. Unió = [−2, 3].'},
    {draw(s){makeBase(s);plotFn(x=>Math.log(x+3)/Math.log(2),-2.9,4.5,'#f4a261',s,2.6,'right');arrowContinues(-2.9,-5,'down','#f4a261',s);},domOpts:['(−3, +∞)','[−3, +∞)','(−∞,+∞)','(0,+∞)'],domAns:0,recOpts:['(−∞,+∞)','(0,+∞)','[0,+∞)','(−3,+∞)'],recAns:0,domExplain:'log₂(x+3) necessita x+3>0 → x>−3: domini = (−3, +∞).',recExplain:'El logaritme pren tots els valors reals: recorregut = (−∞,+∞).'},
    // Funció a trossos acotada: dom=[−4,3), rec=[−6,4] ... simplifiquem per a 3r ESO
    {draw(s){makeBase(s);
      plotFn(x=>-0.5*x+2,-4,0,'#3a7bd5',s,2.6,'left');dot(0,2,'#3a7bd5',false,s);
      plotFn(x=>-x*x+3,0,Math.sqrt(3),'#3a7bd5',s);dot(0,3,'#3a7bd5',true,s);dot(Math.sqrt(3),0,'#3a7bd5',true,s);
    },domOpts:['[−4, √3]','(−4, √3)','[−4, 3)','(−∞,+∞)'],domAns:0,recOpts:['[0, 4]','(0, 4)','[0, 3]','(−∞,+∞)'],recAns:0,domExplain:'Tram 1: de x=−4 fins x=0 (obert). Tram 2: de x=0 fins x=√3 (tots dos tancats). Domini = [−4, √3].',recExplain:'Tram 1: f(−4)=4 (màx), f(0)=2. Tram 2: f(0)=3, f(√3)=0. Valors y ∈ [0, 4]. Recorregut = [0, 4].'},
  ];
  const banks={1:L1,2:L2,3:L3};
  return shuffleArr([...banks[level]]).slice(0,level===1?4:4);
}

// ═══════════════════════════════════════════════════════
// GAME 2: CONTINUÏTAT
// ═══════════════════════════════════════════════════════
function continuitatBank(level){
  const L1=[
    {draw(s){makeBase(s);plotFn(x=>0.7*x-1,-4,4,'#3a7bd5',s,2.6,'both');},continuous:true,explain:'Recta: dibuix d\'un sol traç, sense cap interrupció. Contínua.'},
    {draw(s){makeBaseScaled(s,10,4);plotFnS(x=>x*x-2,-4,4,'#7b5ea7',s,2.6,'both');},continuous:true,explain:'Paràbola: corba sense interrupcions. Contínua.'},
    {draw(s){makeBase(s);plotFn(x=>-0.5*x+1,-4,4,'#2a9d8f',s,2.6,'both');},continuous:true,explain:'Recta decreixent: cap salt possible. Contínua.'},
    {draw(s){makeBase(s);plotSeg(-4,-2,0,-2,'#e63946',true,false,s);dot(0,-2,'#e63946',true,s);dot(0,2,'#e63946',false,s);plotSeg(0,2,4,2,'#e63946',false,true,s);},continuous:false,explain:'Salt clar a x=0: la funció salta de −2 a 2. Discontinuïtat a x=0.'},
    {draw(s){makeBase(s);plotSeg(-4,1,-2,1,'#f4a261',true,true,s);plotSeg(-1,-1,3,-1,'#f4a261',true,true,s);},continuous:false,explain:'Dos trams separats (forat entre x=−2 i x=−1): no contínua.'},
    {draw(s){makeBase(s);plotFn(x=>Math.abs(x),-4,4,'#3a7bd5',s,2.6,'both');},continuous:true,explain:'Valor absolut: angle a x=0 però sense salt. Contínua.'},
    // Nova: cúbica en S (imatge 2) — contínua
    {draw(s){makeBase(s);plotFn(x=>-0.5*x*x*x+1.5*x,-3,3,'#7b5ea7',s,2.6,'both');},continuous:true,explain:'Cúbica en forma de S: es pot dibuixar sense aixecar el llapis. Contínua.'},
    // Nova: funció a trossos contínua per unió exacta
    {draw(s){makeBase(s);
      plotFn(x=>x+2,-4,0,'#2a9d8f',s,2.6,'left');dot(0,2,'#2a9d8f',true,s);
      plotFn(x=>-x+2,0,4,'#2a9d8f',s,2.6,'right');dot(0,2,'#2a9d8f',false,s);
    },continuous:true,explain:'Els dos trams es troben exactament a (0,2): Contínua.'},
  ];
  const L2=[
    {draw(s){makeBase(s);plotFn(x=>x*x*x*0.12,-4,4,'#7b5ea7',s,2.6,'both');},continuous:true,explain:'Cúbica: corba suau sense interrupcions. Contínua.'},
    {draw(s){makeBase(s);plotFn(x=>1/x,-4,-0.3,'#e63946',s,2.6,'both');plotFn(x=>1/x,0.3,4,'#e63946',s,2.6,'both');},continuous:false,explain:'1/x no està definida a x=0: discontinuïtat a x=0.'},
    {draw(s){makeBase(s);
      plotFn(x=>-x-1,-4,-1,'#2a9d8f',s,2.6,'left');dot(-1,0,'#2a9d8f',true,s);
      plotFn(x=>x*x,-1,2,'#2a9d8f',s);dot(-1,1,'#2a9d8f',false,s);dot(2,4,'#2a9d8f',false,s);
      plotFn(x=>2*x-2,2,4,'#2a9d8f',s,2.6,'right');dot(2,2,'#2a9d8f',true,s);
    },continuous:false,explain:'Salts a x=−1 (tram 1 acaba a 0, tram 2 comença a 1) i a x=2 (paràbola val 4, tram 3 comença a 2). Dues discontinuïtats.'},
    {draw(s){makeBase(s);plotFn(x=>Math.sin(x*1.5)*2,-4,4,'#f4a261',s,2.6,'both');},continuous:true,explain:'Sinusoide: ondulació contínua sense interrupcions. Contínua.'},
    {draw(s){makeBase(s);
      plotSeg(-4,-1,-1,-1,'#3a7bd5',true,false,s);dot(-1,-1,'#3a7bd5',true,s);dot(-1,1,'#3a7bd5',false,s);
      plotSeg(-1,1,2,1,'#3a7bd5',false,false,s);dot(2,1,'#3a7bd5',false,s);dot(2,3,'#3a7bd5',true,s);
      plotSeg(2,3,4,3,'#3a7bd5',false,true,s);
    },continuous:false,explain:'Dos salts: a x=−1 i x=2. Discontinuïtats a x=−1 i x=2.'},
    {draw(s){makeBase(s);plotFn(x=>Math.pow(Math.abs(x),0.5)*Math.sign(x),-4,4,'#7b5ea7',s,2.6,'both');},continuous:true,explain:'Arrel signada: corba suau que passa per (0,0) sense salt. Contínua.'},
  ];
  const L3=[
    {draw(s){makeBase(s);
      plotFn(x=>x+2,-4,4,'#3a7bd5',s,2.4,'both');
      dot(0,2,'#3a7bd5',false,s);dot(0,0,'#3a7bd5',true,s);
    },continuous:false,explain:'Forat a x=0 i el valor real és diferent (punt desplaçat): discontinuïtat evitable a x=0.'},
    {draw(s){makeBase(s);plotFn(x=>x*x*x-4*x,-3.5,3.5,'#e63946',s,2.6,'both');},continuous:true,explain:'Polinomi de grau 3: els polinomis sempre són continus. Contínua.'},
    {draw(s){makeBase(s);plotFn(x=>1/(x*x-4),-1.8,1.8,'#f4a261',s,2.6,'both');plotFn(x=>1/(x*x-4),-4,-2.2,'#f4a261',s);plotFn(x=>1/(x*x-4),2.2,4,'#f4a261',s);},continuous:false,explain:'1/(x²−4): no definida a x=±2. Discontinuïtats a x=−2 i x=2.'},
    {draw(s){makeBase(s);
      plotFn(x=>x*x+1,-4,0,'#2a9d8f',s,2.6,'left');dot(0,1,'#2a9d8f',true,s);
      plotFn(x=>-x+1,0,4,'#2a9d8f',s,2.6,'right');
    },continuous:true,explain:'Els dos trams s\'uneixen exactament a x=0 (tots dos valen 1): Contínua.'},
    {draw(s){makeBase(s);plotFn(x=>Math.pow(Math.abs(x),0.33)*Math.sign(x),-4,4,'#7b5ea7',s,2.6,'both');},continuous:true,explain:'Arrel cúbica: contínua i definida per a tot x, inclòs x=0. Contínua.'},
    {draw(s){makeBase(s);
      plotFn(x=>x*x*x*0.3-x,-3.5,3.5,'#3a7bd5',s,2.6,'both');
      dot(0,0,'#3a7bd5',false,s);dot(0,1,'#3a7bd5',true,s);
    },continuous:false,explain:'Forat a x=0 (valor desplaçat a y=1): discontinuïtat evitable a x=0.'},
  ];
  const banks={1:L1,2:L2,3:L3};
  return shuffleArr([...banks[level]]).slice(0,level===1?4:level===2?5:6);
}

// ═══════════════════════════════════════════════════════
// GAME 3: PUNTS DE TALL
// ═══════════════════════════════════════════════════════
function puntsTallBank(level){
  const L1=[
    // Rectes i paràboles senzilles
    {draw(s){makeBase(s);plotFn(x=>x-3,-4,4,'#3a7bd5',s,2.6,'both');},optsX:['(3, 0)','(−3, 0)','(0, 3)','Cap'],optsY:['(0, −3)','(0, 3)','(3, 0)','Cap'],ansX:0,ansY:0,exX:'f(x)=0 → x−3=0 → x=3.',exY:'f(0)=0−3=−3.'},
    {draw(s){makeBase(s);plotFn(x=>2*x,-4,4,'#2a9d8f',s,2.6,'both');},optsX:['(0, 0)','Cap','(2, 0)','(−2, 0)'],optsY:['(0, 0)','(0, 2)','(0, −2)','Cap'],ansX:0,ansY:0,exX:'2x=0 → x=0: tall a l\'origen.',exY:'f(0)=0: passa per l\'origen.'},
    {draw(s){makeBaseScaled(s,10,4);plotFnS(x=>x*x-9,-4,4,'#7b5ea7',s,2.6,'both');},optsX:['(−3,0) i (3,0)','(3,0)','(−9,0)','Cap'],optsY:['(0,−9)','(0,9)','(0,3)','(0,−3)'],ansX:0,ansY:0,exX:'x²−9=0 → x=±3.',exY:'f(0)=0−9=−9.'},
    {draw(s){makeBase(s);plotFn(x=>-x+2,-4,4,'#f4a261',s,2.6,'both');},optsX:['(2, 0)','(−2, 0)','(0, 2)','Cap'],optsY:['(0, 2)','(0, −2)','(2, 0)','Cap'],ansX:0,ansY:0,exX:'−x+2=0 → x=2.',exY:'f(0)=2.'},
    {draw(s){makeBaseScaled(s,12,4);plotFnS(x=>x*x+1,-4,4,'#e63946',s,2.6,'both');},optsX:['Cap','(0,0)','(1,0) i (−1,0)','(1,0)'],optsY:['(0,1)','(0,−1)','(1,0)','Cap'],ansX:0,ansY:0,exX:'x²+1>0 sempre: no talla l\'eix X.',exY:'f(0)=1.'},
  ];
  const L2=[
    // Funcions de grau 2 amb talls no enters, cúbiques simples
    {draw(s){makeBaseScaled(s,8,4);plotFnS(x=>x*x-2*x-3,-4,4,'#3a7bd5',s,2.6,'both');},optsX:['(−1,0) i (3,0)','(3,0)','(−3,0) i (1,0)','Cap'],optsY:['(0,−3)','(0,3)','(0,−1)','Cap'],ansX:0,ansY:0,exX:'x²−2x−3=(x−3)(x+1)=0 → x=3 i x=−1.',exY:'f(0)=0−0−3=−3.'},
    {draw(s){makeBaseScaled(s,10,4);plotFnS(x=>2*x*x-8,-4,4,'#7b5ea7',s,2.6,'both');},optsX:['(−2,0) i (2,0)','(2,0)','(−4,0)','Cap'],optsY:['(0,−8)','(0,8)','(0,−2)','Cap'],ansX:0,ansY:0,exX:'2x²−8=0 → x²=4 → x=±2.',exY:'f(0)=−8.'},
    {draw(s){makeBase(s);plotFn(x=>x*x*x*0.3,-4,4,'#2a9d8f',s,2.6,'both');},optsX:['(0, 0)','Cap','(1,0)','(−1,0)'],optsY:['(0, 0)','(0, 1)','Cap','(0, −1)'],ansX:0,ansY:0,exX:'0.3x³=0 → x=0: un sol tall a l\'origen.',exY:'f(0)=0: tall a l\'origen.'},
    {draw(s){makeBaseScaled(s,6,4);plotFnS(x=>-x*x+2*x+3,-4,4,'#f4a261',s,2.6,'both');},optsX:['(−1,0) i (3,0)','(3,0)','(1,0)','Cap'],optsY:['(0,3)','(0,−3)','(0,1)','Cap'],ansX:0,ansY:0,exX:'−x²+2x+3=0 → x²−2x−3=0 → (x−3)(x+1)=0 → x=3, x=−1.',exY:'f(0)=3.'},
    {draw(s){makeBaseScaled(s,10,4);plotFnS(x=>x*x-4*x+4,-4,4,'#e63946',s,2.6,'both');},optsX:['(2, 0)','(−2,0) i (2,0)','Cap','(4,0)'],optsY:['(0, 4)','(0, −4)','(0, 2)','Cap'],ansX:0,ansY:0,exX:'(x−2)²=0 → x=2 (tall doble, un sol punt).',exY:'f(0)=0−0+4=4.'},
  ];
  const L3=[
    // Polinomis cúbics, funcions compostes, talls no trivials
    {draw(s){makeBase(s);plotFn(x=>x*x*x-x,-3,3,'#3a7bd5',s,2.6,'both');},optsX:['(−1,0), (0,0) i (1,0)','(0,0)','(−1,0) i (1,0)','Cap'],optsY:['(0, 0)','(0, 1)','Cap','(0, −1)'],ansX:0,ansY:0,exX:'x³−x=x(x²−1)=x(x−1)(x+1)=0 → x=0,±1.',exY:'f(0)=0.'},
    {draw(s){makeBase(s);plotFn(x=>(x-1)*(x+2)*(x-3)*0.1,-3.5,4,'#7b5ea7',s,2.6,'both');},optsX:['(−2,0), (1,0) i (3,0)','(1,0) i (3,0)','(−2,0) i (3,0)','Cap'],optsY:['(0, 0.6)','(0,−0.6)','(0,0)','Cap'],ansX:0,ansY:0,exX:'Les arrels del polinomi factoritzat: x=−2, x=1, x=3.',exY:'f(0)=(−1)(2)(−3)·0.1=0.6.'},
    {draw(s){makeBase(s);plotFn(x=>Math.abs(x)-2,-4,4,'#2a9d8f',s,2.6,'both');},optsX:['(−2,0) i (2,0)','(2,0)','Cap','(0,−2)'],optsY:['(0,−2)','(0,2)','(−2,0)','Cap'],ansX:0,ansY:0,exX:'|x|−2=0 → |x|=2 → x=±2.',exY:'f(0)=|0|−2=−2.'},
    {draw(s){makeBase(s);plotFn(x=>x*x*x-3*x*x,-1,4,'#f4a261',s,2.6,'both');},optsX:['(0,0) i (3,0)','(3,0)','(0,0)','Cap'],optsY:['(0, 0)','(0,−3)','Cap','(0,3)'],ansX:0,ansY:0,exX:'x³−3x²=x²(x−3)=0 → x=0 (doble) i x=3.',exY:'f(0)=0.'},
    {draw(s){makeBase(s);plotFn(x=>Math.sqrt(Math.abs(x))-1,-4.5,4.5,'#e63946',s,2.6,'both');},optsX:['(−1,0) i (1,0)','(1,0)','Cap','(0,−1)'],optsY:['(0,−1)','(0,1)','Cap','(−1,0)'],ansX:0,ansY:0,exX:'√|x|=1 → |x|=1 → x=±1.',exY:'f(0)=0−1=−1.'},
  ];
  const banks={1:L1,2:L2,3:L3};
  return shuffleArr([...banks[level]]).slice(0,level===1?4:level===2?4:5);
}

// ═══════════════════════════════════════════════════════
// GAME 4: CREIXEMENT I EXTREMS
// ═══════════════════════════════════════════════════════
function creixementBank(level){
  const L1=[
    // Rectes amb pendents i ordenades variades
    {draw(s){makeBase(s);plotFn(x=>x,-4,4,'#3a7bd5',s,2.6,'both');},creixOpts:['(−∞,+∞)','(0,+∞)','Cap','(−∞,0)'],decOpts:['No decreix','(−∞,+∞)','(0,+∞)','(−∞,0)'],maxOpts:['Cap màxim','x=0,y=0','x=4,y=4','x=1,y=1'],minOpts:['Cap mínim','x=0,y=0','x=−1,y=−1','x=1,y=1'],ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,exCreix:'Recta pendent positiu: sempre creixent.',exDecr:'Recta creixent: no decreix mai.',exMax:'Recta sense límit: no té màxim absolut.',exMin:'Recta sense límit: no té mínim absolut.'},
    {draw(s){makeBase(s);plotFn(x=>-x+1,-4,4,'#e63946',s,2.6,'both');},creixOpts:['No creix','(−∞,+∞)','(0,+∞)','(−∞,0)'],decOpts:['(−∞,+∞)','No decreix','(0,+∞)','(−∞,0)'],maxOpts:['Cap màxim','x=0,y=1','x=1,y=0','x=−1,y=2'],minOpts:['Cap mínim','x=0,y=1','x=1,y=0','x=−1,y=2'],ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,exCreix:'Recta pendent negatiu: no creix mai.',exDecr:'Sempre decreixent: (−∞,+∞).',exMax:'Recta sense límit cap amunt: no té màxim absolut.',exMin:'Recta sense límit cap avall: no té mínim absolut.'},
    {draw(s){makeBase(s);plotFn(x=>2*x-1,-4,4,'#2a9d8f',s,2.6,'both');},creixOpts:['(−∞,+∞)','(0,+∞)','No creix','(−∞,0)'],decOpts:['No decreix','(−∞,+∞)','(0,+∞)','(−∞,0)'],maxOpts:['Cap màxim','x=0,y=−1','x=0.5,y=0','x=1,y=1'],minOpts:['Cap mínim','x=0,y=−1','x=0.5,y=0','x=1,y=1'],ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,exCreix:'Recta pendent 2 (positiu): sempre creixent.',exDecr:'No decreix mai.',exMax:'No té màxim absolut.',exMin:'No té mínim absolut.'},
    {draw(s){makeBase(s);plotFn(x=>-0.5*x+2,-4,4,'#f4a261',s,2.6,'both');},creixOpts:['No creix','(−∞,+∞)','(0,+∞)','(−∞,0)'],decOpts:['(−∞,+∞)','No decreix','(0,+∞)','(−∞,0)'],maxOpts:['Cap màxim','x=0,y=2','x=4,y=0','x=−4,y=4'],minOpts:['Cap mínim','x=0,y=2','x=4,y=0','x=−4,y=4'],ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,exCreix:'Recta pendent −0.5 (negatiu): no creix.',exDecr:'Sempre decreixent: (−∞,+∞).',exMax:'No té màxim absolut.',exMin:'No té mínim absolut.'},
    {draw(s){makeBaseScaled(s,12,4);plotFnS(x=>x*x-1,-4,4,'#7b5ea7',s,2.6);arrowFnScaled(x=>x*x-1,-4,4,'both','#7b5ea7',s);},creixOpts:['(0,+∞)','(−∞,0)','(−∞,+∞)','(−∞,−1)'],decOpts:['(−∞,0)','(0,+∞)','No decreix','(−∞,−1)'],maxOpts:['Cap màxim','x=0,y=−1','x=1,y=0','x=−1,y=0'],minOpts:['x=0, y=−1','Cap mínim','x=1,y=0','x=−1,y=0'],ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,exCreix:'Paràbola cap amunt: creix a la dreta del vèrtex (x=0).',exDecr:'Decreix a l\'esquerra del vèrtex (x=0).',exMax:'Paràbola cap amunt: no té màxim absolut.',exMin:'Vèrtex = mínim absolut: (0,−1).'},
    {draw(s){makeBaseScaled(s,8,4);plotFnS(x=>-x*x+4,-4,4,'#2a9d8f',s,2.6);arrowFnScaled(x=>-x*x+4,-4,4,'both','#2a9d8f',s);},creixOpts:['(−∞,0)','(0,+∞)','(−∞,+∞)','No creix'],decOpts:['(0,+∞)','(−∞,0)','No decreix','(−∞,+∞)'],maxOpts:['x=0, y=4','Cap màxim','x=4,y=0','x=2,y=0'],minOpts:['Cap mínim','x=0,y=4','x=2,y=0','x=−2,y=0'],ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,exCreix:'Paràbola cap avall: creix fins al vèrtex (x=0).',exDecr:'Decreix a la dreta del vèrtex (x=0).',exMax:'Vèrtex = màxim absolut: (0,4).',exMin:'Paràbola cap avall: no té mínim absolut.'},
    // Cúbica en S: f(x)=−0.5x³+1.5x → f'=−1.5x²+1.5=0 → x=±1
    // f'(0)=1.5>0: creix al CENTRE (−1,1). f'(2)=−4.5<0: decreix als EXTREMS
    // f(1)=1 (MÀXIM), f(−1)=−1 (MÍNIM)
    {draw(s){makeBase(s);plotFn(x=>-0.5*x*x*x+1.5*x,-3,3,'#f4a261',s,2.6,'both');},
      creixOpts:['(−1, 1)','(−∞,−1) i (1,+∞)','(−∞,+∞)','No creix'],
      decOpts:['(−∞,−1) i (1,+∞)','(−1,1)','No decreix','(−∞,+∞)'],
      maxOpts:['x=1, y=1','x=−1, y=−1','x=0, y=0','Cap màxim'],
      minOpts:['x=−1, y=−1','x=1, y=1','x=0, y=0','Cap mínim'],
      ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,
      exCreix:'f\'=−1.5x²+1.5=0 → x=±1. f\'(0)=1.5>0: creix al centre, interval (−1,1).',
      exDecr:'f\'(2)=−4.5<0: decreix als extrems, intervals (−∞,−1)∪(1,+∞).',
      exMax:'Màxim local a x=1: f(1)=−0.5+1.5=1.',
      exMin:'Mínim local a x=−1: f(−1)=0.5−1.5=−1.'},
  ];
  const L2=[
    // Cúbiques simples, paràboles desplaçades, funcions a trossos
    // f(x)=x³/3 − x² → f'=x²−2x=x(x−2)=0 → x=0 (màxim local), x=2 (mínim local) — enters!
    // f(0)=0, f(2)=8/3−4=−4/3≈−1.33
    {draw(s){makeBase(s);plotFn(x=>x*x*x/3-x*x,-3,4,'#3a7bd5',s,2.6,'both');},
      creixOpts:['(−∞,0) i (2,+∞)','(0,2)','(−∞,+∞)','No creix'],
      decOpts:['(0,2)','(−∞,0) i (2,+∞)','No decreix','(0,+∞)'],
      maxOpts:['x=0, y=0','x=2, y=−4/3','Cap màxim','x=−1,y=−4/3'],
      minOpts:['x=2, y≈−1.33','x=0, y=0','Cap mínim','x=−2,y=0'],
      ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,
      exCreix:'f\'=x²−2x=x(x−2)=0 → x=0 i x=2. Creix a (−∞,0)∪(2,+∞).',
      exDecr:'Decreix a l\'interval (0,2).',
      exMax:'Màxim local a x=0: f(0)=0.',
      exMin:'Mínim local a x=2: f(2)=8/3−4≈−1.33.'},
    {draw(s){makeBase(s);plotFn(x=>-0.5*(x-2)*(x-2)+3,-1,5,'#7b5ea7',s,2.6);dot(-1,-1.5,'#7b5ea7',true,s);dot(5,-1.5,'#7b5ea7',true,s);},creixOpts:['(−∞,2)','(2,+∞)','(−∞,+∞)','No creix'],decOpts:['(2,+∞)','(−∞,2)','No decreix','(−∞,+∞)'],maxOpts:['x=2, y=3','x=3, y=2','Cap màxim','x=0,y=1'],minOpts:['Cap mínim','x=2,y=3','x=0,y=1','x=3,y=2'],ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,exCreix:'Creix fins al vèrtex desplaçat a x=2.',exDecr:'Decreix a partir de x=2.',exMax:'Vèrtex desplaçat = màxim: (2,3).',exMin:'Paràbola cap avall: no té mínim.'},
    {draw(s){makeBase(s);// Piecewise: decreasing then increasing (V shape)
      plotFn(x=>-x-1,-4,0,'#2a9d8f',s,2.6,'left');dot(0,-1,'#2a9d8f',true,s);
      plotFn(x=>x-1,0,4,'#2a9d8f',s,2.6,'right');
    },creixOpts:['(0,+∞)','(−∞,0)','(−∞,+∞)','No creix'],decOpts:['(−∞,0)','(0,+∞)','No decreix','(−∞,+∞)'],maxOpts:['Cap màxim','x=0,y=−1','x=−1,y=0','x=1,y=0'],minOpts:['x=0, y=−1','Cap mínim','x=−1,y=0','x=1,y=0'],ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,exCreix:'Creix a la dreta de x=0.',exDecr:'Decreix a l\'esquerra de x=0.',exMax:'En forma de V: no té màxim.',exMin:'Punt de canvi = mínim: (0,−1).'},
    {draw(s){makeBase(s);plotFn(x=>Math.sin(x*1.5+0.5)*2.5,-4,4,'#f4a261',s,2.6,'both');},creixOpts:['Intervals on la gràfica puja (cap a x≈−2 i x≈2)','(−4, 4) tot','No creix mai','(0, 2) únicament'],decOpts:['Intervals on la gràfica baixa (cap a x≈−4, x≈0 i x≈4)','No decreix mai','Tot (−4,4)','(0, 2) únicament'],maxOpts:['Als cims de cada ona visible','x=0, y=0','x=2, y=0','Cap màxim'],minOpts:['A les valls de cada ona visible','Cap mínim','x=0, y=0','x=2, y=0'],ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,exCreix:'La sinusoide creix entre cada mínim i el màxim següent: observa on la corba puja.',exDecr:'Decreix entre cada màxim i el mínim següent: observa on la corba baixa.',exMax:'Els màxims locals estan als cims (punts més alts) de cada ona.',exMin:'Els mínims locals estan a les valls (punts més baixos) de cada ona.'},
    // Inspirada imatge 1: funció a trossos creix-decreix-creix
    {draw(s){makeBase(s);
      plotFn(x=>-0.5*x+2,-4,0,'#e63946',s,2.6,'left');dot(0,2,'#e63946',true,s);
      plotFn(x=>-(x-3)*(x-3)*0.4+4,0,4,'#e63946',s,2.6,'right');dot(0,4,'#e63946',false,s);
    },creixOpts:['(0, 3)','(−∞,+∞)','(−∞, 3)','No creix'],decOpts:['(−∞,0) i (3,+∞)','(−∞,0)','No decreix','(3,+∞)'],maxOpts:['x=3, y=4','x=0, y=2','Cap màxim','x=−4, y=4'],minOpts:['Cap mínim absolut (decreix cap a −∞)','x=3,y=4','x=0,y=2','x=−4,y=4'],ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,exCreix:'El segon tram (paràbola) creix de x=0 fins al vèrtex x=3.',exDecr:'El primer tram (recta pendent −0.5) decreix sempre; el segon tram decreix a partir del vèrtex x=3.',exMax:'Màxim local al vèrtex de la paràbola: (3,4).',exMin:'No té mínim absolut: el primer tram decreix cap a −∞ cap a x=−∞.'},
  ];
  const L3=[
    // Polinomis de grau 3 amb punts crítics ENTERS
    // f(x)=x³−3x → f'=3x²−3=0 → x=±1 (enters!) → f(−1)=2, f(1)=−2
    {draw(s){makeBase(s);plotFn(x=>x*x*x-3*x,-3.5,3.5,'#3a7bd5',s,2.6,'both');},
      creixOpts:['(−∞,−1) i (1,+∞)','(−∞,+∞)','(0,+∞)','(−1,1)'],
      decOpts:['(−1, 1)','(−∞,+∞)','No decreix','(0,+∞)'],
      maxOpts:['x=−1, y=2','x=1, y=−2','x=0, y=0','Cap màxim'],
      minOpts:['x=1, y=−2','x=−1, y=2','x=0, y=0','Cap mínim'],
      ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,
      exCreix:'f\'(x)=3x²−3=3(x²−1)=0 → x=±1. Creix fora de (−1,1).',
      exDecr:'Decreix a l\'interval (−1,1).',
      exMax:'Màxim local a x=−1: f(−1)=−1+3=2.',
      exMin:'Mínim local a x=1: f(1)=1−3=−2.'},
    // f(x)=x⁴−8x²+7 → f'=4x³−16x=4x(x²−4)=0 → x=0,±2 (enters!) → f(0)=7, f(±2)=16−32+7=−9
    {draw(s){makeBaseScaled(s,12,4);plotFnS(x=>x*x*x*x-8*x*x+7,-3.5,3.5,'#7b5ea7',s,2.6,'both');},
      creixOpts:['(−2,0) i (2,+∞)','(0,+∞)','(−∞,+∞)','No creix'],
      decOpts:['(−∞,−2) i (0,2)','(−∞,0)','No decreix','(−∞,+∞)'],
      maxOpts:['x=0, y=7','x=2, y=−9','Cap màxim','x=−2, y=−9'],
      minOpts:['x=2 i x=−2, y=−9','x=0, y=7','Cap mínim','x=1, y=0'],
      ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,
      exCreix:'f\'=4x(x²−4)=4x(x−2)(x+2)=0 → x=0,±2. Creix a (−2,0)∪(2,+∞).',
      exDecr:'Decreix a (−∞,−2)∪(0,2).',
      exMax:'Màxim local al centre: f(0)=7.',
      exMin:'Mínims locals a x=±2: f(2)=16−32+7=−9.'},
    // f(x)=x³−6x²+9x → f'=3x²−12x+9=3(x²−4x+3)=3(x−1)(x−3)=0 → x=1,3 (enters!)
    // f(1)=1−6+9=4 (màxim), f(3)=27−54+27=0 (mínim)
    {draw(s){makeBase(s);plotFn(x=>x*x*x-6*x*x+9*x,-0.5,4.5,'#2a9d8f',s,2.6,'both');},
      creixOpts:['(−∞,1) i (3,+∞)','(1,3)','(−∞,+∞)','No creix'],
      decOpts:['(1,3)','(−∞,1) i (3,+∞)','No decreix','(0,+∞)'],
      maxOpts:['x=1, y=4','x=3, y=0','x=0, y=0','Cap màxim'],
      minOpts:['x=3, y=0','x=1, y=4','x=0, y=0','Cap mínim'],
      ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,
      exCreix:'f\'=3(x−1)(x−3)=0 → x=1,3. Creix a (−∞,1)∪(3,+∞).',
      exDecr:'Decreix a l\'interval (1,3).',
      exMax:'Màxim local a x=1: f(1)=1−6+9=4.',
      exMin:'Mínim local a x=3: f(3)=27−54+27=0.'},
    // f(x)=−x³+6x²−9x+4 → f'=−3x²+12x−9=−3(x²−4x+3)=−3(x−1)(x−3)=0 → x=1,3
    // f(1)=−1+6−9+4=0 (mínim), f(3)=−27+54−27+4=4 (màxim)
    {draw(s){makeBase(s);plotFn(x=>-x*x*x+6*x*x-9*x+4,-0.5,4.5,'#f4a261',s,2.6,'both');},
      creixOpts:['(1,3)','(−∞,1) i (3,+∞)','(−∞,+∞)','No creix'],
      decOpts:['(−∞,1) i (3,+∞)','(1,3)','No decreix','(0,+∞)'],
      maxOpts:['x=3, y=4','x=1, y=0','Cap màxim','x=0, y=4'],
      minOpts:['x=1, y=0','x=3, y=4','Cap mínim','x=0, y=4'],
      ansCreix:0,ansDecr:0,ansMax:0,ansMin:0,
      exCreix:'f\'=−3(x−1)(x−3)=0 → x=1,3. Creix a (1,3).',
      exDecr:'Decreix a (−∞,1)∪(3,+∞).',
      exMax:'Màxim local a x=3: f(3)=−27+54−27+4=4.',
      exMin:'Mínim local a x=1: f(1)=−1+6−9+4=0.'},
  ];
  const banks={1:L1,2:L2,3:L3};
  return shuffleArr([...banks[level]]).slice(0,level===1?3:level===2?3:4);
}

// ═══════════════════════════════════════════════════════
// GAME 5: ANALITZA LA GRÀFICA (exercici complet estil examen)
// Cada entrada genera 4-6 preguntes sobre la mateixa gràfica
// ═══════════════════════════════════════════════════════
function analitzaBank(level){
  const L1=[
    { // Paràbola simple cap amunt
      draw(s){makeBaseScaled(s,10,4);plotFnS(x=>x*x-4,-4,4,'#3a7bd5',s,2.6,'both');},
      qs:[
        {text:'Quin és el <strong>domini</strong> d\'aquesta funció?',opts:['(−∞,+∞)','[−3.5, 3.5]','[−4, +∞)','(0,+∞)'],ans:0,ex:'Paràbola sense restriccions: domini = (−∞,+∞).'},
        {text:'Quin és el <strong>recorregut</strong>?',opts:['[−4, +∞)','(−∞,+∞)','[0, +∞)','(−4,+∞)'],ans:0,ex:'Mínim al vèrtex y=−4, creix cap a +∞: recorregut = [−4, +∞).'},
        {text:'La funció és <strong>contínua</strong>?',opts:['Sí, és contínua','No, té discontinuïtats'],ans:0,ex:'Paràbola: sempre contínua, cap salt.'},
        {text:'On talla la gràfica l\'<strong>eix X</strong>?',opts:['(−2, 0) i (2, 0)','(0, 0)','(−4, 0)','Cap'],ans:0,ex:'x²−4=0 → x=±2.'},
        {text:'On talla la gràfica l\'<strong>eix Y</strong>?',opts:['(0, −4)','(0, 4)','(0, 2)','Cap'],ans:0,ex:'f(0)=0−4=−4.'},
        {text:'On és el <strong>mínim</strong>?',opts:['x=0, y=−4','x=−2, y=0','x=2, y=0','Cap mínim'],ans:0,ex:'Vèrtex de la paràbola = mínim: (0,−4).'},
      ],pts:10
    },
    { // Recta simple
      draw(s){makeBase(s);plotFn(x=>-x+2,-4,4,'#2a9d8f',s,2.6,'both');},
      qs:[
        {text:'Quin és el <strong>domini</strong>?',opts:['(−∞,+∞)','[−4, 4]','[0,+∞)','(−∞, 2]'],ans:0,ex:'Recta: domini = (−∞,+∞).'},
        {text:'Quin és el <strong>recorregut</strong>?',opts:['(−∞,+∞)','[0,+∞)','[−4, 4]','(−∞, 2]'],ans:0,ex:'Recta: pren tots els valors reals. Recorregut = (−∞,+∞).'},
        {text:'On talla l\'<strong>eix X</strong>?',opts:['(2, 0)','(−2, 0)','(0, 2)','Cap'],ans:0,ex:'−x+2=0 → x=2.'},
        {text:'On talla l\'<strong>eix Y</strong>?',opts:['(0, 2)','(0, −2)','(2, 0)','Cap'],ans:0,ex:'f(0)=2.'},
        {text:'La funció és <strong>creixent o decreixent</strong>?',opts:['Sempre decreixent','Sempre creixent','Creix i decreix','Constant'],ans:0,ex:'Pendent negatiu (−1): sempre decreixent.'},
      ],pts:10
    },
    { // Funció a trossos amb salt
      draw(s){makeBase(s);plotSeg(-3,2,0,2,'#e63946',true,false,s);dot(0,2,'#e63946',true,s);dot(0,-1,'#e63946',false,s);plotSeg(0,-1,3,-1,'#e63946',false,true,s);},
      qs:[
        {text:'Quin és el <strong>domini</strong>?',opts:['[−3, 3]','(−3, 3)','[−3, 0]∪[0, 3]','(−∞,+∞)'],ans:0,ex:'Definida de x=−3 (tancat) fins x=3 (tancat): domini = [−3, 3].'},
        {text:'Quin és el <strong>recorregut</strong>?',opts:['{−1, 2}','[−1, 2]','(−1, 2)','(−∞,+∞)'],ans:0,ex:'Pren dos valors: recorregut = {−1, 2}.'},
        {text:'La funció és <strong>contínua</strong>?',opts:['No, discontinuïtat a x=0','Sí, és contínua','No, discontinuïtat a x=−3','No, discontinuïtat a x=3'],ans:0,ex:'Salt a x=0: el tram superior acaba tancat però l\'inferior comença obert, hi ha un salt de y=2 a y=−1.'},
        {text:'On talla l\'<strong>eix Y</strong>?',opts:['(0, 2)','(0, −1)','No talla','(0, 0)'],ans:0,ex:'A x=0 la funció val 2 (punt tancat del tram superior): tall a (0, 2).'},
      ],pts:10
    },
  ];
  const L2=[
    { // Inspirat en exemple 7 del PDF (pàg.11): gràfica amb discontinuïtat de salt a x=−3
      // dom=(−5,6], Im=[−3,3], creix a (−3,−1)∪(5,6], decreix a (−5,−3)∪(−1,5)
      draw(s){
        makeBase(s);
        // Tram esquerre: (−5,0] fins (−3, valor), recta decreixent de y=1 a y≈−2
        plotFn(x=>-1.5*(x+3)-2,-5,-3,'#3a7bd5',s);
        dot(-5,1.5,'#3a7bd5',false,s);dot(-3,-2,'#3a7bd5',false,s);
        // Salt: a x=−3 puja a y=2 (tancat)
        dot(-3,2,'#3a7bd5',true,s);
        // Tram dret: des de (−3,2) fins (6,−3), puja fins a màxim (−1,3) i baixa
        plotFn(x=>-(x-(-1))*(x-(-1))*0.4+3,-3,6,'#3a7bd5',s);
        dot(-3,2.56,'#3a7bd5',false,s); // paràbola a x=−3 val -(−2)²*0.4+3=−1.6+3=1.4... mostrem salt
        dot(6,-1*5*5*0.4+3,'#3a7bd5',true,s);
      },
      qs:[
        {text:'Quin és el <strong>domini</strong>?',opts:['(−5, 6]','[−5, 6]','(−5, 6)','[−5,6)'],ans:0,ex:'Comença a x=−5 (obert) i acaba a x=6 (tancat): dom(f) = (−5, 6].'},
        {text:'Quin és el <strong>recorregut</strong>?',opts:['[−3, 3]','(−3, 3)','[−3, 3)','[−5, 6]'],ans:0,ex:'Màxim y=3 a x=−1, mínim y=−3 cap a x=5: Im(f) = [−3, 3].'},
        {text:'La funció és <strong>contínua</strong>?',opts:['No, discontinuïtat de salt a x=−3','Sí','No, a x=−5 i x=6','No, a x=−1'],ans:0,ex:'A x=−3 hi ha un salt: el tram esquerre arriba a y≈−2 però el dret comença a y=2 (tancat).'},
        {text:'On talla la gràfica l\'<strong>eix X</strong>?',opts:['x≈−4 i x≈2','Només x=0','x=−5 i x=6','No talla'],ans:0,ex:'La gràfica creua y=0 dues vegades: al tram esquerre cap a x≈−4 i al tram dret cap a x≈2.'},
        {text:'On és el <strong>màxim absolut</strong>?',opts:['x=−1, y=3','x=−5, y=1 aprox','x=6, y=−7 aprox','x=−3, y=2'],ans:0,ex:'El punt més alt és el vèrtex de la paràbola dreta: (−1, 3). Màxim absolut.'},
        {text:'En quin(s) interval(s) la funció és <strong>creixent</strong>?',opts:['(−3, −1)','(−5, −3)','(−1, 6)','(−5, −1)'],ans:0,ex:'Dins del tram dret, la paràbola puja fins al vèrtex x=−1: creixent a (−3, −1).'},
      ],pts:10
    },
    { // Inspirat en la gràfica de la imatge 1 (exercici "Piensa y practica" del PDF pàg.10)
      // Gràfica ondulada: dom=[−4,4], Im≈[1,4.5], contínua, pics i valls visibles
      draw(s){
        makeBase(s);
        // Reprodueix la forma de la imatge: puja a (−4,2), pic (~−2.5,4), vall (~0,1), pic (~2,4), baixa (4,2)
        plotFn(x=>{
          // Suma de cosinus per simular la corba ondulada de la imatge
          return 2.5 + 1.8*Math.cos(x*Math.PI/2.5);
        },-4,4,'#2a9d8f',s);
        dot(-4, 2.5+1.8*Math.cos(-4*Math.PI/2.5),'#2a9d8f',true,s);
        dot( 4, 2.5+1.8*Math.cos( 4*Math.PI/2.5),'#2a9d8f',true,s);
      },
      qs:[
        {text:'Quin és el <strong>domini</strong>?',opts:['[−4, 4]','(−∞,+∞)','(−4, 4)','[0, 4]'],ans:0,ex:'La gràfica comença i acaba als extrems tancats x=−4 i x=4: domini = [−4, 4].'},
        {text:'Quin és el <strong>recorregut</strong> aproximat?',opts:['[0.7, 4.3] aprox','(−∞,+∞)','[0, 5]','[2, 4]'],ans:0,ex:'La corba oscil·la entre un mínim d\'aprox 0.7 i un màxim d\'aprox 4.3.'},
        {text:'La funció és <strong>contínua</strong>?',opts:['Sí, és contínua','No, té un salt a x=0','No, té dos salts','No és contínua'],ans:0,ex:'La corba es pot dibuixar d\'un sol traç: és contínua en tot el seu domini.'},
        {text:'La funció <strong>té simetria</strong>?',opts:['Sí, aproximadament parella (eix Y)','Sí, senar (origen)','Cap simetria','Sí, periòdica'],ans:0,ex:'La forma és aprox simètrica respecte a l\'eix Y (funció parella): f(−x)≈f(x).'},
        {text:'Quants <strong>màxims locals</strong> té en el domini visible?',opts:['2 (aprox x=−2.5 i x=2.5)','1 (x=0)','3','Cap'],ans:0,ex:'Hi ha dos pics visibles: un cap a x≈−2.5 i un cap a x≈2.5.'},
        {text:'En quin(s) interval(s) és <strong>decreixent</strong>?',opts:['(−2.5, 0) i (2.5, 4) aprox','(−4, 0)','(0, 4)','No decreix'],ans:0,ex:'Decreix des de cada màxim fins al mínim central i des del segon màxim fins al final.'},
      ],pts:10
    },
    { // f(x)=x³−3x: talls a x=−√3,0,√3≈±1.73; màxim LOCAL x=−1 f=2; mínim LOCAL x=1 f=−2; senar
      draw(s){
        makeBase(s);
        plotFn(x=>x*x*x-3*x,-3,3,'#f4a261',s,2.6,'both');
      },
      qs:[
        {text:'Quin és el <strong>domini</strong>?',opts:['(−∞,+∞)','[−3, 3]','(−3, 3)','[−2, 2]'],ans:0,ex:'Polinomi: domini = (−∞,+∞) (la gràfica mostra el tram [−3,3] però continua cap a ±∞).'},
        {text:'La funció és <strong>contínua</strong>?',opts:['Sí','No, a x=0','No, a x=±1','No, a x=±√3'],ans:0,ex:'Polinomi: sempre continu, sense cap salt ni forat.'},
        {text:'On talla l\'<strong>eix X</strong>?',opts:['x=−√3≈−1.73, x=0 i x=√3≈1.73','Només x=0','x=−1 i x=1','x=−3 i x=3'],ans:0,ex:'x³−3x=x(x²−3)=0 → x=0 i x=±√3≈±1.73.'},
        {text:'On és el <strong>màxim local</strong>?',opts:['x=−1, y=2','x=0, y=0','x=1, y=−2','x=−√3, y=0'],ans:0,ex:'f\'=3x²−3=0 → x=±1. f(−1)=−1+3=2: màxim local a (−1, 2).'},
        {text:'On és el <strong>mínim local</strong>?',opts:['x=1, y=−2','x=0, y=0','x=−1, y=2','x=√3, y=0'],ans:0,ex:'Mínim local a x=1: f(1)=1−3=−2.'},
        {text:'La funció té <strong>simetria</strong>?',opts:['Sí, senar (respecte a l\'origen)','Sí, parella (eix Y)','Cap simetria','Periòdica'],ans:0,ex:'x³−3x és senar: f(−x)=−x³+3x=−(x³−3x)=−f(x). Simetria respecte a l\'origen.'},
      ],pts:10
    },
  ];
  const L3=[
    { // Paràbola invertida amb discontinuïtat de salt + tram lineal
      // Tram esq: recta creixent (−5,−3) obert-obert; salt a x=−3
      // Tram dret: −(x−1)²+4 de x=−3 a x=5 → f(−3)=−16+4=−12? No.
      // Fem-ho net: paràbola −(x+1)²+4 passant per (−3,0),(1,4),(3,0)
      // f(−3)=−4+4=0, f(1)=0+4=4 (màxim), f(3)=−4+4=0
      // Tram esq: recta y=x+2, x∈(−5,−3) → f(−5)=−3, f(−3)=−1; punt tancat (−3,0)=salt
      draw(s){
        makeBase(s);
        plotFn(x=>x+2,-5,-3,'#7b5ea7',s,2.4);
        dot(-5,-3,'#7b5ea7',false,s); dot(-3,-1,'#7b5ea7',false,s);
        dot(-3,0,'#7b5ea7',true,s);
        plotFn(x=>-(x+1)*(x+1)+4,-3,3,'#7b5ea7',s,2.6);
        dot(-3,0,'#7b5ea7',false,s); dot(3,0,'#7b5ea7',true,s);
      },
      qs:[
        {text:'Quin és el <strong>domini</strong>?',opts:['(−5, 3]','[−5, 3]','(−5, 3)','[−3, 3]'],ans:0,ex:'Comença a x=−5 (obert) i acaba a x=3 (tancat): domini = (−5, 3].'},
        {text:'La funció és <strong>contínua</strong>?',opts:['No, salt a x=−3','Sí','No, a x=1','No, a x=−5 i x=3'],ans:0,ex:'A x=−3: tram esquerre arriba a −1 però el tram dret comença a 0 (tancat). Salt visible.'},
        {text:'On és el <strong>màxim absolut</strong>?',opts:['x=1, y=4','x=−5, y=−3','x=3, y=0','x=−3, y=0'],ans:0,ex:'Vèrtex de la paràbola: f(1)=−(2)²+4=0+4=4. Màxim absolut (1,4).'},
        {text:'On talla la gràfica l\'<strong>eix X</strong>?',opts:['x=−3 i x=3','x=−1 i x=3','Només x=1','Cap'],ans:0,ex:'Tram dret: −(x+1)²+4=0→(x+1)²=4→x=1 o x=−3. Talls a x=−3 (tancat) i x=3 (tancat).'},
        {text:'On talla la gràfica l\'<strong>eix Y</strong>?',opts:['(0, 3)','(0, 0)','No talla','(0, 4)'],ans:0,ex:'A x=0: f(0)=−(1)²+4=3. Tall a (0, 3).'},
        {text:'En quin interval és <strong>creixent</strong>?',opts:['(−3, 1)','(1, 3)','(−5, −3)','(−5, 1)'],ans:0,ex:'La paràbola puja de x=−3 fins al vèrtex x=1: creixent a (−3, 1).'},
      ],pts:10
    },
    { // f a trossos: recta + paràbola + recta. Contínua. Dom=[−4,4]
      // Tram 1: f(x)=x+4, x∈[−4,−2] → f(−4)=0, f(−2)=2
      // Tram 2: f(x)=−x²+2, x∈[−2,2] → f(−2)=−4+2=−2... no empalma
      // Usem: Tram1: y=x+3, x∈[−4,−1] → f(−4)=−1, f(−1)=2
      // Tram2: y=−(x)²+2, x∈[−1,1] → f(−1)=−1+2=1 ≠ 2. Prova:
      // Tram1: y=0.5x+2, x∈[−4,0] → f(−4)=0, f(0)=2
      // Tram2: y=−x²+2, x∈[0,2] → f(0)=2 ✓, f(2)=−2
      // Tram3: y=x−4, x∈[2,4] → f(2)=−2 ✓, f(4)=0
      // Màxim: f(0)=2. Mínims: f(−4)=0, f(4)=0, f(2)=−2 (mínim local)
      // Talls X: x=−4 (f=0), tram2: −x²+2=0→x=√2≈1.41, tram3: x−4=0→x=4
      draw(s){
        makeBase(s);
        plotFn(x=>0.5*x+2,-4,0,'#e76f51',s,2.6,'left');
        dot(-4,0,'#e76f51',true,s);dot(0,2,'#e76f51',true,s);
        plotFn(x=>-x*x+2,0,2,'#e76f51',s);
        dot(0,2,'#e76f51',false,s);dot(2,-2,'#e76f51',true,s);
        plotFn(x=>x-4,2,4,'#e76f51',s,2.6,'right');
        dot(2,-2,'#e76f51',false,s);dot(4,0,'#e76f51',true,s);
      },
      qs:[
        {text:'Quin és el <strong>domini</strong>?',opts:['[−4, 4]','(−∞,+∞)','(−4, 4)','[−4, 4)'],ans:0,ex:'La gràfica va de x=−4 (tancat) a x=4 (tancat): domini = [−4, 4].'},
        {text:'La funció és <strong>contínua</strong>?',opts:['Sí, és contínua','No, a x=0','No, a x=0 i x=2','No, a x=2'],ans:0,ex:'Els tres trams empalmen exactament: f(0)=2 per tots dos, f(2)=−2 per tots dos. Contínua.'},
        {text:'On és el <strong>màxim absolut</strong>?',opts:['x=0, y=2','x=−4, y=0','x=4, y=0','x=2, y=−2'],ans:0,ex:'El punt més alt és (0, 2): màxim absolut al tram central.'},
        {text:'On és el <strong>mínim absolut</strong>?',opts:['x=2, y=−2','x=−4, y=0','x=4, y=0','No té mínim'],ans:0,ex:'El punt més baix és (2, −2): mínim absolut.'},
        {text:'On talla la gràfica l\'<strong>eix X</strong>?',opts:['x=−4, x≈1.41 i x=4','Només x=0','x=−4 i x=4','x=−4, x=0 i x=4'],ans:0,ex:'Tram1: f(−4)=0. Tram2: −x²+2=0→x=√2≈1.41. Tram3: f(4)=0. Tres talls.'},
        {text:'En quin interval la funció és <strong>decreixent</strong>?',opts:['(0, 2)','(−4, 0)','(2, 4)','(0, 4)'],ans:0,ex:'La paràbola del tram central decreix de x=0 al mínim x=2. El tram3 (pendent +1) creix. Decreixent: (0, 2).'},
      ],pts:10
    },
    { // Sinusoide + anàlisi completa (periòdica)
      draw(s){makeBase(s);plotFn(x=>2*Math.sin(x*Math.PI/2),-4,4,'#3a7bd5',s,2.6,'both');},
      qs:[
        {text:'La funció és <strong>periòdica</strong>? Quin és el període?',opts:['Sí, T = 4','Sí, T = 2','Sí, T = π','No és periòdica'],ans:0,ex:'La sinusoide es repeteix cada 4 unitats: sin(π(x+4)/2)=sin(πx/2). Període = 4.'},
        {text:'Quin és el <strong>recorregut</strong>?',opts:['[−2, 2]','(−2, 2)','(−∞,+∞)','[0, 2]'],ans:0,ex:'Amplitud 2: valors entre −2 i 2 (tots dos assolits). Recorregut = [−2, 2].'},
        {text:'On talla l\'<strong>eix X</strong> al rang [−4, 4]?',opts:['x = −4, −2, 0, 2, 4','x = 0 i x = 4','x = −2, 0, 2','Cap'],ans:0,ex:'sin(πx/2)=0 → x = 2n: x = −4, −2, 0, 2, 4.'},
        {text:'On és el <strong>màxim absolut</strong> en el rang [−4, 4]?',opts:['x=−3 i x=1, y=2','x=0, y=0','x=2, y=0','x=4, y=0'],ans:0,ex:'sin(πx/2)=1 → x=1 i, per periodicitat, x=−3. Màxim y=2.'},
        {text:'En quin interval és <strong>decreixent</strong>?',opts:['(1, 3) i (−3, −1) aprox','(0, 2)','(−4, 0)','No decreix'],ans:0,ex:'Decreix entre cada màxim i el mínim següent: (1,3) i (−3,−1).'},
        {text:'La funció és <strong>parella, senar o cap de les dues</strong>?',opts:['Senar (f(−x)=−f(x))','Parella (f(−x)=f(x))','Cap simetria','Periòdica però sense simetria'],ans:0,ex:'sin(−x)=−sin(x): la sinusoide és una funció senar, simètrica respecte a l\'origen.'},
      ],pts:10
    },
  ];
  const banks={1:L1,2:L2,3:L3};
  return shuffleArr([...banks[level]]).slice(0,level===1?2:level===2?3:3);
}
function matchBank0(level){
  const L1=[
    {description:'Funció lineal <strong>creixent</strong> que passa per l\'origen.',correctIdx:0,explain:'f(x)=ax amb a>0 passa per (0,0) i puja d\'esquerra a dreta.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x*0.8,-4,4,'#3a7bd5',s);},label:'y = 0.8x'},{draw(s){makeBase(s);plotFn(x=>x*x*0.3-1,-4,4,'#e63946',s);},label:'y = 0.3x²−1'},{draw(s){makeBase(s);plotFn(x=>-x+1,-4,4,'#2a9d8f',s);},label:'y = −x+1'}]},
    {description:'Paràbola oberta cap <strong>avall</strong> amb el vèrtex per <strong>sobre</strong> de l\'eix X.',correctIdx:2,explain:'Cap avall significa coeficient negatiu de x². El vèrtex a y>0 implica que talla X.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x*x-2,-4,4,'#7b5ea7',s);},label:'Cap amunt'},{draw(s){makeBase(s);plotFn(x=>-x*x-1,-4,4,'#f4a261',s);},label:'Cap avall, vèrtex sota X'},{draw(s){makeBase(s);plotFn(x=>-x*x+2,-3.5,3.5,'#2a9d8f',s);},label:'Cap avall, vèrtex sobre X'}]},
    {description:'Funció <strong>constant</strong>: el seu valor no canvia mai.',correctIdx:1,explain:'f(x)=c és una recta horitzontal: sempre el mateix valor independentment de x.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>0.5*x,-4,4,'#3a7bd5',s);},label:'Creixent'},{draw(s){makeBase(s);plotFn(x=>1.5,-4,4,'#e63946',s);},label:'Constant'},{draw(s){makeBase(s);plotFn(x=>-0.5*x+1,-4,4,'#7b5ea7',s);},label:'Decreixent'}]},
    {description:'Funció que talla l\'eix X en <strong>un sol punt</strong> i l\'eix Y per <strong>sota</strong> de l\'origen.',correctIdx:0,explain:'Recta creixent que talla Y en negatiu: f(0)<0, f(x)=0 per a un x positiu.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x-2,-4,4,'#2a9d8f',s);},label:'Tall Y: (0,−2)'},{draw(s){makeBase(s);plotFn(x=>x*x-4,-4,4,'#f4a261',s);},label:'Talla X en dos punts'},{draw(s){makeBase(s);plotFn(x=>x+2,-4,4,'#e63946',s);},label:'Tall Y: (0,2)'}]},
  ];
  const L2=[
    {description:'Funció amb una simetria respecte a l\'<strong>eix Y</strong> (funció parella).',correctIdx:1,explain:'Una funció parella compleix f(−x)=f(x): la gràfica és simètrica respecte a l\'eix Y.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x*x*x*0.1,-4,4,'#3a7bd5',s);},label:'f(x)=0.1x³ (senar)'},{draw(s){makeBase(s);plotFn(x=>x*x-2,-4,4,'#e63946',s);},label:'f(x)=x²−2 (parella)'},{draw(s){makeBase(s);plotFn(x=>x+1,-4,4,'#7b5ea7',s);},label:'f(x)=x+1 (cap simetria)'}]},
    {description:'Funció amb <strong>dos punts de discontinuïtat</strong>.',correctIdx:2,explain:'Dues interrupcions a la gràfica: dos salts visibles.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x*x-1,-4,4,'#2a9d8f',s);},label:'Contínua'},{draw(s){makeBase(s);plotSeg(-4,0,0,0,'#f4a261',true,false,s);dot(0,0,'#f4a261',true,s);dot(0,2,'#f4a261',false,s);plotSeg(0,2,4,2,'#f4a261',false,true,s);},label:'Un salt'},{draw(s){makeBase(s);plotSeg(-4,-1,-1,-1,'#7b5ea7',true,false,s);dot(-1,-1,'#7b5ea7',true,s);dot(-1,1,'#7b5ea7',false,s);plotSeg(-1,1,2,1,'#7b5ea7',false,false,s);dot(2,1,'#7b5ea7',false,s);dot(2,3,'#7b5ea7',true,s);plotSeg(2,3,4,3,'#7b5ea7',false,true,s);},label:'Dos salts'}]},
    {description:'Funció amb un <strong>màxim local i un mínim local</strong>.',correctIdx:0,explain:'La cúbica té una "gepa" cap amunt (màxim) i una "vall" cap avall (mínim).',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x*x*x*0.3-2*x,-3.5,3.5,'#3a7bd5',s);},label:'Màxim i mínim'},{draw(s){makeBase(s);plotFn(x=>x*x-1,-4,4,'#e63946',s);},label:'Només mínim'},{draw(s){makeBase(s);plotFn(x=>x*0.7,-4,4,'#2a9d8f',s);},label:'Sense extrems'}]},
    {description:'Funció definida <strong>només per a x ≥ 0</strong> i sempre creixent.',correctIdx:1,explain:'L\'arrel quadrada està definida per a x ≥ 0 i creix suaument.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x*x,-4,4,'#7b5ea7',s);},label:'Definida per tots els reals'},{draw(s){makeBase(s);plotFn(x=>Math.sqrt(x),0,4.5,'#f4a261',s);dot(0,0,'#f4a261',true,s);},label:'Definida per x ≥ 0'},{draw(s){makeBase(s);plotFn(x=>Math.abs(x),-4,4,'#e63946',s);},label:'Definida per tots els reals'}]},
  ];
  const L3=[
    {description:'Funció amb una <strong>asímptota vertical a x=0</strong> i una <strong>asímptota horitzontal a y=0</strong>.',correctIdx:2,explain:'La hipèrbola 1/x s\'aproxima a y=0 quan x→±∞ i no existeix a x=0.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>1/(x*x+1)*3,-4,4,'#3a7bd5',s);},label:'Campana (no asímptota V)'},{draw(s){makeBase(s);plotFn(x=>x-1,-4,4,'#e63946',s);},label:'Recta (sense asímptotes)'},{draw(s){makeBase(s);plotFn(x=>1/x,-4.5,-0.3,'#7b5ea7',s);plotFn(x=>1/x,0.3,4.5,'#7b5ea7',s);plotFn(x=>1/x,0.3,'left','#7b5ea7',s);plotFn(x=>1/x,4.5,'right','#7b5ea7',s);},label:'1/x amb asímptotes'}]},
    {description:'Polinomi de grau 3 amb <strong>tres arrels reals</strong> (talla X en tres punts).',correctIdx:[1,2],explain:'Un cúbic amb tres arrels reals té tres talls amb l\'eix X. Tant la gràfica B com la C en tenen tres.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x*x*x*0.2,-4,4,'#2a9d8f',s,2.6,'both');},label:'Una sola arrel (x=0)'},{draw(s){makeBase(s);plotFn(x=>(x+2)*x*(x-2)*0.1,-3.5,3.5,'#f4a261',s,2.6,'both');},label:'Tres arrels: −2, 0, 2'},{draw(s){makeBase(s);plotFn(x=>(x+1)*x*(x-1)*0.2,-3.5,3.5,'#e63946',s,2.6,'both');},label:'Tres arrels: −1, 0, 1'}]},
    {description:'Funció <strong>periòdica</strong> que es repeteix amb un període aproximat de 4.',correctIdx:0,explain:'La gràfica es repeteix cada 4 unitats aproximadament.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>Math.sin(x*Math.PI/2)*2,-4,4,'#3a7bd5',s);},label:'Període 4'},{draw(s){makeBase(s);plotFn(x=>x*x-x,-4,4,'#7b5ea7',s);},label:'Paràbola (no periòdica)'},{draw(s){makeBase(s);plotFn(x=>Math.sin(x)*2,-4,4,'#e63946',s);},label:'Sinusoide periode ≈6.3'}]},
  ];
  const banks={1:L1,2:L2,3:L3};
  return shuffleArr([...banks[level]]).slice(0,level===1?3:level===2?4:3);
}

function matchBank1(level){
  const L1=[
    {description:'Funció <strong>creixent</strong> a (−∞,0) i <strong>decreixent</strong> a (0,+∞) amb màxim a x=0.',correctIdx:0,explain:'Paràbola cap avall: creix fins al vèrtex i decreix a partir d\'aquí.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>-x*x+3,-4,4,'#7b5ea7',s);},label:'Màxim a x=0'},{draw(s){makeBase(s);plotFn(x=>x*x-3,-4,4,'#3a7bd5',s);},label:'Mínim a x=0'},{draw(s){makeBase(s);plotFn(x=>x,-4,4,'#2a9d8f',s);},label:'Sempre creixent'}]},
    {description:'Funció <strong>sempre decreixent</strong> sense cap extrem.',correctIdx:1,explain:'Recta amb pendent negatiu: decreix uniformement en tot el domini.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>-x*x+2,-4,4,'#e63946',s);},label:'Decreix però té màxim'},{draw(s){makeBase(s);plotFn(x=>-x-1,-4,4,'#f4a261',s);},label:'Recta decreixent'},{draw(s){makeBase(s);plotFn(x=>x*x-4*x,-1,5,'#3a7bd5',s);},label:'Decreix i creix'}]},
    {description:'Funció que és <strong>creixent, constant i decreixent</strong> en trams successius.',correctIdx:2,explain:'Tres comportaments: primer puja, després és plana i finalment baixa.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x,-4,4,'#7b5ea7',s);},label:'Sempre creixent'},{draw(s){makeBase(s);plotFn(x=>-x*x+1,-4,4,'#2a9d8f',s);},label:'Creix i decreix'},{draw(s){makeBase(s);plotFn(x=>x<-1?x+2:(x<=1?1:-x+2),-4,4,'#e63946',s);},label:'Creix, constant, decreix'}]},
  ];
  const L2=[
    {description:'Funció amb creixement als <strong>dos extrems</strong> i decreixement al <strong>tram central</strong>.',correctIdx:1,explain:'La cúbica baixa al centre i puja als extrems: té un màxim local i un mínim local.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>-x*x+2,-4,4,'#3a7bd5',s);},label:'Creix i decreix (un cop)'},{draw(s){makeBase(s);plotFn(x=>x*x*x*0.25-x,-3.5,3.5,'#e63946',s);},label:'Decreix al centre'},{draw(s){makeBase(s);plotFn(x=>x,-4,4,'#7b5ea7',s);},label:'Sempre creixent'}]},
    {description:'Funció creixent a <strong>(−∞,−1)</strong>, decreixent a <strong>(−1,2)</strong> i creixent a <strong>(2,+∞)</strong>.',correctIdx:2,explain:'Dos extrems locals: un màxim local a x=−1 i un mínim local a x=2.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>-x*x+x,-4,4,'#f4a261',s,2.6,'both');},label:'Un sol extrem'},{draw(s){makeBase(s);plotFn(x=>x*x*x*0.2,-4,4,'#2a9d8f',s,2.6,'both');},label:'Sempre creixent'},{draw(s){makeBase(s);plotFn(x=>x*x*x/3-x*x/2-2*x,-3.5,4,'#3a7bd5',s,2.6,'both');},label:'Màxim a x=−1, mínim a x=2'}]},
    {description:'Funció amb <strong>tres extrems locals</strong> visibles a la gràfica.',correctIdx:0,explain:'Un polinomi de grau 4 pot tenir fins a tres extrems locals.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>0.1*x*x*x*x-x*x+0.5,-4,4,'#7b5ea7',s);},label:'Tres extrems (grau 4)'},{draw(s){makeBase(s);plotFn(x=>x*x*x*0.2-x,-3.5,3.5,'#e63946',s);},label:'Dos extrems (grau 3)'},{draw(s){makeBase(s);plotFn(x=>-x*x+2,-4,4,'#2a9d8f',s);},label:'Un extrem (grau 2)'}]},
  ];
  const L3=[
    {description:'Funció on el <strong>màxim absolut</strong> és y=3 i s\'assoleix a x=1.',correctIdx:1,explain:'El punt màxim absolut de la gràfica és (1,3).',
      graphs:[{draw(s){makeBase(s);plotFn(x=>-x*x+4,-4,4,'#3a7bd5',s);},label:'Màxim a (0,4)'},{draw(s){makeBase(s);plotFn(x=>-(x-1)*(x-1)+3,-4,4,'#e63946',s);},label:'Màxim a (1,3)'},{draw(s){makeBase(s);plotFn(x=>-(x-2)*(x-2)+3,-1,5,'#7b5ea7',s);},label:'Màxim a (2,3)'}]},
    {description:'Funció <strong>creixent</strong> però que <strong>puja cada vegada més lentament</strong>: la corba s\'aplana progressivament.',correctIdx:2,explain:'L\'arrel quadrada creix però cada cop de manera menys pronunciada: la pendent disminueix progressivament.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x,-0.5,4.5,'#2a9d8f',s);},label:'Creix a ritme constant'},{draw(s){makeBase(s);plotFn(x=>x*x,0,3,'#f4a261',s);},label:'Creix cada cop més ràpid'},{draw(s){makeBase(s);plotFn(x=>Math.sqrt(x),0,4.5,'#3a7bd5',s);dot(0,0,'#3a7bd5',true,s);},label:'Creix cada cop més lent'}]},
    {description:'Funció sense cap <strong>màxim absolut</strong> ni <strong>mínim absolut</strong>, però que <strong>no és sempre monòtona</strong> (té extrems locals).',correctIdx:0,explain:'x·sin(x) té màxims i mínims locals però cap d\'absolut: creix i decreix alternativament i s\'estén cap a infinit.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x*Math.sin(x)*0.4,-4,4,'#7b5ea7',s,2.6,'both');},label:'Extrems locals, sense absoluts'},{draw(s){makeBase(s);plotFn(x=>x*x*x*0.1-x,-3,3,'#e63946',s,2.6,'both');},label:'Té dos extrems locals acotats'},{draw(s){makeBase(s);plotFn(x=>x*0.5,-4,4,'#2a9d8f',s,2.6,'both');},label:'Recta: monòtona'}]},
  ];
  const banks={1:L1,2:L2,3:L3};
  return shuffleArr([...banks[level]]).slice(0,level===1?3:level===2?3:3);
}

function matchBank2(level){
  const L1=[
    {description:'Funció amb domini <strong>[−3, 2]</strong>: segment tancat als dos extrems.',correctIdx:0,explain:'Punt tancat a x=−3 i punt tancat a x=2.',
      graphs:[{draw(s){makeBase(s);plotSeg(-3,-1,2,2,'#3a7bd5',true,true,s);},label:'Domini [−3, 2]'},{draw(s){makeBase(s);plotFn(x=>0.5*x,-4,4,'#e63946',s);},label:'Domini (−∞,+∞)'},{draw(s){makeBase(s);plotSeg(0,-1,3,2,'#7b5ea7',true,true,s);},label:'Domini [0, 3]'}]},
    {description:'Funció amb recorregut <strong>[0, +∞)</strong>: mai pren valors negatius.',correctIdx:2,explain:'La paràbola x² sempre és ≥0: el recorregut comença a 0.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x,-4,4,'#2a9d8f',s);},label:'Recorregut (−∞,+∞)'},{draw(s){makeBase(s);plotFn(x=>-x*x+1,-4,4,'#f4a261',s);},label:'Recorregut (−∞,1]'},{draw(s){makeBase(s);plotFn(x=>x*x,-3.5,3.5,'#3a7bd5',s);},label:'Recorregut [0,+∞)'}]},
    {description:'Funció no definida a x=0: la gràfica té dues branques, una per a x<0 i una per a x>0.',correctIdx:1,explain:'La gràfica salta a x=0: no hi ha cap valor definit en aquest punt.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x+1,-4,4,'#7b5ea7',s,2.6,'both');},label:'Domini (−∞,+∞)'},{draw(s){makeBase(s);plotFn(x=>1/x,-4.5,-0.3,'#e63946',s,2.6,'both');plotFn(x=>1/x,0.3,4.5,'#e63946',s,2.6,'both');},label:'Domini (−∞,0)∪(0,+∞)'},{draw(s){makeBase(s);plotSeg(-3,1,2,1,'#2a9d8f',true,true,s);},label:'Domini [−3,2]'}]},
    {description:'Funció amb domini <strong>(0, 4]</strong>: extrem esquerre obert, dret tancat.',correctIdx:0,explain:'Punt obert a x=0 (no inclòs) i punt tancat a x=4 (inclòs).',
      graphs:[{draw(s){makeBase(s);plotSeg(0,1,4,3,'#f4a261',false,true,s);},label:'Domini (0, 4]'},{draw(s){makeBase(s);plotSeg(0,1,4,3,'#3a7bd5',true,true,s);},label:'Domini [0, 4]'},{draw(s){makeBase(s);plotSeg(0,1,4,3,'#7b5ea7',true,false,s);},label:'Domini [0, 4)'}]},
  ];
  const L2=[
    {description:'Funció amb domini <strong>[0, +∞)</strong> i recorregut <strong>[0, +∞)</strong>.',correctIdx:1,explain:'L\'arrel quadrada: definida i positiva per a x ≥ 0.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x*x,-4,4,'#3a7bd5',s);},label:'Dom (−∞,+∞), Rec [0,+∞)'},{draw(s){makeBase(s);plotFn(x=>Math.sqrt(x),0,4.5,'#e63946',s);dot(0,0,'#e63946',true,s);},label:'Dom [0,+∞), Rec [0,+∞)'},{draw(s){makeBase(s);plotFn(x=>Math.abs(x)-2,-4,4,'#7b5ea7',s);},label:'Dom (−∞,+∞), Rec [−2,+∞)'}]},
    {description:'Funció amb recorregut <strong>(−∞, 4]</strong>: té un màxim de y=4 però no té mínim.',correctIdx:0,explain:'Paràbola cap avall amb vèrtex a y=4: el màxim és 4 i decreix cap a −∞.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>-x*x+4,-4,4,'#2a9d8f',s);},label:'Recorregut (−∞,4]'},{draw(s){makeBase(s);plotFn(x=>x*x-4,-4,4,'#f4a261',s);},label:'Recorregut [−4,+∞)'},{draw(s){makeBase(s);plotFn(x=>x,-4,4,'#3a7bd5',s);},label:'Recorregut (−∞,+∞)'}]},
    {description:'Funció amb domini <strong>(−3,+∞)</strong>: definida a partir de x=−3 (exclòs).',correctIdx:2,explain:'El logaritme o l\'arrel amb desplaçament comença a un punt exclòs.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>Math.sqrt(x+3),-3,4.5,'#7b5ea7',s);dot(-3,0,'#7b5ea7',true,s);},label:'Domini [−3,+∞)'},{draw(s){makeBase(s);plotFn(x=>x,-4,4,'#e63946',s);},label:'Domini (−∞,+∞)'},{draw(s){makeBase(s);plotFn(x=>x+3>0?Math.log(x+3)/Math.log(2):null,-2.9,4.5,'#3a7bd5',s);},label:'Domini (−3,+∞)'}]},
    {description:'Funció definida en <strong>dos trams disjunts</strong> amb domini [−4,−1]∪[1,4].',correctIdx:1,explain:'Dos segments separats: hi ha un "buit" entre x=−1 i x=1.',
      graphs:[{draw(s){makeBase(s);plotSeg(-4,2,4,2,'#f4a261',true,true,s);},label:'Domini [−4,4] (un tram)'},{draw(s){makeBase(s);plotSeg(-4,1,-1,1,'#2a9d8f',true,true,s);plotSeg(1,-1,4,-1,'#2a9d8f',true,true,s);},label:'Domini [−4,−1]∪[1,4]'},{draw(s){makeBase(s);plotFn(x=>x*x*0.2,-4,4,'#7b5ea7',s);},label:'Domini (−∞,+∞) (paràbola)'}]},
  ];
  const L3=[
    {description:'Funció on el <strong>recorregut és exactament {−1, 0, 1}</strong>: tres valors discrets.',correctIdx:2,explain:'La funció signe pren només tres valors: −1, 0 i 1.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x*x*0.3-1,-4,4,'#3a7bd5',s);},label:'Recorregut [−1,+∞)'},{draw(s){makeBase(s);plotSeg(-4,2,4,2,'#e63946',true,true,s);},label:'Recorregut {2}'},{draw(s){makeBase(s);plotSeg(-4,-1,0,-1,'#7b5ea7',true,false,s);dot(0,-1,'#7b5ea7',false,s);dot(0,0,'#7b5ea7',true,s);dot(0,1,'#7b5ea7',false,s);plotSeg(0,1,4,1,'#7b5ea7',false,true,s);},label:'Recorregut {−1,0,1}'}]},
    {description:'Funció definida per a tots els valors de x però el recorregut és <strong>(0, 3]</strong>: mai arriba a 0 però té un màxim.',correctIdx:1,explain:'La corba té un màxim absolut i s\'aproxima a y=0 sense arribar-hi mai.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>x*x,-3.5,3.5,'#2a9d8f',s);},label:'Recorregut [0,+∞)'},{draw(s){makeBase(s);plotFn(x=>3/(x*x+1),-4,4,'#f4a261',s);},label:'Recorregut (0,3]'},{draw(s){makeBase(s);plotFn(x=>x,-4,4,'#3a7bd5',s);},label:'Recorregut (−∞,+∞)'}]},
    {description:'Funció no definida en dos punts: x=−2 i x=2. Té tres branques separades.',correctIdx:0,explain:'La gràfica té tres parts: a l\'esquerra de −2, entre −2 i 2, i a la dreta de 2.',
      graphs:[{draw(s){makeBase(s);plotFn(x=>1/(x*x-4),-1.8,1.8,'#e63946',s,2.6,'both');plotFn(x=>1/(x*x-4),-4,-2.2,'#e63946',s,2.6,'both');plotFn(x=>1/(x*x-4),2.2,4,'#e63946',s,2.6,'both');},label:'Dom (−∞,−2)∪(−2,2)∪(2,+∞)'},{draw(s){makeBase(s);plotFn(x=>1/x,-4.5,-0.3,'#7b5ea7',s,2.6,'both');plotFn(x=>1/x,0.3,4.5,'#7b5ea7',s,2.6,'both');},label:'Dom (−∞,0)∪(0,+∞)'},{draw(s){makeBase(s);plotFn(x=>x*x-4,-4,4,'#3a7bd5',s,2.6,'both');},label:'Dom (−∞,+∞)'}]},
  ];
  const banks={1:L1,2:L2,3:L3};
  return shuffleArr([...banks[level]]).slice(0,level===1?3:level===2?4:3);
}

// ── BUILD QUESTIONS ────────────────────────────────────
// Punts creixents per nivell: N1=10, N2=15, N3=20
const PTS = {1:10, 2:15, 3:20};
const MATCH_PTS = {1:10, 2:15, 3:20};

function buildQs(gameIdx,bank,level){
  const pts = PTS[level];
  if(gameIdx===0){
    return bank.map(g=>({type:'esfuncio',text:level===1?'Aquesta gràfica representa una funció?':'La gràfica és una funció? (Pensa en la prova de la recta vertical)',draw:g.draw,isFn:g.isFn,explain:g.explain,pts}));
  }
  if(gameIdx===1){
    const qs=[];
    bank.forEach(g=>{
      qs.push({type:'opcions',text:'Quin és el <strong>domini</strong> d\'aquesta funció?',draw:g.draw,opts:g.domOpts,ans:g.domAns,explain:g.domExplain,pts});
      if(level>=2) qs.push({type:'opcions',text:'Quin és el <strong>recorregut</strong> d\'aquesta funció?',draw:g.draw,opts:g.recOpts,ans:g.recAns,explain:g.recExplain,pts});
    });
    return qs;
  }
  if(gameIdx===2){
    return bank.map(g=>({type:'opcions',text:'La funció és <strong>contínua</strong>?',draw:g.draw,opts:['✅ Sí, és contínua','❌ No és contínua'],ans:g.continuous?0:1,explain:g.explain,pts}));
  }
  if(gameIdx===3){
    const qs=[];
    bank.forEach(g=>{
      qs.push({type:'opcions',text:'On talla la gràfica l\'<strong>eix X</strong>?',draw:g.draw,opts:g.optsX,ans:g.ansX,explain:g.exX,pts});
      qs.push({type:'opcions',text:'On talla la gràfica l\'<strong>eix Y</strong>?',draw:g.draw,opts:g.optsY,ans:g.ansY,explain:g.exY,pts});
    });
    return qs;
  }
  if(gameIdx===4){
    const qs=[];
    bank.forEach(g=>{
      qs.push({type:'opcions',text:'On és la funció <strong>creixent</strong>?',draw:g.draw,opts:g.creixOpts,ans:g.ansCreix,explain:g.exCreix,pts});
      qs.push({type:'opcions',text:'On és la funció <strong>decreixent</strong>?',draw:g.draw,opts:g.decOpts,ans:g.ansDecr,explain:g.exDecr,pts});
      if(level>=2){
        qs.push({type:'opcions',text:'On és el <strong>màxim local</strong>?',draw:g.draw,opts:g.maxOpts,ans:g.ansMax,explain:g.exMax,pts});
        qs.push({type:'opcions',text:'On és el <strong>mínim local</strong>?',draw:g.draw,opts:g.minOpts,ans:g.ansMin,explain:g.exMin,pts});
      }
    });
    return qs;
  }
  if(gameIdx===5){
    const qs=[];
    bank.forEach(entry=>{
      entry.qs.forEach(q=>{
        qs.push({type:'opcions',text:q.text,draw:entry.draw,opts:q.opts,ans:q.ans,explain:q.ex,pts});
      });
    });
    return qs;
  }
}
function buildMatchQs(bank,level){
  const pts = MATCH_PTS[level];
  return bank.map(e=>({type:'match',text:'Selecciona la gràfica que correspon a la descripció:',description:e.description,graphs:e.graphs,correctIdx:e.correctIdx,explain:e.explain,pts}));
}

// ── RENDER ─────────────────────────────────────────────
function renderQuestion(){
  const q=questions[currentQ], total=questions.length;
  document.getElementById('q-label').textContent=`Pregunta ${currentQ+1} / ${total}`;
  document.getElementById('q-text').innerHTML=q.text;
  document.getElementById('progress-fill').style.width=`${(currentQ/total)*100}%`;
  document.getElementById('feedback-box').className='feedback-box';
  document.getElementById('next-btn').className='next-btn';
  const aa=document.getElementById('answer-area');
  aa.innerHTML='';

  if(q.type==='match'){
    document.getElementById('graph-wrap').style.display='none';
    const db=document.createElement('div');
    db.className='match-description-box';
    db.innerHTML=`<span class="desc-label">📋 Descripció</span>${q.description}`;
    aa.appendChild(db);
    const grid=document.createElement('div');
    grid.className='match-options-grid';
    q.graphs.forEach((g,i)=>{
      const card=document.createElement('button');
      card.className='match-graph-opt';
      const svgEl=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svgEl.setAttribute('viewBox','0 0 320 240');
      card.appendChild(svgEl);
      g.draw(svgEl);
      // Only show neutral letter — NO descriptive label
      const lbl=document.createElement('div');
      lbl.className='match-graph-label';
      lbl.textContent='Gràfica '+String.fromCharCode(65+i);
      card.appendChild(lbl);
      card.onclick=()=>checkMatch(i,q);
      grid.appendChild(card);
    });
    aa.appendChild(grid);
  } else {
    document.getElementById('graph-wrap').style.display='block';
    const svg=document.getElementById('graph-svg');
    q.draw(svg);
    const grid=document.createElement('div');
    grid.className='options-grid';
    const opts=q.type==='esfuncio'?['✅ Sí, és funció','❌ No és funció']:q.opts;
    opts.forEach((txt,i)=>{
      const btn=document.createElement('button');
      btn.className='opt-btn';
      btn.innerHTML=txt;
      btn.onclick=()=>{
        const ansArr=Array.isArray(q.ans)?q.ans:[q.ans];
        const ok=q.type==='esfuncio'?((i===0&&q.isFn)||(i===1&&!q.isFn)):ansArr.includes(i);
        checkOpts(ok,i,q);
      };
      grid.appendChild(btn);
    });
    aa.appendChild(grid);
  }
}

function checkOpts(ok,chosen,q){
  const ansArr=Array.isArray(q.ans)?q.ans:[q.ans];
  document.querySelectorAll('#answer-area .opt-btn').forEach((b,i)=>{
    b.disabled=true;
    const correct=q.type==='esfuncio'?((i===0&&q.isFn)||(i===1&&!q.isFn)):ansArr.includes(i);
    if(correct)b.classList.add('correct');else if(i===chosen)b.classList.add('wrong');
  });
  finalize(ok,q);
}
function checkMatch(chosen,q){
  const correctArr=Array.isArray(q.correctIdx)?q.correctIdx:[q.correctIdx];
  document.querySelectorAll('#answer-area .match-graph-opt').forEach((c,i)=>{
    c.setAttribute('disabled','');
    if(correctArr.includes(i))c.classList.add('correct');else if(i===chosen)c.classList.add('wrong');
  });
  finalize(correctArr.includes(chosen),q);
}
function finalize(ok,q){
  if(ok) gameScore+=q.pts;
  document.getElementById('game-score').textContent=gameScore;
  const fb=document.getElementById('feedback-box');
  fb.className=`feedback-box show ${ok?'correct':'wrong'}`;
  fb.innerHTML=ok
    ?`<strong>✅ Correcte! +${q.pts} pts</strong><div class="explain">${q.explain||''}</div>`
    :`<strong>❌ Incorrecte.</strong><div class="explain">${q.explain||''}</div>`;
  gameAnswers.push({correct:ok});

  const btn=document.getElementById('next-btn');
  if(ok){
    // Resposta correcta: botó disponible immediatament
    btn.className='next-btn show';
    btn.disabled=false;
    btn.textContent='Següent →';
  } else {
    // Resposta incorrecta: temporitzador de 4 segons
    btn.className='next-btn show';
    btn.disabled=true;
    let segs=4;
    btn.textContent=`Llegeix l'explicació… (${segs}s)`;
    btn.style.opacity='0.55';
    const interval=setInterval(()=>{
      segs--;
      if(segs<=0){
        clearInterval(interval);
        btn.disabled=false;
        btn.textContent='Següent →';
        btn.style.opacity='1';
      } else {
        btn.textContent=`Llegeix l'explicació… (${segs}s)`;
      }
    },1000);
  }
}
function nextQuestion(){currentQ++;if(currentQ>=questions.length)showResults();else renderQuestion();}

// ── NAV ────────────────────────────────────────────────
function setLevel(l){currentLevel=l;document.querySelectorAll('.level-btn').forEach(b=>b.classList.toggle('active',+b.dataset.level===l));updateBadges();}

function startGame(idx){
  currentGameIsMatch=false;currentGame=idx;currentQ=0;gameScore=0;gameAnswers=[];
  document.getElementById('game-score').textContent='0';
  document.getElementById('game-title-bar').textContent=gameNames[idx];
  const banks=[esFuncioBank,dominiBank,continuitatBank,puntsTallBank,creixementBank,analitzaBank];
  questions=buildQs(idx,banks[idx](currentLevel),currentLevel);
  showScreen('game');renderQuestion();
}
function startMatch(idx){
  currentGameIsMatch=true;currentMatchIdx=idx;currentQ=0;gameScore=0;gameAnswers=[];
  document.getElementById('game-score').textContent='0';
  document.getElementById('game-title-bar').textContent=matchNames[idx];
  const banks=[matchBank0,matchBank1,matchBank2];
  questions=buildMatchQs(banks[idx](currentLevel),currentLevel);
  showScreen('game');renderQuestion();
}
function goHome(){
  if(!currentAlumne){ showScreen('login'); return; }
  setNav('inici'); showScreen('home');
}
function goProgress(){setNav('progress');renderProgress();showScreen('progress');}
function playAgain(){currentGameIsMatch?startMatch(currentMatchIdx):startGame(currentGame);}
function setNav(a){document.getElementById('nav-inici').classList.toggle('active',a==='inici');document.getElementById('nav-progress').classList.toggle('active',a==='progress');}
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');window.scrollTo(0,0);}

// ── RESULTS ────────────────────────────────────────────
function showResults(){
  totalGamesPlayed++;
  const correct=gameAnswers.filter(a=>a.correct).length, tot=gameAnswers.length;
  totalCorrect+=correct; totalAnswered+=tot;
  const realMax = questions.reduce((sum,q)=>sum+q.pts, 0);

  // Guarda millor puntuació per nivell
  if(currentGameIsMatch){
    if(gameScore > (matchBestScores[currentMatchIdx][currentLevel]||0)){
      matchBestScores[currentMatchIdx][currentLevel] = gameScore;
    }
  } else {
    if(gameScore > (gameBestScores[currentGame][currentLevel]||0)){
      gameBestScores[currentGame][currentLevel] = gameScore;
    }
  }
  // Actualitza badges i resum
  updateBadges();
  // Actualitza total al nav
  const ts = [1,2,3].reduce((s,lv)=>s+totalObtingutPerLevel(lv),0);
  document.getElementById('total-score').textContent=ts;

  const pct=Math.round(correct/tot*100);
  let medal='💪',title='Segueix practicant!';
  if(pct>=100){medal='🥇';title='Perfecte!';}else if(pct>=75){medal='🏆';title='Fantàstic!';}else if(pct>=50){medal='👍';title='Molt bé!';}
  document.getElementById('results-medals').textContent=medal;
  document.getElementById('results-title').textContent=title;
  document.getElementById('results-score').textContent=gameScore;
  document.getElementById('results-sub').textContent=`punts · ${correct}/${tot} respostes correctes`;
  const best = currentGameIsMatch
    ? matchBestScores[currentMatchIdx][currentLevel]
    : gameBestScores[currentGame][currentLevel];
  document.getElementById('results-breakdown').innerHTML=`
    <div class="breakdown-row"><span>Respostes correctes</span><span class="breakdown-val ok">${correct}</span></div>
    <div class="breakdown-row"><span>Respostes incorrectes</span><span class="breakdown-val ko">${tot-correct}</span></div>
    <div class="breakdown-row"><span>% d'encert</span><span class="breakdown-val">${pct}%</span></div>
    <div class="breakdown-row"><span>Puntuació partida</span><span class="breakdown-val" style="color:var(--accent4)">${gameScore} / ${realMax} pts</span></div>
    <div class="breakdown-row"><span>Millor (N${currentLevel})</span><span class="breakdown-val" style="color:var(--accent4)">${best} / ${realMax} pts</span></div>`;
  showScreen('results');
  // Guarda a Supabase
  const jocNom = currentGameIsMatch ? matchNames[currentMatchIdx] : gameNames[currentGame];
  const jocIdx = currentGameIsMatch ? (currentMatchIdx + 10) : currentGame;
  saveScore(jocIdx, jocNom, currentLevel, gameScore, realMax, pct);
}

// ── PROGRESS ───────────────────────────────────────────
function renderProgress(){
  const ts = [1,2,3].reduce((s,lv)=>s+totalObtingutPerLevel(lv),0);
  document.getElementById('prog-total-val').textContent=ts;
  document.getElementById('stat-jocs').textContent=totalGamesPlayed;
  document.getElementById('stat-correctes').textContent=totalCorrect;
  document.getElementById('stat-pct').textContent=totalAnswered>0?Math.round(totalCorrect/totalAnswered*100)+'%':'—';

  const all=[
    ...gameNames.map((n,i)=>({
      name:n, color:gameColors[i],
      scores: [1,2,3].map(lv=>({lv, obt:gameBestScores[i][lv]||0, max:GAME_MAX[i]?.[lv]||0}))
    })),
    ...matchNames.map((n,i)=>({
      name:n, color:matchColors[i],
      scores: [1,2,3].map(lv=>({lv, obt:matchBestScores[i][lv]||0, max:MATCH_MAX[i]?.[lv]||0}))
    })),
  ];

  const chart=document.getElementById('bar-chart');
  chart.innerHTML='';
  all.forEach(g=>{
    const totalObt = g.scores.reduce((s,x)=>s+x.obt,0);
    const totalMax = g.scores.reduce((s,x)=>s+x.max,0);
    const pct = totalMax>0 ? Math.min(100,Math.round(totalObt/totalMax*100)) : 0;
    const lvLabels = g.scores.map(x=>{
      const p = x.obt>0?`${x.obt}/${x.max}`:`${x.max}`;
      const style = x.obt>0?`color:${g.color};font-weight:700`:'color:var(--text-muted)';
      return `<span style="font-size:0.72rem;${style}">${'⭐'.repeat(x.lv)} ${p}</span>`;
    }).join('<span style="color:var(--border2);margin:0 4px">·</span>');
    const row=document.createElement('div');
    row.className='bar-row';
    row.innerHTML=`
      <div class="bar-game-name">${g.name}</div>
      <div style="flex:1">
        <div class="bar-track" style="margin-bottom:4px">
          <div class="bar-fill" style="width:0%;--bar-color:${g.color}">
            <span class="bar-val">${totalObt>0?totalObt+' pts':''}</span>
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${lvLabels}</div>
      </div>
      <div class="bar-max">${totalObt}/${totalMax}</div>`;
    chart.appendChild(row);
    setTimeout(()=>{row.querySelector('.bar-fill').style.width=pct+'%';},80);
  });
}

function shuffleArr(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// ── INICI: comprova si ja hi ha alumne desat ──────────
(function init(){
  // Botó professor al nav
  const nav = document.querySelector('.nav-bar');
  const teacherBtn = document.createElement('button');
  teacherBtn.className = 'nav-btn';
  teacherBtn.style.cssText = 'margin-left:8px;border-color:rgba(123,94,167,0.3);color:#7b5ea7';
  teacherBtn.textContent = '👩‍🏫 Professorat';
  teacherBtn.onclick = goTeacher;
  nav.appendChild(teacherBtn);

  // Auto-login per àlies desat
  (async()=>{
    try{
      const saved = localStorage.getItem('fl_alias');
      if(saved && saved.length >= 2){
        const data = await sb.select('usuaris',`&alias=eq.${encodeURIComponent(saved)}&actiu=eq.true`);
        if(data && data.length > 0 && data[0].rol !== 'profe'){
          currentAlumne = data[0].alias;
          currentUserObj = data[0];
          updateNavAlumne();
          document.getElementById('login').classList.remove('active');
          document.getElementById('home').classList.add('active');
          updateBadges();
          return;
        }
      }
    }catch(e){}
    updateBadges();
  })();
})();
