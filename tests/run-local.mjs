// Runner mínimo para poder ejecutar tests/logica.test.mjs en entornos donde
// `node --test` no puede lanzar su proceso hijo (por ejemplo, un sandbox que
// bloquea spawn con stdio por pipes). En una máquina normal seguí usando:
//
//   node --test tests/
//
// Uso de este runner:
//
//   node tests/run-local.mjs
//
// Carga el archivo de tests con `test`, `assert`, `require` y `process` como
// globales, en el realm principal (no en un contexto vm: assert.deepEqual de
// node:assert/strict compara prototipos, y los objetos creados en otro realm
// fallarían aunque tuvieran la misma estructura).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const archivo = path.resolve(process.argv[2] || 'tests/logica.test.mjs');
const fuente = fs.readFileSync(archivo, 'utf8')
  .replace(/^\s*import\b[^\n]*\n/gm, '')
  .replace(/^\s*const require = createRequire\(import\.meta\.url\);\s*$/gm, '');

// Las rutas del require del test ('../js/logica.js') se resuelven contra la
// carpeta del archivo de tests, igual que haría Node.
const requireDelTest = createRequire(path.join(path.dirname(archivo), 'test.mjs'));

const cola = [];
globalThis.test = (nombre, fn) => cola.push({ nombre, fn });
globalThis.assert = assert;
globalThis.require = requireDelTest;

try {
  // Se envuelve en una función async para admitir top-level await en el archivo.
  await new Function(`return (async () => {${fuente}\n})();`)();
} catch (e) {
  console.error(`No se pudo cargar ${path.relative(process.cwd(), archivo)}:\n${e.message}`);
  process.exit(1);
}

let pasaron = 0;
const fallaron = [];
for (const { nombre, fn } of cola) {
  try {
    await fn();
    pasaron++;
  } catch (e) {
    fallaron.push({ nombre, detalle: (e.message || String(e)).split('\n')[0] });
  }
}

for (const { nombre, detalle } of fallaron) console.log(`\n✗ ${nombre}\n  ${detalle}`);
console.log(`\n${pasaron}/${cola.length} tests pasaron${fallaron.length ? ` · ${fallaron.length} fallaron` : ''}`);
process.exit(fallaron.length ? 1 : 0);
