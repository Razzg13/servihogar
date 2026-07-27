/* ---------------- DATA LAYER ---------------- */
const DB_KEY = 'servihogar_db';
const SESSION_KEY = 'servihogar_session';

function seedDB(){
  return {
    users: [
      {id:'u1', tipo:'cliente', nombre:'Camila Torres', correo:'camila@correo.com', password:'1234', estado:'activo'},
      {id:'u2', tipo:'trabajador', nombre:'Jorge Ramírez', correo:'jorge@correo.com', password:'1234',
        categoria:'Electricidad', tarifa:35000, experiencia:6, zona:'Norte',
        servicios:['Instalaciones eléctricas','Cortos y fallas','Cableado','Iluminación'],
        resenas:[{cliente:'Diana R.', estrellas:5, comentario:'Llegó puntual y dejó todo funcionando el mismo día.'},
                 {cliente:'Andrés T.', estrellas:5, comentario:'Explica bien el problema antes de cobrar.'}],
        estado:'activo'},
      {id:'u3', tipo:'trabajador', nombre:'Laura Méndez', correo:'laura@correo.com', password:'1234',
        categoria:'Limpieza', tarifa:28000, experiencia:4, zona:'Centro',
        servicios:['Limpieza profunda','Limpieza de oficinas','Planchado'],
        resenas:[{cliente:'Pedro L.', estrellas:5, comentario:'Muy responsable y detallista.'}],
        estado:'activo'},
      {id:'u4', tipo:'trabajador', nombre:'Carlos Duarte', correo:'carlos@correo.com', password:'1234',
        categoria:'Plomería', tarifa:32000, experiencia:8, zona:'Ambalá',
        servicios:['Fugas','Instalación de tubería','Destape de baños'],
        resenas:[{cliente:'Marta G.', estrellas:4, comentario:'Buen trabajo, tardó un poco más de lo esperado.'}],
        estado:'activo'},
      {id:'admin', tipo:'admin', nombre:'Administrador', correo:'admin@servihogar.com', password:'admin', estado:'activo'}
    ],
    citas: [],
    reportes: []
  };
}

function loadDB(){
  const raw = localStorage.getItem(DB_KEY);
  if(!raw){ const d = seedDB(); localStorage.setItem(DB_KEY, JSON.stringify(d)); return d; }
  return JSON.parse(raw);
}
function saveDB(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function loadSession(){ return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
function saveSession(uid){ localStorage.setItem(SESSION_KEY, JSON.stringify(uid)); }

let db = loadDB();
let sessionUserId = loadSession();
let state = { catFiltro:null, workerActual:null, diaSel:null, horaSel:null, calMonthOffset:0 };

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
  if(view==='trabajo') renderTrabajo();
  if(view==='admin') renderAdmin();
}

function renderNav(active){
  const u = currentUser();
  const links = document.getElementById('navlinks');
  const auth = document.getElementById('navauth');
  let linkHtml = `<button class="${active==='home'?'on':''}" onclick="nav('home')">Inicio</button>
                  <button class="${active==='buscar'?'on':''}" onclick="nav('buscar')">Buscar trabajadores</button>`;
  if(u && u.tipo==='cliente') linkHtml += `<button class="${active==='miscitas'?'on':''}" onclick="nav('miscitas')">Mis citas</button>`;
  if(u && u.tipo==='trabajador') linkHtml += `<button class="${active==='trabajo'?'on':''}" onclick="nav('trabajo')">Panel trabajador</button>`;
  if(u && u.tipo==='admin') linkHtml += `<button class="${active==='admin'?'on':''}" onclick="nav('admin')">Panel admin</button>`;
  links.innerHTML = linkHtml;

  if(u){
    auth.innerHTML = `<span class="userchip">Hola, ${u.nombre.split(' ')[0]}</span>
                       <button class="btn btn-ghost" onclick="logout()">Cerrar sesión</button>`;
  } else {
    auth.innerHTML = `<button class="btn btn-ghost" onclick="nav('auth'); switchAuthTab('login')">Ingresar</button>
                       <button class="btn btn-primary" onclick="nav('auth'); switchAuthTab('register')">Crear cuenta</button>`;
  }
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
  return `<div class="worker-card ticket" onclick="verPerfil('${w.id}')">
    <div class="worker-top"><div class="avatar"></div>
      <div><div class="name">${w.nombre}</div><div class="role">${w.categoria} · ${w.zona}</div></div>
    </div>
    <div class="perf"></div>
    <div class="worker-meta">
      <div class="rating-pill">${rating ? '★ '+rating : 'Sin calificar'}</div>
      <div class="tarifa">Desde ${fmtCOP(w.tarifa)}</div>
    </div>
  </div>`;
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

  const box = document.getElementById('buscar-results');
  box.innerHTML = results.length ? results.map(workerCardHTML).join('') : `<div class="empty-note">No encontramos trabajadores con ese criterio. Prueba con otra categoría o término.</div>`;
}
function setCatFiltro(cat){ state.catFiltro = cat || null; renderBuscar(); }

/* ---------------- PERFIL ---------------- */
function verPerfil(workerId){
  state.workerActual = workerId;
  nav('perfil');
  const w = db.users.find(u=>u.id===workerId);
  const rating = avg(w.resenas);
  document.getElementById('perfil-content').innerHTML = `
    <div class="profile-grid">
      <div>
        <div class="card">
          <div class="profile-header">
            <div class="avatar"></div>
            <div><h2>${w.nombre}</h2><div class="role">${w.categoria.toUpperCase()} · ${w.experiencia} AÑOS DE EXPERIENCIA</div></div>
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
        <div class="card">
          <h3 style="font-size:14px; margin-bottom:12px;">Solicitar este servicio</h3>
          <p style="font-size:12.5px; color:var(--ink-soft); margin-bottom:16px;">Elige un día y una hora para que ${w.nombre.split(' ')[0]} confirme tu cita.</p>
          <button class="btn btn-primary" style="width:100%;" onclick="irAAgendar('${w.id}')">Agendar cita</button>
        </div>
      </div>
    </div>`;
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
    estado: 'pendiente', calificacion:null
  };
  db.citas.push(cita); saveDB();
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

  box.innerHTML = `<table><thead><tr><th>Trabajador</th><th>Fecha</th><th>Hora</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
    ${propias.map(c=>{
      const w = db.users.find(x=>x.id===c.trabajadorId);
      let accion = '';
      if(c.estado==='pendiente') accion = `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="cancelarCita('${c.id}')">Cancelar</button>`;
      if(c.estado==='aceptada') accion = `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="marcarCompletada('${c.id}')">Marcar completado</button>`;
      if(c.estado==='completada' && !c.calificacion) accion = `<button class="btn btn-primary" style="font-size:12px;padding:6px 10px;" onclick="abrirCalificar('${c.id}')">Calificar</button>`;
      if(c.calificacion) accion = `<span class="mono" style="font-size:12px;color:var(--ink-soft);">${'★'.repeat(c.calificacion.estrellas)} calificado</span>`;
      return `<tr><td>${w?w.nombre:'—'}</td><td>${c.fecha}</td><td>${c.hora}</td><td><span class="status-pill status-${c.estado}">${c.estado}</span></td><td>${accion}</td></tr>`;
    }).join('')}
  </tbody></table>
  <div id="calificar-panel" style="margin-top:20px;"></div>`;
}
function cancelarCita(id){ db.citas = db.citas.filter(c=>c.id!==id); saveDB(); renderMisCitas(); }
function marcarCompletada(id){ const c = db.citas.find(x=>x.id===id); c.estado='completada'; saveDB(); renderMisCitas(); }
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
    <table><thead><tr><th>Cliente</th><th>Fecha</th><th>Hora</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
    ${propias.map(c=>{
      const cli = db.users.find(x=>x.id===c.clienteId);
      let accion = '—';
      if(c.estado==='pendiente') accion = `<div class="row-actions"><button class="acc" onclick="responderCita('${c.id}','aceptada')">Aceptar</button><button class="rej" onclick="responderCita('${c.id}','rechazada')">Rechazar</button></div>`;
      return `<tr><td>${cli?cli.nombre:'—'}</td><td>${c.fecha}</td><td>${c.hora}</td><td><span class="status-pill status-${c.estado}">${c.estado}</span></td><td>${accion}</td></tr>`;
    }).join('')}
    </tbody></table>` : `<div class="empty-note">Todavía no tienes solicitudes de servicio.</div>`;

  document.getElementById('work-perfil').innerHTML = `
    <div class="card" style="max-width:520px;">
      <h3 style="font-size:15px; margin-bottom:16px;">Editar perfil profesional</h3>
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
function responderCita(id, estado){ const c = db.citas.find(x=>x.id===id); c.estado = estado; saveDB(); renderTrabajo(); }
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
  document.getElementById('admin-usuarios').classList.toggle('hidden', tab!=='usuarios');
  document.getElementById('admin-reportes').classList.toggle('hidden', tab!=='reportes');
}
function renderAdmin(){
  const u = currentUser();
  if(!u || u.tipo!=='admin'){ document.getElementById('admin-usuarios').innerHTML = `<div class="empty-note">Solo el administrador puede ver este panel.</div>`; return; }

  const others = db.users.filter(x=>x.tipo!=='admin');
  document.getElementById('admin-usuarios').innerHTML = `
    <table><thead><tr><th>Nombre</th><th>Tipo</th><th>Correo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
    ${others.map(x=>`<tr><td>${x.nombre}</td><td>${x.tipo}</td><td>${x.correo}</td>
      <td><span class="status-pill status-${x.estado}">${x.estado}</span></td>
      <td><button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="toggleEstadoUsuario('${x.id}')">${x.estado==='activo'?'Bloquear':'Activar'}</button></td></tr>`).join('')}
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
function resolverReporte(id){ const r = db.reportes.find(x=>x.id===id); r.estado='resuelto'; saveDB(); renderAdmin(); }

/* ---------------- INIT ---------------- */
nav('home');
