/* ---------------- SUPABASE ---------------- */
// Nombre "sb" (no "supabase") a propósito: el bundle del CDN ya deja declarado
// "supabase" en el ámbito global, y un const propio con ese mismo nombre choca
// con eso (SyntaxError: Identifier 'supabase' has already been declared).
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------- REALTIME ---------------- */
let chatChannel = null;
let notifChannel = null;
function cerrarCanalChat(){
  if(chatChannel){ sb.removeChannel(chatChannel); chatChannel = null; }
}
function suscribirChat(citaId){
  cerrarCanalChat();
  chatChannel = sb.channel('mensajes-'+citaId)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'mensajes', filter:`cita_id=eq.${citaId}` }, ()=>{
      if(state.chatCitaId===citaId) renderChat();
    })
    .subscribe();
}
function cerrarCanalNotif(){
  if(notifChannel){ sb.removeChannel(notifChannel); notifChannel = null; }
}
function suscribirNotificaciones(userId){
  cerrarCanalNotif();
  notifChannel = sb.channel('notif-'+userId)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'notificaciones', filter:`user_id=eq.${userId}` }, payload=>{
      mostrarToast(payload.new.texto, 'info');
      renderNotifCount();
    })
    .subscribe();
}

/* ---------------- DATA LAYER ---------------- */
const DIAS_SEMANA = ['L','M','X','J','V','S','D']; // lunes-first, igual que el calendario
const HORAS_DISPONIBLES = ['8:00 am','10:00 am','1:00 pm','3:00 pm','4:30 pm','6:00 pm'];
// Disponibilidad "abierta": todos los días, todas las horas. Se usa como valor por
// defecto seguro para cuentas nuevas o antiguas que todavía no configuraron su horario.
function disponibilidadPorDefecto(){
  const d = {};
  DIAS_SEMANA.forEach(k=>d[k]=[...HORAS_DISPONIBLES]);
  return d;
}
function diaSemanaDeFecha(dateObj){
  const map = ['D','L','M','X','J','V','S']; // Date.getDay(): 0=domingo
  return map[dateObj.getDay()];
}

const THEME_KEY = 'servihogar_theme';
function loadTheme(){ return localStorage.getItem(THEME_KEY) || 'light'; }
function applyTheme(t){ document.documentElement.setAttribute('data-theme', t); }
function toggleTheme(){
  const next = document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
  applyTheme(next); localStorage.setItem(THEME_KEY, next);
  const btn = document.getElementById('theme-toggle');
  if(btn) btn.textContent = next==='dark' ? '☀️' : '🌙';
}

async function addNotificacion(userId, texto){
  await sb.from('notificaciones').insert({ user_id: userId, texto });
}

// Aviso flotante para confirmar acciones importantes (además del panel de campana).
// mensaje se inserta como texto plano (textContent), nunca como HTML.
function mostrarToast(mensaje, tipo='info'){
  const stack = document.getElementById('toast-stack');
  if(!stack) return;
  const iconos = {ok:'✓', err:'⚠', info:'🔔'};
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  const ic = document.createElement('span');
  ic.className = 'toast-ic';
  ic.textContent = iconos[tipo] || iconos.info;
  const txt = document.createElement('span');
  txt.textContent = mensaje;
  el.appendChild(ic); el.appendChild(txt);
  stack.appendChild(el);
  setTimeout(()=>{
    el.classList.add('out');
    setTimeout(()=>el.remove(), 220);
  }, 3500);
}

let sessionUserId = null; // id (uuid) del usuario autenticado en Supabase Auth
let currentProfile = null; // fila de la tabla profiles correspondiente a sessionUserId
let state = { catFiltro:null, workerActual:null, diaSel:null, horaSel:null, calMonthOffset:0, vistaBuscar:'lista', resultadosBuscar:[], mobileNavOpen:false, miUbicacion:null };

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
// Distancia en km entre dos puntos [lat, lng] (fórmula de Haversine)
function distanciaKm([lat1, lng1], [lat2, lng2]){
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function obtenerMiUbicacion(){
  const msg = document.getElementById('ubicacion-msg');
  if(!navigator.geolocation){
    msg.innerHTML = `<div class="msg err">Tu navegador no soporta ubicación.</div>`;
    return;
  }
  const btn = document.getElementById('btn-cerca-de-mi');
  if(btn){ btn.disabled = true; btn.textContent = 'Ubicando...'; }
  navigator.geolocation.getCurrentPosition(
    pos=>{
      state.miUbicacion = [pos.coords.latitude, pos.coords.longitude];
      if(btn){ btn.disabled = false; btn.textContent = '📍 Ubicación activada'; }
      const orden = document.getElementById('buscar-orden');
      if(orden && !orden.querySelector('option[value="distancia"]')){
        const opt = document.createElement('option');
        opt.value = 'distancia'; opt.textContent = 'Ordenar: más cerca';
        orden.appendChild(opt);
      }
      if(orden) orden.value = 'distancia';
      msg.innerHTML = `<div class="msg ok">✓ Mostrando distancias desde tu ubicación.</div>`;
      renderBuscar();
    },
    ()=>{
      if(btn){ btn.disabled = false; btn.textContent = '📍 Cerca de mí'; }
      msg.innerHTML = `<div class="msg err">No pudimos acceder a tu ubicación. Revisa los permisos del navegador.</div>`;
    }
  );
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

function currentUser(){ return currentProfile; }
// Mapea la fila de la tabla `profiles` (snake_case) al formato que ya usa el resto de la app
function normalizarPerfil(p){
  if(!p) return null;
  return {
    ...p,
    verificacionPendiente: p.verificacion_pendiente,
    favoritos: p.favoritos || [],
    servicios: p.servicios || [],
    disponibilidad: p.disponibilidad || (p.tipo==='trabajador' ? disponibilidadPorDefecto() : undefined)
  };
}
async function cargarPerfilActual(){
  if(!sessionUserId){ currentProfile = null; return; }
  const { data, error } = await sb.from('profiles').select('*').eq('id', sessionUserId).single();
  currentProfile = error ? null : normalizarPerfil(data);
}

/* ---------------- PERFILES (Supabase) ---------------- */
// Cachean en memoria las filas de `profiles` ya traídas, para no repetir
// consultas de red en cada tecla del buscador o cada re-render.
const perfilesCache = new Map(); // id -> perfil normalizado
let trabajadoresListaCache = null; // lista completa de trabajadores activos
function cachearPerfiles(rows){
  return (rows||[]).map(p=>{
    const perfil = { ...normalizarPerfil(p), resenas: (p.resenas||[]).map(r=>({ ...r, cliente: r.cliente_nombre })) };
    perfilesCache.set(perfil.id, perfil);
    return perfil;
  });
}
async function cargarTrabajadores(forzar=false){
  if(trabajadoresListaCache && !forzar) return trabajadoresListaCache;
  const { data, error } = await sb.from('profiles').select('*, resenas(*)').eq('tipo','trabajador');
  trabajadoresListaCache = error ? [] : cachearPerfiles(data);
  return trabajadoresListaCache;
}
function invalidarPerfil(id){
  perfilesCache.delete(id);
  trabajadoresListaCache = null;
}
async function obtenerPerfil(id, forzar=false){
  if(!id) return null;
  if(!forzar && perfilesCache.has(id)) return perfilesCache.get(id);
  const { data, error } = await sb.from('profiles').select('*, resenas(*)').eq('id', id).single();
  if(error) return null;
  const [perfil] = cachearPerfiles([data]);
  return perfil;
}
async function obtenerPerfiles(ids){
  const unicos = [...new Set(ids.filter(Boolean))];
  return Promise.all(unicos.map(id=>obtenerPerfil(id)));
}
function avg(resenas){ if(!resenas || !resenas.length) return null; return (resenas.reduce((a,r)=>a+r.estrellas,0)/resenas.length).toFixed(1); }
function fmtCOP(n){ return '$' + Number(n||0).toLocaleString('es-CO'); }
// Escapa texto de usuario antes de insertarlo en innerHTML (evita XSS almacenado vía nombre, zona, comentarios, mensajes, etc.)
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// Mapea una fila de la tabla `citas` (snake_case) al formato que ya usa el resto de la app
function normalizarCita(c){
  if(!c) return null;
  return { ...c, clienteId: c.cliente_id, trabajadorId: c.trabajador_id };
}
const AVATAR_PALETTE = ['#3F7D58','#C75F1D','#1C2B39','#5B6EAE','#A6433A','#2F8F94'];
function avatarHTML(nombre, fotoUrl){
  if(fotoUrl){
    return `<div class="avatar" style="padding:0;"><img src="${esc(fotoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;"></div>`;
  }
  const n = nombre || '';
  const iniciales = n.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();
  let hash = 0;
  for(let i=0;i<n.length;i++) hash = (hash*31 + n.charCodeAt(i)) % AVATAR_PALETTE.length;
  return `<div class="avatar" style="background:${AVATAR_PALETTE[hash]};">${esc(iniciales)}</div>`;
}

/* ---------------- NAV / ROUTING ---------------- */
const VISTAS_VALIDAS = ['home','auth','buscar','perfil','agendar','miscitas','favoritos','trabajo','admin'];
let suprimirPush = false; // true mientras restauramos una ruta (popstate / carga inicial): no volver a empujar historial

function routeHashFor(view){
  if((view==='perfil' || view==='agendar') && state.workerActual) return `#/${view}/${state.workerActual}`;
  return `#/${view}`;
}
function parseHash(){
  const partes = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  return { view: partes[0] || 'home', param: partes[1] || null };
}
// Reconstruye la vista actual a partir de la URL (botón atrás/adelante o carga con un link directo)
function restoreFromHash(){
  let { view, param } = parseHash();
  if(!VISTAS_VALIDAS.includes(view)) view = 'home';
  suprimirPush = true;
  if(view==='perfil' && param){
    verPerfil(param); // si el id no existe, verPerfil muestra "No encontramos ese trabajador"
  } else if(view==='agendar' && param){
    irAAgendar(param);
  } else {
    nav(view==='perfil'||view==='agendar' ? 'home' : view);
  }
  suprimirPush = false;
}
window.addEventListener('popstate', restoreFromHash);

function nav(view){
  state.mobileNavOpen = false;
  cerrarCanalChat();
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
  if(!suprimirPush){
    const hash = routeHashFor(view);
    if(location.hash !== hash) history.pushState(null, '', hash);
  }
}

function toggleMobileNav(){
  state.mobileNavOpen = !state.mobileNavOpen;
  renderNav(document.querySelector('.view.active').id.replace('v-',''));
}
document.addEventListener('click', e=>{
  if(!state.mobileNavOpen) return;
  const links = document.getElementById('navlinks');
  const toggle = document.getElementById('menu-toggle');
  if(links && toggle && !links.contains(e.target) && !toggle.contains(e.target)){
    state.mobileNavOpen = false;
    renderNav(document.querySelector('.view.active').id.replace('v-',''));
  }
});

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
  links.classList.toggle('open', state.mobileNavOpen);

  const notifBtn = u ? `
    <div class="notif-wrap">
      <button class="icon-btn" id="notif-btn" aria-label="Notificaciones" onclick="toggleNotifPanel()">🔔<span class="notif-count hidden" id="notif-count">0</span></button>
      <div class="notif-panel hidden" id="notif-panel"></div>
    </div>` : '';

  if(u){
    auth.innerHTML = `${notifBtn}
                       <span class="userchip">Hola, ${esc(u.nombre.split(' ')[0])}</span>
                       <button class="btn btn-ghost" onclick="logout()">Cerrar sesión</button>
                       <button class="icon-btn" id="theme-toggle" aria-label="Cambiar tema" onclick="toggleTheme()">${loadTheme()==='dark'?'☀️':'🌙'}</button>`;
    renderNotifCount();
  } else {
    auth.innerHTML = `<button class="icon-btn" id="theme-toggle" aria-label="Cambiar tema" onclick="toggleTheme()">${loadTheme()==='dark'?'☀️':'🌙'}</button>
                       <button class="btn btn-ghost" onclick="nav('auth'); switchAuthTab('login')">Ingresar</button>
                       <button class="btn btn-primary" onclick="nav('auth'); switchAuthTab('register')">Crear cuenta</button>`;
  }

  const toggle = document.getElementById('menu-toggle');
  if(toggle){
    toggle.classList.toggle('on', state.mobileNavOpen);
    toggle.setAttribute('aria-expanded', state.mobileNavOpen ? 'true' : 'false');
    toggle.setAttribute('aria-label', state.mobileNavOpen ? 'Cerrar menú' : 'Abrir menú');
  }
}

async function renderNotifCount(){
  const u = currentUser(); if(!u) return;
  const { count } = await sb.from('notificaciones').select('id', {count:'exact', head:true}).eq('user_id', u.id).eq('leida', false);
  const badge = document.getElementById('notif-count');
  if(!badge) return;
  badge.textContent = count || 0;
  badge.classList.toggle('hidden', !count);
}
async function toggleNotifPanel(){
  const u = currentUser(); if(!u) return;
  const panel = document.getElementById('notif-panel');
  const abrir = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if(!abrir) return;
  const { data } = await sb.from('notificaciones').select('*').eq('user_id', u.id).order('created_at', {ascending:false});
  const propias = data || [];
  panel.innerHTML = propias.length ? propias.map(n=>
    `<div class="notif-item ${n.leida?'':'unread'}">${esc(n.texto)}</div>`
  ).join('') : `<div class="notif-item">No tienes notificaciones.</div>`;
  const sinLeer = propias.filter(n=>!n.leida).map(n=>n.id);
  if(sinLeer.length) await sb.from('notificaciones').update({ leida:true }).in('id', sinLeer);
  renderNotifCount();
}

/* ---------------- HOME ---------------- */
async function renderHome(){
  const [trabajadores, { count: totalCitas }] = await Promise.all([
    cargarTrabajadores(),
    sb.from('citas').select('id', { count: 'exact', head: true })
  ]);
  document.getElementById('stat-workers').textContent = trabajadores.length;
  document.getElementById('stat-jobs').textContent = totalCitas || 0;
  const todasResenas = trabajadores.flatMap(w=>w.resenas||[]);
  document.getElementById('stat-rating').textContent = todasResenas.length
    ? (todasResenas.reduce((a,r)=>a+r.estrellas,0)/todasResenas.length).toFixed(1)
    : '—';

  document.getElementById('home-cats').innerHTML = CATS.map(c=>
    `<div class="cat-card" onclick="irABuscarConCategoria('${c.n}')">${iconSVG(c.n)}<span>${c.n}</span></div>`
  ).join('');

  const destacados = trabajadores.filter(u=>u.estado==='activo')
    .sort((a,b)=>(avg(b.resenas)||0)-(avg(a.resenas)||0)).slice(0,3);
  document.getElementById('home-workers').innerHTML = destacados.map(workerCardHTML).join('');
}

function workerCardHTML(w){
  const rating = avg(w.resenas);
  const u = currentUser();
  const esFav = u && u.tipo==='cliente' && (u.favoritos||[]).includes(w.id);
  const distancia = state.miUbicacion ? distanciaKm(state.miUbicacion, coordsForZona(w.zona)) : null;
  return `<div class="worker-card ticket" onclick="verPerfil('${w.id}')">
    <div class="worker-top">
      ${avatarHTML(w.nombre, w.foto_url)}
      <div style="flex:1;"><div class="name">${esc(w.nombre)} ${w.verificado?'<span class=\"verif-badge\" title=\"Verificado\">✓</span>':''}</div><div class="role">${esc(w.categoria)} · ${esc(w.zona)}</div></div>
      ${u && u.tipo==='cliente' ? `<button class="fav-btn ${esFav?'on':''}" aria-label="Guardar en favoritos" onclick="event.stopPropagation(); toggleFavorito('${w.id}')">${esFav?'♥':'♡'}</button>` : ''}
    </div>
    <div class="perf"></div>
    <div class="worker-meta">
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <div class="rating-pill">${rating ? '★ '+rating : 'Sin calificar'}</div>
        ${distancia!==null ? `<div class="rating-pill dist">📍 ${distancia<1 ? Math.round(distancia*1000)+' m' : distancia.toFixed(1)+' km'}</div>` : ''}
      </div>
      <div class="tarifa">Desde ${fmtCOP(w.tarifa)}</div>
    </div>
  </div>`;
}
async function toggleFavorito(workerId){
  const u = currentUser();
  if(!u || u.tipo!=='cliente'){ nav('auth'); switchAuthTab('login'); return; }
  if(!u.favoritos) u.favoritos = [];
  const i = u.favoritos.indexOf(workerId);
  if(i>-1) u.favoritos.splice(i,1); else u.favoritos.push(workerId);
  await sb.from('profiles').update({ favoritos: u.favoritos }).eq('id', u.id);
  // refrescar la vista donde estemos parados
  const activa = document.querySelector('.view.active').id.replace('v-','');
  if(activa==='home') renderHome();
  if(activa==='buscar') renderBuscar();
  if(activa==='favoritos') renderFavoritos();
  if(activa==='perfil') verPerfil(workerId);
}
async function renderFavoritos(){
  const u = currentUser();
  const box = document.getElementById('favoritos-content');
  if(!u || u.tipo!=='cliente'){ box.innerHTML = `<div class="empty-note">Inicia sesión como cliente para guardar y ver tus favoritos.</div>`; return; }
  const favs = await obtenerPerfiles(u.favoritos||[]);
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
function togglePasswordVisibility(id, btn){
  const input = document.getElementById(id);
  const mostrar = input.type === 'password';
  input.type = mostrar ? 'text' : 'password';
  btn.textContent = mostrar ? '🙈' : '👁';
  btn.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
}
async function doLogin(e){
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const msg = document.getElementById('auth-msg');
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if(error){ msg.innerHTML = `<div class="msg err">Correo o contraseña incorrectos.</div>`; return false; }
  sessionUserId = data.user.id;
  await cargarPerfilActual();
  if(currentProfile && currentProfile.estado==='bloqueado'){
    msg.innerHTML = `<div class="msg err">Esta cuenta está bloqueada. Contacta al administrador.</div>`;
    await sb.auth.signOut(); sessionUserId = null; currentProfile = null;
    return false;
  }
  msg.innerHTML='';
  nav(currentProfile.tipo==='trabajador' ? 'trabajo' : currentProfile.tipo==='admin' ? 'admin' : 'home');
  suscribirNotificaciones(currentProfile.id);
  const { data: pendientes } = await sb.from('notificaciones').select('*').eq('user_id', currentProfile.id).eq('leida', false);
  if(pendientes && pendientes.length===1) mostrarToast(pendientes[0].texto, 'info');
  else if(pendientes && pendientes.length>1) mostrarToast(`Tienes ${pendientes.length} notificaciones nuevas.`, 'info');
  return false;
}
async function doRegister(e){
  e.preventDefault();
  const tipo = document.getElementById('reg-tipo').value;
  const nombre = document.getElementById('reg-nombre').value.trim();
  const correo = document.getElementById('reg-email').value.trim().toLowerCase();
  const pass = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  const msg = document.getElementById('auth-msg');
  if(pass !== pass2){
    msg.innerHTML = `<div class="msg err">Las contraseñas no coinciden.</div>`; return false;
  }
  const { data, error } = await sb.auth.signUp({ email: correo, password: pass });
  if(error){
    msg.innerHTML = `<div class="msg err">${error.message.includes('registered') ? 'Ya existe una cuenta con ese correo.' : 'No se pudo crear la cuenta. Intenta de nuevo.'}</div>`;
    return false;
  }
  if(!data.session){
    // El proyecto de Supabase tiene "Confirm email" activado: signUp no deja
    // sesión activa todavía, así que no podemos crear el perfil (RLS lo exige).
    msg.innerHTML = `<div class="msg ok">✓ Cuenta creada. Revisa tu correo para confirmarla; después vas a poder iniciar sesión.</div>`;
    return false;
  }
  const nuevoPerfil = { id: data.user.id, tipo, nombre, correo, estado:'activo' };
  if(tipo==='trabajador'){
    nuevoPerfil.categoria = document.getElementById('reg-cat').value;
    nuevoPerfil.tarifa = Math.max(0, Number(document.getElementById('reg-tarifa').value)||25000);
    nuevoPerfil.experiencia = 0; nuevoPerfil.zona = 'Sin definir';
    nuevoPerfil.servicios = []; nuevoPerfil.disponibilidad = disponibilidadPorDefecto();
  }
  const { error: perfilError } = await sb.from('profiles').insert(nuevoPerfil);
  if(perfilError){
    msg.innerHTML = `<div class="msg err">Cuenta creada, pero hubo un problema guardando el perfil: ${esc(perfilError.message)}</div>`;
    return false;
  }
  sessionUserId = data.user.id;
  await cargarPerfilActual();
  nav(tipo==='trabajador' ? 'trabajo' : 'home');
  suscribirNotificaciones(sessionUserId);
  return false;
}
async function logout(){
  await sb.auth.signOut();
  sessionUserId = null; currentProfile = null;
  cerrarCanalChat(); cerrarCanalNotif();
  nav('home');
}

/* ---------------- BUSCAR ---------------- */
async function renderBuscar(){
  document.getElementById('buscar-chips').innerHTML = ['Todas', ...CATS.map(c=>c.n)].map(c=>{
    const active = (c==='Todas' && !state.catFiltro) || c===state.catFiltro;
    return `<button class="chipbtn ${active?'on':''}" onclick="setCatFiltro('${c==='Todas'?'':c}')">${c}</button>`;
  }).join('');

  const q = (document.getElementById('buscar-text').value||'').toLowerCase();
  const trabajadores = await cargarTrabajadores();
  let results = trabajadores.filter(w=>w.estado==='activo');
  if(state.catFiltro) results = results.filter(w=>w.categoria===state.catFiltro);
  if(q) results = results.filter(w=>w.nombre.toLowerCase().includes(q) || w.categoria.toLowerCase().includes(q)
    || w.zona.toLowerCase().includes(q) || (w.servicios||[]).some(s=>s.toLowerCase().includes(q)));

  const orden = document.getElementById('buscar-orden') ? document.getElementById('buscar-orden').value : 'relevancia';
  if(orden==='precio-asc') results = results.slice().sort((a,b)=>a.tarifa-b.tarifa);
  if(orden==='precio-desc') results = results.slice().sort((a,b)=>b.tarifa-a.tarifa);
  if(orden==='calificacion') results = results.slice().sort((a,b)=>(avg(b.resenas)||0)-(avg(a.resenas)||0));
  if(orden==='distancia' && state.miUbicacion){
    results = results.slice().sort((a,b)=>
      distanciaKm(state.miUbicacion, coordsForZona(a.zona)) - distanciaKm(state.miUbicacion, coordsForZona(b.zona))
    );
  }

  const box = document.getElementById('buscar-results');
  box.innerHTML = results.length ? results.map(workerCardHTML).join('') : `<div class="empty-note">No encontramos trabajadores con ese criterio. Prueba con otra categoría o término.</div>`;
  const summary = document.getElementById('buscar-summary');
  if(summary){
    const tarifas = results.map(w=>Number(w.tarifa)||0).filter(Boolean);
    const minTarifa = tarifas.length ? Math.min(...tarifas) : 0;
    const verificados = results.filter(w=>w.verificado).length;
    summary.innerHTML = `<span>${results.length} ${results.length===1?'resultado':'resultados'}</span>
      <span>${verificados} verificados</span>
      <span>${minTarifa ? 'Desde '+fmtCOP(minTarifa) : 'Sin tarifas'}</span>`;
  }
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
  mapBuscar = L.map('buscar-mapa-box', {zoomControl:true, attributionControl:false}).setView(state.miUbicacion || IBAGUE_CENTRO, 12);
  tileLayer(mapBuscar);
  results.forEach(w=>{
    const coords = coordsForZona(w.zona);
    L.marker(coords, {icon:pinIcon('#1C2B39')}).addTo(mapBuscar)
      .bindPopup(`<b>${esc(w.nombre)}</b><br>${esc(w.categoria)} · ${esc(w.zona)}<br><a href="#" onclick="verPerfil('${w.id}'); return false;">Ver perfil →</a>`);
  });
  if(state.miUbicacion){
    L.marker(state.miUbicacion, {icon:pinIcon('#2F8F94')}).addTo(mapBuscar).bindPopup('<b>Tu ubicación</b>');
  }
  setTimeout(()=>mapBuscar && mapBuscar.invalidateSize(), 80);
}

/* ---------------- PERFIL ---------------- */
async function verPerfil(workerId){
  state.workerActual = workerId;
  nav('perfil');
  const w = await obtenerPerfil(workerId);
  if(!w){ document.getElementById('perfil-content').innerHTML = `<div class="empty-note">No encontramos ese trabajador.</div>`; return; }
  const rating = avg(w.resenas);
  const u = currentUser();
  const esFav = u && u.tipo==='cliente' && (u.favoritos||[]).includes(w.id);
  document.getElementById('perfil-content').innerHTML = `
    <div class="profile-grid">
      <div>
        <div class="card">
          <div class="profile-header">
            ${avatarHTML(w.nombre, w.foto_url)}
            <div style="flex:1;"><h2>${esc(w.nombre)} ${w.verificado?'<span class="verif-badge" title="Verificado">✓ Verificado</span>':''}</h2><div class="role">${esc(w.categoria.toUpperCase())} · ${w.experiencia} AÑOS DE EXPERIENCIA</div></div>
            ${u && u.tipo==='cliente' ? `<button class="fav-btn ${esFav?'on':''}" aria-label="Guardar en favoritos" onclick="toggleFavorito('${w.id}')">${esFav?'♥':'♡'}</button>` : ''}
          </div>
          <div class="spec-sheet">
            <div class="spec-item"><div class="k">Calificación</div><div class="v">${rating || '—'}</div></div>
            <div class="spec-item"><div class="k">Trabajos hechos</div><div class="v">${w.resenas.length}</div></div>
            <div class="spec-item"><div class="k">Zona</div><div class="v">${esc(w.zona)}</div></div>
            <div class="spec-item"><div class="k">Tarifa desde</div><div class="v">${fmtCOP(w.tarifa)}</div></div>
          </div>
          <h3 style="font-size:14px; margin-bottom:8px;">Servicios que ofrece</h3>
          <div class="chip-row">${w.servicios.length ? w.servicios.map(s=>`<span class="chip">${esc(s)}</span>`).join('') : '<span class="chip">Aún no ha agregado servicios</span>'}</div>
          <h3 style="font-size:14px; margin-bottom:4px;">Comentarios</h3>
          ${w.resenas.length ? w.resenas.map(r=>`<div class="review"><div class="stars">${'★'.repeat(r.estrellas)}${'☆'.repeat(5-r.estrellas)}</div><p>${esc(r.comentario)}</p><div class="who">— ${esc(r.cliente)}</div></div>`).join('') : '<p style="font-size:13px;color:var(--ink-soft);">Todavía no tiene comentarios.</p>'}
        </div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px;">
          <h3 style="font-size:14px; margin-bottom:12px;">Solicitar este servicio</h3>
          <p style="font-size:12.5px; color:var(--ink-soft); margin-bottom:16px;">Elige un día y una hora para que ${esc(w.nombre.split(' ')[0])} confirme tu cita.</p>
          <button class="btn btn-primary" style="width:100%;" onclick="irAAgendar('${w.id}')">Agendar cita</button>
        </div>
        <div class="card">
          <h3 style="font-size:14px; margin-bottom:10px;">Zona de trabajo</h3>
          <div class="map-box" id="perfil-mapa"></div>
          <div class="map-caption"><span>${esc(w.zona)}, Ibagué</span><span>Ubicación aproximada</span></div>
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
    .bindPopup(`<b>${esc(w.nombre)}</b><br>${esc(w.categoria)} · ${esc(w.zona)}`);
  setTimeout(()=>mapPerfil && mapPerfil.invalidateSize(), 80);
}

async function irAAgendar(workerId){
  const u = currentUser();
  if(!u || u.tipo!=='cliente'){
    nav('auth'); switchAuthTab('login');
    document.getElementById('auth-msg').innerHTML = `<div class="msg err">Inicia sesión como cliente para agendar una cita.</div>`;
    return;
  }
  state.workerActual = workerId; state.diaSel=null; state.horaSel=null; state.calMonthOffset=0;
  nav('agendar');
  const w = await obtenerPerfil(workerId);
  if(!w){ document.getElementById('agendar-worker-summary').innerHTML = `<div class="empty-note">No encontramos ese trabajador.</div>`; return; }
  document.getElementById('agendar-worker-summary').innerHTML = `${avatarHTML(w.nombre, w.foto_url)}<div><div style="font-weight:600; color:var(--navy); font-size:14px;">${esc(w.nombre)}</div><div style="font-size:12px; color:var(--ink-soft);">${esc(w.categoria)}</div></div>`;
  renderCalendario();
  renderSlots();
}

/* ---------------- AGENDAR ---------------- */
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function calMesObjetivo(){
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth()+state.calMonthOffset, 1);
}
function cambiarMesCalendario(delta){
  if(state.calMonthOffset+delta < 0) return;
  state.calMonthOffset += delta;
  state.diaSel = null; state.horaSel = null;
  renderCalendario();
  renderSlots();
}
function renderCalendario(){
  const now = new Date();
  const target = calMesObjetivo();
  document.getElementById('cal-month').textContent = `${MESES[target.getMonth()]} ${target.getFullYear()}`;
  document.getElementById('cal-prev').disabled = state.calMonthOffset===0;
  let startWeekday = target.getDay(); startWeekday = startWeekday===0?6:startWeekday-1; // Monday-first
  const daysInMonth = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
  const esMesActual = state.calMonthOffset===0;
  const today = now.getDate();

  let html = ['L','M','X','J','V','S','D'].map(d=>`<div class="dow">${d}</div>`).join('');
  for(let i=0;i<startWeekday;i++) html += `<div class="day muted"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const past = esMesActual && d < today;
    const sel = state.diaSel===d;
    html += `<div class="day ${past?'muted':''} ${sel?'sel':''}" ${past?'':`onclick="seleccionarDia(${d}, this)"`}>${d}</div>`;
  }
  document.getElementById('cal-grid').innerHTML = html;
}
function seleccionarDia(d, el){
  state.diaSel = d; state.horaSel = null;
  document.querySelectorAll('#cal-grid .day').forEach(x=>x.classList.remove('sel'));
  el.classList.add('sel');
  renderSlots();
}
async function renderSlots(){
  const grid = document.getElementById('slot-grid');
  if(!state.diaSel){
    grid.innerHTML = `<div class="empty-note" style="padding:16px 0;">Elige primero un día en el calendario.</div>`;
    return;
  }
  const target = calMesObjetivo();
  const dia = diaSemanaDeFecha(new Date(target.getFullYear(), target.getMonth(), state.diaSel));
  const w = await obtenerPerfil(state.workerActual);
  if(!w){ grid.innerHTML = `<div class="empty-note" style="padding:16px 0;">No encontramos ese trabajador.</div>`; return; }
  const disponibles = (w.disponibilidad && w.disponibilidad[dia]) || [];
  if(!disponibles.length){
    grid.innerHTML = `<div class="empty-note" style="padding:16px 0;">${esc(w.nombre.split(' ')[0])} no atiende ese día. Elige otro día en el calendario.</div>`;
    return;
  }
  grid.innerHTML = HORAS_DISPONIBLES.map(h=>{
    const activo = disponibles.includes(h);
    return `<div class="slot ${state.horaSel===h?'sel':''} ${activo?'':'muted'}" ${activo?`onclick="seleccionarHora('${h}', this)"`:''}>${h}</div>`;
  }).join('');
}
function seleccionarHora(h, el){
  state.horaSel = h;
  document.querySelectorAll('#slot-grid .slot').forEach(x=>x.classList.remove('sel'));
  el.classList.add('sel');
}
async function confirmarCita(){
  const msg = document.getElementById('agendar-msg');
  if(!state.diaSel || !state.horaSel){
    msg.innerHTML = `<div class="msg err">Elige un día y una hora antes de confirmar.</div>`; return;
  }
  const target = calMesObjetivo();
  const mesesLower = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const anioSufijo = target.getFullYear()!==new Date().getFullYear() ? ` de ${target.getFullYear()}` : '';
  const fecha = `${state.diaSel} de ${mesesLower[target.getMonth()]}${anioSufijo}`;
  const dia = diaSemanaDeFecha(new Date(target.getFullYear(), target.getMonth(), state.diaSel));
  const w = await obtenerPerfil(state.workerActual);
  if(!w){ msg.innerHTML = `<div class="msg err">No encontramos ese trabajador.</div>`; return; }
  const disponibles = (w.disponibilidad && w.disponibilidad[dia]) || [];
  if(!disponibles.includes(state.horaSel)){
    msg.innerHTML = `<div class="msg err">Ese horario ya no está disponible para este trabajador. Elige otro.</div>`;
    return;
  }
  const { data: ocupadas } = await sb.from('citas').select('id')
    .eq('trabajador_id', w.id).eq('fecha', fecha).eq('hora', state.horaSel).neq('estado','rechazada');
  if(ocupadas && ocupadas.length){
    msg.innerHTML = `<div class="msg err">Ese horario ya está reservado con este trabajador. Elige otro día u hora.</div>`;
    return;
  }
  const { data: cita, error } = await sb.from('citas').insert({
    cliente_id: sessionUserId, trabajador_id: w.id,
    fecha, hora: state.horaSel, estado: 'pendiente', pago: 'pendiente'
  }).select().single();
  if(error){
    msg.innerHTML = `<div class="msg err">No se pudo agendar: ${esc(error.message)}</div>`;
    return;
  }
  const cliente = currentUser();
  addNotificacion(w.id, `Nueva solicitud de ${cliente.nombre} para el ${cita.fecha} · ${cita.hora}`);
  msg.innerHTML = `<div class="msg ok">✓ Cita enviada. Quedó pendiente de confirmación por parte del trabajador.</div>`;
  mostrarToast('Cita enviada. Quedó pendiente de confirmación.', 'ok');
  setTimeout(()=>nav('miscitas'), 900);
}

/* ---------------- MIS CITAS (cliente) ---------------- */
async function renderMisCitas(){
  const u = currentUser();
  const box = document.getElementById('miscitas-content');
  if(!u || u.tipo!=='cliente'){ box.innerHTML = `<div class="empty-note">Inicia sesión como cliente para ver tus citas.</div>`; return; }
  const { data } = await sb.from('citas').select('*').eq('cliente_id', u.id).order('created_at', {ascending:false});
  const propias = (data||[]).map(normalizarCita);
  if(!propias.length){ box.innerHTML = `<div class="empty-note">Todavía no has agendado ninguna cita. <br><button class="btn btn-primary" style="margin-top:12px;" onclick="nav('buscar')">Buscar trabajadores</button></div>`; return; }

  const trabajadores = await obtenerPerfiles(propias.map(c=>c.trabajadorId));
  const porId = new Map(trabajadores.map(w=>[w && w.id, w]));
  box.innerHTML = `<table><thead><tr><th>Trabajador</th><th>Fecha</th><th>Hora</th><th>Estado</th><th>Pago</th><th>Acciones</th></tr></thead><tbody>
    ${propias.map(c=>{
      const w = porId.get(c.trabajadorId);
      let accion = '';
      if(c.estado==='pendiente') accion = `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="cancelarCita('${c.id}')">Cancelar</button>`;
      if(c.estado==='aceptada') accion = `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="marcarCompletada('${c.id}')">Marcar completado</button>`;
      if(c.estado==='completada' && !c.calificacion) accion = `<button class="btn btn-primary" style="font-size:12px;padding:6px 10px;" onclick="abrirCalificar('${c.id}')">Calificar</button>`;
      if(c.calificacion) accion = `<span class="mono" style="font-size:12px;color:var(--ink-soft);">${'★'.repeat(c.calificacion.estrellas)} calificado</span>`;
      const pagoPill = c.pago==='pagado' ? `<span class="status-pill status-activo">pagado</span>` :
        (c.estado==='aceptada'||c.estado==='completada') ? `<button class="btn btn-outline" style="font-size:11px;padding:5px 9px;" onclick="simularPago('${c.id}')">Simular pago</button>` :
        `<span class="status-pill status-pendiente">pendiente</span>`;
      return `<tr>
        <td>${w?esc(w.nombre):'—'}</td><td>${esc(c.fecha)}</td><td>${esc(c.hora)}</td>
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
  <div id="reportar-panel" style="margin-top:20px;" role="status" aria-live="polite"></div>`;
}
async function cancelarCita(id){
  if(!confirm('¿Seguro que quieres cancelar esta cita? Esta acción no se puede deshacer.')) return;
  await sb.from('citas').delete().eq('id', id);
  renderMisCitas();
}
async function marcarCompletada(id){
  await sb.from('citas').update({ estado: 'completada' }).eq('id', id);
  renderMisCitas();
}
async function simularPago(id){
  const { data: c } = await sb.from('citas').update({ pago: 'pagado' }).eq('id', id).select().single();
  const w = await obtenerPerfil(normalizarCita(c).trabajadorId);
  if(w) addNotificacion(w.id, `Pago simulado recibido por el servicio del ${c.fecha}.`);
  mostrarToast('Pago simulado registrado.', 'ok');
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
async function enviarCalificacion(citaId){
  const { data: citaRaw } = await sb.from('citas').select('trabajador_id').eq('id', citaId).single();
  if(!citaRaw) return;
  const cliente = currentUser();
  const comentario = document.getElementById('calif-comentario').value.trim() || 'Sin comentarios.';
  await sb.from('resenas').insert({
    worker_id: citaRaw.trabajador_id, cliente_nombre: cliente.nombre,
    estrellas: state.estrellasSel, comentario
  });
  await sb.from('citas').update({ calificacion: { estrellas: state.estrellasSel, comentario } }).eq('id', citaId);
  invalidarPerfil(citaRaw.trabajador_id);
  renderMisCitas();
}

/* ---------------- CHAT POR CITA ---------------- */
function abrirChat(citaId){
  state.chatCitaId = citaId;
  renderChat();
  suscribirChat(citaId);
}
async function renderChat(){
  const citaId = state.chatCitaId;
  const { data: citaRaw } = await sb.from('citas').select('*').eq('id', citaId).single();
  const c = normalizarCita(citaRaw);
  const activa = document.querySelector('.view.active').id;
  const panel = document.getElementById(activa==='v-trabajo' ? 'chat-panel-work' : 'chat-panel');
  if(!panel || !c) return;
  const u = currentUser();
  const otro = await obtenerPerfil(u.tipo==='cliente' ? c.trabajadorId : c.clienteId);
  if(!otro){ panel.innerHTML = `<div class="empty-note">No encontramos a la otra persona de esta cita.</div>`; return; }
  const { data: mensajes } = await sb.from('mensajes').select('*').eq('cita_id', citaId).order('created_at');
  panel.innerHTML = `<div class="card">
    <h3 style="font-size:14px;margin-bottom:10px;">Chat con ${esc(otro.nombre)}</h3>
    <div class="chat-box" id="chat-box">${(mensajes||[]).map(m=>`<div class="chat-msg ${m.de===u.id?'mio':''}"><b>${m.de===u.id?'Tú':esc(otro.nombre.split(' ')[0])}:</b> ${esc(m.texto)}</div>`).join('') || '<div class="empty-note" style="padding:10px;">Aún no hay mensajes. Escribe el primero.</div>'}</div>
    <div style="display:flex; gap:8px;">
      <input id="chat-input" placeholder="Escribe un mensaje..." style="flex:1;padding:10px 12px;border:1.5px solid var(--line);border-radius:9px;font-family:inherit;font-size:13px;" onkeydown="if(event.key==='Enter') enviarMensaje('${citaId}')">
      <button class="btn btn-primary" onclick="enviarMensaje('${citaId}')">Enviar</button>
    </div>
  </div>`;
  const box = document.getElementById('chat-box'); if(box) box.scrollTop = box.scrollHeight;
}
async function enviarMensaje(citaId){
  const input = document.getElementById('chat-input');
  const texto = input.value.trim();
  if(!texto) return;
  const u = currentUser();
  const { data: citaRaw } = await sb.from('citas').select('*').eq('id', citaId).single();
  const c = normalizarCita(citaRaw);
  if(!c) return;
  await sb.from('mensajes').insert({ cita_id: citaId, de: u.id, texto });
  const otroId = u.tipo==='cliente' ? c.trabajadorId : c.clienteId;
  addNotificacion(otroId, `Nuevo mensaje de ${u.nombre.split(' ')[0]} sobre la cita del ${c.fecha}.`);
  input.value = '';
  renderChat();
}

/* ---------------- REPORTAR ---------------- */
async function abrirReportar(citaId){
  const panel = document.getElementById('reportar-panel');
  const { data: existentes } = await sb.from('reportes').select('id').eq('cita_id', citaId).eq('estado','abierto');
  if(existentes && existentes.length){
    panel.innerHTML = `<div class="card"><p style="font-size:13px;color:var(--ink-soft);">Ya enviaste un reporte para esta cita y sigue en revisión. Te avisaremos cuando el administrador lo resuelva.</p></div>`;
    return;
  }
  panel.innerHTML = `<div class="card">
    <h3 style="font-size:14px;margin-bottom:10px;">Reportar un problema</h3>
    <textarea id="reporte-motivo" placeholder="Cuéntanos qué pasó..." rows="3" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:9px;font-family:inherit;font-size:13px;margin-bottom:12px;"></textarea>
    <button class="btn btn-primary" onclick="enviarReporte('${citaId}')">Enviar reporte</button>
  </div>`;
}
async function enviarReporte(citaId){
  const motivo = document.getElementById('reporte-motivo').value.trim();
  if(!motivo) return;
  const { data: existentes } = await sb.from('reportes').select('id').eq('cita_id', citaId).eq('estado','abierto');
  if(existentes && existentes.length) return;
  const u = currentUser();
  const { error } = await sb.from('reportes').insert({ cita_id: citaId, de_nombre: u.nombre, motivo, estado:'abierto' });
  if(error){
    document.getElementById('reportar-panel').innerHTML = `<div class="msg err">No se pudo enviar el reporte: ${esc(error.message)}</div>`;
    return;
  }
  document.getElementById('reportar-panel').innerHTML = `<div class="msg ok">✓ Reporte enviado. El administrador lo revisará pronto.</div>`;
  mostrarToast('Reporte enviado.', 'ok');
}

/* ---------------- COMPROBANTE (imprimir / descargar) ---------------- */
async function abrirComprobante(citaId){
  // Abrir la ventana antes de esperar los datos: si se abre después de un await
  // el navegador puede bloquearla por no venir "directo" del clic del usuario.
  const win = window.open('', '_blank', 'width=420,height=640');
  const { data: citaRaw } = await sb.from('citas').select('*').eq('id', citaId).single();
  const c = normalizarCita(citaRaw);
  if(!c){ win.close(); return; }
  const [w, cliente] = await Promise.all([obtenerPerfil(c.trabajadorId), obtenerPerfil(c.clienteId)]);
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
  <div class="row"><span>Cliente</span><b>${esc(cliente?cliente.nombre:'—')}</b></div>
  <div class="row"><span>Trabajador</span><b>${esc(w?w.nombre:'—')}</b></div>
  <div class="row"><span>Categoría</span><b>${esc(w?w.categoria:'—')}</b></div>
  <div class="row"><span>Zona</span><b>${esc(w?w.zona:'—')}</b></div>
  <div class="row"><span>Fecha</span><b>${esc(c.fecha)}</b></div>
  <div class="row"><span>Hora</span><b>${esc(c.hora)}</b></div>
  <div class="row"><span>Estado</span><b>${esc(c.estado)}</b></div>
  <div class="row"><span>Pago</span><b>${esc(c.pago)}</b></div>
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
async function renderTrabajo(){
  const u = currentUser();
  if(!u || u.tipo!=='trabajador'){ document.getElementById('work-solicitudes').innerHTML = `<div class="empty-note">Inicia sesión como trabajador para ver tu panel.</div>`; return; }

  const { data } = await sb.from('citas').select('*').eq('trabajador_id', u.id).order('created_at', {ascending:false});
  const propias = (data||[]).map(normalizarCita);
  const clientes = await obtenerPerfiles(propias.map(c=>c.clienteId));
  const clientePorId = new Map(clientes.map(c=>[c && c.id, c]));
  document.getElementById('work-solicitudes').innerHTML = propias.length ? `
    <table><thead><tr><th>Cliente</th><th>Fecha</th><th>Hora</th><th>Estado</th><th>Pago</th><th>Acciones</th></tr></thead><tbody>
    ${propias.map(c=>{
      const cli = clientePorId.get(c.clienteId);
      let accion = '';
      if(c.estado==='pendiente') accion = `<div class="row-actions"><button class="acc" onclick="responderCita('${c.id}','aceptada')">Aceptar</button><button class="rej" onclick="responderCita('${c.id}','rechazada')">Rechazar</button></div>`;
      return `<tr><td>${cli?esc(cli.nombre):'—'}</td><td>${esc(c.fecha)}</td><td>${esc(c.hora)}</td>
        <td><span class="status-pill status-${c.estado}">${c.estado}</span></td>
        <td><span class="status-pill status-${c.pago==='pagado'?'activo':'pendiente'}">${c.pago||'pendiente'}</span></td>
        <td><div class="row-actions">${accion}<button onclick="abrirChat('${c.id}')">Chat</button></div></td></tr>`;
    }).join('')}
    </tbody></table>
    <div id="chat-panel-work" style="margin-top:20px;"></div>` : `<div class="empty-note">Todavía no tienes solicitudes de servicio.</div>`;

  const verifBadge = u.verificado ? `<span class="verif-badge">✓ Verificado</span>`
    : u.verificacionPendiente ? `<span class="status-pill status-pendiente">Verificación pendiente</span>`
    : `<button class="btn btn-outline" onclick="mostrarFormularioVerificacion()">Solicitar verificación</button>`;

  state.wpDisponibilidad = JSON.parse(JSON.stringify(u.disponibilidad || disponibilidadPorDefecto()));

  document.getElementById('work-perfil').innerHTML = `
    <div class="card" style="max-width:520px; margin-bottom:16px;">
      <h3 style="font-size:15px; margin-bottom:14px;">Foto de perfil</h3>
      <div style="display:flex; align-items:center; gap:14px;">
        ${avatarHTML(u.nombre, u.foto_url)}
        <div>
          <input type="file" id="wp-foto-input" accept="image/*" class="hidden" onchange="subirFotoPerfil()">
          <button type="button" class="btn btn-outline" onclick="document.getElementById('wp-foto-input').click()">Cambiar foto</button>
          <div id="wp-foto-msg" role="status" aria-live="polite" style="margin-top:8px;"></div>
        </div>
      </div>
    </div>
    <div class="card" style="max-width:520px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:15px;">Editar perfil profesional</h3>
        ${verifBadge}
      </div>
      <div id="verif-panel" class="hidden" style="margin-bottom:16px; padding:14px; border:1.5px dashed var(--line); border-radius:12px;">
        <label style="font-size:11px; font-family:'IBM Plex Mono'; letter-spacing:0.05em; text-transform:uppercase; color:var(--ink-soft); display:block; margin-bottom:8px;">Documento (cédula o certificado)</label>
        <input type="file" id="wp-doc-input" accept="image/*,application/pdf">
        <button type="button" class="btn btn-primary" style="margin-top:10px;" onclick="solicitarVerificacion()">Enviar solicitud</button>
        <div id="wp-verif-msg" role="status" aria-live="polite" style="margin-top:8px;"></div>
      </div>
      <div class="field"><label for="wp-cat">Categoría</label>
        <select id="wp-cat">${CATS.map(c=>`<option ${c.n===u.categoria?'selected':''}>${c.n}</option>`).join('')}</select>
      </div>
      <div class="field"><label for="wp-zona">Zona</label><input id="wp-zona" value="${esc(u.zona)}"></div>
      <div class="field"><label for="wp-exp">Años de experiencia</label><input type="number" id="wp-exp" min="0" value="${u.experiencia}"></div>
      <div class="field"><label for="wp-tarifa">Tarifa desde (COP)</label><input type="number" id="wp-tarifa" min="0" value="${u.tarifa}"></div>
      <div class="field"><label for="wp-servicios">Servicios (separados por coma)</label><input id="wp-servicios" value="${esc(u.servicios.join(', '))}"></div>
      <div class="field"><label>Disponibilidad semanal</label>
        <div id="wp-disponibilidad" class="disp-grid">${disponibilidadGridHTML()}</div>
      </div>
      <button class="btn btn-primary" onclick="guardarPerfilTrabajador()">Guardar cambios</button>
      <div id="wp-msg" role="status" aria-live="polite"></div>
    </div>`;
}
function disponibilidadGridHTML(){
  return DIAS_SEMANA.map(dia=>`
    <div class="disp-row">
      <span class="disp-day">${dia}</span>
      <div class="disp-hours">${HORAS_DISPONIBLES.map(h=>
        `<button type="button" class="chipbtn sm ${state.wpDisponibilidad[dia].includes(h)?'on':''}" onclick="toggleDisponibilidad('${dia}','${h}')">${h}</button>`
      ).join('')}</div>
    </div>`).join('');
}
function toggleDisponibilidad(dia, hora){
  const lista = state.wpDisponibilidad[dia];
  const i = lista.indexOf(hora);
  if(i>-1) lista.splice(i,1); else lista.push(hora);
  document.getElementById('wp-disponibilidad').innerHTML = disponibilidadGridHTML();
}
function mostrarFormularioVerificacion(){
  const panel = document.getElementById('verif-panel');
  if(panel) panel.classList.toggle('hidden');
}
async function subirFotoPerfil(){
  const u = currentUser();
  const input = document.getElementById('wp-foto-input');
  const file = input && input.files[0];
  const msgEl = document.getElementById('wp-foto-msg');
  if(!file) return;
  if(!file.type.startsWith('image/')){
    if(msgEl) msgEl.innerHTML = `<div class="msg err">Elegí un archivo de imagen.</div>`;
    return;
  }
  const ext = file.name.split('.').pop();
  const path = `${u.id}/avatar.${ext}`;
  const { error: upErr } = await sb.storage.from('avatares').upload(path, file, { upsert: true });
  if(upErr){
    if(msgEl) msgEl.innerHTML = `<div class="msg err">No se pudo subir la foto: ${esc(upErr.message)}</div>`;
    return;
  }
  const { data: pub } = sb.storage.from('avatares').getPublicUrl(path);
  await sb.from('profiles').update({ foto_url: pub.publicUrl }).eq('id', u.id);
  invalidarPerfil(u.id);
  renderTrabajo();
}
async function solicitarVerificacion(){
  const u = currentUser();
  const input = document.getElementById('wp-doc-input');
  const msgEl = document.getElementById('wp-verif-msg');
  const file = input && input.files[0];
  if(!file){
    if(msgEl) msgEl.innerHTML = `<div class="msg err">Adjunta un documento antes de enviar la solicitud.</div>`;
    return;
  }
  const ext = file.name.split('.').pop();
  const path = `${u.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from('verificaciones').upload(path, file, { upsert: true });
  if(upErr){
    if(msgEl) msgEl.innerHTML = `<div class="msg err">No se pudo subir el documento: ${esc(upErr.message)}</div>`;
    return;
  }
  await sb.from('profiles').update({ verificacion_pendiente: true, verificacion_doc_path: path }).eq('id', u.id);
  invalidarPerfil(u.id);
  renderTrabajo();
}
async function responderCita(id, estado){
  const { data: citaRaw } = await sb.from('citas').update({ estado }).eq('id', id).select().single();
  const c = normalizarCita(citaRaw);
  if(c){
    const [cliente, w] = await Promise.all([obtenerPerfil(c.clienteId), obtenerPerfil(c.trabajadorId)]);
    if(cliente && w) addNotificacion(cliente.id, `${w.nombre} ${estado==='aceptada'?'aceptó':'rechazó'} tu cita del ${c.fecha}.`);
  }
  mostrarToast(estado==='aceptada' ? 'Cita aceptada.' : 'Cita rechazada.', 'ok');
  renderTrabajo();
}
async function guardarPerfilTrabajador(){
  const u = currentUser();
  const zona = document.getElementById('wp-zona').value.trim();
  if(!zona){
    document.getElementById('wp-msg').innerHTML = `<div class="msg err" style="margin-top:12px;">La zona no puede quedar vacía.</div>`;
    return;
  }
  u.categoria = document.getElementById('wp-cat').value;
  u.zona = zona;
  u.experiencia = Math.max(0, Number(document.getElementById('wp-exp').value)||0);
  u.tarifa = Math.max(0, Number(document.getElementById('wp-tarifa').value)||0);
  u.servicios = document.getElementById('wp-servicios').value.split(',').map(s=>s.trim()).filter(Boolean);
  u.disponibilidad = state.wpDisponibilidad;
  const { error } = await sb.from('profiles').update({
    categoria: u.categoria, zona: u.zona, experiencia: u.experiencia,
    tarifa: u.tarifa, servicios: u.servicios, disponibilidad: u.disponibilidad
  }).eq('id', u.id);
  if(error){
    document.getElementById('wp-msg').innerHTML = `<div class="msg err" style="margin-top:12px;">No se pudo guardar: ${esc(error.message)}</div>`;
    return;
  }
  invalidarPerfil(u.id);
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
async function renderAdmin(){
  const u = currentUser();
  if(!u || u.tipo!=='admin'){ document.getElementById('admin-usuarios').innerHTML = `<div class="empty-note">Solo el administrador puede ver este panel.</div>`; return; }

  const { data: todos, error } = await sb.from('profiles').select('*').neq('tipo','admin');
  const others = error ? [] : todos.map(normalizarPerfil);
  const trabajadores = others.filter(x=>x.tipo==='trabajador');
  const pendientesVerif = trabajadores.filter(x=>x.verificacionPendiente && !x.verificado).length;
  const { data: reportesData } = await sb.from('reportes').select('*').order('created_at', {ascending:false});
  const reportes = (reportesData||[]).map(r=>({ ...r, deNombre: r.de_nombre, citaId: r.cita_id }));
  const reportesAbiertos = reportes.filter(r=>r.estado==='abierto').length;
  const { data: todasCitas } = await sb.from('citas').select('estado');
  const citasPendientes = (todasCitas||[]).filter(c=>c.estado==='pendiente').length;
  document.getElementById('admin-usuarios').innerHTML = `
    <div class="admin-summary">
      <div class="admin-stat"><span>Usuarios</span><b>${others.length}</b><small>${trabajadores.length} trabajadores</small></div>
      <div class="admin-stat"><span>Verificaciones</span><b>${pendientesVerif}</b><small>Pendientes de revisión</small></div>
      <div class="admin-stat"><span>Citas</span><b>${(todasCitas||[]).length}</b><small>${citasPendientes} por responder</small></div>
      <div class="admin-stat"><span>Reportes</span><b>${reportesAbiertos}</b><small>Abiertos</small></div>
    </div>
    <table><thead><tr><th>Nombre</th><th>Tipo</th><th>Correo</th><th>Estado</th><th>Verificación</th><th>Acción</th></tr></thead><tbody>
    ${others.map(x=>{
      let verifCell = '—';
      if(x.tipo==='trabajador'){
        const verDoc = x.verificacionPendiente && x.verificacion_doc_path
          ? `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;margin-right:6px;" onclick="verDocumentoVerificacion('${esc(x.verificacion_doc_path)}')">Ver documento</button>` : '';
        verifCell = x.verificado ? `<span class="verif-badge">✓ Verificado</span>`
          : x.verificacionPendiente ? `${verDoc}<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="verificarTrabajador('${x.id}')">Verificar</button>`
          : `<span class="status-pill status-bloqueado">Sin solicitar</span>`;
      }
      return `<tr><td>${esc(x.nombre)}</td><td>${x.tipo}</td><td>${esc(x.correo)}</td>
      <td><span class="status-pill status-${x.estado}">${x.estado}</span></td>
      <td>${verifCell}</td>
      <td><button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="toggleEstadoUsuario('${x.id}')">${x.estado==='activo'?'Bloquear':'Activar'}</button></td></tr>`;
    }).join('')}
    </tbody></table>`;

  const citasDeReportes = await Promise.all(reportes.map(async r=>{
    const { data } = await sb.from('citas').select('*').eq('id', r.citaId).single();
    return normalizarCita(data);
  }));
  const trabajadoresDeReportes = await obtenerPerfiles(citasDeReportes.filter(Boolean).map(c=>c.trabajadorId));
  const trabajadorPorId = new Map(trabajadoresDeReportes.map(w=>[w && w.id, w]));
  document.getElementById('admin-reportes').innerHTML = reportes.length ? `
    <table><thead><tr><th>De</th><th>Cita</th><th>Motivo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
    ${reportes.map((r,i)=>{
      const cita = citasDeReportes[i];
      const trabajador = cita && trabajadorPorId.get(cita.trabajadorId);
      const citaCell = cita ? `${esc(trabajador?trabajador.nombre:'—')}<br><span class="mono" style="font-size:11px;color:var(--ink-soft);">${esc(cita.fecha)} · ${esc(cita.hora)}</span>` : '—';
      return `<tr><td>${esc(r.deNombre)}</td><td>${citaCell}</td><td>${esc(r.motivo)}</td><td><span class="status-pill status-${r.estado}">${r.estado}</span></td>
      <td>${r.estado==='abierto'?`<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="resolverReporte('${r.id}')">Marcar resuelto</button>`:'—'}</td></tr>`;
    }).join('')}
    </tbody></table>` : `<div class="empty-note">No hay reportes registrados.</div>`;
}
async function toggleEstadoUsuario(id){
  const u = await obtenerPerfil(id);
  if(!u) return;
  const nuevoEstado = u.estado==='activo' ? 'bloqueado' : 'activo';
  await sb.from('profiles').update({ estado: nuevoEstado }).eq('id', id);
  invalidarPerfil(id);
  renderAdmin();
}
async function verDocumentoVerificacion(path){
  // Abrir la ventana antes de esperar la URL firmada, para que el navegador no la bloquee.
  const win = window.open('', '_blank');
  const { data, error } = await sb.storage.from('verificaciones').createSignedUrl(path, 60);
  if(error || !data){ win.close(); mostrarToast('No se pudo abrir el documento.', 'err'); return; }
  win.location.href = data.signedUrl;
}
async function verificarTrabajador(id){
  const u = await obtenerPerfil(id);
  if(!u) return;
  await sb.from('profiles').update({ verificado: true, verificacion_pendiente: false }).eq('id', id);
  invalidarPerfil(id);
  addNotificacion(u.id, 'Tu perfil fue verificado por el administrador. Ya se muestra el distintivo ✓ Verificado.');
  mostrarToast(`${u.nombre.split(' ')[0]} fue verificado.`, 'ok');
  renderAdmin();
}
async function resolverReporte(id){
  await sb.from('reportes').update({ estado: 'resuelto' }).eq('id', id);
  renderAdmin();
}

async function renderEstadisticas(){
  const box = document.getElementById('admin-estadisticas');
  const [trabajadores, { data: todasCitas }] = await Promise.all([
    cargarTrabajadores(),
    sb.from('citas').select('trabajador_id')
  ]);
  const citas = todasCitas || [];
  const trabajadorPorId = new Map(trabajadores.map(w=>[w.id, w]));

  const porCategoria = {};
  citas.forEach(c=>{
    const w = trabajadorPorId.get(c.trabajador_id);
    if(!w) return;
    porCategoria[w.categoria] = (porCategoria[w.categoria]||0) + 1;
  });
  const maxCat = Math.max(1, ...Object.values(porCategoria));

  const porTrabajador = {};
  citas.forEach(c=>{ porTrabajador[c.trabajador_id] = (porTrabajador[c.trabajador_id]||0) + 1; });
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
      ${citas.length ? topTrabajadores.map(t=>`
        <div class="stat-bar-row">
          <span class="stat-bar-label">${esc(t.w.nombre)}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(t.n/maxTop)*100}%; background:var(--orange);"></div></div>
          <span class="stat-bar-n">${t.n}</span>
        </div>`).join('') : `<div class="empty-note">Aún no hay citas registradas.</div>`}
    </div>`;
}

/* ---------------- INIT ---------------- */
(async function initApp(){
  applyTheme(loadTheme());
  const { data: { session } } = await sb.auth.getSession();
  if(session){
    sessionUserId = session.user.id;
    await cargarPerfilActual();
    suscribirNotificaciones(sessionUserId);
  }
  if(location.hash){
    restoreFromHash();
  } else {
    suprimirPush = true;
    nav('home');
    suprimirPush = false;
    history.replaceState(null, '', '#/home');
  }
})();
