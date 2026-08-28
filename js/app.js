/* ---------------- SUPABASE ---------------- */
// Nombre "sb" (no "supabase") a propósito: el bundle del CDN ya deja declarado
// "supabase" en el ámbito global, y un const propio con ese mismo nombre choca
// con eso (SyntaxError: Identifier 'supabase' has already been declared).
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------- REALTIME ---------------- */
let chatChannel = null;
let chatPrevioChannel = null;
let notifChannel = null;
function cerrarCanalChat(){
  if(chatChannel){ sb.removeChannel(chatChannel); chatChannel = null; }
}
function cerrarCanalChatPrevio(){
  if(chatPrevioChannel){ sb.removeChannel(chatPrevioChannel); chatPrevioChannel = null; }
}
function suscribirChatPrevio(conversacionId){
  cerrarCanalChatPrevio();
  chatPrevioChannel = sb.channel('mensajes-conv-'+conversacionId)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'mensajes', filter:`conversacion_id=eq.${conversacionId}` }, ()=>{
      if(state.conversacionActual===conversacionId) renderChatPrevio();
    })
    .subscribe();
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
// diaSemanaDeFecha, avg, calcularMonto y horasDisponiblesDia viven en js/logica.js
// (funciones puras, testeadas con node --test) y quedan disponibles acá como globales.

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
  // Envía también un correo real, una notificación push del navegador y (si
  // ya se configuró un proveedor, ver supabase/functions/enviar-whatsapp/README.md)
  // un WhatsApp. Ninguna de las tres bloquea ni rompe el flujo si falla o no
  // está configurada: la notificación en la app ya quedó guardada de todos modos.
  sb.functions.invoke('notificar-email', { body: { record: { user_id: userId, texto } } })
    .catch(()=>{});
  sb.functions.invoke('enviar-push', { body: { record: { user_id: userId, texto } } })
    .catch(()=>{});
  sb.functions.invoke('enviar-whatsapp', { body: { record: { user_id: userId, texto } } })
    .catch(()=>{});
}

// La applicationServerKey del Push API pide un Uint8Array, no el string base64url tal cual.
function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function activarNotificacionesPush(){
  const u = currentUser(); if(!u) return;
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    mostrarToast('Tu navegador no soporta notificaciones push.', 'err'); return;
  }
  if(VAPID_PUBLIC_KEY.startsWith('REEMPLAZAR_')){
    mostrarToast('Notificaciones push no configuradas todavía.', 'err'); return;
  }
  const btn = document.getElementById('push-btn');
  await conCargando(btn, '🔕', async () => {
    try{
      const permiso = await Notification.requestPermission();
      if(permiso !== 'granted'){
        mostrarToast('No diste permiso para notificaciones.', 'err'); return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if(!sub){
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const json = sub.toJSON();
      await sb.from('push_subscriptions').upsert({
        user_id: u.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      }, { onConflict: 'endpoint' });
      mostrarToast('Notificaciones push activadas.', 'ok');
      if(btn) btn.remove();
    }catch(e){
      mostrarToast('No se pudo activar notificaciones push.', 'err');
    }
  });
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

// Reemplazan confirm()/prompt() nativos (rompen el estilo visual de la app,
// no respetan el tema oscuro) por un modal propio con el mismo lenguaje visual
// (.card, .btn-primary/.btn-outline). Ambas devuelven una Promise, igual que
// esperaría el código que las llama con await.
function cerrarModal(){
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('hidden');
  overlay.innerHTML = '';
  document.removeEventListener('keydown', modalEscHandler);
}
let modalEscHandler = null;
function confirmarModal(mensaje, opts={}){
  return new Promise(resolve=>{
    const overlay = document.getElementById('modal-overlay');
    const cerrar = valor => { cerrarModal(); resolve(valor); };
    overlay.innerHTML = `<div class="card modal-box">
      <h3>${esc(opts.titulo || 'Confirmar acción')}</h3>
      <p>${esc(mensaje)}</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="modal-cancelar">Cancelar</button>
        <button type="button" class="btn ${opts.peligro===false?'btn-primary':'btn-danger'}" id="modal-confirmar">${esc(opts.textoConfirmar || 'Confirmar')}</button>
      </div>
    </div>`;
    overlay.classList.remove('hidden');
    document.getElementById('modal-cancelar').onclick = () => cerrar(false);
    document.getElementById('modal-confirmar').onclick = () => cerrar(true);
    overlay.onclick = e => { if(e.target===overlay) cerrar(false); };
    modalEscHandler = e => { if(e.key==='Escape') cerrar(false); };
    document.addEventListener('keydown', modalEscHandler);
    document.getElementById('modal-confirmar').focus();
  });
}
function pedirTextoModal(mensaje, opts={}){
  return new Promise(resolve=>{
    const overlay = document.getElementById('modal-overlay');
    const cerrar = valor => { cerrarModal(); resolve(valor); };
    overlay.innerHTML = `<div class="card modal-box">
      <h3>${esc(opts.titulo || 'Escribe una respuesta')}</h3>
      <p>${esc(mensaje)}</p>
      <div class="field"><textarea id="modal-texto" rows="4" placeholder="${esc(opts.placeholder||'')}"></textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="modal-cancelar">Cancelar</button>
        <button type="button" class="btn btn-primary" id="modal-confirmar">${esc(opts.textoConfirmar || 'Enviar')}</button>
      </div>
    </div>`;
    overlay.classList.remove('hidden');
    const input = document.getElementById('modal-texto');
    document.getElementById('modal-cancelar').onclick = () => cerrar(null);
    document.getElementById('modal-confirmar').onclick = () => cerrar(input.value);
    overlay.onclick = e => { if(e.target===overlay) cerrar(null); };
    modalEscHandler = e => { if(e.key==='Escape') cerrar(null); };
    document.addEventListener('keydown', modalEscHandler);
    input.focus();
  });
}

// Deshabilita el botón y le pone un texto de "cargando" mientras dura la acción
// async (evita doble-envío y da retroalimentación de que el clic sí funcionó);
// lo restaura siempre, incluso si la acción termina en error.
async function conCargando(btn, textoCargando, accion){
  if(!btn) return accion();
  const textoOriginal = btn.textContent;
  btn.disabled = true; btn.textContent = textoCargando;
  try{ return await accion(); }
  finally{ btn.disabled = false; btn.textContent = textoOriginal; }
}

let sessionUserId = null; // id (uuid) del usuario autenticado en Supabase Auth
let currentProfile = null; // fila de la tabla profiles correspondiente a sessionUserId
let state = { catFiltro:null, servicioFiltro:null, workerActual:null, diaSel:null, horaSel:null, calMonthOffset:0, vistaBuscar:'lista', resultadosBuscar:[], mobileNavOpen:false, miUbicacion:null, radioFiltro:null, citaReagendar:null, filtroDisponibleAhora:false, estrellasSelCliente:5, conversacionActual:null, chatCitaId:null, compararIds:[] };

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
// Sugerencias de especialidad por categoría: no son un catálogo cerrado (el
// trabajador puede escribir cualquier texto en "servicios"), solo agilizan la
// carga inicial del perfil con etiquetas típicas de cada oficio.
const SERVICIOS_SUGERIDOS = {
  'Plomería': ['Fugas de agua', 'Destape de tuberías', 'Instalación de grifería', 'Calentadores'],
  'Electricidad': ['Instalaciones residenciales', 'Instalaciones industriales', 'Cortocircuitos', 'Iluminación'],
  'Limpieza': ['Limpieza profunda', 'Limpieza post-obra', 'Limpieza de oficinas', 'Tapetes y muebles'],
  'Jardinería': ['Poda de árboles', 'Diseño de jardines', 'Mantenimiento de césped', 'Riego automático'],
  'Pintura': ['Interiores', 'Exteriores', 'Estuco', 'Impermeabilización'],
  'Cerrajería': ['Apertura de puertas', 'Cambio de cerraduras', 'Cajas fuertes', 'Duplicado de llaves'],
};
function iconSVG(cat){
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${ICONS[cat]||''}</svg>`;
}
// Reemplazan los emoji 🟢/📍 usados como ícono funcional (no decorativo): esos
// se renderizan como emoji nativo del sistema operativo (glossy, multicolor) y
// desentonan con el resto de los íconos propios de la app (trazo fino, un
// solo color vía currentColor). Mismo lenguaje visual que iconSVG/ICONS de arriba.
const ICONO_DISPONIBLE = '<svg width="9" height="9" viewBox="0 0 9 9" style="vertical-align:1px;margin-right:4px;flex-shrink:0;" aria-hidden="true"><circle cx="4.5" cy="4.5" r="4.5" fill="currentColor"/></svg>';
const ICONO_UBICACION = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px;flex-shrink:0;" aria-hidden="true"><path d="M12 21s-7-7.3-7-12a7 7 0 0 1 14 0c0 4.7-7 12-7 12z"/><circle cx="12" cy="9" r="2.3"/></svg>';

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
// Usa la ubicación real del trabajador (lat/lng) si la definió; si no,
// cae al punto aproximado por nombre de zona.
function coordsForWorker(w){
  if(w.lat!=null && w.lng!=null) return [w.lat, w.lng];
  return coordsForZona(w.zona);
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
      if(btn){ btn.disabled = false; btn.innerHTML = `${ICONO_UBICACION}Ubicación activada`; }
      const orden = document.getElementById('buscar-orden');
      if(orden && !orden.querySelector('option[value="distancia"]')){
        const opt = document.createElement('option');
        opt.value = 'distancia'; opt.textContent = 'Ordenar: más cerca';
        orden.appendChild(opt);
      }
      if(orden) orden.value = 'distancia';
      const radio = document.getElementById('buscar-radio');
      if(radio) radio.classList.remove('hidden');
      msg.innerHTML = `<div class="msg ok">✓ Mostrando distancias desde tu ubicación.</div>`;
      renderBuscar();
    },
    ()=>{
      if(btn){ btn.disabled = false; btn.innerHTML = `${ICONO_UBICACION}Cerca de mí`; }
      msg.innerHTML = `<div class="msg err">No pudimos acceder a tu ubicación. Revisa los permisos del navegador.</div>`;
    }
  );
}
async function usarMiUbicacionComoTrabajador(){
  const u = currentUser();
  const msgEl = document.getElementById('wp-ubicacion-msg');
  if(!navigator.geolocation){
    if(msgEl) msgEl.innerHTML = `<div class="msg err">Tu navegador no soporta ubicación.</div>`;
    return;
  }
  const btn = document.getElementById('btn-wp-ubicacion');
  if(btn){ btn.disabled = true; btn.textContent = 'Ubicando...'; }
  navigator.geolocation.getCurrentPosition(
    async pos=>{
      // Desplazamiento aleatorio de ~100-150 m: precisa para "cerca de mí",
      // pero nunca la dirección exacta de la casa del trabajador.
      const jitter = () => (Math.random()-0.5) * 0.0025;
      const lat = pos.coords.latitude + jitter();
      const lng = pos.coords.longitude + jitter();
      const { error } = await sb.from('profiles').update({ lat, lng }).eq('id', u.id);
      if(btn){ btn.disabled = false; }
      if(error){
        if(msgEl) msgEl.innerHTML = `<div class="msg err">No se pudo guardar la ubicación: ${esc(error.message)}</div>`;
        return;
      }
      invalidarPerfil(u.id);
      if(msgEl) msgEl.innerHTML = `<div class="msg ok">✓ Ubicación guardada. Ya aparecés más preciso en "cerca de mí".</div>`;
      renderTrabajo();
    },
    ()=>{
      if(btn){ btn.disabled = false; btn.innerHTML = `${ICONO_UBICACION}Usar mi ubicación actual`; }
      if(msgEl) msgEl.innerHTML = `<div class="msg err">No pudimos acceder a tu ubicación. Revisa los permisos del navegador.</div>`;
    }
  );
}
async function toggleDisponibleAhora(){
  const u = currentUser();
  const nuevoValor = !u.disponible_ahora;
  const { error } = await sb.from('profiles').update({ disponible_ahora: nuevoValor }).eq('id', u.id);
  if(error){ mostrarToast('No se pudo actualizar tu disponibilidad.', 'err'); return; }
  u.disponible_ahora = nuevoValor;
  invalidarPerfil(u.id);
  mostrarToast(nuevoValor ? 'Ahora aparecés como disponible ahora.' : 'Ya no aparecés como disponible ahora.', 'ok');
  renderTrabajo();
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
    galeria_fotos: p.galeria_fotos || [],
    disponibilidad: p.disponibilidad || (p.tipo==='trabajador' ? disponibilidadPorDefecto() : undefined)
  };
}
async function cargarPerfilActual(){
  if(!sessionUserId){ currentProfile = null; return; }
  const { data, error } = await sb.from('profiles').select('*').eq('id', sessionUserId).single();
  currentProfile = error ? null : normalizarPerfil(data);
}

/* ---------------- PERFILES (Supabase) ---------------- */
// La tabla `profiles` solo deja leer la fila propia o (si sos admin) todas.
// Para ver a cualquier otra persona se usa la vista `profiles_publicos`, que
// expone solo campos no sensibles (sin correo, celular ni datos de
// verificación). Esta función elige la fuente según quién consulta.
function fuentePerfil(id){
  const yo = currentProfile;
  const puedeVerLaTabla = yo && (yo.tipo === 'admin' || (id && id === sessionUserId));
  return puedeVerLaTabla ? 'profiles' : 'profiles_publicos';
}
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
  const fuente = currentProfile && currentProfile.tipo === 'admin' ? 'profiles' : 'profiles_publicos';
  const { data, error } = await sb.from(fuente).select('*, resenas(*)').eq('tipo','trabajador');
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
  const { data, error } = await sb.from(fuentePerfil(id)).select('*, resenas(*)').eq('id', id).single();
  if(error) return null;
  const [perfil] = cachearPerfiles([data]);
  return perfil;
}
async function obtenerPerfiles(ids){
  const unicos = [...new Set(ids.filter(Boolean))];
  return Promise.all(unicos.map(id=>obtenerPerfil(id)));
}
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
const VISTAS_VALIDAS = ['home','auth','buscar','perfil','agendar','miscitas','favoritos','trabajo','admin','resetpass','privacidad','terminos','pqr'];
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
  cerrarCanalChatPrevio();
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
  if(view==='pqr') renderPQR();
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

  const pushSoportado = 'serviceWorker' in navigator && 'PushManager' in window;
  const pushBtn = (u && pushSoportado && typeof Notification !== 'undefined' && Notification.permission !== 'granted')
    ? `<button class="icon-btn" id="push-btn" aria-label="Activar notificaciones push" title="Activar notificaciones push" onclick="activarNotificacionesPush()">🔕</button>`
    : '';

  if(u){
    auth.innerHTML = `${pushBtn}${notifBtn}
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
  const workersBox = document.getElementById('home-workers');
  if(workersBox) workersBox.innerHTML = `<div class="empty-note">Cargando trabajadores destacados...</div>`;
  try {
    const [trabajadores, { count: totalCitas }] = await Promise.all([
      cargarTrabajadores(),
      sb.from('citas').select('id', { count: 'exact', head: true })
    ]);
    document.getElementById('stat-workers').textContent = trabajadores.length;
    document.getElementById('stat-jobs').textContent = totalCitas || 0;
    const todasResenas = trabajadores.flatMap(w=>w.resenas||[]);
    const ratingProm = todasResenas.length
      ? (todasResenas.reduce((a,r)=>a+r.estrellas,0)/todasResenas.length).toFixed(1)
      : '—';
    document.getElementById('stat-rating').textContent = ratingProm;
    document.getElementById('hf-rating-val').textContent = ratingProm;

    document.getElementById('home-cats').innerHTML = CATS.map(c=>
      `<div class="cat-card" onclick="irABuscarConCategoria('${c.n}')">${iconSVG(c.n)}<span>${c.n}</span></div>`
    ).join('');

    const destacados = trabajadores.filter(u=>u.estado==='activo')
      .sort((a,b)=>(avg(b.resenas)||0)-(avg(a.resenas)||0)).slice(0,3);
    document.getElementById('home-workers').innerHTML = destacados.map(workerCardHTML).join('');
  } catch(e){
    if(workersBox) workersBox.innerHTML = `<div class="empty-note">No se pudo cargar. <button type="button" class="link-btn" onclick="renderHome()">Reintentar</button></div>`;
  }
}

function workerCardHTML(w, opts={}){
  const rating = avg(w.resenas);
  const u = currentUser();
  const esFav = u && u.tipo==='cliente' && (u.favoritos||[]).includes(w.id);
  const distancia = state.miUbicacion ? distanciaKm(state.miUbicacion, coordsForWorker(w)) : null;
  const insignias = insigniasTrabajador(w.resenas).map(i=>`<span class="insignia-badge" title="${esc(i.texto)}">${i.icono} ${esc(i.texto)}</span>`).join('');
  const compararCheckbox = opts.comparador ? `<label class="compare-check" onclick="event.stopPropagation();">
    <input type="checkbox" ${state.compararIds.includes(w.id)?'checked':''} onchange="toggleComparar('${w.id}', this.checked)"> Comparar</label>` : '';
  return `<div class="worker-card ticket" onclick="verPerfil('${w.id}')">
    <div class="worker-top">
      ${avatarHTML(w.nombre, w.foto_url)}
      <div style="flex:1;"><div class="name">${esc(w.nombre)} ${w.verificado?'<span class=\"verif-badge\" title=\"Verificado\">✓</span>':''}${insignias}</div><div class="role">${esc(w.categoria)} · ${esc(w.zona)}</div></div>
      ${u && u.tipo==='cliente' ? `<button class="fav-btn ${esFav?'on':''}" aria-label="Guardar en favoritos" onclick="event.stopPropagation(); toggleFavorito('${w.id}')">${esFav?'♥':'♡'}</button>` : ''}
    </div>
    <div class="perf"></div>
    <div class="worker-meta">
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <div class="rating-pill">${rating ? '★ '+rating : 'Sin calificar'}</div>
        ${w.disponible_ahora ? `<div class="rating-pill disp-ahora">${ICONO_DISPONIBLE}Disponible ahora</div>` : ''}
        ${distancia!==null ? `<div class="rating-pill dist">${ICONO_UBICACION}${distancia<1 ? Math.round(distancia*1000)+' m' : distancia.toFixed(1)+' km'}</div>` : ''}
      </div>
      <div class="tarifa">Desde ${fmtCOP(w.tarifa)}</div>
    </div>
    ${compararCheckbox}
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
  box.innerHTML = `<div class="empty-note">Cargando...</div>`;
  const favs = await obtenerPerfiles(u.favoritos||[]);
  box.innerHTML = favs.length ? `<div class="worker-grid">${favs.map(workerCardHTML).join('')}</div>`
    : `<div class="empty-note">Todavía no has guardado trabajadores. Toca el corazón ♡ en cualquier tarjeta para guardarlo aquí.</div>`;
}

/* ---------------- PQR (peticiones, quejas y reclamos) ---------------- */
async function renderPQR(){
  const u = currentUser();
  const box = document.getElementById('pqr-content');
  if(!u){ box.innerHTML = `<div class="empty-note">Inicia sesión para enviar una petición, queja o reclamo.</div>`; return; }
  box.innerHTML = `<div class="empty-note">Cargando...</div>`;
  const { data } = await sb.from('pqr').select('*').eq('user_id', u.id).order('created_at', {ascending:false});
  const propias = data || [];
  box.innerHTML = `
    <div class="card" style="max-width:520px; margin-bottom:24px;">
      <h3 style="font-size:15px; margin-bottom:14px;">Enviar una nueva solicitud</h3>
      <div class="field"><label for="pqr-tipo">Tipo</label>
        <select id="pqr-tipo">
          <option value="peticion">Petición (pedir información o ejercer un derecho, ej. tus datos)</option>
          <option value="queja">Queja (algo no funcionó como esperabas)</option>
          <option value="reclamo">Reclamo (pedís una solución concreta)</option>
        </select>
      </div>
      <div class="field"><label for="pqr-asunto">Asunto</label><input id="pqr-asunto" maxlength="120"></div>
      <div class="field"><label for="pqr-mensaje">Mensaje</label>
        <textarea id="pqr-mensaje" rows="4" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:8px;font-family:inherit;font-size:13px;"></textarea>
      </div>
      <button class="btn btn-primary" id="btn-enviar-pqr" onclick="enviarPQR()">Enviar</button>
      <div id="pqr-msg" role="status" aria-live="polite" style="margin-top:8px;"></div>
    </div>
    <h3 style="font-size:15px; margin-bottom:12px;">Tus solicitudes anteriores</h3>
    ${propias.length ? propias.map(p=>`
      <div class="card" style="max-width:520px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <b style="font-size:13px;">${esc(p.asunto)}</b>
          <span class="status-pill status-${p.estado==='respondido'?'activo':'pendiente'}">${p.estado}</span>
        </div>
        <p style="font-size:11.5px; color:var(--ink-soft); margin-bottom:8px;">${p.tipo} · ${new Date(p.created_at).toLocaleDateString()}</p>
        <p style="font-size:13px; margin-bottom:8px;">${esc(p.mensaje)}</p>
        ${p.respuesta ? `<div class="resena-respuesta"><b>Respuesta:</b> ${esc(p.respuesta)}</div>` : ''}
      </div>`).join('') : `<div class="empty-note">Todavía no enviaste ninguna.</div>`}
  `;
}
async function enviarPQR(){
  const u = currentUser();
  const tipo = document.getElementById('pqr-tipo').value;
  const asunto = document.getElementById('pqr-asunto').value.trim();
  const mensaje = document.getElementById('pqr-mensaje').value.trim();
  const msgEl = document.getElementById('pqr-msg');
  if(!asunto || !mensaje){
    msgEl.innerHTML = `<div class="msg err">Completá el asunto y el mensaje.</div>`;
    return;
  }
  const btn = document.getElementById('btn-enviar-pqr');
  await conCargando(btn, 'Enviando...', async () => {
    const { error } = await sb.from('pqr').insert({ user_id: u.id, tipo, asunto, mensaje });
    if(error){
      msgEl.innerHTML = `<div class="msg err">No se pudo enviar: ${esc(error.message)}</div>`;
      return;
    }
    mostrarToast('Enviado. Te avisamos por notificación cuando te respondamos.', 'ok');
    renderPQR();
  });
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
  document.getElementById('form-forgot').classList.add('hidden');
  document.getElementById('auth-msg').innerHTML='';
}
function mostrarRecuperar(){
  document.getElementById('tab-login').classList.remove('on');
  document.getElementById('tab-register').classList.remove('on');
  document.getElementById('form-login').classList.add('hidden');
  document.getElementById('form-register').classList.add('hidden');
  document.getElementById('form-forgot').classList.remove('hidden');
  document.getElementById('auth-msg').innerHTML='';
}
async function enviarRecuperacion(e){
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim().toLowerCase();
  const msg = document.getElementById('auth-msg');
  const btn = e.target.querySelector('button[type="submit"]');
  await conCargando(btn, 'Enviando...', async () => {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if(error){
      msg.innerHTML = `<div class="msg err">No se pudo enviar el correo. Intenta de nuevo.</div>`;
      return;
    }
    msg.innerHTML = `<div class="msg ok">✓ Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.</div>`;
    document.getElementById('form-forgot').reset();
  });
  return false;
}
async function guardarNuevaContrasena(e){
  e.preventDefault();
  const p1 = document.getElementById('resetpass-pass').value;
  const p2 = document.getElementById('resetpass-pass2').value;
  const msg = document.getElementById('resetpass-msg');
  if(p1 !== p2){
    msg.innerHTML = `<div class="msg err">Las contraseñas no coinciden.</div>`;
    return false;
  }
  const btn = e.target.querySelector('button[type="submit"]');
  await conCargando(btn, 'Guardando...', async () => {
    const { error } = await sb.auth.updateUser({ password: p1 });
    if(error){
      msg.innerHTML = `<div class="msg err">No se pudo actualizar la contraseña. El enlace puede haber expirado — solicita uno nuevo desde "Iniciar sesión".</div>`;
      return;
    }
    await cargarPerfilActual();
    mostrarToast('Contraseña actualizada correctamente.', 'ok');
    nav(currentProfile ? (currentProfile.tipo==='trabajador' ? 'trabajo' : currentProfile.tipo==='admin' ? 'admin' : 'home') : 'home');
  });
  return false;
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
  const btn = e.target.querySelector('button[type="submit"]');
  await conCargando(btn, 'Ingresando...', async () => {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if(error){ msg.innerHTML = `<div class="msg err">Correo o contraseña incorrectos.</div>`; return; }
    sessionUserId = data.user.id;
    perfilesCache.clear(); trabajadoresListaCache = null;
    await cargarPerfilActual();
    if(currentProfile && currentProfile.estado==='bloqueado'){
      msg.innerHTML = `<div class="msg err">Esta cuenta está bloqueada. Contacta al administrador.</div>`;
      await sb.auth.signOut(); sessionUserId = null; currentProfile = null;
      return;
    }
    msg.innerHTML='';
    nav(currentProfile.tipo==='trabajador' ? 'trabajo' : currentProfile.tipo==='admin' ? 'admin' : 'home');
    suscribirNotificaciones(currentProfile.id);
    const { data: pendientes } = await sb.from('notificaciones').select('*').eq('user_id', currentProfile.id).eq('leida', false);
    if(pendientes && pendientes.length===1) mostrarToast(pendientes[0].texto, 'info');
    else if(pendientes && pendientes.length>1) mostrarToast(`Tienes ${pendientes.length} notificaciones nuevas.`, 'info');
  });
  return false;
}
async function doRegister(e){
  e.preventDefault();
  const tipo = document.getElementById('reg-tipo').value;
  const nombre = document.getElementById('reg-nombre').value.trim();
  const correo = document.getElementById('reg-email').value.trim().toLowerCase();
  const celular = document.getElementById('reg-celular').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  const msg = document.getElementById('auth-msg');
  if(pass !== pass2){
    msg.innerHTML = `<div class="msg err">Las contraseñas no coinciden.</div>`; return false;
  }
  const btn = e.target.querySelector('button[type="submit"]');
  await conCargando(btn, 'Creando cuenta...', async () => {
    const { data, error } = await sb.auth.signUp({ email: correo, password: pass });
    if(error){
      msg.innerHTML = `<div class="msg err">${error.message.includes('registered') ? 'Ya existe una cuenta con ese correo.' : 'No se pudo crear la cuenta. Intenta de nuevo.'}</div>`;
      return;
    }
    if(!data.session){
      // El proyecto de Supabase tiene "Confirm email" activado: signUp no deja
      // sesión activa todavía, así que no podemos crear el perfil (RLS lo exige).
      msg.innerHTML = `<div class="msg ok">✓ Cuenta creada. Revisa tu correo para confirmarla; después vas a poder iniciar sesión.</div>`;
      return;
    }
    const nuevoPerfil = { id: data.user.id, tipo, nombre, correo, celular: celular || null, estado:'activo' };
    if(tipo==='trabajador'){
      nuevoPerfil.categoria = document.getElementById('reg-cat').value;
      nuevoPerfil.tarifa = Math.max(0, Number(document.getElementById('reg-tarifa').value)||25000);
      nuevoPerfil.experiencia = 0; nuevoPerfil.zona = 'Sin definir';
      nuevoPerfil.servicios = []; nuevoPerfil.disponibilidad = disponibilidadPorDefecto();
    }
    const { error: perfilError } = await sb.from('profiles').insert(nuevoPerfil);
    if(perfilError){
      msg.innerHTML = `<div class="msg err">Cuenta creada, pero hubo un problema guardando el perfil: ${esc(perfilError.message)}</div>`;
      return;
    }
    sessionUserId = data.user.id;
    await cargarPerfilActual();
    nav(tipo==='trabajador' ? 'trabajo' : 'home');
    suscribirNotificaciones(sessionUserId);
  });
  return false;
}
async function logout(){
  await sb.auth.signOut();
  sessionUserId = null; currentProfile = null;
  perfilesCache.clear(); trabajadoresListaCache = null;
  cerrarCanalChat(); cerrarCanalNotif();
  nav('home');
}

/* ---------------- BUSCAR ---------------- */
function toggleFiltroDisponibleAhora(){
  state.filtroDisponibleAhora = !state.filtroDisponibleAhora;
  renderBuscar();
}
async function renderBuscar(){
  document.getElementById('buscar-chips').innerHTML = ['Todas', ...CATS.map(c=>c.n)].map(c=>{
    const active = (c==='Todas' && !state.catFiltro) || c===state.catFiltro;
    return `<button class="chipbtn ${active?'on':''}" onclick="setCatFiltro('${c==='Todas'?'':c}')">${c}</button>`;
  }).join('');
  const btnDisp = document.getElementById('btn-disponible-ahora');
  if(btnDisp) btnDisp.classList.toggle('btn-primary', !!state.filtroDisponibleAhora);
  if(btnDisp) btnDisp.classList.toggle('btn-outline', !state.filtroDisponibleAhora);

  const q = (document.getElementById('buscar-text').value||'').toLowerCase();
  if(!trabajadoresListaCache){
    const resultsBox = document.getElementById('buscar-results');
    if(resultsBox) resultsBox.innerHTML = `<div class="empty-note">Cargando...</div>`;
  }
  const trabajadores = await cargarTrabajadores();
  let results = trabajadores.filter(w=>w.estado==='activo');
  if(state.catFiltro) results = results.filter(w=>w.categoria===state.catFiltro);

  // Chips de especialidad: solo tiene sentido ofrecerlas dentro de una categoría
  // elegida, y se calculan sobre esos resultados antes de aplicar el propio
  // filtro de especialidad (si no, el chip elegido desaparecería de la lista).
  const servBox = document.getElementById('buscar-servicios-chips');
  if(servBox){
    if(state.catFiltro){
      const conteo = new Map();
      results.forEach(w=>(w.servicios||[]).forEach(s=>{
        const key = s.trim(); if(!key) return;
        conteo.set(key, (conteo.get(key)||0) + 1);
      }));
      const top = [...conteo.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([s])=>s);
      servBox.innerHTML = top.length ? top.map(s=>
        `<button class="chipbtn sm ${state.servicioFiltro===s?'on':''}" onclick="setServicioFiltro('${esc(s).replace(/'/g,"\\'")}')">${esc(s)}</button>`
      ).join('') : '';
    } else {
      servBox.innerHTML = '';
    }
  }
  if(state.servicioFiltro) results = results.filter(w=>(w.servicios||[]).some(s=>s.trim()===state.servicioFiltro));

  if(q) results = results.filter(w=>w.nombre.toLowerCase().includes(q) || w.categoria.toLowerCase().includes(q)
    || w.zona.toLowerCase().includes(q) || (w.servicios||[]).some(s=>s.toLowerCase().includes(q)));
  if(state.miUbicacion && state.radioFiltro){
    results = results.filter(w=>distanciaKm(state.miUbicacion, coordsForWorker(w)) <= state.radioFiltro);
  }
  if(state.miUbicacion){
    // Si el trabajador definió un radio máximo de desplazamiento, no lo mostramos
    // a clientes fuera de ese radio (independiente de lo que el cliente haya elegido).
    results = results.filter(w=>!(w.radio_cobertura_km && distanciaKm(state.miUbicacion, coordsForWorker(w)) > w.radio_cobertura_km));
  }
  if(state.filtroDisponibleAhora) results = results.filter(w=>w.disponible_ahora);

  const orden = document.getElementById('buscar-orden') ? document.getElementById('buscar-orden').value : 'relevancia';
  if(orden==='precio-asc') results = results.slice().sort((a,b)=>a.tarifa-b.tarifa);
  if(orden==='precio-desc') results = results.slice().sort((a,b)=>b.tarifa-a.tarifa);
  if(orden==='calificacion') results = results.slice().sort((a,b)=>(avg(b.resenas)||0)-(avg(a.resenas)||0));
  if(orden==='distancia' && state.miUbicacion){
    results = results.slice().sort((a,b)=>
      distanciaKm(state.miUbicacion, coordsForWorker(a)) - distanciaKm(state.miUbicacion, coordsForWorker(b))
    );
  }

  const box = document.getElementById('buscar-results');
  box.innerHTML = results.length ? results.map(w=>workerCardHTML(w,{comparador:true})).join('') : `<div class="empty-note">No encontramos trabajadores con ese criterio. Prueba con otra categoría o término.</div>`;
  renderComparadorBar();
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
function setCatFiltro(cat){ state.catFiltro = cat || null; state.servicioFiltro = null; renderBuscar(); }
function setServicioFiltro(s){ state.servicioFiltro = state.servicioFiltro===s ? null : s; renderBuscar(); }
function setRadioFiltro(v){ state.radioFiltro = v ? Number(v) : null; renderBuscar(); }
function toggleComparar(workerId, marcado){
  if(marcado){
    if(state.compararIds.length>=3){ mostrarToast('Podés comparar hasta 3 trabajadores a la vez.', 'err'); renderBuscar(); return; }
    state.compararIds.push(workerId);
  } else {
    state.compararIds = state.compararIds.filter(id=>id!==workerId);
  }
  renderComparadorBar();
}
function renderComparadorBar(){
  const bar = document.getElementById('comparador-bar');
  if(!bar) return;
  bar.classList.toggle('hidden', state.compararIds.length===0);
  const count = document.getElementById('comparador-count');
  if(count) count.textContent = state.compararIds.length;
}
function limpiarComparador(){
  state.compararIds = [];
  document.getElementById('comparador-panel').classList.add('hidden');
  renderComparadorBar();
  renderBuscar();
}
async function verComparador(){
  const trabajadores = await obtenerPerfiles(state.compararIds);
  const panel = document.getElementById('comparador-panel');
  if(!panel || !trabajadores.length) return;
  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="card" style="overflow-x:auto;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h3 style="font-size:15px;">Comparar trabajadores</h3>
      <button type="button" class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="limpiarComparador()">Cerrar</button>
    </div>
    <table><thead><tr><th></th>${trabajadores.map(w=>`<th>${esc(w.nombre)}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Categoría</td>${trabajadores.map(w=>`<td>${esc(w.categoria)}</td>`).join('')}</tr>
      <tr><td>Zona</td>${trabajadores.map(w=>`<td>${esc(w.zona)}</td>`).join('')}</tr>
      <tr><td>Calificación</td>${trabajadores.map(w=>`<td>${avg(w.resenas)||'Sin calificar'}</td>`).join('')}</tr>
      <tr><td>Tarifa desde</td>${trabajadores.map(w=>`<td>${fmtCOP(w.tarifa)}</td>`).join('')}</tr>
      <tr><td>Experiencia</td>${trabajadores.map(w=>`<td>${w.experiencia} años</td>`).join('')}</tr>
      <tr><td>Verificado</td>${trabajadores.map(w=>`<td>${w.verificado?'✓ Sí':'No'}</td>`).join('')}</tr>
      <tr><td>Servicios</td>${trabajadores.map(w=>`<td>${(w.servicios||[]).map(s=>esc(s)).join(', ')||'—'}</td>`).join('')}</tr>
      <tr><td></td>${trabajadores.map(w=>`<td><button class="btn btn-primary" style="font-size:12px;padding:6px 10px;" onclick="verPerfil('${w.id}')">Ver perfil</button></td>`).join('')}</tr>
    </tbody></table>
  </div>`;
}
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

  // Círculos de "oferta por zona" (uno por zona distinta, tamaño según cuántos
  // trabajadores hay ahí): de un vistazo, dónde hay más opciones y dónde hay
  // poca oferta, antes de fijarse en los pines individuales de abajo.
  const conteoPorZona = new Map();
  results.forEach(w=>{
    const zona = (w.zona||'Sin definir').trim();
    conteoPorZona.set(zona, (conteoPorZona.get(zona)||0) + 1);
  });
  const maxConteo = Math.max(1, ...conteoPorZona.values());
  conteoPorZona.forEach((n, zona)=>{
    L.circle(coordsForZona(zona), {
      radius: 250 + (n / maxConteo) * 550,
      color: '#1C2B39', weight: 1, fillColor: '#1C2B39', fillOpacity: 0.08
    }).addTo(mapBuscar).bindPopup(`<b>${esc(zona)}</b><br>${n} trabajador${n===1?'':'es'}`);
  });

  results.forEach(w=>{
    const coords = coordsForWorker(w);
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
  const insignias = insigniasTrabajador(w.resenas).map(i=>`<span class="insignia-badge" title="${esc(i.texto)}">${i.icono} ${esc(i.texto)}</span>`).join(' ');
  const trabajadores = await cargarTrabajadores();
  const similares = trabajadores.filter(x=>x.id!==w.id && x.categoria===w.categoria && x.estado==='activo')
    .sort((a,b)=>(avg(b.resenas)||0)-(avg(a.resenas)||0)).slice(0,3);
  document.getElementById('perfil-content').innerHTML = `
    <div class="profile-grid">
      <div>
        <div class="card">
          <div class="profile-header">
            ${avatarHTML(w.nombre, w.foto_url)}
            <div style="flex:1;"><h2>${esc(w.nombre)} ${w.verificado?'<span class="verif-badge" title="Verificado">✓ Verificado</span>':''} ${w.disponible_ahora?`<span class="rating-pill disp-ahora" style="vertical-align:middle;">${ICONO_DISPONIBLE}Disponible ahora</span>`:''} ${insignias}</h2><div class="role">${esc(w.categoria.toUpperCase())} · ${w.experiencia} AÑOS DE EXPERIENCIA</div></div>
            ${u && u.tipo==='cliente' ? `<button class="fav-btn ${esFav?'on':''}" aria-label="Guardar en favoritos" onclick="toggleFavorito('${w.id}')">${esFav?'♥':'♡'}</button>` : ''}
            <button class="icon-btn" style="color:var(--navy); border-color:var(--line);" aria-label="Compartir perfil" onclick="compartirPerfil('${w.id}')">🔗</button>
          </div>
          <div class="spec-sheet">
            <div class="spec-item"><div class="k">Calificación</div><div class="v">${rating || '—'}</div></div>
            <div class="spec-item"><div class="k">Trabajos hechos</div><div class="v">${w.resenas.length}</div></div>
            <div class="spec-item"><div class="k">Zona</div><div class="v">${esc(w.zona)}</div></div>
            <div class="spec-item"><div class="k">Tarifa desde</div><div class="v">${fmtCOP(w.tarifa)}</div></div>
          </div>
          <h3 style="font-size:14px; margin-bottom:8px;">Servicios que ofrece</h3>
          <div class="chip-row">${w.servicios.length ? w.servicios.map(s=>`<span class="chip">${esc(s)}</span>`).join('') : '<span class="chip">Aún no ha agregado servicios</span>'}</div>
          ${w.galeria_fotos && w.galeria_fotos.length ? `
          <h3 style="font-size:14px; margin-bottom:8px;">Trabajos anteriores</h3>
          <div class="galeria-grid">${w.galeria_fotos.map(url=>`<div class="galeria-item"><img src="${esc(url)}" alt="Trabajo de ${esc(w.nombre)}"></div>`).join('')}</div>` : ''}
          <h3 style="font-size:14px; margin-bottom:4px;">Comentarios</h3>
          ${w.resenas.length ? w.resenas.map(r=>`<div class="review">
            <div class="stars">${'★'.repeat(r.estrellas)}${'☆'.repeat(5-r.estrellas)}</div>
            <p>${esc(r.comentario)}</p>
            ${r.fotos && r.fotos.length ? `<div class="galeria-grid" style="max-width:280px;">${r.fotos.map(url=>`<div class="galeria-item"><img src="${esc(url)}" alt=""></div>`).join('')}</div>` : ''}
            <div class="who">— ${esc(r.cliente)}</div>
            ${r.respuesta_trabajador ? `<div class="resena-respuesta"><b>Respuesta de ${esc(w.nombre.split(' ')[0])}:</b> ${esc(r.respuesta_trabajador)}</div>` : ''}
            ${u && u.tipo==='admin' ? `<button type="button" class="btn btn-outline" style="font-size:11px;padding:4px 8px;margin-top:8px;" onclick="eliminarResena(${r.id}, '${w.id}', this)">🗑 Eliminar reseña</button>` : ''}
          </div>`).join('') : '<p style="font-size:13px;color:var(--ink-soft);">Todavía no tiene comentarios.</p>'}
        </div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px;">
          <h3 style="font-size:14px; margin-bottom:12px;">Solicitar este servicio</h3>
          <p style="font-size:12.5px; color:var(--ink-soft); margin-bottom:16px;">Elige un día y una hora para que ${esc(w.nombre.split(' ')[0])} confirme tu cita.</p>
          <button class="btn btn-primary" style="width:100%;" onclick="irAAgendar('${w.id}')">Agendar cita</button>
          ${u && u.tipo==='cliente' ? `<button class="btn btn-outline" style="width:100%;margin-top:8px;" onclick="contactarTrabajador('${w.id}', this)">💬 Preguntar antes de agendar</button>` : ''}
          <div id="perfil-chat-panel" style="margin-top:12px;"></div>
        </div>
        <div class="card">
          <h3 style="font-size:14px; margin-bottom:10px;">Zona de trabajo</h3>
          <div class="map-box" id="perfil-mapa"></div>
          <div class="map-caption"><span>${esc(w.zona)}, Ibagué</span><span>${w.radio_cobertura_km ? `Cobertura: ${w.radio_cobertura_km} km` : 'Ubicación aproximada'}</span></div>
        </div>
      </div>
    </div>
    ${similares.length ? `<div class="section-title"><h2>Trabajadores similares</h2></div><div class="worker-grid">${similares.map(x=>workerCardHTML(x)).join('')}</div>` : ''}`;
  initMapaPerfil(w);
}
async function compartirPerfil(workerId){
  const w = await obtenerPerfil(workerId);
  const url = `${window.location.origin}${window.location.pathname}#/perfil/${workerId}`;
  if(navigator.share){
    navigator.share({ title: `Hogandia${w ? ' — '+w.nombre : ''}`, url }).catch(()=>{});
    return;
  }
  try{
    await navigator.clipboard.writeText(url);
    mostrarToast('Link del perfil copiado al portapapeles.', 'ok');
  }catch{
    mostrarToast('No se pudo copiar el link.', 'err');
  }
}

function initMapaPerfil(w){
  const coords = coordsForWorker(w);
  if(mapPerfil){ mapPerfil.remove(); mapPerfil = null; }
  mapPerfil = L.map('perfil-mapa', {zoomControl:false, attributionControl:false}).setView(coords, 13);
  tileLayer(mapPerfil);
  L.marker(coords, {icon:pinIcon('#E8752C')}).addTo(mapPerfil)
    .bindPopup(`<b>${esc(w.nombre)}</b><br>${esc(w.categoria)} · ${esc(w.zona)}`);
  if(w.radio_cobertura_km){
    const circulo = L.circle(coords, {
      radius: w.radio_cobertura_km * 1000,
      color: '#E8752C', weight: 1.5, fillColor: '#E8752C', fillOpacity: 0.08
    }).addTo(mapPerfil);
    setTimeout(()=>mapPerfil && mapPerfil.fitBounds(circulo.getBounds(), {padding:[6,6]}), 90);
  }
  setTimeout(()=>mapPerfil && mapPerfil.invalidateSize(), 80);
}

async function irAAgendar(workerId){
  const u = currentUser();
  if(!u || u.tipo!=='cliente'){
    nav('auth'); switchAuthTab('login');
    document.getElementById('auth-msg').innerHTML = `<div class="msg err">Inicia sesión como cliente para agendar una cita.</div>`;
    return;
  }
  state.workerActual = workerId; state.diaSel=null; state.horaSel=null; state.calMonthOffset=0; state.citaReagendar=null;
  nav('agendar');
  const w = await obtenerPerfil(workerId);
  if(!w){ document.getElementById('agendar-worker-summary').innerHTML = `<div class="empty-note">No encontramos ese trabajador.</div>`; return; }
  document.getElementById('agendar-worker-summary').innerHTML = `${avatarHTML(w.nombre, w.foto_url)}<div><div style="font-weight:600; color:var(--navy); font-size:14px;">${esc(w.nombre)}</div><div style="font-size:12px; color:var(--ink-soft);">${esc(w.categoria)}</div></div>`;
  document.getElementById('agendar-titulo').textContent = 'Agendar cita';
  document.getElementById('btn-confirmar-cita').textContent = 'Confirmar cita';
  renderCalendario();
  renderSlots();
}
async function reagendarCita(citaId){
  const { data: citaRaw } = await sb.from('citas').select('*').eq('id', citaId).single();
  const c = normalizarCita(citaRaw);
  if(!c) return;
  state.citaReagendar = citaId;
  state.workerActual = c.trabajadorId; state.diaSel=null; state.horaSel=null; state.calMonthOffset=0;
  nav('agendar');
  const w = await obtenerPerfil(c.trabajadorId);
  if(!w){ document.getElementById('agendar-worker-summary').innerHTML = `<div class="empty-note">No encontramos ese trabajador.</div>`; return; }
  document.getElementById('agendar-worker-summary').innerHTML = `${avatarHTML(w.nombre, w.foto_url)}<div><div style="font-weight:600; color:var(--navy); font-size:14px;">${esc(w.nombre)}</div><div style="font-size:12px; color:var(--ink-soft);">${esc(w.categoria)}</div></div>`;
  document.getElementById('agendar-titulo').textContent = 'Reagendar cita';
  document.getElementById('btn-confirmar-cita').textContent = 'Confirmar nuevo horario';
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
  const hoy = new Date();
  const esHoy = state.calMonthOffset===0 && state.diaSel===hoy.getDate();
  const urgenciaMsg = document.getElementById('agendar-urgencia-msg');
  if(urgenciaMsg){
    urgenciaMsg.innerHTML = (esHoy && w.tarifa_urgente)
      ? `<div class="msg" style="background:#FCEFE3;color:var(--orange-deep);margin-bottom:12px;">⚡ Estás agendando para hoy — se aplica un recargo por urgencia de ${fmtCOP(w.tarifa_urgente)}.</div>`
      : '';
  }
  const disponibles = horasDisponiblesDia(w.disponibilidad, dia);
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
  const btn = document.getElementById('btn-confirmar-cita');
  await conCargando(btn, 'Confirmando...', async () => {
    const target = calMesObjetivo();
    const mesesLower = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const anioSufijo = target.getFullYear()!==new Date().getFullYear() ? ` de ${target.getFullYear()}` : '';
    const fecha = `${state.diaSel} de ${mesesLower[target.getMonth()]}${anioSufijo}`;
    const dia = diaSemanaDeFecha(new Date(target.getFullYear(), target.getMonth(), state.diaSel));
    const w = await obtenerPerfil(state.workerActual);
    if(!w){ msg.innerHTML = `<div class="msg err">No encontramos ese trabajador.</div>`; return; }
    const disponibles = horasDisponiblesDia(w.disponibilidad, dia);
    if(!disponibles.includes(state.horaSel)){
      msg.innerHTML = `<div class="msg err">Ese horario ya no está disponible para este trabajador. Elige otro.</div>`;
      return;
    }
    let ocupadasQuery = sb.from('citas').select('id')
      .eq('trabajador_id', w.id).eq('fecha', fecha).eq('hora', state.horaSel).neq('estado','rechazada');
    if(state.citaReagendar) ocupadasQuery = ocupadasQuery.neq('id', state.citaReagendar);
    const { data: ocupadas } = await ocupadasQuery;
    if(ocupadas && ocupadas.length){
      msg.innerHTML = `<div class="msg err">Ese horario ya está reservado con este trabajador. Elige otro día u hora, o
        <button type="button" class="link-btn" onclick="anotarseListaEspera('${w.id}','${fecha}','${state.horaSel}')">anotate en la lista de espera</button>.</div>`;
      return;
    }
    const cliente = currentUser();
    const inicio = parseFechaHoraCita(fecha, state.horaSel);
    const notasCliente = document.getElementById('agendar-notas').value.trim();
    const direccionReferencia = document.getElementById('agendar-direccion').value.trim();
    const recurrente = document.getElementById('chk-recurrente').checked;
    const esUrgente = state.calMonthOffset===0 && state.diaSel===new Date().getDate();
    if(state.citaReagendar){
      const { data: cita, error } = await sb.from('citas').update({
        fecha, hora: state.horaSel, estado: 'pendiente', inicio: inicio ? inicio.toISOString() : null,
        notas_cliente: notasCliente || null, direccion_referencia: direccionReferencia || null,
        recurrente, es_urgente: esUrgente
      }).eq('id', state.citaReagendar).select().single();
      if(error){
        msg.innerHTML = `<div class="msg err">No se pudo reagendar: ${esc(error.message)}</div>`;
        return;
      }
      addNotificacion(w.id, `${cliente.nombre} reagendó su cita para el ${cita.fecha} · ${cita.hora}. Debes confirmarla de nuevo.`);
      msg.innerHTML = `<div class="msg ok">✓ Cita reagendada. Quedó pendiente de confirmación otra vez.</div>`;
      mostrarToast('Cita reagendada.', 'ok');
      state.citaReagendar = null;
      setTimeout(()=>nav('miscitas'), 900);
      return;
    }
    const { data: cita, error } = await sb.from('citas').insert({
      cliente_id: sessionUserId, trabajador_id: w.id,
      fecha, hora: state.horaSel, estado: 'pendiente', pago: 'pendiente',
      inicio: inicio ? inicio.toISOString() : null,
      notas_cliente: notasCliente || null, direccion_referencia: direccionReferencia || null,
      recurrente, es_urgente: esUrgente
    }).select().single();
    if(error){
      msg.innerHTML = `<div class="msg err">No se pudo agendar: ${esc(error.message)}</div>`;
      return;
    }
    addNotificacion(w.id, `Nueva solicitud de ${cliente.nombre} para el ${cita.fecha} · ${cita.hora}`);
    msg.innerHTML = `<div class="msg ok">✓ Cita enviada. Quedó pendiente de confirmación por parte del trabajador.</div>`;
    mostrarToast('Cita enviada. Quedó pendiente de confirmación.', 'ok');
    setTimeout(()=>nav('miscitas'), 900);
  });
}
async function anotarseListaEspera(trabajadorId, fecha, hora){
  const u = currentUser();
  const { error } = await sb.from('listas_espera').insert({ trabajador_id: trabajadorId, cliente_id: u.id, fecha, hora });
  if(error){
    mostrarToast(error.message.includes('duplicate') ? 'Ya estás anotado para ese horario.' : 'No se pudo anotar en la lista de espera.', 'err');
    return;
  }
  mostrarToast('Anotado en la lista de espera. Te avisamos si se libera ese horario.', 'ok');
}

/* ---------------- MIS CITAS (cliente) ---------------- */
async function renderMisCitas(){
  const u = currentUser();
  const box = document.getElementById('miscitas-content');
  if(!u || u.tipo!=='cliente'){ box.innerHTML = `<div class="empty-note">Inicia sesión como cliente para ver tus citas.</div>`; return; }
  box.innerHTML = `<div class="empty-note">Cargando...</div>`;
  const { data } = await sb.from('citas').select('*').eq('cliente_id', u.id).order('created_at', {ascending:false});
  const propias = (data||[]).map(normalizarCita);
  state.citasCacheCliente = propias;
  if(!propias.length){ box.innerHTML = `<div class="empty-note">Todavía no has agendado ninguna cita. <br><button class="btn btn-primary" style="margin-top:12px;" onclick="nav('buscar')">Buscar trabajadores</button></div>`; return; }

  const trabajadores = await obtenerPerfiles(propias.map(c=>c.trabajadorId));
  const porId = new Map(trabajadores.map(w=>[w && w.id, w]));
  box.innerHTML = `<button type="button" class="btn btn-outline" style="margin-bottom:14px;" onclick="exportarCitasCSV('cliente')">⬇ Exportar historial (CSV)</button>
  <table><thead><tr><th>Trabajador</th><th>Fecha</th><th>Hora</th><th>Estado</th><th>Pago</th><th>Acciones</th></tr></thead><tbody>
    ${propias.map(c=>{
      const w = porId.get(c.trabajadorId);
      let accion = '';
      if(c.estado==='pendiente') accion = `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="cancelarCita('${c.id}', this)">Cancelar</button>`;
      if(c.estado==='aceptada') accion = `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="marcarCompletada('${c.id}', this)">Marcar completado</button>`;
      if(c.estado==='completada' && !c.calificacion) accion = `<button class="btn btn-primary" style="font-size:12px;padding:6px 10px;" onclick="abrirCalificar('${c.id}')">Calificar</button>`;
      if(c.calificacion) accion = `<span class="mono" style="font-size:12px;color:var(--ink-soft);">${'★'.repeat(c.calificacion.estrellas)} calificado</span>`;
      if(c.estado==='pendiente' || c.estado==='aceptada') accion += ` <button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="reagendarCita('${c.id}')">Reagendar</button>`;
      if(c.estado==='completada') accion += ` <button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="irAAgendar('${c.trabajadorId}')">Agendar de nuevo</button>`;
      if(c.estado==='aceptada') accion += ` <button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="descargarIcs('${c.id}')">📅 Agregar a calendario</button>`;
      let pagoPill;
      if(c.pago==='pagado') pagoPill = `<span class="status-pill status-activo">pagado</span>`;
      else if(c.pago==='declarado') pagoPill = `<span class="status-pill status-pendiente">esperando confirmación</span>`;
      else if(c.estado==='aceptada' || c.estado==='completada') pagoPill = `<button class="btn btn-outline" style="font-size:11px;padding:5px 9px;" onclick="abrirDeclararPago('${c.id}')">Declarar pago</button>`;
      else pagoPill = `<span class="status-pill status-pendiente">pendiente</span>`;
      return `<tr>
        <td>${w?esc(w.nombre):'—'}${c.recurrente?' <span title="Servicio recurrente">🔁</span>':''}</td><td>${esc(c.fecha)}</td><td>${esc(c.hora)}</td>
        <td><span class="status-pill status-${c.estado}"${c.estado==='cancelada' && c.motivo_cancelacion ? ` title="${esc(c.motivo_cancelacion)}"` : ''}>${c.estado}</span>${c.estado==='aceptada' && c.en_camino ? `<br><span class="rating-pill disp-ahora" style="margin-top:4px;">🚗 En camino</span> <button type="button" class="btn btn-outline" style="font-size:10.5px;padding:3px 7px;margin-top:4px;" onclick="verUbicacionEnCamino('${c.id}')">Ver en mapa</button>` : ''}</td>
        <td>${pagoPill}</td>
        <td><div class="row-actions">${accion}
          <button onclick="abrirChat('${c.id}')">Chat</button>
          <button onclick="abrirComprobante('${c.id}')">Comprobante</button>
          <button class="rej" onclick="abrirReportar('${c.id}')">Reportar</button>
        </div></td>
      </tr>`;
    }).join('')}
  </tbody></table>
  <div id="encamino-mapa-panel" class="hidden" style="margin-top:20px;"></div>
  <div id="calificar-panel" style="margin-top:20px;"></div>
  <div id="pagar-panel" style="margin-top:20px;"></div>
  <div id="chat-panel" style="margin-top:20px;"></div>
  <div id="reportar-panel" style="margin-top:20px;" role="status" aria-live="polite"></div>`;
}
let mapEnCamino = null;
async function verUbicacionEnCamino(citaId){
  const { data: citaRaw } = await sb.from('citas').select('*').eq('id', citaId).single();
  const c = normalizarCita(citaRaw);
  if(!c || c.en_camino_lat==null) return;
  const panel = document.getElementById('encamino-mapa-panel');
  if(!panel) return;
  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="card"><h3 style="font-size:14px;margin-bottom:10px;">Ubicación de tu trabajador</h3><div class="map-box" id="encamino-mapa" style="height:220px;"></div></div>`;
  if(mapEnCamino){ mapEnCamino.remove(); mapEnCamino = null; }
  mapEnCamino = L.map('encamino-mapa', {zoomControl:false, attributionControl:false}).setView([c.en_camino_lat, c.en_camino_lng], 14);
  tileLayer(mapEnCamino);
  L.marker([c.en_camino_lat, c.en_camino_lng], {icon:pinIcon('#3F7D58')}).addTo(mapEnCamino);
  setTimeout(()=>mapEnCamino && mapEnCamino.invalidateSize(), 80);
}
function exportarCitasCSV(vista){
  const filas = vista==='cliente' ? state.citasCacheCliente : state.citasCacheTrabajador;
  if(!filas || !filas.length){ mostrarToast('No hay citas para exportar.', 'err'); return; }
  const encabezado = ['Fecha','Hora','Estado','Pago','Monto','Notas'];
  const lineas = [encabezado.join(',')];
  filas.forEach(c=>{
    const campos = [c.fecha, c.hora, c.estado, c.pago||'', c.monto||'', (c.notas_cliente||'').replace(/[\r\n,]+/g,' ')];
    lineas.push(campos.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  });
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `historial-hogandia-${vista}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
async function cancelarCita(id, btn){
  const motivo = await pedirTextoModal('¿Por qué cancelás? (opcional). Esta acción no se puede deshacer.', {titulo:'Cancelar cita', textoConfirmar:'Sí, cancelar', placeholder:'Opcional'});
  if(motivo === null) return; // cerró el modal sin confirmar
  await conCargando(btn, 'Cancelando...', async () => {
    await sb.from('citas').update({ estado:'cancelada', motivo_cancelacion: motivo.trim() || null, cancelada_por: sessionUserId }).eq('id', id);
    renderMisCitas();
  });
}
async function marcarCompletada(id, btn){
  await conCargando(btn, 'Guardando...', async () => {
    await sb.from('citas').update({ estado: 'completada' }).eq('id', id);
    renderMisCitas();
  });
}
// Pago manual por transferencia: el cliente declara que pagó por fuera de la
// app (Nequi, cuenta bancaria, etc.) y sube un comprobante; el trabajador
// confirma o rechaza. El trigger controlar_transicion_pago (migración 016)
// obliga a que cada paso lo dé quien corresponde.
async function abrirDeclararPago(citaId){
  state.citaPagar = citaId;
  await renderDeclararPagoPanel();
  const panel = document.getElementById('pagar-panel');
  if(panel) panel.scrollIntoView({ behavior:'smooth', block:'start' });
}
function cerrarDeclararPago(){
  state.citaPagar = null;
  const panel = document.getElementById('pagar-panel');
  if(panel) panel.innerHTML = '';
}
// Vista previa antes de enviar: para imágenes muestra una miniatura real
// (FileReader, nunca sale del navegador); para PDF solo confirma el nombre,
// porque no vale la pena traer una librería de renderizado solo para esto.
function previsualizarComprobante(input){
  const cont = document.getElementById('comprobante-preview');
  if(!cont) return;
  const file = input.files[0];
  if(!file){ cont.innerHTML = ''; return; }
  if(file.type.startsWith('image/')){
    const reader = new FileReader();
    reader.onload = () => {
      cont.innerHTML = `<img src="${reader.result}" alt="Vista previa del comprobante" style="max-width:160px;max-height:160px;border-radius:10px;border:1px solid var(--line);display:block;">`;
    };
    reader.readAsDataURL(file);
  } else {
    cont.innerHTML = `<p style="font-size:12.5px;color:var(--ink-soft);">📄 ${esc(file.name)}</p>`;
  }
}
async function renderDeclararPagoPanel(){
  const panel = document.getElementById('pagar-panel');
  if(!panel || !state.citaPagar) return;
  const cita = (state.citasCacheCliente||[]).find(c=>c.id===state.citaPagar);
  const w = cita ? await obtenerPerfil(cita.trabajadorId) : null;
  panel.innerHTML = `
    <div class="card" style="max-width:440px;">
      <h3 style="font-size:15px; margin-bottom:10px;">Datos para pagarle a ${w?esc(w.nombre.split(' ')[0]):'tu trabajador'}</h3>
      <p style="font-size:13px; white-space:pre-wrap; background:var(--paper); padding:10px; border-radius:8px; margin-bottom:14px;">${w && w.datos_pago_texto ? esc(w.datos_pago_texto) : 'Este trabajador todavía no cargó sus datos de pago. Consultale directamente cómo prefiere que le transfieras.'}</p>
      <label for="comprobante-input" style="font-size:11px; font-family:'IBM Plex Mono'; letter-spacing:0.05em; text-transform:uppercase; color:var(--ink-soft); display:block; margin-bottom:8px;">Comprobante de la transferencia</label>
      <input type="file" id="comprobante-input" accept="image/*,application/pdf" onchange="previsualizarComprobante(this)">
      <div id="comprobante-preview" style="margin-top:10px;"></div>
      <div style="margin-top:12px; display:flex; gap:8px;">
        <button type="button" class="btn btn-primary" id="btn-declarar-pago" onclick="declararPago()">Ya transferí, enviar comprobante</button>
        <button type="button" class="btn btn-outline" onclick="cerrarDeclararPago()">Cancelar</button>
      </div>
      <div id="declarar-pago-msg" role="status" aria-live="polite" style="margin-top:8px;"></div>
    </div>`;
}
async function declararPago(){
  const citaId = state.citaPagar;
  if(!citaId) return;
  const input = document.getElementById('comprobante-input');
  const msgEl = document.getElementById('declarar-pago-msg');
  const file = input && input.files[0];
  if(!file){
    if(msgEl) msgEl.innerHTML = `<div class="msg err">Adjuntá el comprobante antes de enviar.</div>`;
    return;
  }
  const btn = document.getElementById('btn-declarar-pago');
  await conCargando(btn, 'Enviando...', async () => {
    const { data: cita } = await sb.from('citas').select('trabajador_id, es_urgente').eq('id', citaId).single();
    if(!cita) return;
    const w = await obtenerPerfil(cita.trabajador_id);
    const monto = calcularMonto(w, cita.es_urgente);
    const ext = file.name.split('.').pop();
    const path = `${citaId}/${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from('comprobantes').upload(path, file, { upsert: true });
    if(upErr){
      if(msgEl) msgEl.innerHTML = `<div class="msg err">No se pudo subir el comprobante: ${esc(upErr.message)}</div>`;
      return;
    }
    const { error: updErr } = await sb.from('citas').update({ pago: 'declarado', monto, comprobante_pago_path: path }).eq('id', citaId);
    if(updErr){
      if(msgEl) msgEl.innerHTML = `<div class="msg err">No se pudo registrar el pago: ${esc(updErr.message)}</div>`;
      return;
    }
    if(w) addNotificacion(w.id, 'Un cliente declaró que ya te pagó. Revisá el comprobante y confirmalo cuando lo recibas.');
    mostrarToast('Comprobante enviado. Te avisamos cuando el trabajador lo confirme.', 'ok');
    cerrarDeclararPago();
    renderMisCitas();
  });
}
async function verComprobantePago(path){
  // Abrir la ventana antes de esperar la URL firmada, para que el navegador no la bloquee.
  const win = window.open('', '_blank');
  const { data, error } = await sb.storage.from('comprobantes').createSignedUrl(path, 60);
  if(error || !data){ win.close(); mostrarToast('No se pudo abrir el comprobante.', 'err'); return; }
  win.location.href = data.signedUrl;
}
async function confirmarPagoRecibido(citaId, btn){
  await conCargando(btn, 'Confirmando...', async () => {
    const { data: c, error } = await sb.from('citas').update({ pago: 'pagado' }).eq('id', citaId).select('cliente_id, fecha').single();
    if(error){ mostrarToast('No se pudo confirmar el pago.', 'err'); return; }
    if(c) addNotificacion(c.cliente_id, `El trabajador confirmó que recibió tu pago del servicio del ${c.fecha}. ¡Gracias!`);
    mostrarToast('Pago confirmado.', 'ok');
    renderTrabajo();
  });
}
async function rechazarComprobantePago(citaId, btn){
  await conCargando(btn, 'Rechazando...', async () => {
    const { data: c, error } = await sb.from('citas').update({ pago: 'pendiente', comprobante_pago_path: null }).eq('id', citaId).select('cliente_id').single();
    if(error){ mostrarToast('No se pudo rechazar el comprobante.', 'err'); return; }
    if(c) addNotificacion(c.cliente_id, 'El trabajador no encontró tu pago. Revisá los datos y volvé a intentarlo.');
    mostrarToast('Comprobante rechazado.', 'ok');
    renderTrabajo();
  });
}
async function renderIngresos(){
  const u = currentUser();
  const box = document.getElementById('work-ingresos');
  if(!u || u.tipo!=='trabajador'){ box.innerHTML = `<div class="empty-note">Inicia sesión como trabajador para ver tus ingresos.</div>`; return; }
  box.innerHTML = `<div class="empty-note">Cargando...</div>`;
  const { data } = await sb.from('citas').select('fecha, monto').eq('trabajador_id', u.id).eq('pago', 'pagado');
  const pagos = data || [];
  const total = pagos.reduce((a,c)=>a+(c.monto||0), 0);
  const porMes = new Map(); // "AAAA-MM · Mes AAAA" -> suma (la clave ordena bien y se ve linda)
  pagos.forEach(c=>{
    const fecha = parseFechaHoraCita(c.fecha, '12:00 pm');
    const clave = fecha ? `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')} · ${MESES[fecha.getMonth()]} ${fecha.getFullYear()}` : '0000 · Sin fecha';
    porMes.set(clave, (porMes.get(clave)||0) + (c.monto||0));
  });
  const filas = [...porMes.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
  box.innerHTML = `
    <div class="admin-summary" style="grid-template-columns:repeat(2,1fr); max-width:420px;">
      <div class="admin-stat"><span>Total cobrado</span><b>${fmtCOP(total)}</b></div>
      <div class="admin-stat"><span>Servicios pagados</span><b>${pagos.length}</b></div>
    </div>
    ${filas.length ? `<table><thead><tr><th>Mes</th><th>Ingresos</th></tr></thead><tbody>
      ${filas.map(([clave, monto])=>`<tr><td>${esc(clave.split(' · ')[1])}</td><td>${fmtCOP(monto)}</td></tr>`).join('')}
    </tbody></table>` : `<div class="empty-note">Todavía no registraste ningún pago.</div>`}`;
}
function abrirCalificar(id){
  const panel = document.getElementById('calificar-panel');
  panel.innerHTML = `<div class="card">
    <h3 style="font-size:14px;margin-bottom:10px;">Califica el servicio</h3>
    <div class="stars-input" id="stars-input">${[1,2,3,4,5].map(n=>`<span data-n="${n}" onclick="setStars(${n})">★</span>`).join('')}</div>
    <textarea id="calif-comentario" placeholder="Cuéntanos cómo te fue..." rows="3" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:9px;font-family:inherit;font-size:13px;margin-bottom:12px;"></textarea>
    <label style="font-size:12px;color:var(--ink-soft);display:block;margin-bottom:8px;">Agregar fotos del trabajo (opcional, hasta 4)</label>
    <input type="file" id="calif-fotos" accept="image/*" multiple style="margin-bottom:12px;">
    <button class="btn btn-primary" onclick="enviarCalificacion('${id}', this)">Enviar calificación</button>
  </div>`;
  state.estrellasSel = 5; setStars(5);
}
function setStars(n){
  state.estrellasSel = n;
  document.querySelectorAll('#stars-input span').forEach(s=>s.classList.toggle('on', Number(s.dataset.n)<=n));
}
async function enviarCalificacion(citaId, btn){
  const u = currentUser();
  const comentario = document.getElementById('calif-comentario').value.trim() || 'Sin comentarios.';
  const panel = document.getElementById('calificar-panel');
  const fotosInput = document.getElementById('calif-fotos');
  const archivos = fotosInput ? Array.from(fotosInput.files).slice(0, 4) : [];
  await conCargando(btn, 'Enviando...', async () => {
    const fotos = [];
    for(let i=0; i<archivos.length; i++){
      const ext = archivos[i].name.split('.').pop();
      const path = `${u.id}/${citaId}-${Date.now()}-${i}.${ext}`;
      const { error: upErr } = await sb.storage.from('resenas-fotos').upload(path, archivos[i]);
      if(!upErr){
        const { data: pub } = sb.storage.from('resenas-fotos').getPublicUrl(path);
        fotos.push(pub.publicUrl);
      }
    }
    // worker_id y cliente_nombre los completa un trigger en la base de datos a
    // partir de la cita real (evita que se pueda calificar sin haber contratado).
    const { data, error } = await sb.from('resenas').insert({
      cita_id: citaId, estrellas: state.estrellasSel, comentario, fotos
    }).select('worker_id').single();
    if(error){
      if(panel) panel.innerHTML = `<div class="msg err">No se pudo enviar la calificación: ${esc(error.message)}</div>`;
      return;
    }
    await sb.from('citas').update({ calificacion: { estrellas: state.estrellasSel, comentario } }).eq('id', citaId);
    invalidarPerfil(data.worker_id);
    renderMisCitas();
  });
}
function abrirCalificarCliente(citaId){
  const panel = document.getElementById('calificar-cliente-panel');
  panel.innerHTML = `<div class="card">
    <h3 style="font-size:14px;margin-bottom:10px;">Califica a este cliente</h3>
    <div class="stars-input" id="stars-input-cliente">${[1,2,3,4,5].map(n=>`<span data-n="${n}" onclick="setStarsCliente(${n})">★</span>`).join('')}</div>
    <textarea id="calif-cliente-comentario" placeholder="Notas sobre este cliente (opcional)..." rows="3" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:9px;font-family:inherit;font-size:13px;margin-bottom:12px;"></textarea>
    <button class="btn btn-primary" onclick="enviarCalificacionCliente('${citaId}', this)">Enviar calificación</button>
  </div>`;
  state.estrellasSelCliente = 5; setStarsCliente(5);
}
function setStarsCliente(n){
  state.estrellasSelCliente = n;
  document.querySelectorAll('#stars-input-cliente span').forEach(s=>s.classList.toggle('on', Number(s.dataset.n)<=n));
}
async function enviarCalificacionCliente(citaId, btn){
  const comentario = document.getElementById('calif-cliente-comentario').value.trim();
  await conCargando(btn, 'Enviando...', async () => {
    const { error } = await sb.from('citas').update({
      calificacion_trabajador: { estrellas: state.estrellasSelCliente, comentario }
    }).eq('id', citaId);
    if(error){ mostrarToast('No se pudo enviar la calificación.', 'err'); return; }
    mostrarToast('Calificación enviada.', 'ok');
    renderTrabajo();
  });
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
      <button class="btn btn-primary" id="btn-chat-enviar" onclick="enviarMensaje('${citaId}')">Enviar</button>
    </div>
  </div>`;
  const box = document.getElementById('chat-box'); if(box) box.scrollTop = box.scrollHeight;
}
async function enviarMensaje(citaId){
  const input = document.getElementById('chat-input');
  const texto = input.value.trim();
  if(!texto) return;
  const btn = document.getElementById('btn-chat-enviar');
  await conCargando(btn, 'Enviando...', async () => {
    const u = currentUser();
    const { data: citaRaw } = await sb.from('citas').select('*').eq('id', citaId).single();
    const c = normalizarCita(citaRaw);
    if(!c) return;
    await sb.from('mensajes').insert({ cita_id: citaId, de: u.id, texto });
    const otroId = u.tipo==='cliente' ? c.trabajadorId : c.clienteId;
    addNotificacion(otroId, `Nuevo mensaje de ${u.nombre.split(' ')[0]} sobre la cita del ${c.fecha}.`);
    input.value = '';
    renderChat();
  });
}

/* ---------------- CHAT ANTES DE AGENDAR (sin cita todavía) ---------------- */
async function contactarTrabajador(workerId, btn){
  const u = currentUser();
  if(!u || u.tipo!=='cliente') return;
  await conCargando(btn, 'Abriendo chat...', async () => {
    const { data: existente } = await sb.from('conversaciones').select('id')
      .eq('cliente_id', u.id).eq('trabajador_id', workerId).maybeSingle();
    let conversacionId = existente && existente.id;
    if(!conversacionId){
      const { data: nueva, error } = await sb.from('conversaciones')
        .insert({ cliente_id: u.id, trabajador_id: workerId }).select('id').single();
      if(error){
        document.getElementById('perfil-chat-panel').innerHTML = `<div class="msg err">No se pudo abrir el chat: ${esc(error.message)}</div>`;
        return;
      }
      conversacionId = nueva.id;
    }
    abrirChatPrevio(conversacionId);
  });
}
function abrirChatPrevio(conversacionId){
  state.conversacionActual = conversacionId;
  renderChatPrevio();
  suscribirChatPrevio(conversacionId);
}
async function renderChatPrevio(){
  const conversacionId = state.conversacionActual;
  const { data: conv } = await sb.from('conversaciones').select('*').eq('id', conversacionId).single();
  if(!conv) return;
  const u = currentUser();
  const activa = document.querySelector('.view.active').id;
  const panel = document.getElementById(activa==='v-trabajo' ? 'work-chat-previo-panel' : 'perfil-chat-panel');
  if(!panel) return;
  const otro = await obtenerPerfil(u.tipo==='cliente' ? conv.trabajador_id : conv.cliente_id);
  if(!otro) return;
  const { data: mensajes } = await sb.from('mensajes').select('*').eq('conversacion_id', conversacionId).order('created_at');
  panel.innerHTML = `<div class="card">
    <h3 style="font-size:14px;margin-bottom:10px;">Chat con ${esc(otro.nombre)}</h3>
    <div class="chat-box" id="chat-box-previo">${(mensajes||[]).map(m=>`<div class="chat-msg ${m.de===u.id?'mio':''}"><b>${m.de===u.id?'Tú':esc(otro.nombre.split(' ')[0])}:</b> ${esc(m.texto)}</div>`).join('') || '<div class="empty-note" style="padding:10px;">Todavía no hay mensajes. Escribe el primero.</div>'}</div>
    <div style="display:flex; gap:8px;">
      <input id="chat-input-previo" placeholder="Escribe un mensaje..." style="flex:1;padding:10px 12px;border:1.5px solid var(--line);border-radius:9px;font-family:inherit;font-size:13px;" onkeydown="if(event.key==='Enter') enviarMensajePrevio('${conversacionId}')">
      <button class="btn btn-primary" id="btn-chat-previo-enviar" onclick="enviarMensajePrevio('${conversacionId}')">Enviar</button>
    </div>
  </div>`;
  const box = document.getElementById('chat-box-previo'); if(box) box.scrollTop = box.scrollHeight;
}
async function enviarMensajePrevio(conversacionId){
  const input = document.getElementById('chat-input-previo');
  const texto = input.value.trim();
  if(!texto) return;
  const btn = document.getElementById('btn-chat-previo-enviar');
  await conCargando(btn, 'Enviando...', async () => {
    const u = currentUser();
    const { data: conv } = await sb.from('conversaciones').select('*').eq('id', conversacionId).single();
    if(!conv) return;
    await sb.from('mensajes').insert({ conversacion_id: conversacionId, de: u.id, texto });
    const otroId = u.tipo==='cliente' ? conv.trabajador_id : conv.cliente_id;
    addNotificacion(otroId, `Nuevo mensaje de ${u.nombre.split(' ')[0]}.`);
    input.value = '';
    renderChatPrevio();
  });
}
async function renderMensajesTrabajador(){
  const u = currentUser();
  const box = document.getElementById('work-mensajes');
  if(!u || u.tipo!=='trabajador'){ box.innerHTML = `<div class="empty-note">Inicia sesión como trabajador para ver tus mensajes.</div>`; return; }
  box.innerHTML = `<div class="empty-note">Cargando...</div>`;
  const { data } = await sb.from('conversaciones').select('*').eq('trabajador_id', u.id).order('created_at', {ascending:false});
  const conversaciones = data || [];
  if(!conversaciones.length){ box.innerHTML = `<div class="empty-note">Todavía nadie te escribió antes de agendar.</div>`; return; }
  const clientes = await obtenerPerfiles(conversaciones.map(c=>c.cliente_id));
  const clientePorId = new Map(clientes.map(c=>[c && c.id, c]));
  box.innerHTML = `<div class="card" style="max-width:520px; margin-bottom:16px;">
    <h3 style="font-size:15px; margin-bottom:12px;">Conversaciones</h3>
    ${conversaciones.map(c=>{
      const cli = clientePorId.get(c.cliente_id);
      return `<button type="button" class="btn btn-outline" style="width:100%;margin-bottom:8px;text-align:left;" onclick="abrirChatPrevio('${c.id}')">💬 ${cli?esc(cli.nombre):'Cliente'}</button>`;
    }).join('')}
  </div>
  <div id="work-chat-previo-panel" style="max-width:520px;"></div>`;
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
    <button class="btn btn-primary" onclick="enviarReporte('${citaId}', this)">Enviar reporte</button>
  </div>`;
}
async function enviarReporte(citaId, btn){
  const motivo = document.getElementById('reporte-motivo').value.trim();
  if(!motivo) return;
  await conCargando(btn, 'Enviando...', async () => {
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
  });
}

/* ---------------- CALENDARIO PERSONAL (.ics) ---------------- */
// La fecha se guarda como texto en español (ej. "15 de agosto" o "15 de
// agosto de 2027"); hay que revertir ese formato a un Date real para el evento.
function parseFechaHoraCita(fecha, hora){
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const m = (fecha||'').match(/^(\d+) de (\w+)(?: de (\d+))?$/i);
  if(!m) return null;
  const dia = Number(m[1]);
  const mes = meses.indexOf(m[2].toLowerCase());
  if(mes<0) return null;
  const anio = m[3] ? Number(m[3]) : new Date().getFullYear();
  const hm = (hora||'').match(/^(\d+):(\d+)\s*(am|pm)$/i);
  if(!hm) return null;
  let h = Number(hm[1]) % 12;
  if(/pm/i.test(hm[3])) h += 12;
  return new Date(anio, mes, dia, h, Number(hm[2]));
}
function icsFecha(d){
  const p = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}
function icsFechaUTC(d){
  const p = n=>String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
function icsEscape(s){ return String(s).replace(/[\\,;]/g, m=>'\\'+m).replace(/\n/g,'\\n'); }
async function descargarIcs(citaId){
  const { data: citaRaw } = await sb.from('citas').select('*').eq('id', citaId).single();
  const c = normalizarCita(citaRaw);
  if(!c) return;
  const inicio = parseFechaHoraCita(c.fecha, c.hora);
  if(!inicio){ mostrarToast('No se pudo generar el evento de calendario.', 'err'); return; }
  const fin = new Date(inicio.getTime() + 60*60*1000); // asume 1 hora de duración
  const w = await obtenerPerfil(c.trabajadorId);
  const titulo = icsEscape(`Servicio Hogandia${w ? ' — ' + w.categoria : ''}`);
  const desc = icsEscape(`Cita con ${w ? w.nombre : 'el trabajador'} agendada a través de Hogandia.`);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hogandia//ES',
    'BEGIN:VEVENT',
    `UID:${c.id}@hogandia`,
    `DTSTAMP:${icsFechaUTC(new Date())}`,
    `DTSTART:${icsFecha(inicio)}`,
    `DTEND:${icsFecha(fin)}`,
    `SUMMARY:${titulo}`,
    `DESCRIPTION:${desc}`,
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `cita-hogandia-${c.id}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
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
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Comprobante Hogandia</title>
  <style>
    body{font-family:Arial,sans-serif; padding:28px; color:#14201B;}
    h1{font-size:18px; margin-bottom:4px;} .sub{color:#5B6A66; font-size:12px; margin-bottom:20px;}
    .row{display:flex; justify-content:space-between; border-bottom:1px dashed #DCDFDE; padding:10px 0; font-size:13px;}
    .row b{color:#1C2B39;}
    .stamp{margin-top:20px; padding:10px; background:#EAF3EC; color:#3F7D58; text-align:center; border-radius:8px; font-weight:bold;}
  </style></head><body>
  <h1>Hogandia — Orden de servicio</h1>
  <div class="sub">N° ${c.id.toUpperCase()}</div>
  <div class="row"><span>Cliente</span><b>${esc(cliente?cliente.nombre:'—')}</b></div>
  <div class="row"><span>Trabajador</span><b>${esc(w?w.nombre:'—')}</b></div>
  <div class="row"><span>Categoría</span><b>${esc(w?w.categoria:'—')}</b></div>
  <div class="row"><span>Zona</span><b>${esc(w?w.zona:'—')}</b></div>
  <div class="row"><span>Fecha</span><b>${esc(c.fecha)}</b></div>
  <div class="row"><span>Hora</span><b>${esc(c.hora)}</b></div>
  <div class="row"><span>Estado</span><b>${esc(c.estado)}</b></div>
  <div class="row"><span>Pago</span><b>${esc(c.pago)}</b></div>
  <div class="stamp">Documento generado por Hogandia — comprobante no oficial</div>
  <script>window.onload = () => window.print();</script>
  </body></html>`);
  win.document.close();
}

/* ---------------- PANEL TRABAJADOR ---------------- */
function switchWorkTab(tab){
  document.getElementById('wtab-solicitudes').classList.toggle('on', tab==='solicitudes');
  document.getElementById('wtab-mensajes').classList.toggle('on', tab==='mensajes');
  document.getElementById('wtab-ingresos').classList.toggle('on', tab==='ingresos');
  document.getElementById('wtab-perfil').classList.toggle('on', tab==='perfil');
  document.getElementById('work-solicitudes').classList.toggle('hidden', tab!=='solicitudes');
  document.getElementById('work-mensajes').classList.toggle('hidden', tab!=='mensajes');
  document.getElementById('work-ingresos').classList.toggle('hidden', tab!=='ingresos');
  document.getElementById('work-perfil').classList.toggle('hidden', tab!=='perfil');
  if(tab==='ingresos') renderIngresos();
  if(tab==='mensajes') renderMensajesTrabajador();
}
async function renderTrabajo(){
  const u = currentUser();
  if(!u || u.tipo!=='trabajador'){ document.getElementById('work-solicitudes').innerHTML = `<div class="empty-note">Inicia sesión como trabajador para ver tu panel.</div>`; return; }
  document.getElementById('work-solicitudes').innerHTML = `<div class="empty-note">Cargando...</div>`;

  const { data } = await sb.from('citas').select('*').eq('trabajador_id', u.id).order('created_at', {ascending:false});
  const propias = (data||[]).map(normalizarCita);
  state.citasCacheTrabajador = propias;
  const clientes = await obtenerPerfiles(propias.map(c=>c.clienteId));
  const clientePorId = new Map(clientes.map(c=>[c && c.id, c]));
  // Reputación del cliente vista desde este trabajador: promedio de las
  // veces que ya lo calificó (no es un puntaje global de otros trabajadores,
  // las políticas de citas no dejan ver citas ajenas).
  const misCalifClientes = new Map(); // clienteId -> {suma, n}
  propias.forEach(c=>{
    if(c.calificacion_trabajador){
      const acc = misCalifClientes.get(c.clienteId) || {suma:0, n:0};
      acc.suma += c.calificacion_trabajador.estrellas; acc.n += 1;
      misCalifClientes.set(c.clienteId, acc);
    }
  });
  document.getElementById('work-solicitudes').innerHTML = propias.length ? `
    <button type="button" class="btn btn-outline" style="margin-bottom:14px;" onclick="exportarCitasCSV('trabajador')">⬇ Exportar historial (CSV)</button>
    <table><thead><tr><th>Cliente</th><th>Fecha</th><th>Hora</th><th>Estado</th><th>Pago</th><th>Acciones</th></tr></thead><tbody>
    ${propias.map(c=>{
      const cli = clientePorId.get(c.clienteId);
      const califCli = misCalifClientes.get(c.clienteId);
      const nombreCliente = `${cli?esc(cli.nombre):'—'}${califCli ? ` <span class="mono" style="font-size:10.5px;color:var(--ink-soft);" title="Tu calificación a este cliente">★${(califCli.suma/califCli.n).toFixed(1)}</span>` : ''}`;
      const notasIcono = (c.notas_cliente || c.direccion_referencia)
        ? ` <span title="${esc([c.direccion_referencia?'Dirección: '+c.direccion_referencia:'', c.notas_cliente?'Notas: '+c.notas_cliente:''].filter(Boolean).join(' · '))}">📝</span>` : '';
      let accion = '';
      if(c.estado==='pendiente') accion = `<div class="row-actions"><button class="acc" onclick="responderCita('${c.id}','aceptada', this)">Aceptar</button><button class="rej" onclick="responderCita('${c.id}','rechazada', this)">Rechazar</button></div>`;
      if(c.estado==='aceptada') accion = `<button class="rej" onclick="cancelarCitaTrabajador('${c.id}', this)">Cancelar</button> <button onclick="descargarIcs('${c.id}')">📅 Calendario</button>${!c.en_camino ? ` <button onclick="avisarEnCamino('${c.id}', this)">🚗 Voy en camino</button>` : ''}`;
      if(c.estado==='completada' && !c.calificacion_trabajador) accion = `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="abrirCalificarCliente('${c.id}')">Calificar cliente</button>`;
      if(c.calificacion_trabajador) accion = `<span class="mono" style="font-size:12px;color:var(--ink-soft);">${'★'.repeat(c.calificacion_trabajador.estrellas)} calificado</span>`;
      let pagoCell;
      if(c.pago==='pagado') pagoCell = `<span class="status-pill status-activo">pagado</span>`;
      else if(c.pago==='declarado') pagoCell = `<div class="row-actions">
          <button onclick="verComprobantePago('${esc(c.comprobante_pago_path)}')">Ver comprobante</button>
          <button class="acc" onclick="confirmarPagoRecibido('${c.id}', this)">Confirmar</button>
          <button class="rej" onclick="rechazarComprobantePago('${c.id}', this)">Rechazar</button>
        </div>`;
      else pagoCell = `<span class="status-pill status-pendiente">${c.pago||'pendiente'}</span>`;
      return `<tr><td>${nombreCliente}</td><td>${esc(c.fecha)}${notasIcono}</td><td>${esc(c.hora)}</td>
        <td><span class="status-pill status-${c.estado}"${c.estado==='cancelada' && c.motivo_cancelacion ? ` title="${esc(c.motivo_cancelacion)}"` : ''}>${c.estado}</span>${c.en_camino?'<br><span class="rating-pill disp-ahora" style="margin-top:4px;">🚗 En camino</span>':''}</td>
        <td>${pagoCell}</td>
        <td><div class="row-actions">${accion}<button onclick="abrirChat('${c.id}')">Chat</button></div></td></tr>`;
    }).join('')}
    </tbody></table>
    <div id="calificar-cliente-panel" style="margin-top:20px;"></div>
    <div id="chat-panel-work" style="margin-top:20px;"></div>` : `<div class="empty-note">Todavía no tienes solicitudes de servicio.</div>`;

  const verifBadge = u.verificado ? `<span class="verif-badge">✓ Verificado</span>`
    : u.verificacionPendiente ? `<span class="status-pill status-pendiente">Verificación pendiente</span>`
    : u.verificacion_rechazada
      ? `<span class="status-pill status-rechazada">Rechazada</span> <button id="wp-verif-btn" class="btn btn-outline" onclick="mostrarFormularioVerificacion()">Volver a solicitar</button>`
      : `<button id="wp-verif-btn" class="btn btn-outline" onclick="mostrarFormularioVerificacion()">Solicitar verificación</button>`;

  state.wpDisponibilidad = JSON.parse(JSON.stringify(u.disponibilidad || disponibilidadPorDefecto()));
  // currentUser() no trae las reseñas (cargarPerfilActual no las selecciona); se piden aparte para el panel.
  const propioConResenas = await obtenerPerfil(u.id, true);
  const misResenas = (propioConResenas && propioConResenas.resenas) || [];

  const completitud = calcularCompletitudPerfil(u);
  const completitudHTML = completitud.porcentaje >= 100 ? `
    <div class="card" style="max-width:520px; margin-bottom:16px;">
      <h3 style="font-size:15px;">✓ Perfil completo</h3>
      <p style="font-size:12.5px; color:var(--ink-soft); margin-top:4px;">Tu perfil tiene todo lo necesario para generar confianza.</p>
    </div>` : `
    <div class="card" style="max-width:520px; margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h3 style="font-size:15px;">Completa tu perfil</h3>
        <b class="mono">${completitud.porcentaje}%</b>
      </div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${completitud.porcentaje}%"></div></div>
      <p style="font-size:12px; color:var(--ink-soft); margin:10px 0 4px;">Un perfil completo genera más confianza y aparece mejor rankeado. Te falta:</p>
      <ul style="margin:0; padding-left:18px; font-size:12.5px;">
        ${completitud.faltantes.map(f=>`<li style="margin-bottom:4px;"><button type="button" class="link-btn" onclick="irACampoPerfil('${f.anchor}')">${esc(f.label)}</button></li>`).join('')}
      </ul>
    </div>`;

  document.getElementById('work-perfil').innerHTML = `
    ${completitudHTML}
    <div class="card" style="max-width:520px; margin-bottom:16px;">
      <h3 style="font-size:15px; margin-bottom:14px;">Foto de perfil</h3>
      <div style="display:flex; align-items:center; gap:14px;">
        ${avatarHTML(u.nombre, u.foto_url)}
        <div>
          <input type="file" id="wp-foto-input" accept="image/*" class="hidden" onchange="subirFotoPerfil()">
          <button type="button" id="wp-foto-btn" class="btn btn-outline" onclick="document.getElementById('wp-foto-input').click()">Cambiar foto</button>
          <div id="wp-foto-msg" role="status" aria-live="polite" style="margin-top:8px;"></div>
        </div>
      </div>
    </div>
    <div class="card" style="max-width:520px; margin-bottom:16px;">
      <h3 style="font-size:15px; margin-bottom:6px;">Galería de trabajos</h3>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:12px;">Subí fotos de trabajos anteriores para que los clientes vean tu trabajo antes de contratarte.</p>
      <div class="galeria-grid">${(u.galeria_fotos||[]).map((url,i)=>`<div class="galeria-item"><img src="${esc(url)}" alt=""><button type="button" class="galeria-del" onclick="eliminarFotoGaleria(${i})" aria-label="Eliminar foto">✕</button></div>`).join('')}</div>
      <input type="file" id="wp-galeria-input" accept="image/*" class="hidden" onchange="subirFotoGaleria()">
      <button type="button" id="wp-galeria-btn" class="btn btn-outline" style="margin-top:10px;" onclick="document.getElementById('wp-galeria-input').click()">+ Agregar foto</button>
      <div id="wp-galeria-msg" role="status" aria-live="polite" style="margin-top:8px;"></div>
    </div>
    <div class="card" style="max-width:520px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:15px;">Editar perfil profesional</h3>
        ${verifBadge}
      </div>
      ${u.verificacion_rechazada && u.verificacion_motivo_rechazo ? `<div class="msg err" style="margin-bottom:12px;">Tu verificación fue rechazada: ${esc(u.verificacion_motivo_rechazo)}. Corregí el documento y volvé a intentarlo.</div>` : ''}
      <div id="verif-panel" class="hidden" style="margin-bottom:16px; padding:14px; border:1.5px dashed var(--line); border-radius:12px;">
        <label for="wp-doc-tipo" style="font-size:11px; font-family:'IBM Plex Mono'; letter-spacing:0.05em; text-transform:uppercase; color:var(--ink-soft); display:block; margin-bottom:8px;">Tipo de documento</label>
        <select id="wp-doc-tipo" style="margin-bottom:12px;">
          <option value="cedula">Cédula de ciudadanía</option>
          <option value="rut">RUT / registro de cámara de comercio</option>
          <option value="certificado">Certificado de estudios u oficio</option>
        </select>
        <label for="wp-doc-input" style="font-size:11px; font-family:'IBM Plex Mono'; letter-spacing:0.05em; text-transform:uppercase; color:var(--ink-soft); display:block; margin-bottom:8px;">Documento (foto o PDF)</label>
        <input type="file" id="wp-doc-input" accept="image/*,application/pdf">
        <button type="button" class="btn btn-primary" style="margin-top:10px;" onclick="solicitarVerificacion(this)">Enviar solicitud</button>
        <div id="wp-verif-msg" role="status" aria-live="polite" style="margin-top:8px;"></div>
      </div>
      <div class="field"><label for="wp-cat">Categoría</label>
        <select id="wp-cat" onchange="renderSugerenciasServicios()">${CATS.map(c=>`<option ${c.n===u.categoria?'selected':''}>${c.n}</option>`).join('')}</select>
      </div>
      <div class="field"><label for="wp-zona">Zona</label><input id="wp-zona" value="${esc(u.zona)}"></div>
      <div class="field">
        <button type="button" class="btn ${u.disponible_ahora?'btn-primary':'btn-outline'}" onclick="toggleDisponibleAhora()">${ICONO_DISPONIBLE}${u.disponible_ahora ? 'Disponible ahora (tocá para desactivar)' : 'Marcarme disponible ahora'}</button>
        <p style="font-size:11.5px; color:var(--ink-soft); margin-top:6px;">Activalo para que los clientes vean que podés atender pedidos urgentes hoy mismo. Acordate de desactivarlo cuando ya no puedas.</p>
      </div>
      <div class="field">
        <button type="button" class="btn btn-outline" id="btn-wp-ubicacion" onclick="usarMiUbicacionComoTrabajador()">${ICONO_UBICACION}${u.lat!=null ? 'Actualizar mi ubicación' : 'Usar mi ubicación actual'}</button>
        <p style="font-size:11.5px; color:var(--ink-soft); margin-top:6px;">
          ${u.lat!=null ? 'Ya estás usando tu ubicación real (con un pequeño margen, no tu dirección exacta) para que los clientes te encuentren mejor por cercanía.' : 'Además de la zona, podés compartir tu ubicación real para aparecer más preciso en "cerca de mí" — se guarda con un margen de seguridad, nunca tu dirección exacta.'}
        </p>
        <div id="wp-ubicacion-msg" role="status" aria-live="polite" style="margin-top:6px;"></div>
      </div>
      <div class="field"><label for="wp-exp">Años de experiencia</label><input type="number" id="wp-exp" min="0" value="${u.experiencia}"></div>
      <div class="field"><label for="wp-tarifa">Tarifa desde (COP)</label><input type="number" id="wp-tarifa" min="0" value="${u.tarifa}"></div>
      <div class="field"><label for="wp-tarifa-urgente">Recargo por urgencia (COP, opcional)</label><input type="number" id="wp-tarifa-urgente" min="0" value="${u.tarifa_urgente||''}" placeholder="Ej. 15000"></div>
      <div class="field"><label for="wp-radio-cobertura">Radio máximo de desplazamiento (km, opcional)</label><input type="number" id="wp-radio-cobertura" min="0" value="${u.radio_cobertura_km||''}" placeholder="Ej. 10"></div>
      <div class="field"><label for="wp-servicios">Servicios (separados por coma)</label><input id="wp-servicios" value="${esc(u.servicios.join(', '))}">
        <div id="wp-servicios-sugeridas" class="chipbar" style="margin-top:8px;"></div>
      </div>
      <div class="field"><label for="wp-celular">Celular (opcional, para avisos por WhatsApp)</label><input type="tel" id="wp-celular" value="${esc(u.celular||'')}" placeholder="Ej. 3001234567"></div>
      <div class="field"><label for="wp-datos-pago">Cómo te pagan tus clientes</label>
        <textarea id="wp-datos-pago" rows="2" placeholder="Ej: Nequi 300 123 4567, a nombre de Andrés Pineda" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:8px;font-family:inherit;font-size:13px;">${esc(u.datos_pago_texto||'')}</textarea>
        <p style="font-size:11.5px; color:var(--ink-soft); margin-top:6px;">Se les muestra a tus clientes cuando declaran que ya te pagaron. Nequi, Daviplata, cuenta bancaria — lo que prefieras.</p>
      </div>
      <div class="field"><label>Disponibilidad semanal</label>
        <div id="wp-disponibilidad" class="disp-grid">${disponibilidadGridHTML()}</div>
      </div>
      <button class="btn btn-primary" onclick="guardarPerfilTrabajador(this)">Guardar cambios</button>
      <div id="wp-msg" role="status" aria-live="polite"></div>
    </div>
    <div class="card" style="max-width:520px; margin-top:16px;">
      <h3 style="font-size:15px; margin-bottom:14px;">Reseñas de clientes</h3>
      ${misResenas.length ? misResenas.map(r=>`
        <div class="review">
          <div class="stars">${'★'.repeat(r.estrellas)}${'☆'.repeat(5-r.estrellas)}</div>
          <p>${esc(r.comentario)}</p>
          ${r.fotos && r.fotos.length ? `<div class="galeria-grid" style="max-width:280px;">${r.fotos.map(url=>`<div class="galeria-item"><img src="${esc(url)}" alt=""></div>`).join('')}</div>` : ''}
          <div class="who">— ${esc(r.cliente)}</div>
          ${r.respuesta_trabajador
            ? `<div class="resena-respuesta"><b>Tu respuesta:</b> ${esc(r.respuesta_trabajador)}</div>`
            : `<button type="button" class="btn btn-outline" style="font-size:12px;padding:6px 10px;margin-top:8px;" onclick="mostrarFormularioRespuesta(${r.id})">Responder</button>
               <div id="respuesta-form-${r.id}" class="hidden" style="margin-top:8px;">
                 <textarea id="respuesta-texto-${r.id}" rows="2" placeholder="Escribe tu respuesta..." style="width:100%;padding:8px;border:1.5px solid var(--line);border-radius:8px;font-family:inherit;font-size:12.5px;"></textarea>
                 <button type="button" class="btn btn-primary" style="font-size:12px;padding:6px 10px;margin-top:6px;" onclick="enviarRespuestaResena(${r.id}, this)">Enviar respuesta</button>
               </div>`}
        </div>`).join('') : `<p style="font-size:13px;color:var(--ink-soft);">Todavía no tienes reseñas.</p>`}
    </div>`;
  renderSugerenciasServicios();
}

// Pura y testeable: no toca el DOM, solo evalúa el perfil recibido. `anchor`
// es el id del elemento al que hay que llevar al trabajador para completar
// ese punto (ver irACampoPerfil).
function calcularCompletitudPerfil(w){
  if(!w) return { porcentaje: 0, faltantes: [] };
  const items = [
    { ok: !!w.foto_url, label: 'Subí una foto de perfil', anchor: 'wp-foto-btn' },
    { ok: !!(w.galeria_fotos && w.galeria_fotos.length), label: 'Agregá al menos una foto de trabajos anteriores', anchor: 'wp-galeria-btn' },
    { ok: !!(w.servicios && w.servicios.length), label: 'Contá qué servicios ofrecés', anchor: 'wp-servicios' },
    { ok: !!(w.zona && w.zona !== 'Sin definir'), label: 'Indicá la zona donde trabajás', anchor: 'wp-zona' },
    { ok: Object.values(w.disponibilidad || {}).some(horas => Array.isArray(horas) && horas.length > 0), label: 'Configurá tu disponibilidad semanal', anchor: 'wp-disponibilidad' },
    { ok: !!(w.verificado || w.verificacionPendiente), label: 'Solicitá la verificación de tu identidad', anchor: 'wp-verif-btn' },
  ];
  const completos = items.filter(i => i.ok).length;
  return {
    porcentaje: Math.round((completos / items.length) * 100),
    faltantes: items.filter(i => !i.ok),
  };
}
function irACampoPerfil(anchorId){
  const el = document.getElementById(anchorId);
  if(!el) return;
  el.scrollIntoView({ behavior:'smooth', block:'center' });
  if(typeof el.focus === 'function') el.focus();
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
// Sugerencias rápidas de "servicios" según la categoría elegida (ver
// SERVICIOS_SUGERIDOS): solo texto libre que se agrega al campo, no una
// lista cerrada — el trabajador puede seguir escribiendo lo que quiera.
function renderSugerenciasServicios(){
  const cont = document.getElementById('wp-servicios-sugeridas');
  const catSel = document.getElementById('wp-cat');
  const servInput = document.getElementById('wp-servicios');
  if(!cont || !catSel || !servInput) return;
  const actuales = servInput.value.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  const sugeridas = (SERVICIOS_SUGERIDOS[catSel.value] || []).filter(s=>!actuales.includes(s.toLowerCase()));
  cont.innerHTML = sugeridas.length
    ? `<span style="font-size:11.5px;color:var(--ink-soft);width:100%;margin-bottom:2px;">Sugerencias para ${esc(catSel.value)}, tocá para agregar:</span>
       ${sugeridas.map(s=>`<button type="button" class="chipbtn sm" onclick="agregarServicioSugerido('${esc(s).replace(/'/g,"\\'")}')">+ ${esc(s)}</button>`).join('')}`
    : '';
}
function agregarServicioSugerido(tag){
  const servInput = document.getElementById('wp-servicios');
  if(!servInput) return;
  const actuales = servInput.value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!actuales.some(s=>s.toLowerCase()===tag.toLowerCase())) actuales.push(tag);
  servInput.value = actuales.join(', ');
  renderSugerenciasServicios();
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
async function solicitarVerificacion(btn){
  const u = currentUser();
  const input = document.getElementById('wp-doc-input');
  const tipoSel = document.getElementById('wp-doc-tipo');
  const msgEl = document.getElementById('wp-verif-msg');
  const file = input && input.files[0];
  if(!file){
    if(msgEl) msgEl.innerHTML = `<div class="msg err">Adjunta un documento antes de enviar la solicitud.</div>`;
    return;
  }
  await conCargando(btn, 'Enviando...', async () => {
    const ext = file.name.split('.').pop();
    const path = `${u.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from('verificaciones').upload(path, file, { upsert: true });
    if(upErr){
      if(msgEl) msgEl.innerHTML = `<div class="msg err">No se pudo subir el documento: ${esc(upErr.message)}</div>`;
      return;
    }
    const tipoDoc = tipoSel ? tipoSel.value : null;
    const historial = [...(u.verificacion_historial || []), { fecha: new Date().toISOString(), accion: 'solicitada', tipo_doc: tipoDoc }];
    await sb.from('profiles').update({
      verificacion_pendiente: true,
      verificacion_doc_path: path,
      verificacion_tipo_doc: tipoDoc,
      verificacion_rechazada: false,
      verificacion_motivo_rechazo: null,
      verificacion_historial: historial,
    }).eq('id', u.id);
    invalidarPerfil(u.id);
    renderTrabajo();
  });
}
async function subirFotoGaleria(){
  const u = currentUser();
  const input = document.getElementById('wp-galeria-input');
  const file = input && input.files[0];
  const msgEl = document.getElementById('wp-galeria-msg');
  if(!file) return;
  if(!file.type.startsWith('image/')){
    if(msgEl) msgEl.innerHTML = `<div class="msg err">Elegí un archivo de imagen.</div>`;
    return;
  }
  const ext = file.name.split('.').pop();
  const path = `${u.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from('portafolio').upload(path, file);
  if(upErr){
    if(msgEl) msgEl.innerHTML = `<div class="msg err">No se pudo subir la foto: ${esc(upErr.message)}</div>`;
    return;
  }
  const { data: pub } = sb.storage.from('portafolio').getPublicUrl(path);
  const nuevaGaleria = [...(u.galeria_fotos||[]), pub.publicUrl];
  await sb.from('profiles').update({ galeria_fotos: nuevaGaleria }).eq('id', u.id);
  u.galeria_fotos = nuevaGaleria;
  invalidarPerfil(u.id);
  input.value = '';
  renderTrabajo();
}
async function eliminarFotoGaleria(index){
  const u = currentUser();
  const nuevaGaleria = (u.galeria_fotos||[]).slice();
  nuevaGaleria.splice(index, 1);
  await sb.from('profiles').update({ galeria_fotos: nuevaGaleria }).eq('id', u.id);
  u.galeria_fotos = nuevaGaleria;
  invalidarPerfil(u.id);
  renderTrabajo();
}
function mostrarFormularioRespuesta(resenaId){
  const el = document.getElementById(`respuesta-form-${resenaId}`);
  if(el) el.classList.toggle('hidden');
}
async function enviarRespuestaResena(resenaId, btn){
  const texto = document.getElementById(`respuesta-texto-${resenaId}`).value.trim();
  if(!texto) return;
  await conCargando(btn, 'Enviando...', async () => {
    const { error } = await sb.from('resenas').update({
      respuesta_trabajador: texto, respuesta_fecha: new Date().toISOString()
    }).eq('id', resenaId);
    if(error){ mostrarToast('No se pudo enviar la respuesta.', 'err'); return; }
    invalidarPerfil(currentUser().id);
    mostrarToast('Respuesta enviada.', 'ok');
    renderTrabajo();
  });
}
async function eliminarResena(resenaId, workerId, btn){
  if(!await confirmarModal('¿Eliminar esta reseña? Esta acción no se puede deshacer.', {titulo:'Eliminar reseña', textoConfirmar:'Sí, eliminar'})) return;
  await conCargando(btn, 'Eliminando...', async () => {
    const { error } = await sb.from('resenas').delete().eq('id', resenaId);
    if(error){ mostrarToast('No se pudo eliminar la reseña.', 'err'); return; }
    invalidarPerfil(workerId);
    mostrarToast('Reseña eliminada.', 'ok');
    verPerfil(workerId);
  });
}
async function responderCita(id, estado, btn){
  await conCargando(btn, estado==='aceptada' ? 'Aceptando...' : 'Rechazando...', async () => {
    const { data: citaRaw } = await sb.from('citas').update({ estado }).eq('id', id).select().single();
    const c = normalizarCita(citaRaw);
    if(c){
      const [cliente, w] = await Promise.all([obtenerPerfil(c.clienteId), obtenerPerfil(c.trabajadorId)]);
      if(cliente && w) addNotificacion(cliente.id, `${w.nombre} ${estado==='aceptada'?'aceptó':'rechazó'} tu cita del ${c.fecha}.`);
    }
    mostrarToast(estado==='aceptada' ? 'Cita aceptada.' : 'Cita rechazada.', 'ok');
    renderTrabajo();
  });
}
async function cancelarCitaTrabajador(id, btn){
  const motivo = await pedirTextoModal('¿Por qué cancelás? (opcional). Se le avisará al cliente.', {titulo:'Cancelar cita ya aceptada', textoConfirmar:'Sí, cancelar', placeholder:'Opcional'});
  if(motivo === null) return; // cerró el modal sin confirmar
  await conCargando(btn, 'Cancelando...', async () => {
    const { data: citaRaw } = await sb.from('citas').update({ estado:'cancelada', motivo_cancelacion: motivo.trim() || null, cancelada_por: sessionUserId }).eq('id', id).select().single();
    const c = normalizarCita(citaRaw);
    if(c){
      const [cliente, w] = await Promise.all([obtenerPerfil(c.clienteId), obtenerPerfil(c.trabajadorId)]);
      if(cliente && w) addNotificacion(cliente.id, `${w.nombre} canceló tu cita del ${c.fecha}.${motivo.trim() ? ' Motivo: '+motivo.trim() : ''}`);
    }
    mostrarToast('Cita cancelada.', 'ok');
    renderTrabajo();
  });
}
function avisarEnCamino(citaId, btn){
  if(!navigator.geolocation){ mostrarToast('Tu navegador no soporta ubicación.', 'err'); return; }
  const textoOriginal = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = 'Ubicando...'; }
  navigator.geolocation.getCurrentPosition(
    async pos=>{
      if(btn) btn.textContent = 'Avisando...';
      const { data: citaRaw, error } = await sb.from('citas').update({
        en_camino: true, en_camino_lat: pos.coords.latitude, en_camino_lng: pos.coords.longitude
      }).eq('id', citaId).select().single();
      if(error){
        if(btn){ btn.disabled = false; btn.textContent = textoOriginal; }
        mostrarToast('No se pudo avisar. Intenta de nuevo.', 'err');
        return;
      }
      const c = normalizarCita(citaRaw);
      addNotificacion(c.clienteId, `Tu trabajador va en camino para la cita del ${c.fecha} a las ${c.hora}.`);
      mostrarToast('Avisamos al cliente que vas en camino.', 'ok');
      renderTrabajo();
    },
    ()=>{
      if(btn){ btn.disabled = false; btn.textContent = textoOriginal; }
      mostrarToast('No pudimos acceder a tu ubicación. Revisa los permisos del navegador.', 'err');
    }
  );
}
async function guardarPerfilTrabajador(btn){
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
  u.tarifa_urgente = document.getElementById('wp-tarifa-urgente').value ? Math.max(0, Number(document.getElementById('wp-tarifa-urgente').value)) : null;
  u.radio_cobertura_km = document.getElementById('wp-radio-cobertura').value ? Math.max(0, Number(document.getElementById('wp-radio-cobertura').value)) : null;
  u.servicios = document.getElementById('wp-servicios').value.split(',').map(s=>s.trim()).filter(Boolean);
  u.datos_pago_texto = document.getElementById('wp-datos-pago').value.trim() || null;
  u.celular = document.getElementById('wp-celular').value.trim() || null;
  u.disponibilidad = state.wpDisponibilidad;
  await conCargando(btn, 'Guardando...', async () => {
    const { error } = await sb.from('profiles').update({
      categoria: u.categoria, zona: u.zona, experiencia: u.experiencia,
      tarifa: u.tarifa, tarifa_urgente: u.tarifa_urgente, radio_cobertura_km: u.radio_cobertura_km,
      servicios: u.servicios, disponibilidad: u.disponibilidad, datos_pago_texto: u.datos_pago_texto,
      celular: u.celular
    }).eq('id', u.id);
    if(error){
      document.getElementById('wp-msg').innerHTML = `<div class="msg err" style="margin-top:12px;">No se pudo guardar: ${esc(error.message)}</div>`;
      return;
    }
    invalidarPerfil(u.id);
    document.getElementById('wp-msg').innerHTML = `<div class="msg ok" style="margin-top:12px;">Perfil actualizado.</div>`;
  });
}

/* ---------------- PANEL ADMIN ---------------- */
function switchAdminTab(tab){
  document.getElementById('atab-usuarios').classList.toggle('on', tab==='usuarios');
  document.getElementById('atab-reportes').classList.toggle('on', tab==='reportes');
  document.getElementById('atab-pqr').classList.toggle('on', tab==='pqr');
  document.getElementById('atab-estadisticas').classList.toggle('on', tab==='estadisticas');
  document.getElementById('admin-usuarios').classList.toggle('hidden', tab!=='usuarios');
  document.getElementById('admin-reportes').classList.toggle('hidden', tab!=='reportes');
  document.getElementById('admin-pqr').classList.toggle('hidden', tab!=='pqr');
  document.getElementById('admin-estadisticas').classList.toggle('hidden', tab!=='estadisticas');
  if(tab==='pqr') renderPQRAdmin();
  if(tab==='estadisticas') renderEstadisticas();
}
async function renderAdmin(){
  const u = currentUser();
  if(!u || u.tipo!=='admin'){ document.getElementById('admin-usuarios').innerHTML = `<div class="empty-note">Solo el administrador puede ver este panel.</div>`; return; }
  document.getElementById('admin-usuarios').innerHTML = `<div class="empty-note">Cargando...</div>`;

  const { data: todos, error } = await sb.from('profiles').select('*').neq('tipo','admin');
  const others = error ? [] : todos.map(normalizarPerfil);
  const trabajadores = others.filter(x=>x.tipo==='trabajador');
  const pendientesVerif = trabajadores.filter(x=>x.verificacionPendiente && !x.verificado).length;
  const { data: reportesData } = await sb.from('reportes').select('*').order('created_at', {ascending:false});
  const reportes = (reportesData||[]).map(r=>({ ...r, deNombre: r.de_nombre, citaId: r.cita_id }));
  const reportesAbiertos = reportes.filter(r=>r.estado==='abierto').length;
  const { data: todasCitas } = await sb.from('citas').select('cliente_id, trabajador_id, estado, cancelada_por');
  const citasPendientes = (todasCitas||[]).filter(c=>c.estado==='pendiente').length;

  // Cancelaciones por usuario: cuenta quién apretó "cancelar" (cancelada_por),
  // no solo quién participó en la cita.
  const cancelacionesPorUsuario = new Map();
  (todasCitas||[]).forEach(c=>{
    if(c.estado==='cancelada' && c.cancelada_por) cancelacionesPorUsuario.set(c.cancelada_por, (cancelacionesPorUsuario.get(c.cancelada_por)||0) + 1);
  });
  // Reportes por usuario: el esquema no distingue de qué lado de la cita es la
  // falta (reportes.de_nombre es solo texto), así que esto es una aproximación:
  // cuenta reportes en citas donde el usuario participó, como cliente o trabajador.
  const citasDeReportes = await Promise.all(reportes.map(async r=>{
    const { data } = await sb.from('citas').select('*').eq('id', r.citaId).single();
    return normalizarCita(data);
  }));
  const reportesPorUsuario = new Map();
  citasDeReportes.forEach(c=>{
    if(!c) return;
    [c.clienteId, c.trabajadorId].forEach(id=>{ if(id) reportesPorUsuario.set(id, (reportesPorUsuario.get(id)||0) + 1); });
  });

  document.getElementById('admin-usuarios').innerHTML = `
    <div class="admin-summary">
      <div class="admin-stat"><span>Usuarios</span><b>${others.length}</b><small>${trabajadores.length} trabajadores</small></div>
      <div class="admin-stat"><span>Verificaciones</span><b>${pendientesVerif}</b><small>Pendientes de revisión</small></div>
      <div class="admin-stat"><span>Citas</span><b>${(todasCitas||[]).length}</b><small>${citasPendientes} por responder</small></div>
      <div class="admin-stat"><span>Reportes</span><b>${reportesAbiertos}</b><small>Abiertos</small></div>
    </div>
    <table><thead><tr><th>Nombre</th><th>Tipo</th><th>Correo</th><th>Estado</th><th>Verificación</th><th>Historial</th><th>Acción</th></tr></thead><tbody>
    ${others.map(x=>{
      let verifCell = '—';
      if(x.tipo==='trabajador'){
        const verDoc = x.verificacionPendiente && x.verificacion_doc_path
          ? `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;margin-right:6px;" onclick="verDocumentoVerificacion('${esc(x.verificacion_doc_path)}')">Ver documento</button>` : '';
        const historial = x.verificacion_historial || [];
        const historialTitle = historial.length
          ? historial.map(h=>`${h.fecha ? new Date(h.fecha).toLocaleDateString() : '?'}: ${h.accion}${h.motivo ? ' — '+h.motivo : ''}`).join(' | ')
          : '';
        const historialIcono = historialTitle ? ` <span title="${esc(historialTitle)}" style="cursor:help;">🕘</span>` : '';
        verifCell = x.verificado ? `<span class="verif-badge">✓ Verificado</span>${historialIcono}`
          : x.verificacionPendiente ? `${verDoc}<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;margin-right:6px;" onclick="verificarTrabajador('${x.id}', this)">Verificar</button><button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="rechazarVerificacion('${x.id}', this)">Rechazar</button>${historialIcono}`
          : x.verificacion_rechazada ? `<span class="status-pill status-rechazada" title="${esc(x.verificacion_motivo_rechazo||'')}">Rechazada</span>${historialIcono}`
          : `<span class="status-pill status-bloqueado">Sin solicitar</span>`;
      }
      const nCancel = cancelacionesPorUsuario.get(x.id) || 0;
      const nRep = reportesPorUsuario.get(x.id) || 0;
      const llamaAtencion = nCancel >= 3 || nRep >= 2;
      const historialCell = `<span${llamaAtencion ? ' class="status-pill status-rechazada"' : ''} title="Reportes: cuenta citas con reporte donde participó, no distingue de qué lado es la falta.">${nCancel} canceladas · ${nRep} reportes</span>`;
      return `<tr><td>${esc(x.nombre)}</td><td>${x.tipo}</td><td>${esc(x.correo)}</td>
      <td><span class="status-pill status-${x.estado}">${x.estado}</span></td>
      <td>${verifCell}</td>
      <td>${historialCell}</td>
      <td><button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="toggleEstadoUsuario('${x.id}', this)">${x.estado==='activo'?'Bloquear':'Activar'}</button></td></tr>`;
    }).join('')}
    </tbody></table>`;

  const trabajadoresDeReportes = await obtenerPerfiles(citasDeReportes.filter(Boolean).map(c=>c.trabajadorId));
  const trabajadorPorId = new Map(trabajadoresDeReportes.map(w=>[w && w.id, w]));
  document.getElementById('admin-reportes').innerHTML = reportes.length ? `
    <table><thead><tr><th>De</th><th>Cita</th><th>Motivo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
    ${reportes.map((r,i)=>{
      const cita = citasDeReportes[i];
      const trabajador = cita && trabajadorPorId.get(cita.trabajadorId);
      const citaCell = cita ? `${esc(trabajador?trabajador.nombre:'—')}<br><span class="mono" style="font-size:11px;color:var(--ink-soft);">${esc(cita.fecha)} · ${esc(cita.hora)}</span>` : '—';
      return `<tr><td>${esc(r.deNombre)}</td><td>${citaCell}</td><td>${esc(r.motivo)}</td><td><span class="status-pill status-${r.estado}">${r.estado}</span></td>
      <td>${r.estado==='abierto'?`<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="resolverReporte('${r.id}', this)">Marcar resuelto</button>`:'—'}</td></tr>`;
    }).join('')}
    </tbody></table>` : `<div class="empty-note">No hay reportes registrados.</div>`;
}
async function toggleEstadoUsuario(id, btn){
  const u = await obtenerPerfil(id);
  if(!u) return;
  await conCargando(btn, 'Guardando...', async () => {
    const nuevoEstado = u.estado==='activo' ? 'bloqueado' : 'activo';
    await sb.from('profiles').update({ estado: nuevoEstado }).eq('id', id);
    invalidarPerfil(id);
    renderAdmin();
  });
}
async function verDocumentoVerificacion(path){
  // Abrir la ventana antes de esperar la URL firmada, para que el navegador no la bloquee.
  const win = window.open('', '_blank');
  const { data, error } = await sb.storage.from('verificaciones').createSignedUrl(path, 60);
  if(error || !data){ win.close(); mostrarToast('No se pudo abrir el documento.', 'err'); return; }
  win.location.href = data.signedUrl;
}
async function verificarTrabajador(id, btn){
  const u = await obtenerPerfil(id);
  if(!u) return;
  await conCargando(btn, 'Verificando...', async () => {
    const historial = [...(u.verificacion_historial || []), { fecha: new Date().toISOString(), accion: 'aprobada' }];
    await sb.from('profiles').update({
      verificado: true,
      verificacion_pendiente: false,
      verificacion_rechazada: false,
      verificacion_motivo_rechazo: null,
      verificacion_historial: historial,
    }).eq('id', id);
    invalidarPerfil(id);
    addNotificacion(u.id, 'Tu perfil fue verificado por el administrador. Ya se muestra el distintivo ✓ Verificado.');
    mostrarToast(`${u.nombre.split(' ')[0]} fue verificado.`, 'ok');
    renderAdmin();
  });
}
async function rechazarVerificacion(id, btn){
  const u = await obtenerPerfil(id);
  if(!u) return;
  const motivo = await pedirTextoModal('¿Por qué se rechaza la verificación? El trabajador va a ver este motivo.', {titulo:'Rechazar verificación', textoConfirmar:'Rechazar', placeholder:'Motivo del rechazo'});
  if(motivo === null) return; // canceló el modal
  if(!motivo.trim()){ mostrarToast('Escribí un motivo para rechazar.', 'err'); return; }
  await conCargando(btn, 'Rechazando...', async () => {
    const historial = [...(u.verificacion_historial || []), { fecha: new Date().toISOString(), accion: 'rechazada', motivo: motivo.trim() }];
    await sb.from('profiles').update({
      verificado: false,
      verificacion_pendiente: false,
      verificacion_rechazada: true,
      verificacion_motivo_rechazo: motivo.trim(),
      verificacion_historial: historial,
    }).eq('id', id);
    invalidarPerfil(id);
    addNotificacion(u.id, `Tu verificación fue rechazada: ${motivo.trim()}. Podés corregir el documento y volver a solicitarla desde tu perfil.`);
    mostrarToast(`Verificación de ${u.nombre.split(' ')[0]} rechazada.`, 'ok');
    renderAdmin();
  });
}
async function resolverReporte(id, btn){
  await conCargando(btn, 'Guardando...', async () => {
    await sb.from('reportes').update({ estado: 'resuelto' }).eq('id', id);
    renderAdmin();
  });
}

async function renderPQRAdmin(){
  const box = document.getElementById('admin-pqr');
  const u = currentUser();
  if(!u || u.tipo!=='admin'){ box.innerHTML = `<div class="empty-note">Solo el administrador puede ver este panel.</div>`; return; }
  box.innerHTML = `<div class="empty-note">Cargando...</div>`;
  const { data, error } = await sb.from('pqr').select('*').order('created_at', {ascending:false});
  const solicitudes = error ? [] : data;
  const usuarios = await obtenerPerfiles(solicitudes.map(p=>p.user_id));
  const usuarioPorId = new Map(usuarios.map(x=>[x && x.id, x]));
  box.innerHTML = solicitudes.length ? `
    <table><thead><tr><th>Usuario</th><th>Tipo</th><th>Asunto</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
    ${solicitudes.map(p=>{
      const persona = usuarioPorId.get(p.user_id);
      return `<tr><td>${persona?esc(persona.nombre):'—'}</td><td>${p.tipo}</td><td>${esc(p.asunto)}</td>
      <td><span class="status-pill status-${p.estado==='respondido'?'activo':'pendiente'}">${p.estado}</span></td>
      <td>${p.estado!=='respondido' ? `<button class="btn btn-outline" style="font-size:12px;padding:6px 10px;" onclick="responderPQR('${p.id}', this)">Responder</button>` : '—'}</td></tr>`;
    }).join('')}
    </tbody></table>` : `<div class="empty-note">No hay peticiones, quejas ni reclamos.</div>`;
}
async function responderPQR(id, btn){
  const respuesta = await pedirTextoModal('Escribí la respuesta para el usuario:', {titulo:'Responder PQR', textoConfirmar:'Enviar respuesta'});
  if(respuesta === null) return; // canceló el modal
  if(!respuesta.trim()){ mostrarToast('Escribí una respuesta.', 'err'); return; }
  await conCargando(btn, 'Enviando...', async () => {
    const { data, error } = await sb.from('pqr')
      .update({ estado: 'respondido', respuesta: respuesta.trim(), respuesta_fecha: new Date().toISOString() })
      .eq('id', id).select('user_id, asunto').single();
    if(error){ mostrarToast('No se pudo enviar la respuesta.', 'err'); return; }
    if(data) addNotificacion(data.user_id, `Respondimos tu solicitud "${data.asunto}". Revisala en PQR.`);
    mostrarToast('Respuesta enviada.', 'ok');
    renderPQRAdmin();
  });
}

async function renderEstadisticas(){
  const box = document.getElementById('admin-estadisticas');
  box.innerHTML = `<div class="empty-note">Cargando...</div>`;
  const [trabajadores, { data: todasCitas }] = await Promise.all([
    cargarTrabajadores(),
    sb.from('citas').select('trabajador_id, cliente_id, monto, pago, estado')
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

  // Ingresos por categoría: solo citas ya pagadas (monto real cobrado, no estimado).
  const ingresosPorCategoria = {};
  citas.forEach(c=>{
    if(c.pago !== 'pagado' || !c.monto) return;
    const w = trabajadorPorId.get(c.trabajador_id);
    if(!w) return;
    ingresosPorCategoria[w.categoria] = (ingresosPorCategoria[w.categoria]||0) + c.monto;
  });
  const maxIngresos = Math.max(1, ...Object.values(ingresosPorCategoria));

  // Calificación promedio por categoría, ponderada por reseña (no promedio de promedios,
  // para que un trabajador con una sola reseña de 5★ no pese igual que uno con 40 reseñas).
  const estrellasPorCategoria = {};
  trabajadores.forEach(w=>{
    (w.resenas||[]).forEach(r=>{
      const acc = estrellasPorCategoria[w.categoria] || { suma:0, n:0 };
      acc.suma += r.estrellas; acc.n += 1;
      estrellasPorCategoria[w.categoria] = acc;
    });
  });

  // Clientes recurrentes: los que ya completaron más de una cita.
  const completadasPorCliente = {};
  citas.forEach(c=>{
    if(c.estado !== 'completada') return;
    completadasPorCliente[c.cliente_id] = (completadasPorCliente[c.cliente_id]||0) + 1;
  });
  const clientesConCitas = Object.keys(completadasPorCliente).length;
  const clientesRecurrentes = Object.values(completadasPorCliente).filter(n=>n>1).length;

  // Trabajadores nuevos por mes (últimos 6 meses con altas), como proxy simple de crecimiento.
  const porMes = {};
  trabajadores.forEach(w=>{
    if(!w.created_at) return;
    const mes = w.created_at.slice(0,7);
    porMes[mes] = (porMes[mes]||0) + 1;
  });
  const mesesOrdenados = Object.keys(porMes).sort().slice(-6);
  const maxMes = Math.max(1, ...mesesOrdenados.map(m=>porMes[m]));

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
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:14px; margin-bottom:14px;">Trabajadores más solicitados</h3>
      ${citas.length ? topTrabajadores.map(t=>`
        <div class="stat-bar-row">
          <span class="stat-bar-label">${esc(t.w.nombre)}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(t.n/maxTop)*100}%; background:var(--orange);"></div></div>
          <span class="stat-bar-n">${t.n}</span>
        </div>`).join('') : `<div class="empty-note">Aún no hay citas registradas.</div>`}
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:14px; margin-bottom:14px;">Ingresos por categoría</h3>
      ${Object.keys(ingresosPorCategoria).length ? CATS.filter(c=>ingresosPorCategoria[c.n]).map(c=>`
        <div class="stat-bar-row">
          <span class="stat-bar-label">${c.n}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(ingresosPorCategoria[c.n]/maxIngresos)*100}%; background:var(--green);"></div></div>
          <span class="stat-bar-n" style="width:auto;">${fmtCOP(ingresosPorCategoria[c.n])}</span>
        </div>`).join('') : `<div class="empty-note">Todavía no hay citas pagadas.</div>`}
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:14px; margin-bottom:14px;">Calificación promedio por categoría</h3>
      ${Object.keys(estrellasPorCategoria).length ? CATS.filter(c=>estrellasPorCategoria[c.n]).map(c=>{
        const prom = estrellasPorCategoria[c.n].suma / estrellasPorCategoria[c.n].n;
        return `
        <div class="stat-bar-row">
          <span class="stat-bar-label">${c.n}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(prom/5)*100}%; background:var(--orange);"></div></div>
          <span class="stat-bar-n">★${prom.toFixed(1)}</span>
        </div>`;
      }).join('') : `<div class="empty-note">Todavía no hay reseñas.</div>`}
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:14px; margin-bottom:4px;">Clientes recurrentes</h3>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:14px;">Clientes con más de una cita completada.</p>
      ${clientesConCitas ? `
        <div class="stat-bar-row">
          <span class="stat-bar-label">Recurrentes</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(clientesRecurrentes/clientesConCitas)*100}%; background:var(--navy);"></div></div>
          <span class="stat-bar-n" style="width:auto;">${clientesRecurrentes}/${clientesConCitas}</span>
        </div>` : `<div class="empty-note">Todavía no hay citas completadas.</div>`}
    </div>
    <div class="card">
      <h3 style="font-size:14px; margin-bottom:14px;">Trabajadores nuevos por mes</h3>
      ${mesesOrdenados.length ? mesesOrdenados.map(m=>`
        <div class="stat-bar-row">
          <span class="stat-bar-label">${m}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(porMes[m]/maxMes)*100}%;"></div></div>
          <span class="stat-bar-n">${porMes[m]}</span>
        </div>`).join('') : `<div class="empty-note">Sin datos suficientes.</div>`}
    </div>`;
}

/* ---------------- INIT ---------------- */
(async function initApp(){
  applyTheme(loadTheme());
  // El enlace de recuperación de contraseña de Supabase redirige aquí mismo con
  // `type=recovery` en el hash; hay que mostrar el formulario de nueva contraseña
  // en vez de la ruta normal (y no tratar ese hash como una vista inválida).
  const esRecuperacion = /type=recovery/.test(location.hash);
  const { data: { session } } = await sb.auth.getSession();
  if(session){
    sessionUserId = session.user.id;
    await cargarPerfilActual();
    if(!esRecuperacion) suscribirNotificaciones(sessionUserId);
  }
  if(esRecuperacion){
    suprimirPush = true;
    nav('resetpass');
    suprimirPush = false;
    history.replaceState(null, '', '#/resetpass');
    return;
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
