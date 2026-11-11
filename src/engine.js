/*
 * engine.js — Motor de cálculo sin DOM: validación, sesión de trabajo (estado editable),
 * ejecución completa (referencia + GC + GCP + errores + condicionamiento) y laboratorio.
 * La interfaz (app.js) y las pruebas (qa.js, tests/run-tests.js) usan exactamente este módulo.
 */
(function () {
  const HF = (globalThis.HF = globalThis.HF || {});
  const La = HF.La || require('./linalg.js');
  const Sol = HF.Solvers || require('./solvers.js');
  const Model = HF.Model || require('./model.js');
  const Precond = HF.Precond || Sol.Precond;
  const { pcg, condSPD, condPreconditioned, errorAnalysis } = Sol;

  const MAX_N = 8, MIN_N = 4;
  const DEFAULTS = () => ({ tol: 1e-6, nmax: 1000, precond: 'jacobi', omega: 1, x0Mode: 'zero', x0Custom: [], direct: 'cholesky', symmetricEdit: true });

  /** Interpreta texto numérico (acepta coma decimal). Devuelve NaN si no es un número válido. */
  function parseNum(v) {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined) return NaN;
    const s = String(v).trim().replace(',', '.');
    if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN;
    return Number(s);
  }

  // ---------- validación matemática ----------
  function validateSystem(A, b, settings = DEFAULTS()) {
    const errors = [], warnings = [];
    const n = Array.isArray(b) ? b.length : 0;
    const out = { ok: false, n, errors, warnings, symmetric: null, spd: null, gershgorin: null };
    if (n < MIN_N) errors.push(`El sistema debe tener al menos ${MIN_N} ecuaciones e incógnitas (n = ${n}).`);
    if (!Array.isArray(A) || A.length !== n || A.some((r) => !Array.isArray(r) || r.length !== n)) {
      errors.push('A debe ser cuadrada (n×n) y del mismo tamaño que b.');
      return out;
    }
    const bad = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!Number.isFinite(A[i][j])) bad.push(`a${i + 1}${j + 1}`);
    if (bad.length) errors.push(`Celdas de A no numéricas: ${bad.join(', ')}.`);
    const badB = b.map((v, i) => (Number.isFinite(v) ? null : `b${i + 1}`)).filter(Boolean);
    if (badB.length) errors.push(`Valores de b no numéricos: ${badB.join(', ')}.`);
    if (!(settings.tol > 0 && settings.tol < 1)) errors.push('La tolerancia debe cumplir 0 < tol < 1.');
    if (!(Number.isInteger(settings.nmax) && settings.nmax >= 1 && settings.nmax <= 100000)) errors.push('Nmáx debe ser un entero entre 1 y 100000.');
    if (settings.precond === 'ssor' && !(settings.omega > 0 && settings.omega < 2)) errors.push('SSOR requiere 0 < ω < 2.');
    if (settings.x0Mode === 'custom' && (settings.x0Custom.length !== n || !La.isFiniteVec(settings.x0Custom))) errors.push('El vector inicial x₀ personalizado contiene valores no numéricos.');
    if (errors.length) return out;

    out.symmetric = La.symmetryCheck(A);
    if (!out.symmetric.ok) {
      errors.push(`A no es simétrica: |a${out.symmetric.i + 1}${out.symmetric.j + 1} − a${out.symmetric.j + 1}${out.symmetric.i + 1}| = ${out.symmetric.maxDiff.toPrecision(4)}. El método GCP exige A = Aᵀ.`);
      return out;
    }
    const ch = La.cholesky(A);
    const eig = La.eigSym(La.symmetrize(A));
    const minors = La.leadingMinors(A);
    out.spd = { ok: ch.ok && eig[0] > 0, cholesky: ch, eig, minEig: eig[0], maxEig: eig[eig.length - 1], minors, minorsOk: minors.every((m) => m > 0) };
    out.gershgorin = La.gershgorin(A);
    if (!out.spd.ok) {
      errors.push(`A no es definida positiva: autovalor mínimo = ${eig[0].toExponential(3)}${ch.ok ? '' : `; ${ch.message}`}`);
      return out;
    }
    if (!(La.norm2(b) > 0)) warnings.push('b = 0: la solución es x = 0 (el error relativo no está definido).');
    out.ok = true;
    return out;
  }

  // ---------- ejecución completa ----------
  function resolveX0(A, b, settings) {
    if (settings.x0Mode === 'diag') return b.map((v, i) => v / A[i][i]);
    if (settings.x0Mode === 'custom') return settings.x0Custom.slice();
    return new Array(b.length).fill(0);
  }

  function runAll(A, b, settings) {
    const validation = validateSystem(A, b, settings);
    if (!validation.ok) return { valid: false, validation };
    const n = b.length, x0 = resolveX0(A, b, settings);

    const ch = La.choleskySolve(A, b), lu = La.luSolve(A, b), ga = La.gauss(A, b, true);
    const methods = { cholesky: ch, lu, gauss: ga };
    const pick = methods[settings.direct] && methods[settings.direct].ok ? settings.direct : 'cholesky';
    const xref = methods[pick].x;
    const scale = Math.max(La.norm2(xref), 1e-300);
    const cross = { choleskyVsLu: La.maxAbsDiff(ch.x, lu.x) / scale, choleskyVsGauss: La.maxAbsDiff(ch.x, ga.x) / scale };

    let pre = Precond.make(A, settings.precond, { omega: settings.omega }), precondNote = null;
    if (!pre.ok) { precondNote = `${pre.message} Se utiliza Jacobi en su lugar.`; pre = Precond.make(A, 'jacobi'); }
    else if (pre.note) precondNote = pre.note;

    const gcp = pcg(A, b, { x0, tol: settings.tol, nmax: settings.nmax, precond: pre });
    const gc = pcg(A, b, { x0, tol: settings.tol, nmax: settings.nmax });
    const condA = condSPD(A), condMA = condPreconditioned(A, pre.M);

    return {
      valid: true, validation, n, x0, direct: { method: pick, data: methods[pick], all: methods, cross },
      xref, precond: pre, precondNote, gcp, gc, condA, condMA,
      errGCP: errorAnalysis(xref, gcp.x, A, b), errGC: errorAnalysis(xref, gc.x, A, b),
    };
  }

  // ---------- sesión (estado editable) ----------
  function createSession() {
    const s = { version: 0, settings: DEFAULTS(), state: null, _cache: null, _cacheV: -1 };
    const bump = () => { s.version++; };

    s.load = (id) => {
      const m = Model.build(id);
      s.state = { scenarioId: id, modified: false, names: m.names.slice(), A: La.clone(m.A), b: m.b.slice(), unit: m.unit, bsPerUnit: m.bsPerUnit.slice(), model: m };
      s.settings.x0Custom = new Array(m.b.length).fill(0);
      bump(); return s;
    };
    s.n = () => s.state.b.length;
    s.setCell = (i, j, value) => {
      const v = parseNum(value);
      s.state.A[i][j] = v;
      if (s.settings.symmetricEdit && i !== j) s.state.A[j][i] = v;
      s.state.modified = true; bump(); return s;
    };
    s.setB = (i, value) => { s.state.b[i] = parseNum(value); s.state.modified = true; bump(); return s; };
    s.setX0 = (i, value) => { s.settings.x0Custom[i] = parseNum(value); bump(); return s; };
    s.set = (key, value) => { s.settings[key] = value; bump(); return s; };
    s.symmetrize = () => { s.state.A = La.symmetrize(s.state.A); s.state.modified = true; bump(); return s; };
    s.addVariable = () => {
      const n = s.n();
      if (n >= MAX_N) return false;
      const A = s.state.A, d = A.reduce((t, r, i) => t + r[i], 0) / n, bm = s.state.b.reduce((t, v) => t + v, 0) / n;
      A.forEach((r) => r.push(0.05 * d));
      A.push(new Array(n).fill(0.05 * d).concat([d]));
      s.state.b.push(bm); s.state.names.push(`Variable ${n + 1}`); s.state.bsPerUnit.push(s.state.bsPerUnit[n - 1]);
      s.settings.x0Custom.push(0); s.state.modified = true; bump(); return true;
    };
    s.removeVariable = () => {
      const n = s.n();
      if (n <= MIN_N) return false;
      s.state.A.pop(); s.state.A.forEach((r) => r.pop());
      s.state.b.pop(); s.state.names.pop(); s.state.bsPerUnit.pop(); s.settings.x0Custom.pop();
      s.state.modified = true; bump(); return true;
    };
    s.compute = () => {
      if (s._cacheV !== s.version) { s._cache = runAll(s.state.A, s.state.b, s.settings); s._cacheV = s.version; }
      return s._cache;
    };
    s.load('ideal');
    return s;
  }

  /** Ejecuta los tres escenarios predefinidos con los ajustes dados (para la tabla comparativa). */
  function runScenarios(settings) {
    const out = {};
    for (const id of ['ideal', 'stress', 'ill']) {
      const sess = createSession();
      sess.load(id);
      Object.assign(sess.settings, settings, { x0Custom: new Array(sess.n()).fill(0) });
      sess.version++;
      out[id] = { session: sess, model: sess.state.model, res: sess.compute() };
    }
    return out;
  }

  /** Laboratorio: A = S T S con T Toeplitz AR(1) (ρ = 0.5) y S de escalas muy dispares. */
  function labExperiment(n, ratio, tol = 1e-6, nmax = 20000) {
    const T = La.zeros(n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) T[i][j] = Math.pow(0.5, Math.abs(i - j));
    const s = Array.from({ length: n }, (_, i) => Math.pow(ratio, n > 1 ? i / (n - 1) : 0));
    const A = T.map((r, i) => r.map((v, j) => s[i] * v * s[j]));
    const xTrue = new Array(n).fill(1), b = La.matVec(A, xTrue);
    const pre = Precond.make(A, 'jacobi');
    const gc = pcg(A, b, { tol, nmax }), gcp = pcg(A, b, { tol, nmax, precond: pre });
    let kA = null, kMA = null;
    if (n <= 80) { kA = condSPD(A).kappa; kMA = condPreconditioned(A, pre.M).kappa; }
    return { n, ratio, gc, gcp, kA, kMA, errGC: La.norm2(La.sub(gc.x, xTrue)) / La.norm2(xTrue), errGCP: La.norm2(La.sub(gcp.x, xTrue)) / La.norm2(xTrue) };
  }

  HF.Engine = { parseNum, validateSystem, runAll, createSession, runScenarios, labExperiment, DEFAULTS, MAX_N, MIN_N };
  if (typeof module !== 'undefined' && module.exports) module.exports = HF.Engine;
})();
