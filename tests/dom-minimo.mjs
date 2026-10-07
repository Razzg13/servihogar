// DOM mínimo para poder EJECUTAR el código de render de la app en Node y
// comprobar qué HTML genera, sin navegador y sin jsdom (no disponible sin red).
//
// En este entorno el sandbox bloquea los canales IPC de Chrome, así que la única
// forma de verificar el render es esta. Incluye un tokenizador de HTML propio
// (nada de dependencias ni subprocesos: el sandbox también bloquea anidar
// procesos).
//
// NO es un DOM completo: cubre los métodos y propiedades que la app usa hoy
// (getElementById, createElement, querySelector/All con un subconjunto de CSS,
// innerHTML, textContent, classList, dataset, style, clic y teclado). Si app.js
// empieza a usar otra API del DOM, hay que agregarla acá.

/* ---------------- tokenizador de HTML ---------------- */
// Suficiente para el HTML de la app: etiquetas, atributos con y sin comillas,
// autocierre, comentarios, doctype y entidades básicas. No implementa casos
// exóticos de HTML (contenido sin escapar, tablas implícitas, etc.).
const VACIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function decodificarEntidades(texto) {
  const mapa = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  return String(texto).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (todo, cuerpo) => {
    if (cuerpo[0] === '#') {
      const codigo = cuerpo[1] === 'x' || cuerpo[1] === 'X' ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : todo;
    }
    return mapa[cuerpo] !== undefined ? mapa[cuerpo] : todo;
  });
}

function analizarAtributos(texto, attrs) {
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const nombre = m[1].toLowerCase();
    const valor = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    // Las entidades se decodifican después de delimitar el valor, igual que hace
    // el navegador: si no, un &quot; dentro del valor cortaría el atributo.
    if (!(nombre in attrs)) attrs[nombre] = decodificarEntidades(valor);
  }
}

function parsearHTML(html) {
  const raiz = { tipo: 'elemento', tag: 'div', attrs: {}, hijos: [] };
  const pila = [raiz];
  const texto = String(html ?? '');
  let i = 0;
  const agregarTexto = t => {
    if (!t) return;
    const actual = pila[pila.length - 1];
    actual.hijos.push({ tipo: 'texto', texto: decodificarEntidades(t) });
  };
  while (i < texto.length) {
    const abre = texto.indexOf('<', i);
    if (abre === -1) { agregarTexto(texto.slice(i)); break; }
    agregarTexto(texto.slice(i, abre));
    if (texto.startsWith('<!--', abre)) {
      const fin = texto.indexOf('-->', abre + 4);
      const hasta = fin === -1 ? texto.length : fin + 3;
      pila[pila.length - 1].hijos.push({ tipo: 'comentario', texto: texto.slice(abre + 4, fin === -1 ? texto.length : fin) });
      i = hasta;
      continue;
    }
    if (/^<!|^<\?/.test(texto.slice(abre, abre + 2))) { // <!DOCTYPE ...> o <?...>
      const fin = texto.indexOf('>', abre);
      i = fin === -1 ? texto.length : fin + 1;
      continue;
    }
    const cierra = texto.indexOf('>', abre);
    if (cierra === -1) { agregarTexto(texto.slice(abre)); break; }
    const interior = texto.slice(abre + 1, cierra);
    i = cierra + 1;
    if (interior.startsWith('/')) { // etiqueta de cierre
      const tag = interior.slice(1).trim().toLowerCase();
      for (let k = pila.length - 1; k > 0; k--) {
        if (pila[k].tag === tag) { pila.length = k; break; }
      }
      continue;
    }
    const autocierre = interior.endsWith('/');
    const m = interior.match(/^([A-Za-z][-A-Za-z0-9:]*)/);
    if (!m) { agregarTexto(texto.slice(abre, cierra + 1)); continue; }
    const tag = m[1].toLowerCase();
    const nodo = { tipo: 'elemento', tag, attrs: {}, hijos: [] };
    analizarAtributos(interior.slice(m[0].length), nodo.attrs);
    pila[pila.length - 1].hijos.push(nodo);
    // No se apilan los vacíos ni los autocerrados (la app genera <input>, <img>, <br>).
    if (!autocierre && !VACIOS.has(tag)) pila.push(nodo);
  }
  return raiz;
}

/* ---------------- selectores (subconjunto de CSS) ---------------- */
// Soporta: tag, .clase, #id, [attr], [attr="v"], :not(...) (con listas) y el
// combinador descendente. Es lo que usan los selectores de la app.
const CACHE_SELECTOR = new Map();
function compilarSelector(selector) {
  if (CACHE_SELECTOR.has(selector)) return CACHE_SELECTOR.get(selector);
  const pasos = [];
  let buffer = '';
  let i = 0;
  const texto = selector.trim();
  while (i < texto.length) {
    const c = texto[i];
    if (texto.startsWith(':not(', i)) {
      let nivel = 1;
      let j = i + 5;
      while (j < texto.length && nivel > 0) {
        if (texto[j] === '(') nivel++;
        else if (texto[j] === ')') nivel--;
        j++;
      }
      buffer += texto.slice(i, j);
      i = j;
      continue;
    }
    if (c === '[') {
      const j = texto.indexOf(']', i);
      buffer += texto.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ' ' || c === '>') {
      if (buffer.trim()) pasos.push(compilarSimple(buffer.trim()));
      buffer = '';
      i++;
      continue;
    }
    buffer += c;
    i++;
  }
  if (buffer.trim()) pasos.push(compilarSimple(buffer.trim()));
  CACHE_SELECTOR.set(selector, pasos);
  return pasos;
}
function compilarSimple(simple) {
  const pruebas = [];
  const re = /(:not\([^)]*\))|(\[[^\]]*\])|(#[A-Za-z0-9_-]+)|(\.[A-Za-z0-9_-]+)|(^[A-Za-z][A-Za-z0-9-]*)/g;
  let m;
  while ((m = re.exec(simple)) !== null) {
    const token = m[0];
    if (token.startsWith(':not(')) {
      const alternativas = token.slice(5, -1).split(',').map(s => compilarSimple(s.trim()));
      pruebas.push(nodo => !alternativas.some(alt => alt.every(p => p(nodo))));
    } else if (token.startsWith('[')) {
      const cuerpo = token.slice(1, -1);
      const idx = cuerpo.indexOf('=');
      if (idx === -1) pruebas.push(nodo => nodo.getAttribute(cuerpo) !== null);
      else {
        const attr = cuerpo.slice(0, idx).trim();
        let valor = cuerpo.slice(idx + 1).trim();
        if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
        pruebas.push(nodo => nodo.getAttribute(attr) === valor);
      }
    } else if (token.startsWith('#')) {
      pruebas.push(nodo => nodo.id === token.slice(1));
    } else if (token.startsWith('.')) {
      pruebas.push(nodo => nodo.classList.contains(token.slice(1)));
    } else {
      const tag = token.toLowerCase();
      pruebas.push(nodo => nodo.tagName.toLowerCase() === tag);
    }
  }
  return pruebas;
}
// Busca dentro de `raiz` (sin incluirla). El combinador descendente se resuelve
// exigiendo un ancestro que cumpla cada paso previo.
function buscarEn(raiz, selector) {
  const contenedor = raiz._recorrer ? raiz : raiz.documentElement;
  if (!contenedor || !contenedor._recorrer) return [];
  // Lista de selectores ("button, input"): la unión, sin repetir nodos y en
  // orden de documento. La app la usa para juntar los controles de un diálogo.
  const partes = selector.split(',').map(s => s.trim()).filter(Boolean);
  if (partes.length > 1) {
    const vistos = new Set();
    const salida = [];
    for (const nodo of contenedor._recorrerTodos()) {
      if (vistos.has(nodo)) continue;
      if (partes.some(p => compilarSelector(p).every(paso => paso.every(fn => fn(nodo))))) {
        vistos.add(nodo);
        salida.push(nodo);
      }
    }
    return salida;
  }
  const pasos = compilarSelector(selector);
  if (!pasos.length) return [];
  const ultimo = pasos[pasos.length - 1];
  const anteriores = pasos.slice(0, -1);
  const encontrados = [];
  contenedor._recorrer(nodo => {
    if (!ultimo.every(p => p(nodo))) return;
    let actual = nodo.parentNode;
    for (let k = anteriores.length - 1; k >= 0; k--) {
      let encontrado = false;
      while (actual && actual !== contenedor.parentNode) {
        if (anteriores[k].every(p => p(actual))) { encontrado = true; actual = actual.parentNode; break; }
        actual = actual.parentNode;
      }
      if (!encontrado) return;
    }
    encontrados.push(nodo);
  });
  return encontrados;
}

/* ---------------- nodos ---------------- */
class ClassList {
  constructor(nodo) { this._nodo = nodo; }
  get _lista() { return (this._nodo.getAttribute('class') || '').split(/\s+/).filter(Boolean); }
  _guardar(lista) { this._nodo.setAttribute('class', lista.join(' ')); }
  contains(c) { return this._lista.includes(c); }
  add(...cs) { const l = this._lista; cs.forEach(c => { if (!l.includes(c)) l.push(c); }); this._guardar(l); }
  remove(...cs) { this._guardar(this._lista.filter(c => !cs.includes(c))); }
  toggle(c, forzar) {
    const tiene = this.contains(c);
    const deberia = forzar === undefined ? !tiene : !!forzar;
    if (deberia && !tiene) this.add(c);
    else if (!deberia && tiene) this.remove(c);
    return deberia;
  }
  get length() { return this._lista.length; }
}

class Nodo {
  constructor(datos) {
    this._datos = datos; // {tipo, tag, attrs, hijos} | {tipo:'texto', texto} | {tipo:'comentario', texto}
    this.parentNode = null;
    this.ownerDocument = null;
    this._oyentes = {};
    this._hijosInternos = [];
  }
  /* --- estructura --- */
  get tagName() { return (this._datos.tag || '').toUpperCase(); }
  get nodeName() { return this.esTexto ? '#text' : this.tagName; }
  get nodeType() { return this.esTexto ? 3 : this._datos.tipo === 'comentario' ? 8 : 1; }
  get esTexto() { return this._datos.tipo === 'texto'; }
  get esElemento() { return this._datos.tipo === 'elemento'; }
  get childNodes() { return this._hijos; }
  get children() { return this._hijos.filter(h => h.esElemento); }
  get firstChild() { return this._hijos[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get lastChild() { return this._hijos[this._hijos.length - 1] || null; }
  get nextElementSibling() {
    const hnos = this.parentNode ? this.parentNode.children : [];
    const i = hnos.indexOf(this);
    return i >= 0 ? (hnos[i + 1] || null) : null;
  }
  get parentElement() { return this.parentNode && this.parentNode.esElemento ? this.parentNode : null; }
  _recorrer(fn) { for (const h of this._hijos) { fn(h); h._recorrer(fn); } }
  _recorrerTodos() {
    const salida = [];
    this._recorrer(n => salida.push(n));
    return salida;
  }
  _contiene(otro) { if (otro === this) return true; return this._hijos.some(h => h.esElemento && h._contiene(otro)); }

  /* --- atributos --- */
  get attrs() { return this._datos.attrs || (this._datos.attrs = {}); }
  getAttribute(n) { const v = this.attrs[n]; return v === undefined ? null : String(v); }
  setAttribute(n, v) { this.attrs[n] = v === null || v === undefined ? '' : String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n); }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get classList() { return this._classList || (this._classList = new ClassList(this)); }
  get dataset() {
    if (this._dataset) return this._dataset;
    const nodo = this;
    const attr = prop => 'data-' + String(prop).replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    this._dataset = new Proxy({}, {
      get(_t, prop) { const v = nodo.getAttribute(attr(prop)); return v === null ? undefined : v; },
      set(_t, prop, valor) { nodo.setAttribute(attr(prop), valor); return true; },
      has(_t, prop) { return nodo.hasAttribute(attr(prop)); },
    });
    return this._dataset;
  }
  get style() {
    if (this._style) return this._style;
    const nodo = this;
    this._style = new Proxy({}, {
      get(_t, prop) { return nodo._leerEstilo(String(prop)); },
      set(_t, prop, valor) { nodo._escribirEstilo(String(prop), valor); return true; },
    });
    return this._style;
  }
  _leerEstilo(prop) {
    const css = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    const declaraciones = (this.getAttribute('style') || '').split(';');
    for (const d of declaraciones) {
      const idx = d.indexOf(':');
      if (idx !== -1 && d.slice(0, idx).trim() === css) return d.slice(idx + 1).trim();
    }
    return '';
  }
  _escribirEstilo(prop, valor) {
    const css = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    const declaraciones = (this.getAttribute('style') || '').split(';').map(d => d.trim()).filter(Boolean)
      .filter(d => d.slice(0, d.indexOf(':')).trim() !== css);
    declaraciones.push(`${css}: ${valor}`);
    this.setAttribute('style', declaraciones.join('; '));
  }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { v ? this.setAttribute('hidden', '') : this.removeAttribute('hidden'); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }
  get value() { return this._valor !== undefined ? this._valor : (this.getAttribute('value') || ''); }
  set value(v) { this._valor = String(v); }
  get checked() { return this._marcado !== undefined ? this._marcado : this.hasAttribute('checked'); }
  set checked(v) { this._marcado = !!v; }
  get innerHTML() { return this._hijos.map(h => serializar(h)).join(''); }
  set innerHTML(html) {
    for (const h of this._hijos) h.parentNode = null;
    const contenedor = parsearHTML(html);
    this._hijos = contenedor.hijos.map(d => crearNodo(d, this.ownerDocument));
    for (const h of this._hijos) h.parentNode = this;
  }
  get outerHTML() { return serializar(this); }
  get textContent() {
    // En un nodo de texto, textContent es su propio texto (no el de sus hijos).
    if(this.esTexto) return this._datos.texto || '';
    return this._hijos.map(h => h.textContent).join('');
  }
  set textContent(v) {
    this._hijos = [];
    if (v !== '' && v !== null && v !== undefined) {
      const t = crearNodo({ tipo: 'texto', texto: String(v) }, this.ownerDocument);
      t.parentNode = this;
      this._hijos = [t];
    }
  }
  get _hijos() { return this._hijosInternos; }
  set _hijos(v) { this._hijosInternos = v; }

  /* --- consultas --- */
  matches(selector) { return compilarSelector(selector).every(paso => paso.every(p => p(this))); }
  querySelector(sel) { return buscarEn(this, sel)[0] || null; }
  querySelectorAll(sel) { return buscarEn(this, sel); }
  getElementsByTagName(tag) { return buscarEn(this, tag); }
  closest(sel) {
    let n = this;
    while (n && n.esElemento) { if (compilarSelector(sel).every(paso => paso.every(p => p(n)))) return n; n = n.parentNode; }
    return null;
  }
  contains(otro) { return this._contiene(otro); }
  appendChild(hijo) { hijo.parentNode = this; this._hijos.push(hijo); return hijo; }
  removeChild(hijo) { this._hijos = this._hijos.filter(h => h !== hijo); hijo.parentNode = null; return hijo; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  insertBefore(nuevo, ref) {
    const i = this._hijos.indexOf(ref);
    nuevo.parentNode = this;
    if (i === -1) this._hijos.push(nuevo); else this._hijos.splice(i, 0, nuevo);
    return nuevo;
  }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument && this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  click() { return this._disparar('click', {}); }
  // Resuelve el handler de un tipo de evento: primero el asignado por código
  // (el.onclick = fn) y si no, el atributo inline (onclick="..."). Sin esto, un
  // .click() en el test no ejecutaría nada y los asertos pasarían por accidente.
  // El atributo se compila con document._evaluar, que en los tests es el eval del
  // contexto: `new Function` compilaría en el realm de este módulo y el handler no
  // vería las funciones globales de la app.
  _handlerDe(tipo) {
    const propio = this._handlers && this._handlers[tipo];
    if (typeof propio === 'function') return propio;
    const attr = this.esElemento ? this.getAttribute('on' + tipo) : null;
    if (!attr) return null;
    const cache = this._handlersInline || (this._handlersInline = {});
    if (cache[tipo] && cache[tipo].fuente === attr) return cache[tipo].fn;
    const compilar = (this.ownerDocument && this.ownerDocument._evaluar)
      || (cuerpo => new Function('event', cuerpo));
    let fn = null;
    try { fn = compilar(attr); } catch { fn = null; } // sintaxis inválida: se ignora
    cache[tipo] = { fuente: attr, fn };
    return fn;
  }
  _disparar(tipo, evento) {
    const base = {
      type: tipo, target: this, shiftKey: false, key: undefined, defaultPrevented: false,
      preventDefault() { base.defaultPrevented = true; }, stopPropagation() {},
      ...evento,
    };
    let n = this;
    while (n && n.esElemento) {
      for (const fn of n._oyentes[tipo] || []) fn.call(n, base);
      const inline = n._handlerDe(tipo);
      if (inline) {
        // Un handler inline roto (p. ej. una función que no existe) no debe
        // cortar el recorrido del test: se reporta y se sigue, como el navegador.
        try { inline.call(n, base); } catch (e) { console.log(`⚠ handler ${tipo} falló: ${e.message}`); }
      }
      n = n.parentNode;
    }
    return base;
  }
  addEventListener(tipo, fn) { (this._oyentes[tipo] = this._oyentes[tipo] || []).push(fn); }
  removeEventListener(tipo, fn) { this._oyentes[tipo] = (this._oyentes[tipo] || []).filter(f => f !== fn); }
  get offsetParent() { return this.esElemento ? (this.parentNode || null) : null; }
  scrollIntoView() {}
  get scrollTop() { return 0; }
  set scrollTop(_v) {}
  get scrollHeight() { return 0; }
  set scrollHeight(_v) {}
}

function serializar(nodo) {
  if (nodo.esTexto) return nodo._datos.texto;
  if (nodo._datos.tipo === 'comentario') return `<!--${nodo._datos.texto}-->`;
  const attrs = Object.entries(nodo.attrs).map(([k, v]) => v === '' ? ` ${k}` : ` ${k}="${String(v).replace(/"/g, '&quot;')}"`).join('');
  const tag = nodo._datos.tag;
  if (VACIOS.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${nodo.innerHTML}</${tag}>`;
}

function crearNodo(datos, documento) {
  const n = new Nodo(datos);
  n.ownerDocument = documento;
  if (datos.tipo === 'elemento') {
    n._hijos = (datos.hijos || []).map(d => crearNodo(d, documento));
    for (const h of n._hijos) h.parentNode = n;
  }
  return n;
}

/* ---------------- documento ---------------- */
export function crearDOM(html) {
  const documento = {
    activeElement: null,
    _listeners: {},
    createElement(tag) {
      const n = new Nodo({ tipo: 'elemento', tag: String(tag).toLowerCase(), attrs: {}, hijos: [] });
      n.ownerDocument = documento;
      return n;
    },
    createTextNode(texto) {
      const n = new Nodo({ tipo: 'texto', texto: String(texto) });
      n.ownerDocument = documento;
      return n;
    },
    getElementById(id) { return this.querySelector('#' + id); },
    querySelector(sel) { return this.documentElement.querySelector(sel); },
    querySelectorAll(sel) { return this.documentElement.querySelectorAll(sel); },
    getElementsByTagName(tag) { return this.documentElement.getElementsByTagName(tag); },
    contains(nodo) { return !!nodo && this.documentElement._contiene(nodo); },
    focus() {},
    addEventListener(tipo, fn) { (documento._listeners[tipo] = documento._listeners[tipo] || []).push(fn); },
    removeEventListener(tipo, fn) { documento._listeners[tipo] = (documento._listeners[tipo] || []).filter(f => f !== fn); },
    // Simula la propagación de un evento de documento (click/keydown): handlers
    // inline del nodo objetivo y de sus ancestros, y después los globales.
    _disparar(tipo, evento = {}) {
      const base = {
        type: tipo, target: evento.target || documento.body, shiftKey: false, key: undefined,
        defaultPrevented: false,
        preventDefault() { base.defaultPrevented = true; }, stopPropagation() {},
        ...evento,
      };
      let n = base.target;
      while (n && n.esElemento) {
        for (const fn of n._oyentes[tipo] || []) fn.call(n, base);
        const inline = n._handlerDe(tipo);
        if (inline) {
          try { inline.call(n, base); } catch (e) { console.log(`⚠ handler ${tipo} falló: ${e.message}`); }
        }
        n = n.parentNode;
      }
      for (const fn of documento._listeners[tipo] || []) fn(base);
      return base;
    },
  };
  const raiz = crearNodo(parsearHTML(html), documento);
  documento._raiz = raiz;
  documento.documentElement = raiz.querySelector('html') || raiz;
  documento.body = raiz.querySelector('body') || documento.documentElement;
  documento.head = raiz.querySelector('head') || documento.documentElement;
  documento.activeElement = documento.body;
  return { document: documento, raiz };
}

/* ---------------- ventana ---------------- */
export function crearVentana(documento, opciones = {}) {
  const almacen = new Map();
  const ventana = {
    document: documento,
    location: {
      hash: '#/home', pathname: '/index.html', origin: 'http://localhost',
      href: 'http://localhost/index.html#/home',
      _asignaciones: [],
      assign(u) { this._asignaciones.push(u); },
      replace(u) { this._asignaciones.push(u); },
    },
    history: {
      pushState(_a, _b, url) { if (url) ventana.location.hash = url.startsWith('#') ? url : '#' + url.split('#')[1]; },
      replaceState(_a, _b, url) { if (url) ventana.location.hash = url.startsWith('#') ? url : '#' + url.split('#')[1]; },
    },
    localStorage: {
      getItem: k => (almacen.has(k) ? almacen.get(k) : null),
      setItem: (k, v) => almacen.set(k, String(v)),
      removeItem: k => almacen.delete(k),
      clear: () => almacen.clear(),
    },
    navigator: { userAgent: 'node-dom-minimo', geolocation: undefined, clipboard: { writeText: async () => {} } },
    innerWidth: 1280,
    scrollTo() {},
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: id => clearInterval(id),
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    alert() {}, confirm: () => true, prompt: () => null,
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL() {} },
    Blob: class { constructor() {} },
    FileReader: class { readAsDataURL() {} },
    Image: class { set src(_v) {} },
    Notification: { permission: 'denied', requestPermission: async () => 'denied' },
    ...opciones,
  };
  ventana.window = ventana;
  ventana.self = ventana;
  ventana.top = ventana;
  return ventana;
}

export { parsearHTML, buscarEn };
