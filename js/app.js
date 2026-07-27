/* ---------------- DATA LAYER ---------------- */
const DB_KEY = 'servihogar_db';
const SESSION_KEY = 'servihogar_session';

function seedDB(){
  return {
    users: [
      {id:'u1', tipo:'cliente', nombre:'Camila Torres', correo:'camila@correo.com', password:'1234', estado:'activo', favoritos:[]},
      {id:'u2', tipo:'trabajador', nombre:'Jorge Ramírez', correo:'jorge@correo.com', password:'1234',
        categoria:'Electricidad', tarifa:35000, experiencia:6, zona:'Norte',
        servicios:['Instalaciones eléctricas','Cortos y fallas','Cableado','Iluminación'],
        resenas:[{cliente:'Diana R.', estrellas:5, comentario:'Llegó puntual y dejó todo funcionando el mismo día.'},
                 {cliente:'Andrés T.', estrellas:5, comentario:'Explica bien el problema antes de cobrar.'}],
        estado:'activo', verificado:true, verificacionPendiente:false},
      {id:'u3', tipo:'trabajador', nombre:'Laura Méndez', correo:'laura@correo.com', password:'1234',
        categoria:'Limpieza', tarifa:28000, experiencia:4, zona:'Centro',
        servicios:['Limpieza profunda','Limpieza de oficinas','Planchado'],
        resenas:[{cliente:'Pedro L.', estrellas:5, comentario:'Muy responsable y detallista.'}],
        estado:'activo', verificado:true, verificacionPendiente:false},
      {id:'u4', tipo:'trabajador', nombre:'Carlos Duarte', correo:'carlos@correo.com', password:'1234',
        categoria:'Plomería', tarifa:32000, experiencia:8, zona:'Ambalá',
        servicios:['Fugas','Instalación de tubería','Destape de baños'],
        resenas:[{cliente:'Marta G.', estrellas:4, comentario:'Buen trabajo, tardó un poco más de lo esperado.'}],
        estado:'activo', verificado:false, verificacionPendiente:true},
      {id:'admin', tipo:'admin', nombre:'Administrador', correo:'admin@servihogar.com', password:'admin', estado:'activo'}
    ],
    citas: [],
    reportes: [],
    notificaciones: []
  };
}

// Rellena campos nuevos en datos que ya existían en el navegador (versiones anteriores)
function normalizeDB(d){
  if(!d.notificaciones) d.notificaciones = [];
  d.users.forEach(u=>{
    if(u.tipo==='cliente' && !u.favoritos) u.favoritos = [];
    if(u.tipo==='trabajador'){
      if(u.verificado===undefined) u.verificado = false;
      if(u.verificacionPendiente===undefined) u.verificacionPendiente = false;
    }
  });
  d.citas.forEach(c=>{
    if(!c.pago) c.pago = 'pendiente';
    if(!c.mensajes) c.mensajes = [];
  });
  return d;
}

function loadDB(){
  const raw = localStorage.getItem(DB_KEY);
  if(!raw){ const d = seedDB(); localStorage.setItem(DB_KEY, JSON.stringify(d)); return d; }
  return normalizeDB(JSON.parse(raw));
}
function saveDB(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function loadSession(){ return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
function saveSession(uid){ localStorage.setItem(SESSION_KEY, JSON.stringify(uid)); }

const THEME_KEY = 'servihogar_theme';
function loadTheme(){ return localStorage.getItem(THEME_KEY) || 'light'; }
function applyTheme(t){ document.documentElement.setAttribute('data-theme', t); }
function toggleTheme(){
  const next = document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
  applyTheme(next); localStorage.setItem(THEME_KEY, next);
  const btn = document.getElementById('theme-toggle');
  if(btn) btn.textContent = next==='dark' ? '☀️' : '🌙';
}

function addNotificacion(userId, texto){
  db.notificaciones.push({id: uid('n'), userId, texto, leida:false, fecha: new Date().toISOString()});
  saveDB();
}

let db = loadDB();
let sessionUserId = loadSession();
let state = { catFiltro:null, workerActual:null, diaSel:null, horaSel:null, calMonthOffset:0, vistaBuscar:'lista', resultadosBuscar:[] };

const ICONS = {
  'Plomería': '<path d="M8 3v4M16 3v4M4 9h16v3a4 4 0 0 1-4 4h-1v5H9v-5H8a4 4 0 0 1-4-4V9z"/>',
  'Electricidad': '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" stroke-linejoin="round"/>',
  'Limpieza': '<path d="M6 3l3 3-8 8 3 3 8-8 3 3 3-3-9-9-3 3z"/><path d="M15 9l6 6"/>',
  'Jardinería': '<path d="M12 22v-9"/><path d="M12 13c-4 0-7-3-7-7 4 0 7 3 7 7z"/><path d="M12 13c4 0 7-3 7-7-4 0-7 3-7 7z"/>',
  'Pintura': '<path d="M7 3h10v6l-3 3v7a2 2 0 0 1-4 0v-7l-3-3V3z"/>',
  'Cerrajería': '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l3 3"/>'
};
const CATS = [
  {n:'Plomería'}, {n:'Electricidad'}, {n:'Limpieza'},
  {n:'Jardinería'}, {n:'Pintura'}, {n:'Cerrajería'}
];
function iconSVG(cat){
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${ICONS[cat]||''}</svg>`;
}

/* ---------------- MAPA (zonas de Ibagué) ---------------- */
// Coordenadas aproximadas a nivel de zona (no la dirección exacta del trabajador).
const IBAGUE_CENTRO = [4.4389, -75.2003];
const ZONAS = {
  'Centro': [4.4389, -75.2003],
  'Norte': [4.4650, -75.1950],
  'Ambalá': [4.4750, -75.1900],
  'Sin definir': IBAGUE_CENTRO
};
function coordsForZona(zona){
  if(ZONAS[zona]) return ZONAS[zona];
  // zona escrita libremente por el trabajador: se ubica cerca del centro,
  // con un desplazamiento estable (siempre el mismo punto para la misma zona)
  let hash = 0;
  for(let i=0;i<(zona||'').length;i++) hash = (hash*31 + zona.charCodeAt(i)) % 1000;
  const jitter = (hash/1000 - 0.5) * 0.03;
  return [IBAGUE_CENTRO[0]+jitter, IBAGUE_CENTRO[1]-jitter];
}
let mapPerfil=null, mapBuscar=null;
function tileLayer(map){
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '© OpenStreetMap'
  }).addTo(map);
}
function pinIcon(color){
  return L.divIcon({
    className:'', html:`<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
    iconSize:[16,16], iconAnchor:[8,16]
  });
}

function currentUser(){ return db.users.find(u=>u.id===sessionUserId) || null; }
function uid(prefix){ return prefix + '_' + Math.random().toString(36).slice(2,9); }
function avg(resenas){ if(!resenas || !resenas.length) return null; return (resenas.reduce((a,r)=>a+r.estrellas,0)/resenas.length).toFixed(1); }
function fmtCOP(n){ return '$' + Number(n||0).toLocaleString('es-CO'); }

/* ---------------- NAV / ROUTING ---------------- */
function nav(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('v-'+view).classList.add('active');
  window.scrollTo({top:0, behavior:'instant'});
  renderNav(view);
  if(view==='home') renderHome();
  if(view==='buscar') renderBuscar();
  if(view==='miscitas') renderMisCitas();
  if(view==='favoritos') renderFavoritos();
  if(view==='trabajo') renderTrabajo();
  if(view==='admin') renderAdmin();
}

function renderNav(active){
  const u = currentUser();
  const links = document.getElementById('navlinks');
  const auth = document.getElementById('navauth');
  let linkHtml = `<button class="${active==='home'?'on':''}" onclick="nav('home')">Inicio</button>
                  <button class="${active==='buscar'?'on':''}" onclick="nav('buscar')">Buscar trabajadores</button>`;
  if(u && u.tipo==='cliente') linkHtml += `<button class="${active==='miscitas'?'on':''}" onclick="nav('miscitas')">Mis citas</button>
                  <button class="${active==='favoritos'?'on':''}" onclick="nav('favoritos')">Favoritos</button>`;
  if(u && u.tipo==='trabajador') linkHtml += `<button class="${active==='trabajo'?'on':''}" onclick="nav('trabajo')">Panel trabajador</button>`;
  if(u && u.tipo==='admin') linkHtml += `<button class="${active==='admin'?'on':''}" onclick="nav('admin')">Panel admin</button>`;
  links.innerHTML = linkHtml;

  const notifBtn = u ? `
    <div class="notif-wrap">
      <button class="icon-btn" id="notif-btn" aria-label="Notificaciones" onclick="toggleNotifPanel()">🔔<span class="notif-count hidden" id="notif-count">0</span></button>
      <div class="notif-panel hidden" id="notif-panel"></div>
    </div>` : '';

  if(u){
    auth.innerHTML = `${notifBtn}
                       <span class="userchip">Hola, ${u.nombre.split(' ')[0]}</span>
                       <button class="btn btn-ghost" onclick="logout()">Cerrar sesión</button>
                       <button class="icon-btn" id="theme-toggle" aria-label="Cambiar tema" onclick="toggleTheme()">${loadTheme()==='dark'?'☀️':'🌙'}</button>`;
    renderNotifCount();
  } else {
    auth.innerHTML = `<button class="icon-btn" id="theme-toggle" aria-label="Cambiar tema" onclick="toggleTheme()">${loadTheme()==='dark'?'☀️':'🌙'}</button>
                       <button class="btn btn-ghost" onclick="nav('auth'); switchAuthTab('login')">Ingresar</button>
                       <button class="btn btn-primary" onclick="nav('auth'); switchAuthTab('register')">Crear cuenta</button>`;
  }
}

function renderNotifCount(){
  const u = currentUser(); if(!u) return;
  const pendientes = db.notificaciones.filter(n=>n.userId===u.id && !n.leida);
  const badge = document.getElementById('notif-count');
  if(!badge) return;
  badge.textContent = pendientes.length;
  badge.classList.toggle('hidden', pendientes.length===0);
}
function toggleNotifPanel(){
  const u = currentUser(); if(!u) return;
  const panel = document.getElementById('notif-panel');
  const abrir = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if(!abrir) return;
  const propias = db.notificaciones.filter(n=>n.userId===u.id).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  panel.innerHTML = propias.length ? propias.map(n=>
    `<div class="notif-item ${n.leida?'':'unread'}">${n.texto}</div>`
  ).join('') : `<div class="notif-item">No tienes notificaciones.</div>`;
  propias.forEach(n=>n.leida=true);
  saveDB(); renderNotifCount();
}

/* ---------------- HOME ---------------- */
function renderHome(){
  document.getElementById('stat-workers').textContent = db.users.filter(u=>u.tipo==='trabajador').length;
  document.getElementById('stat-jobs').textContent = db.citas.length;

  document.getElementById('home-cats').innerHTML = CATS.map(c=>
    `<div class="cat-card" onclick="irABuscarConCategoria('${c.n}')">${iconSVG(c.n)}<span>${c.n}</span></div>`
  ).join('');

  const destacados = db.users.filter(u=>u.tipo==='trabajador' && u.estado==='activo')
    .sort((a,b)=>(avg(b.resenas)||0)-(avg(a.resenas)||0)).slice(0,3);
  document.getElementById('home-workers').innerHTML = destacados.map(workerCardHTML).join('');
}

function workerCardHTML(w){
  const rating = avg(w.resenas);
  const u = currentUser();
  const esFav = u && u.tipo==='cliente' && (u.favoritos||[]).includes(w.id);
  return `<div class="worker-card ticket" onclick="verPerfil('${w.id}')">
    <div class="worker-top">
      <div class="avatar"></div>
      <div style="flex:1;"><div class="name">${w.nombre} ${w.verificado?'<span class=\"verif-badge\" title=\"Verificado\">✓</span>':''}</div><div class="role">${w.categoria} · ${w.zona}</div></div>
      ${u && u.tipo==='cliente' ? `<button class="fav-btn ${esFav?'on':''}" aria-label="Guardar en favoritos" onclick="event.stopPropagation(); toggleFavorito('${w.id}')">${esFav?'♥':'♡'}</button>` : ''}
    </div>
    <div class="perf"></div>
    <div class="worker-meta">
      <div class="rating-pill">${rating ? '★ '+rating : 'Sin calificar'}</div>
      <div class="tarifa">Desde ${fmtCOP(w.tarifa)}</div>
    </div>
  </div>`;
}
function toggleFavorito(workerId){
  const u = currentUser();
  if(!u || u.tipo!=='cliente'){ nav('auth'); switchAuthTab('login'); return; }
  if(!u.favoritos) u.favoritos = [];
  const i = u.favoritos.indexOf(workerId);
  if(i>-1) u.favoritos.splice(i,1); else u.favoritos.push(workerId);
  saveDB();
  // refrescar la vista donde estemos parados
  const activa = document.querySelector('.view.active').id.replace('v-','');
  if(activa==='home') renderHome();
  if(activa==='buscar') renderBuscar();
  if(activa==='favoritos') renderFavoritos();
  if(activa==='perfil') verPerfil(workerId);
}
function renderFavoritos(){
  const u = currentUser();
  const box = document.getElementById('favoritos-content');
  if(!u || u.tipo!=='cliente'){ box.innerHTML = `<div class="empty-note">Inicia sesión como cliente para guardar y ver tus favoritos.</div>`; return; }
  const favs = db.users.filter(w=>(u.favoritos||[]).includes(w.id));
  box.innerHTML = favs.length ? `<div class="worker-grid">${favs.map(workerCardHTML).join('')}</div>`
    : `<div class="empty-note">Todavía no has guardado trabajadores. Toca el corazón ♡ en cualquier tarjeta para guardarlo aquí.</div>`;
}

function irABuscarConCategoria(cat){ state.catFiltro = cat; nav('buscar'); }
function buscarDesdeHome(){
  const q = document.getElementById('home-search').value;
  state.catFiltro = null;
  nav('buscar');
  document.getElementById('buscar-text').value = q;
  renderBuscar();
}

/* ---------------- AUTH ---------------- */
function switchAuthTab(tab){
  document.getElementById('tab-login').classList.toggle('on', tab==='login');
  document.getElementById('tab-register').classList.toggle('on', tab==='register');
  document.getElementById('form-login').classList.toggle('hidden', tab!=='login');
  document.getElementById('form-register').classList.toggle('hidden', tab!=='register');
  document.getElementById('auth-msg').innerHTML='';
}
function toggleWorkerFields(){
  document.getElementById('worker-fields').classList.toggle('hidden', document.getElementById('reg-tipo').value!=='trabajador');
}
function doLogin(e){
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const u = db.users.find(u=>u.correo.toLowerCase()===email && u.password===pass);
  const msg = document.getElementById('auth-msg');
  if(!u){ msg.innerHTML = `<div class="msg err">Correo o contraseña incorrectos.</div>`; return false; }
  if(u.estado==='bloqueado'){ msg.innerHTML = `<div class="msg err">Esta cuenta está bloqueada. Contacta al administrador.</div>`; return false; }
  sessionUserId = u.id; saveSession(u.id);
  msg.innerHTML='';
  nav(u.tipo==='trabajador' ? 'trabajo' : u.tipo==='admin' ? 'admin' : 'home');
  return false;
}
function doRegister(e){
  e.preventDefault();
  const tipo = document.getElementById('reg-tipo').value;
  const nombre = document.getElementById('reg-nombre').value.trim();
  const correo = document.getElementById('reg-email').value.trim().toLowerCase();
  const pass = document.getElementById('reg-pass').value;
  const msg = document.getElementById('auth-msg');
  if(db.users.some(u=>u.correo.toLowerCase()===correo)){
    msg.innerHTML = `<div class="msg err">Ya existe una cuenta con ese correo.</div>`; return false;
  }
  const nuevo = { id: uid('u'), tipo, nombre, correo, password: pass, estado:'activo' };
  if(tipo==='trabajador'){
    nuevo.categoria = document.getElementById('reg-cat').value;
    nuevo.tarifa = Number(document.getElementById('reg-tarifa').value)||25000;
    nuevo.experiencia = 0; nuevo.zona = 'Sin definir';
    nuevo.servicios = []; nuevo.resenas = [];
  }
  db.users.push(nuevo); saveDB();
  sessionUserId = nuevo.id; saveSession(nuevo.id);
  nav(tipo==='trabajador' ? 'trabajo' : 'home');
  return false;
}
function logout(){ sessionUserId=null; saveSession(null); nav('home'); }

/* ---------------- BUSCAR ---------------- */
function renderBuscar(){
  document.getElementById('buscar-chips').innerHTML = ['Todas', ...CATS.map(c=>c.n)].map(c=>{
    const active = (c==='Todas' && !state.catFiltro) || c===state.catFiltro;
    return `<button class="chipbtn ${active?'on':''}" onclick="setCatFiltro('${c==='Todas'?'':c}')">${c}</button>`;
  }).join('');

  const q = (document.getElementById('buscar-text').value||'').toLowerCase();
  let results = db.users.filter(u=>u.tipo==='trabajador' && u.estado==='activo');
  if(state.catFiltro) results = results.filter(w=>w.categoria===state.catFiltro);
  if(q) results = results.filter(w=>w.nombre.toLowerCase().includes(q) || w.categoria.toLowerCase().includes(q));

  const orden = document.getElementById('buscar-orden') ? document.getElementById('buscar-orden').value : 'relevancia';
  if(orden==='precio-asc') results = results.slice().sort((a,b)=>a.tarifa-b.tarifa);
  if(orden==='precio-desc') results = results.slice().sort((a,b)=>b.tarifa-a.tarifa);
  if(orden==='calificacion') results = results.slice().sort((a,b)=>(avg(b.resenas)||0)-(avg(a.resenas)||0));

  const box = document.getElementById('buscar-results');
  box.innerHTML = results.length ? results.map(workerCardHTML).join('') : `<div class="empty-note">No encontramos trabajadores con ese criterio. Prueba con otra categoría o término.</div>`;
  state.resultadosBuscar = results;
  if(state.vistaBuscar==='mapa') initMapaBuscar(results);
}
function setCatFiltro(cat){ state.catFiltro = cat || null; renderBuscar(); }
function setVistaBuscar(vista){
  state.vistaBuscar = vista;
  document.getElementById('btn-vista-lista').classList.toggle('on', vista==='lista');
  document.getElementById('btn-vista-mapa').classList.toggle('on', vista==='mapa');
  document.getElementById('buscar-results').classList.toggle('hidden', vista==='mapa');
  document.getElementById('buscar-mapa-box').classList.toggle('hidden', vista!=='mapa');
  if(vista==='mapa') initMapaBuscar(state.resultadosBuscar||[]);
}
function initMapaBuscar(results){
  if(mapBuscar){ mapBuscar.remove(); mapBuscar = null; }
  mapBuscar = L.map('buscar-mapa-box', {zoomControl:true, attributionControl:false}).setView(IBAGUE_CENTRO, 12);
  tileLayer(mapBuscar);
  results.forEach(w=>{
    const coords = coordsForZona(w.zona);
    L.marker(coords, {icon:pinIcon('#1C2B39')}).addTo(mapBuscar)
      .bindPopup(`<b>${w.nombre}</b><br>${w.categoria} · ${w.zona}<br><a href="#" onclick="verPerfil('${w.id}'); return false;">Ver perfil →</a>`);
  });
  setTimeout(()=>mapBuscar && mapBuscar.invalidateSize(), 80);
}

/* ---------------- PERFIL ---------------- */
function verPerfil(workerId){
  state.workerActual = workerId;
  nav('perfil');
  const w = db.users.find(u=>u.id===workerId);
  const rating = avg(w.resenas);
  const u = currentUser();
  const esFav = u && u.tipo==='cliente' && (u.favoritos||[]).includes(w.id);
  document.getElementById('perfil-content').innerHTML = `
    <div class="profile-grid">
      <div>
        <div class="card">
          <div class="profile-header">
            <div class="avatar"></div>
            <div style="flex:1;"><h2>${w.nombre} ${w.verificado?'<span class="verif-badge" title="Verificado">✓ Verificado</span>':''}</h2><div class="role">${w.categoria.toUpperCase()} · ${w.experiencia} AÑOS DE EXPERIENCIA</div></div>
            ${u && u.tipo==='cliente' ? `<button class="fav-btn ${esFav?'on':''}" aria-label="Guardar en favoritos" onclick="toggleFavorito('${w.id}')">${esFav?'♥':'♡'}</button>` : ''}
          </div>
          <div class="spec-sheet">
            <div class="spec-item"><div class="k">Calificación</div><div class="v">${rating || '—'}</div></div>
            <div class="spec-item"><div class="k">Trabajos hechos</div><div class="v">${w.resenas.length}</div></div>
            <div class="spec-item"><div class="k">Zona</div><div class="v">${w.zona}</div></div>
            <div class="spec-item"><div class="k">Tarifa desde</div><div class="v">${fmtCOP(w.tarifa)}</div></div>
          </div>
          <h3 style="font-size:14px; margin-bottom:8px;">Servicios que ofrece</h3>
          <div class="chip-row">${w.servicios.length ? w.servicios.map(s=>`<span class="chip">${s}</span>`).join('') : '<span class="chip">Aún no ha agregado servicios</span>'}</div>
          <h3 style="font-size:14px; margin-bottom:4px;">Comentarios</h3>
          ${w.resenas.length ? w.resenas.map(r=>`<div class="review"><div class="stars">${'★'.repeat(r.estrellas)}${'☆'.repeat(5-r.estrellas)}</div><p>${r.comentario}</p><div class="who">— ${r.cliente}</div></div>`).join('') : '<p style="font-size:13px;color:var(--ink-soft);">Todavía no tiene comentarios.</p>'}
        </div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px;">
          <h3 style="font-size:14px; margin-bottom:12px;">Solicitar este servicio</h3>
          <p style="font-size:12.5px; color:var(--ink-soft); margin-bottom:16px;">Elige un día y una hora para que ${w.nombre.split(' ')[0]} confirme tu cita.</p>
          <button class="btn btn-primary" style="width:100%;" onclick="irAAgendar('${w.id}')">Agendar cita</button>
        </div>
        <div class="card">
          <h3 style="font-size:14px; margin-bottom:10px;">Zona de trabajo</h3>
          <div class="map-box" id="perfil-mapa"></div>
          <div class="map-caption"><span>${w.zona}, Ibagué</span><span>Ubicación aproximada</span></div>
        </div>
      </div>
    </div>`;
  initMapaPerfil(w);
}

function initMapaPerfil(w){
  const coords = coordsForZona(w.zona);
  if(mapPerfil){ mapPerfil.remove(); mapPerfil = null; }
  mapPerfil = L.map('perfil-mapa', {zoomControl:false, attributionControl:false}).setView(coords, 13);
  tileLayer(mapPerfil);
  L.marker(coords, {icon:pinIcon('#E8752C')}).addTo(mapPerfil)
    .bindPopup(`<b>${w.nombre}</b><br>${w.categoria} · ${w.zona}`);
  setTimeout(()=>mapPerfil && mapPerfil.invalidateSize(), 80);
}

function irAAgendar(workerId){
  const u = currentUser();
  if(!u || u.tipo!=='cliente'){
    nav('auth'); switchAuthTab('login');
    document.getElementById('auth-msg').innerHTML = `<div class="msg err">Inicia sesión como cliente para agendar una cita.</div>`;
    return;
  }
  state.workerActual = workerId; state.diaSel=null; state.horaSel=null;
  nav('agendar');
  const w = db.users.find(x=>x.id===workerId);
  document.getElementById('agendar-worker-summary').innerHTML = `<div class="avatar"></div><div><div style="font-weight:600; color:var(--navy); font-size:14px;">${w.nombre}</div><div style="font-size:12px; color:var(--ink-soft);">${w.categoria}</div></div>`;
  renderCalendario();
  renderSlots();
}

/* ---------------- AGENDAR ---------------- */
function renderCalendario(){
  const now = new Date();
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('cal-month').textContent = `${meses[now.getMonth()]} ${now.getFullYear()}`;
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  let startWeekday = firstDay.getDay(); startWeekday = startWeekday===0?6:startWeekday-1; // Monday-first
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const today = now.getDate();

  let html = ['L','M','X','J','V','S','D'].map(d=>`<div class="dow">${d}</div>`).join('');
  for(let i=0;i<startWeekday;i++) html += `<div class="day muted"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const past = d < today;
    const sel = state.diaSel===d;
    html += `<div class="day ${past?'muted':''} ${sel?'sel':''}" ${past?'':`onclick="seleccionarDia(${d}, this)"`}>${d}</div>`;
  }
  document.getElementById('cal-grid').innerHTML = html;
}
function seleccionarDia(d, el){
  state.diaSel = d;
  document.querySelectorAll('#cal-grid .day').forEach(x=>x.classList.remove('sel'));
  el.classList.add('sel');
}
function renderSlots(){
  const horas = ['8:00 am','10:00 am','1:00 pm','3:00 pm','4:30 pm','6:00 pm'];
  document.getElementById('slot-grid').innerHTML = horas.map(h=>
    `<div class="slot ${state.horaSel===h?'sel':''}" onclick="seleccionarHora('${h}', this)">${h}</div>`
  ).join('');
}
function seleccionarHora(h, el){
  state.horaSel = h;
  document.querySelectorAll('#slot-grid .slot').forEach(x=>x.classList.remove('sel'));
  el.classList.add('sel');
}
function confirmarCita(){
  const msg = document.getElementById('agendar-msg');
  if(!state.diaSel || !state.horaSel){
    msg.innerHTML = `<div class="msg err">Elige un día y una hora antes de confirmar.</div>`; return;
  }
  const now = new Date();
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const cita = {
    id: uid('c'), clienteId: sessionUserId, trabajadorId: state.workerActual,
    fecha: `${state.diaSel} de ${meses[now.getMonth()]}`, hora: state.horaSel,
    estado: 'pendiente', calificacion:null, pago:'pendiente', mensajes:[]
  };
  db.citas.push(cita); saveDB();
  const cliente = currentUser();
  const trabajador = db.users.find(x=>x.id===cita.trabajadorId);
  addNotificacion(trabajador.id, `Nueva solicitud de ${cliente.nombre} para el ${cita.fecha} · ${cita.hora}`);
  msg.innerHTML = `<div class="msg ok">✓ Cita enviada. Quedó pendiente de confirmación por parte del trabajador.</div>`;
  setTimeout(()=>nav('miscitas'), 900);
}

/* ---------------- MIS CITAS (cliente) ---------------- */
function renderMisCitas(){
  const u = currentUser();
  const box = document.getElementById('miscitas-content');
  if(!u || u.tipo!=='cliente'){ box.innerHTML = `<div class="empty-note">Inicia sesión como cliente para ver tus citas.</div>`; return; }
  const propias = db.citas.filter(c=>c.clienteId===u.id);
  if(!propias.length){ box.innerHTML = `<div class="empty-note">Todavía no has agendado ninguna cita. <br><button class="btn btn-primary" style="margin-top:12px;" onclick="nav('buscar')">Buscar trabajadores</button></div>`; return; }

  box.innerHTML = `<table><thead><tr><th>Trabajador</th><th>Fecha</th><th>Hora</th><th>Estado</th><th>Pago</th><th>Acciones</th></tr></thead><tbody>
    ${propias.map(c=>{
      const w = db.users.find(x=>x.id===c.trabajadorId);
      let accion = '';
      if(c.estado==='pendiente') accion = `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="cancelarCita('${c.id}')">Cancelar</button>`;
      if(c.estado==='aceptada') accion = `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="marcarCompletada('${c.id}')">Marcar completado</button>`;
      if(c.estado==='completada' && !c.calificacion) accion = `<button class="btn btn-primary" style="font-size:12px;padding:6px 10px;" onclick="abrirCalificar('${c.id}')">Calificar</button>`;
      if(c.calificacion) accion = `<span class="mono" style="font-size:12px;color:var(--ink-soft);">${'★'.repeat(c.calificacion.estrellas)} calificado</span>`;
      const pagoPill = c.pago==='pagado' ? `<span class="status-pill status-activo">pagado</span>` :
        (c.estado==='aceptada'||c.estado==='completada') ? `<button class="btn btn-outline" style="font-size:11px;padding:5px 9px;" onclick="simularPago('${c.id}')">Simular pago</button>` :
        `<span class="status-pill status-pendiente">pendiente</span>`;
      return `<tr>
        <td>${w?w.nombre:'—'}</td><td>${c.fecha}</td><td>${c.hora}</td>
        <td><span class="status-pill status-${c.estado}">${c.estado}</span></td>
        <td>${pagoPill}</td>
        <td><div class="row-actions">${accion}
          <button onclick="abrirChat('${c.id}')">Chat</button>
          <button onclick="abrirComprobante('${c.id}')">Comprobante</button>
          <button class="rej" onclick="abrirReportar('${c.id}')">Reportar</button>
        </div></td>
      </tr>`;
    }).join('')}
  </tbody></table>
  <div id="calificar-panel" style="margin-top:20px;"></div>
  <div id="chat-panel" style="margin-top:20px;"></div>
  <div id="reportar-panel" style="margin-top:20px;"></div>`;
}
function cancelarCita(id){ db.citas = db.citas.filter(c=>c.id!==id); saveDB(); renderMisCitas(); }
function marcarCompletada(id){ const c = db.citas.find(x=>x.id===id); c.estado='completada'; saveDB(); renderMisCitas(); }
function simularPago(id){
  const c = db.citas.find(x=>x.id===id); c.pago='pagado'; saveDB();
  const w = db.users.find(x=>x.id===c.trabajadorId);
  addNotificacion(w.id, `Pago simulado recibido por el servicio del ${c.fecha}.`);
  (document.getElementById('v-miscitas').classList.contains('active') ? renderMisCitas : renderTrabajo)();
}
function abrirCalificar(id){
  const panel = document.getElementById('calificar-panel');
  panel.innerHTML = `<div class="card">
    <h3 style="font-size:14px;margin-bottom:10px;">Califica el servicio</h3>
    <div class="stars-input" id="stars-input">${[1,2,3,4,5].map(n=>`<span data-n="${n}" onclick="setStars(${n})">★</span>`).join('')}</div>
    <textarea id="calif-comentario" placeholder="Cuéntanos cómo te fue..." rows="3" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:9px;font-family:inherit;font-size:13px;margin-bottom:12px;"></textarea>
    <button class="btn btn-primary" onclick="enviarCalificacion('${id}')">Enviar calificación</button>
  </div>`;
  state.estrellasSel = 5; setStars(5);
}
function setStars(n){
  state.estrellasSel = n;
  document.querySelectorAll('#stars-input span').forEach(s=>s.classList.toggle('on', Number(s.dataset.n)<=n));
}
function enviarCalificacion(citaId){
  const c = db.citas.find(x=>x.id===citaId);
  const w = db.users.find(x=>x.id===c.trabajadorId);
  const cliente = currentUser();
  const comentario = document.getElementById('calif-comentario').value.trim() || 'Sin comentarios.';
  w.resenas.push({cliente: cliente.nombre, estrellas: state.estrellasSel, comentario});
  c.calificacion = {estrellas: state.estrellasSel, comentario};
  saveDB();
  renderMisCitas();
}

/* ---------------- CHAT POR CITA ---------------- */
function abrirChat(citaId){
  state.chatCitaId = citaId;
  renderChat();
}
function renderChat(){
  const citaId = state.chatCitaId;
  const c = db.citas.find(x=>x.id===citaId);
  const activa = document.querySelector('.view.active').id;
  const panel = document.getElementById(activa==='v-trabajo' ? 'chat-panel-work' : 'chat-panel');
  if(!panel || !c) return;
  const u = currentUser();
  const otro = u.tipo==='cliente' ? db.users.find(x=>x.id===c.trabajadorId) : db.users.find(x=>x.id===c.clienteId);
  panel.innerHTML = `<div class="card">
    <h3 style="font-size:14px;margin-bottom:10px;">Chat con ${otro.nombre}</h3>
    <div class="chat-box" id="chat-box">${(c.mensajes||[]).map(m=>`<div class="chat-msg ${m.de===u.id?'mio':''}"><b>${m.de===u.id?'Tú':otro.nombre.split(' ')[0]}:</b> ${m.texto}</div>`).join('') || '<div class="empty-note" style="padding:10px;">Aún no hay mensajes. Escribe el primero.</div>'}</div>
    <div style="display:flex; gap:8px;">
      <input id="chat-input" placeholder="Escribe un mensaje..." style="flex:1;padding:10px 12px;border:1.5px solid var(--line);border-radius:9px;font-family:inherit;font-size:13px;" onkeydown="if(event.key==='Enter') enviarMensaje('${citaId}')">
      <button class="btn btn-primary" onclick="enviarMensaje('${citaId}')">Enviar</button>
    </div>
  </div>`;
  const box = document.getElementById('chat-box'); if(box) box.scrollTop = box.scrollHeight;
}
function enviarMensaje(citaId){
  const input = document.getElementById('chat-input');
  const texto = input.value.trim();
  if(!texto) return;
  const c = db.citas.find(x=>x.id===citaId);
  const u = currentUser();
  if(!c.mensajes) c.mensajes = [];
  c.mensajes.push({de:u.id, texto, fecha:new Date().toISOString()});
  saveDB();
  const otroId = u.tipo==='cliente' ? c.trabajadorId : c.clienteId;
  addNotificacion(otroId, `Nuevo mensaje de ${u.nombre.split(' ')[0]} sobre la cita del ${c.fecha}.`);
  input.value = '';
  renderChat();
}

/* ---------------- REPORTAR ---------------- */
function abrirReportar(citaId){
  const panel = document.getElementById('reportar-panel');
  panel.innerHTML = `<div class="card">
    <h3 style="font-size:14px;margin-bottom:10px;">Reportar un problema</h3>
    <textarea id="reporte-motivo" placeholder="Cuéntanos qué pasó..." rows="3" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:9px;font-family:inherit;font-size:13px;margin-bottom:12px;"></textarea>
    <button class="btn btn-primary" onclick="enviarReporte('${citaId}')">Enviar reporte</button>
  </div>`;
}
function enviarReporte(citaId){
  const motivo = document.getElementById('reporte-motivo').value.trim();
  if(!motivo) return;
  const u = currentUser();
  db.reportes.push({id: uid('r'), deNombre: u.nombre, citaId, motivo, estado:'abierto'});
  saveDB();
  document.getElementById('reportar-panel').innerHTML = `<div class="msg ok">✓ Reporte enviado. El administrador lo revisará pronto.</div>`;
}

/* ---------------- COMPROBANTE (imprimir / descargar) ---------------- */
function abrirComprobante(citaId){
  const c = db.citas.find(x=>x.id===citaId);
  const w = db.users.find(x=>x.id===c.trabajadorId);
  const cliente = db.users.find(x=>x.id===c.clienteId);
  const win = window.open('', '_blank', 'width=420,height=640');
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Comprobante ServiHogar</title>
  <style>
    body{font-family:Arial,sans-serif; padding:28px; color:#14201B;}
    h1{font-size:18px; margin-bottom:4px;} .sub{color:#5B6A66; font-size:12px; margin-bottom:20px;}
    .row{display:flex; justify-content:space-between; border-bottom:1px dashed #DCDFDE; padding:10px 0; font-size:13px;}
    .row b{color:#1C2B39;}
    .stamp{margin-top:20px; padding:10px; background:#EAF3EC; color:#3F7D58; text-align:center; border-radius:8px; font-weight:bold;}
  </style></head><body>
  <h1>ServiHogar — Orden de servicio</h1>
  <div class="sub">N° ${c.id.toUpperCase()}</div>
  <div class="row"><span>Cliente</span><b>${cliente.nombre}</b></div>
  <div class="row"><span>Trabajador</span><b>${w.nombre}</b></div>
  <div class="row"><span>Categoría</span><b>${w.categoria}</b></div>
  <div class="row"><span>Zona</span><b>${w.zona}</b></div>
  <div class="row"><span>Fecha</span><b>${c.fecha}</b></div>
  <div class="row"><span>Hora</span><b>${c.hora}</b></div>
  <div class="row"><span>Estado</span><b>${c.estado}</b></div>
  <div class="row"><span>Pago</span><b>${c.pago}</b></div>
  <div class="stamp">Documento generado por ServiHogar — comprobante no oficial</div>
  <script>window.onload = () => window.print();</script>
  </body></html>`);
  win.document.close();
}

/* ---------------- PANEL TRABAJADOR ---------------- */
function switchWorkTab(tab){
  document.getElementById('wtab-solicitudes').classList.toggle('on', tab==='solicitudes');
  document.getElementById('wtab-perfil').classList.toggle('on', tab==='perfil');
  document.getElementById('work-solicitudes').classList.toggle('hidden', tab!=='solicitudes');
  document.getElementById('work-perfil').classList.toggle('hidden', tab!=='perfil');
}
function renderTrabajo(){
  const u = currentUser();
  if(!u || u.tipo!=='trabajador'){ document.getElementById('work-solicitudes').innerHTML = `<div class="empty-note">Inicia sesión como trabajador para ver tu panel.</div>`; return; }

  const propias = db.citas.filter(c=>c.trabajadorId===u.id);
  document.getElementById('work-solicitudes').innerHTML = propias.length ? `
    <table><thead><tr><th>Cliente</th><th>Fecha</th><th>Hora</th><th>Estado</th><th>Pago</th><th>Acciones</th></tr></thead><tbody>
    ${propias.map(c=>{
      const cli = db.users.find(x=>x.id===c.clienteId);
      let accion = '';
      if(c.estado==='pendiente') accion = `<div class="row-actions"><button class="acc" onclick="responderCita('${c.id}','aceptada')">Aceptar</button><button class="rej" onclick="responderCita('${c.id}','rechazada')">Rechazar</button></div>`;
      return `<tr><td>${cli?cli.nombre:'—'}</td><td>${c.fecha}</td><td>${c.hora}</td>
        <td><span class="status-pill status-${c.estado}">${c.estado}</span></td>
        <td><span class="status-pill status-${c.pago==='pagado'?'activo':'pendiente'}">${c.pago||'pendiente'}</span></td>
        <td><div class="row-actions">${accion}<button onclick="abrirChat('${c.id}')">Chat</button></div></td></tr>`;
    }).join('')}
    </tbody></table>
    <div id="chat-panel-work" style="margin-top:20px;"></div>` : `<div class="empty-note">Todavía no tienes solicitudes de servicio.</div>`;

  const verifBadge = u.verificado ? `<span class="verif-badge">✓ Verificado</span>`
    : u.verificacionPendiente ? `<span class="status-pill status-pendiente">Verificación pendiente</span>`
    : `<button class="btn btn-outline" onclick="solicitarVerificacion()">Solicitar verificación</button>`;

  document.getElementById('work-perfil').innerHTML = `
    <div class="card" style="max-width:520px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:15px;">Editar perfil profesional</h3>
        ${verifBadge}
      </div>
      <div class="field"><label>Categoría</label>
        <select id="wp-cat">${CATS.map(c=>`<option ${c.n===u.categoria?'selected':''}>${c.n}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Zona</label><input id="wp-zona" value="${u.zona}"></div>
      <div class="field"><label>Años de experiencia</label><input type="number" id="wp-exp" value="${u.experiencia}"></div>
      <div class="field"><label>Tarifa desde (COP)</label><input type="number" id="wp-tarifa" value="${u.tarifa}"></div>
      <div class="field"><label>Servicios (separados por coma)</label><input id="wp-servicios" value="${u.servicios.join(', ')}"></div>
      <button class="btn btn-primary" onclick="guardarPerfilTrabajador()">Guardar cambios</button>
      <div id="wp-msg"></div>
    </div>`;
}
function solicitarVerificacion(){
  const u = currentUser();
  u.verificacionPendiente = true; saveDB();
  renderTrabajo();
}
function responderCita(id, estado){
  const c = db.citas.find(x=>x.id===id); c.estado = estado; saveDB();
  const cliente = db.users.find(x=>x.id===c.clienteId);
  const w = db.users.find(x=>x.id===c.trabajadorId);
  addNotificacion(cliente.id, `${w.nombre} ${estado==='aceptada'?'aceptó':'rechazó'} tu cita del ${c.fecha}.`);
  renderTrabajo();
}
function guardarPerfilTrabajador(){
  const u = currentUser();
  u.categoria = document.getElementById('wp-cat').value;
  u.zona = document.getElementById('wp-zona').value;
  u.experiencia = Number(document.getElementById('wp-exp').value)||0;
  u.tarifa = Number(document.getElementById('wp-tarifa').value)||0;
  u.servicios = document.getElementById('wp-servicios').value.split(',').map(s=>s.trim()).filter(Boolean);
  saveDB();
  document.getElementById('wp-msg').innerHTML = `<div class="msg ok" style="margin-top:12px;">Perfil actualizado.</div>`;
}

/* ---------------- PANEL ADMIN ---------------- */
function switchAdminTab(tab){
  document.getElementById('atab-usuarios').classList.toggle('on', tab==='usuarios');
  document.getElementById('atab-reportes').classList.toggle('on', tab==='reportes');
  document.getElementById('atab-estadisticas').classList.toggle('on', tab==='estadisticas');
  document.getElementById('admin-usuarios').classList.toggle('hidden', tab!=='usuarios');
  document.getElementById('admin-reportes').classList.toggle('hidden', tab!=='reportes');
  document.getElementById('admin-estadisticas').classList.toggle('hidden', tab!=='estadisticas');
  if(tab==='estadisticas') renderEstadisticas();
}
function renderAdmin(){
  const u = currentUser();
  if(!u || u.tipo!=='admin'){ document.getElementById('admin-usuarios').innerHTML = `<div class="empty-note">Solo el administrador puede ver este panel.</div>`; return; }

  const others = db.users.filter(x=>x.tipo!=='admin');
  document.getElementById('admin-usuarios').innerHTML = `
    <table><thead><tr><th>Nombre</th><th>Tipo</th><th>Correo</th><th>Estado</th><th>Verificación</th><th>Acción</th></tr></thead><tbody>
    ${others.map(x=>{
      let verifCell = '—';
      if(x.tipo==='trabajador'){
        verifCell = x.verificado ? `<span class="verif-badge">✓ Verificado</span>`
          : x.verificacionPendiente ? `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="verificarTrabajador('${x.id}')">Verificar</button>`
          : `<span class="status-pill status-bloqueado">Sin solicitar</span>`;
      }
      return `<tr><td>${x.nombre}</td><td>${x.tipo}</td><td>${x.correo}</td>
      <td><span class="status-pill status-${x.estado}">${x.estado}</span></td>
      <td>${verifCell}</td>
      <td><button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="toggleEstadoUsuario('${x.id}')">${x.estado==='activo'?'Bloquear':'Activar'}</button></td></tr>`;
    }).join('')}
    </tbody></table>`;

  document.getElementById('admin-reportes').innerHTML = db.reportes.length ? `
    <table><thead><tr><th>De</th><th>Motivo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
    ${db.reportes.map(r=>`<tr><td>${r.deNombre}</td><td>${r.motivo}</td><td><span class="status-pill status-${r.estado}">${r.estado}</span></td>
      <td>${r.estado==='abierto'?`<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="resolverReporte('${r.id}')">Marcar resuelto</button>`:'—'}</td></tr>`).join('')}
    </tbody></table>` : `<div class="empty-note">No hay reportes registrados.</div>`;
}
function toggleEstadoUsuario(id){
  const u = db.users.find(x=>x.id===id);
  u.estado = u.estado==='activo' ? 'bloqueado' : 'activo';
  saveDB(); renderAdmin();
}
function verificarTrabajador(id){
  const u = db.users.find(x=>x.id===id);
  u.verificado = true; u.verificacionPendiente = false;
  addNotificacion(u.id, 'Tu perfil fue verificado por el administrador. Ya se muestra el distintivo ✓ Verificado.');
  saveDB(); renderAdmin();
}
function resolverReporte(id){ const r = db.reportes.find(x=>x.id===id); r.estado='resuelto'; saveDB(); renderAdmin(); }

function renderEstadisticas(){
  const box = document.getElementById('admin-estadisticas');
  const trabajadores = db.users.filter(u=>u.tipo==='trabajador');

  const porCategoria = {};
  db.citas.forEach(c=>{
    const w = db.users.find(x=>x.id===c.trabajadorId);
    if(!w) return;
    porCategoria[w.categoria] = (porCategoria[w.categoria]||0) + 1;
  });
  const maxCat = Math.max(1, ...Object.values(porCategoria));

  const porTrabajador = {};
  db.citas.forEach(c=>{ porTrabajador[c.trabajadorId] = (porTrabajador[c.trabajadorId]||0) + 1; });
  const topTrabajadores = trabajadores
    .map(w=>({w, n: porTrabajador[w.id]||0}))
    .sort((a,b)=>b.n-a.n).slice(0,5);
  const maxTop = Math.max(1, ...topTrabajadores.map(t=>t.n));

  box.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:14px; margin-bottom:14px;">Citas por categoría</h3>
      ${Object.keys(porCategoria).length ? CATS.filter(c=>porCategoria[c.n]).map(c=>`
        <div class="stat-bar-row">
          <span class="stat-bar-label">${c.n}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(porCategoria[c.n]/maxCat)*100}%"></div></div>
          <span class="stat-bar-n">${porCategoria[c.n]}</span>
        </div>`).join('') : `<div class="empty-note">Aún no hay citas registradas.</div>`}
    </div>
    <div class="card">
      <h3 style="font-size:14px; margin-bottom:14px;">Trabajadores más solicitados</h3>
      ${db.citas.length ? topTrabajadores.map(t=>`
        <div class="stat-bar-row">
          <span class="stat-bar-label">${t.w.nombre}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(t.n/maxTop)*100}%; background:var(--orange);"></div></div>
          <span class="stat-bar-n">${t.n}</span>
        </div>`).join('') : `<div class="empty-note">Aún no hay citas registradas.</div>`}
    </div>`;
}

/* ---------------- INIT ---------------- */
applyTheme(loadTheme());
nav('home');
