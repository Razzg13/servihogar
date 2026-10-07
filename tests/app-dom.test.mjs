// Verificación de la app corriendo de verdad: carga index.html en el DOM mínimo
// (tests/dom-minimo.mjs), inyecta un doble de Supabase y ejecuta js/logica.js y
// js/app.js como lo haría el navegador. Después comprueba el HTML que la app
// genera y el estado interno.
//
//   node tests/app-dom.test.mjs
//
// Por qué así: en este entorno el sandbox bloquea los canales IPC de Chrome, así
// que no se puede abrir un navegador real. Esto no reemplaza una pasada visual
// por el sitio, pero sí detecta lo que un test unitario no ve: que la app
// arranque sin excepciones y que el render produzca las clases, atributos y
// textos que espera el CSS/la accesibilidad.
//
// Complementa a tests/logica.test.mjs (funciones puras) y usa el mismo runner
// casero porque `node --test` no puede lanzar su proceso hijo en este entorno.

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { crearDOM, crearVentana } from './dom-minimo.mjs';

const RAIZ = path.resolve(import.meta.dirname, '..');

/* ---------------- doble de Supabase ---------------- */
// Forma justa del cliente que usa js/app.js. Si la app empieza a usar un método
// nuevo, hay que agregarlo acá.
const PERFILES = [
  {
    id: 'w-plomeria', tipo: 'trabajador', estado: 'activo', nombre: 'Ana Gómez', correo: 'ana@correo.com',
    categoria: 'Plomería', zona: 'Centro', tarifa: 40000, tarifa_urgente: 15000, experiencia: 12,
    verificado: true, verificacion_pendiente: false, disponible_ahora: true, radio_cobertura_km: 12,
    lat: 4.4389, lng: -75.2003, servicios: ['Fugas de agua', 'Destape de tuberías'],
    galeria_fotos: ['img/icon-192.png'], foto_url: null, datos_pago_texto: 'Nequi 300 111 2233',
    created_at: '2026-05-02T10:00:00Z',
    resenas: Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, estrellas: 5, comentario: 'Muy bueno', cliente_nombre: 'Cliente ' + i, fotos: [], respuesta_trabajador: null })),
  },
  {
    id: 'w-limpieza', tipo: 'trabajador', estado: 'activo', nombre: 'Beto Ruiz', correo: 'beto@correo.com',
    categoria: 'Limpieza', zona: 'Norte', tarifa: 25000, tarifa_urgente: null, experiencia: 3,
    verificado: false, verificacion_pendiente: false, disponible_ahora: false, radio_cobertura_km: null,
    lat: null, lng: null, servicios: ['Limpieza profunda'], galeria_fotos: [], foto_url: null,
    created_at: '2026-07-11T10:00:00Z', resenas: [],
  },
  {
    id: 'w-jardin', tipo: 'trabajador', estado: 'activo', nombre: 'Carlos Pérez', correo: 'carlos@correo.com',
    categoria: 'Jardinería', zona: 'Ambalá', tarifa: 35000, tarifa_urgente: null, experiencia: 8,
    verificado: true, verificacion_pendiente: false, disponible_ahora: false, radio_cobertura_km: null,
    lat: null, lng: null, servicios: ['Poda de árboles', 'Mantenimiento de césped'],
    galeria_fotos: ['img/icon-192.png'], foto_url: null, datos_pago_texto: 'Nequi 300 999 8877',
    created_at: '2026-06-20T10:00:00Z',
    // Solo lunes y miércoles: el calendario tiene que bloquear el resto.
    disponibilidad: { L: ['8:00 am', '10:00 am', '1:00 pm'], M: [], X: ['8:00 am', '3:00 pm'], J: [], V: [], S: [], D: [] },
    resenas: [
      { id: 200, estrellas: 5, comentario: 'Excelente', cliente_nombre: 'Marta', fotos: [], respuesta_trabajador: null },
      { id: 201, estrellas: 4, comentario: 'Buen trabajo', cliente_nombre: 'Julián', fotos: [], respuesta_trabajador: null },
    ],
  },
  { id: 'c-uno', tipo: 'cliente', estado: 'activo', nombre: 'Camila Torres', correo: 'camila@correo.com', created_at: '2026-07-01T10:00:00Z' },
  {
    // Cuarto trabajador: la home muestra hasta 4 destacados, así el test cubre el
    // caso de la grilla completa (y este, con 1 sola reseña, queda último).
    id: 'w-electricidad', tipo: 'trabajador', estado: 'activo', nombre: 'Diego Mora', correo: 'diego@correo.com',
    categoria: 'Electricidad', zona: 'Sur', tarifa: 50000, tarifa_urgente: 20000, experiencia: 15,
    verificado: true, verificacion_pendiente: false, disponible_ahora: true, radio_cobertura_km: null,
    lat: null, lng: null, servicios: ['Cortocircuitos'], galeria_fotos: [], foto_url: null,
    created_at: '2026-08-01T10:00:00Z',
    resenas: [{ id: 300, estrellas: 4, comentario: 'Cumplido', cliente_nombre: 'Sara', fotos: [], respuesta_trabajador: null }],
  },
];

class Consulta {
  constructor(tablas, tabla) {
    this.tablas = tablas;
    this.tabla = tabla;
    this.filtros = [];
    this.orden = null;
    this.accion = 'select';
    this.cuerpo = null;
    this.una = false;
    this.talVez = false;
    this.cuenta = false;
    this.cabecera = false;
  }
  select(_cols, opts = {}) { if (opts && opts.count) this.cuenta = true; if (opts && opts.head) this.cabecera = true; return this; }
  eq(c, v) { this.filtros.push(r => String(r[c]) === String(v)); return this; }
  neq(c, v) { this.filtros.push(r => String(r[c]) !== String(v)); return this; }
  in(c, vs) { this.filtros.push(r => vs.map(String).includes(String(r[c]))); return this; }
  order(c, opts = {}) { this.orden = { c, asc: opts.ascending !== false }; return this; }
  limit(n) { this.limite = n; return this; }
  single() { this.una = true; return this; }
  maybeSingle() { this.una = true; this.talVez = true; return this; }
  insert(cuerpo) { this.accion = 'insert'; this.cuerpo = cuerpo; return this; }
  upsert(cuerpo) { this.accion = 'insert'; this.cuerpo = cuerpo; return this; }
  update(cuerpo) { this.accion = 'update'; this.cuerpo = cuerpo; return this; }
  delete() { this.accion = 'delete'; return this; }
  _filas() {
    const crudas = JSON.parse(JSON.stringify(this.tablas[this.tabla] || []));
    let filas = crudas.filter(r => this.filtros.every(f => f(r)));
    if (this.orden) {
      const { c, asc } = this.orden;
      filas.sort((a, b) => ((a[c] > b[c]) - (a[c] < b[c])) * (asc ? 1 : -1));
    }
    return this.limite ? filas.slice(0, this.limite) : filas;
  }
  _resolver() {
    if (this.accion !== 'select') {
      const fila = Array.isArray(this.cuerpo) ? this.cuerpo[0] : (this.cuerpo || {});
      const conId = { id: 'nuevo-id', ...fila };
      return { data: this.una ? conId : [conId], error: null };
    }
    if (this.cuenta && this.cabecera) return { count: this._filas().length, data: null, error: null };
    const filas = this._filas();
    if (this.una) return filas.length ? { data: filas[0], error: null } : { data: null, error: this.talVez ? null : { message: 'no encontrado' } };
    return { data: filas, error: null };
  }
  then(resolve, reject) { try { resolve(this._resolver()); } catch (e) { if (reject) reject(e); } }
}

function crearClienteSupabase(tablas) {
  const canal = () => { const c = { on: () => c, subscribe: () => c, unsubscribe: () => c }; return c; };
  return {
    from: tabla => new Consulta(tablas, tabla),
    auth: {
      // El test corre con una clienta logueada: así se recorren los caminos que
      // exigen sesión (agendar, mis citas, favoritos).
      getSession: async () => ({ data: { session: { user: { id: 'c-uno' } } }, error: null }),
      signInWithPassword: async () => ({ data: { user: { id: 'c-uno' } }, error: null }),
      signUp: async () => ({ data: { user: { id: 'nuevo' }, session: { user: { id: 'nuevo' } } }, error: null }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'img/icon-192.png' } }),
        createSignedUrl: async () => ({ data: { signedUrl: 'img/icon-192.png' }, error: null }),
      }),
    },
    functions: { invoke: async () => ({ data: null, error: null }) },
    channel: canal,
    removeChannel: () => {},
  };
}

/* ---------------- arranque de la app en el DOM mínimo ---------------- */
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const { document } = crearDOM(html);
const tablas = {
  profiles: PERFILES, profiles_publicos: PERFILES, notificaciones: [], citas: [], resenas: [],
  mensajes: [], conversaciones: [], reportes: [], pqr: [], listas_espera: [], push_subscriptions: [],
};
const ventana = crearVentana(document);
ventana.supabase = { createClient: () => crearClienteSupabase(tablas) };
// Doble de Leaflet: la app dibuja mapas en el perfil y en el buscador, y sin
// esto `verPerfil` cortaría con "L is not defined". Solo se implementa el
// encadenado que usa app.js.
const cadena = () => {
  const o = {
    setView: () => o, addTo: () => o, bindPopup: () => o, fitBounds: () => o,
    getBounds: () => o, invalidateSize: () => o, remove: () => o,
  };
  return o;
};
const leafletFalso = {
  map: () => cadena(),
  tileLayer: () => cadena(),
  marker: () => cadena(),
  circle: () => cadena(),
  divIcon: () => ({ html: '' }),
};

const registro = [];
// La app llama a log()/err() en algunos caminos (modo demo); el contexto los
// necesita definidos para que una llamada no corte la ejecución.
const contexto = vm.createContext({
  window: ventana, document, console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  log: (...a) => console.log(...a),
  err: (...a) => console.log(...a),
  fetch: () => Promise.reject(new Error('sin red en el test')),
  XMLHttpRequest: class {},
  URL: ventana.URL, Blob: ventana.Blob, FileReader: ventana.FileReader,
  Image: ventana.Image, Notification: ventana.Notification, navigator: ventana.navigator,
  location: ventana.location, history: ventana.history, localStorage: ventana.localStorage,
  test: (nombre, fn) => registro.push({ nombre, fn }),
});
// `L` (Leaflet) y `supabase` tienen que existir en el ámbito global, no solo
// colgando de window: app.js los usa como identificadores sueltos.
contexto.globalThis = contexto;
contexto.supabase = ventana.supabase;
contexto.L = leafletFalso;
// Los handlers inline (onclick="...") se compilan con el eval del contexto, para
// que vean las funciones globales de la app (setCatFiltro, seleccionarHora, etc.).
document._evaluar = cuerpo => vm.runInContext(cuerpo, contexto);
// Se cargan los scripts en el mismo orden que index.html: las constantes de
// supabase-config.js tienen que existir antes de que app.js las use.
for (const archivo of ['js/supabase-config.js', 'js/logica.js', 'js/app.js']) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, archivo), 'utf8'), contexto, { filename: archivo });
}
// `window.X` tiene que ver las globales del contexto (la app publica ahí varias).
for (const nombre of ['avg', 'insigniasTrabajador', 'calcularCompletitudPerfil', 'parseFechaHoraCita']) {
  ventana[nombre] = contexto[nombre];
}
const evalCtx = expr => vm.runInContext(expr, contexto);

/* ---------------- aserciones ---------------- */
const fallos = [];
function comprobar(nombre, condicion, detalle = '') {
  const ok = !!condicion;
  if (!ok) fallos.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`);
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}
const esperar = ms => new Promise(r => setTimeout(r, ms));
const q = expr => evalCtx(`(${expr})`);
const h = expr => evalCtx(`JSON.stringify(${expr})`);

/* ---------------- recorrido ---------------- */
console.log('--- Arranque ---');
await esperar(150); // deja correr el initApp() asíncrono y los render encadenados

comprobar('index.html carga en el DOM del test', !!document.getElementById('v-home'));
comprobar('La app queda inicializada (state accesible)', !!q('typeof state === "object" && state !== null'));
comprobar('No quedó ninguna vista en estado de error', !/No se pudo cargar/i.test(document.getElementById('home-workers').innerHTML));

console.log('\n--- Home: destacados y buscador en vivo ---');
const tarjetasHome = q(`document.querySelectorAll('#home-workers .pro-card').length`);
const primerNombre = q(`document.querySelector('#home-workers .pro-name').textContent.trim()`);
comprobar('La home muestra 4 profesionales destacados', tarjetasHome === 4, `${tarjetasHome} tarjetas`);
comprobar('Ordena por calificación (Ana, 12 reseñas de 5★, primera)', /Ana/.test(primerNombre), `primera: ${primerNombre}`);
comprobar('La home muestra 6 categorías + "Más"', q(`document.querySelectorAll('#home-cats .svc-card').length`) === 7);
comprobar('Los chips de categoría escapan bien las tildes', /Jardinería/.test(q(`document.querySelector('#home-cats .svc-card[data-cat="Jardinería"]').textContent`)));

evalCtx(`(()=>{const i=document.getElementById('home-search'); i.value='jardi'; buscarDesdeHomeEnVivo();})()`);
await esperar(400);
const trasFiltro = q(`document.querySelectorAll('#home-workers .pro-card').length`);
const filtrado = q(`document.querySelector('#home-workers .pro-name').textContent.trim()`);
comprobar('El buscador de la home filtra en vivo', trasFiltro === 1 && /Carlos/.test(filtrado), `${trasFiltro} tarjeta(s): ${filtrado}`);
comprobar('El término se copia al buscador completo', q(`document.getElementById('buscar-text').value`) === 'jardi');

evalCtx(`(()=>{const i=document.getElementById('home-search'); i.value='zzzz'; buscarDesdeHomeEnVivo();})()`);
await esperar(400);
const vacio = q(`document.querySelector('#home-workers .empty-note')?.textContent.trim() || ''`);
comprobar('Avisa cuando el filtro no devuelve nada', /Ningún profesional coincide/.test(vacio), vacio);
evalCtx(`(()=>{const i=document.getElementById('home-search'); i.value=''; buscarDesdeHomeEnVivo();})()`);
await esperar(400);

console.log('\n--- Buscar: resumen, filtros y escape de comillas ---');
evalCtx(`nav('buscar')`);
await esperar(120);
const resumen = q(`document.getElementById('buscar-summary').textContent.replace(/\\s+/g,' ').trim()`);
const detalleResumen = JSON.parse(h(`({
  total: state.resultadosBuscar.length,
  verificados: state.resultadosBuscar.map(w => w.nombre + ':' + w.verificado).join(','),
})`));
comprobar('El resumen cuenta los resultados', /4 resultados/.test(resumen) && /3 verificados/.test(resumen),
  `${resumen} | datos: ${detalleResumen.verificados}`);

evalCtx(`(()=>{const i=document.getElementById('buscar-text'); i.value='jardi'; renderBuscar();})()`);
await esperar(120);
const conFiltro = q(`document.getElementById('buscar-summary').textContent.replace(/\\s+/g,' ').trim()`);
comprobar('El resumen lista los filtros activos con su salida', /Filtros:/.test(conFiltro) && /Limpiar/.test(conFiltro), conFiltro);

evalCtx(`limpiarFiltrosBuscar()`);
await esperar(120);
comprobar('"Limpiar" restablece búsqueda y filtros', !/Filtros:/.test(q(`document.getElementById('buscar-summary').textContent`)));

evalCtx(`setCatFiltro('Plomería')`);
await esperar(120);
const chip = q(`document.querySelector('#buscar-servicios-chips .chipbtn').textContent.trim()`);
// El onclick se entrega como atributo HTML, así que las comillas del string de
// JavaScript tienen que ir escapadas como &quot; (el navegador las decodifica al
// ejecutar el handler). Si quedaran crudas, el atributo se cortaría y el clic
// no haría nada.
const chipOnclick = q(`document.querySelector('#buscar-servicios-chips .chipbtn').getAttribute('onclick')`);
comprobar('Los chips de especialidad se generan desde los datos', chip === 'Fugas de agua', chip);
// getAttribute devuelve el valor ya decodificado (como el navegador): el handler
// tiene que ser JavaScript válido y con el texto entre comillas. Si el escape
// del atributo faltara, el valor quedaría cortado y esto fallaría.
comprobar('El onclick del chip es JavaScript válido con el texto escapado',
  chipOnclick === `setServicioFiltro(${JSON.stringify(chip)})`, chipOnclick);
const handlerDirecto = evalCtx(`(()=>{
  const attr = document.querySelector('#buscar-servicios-chips .chipbtn').getAttribute('onclick');
  try { eval(attr); } catch(e) { return 'ERROR: ' + e.message; }
  return state.servicioFiltro;
})()`);
comprobar('El handler del chip aplica el filtro correcto', handlerDirecto === chip, `state.servicioFiltro=${handlerDirecto}`);
evalCtx(`state.servicioFiltro = null; renderBuscar();`);
await esperar(120);
// Y el botón real, al recibir un clic que burbujea, aplica el filtro.
document._disparar('click', { target: q(`document.querySelector('#buscar-servicios-chips .chipbtn')`) });
await esperar(120);
comprobar('Al tocar el chip queda aplicado el filtro', q('state.servicioFiltro') === chip, `state.servicioFiltro=${q('state.servicioFiltro')}`);
evalCtx(`limpiarFiltrosBuscar()`);
await esperar(120);

console.log('\n--- Perfil y agendamiento ---');
evalCtx(`verPerfil('w-jardin')`);
await esperar(250);
const perfilNombre = q(`document.querySelector('#perfil-content .profile-header h2').textContent.trim()`);
comprobar('El perfil del trabajador carga sus datos', /Carlos/.test(perfilNombre), perfilNombre);
comprobar('El perfil muestra la insignia de verificado', /Verificado/.test(q(`document.querySelector('#perfil-content').innerHTML`)));
comprobar('El perfil muestra la galería de trabajos', q(`document.querySelectorAll('#perfil-content .galeria-item').length`) >= 1);
comprobar('El perfil lista las reseñas con su respuesta', q(`document.querySelectorAll('#perfil-content .review').length`) === 2);
comprobar('El perfil tiene mapa e indicador de zona', /Ambalá/.test(q(`document.querySelector('#perfil-content .map-caption').textContent`)));

evalCtx(`irAAgendar('w-jardin')`);
await esperar(300);
// El calendario se arma con la fecha real (!), así que los asertos se calculan a
// partir del mes que la app muestra, no de un mes fijo.
// Ojo con los selectores: los días elegibles son <button> con data-dia, y los no
// elegibles (pasados o sin atención) son <div> sin data-dia, a propósito, para
// que no sean controles ni aparezcan en la navegación por teclado.
const cal = JSON.parse(h(`(()=>{
  const mesTxt = document.getElementById('cal-month').textContent.trim();
  const MESES_CLAVE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const [nombreMes, anio] = mesTxt.split(' ');
  const mes = MESES_CLAVE.indexOf(nombreMes);
  const celdas = [...document.querySelectorAll('#cal-grid .day')];
  // Las celdas de relleno (sin número) se identifican por no tener dígitos.
  const conDia = celdas.filter(c => /^\\d+$/.test(c.textContent.trim()));
  const botones = celdas.filter(c => c.tagName === 'BUTTON');
  const cerrados = celdas.filter(c => c.tagName === 'DIV' && c.classList.contains('closed'));
  const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const dowAbiertos = [...new Set(botones.map(b => diasSemana[new Date(Number(anio), mes, Number(b.dataset.dia)).getDay()]))];
  const primerBoton = document.querySelector('#cal-grid button.day');
  return {
    mesTxt, mes, anio: Number(anio),
    relleno: celdas.length - conDia.length,
    celdas: celdas.length,
    conDia: conDia.length,
    botones: botones.length,
    cerrados: cerrados.length,
    divsConDia: document.querySelectorAll('#cal-grid div.day[data-dia]').length,
    dowAbiertos,
    textosCerrados: cerrados.map(d => d.textContent.trim()),
    sel: botones.filter(d => d.classList.contains('sel')).map(d => Number(d.dataset.dia)),
    aviso: document.getElementById('cal-aviso').textContent.trim(),
    etiquetaAbierta: primerBoton ? primerBoton.getAttribute('aria-label') : '',
    slots: document.querySelectorAll('#slot-grid .slot').length,
    slotsActivos: document.querySelectorAll('#slot-grid .slot[role="radio"]').length,
    slotsDeshabilitados: document.querySelectorAll('#slot-grid .slot[disabled]').length,
    ariaDiaSel: document.querySelector('#cal-grid .day.sel').getAttribute('aria-checked'),
  };
})()`));
const diasDelMes = new Date(cal.anio, cal.mes + 1, 0).getDate();

comprobar('El calendario muestra el mes en curso con todos sus días',
  cal.mes >= 0 && cal.conDia === diasDelMes && cal.celdas === cal.relleno + diasDelMes,
  `${cal.mesTxt}: ${cal.conDia} días + ${cal.relleno} de relleno = ${cal.celdas} celdas`);
comprobar('El relleno completa la grilla de 7 columnas', cal.celdas % 7 === 0, `${cal.celdas} celdas`);
comprobar('Los días no elegibles no son controles', cal.divsConDia === 0, `${cal.divsConDia} div con data-dia`);
comprobar('Bloquea los días que el trabajador no atiende', cal.cerrados > 0, `${cal.botones} abiertos / ${cal.cerrados} cerrados`);
comprobar('Solo quedan abiertos los días de la semana que atiende',
  cal.dowAbiertos.length > 0 && cal.dowAbiertos.every(d => ['Lunes', 'Miércoles', 'Jueves'].includes(d)), cal.dowAbiertos.join(', '));
comprobar('Los días cerrados muestran su número', cal.textosCerrados.every(t => /^\d+$/.test(t)), cal.textosCerrados.slice(0, 4).join(','));
comprobar('Explica por qué hay días bloqueados', /no atiende/.test(cal.aviso), cal.aviso);
comprobar('Preselecciona un día con atención', cal.sel.length === 1, `${cal.sel.length} seleccionado(s)`);
comprobar('El día preseleccionado anuncia su estado', cal.ariaDiaSel === 'true');
comprobar('Los días abiertos se anuncian con su fecha completa', /^Día \d+ de \w+$/.test(cal.etiquetaAbierta), cal.etiquetaAbierta);
comprobar('Muestra los 6 horarios y deshabilita los que no atiende ese día',
  cal.slots === 6 && cal.slotsActivos >= 1 && cal.slotsActivos + cal.slotsDeshabilitados === 6,
  `${cal.slotsActivos} activos / ${cal.slotsDeshabilitados} deshabilitados`);

// Elegir un horario y confirmar que queda marcado y accesible.
const horaElegida = q(`document.querySelector('#slot-grid .slot[role="radio"]').textContent.trim()`);
evalCtx(`document.querySelector('#slot-grid .slot[role="radio"]').click()`);
await esperar(60);
comprobar('Se puede elegir un horario y queda marcado', q('state.horaSel') === horaElegida && q(`document.querySelectorAll('#slot-grid .slot.sel').length`) === 1,
  `horaSel=${q('state.horaSel')}`);
comprobar('El horario elegido se anuncia como seleccionado', q(`document.querySelector('#slot-grid .slot.sel').getAttribute('aria-checked')`) === 'true');
comprobar('El calendario es un grupo de radio para lectores de pantalla',
  q(`document.getElementById('cal-grid').getAttribute('role')`) === 'radiogroup'
  && q(`document.getElementById('slot-grid').getAttribute('role')`) === 'radiogroup');

// Los días cerrados no se pueden activar (son div, no botones).
const etiquetaCerrado = q(`document.querySelector('#cal-grid .day.closed').tagName`);
comprobar('Los días sin atención no son controles', etiquetaCerrado === 'DIV', etiquetaCerrado);

// Cambiar de mes recalcula la disponibilidad y sugiere un día válido.
const mesAntes = q(`document.getElementById('cal-month').textContent`);
evalCtx(`cambiarMesCalendario(1)`);
await esperar(150);
const mesSiguiente = JSON.parse(h(`({
  mes: document.getElementById('cal-month').textContent,
  cerrados: document.querySelectorAll('#cal-grid .day.closed').length,
  sel: document.querySelectorAll('#cal-grid .day.sel').length,
})`));
comprobar('Cambiar de mes recalcula los días cerrados y sugiere uno abierto',
  mesSiguiente.mes !== mesAntes && mesSiguiente.cerrados > 0 && mesSiguiente.sel === 1,
  `${mesAntes} -> ${mesSiguiente.mes}: ${mesSiguiente.cerrados} cerrados, ${mesSiguiente.sel} sugerido`);
evalCtx(`cambiarMesCalendario(-1)`);
await esperar(150);
comprobar('Volver al mes en curso restaura el calendario', q(`document.getElementById('cal-month').textContent`) === mesAntes);

console.log('\n--- Accesibilidad y navegación ---');
const acc = JSON.parse(h(`({
  botonesDia: document.querySelectorAll('#cal-grid button.day[role="radio"]').length,
  todosConLabel: [...document.querySelectorAll('#cal-grid button.day')].every(b => !!b.getAttribute('aria-label')),
  srOnly: document.querySelectorAll('.sr-only').length,
  skip: !!document.querySelector('.skip-link'),
  enlacesFooter: document.querySelectorAll('.footer-links a').length,
  ariaPressed: document.querySelectorAll('[aria-pressed]').length,
  regionesVivas: document.querySelectorAll('[aria-live]').length,
})`));
comprobar('El calendario son botones con aria-label', acc.botonesDia > 0 && acc.todosConLabel, `${acc.botonesDia} botones`);
comprobar('Hay etiquetas ocultas para los buscadores', acc.srOnly >= 4, `${acc.srOnly} etiquetas`);
comprobar('El enlace "saltar al contenido" está presente', acc.skip);
comprobar('El pie tiene los enlaces legales y de ayuda', acc.enlacesFooter === 5, `${acc.enlacesFooter} enlaces`);
comprobar('Los botones de estado usan aria-pressed', acc.ariaPressed >= 3, `${acc.ariaPressed} botones`);
comprobar('Hay regiones vivas para anunciar resultados', acc.regionesVivas >= 5, `${acc.regionesVivas} regiones`);
// El cambio de vista (lista/mapa) tiene que actualizar su estado anunciado.
evalCtx(`nav('buscar'); setVistaBuscar('mapa')`);
await esperar(80);
const vistaMapa = JSON.parse(h(`({
  lista: document.getElementById('btn-vista-lista').getAttribute('aria-pressed'),
  mapa: document.getElementById('btn-vista-mapa').getAttribute('aria-pressed'),
})`));
comprobar('La vista lista/mapa anuncia cuál está activa',
  vistaMapa.lista === 'false' && vistaMapa.mapa === 'true', JSON.stringify(vistaMapa));
evalCtx(`setVistaBuscar('lista')`);
await esperar(80);

evalCtx(`nav('accesibilidad')`);
await esperar(80);
const accPagina = JSON.parse(h(`({
  activa: document.getElementById('v-accesibilidad').classList.contains('active'),
  titulo: document.title,
  fecha: document.getElementById('accesibilidad-actualizado').textContent,
})`));
comprobar('La página de accesibilidad se abre y se titula',
  accPagina.activa && /Accesibilidad/.test(accPagina.titulo) && /6 de agosto de 2026/.test(accPagina.fecha), JSON.stringify(accPagina));

const titulos = JSON.parse(h(`(()=>{
  const out = {};
  for(const v of ['home','buscar','miscitas','trabajo','terminos','privacidad']){ nav(v); out[v] = document.title; }
  return out;
})()`));
comprobar('Cada vista cambia el título del documento',
  new Set(Object.values(titulos)).size === Object.keys(titulos).length && /Buscar profesionales/.test(titulos.buscar),
  JSON.stringify(titulos));

console.log('\n--- Modales accesibles ---');
evalCtx(`nav('buscar')`);
await esperar(80);
evalCtx(`(()=>{ document.getElementById('btn-vista-mapa').focus(); window.__promesa = confirmarModal('¿Seguro?', {titulo:'Probar'}); })()`);
await esperar(80);
const modal = JSON.parse(h(`({
  visible: !document.getElementById('modal-overlay').classList.contains('hidden'),
  foco: document.activeElement.id,
  botones: document.querySelectorAll('#modal-overlay button').length,
})`));
comprobar('El modal de confirmación se abre y toma el foco',
  modal.visible && modal.foco === 'modal-confirmar' && modal.botones === 2, JSON.stringify(modal));

// Tab en el último control cicla al primero (foco retenido dentro del diálogo).
evalCtx(`document.getElementById('modal-confirmar').focus()`);
document._disparar('keydown', { key: 'Tab', target: q(`document.getElementById('modal-confirmar')`) });
comprobar('Tab no se escapa del modal', q(`document.activeElement.id`) === 'modal-cancelar', `foco en ${q(`document.activeElement.id`)}`);
// Shift+Tab en el primero vuelve al último.
document._disparar('keydown', { key: 'Tab', shiftKey: true, target: q(`document.getElementById('modal-cancelar')`) });
comprobar('Shift+Tab cicla en sentido inverso', q(`document.activeElement.id`) === 'modal-confirmar', `foco en ${q(`document.activeElement.id`)}`);

document._disparar('keydown', { key: 'Escape' });
await esperar(60);
comprobar('Escape cierra el modal', q(`document.getElementById('modal-overlay').classList.contains('hidden')`));
comprobar('Al cerrar, el foco vuelve a donde estaba', q(`document.activeElement.id`) === 'btn-vista-mapa', `foco en ${q(`document.activeElement.id`)}`);
// La promesa del modal se resuelve al cerrarlo. Con Escape se resuelve en null
// (cancelado), que es lo que esperan los call sites para no seguir: solo los
// botones resuelven true/false.
const promesaResuelta = await Promise.race([
  Promise.resolve(q(`window.__promesa`)).then(v => `resuelta:${JSON.stringify(v)}`),
  new Promise(r => setTimeout(() => r('pendiente'), 300)),
]);
comprobar('Al cerrarse, el modal se vacía y la promesa se resuelve en null',
  q(`document.getElementById('modal-overlay').innerHTML`) === '' && promesaResuelta === 'resuelta:null',
  `promesa ${promesaResuelta}, overlay="${q(`document.getElementById('modal-overlay').innerHTML`)}"`);

console.log('\n--- Detalles que se rompen fácil ---');
// formatos de fecha: el año se omite solo cuando es el año en curso
const fechas = JSON.parse(h(`(()=>{
  const d = new Date(2026, 7, 15);
  return { sinAnio: formatearFechaCita(d, false), conAnio: formatearFechaCita(d, true) };
})()`));
comprobar('La fecha de la cita mantiene su formato guardado',
  fechas.sinAnio === '15 de agosto' && fechas.conAnio === '15 de agosto de 2026', JSON.stringify(fechas));

// completitud del perfil: la verificación pendiente cuenta como hecha
const completitud = JSON.parse(h(`calcularCompletitudPerfil({
  foto_url:'x', galeria_fotos:['a'], servicios:['Fugas'], zona:'Centro',
  disponibilidad:{L:['8:00 am']}, verificacionPendiente:true
})`));
comprobar('La completitud del perfil llega a 100% con verificación pendiente',
  completitud.porcentaje === 100 && completitud.faltantes.length === 0, JSON.stringify(completitud));

// tema oscuro y claro
evalCtx(`applyTheme('dark')`);
comprobar('El tema oscuro se aplica al documento', q(`document.documentElement.getAttribute('data-theme')`) === 'dark');
evalCtx(`applyTheme('light')`);
comprobar('El tema claro se aplica al documento', q(`document.documentElement.getAttribute('data-theme')`) === 'light');

// rutas: una vista inexistente no rompe la navegación
evalCtx(`nav('no-existe')`);
comprobar('Una vista desconocida no rompe la app', q(`typeof state === 'object'`));

console.log(`\n${fallos.length ? `${fallos.length} comprobación(es) fallaron:\n- ${fallos.join('\n- ')}` : 'Todas las comprobaciones pasaron.'}`);
process.exit(fallos.length ? 1 : 0);
