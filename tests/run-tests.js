// Ejecuta la batería QA en Node:  node tests/run-tests.js   (o: npm test)
require('../src/linalg.js');
require('../src/solvers.js');
require('../src/model.js');
require('../src/engine.js');
const QA = require('../src/qa.js');

const results = QA.runAll();
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.nombre}\n        → ${r.obtenido}`);
}
console.log(`\n${results.length - failed}/${results.length} pruebas aprobadas`);
process.exit(failed ? 1 : 0);
