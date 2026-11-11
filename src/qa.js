/*
 * qa.js — Casos de prueba (Entrada · Resultado esperado · Resultado obtenido · Conclusión).
 * Se ejecutan en el navegador (Módulo 9) y en Node (`npm test`) con el mismo motor.
 * `req` indica el requisito del desafío (1–4 = pruebas obligatorias, 'X' = pruebas adicionales).
 */
(function () {
  const HF = (globalThis.HF = globalThis.HF || {});
  const La = HF.La || require('./linalg.js');
  const Sol = HF.Solvers || require('./solvers.js');
  const Model = HF.Model || require('./model.js');
  const E = HF.Engine || require('./engine.js');

  const rel = (u, v) => La.norm2(La.sub(u, v)) / La.norm2(v);
  const sci = (v) => (Number.isFinite(v) ? v.toExponential(2) : String(v));
  const ids = ['ideal', 'stress', 'ill'];
  const label = { ideal: 'Ideal', stress: 'Bajo estrés', ill: 'Mal condicionado' };

  const T = [];
  const add = (t) => T.push(t);

  // ---------- 1. Carga de escenarios ----------
  ids.forEach((id, k) => add({
    id: `QA-1${'abc'[k]}`, req: 1, nombre: `Carga del escenario ${label[id]}`,
    entrada: `Botón «${label[id]}» con tol = 10⁻⁶, x₀ = 0, precond. Jacobi`,
    esperado: 'Matriz SPD válida; GCP converge con residuo relativo < 10⁻⁶ y coincide con la solución de referencia (error relativo < 10⁻⁶)',
    run() {
      const s = E.createSession().load(id);
      const r = s.compute();
      if (!r.valid) return { pass: false, obtenido: `Sistema inválido: ${r.validation.errors.join(' | ')}` };
      const eRel = rel(r.gcp.x, r.xref);
      const pass = r.gcp.converged && r.gcp.trueResidual < 1e-6 && eRel < 1e-6;
      return { pass, obtenido: `Válido; GCP: ${r.gcp.iterations} it., residuo ${sci(r.gcp.trueResidual)}, error rel. vs referencia ${sci(eRel)}; κ(A) = ${r.condA.kappa.toPrecision(4)}` };
    },
  }));

  // ---------- 2. Matriz no válida ----------
  add({
    id: 'QA-2a', req: 2, nombre: 'Matriz no simétrica',
    entrada: 'Escenario Ideal con simetría desactivada y a₁₂ = 9 (a₂₁ queda igual)',
    esperado: 'El sistema detecta A ≠ Aᵀ, notifica el error y no ejecuta los solvers ni lanza excepción',
    run() {
      const s = E.createSession().load('ideal'); s.settings.symmetricEdit = false; s.setCell(0, 1, 9);
      let r; try { r = s.compute(); } catch (e) { return { pass: false, obtenido: `Excepción: ${e.message}` }; }
      const pass = r.valid === false && r.validation.errors.some((m) => m.includes('no es simétrica'));
      return { pass, obtenido: r.valid ? 'Se ejecutó (incorrecto)' : r.validation.errors[0] };
    },
  });
  add({
    id: 'QA-2b', req: 2, nombre: 'Matriz simétrica no definida positiva',
    entrada: 'Escenario Ideal con a₂₂ = −1',
    esperado: 'Se detecta que A no es definida positiva (autovalor mínimo negativo) y se notifica sin colapsar',
    run() {
      const s = E.createSession().load('ideal'); s.setCell(1, 1, -1);
      let r; try { r = s.compute(); } catch (e) { return { pass: false, obtenido: `Excepción: ${e.message}` }; }
      const pass = r.valid === false && r.validation.errors.some((m) => m.includes('no es definida positiva'));
      return { pass, obtenido: r.valid ? 'Se ejecutó (incorrecto)' : r.validation.errors[0] };
    },
  });
  add({
    id: 'QA-2c', req: 2, nombre: 'Matriz singular (semidefinida)',
    entrada: 'A = matriz de unos 4×4 (rango 1), b = (1,1,1,1)',
    esperado: 'Se rechaza como no definida positiva',
    run() {
      const A = La.zeros(4).map((r) => r.map(() => 1));
      const r = E.runAll(A, [1, 1, 1, 1], E.DEFAULTS());
      return { pass: r.valid === false && !!r.validation.errors.length, obtenido: r.valid ? 'Se ejecutó (incorrecto)' : r.validation.errors[0] };
    },
  });
  add({
    id: 'QA-2d', req: 2, nombre: 'Entrada no numérica',
    entrada: 'Escenario Ideal con a₁₁ = "abc"',
    esperado: 'Se notifica la celda no numérica; no hay excepción',
    run() {
      const s = E.createSession().load('ideal'); s.setCell(0, 0, 'abc');
      let r; try { r = s.compute(); } catch (e) { return { pass: false, obtenido: `Excepción: ${e.message}` }; }
      return { pass: r.valid === false && r.validation.errors[0].includes('no numéricas'), obtenido: r.valid ? 'Se ejecutó (incorrecto)' : r.validation.errors[0] };
    },
  });
  add({
    id: 'QA-2e', req: 2, nombre: 'Tamaño menor que 4',
    entrada: 'Sistema 3×3 válido (A = I₃)',
    esperado: 'Se rechaza porque el desafío exige n ≥ 4',
    run() {
      const r = E.runAll(La.eye(3), [1, 2, 3], E.DEFAULTS());
      return { pass: r.valid === false && r.validation.errors[0].includes('al menos 4'), obtenido: r.valid ? 'Se ejecutó (incorrecto)' : r.validation.errors[0] };
    },
  });

  // ---------- 3. Edición dinámica ----------
  add({
    id: 'QA-3a', req: 3, nombre: 'Edición de coeficientes recalcula todo',
    entrada: 'Escenario Ideal: a₁₁ + 1, b₁ + 0.5',
    esperado: 'La solución de referencia, el GCP y los errores cambian y siguen siendo consistentes (A·x_ref = b; GCP ≈ referencia)',
    run() {
      const s = E.createSession().load('ideal'); const r1 = s.compute();
      s.setCell(0, 0, s.state.A[0][0] + 1); s.setB(0, s.state.b[0] + 0.5);
      const r2 = s.compute();
      const changed = La.maxAbsDiff(r1.xref, r2.xref) > 1e-6 && r1.gcp.x[0] !== r2.gcp.x[0];
      const res = La.norm2(La.sub(s.state.b, La.matVec(s.state.A, r2.xref))) / La.norm2(s.state.b);
      const eRel = rel(r2.gcp.x, r2.xref);
      return { pass: changed && res < 1e-12 && eRel < 1e-6, obtenido: `x₁ref: ${r1.xref[0].toFixed(4)} → ${r2.xref[0].toFixed(4)}; ‖b−A·xref‖/‖b‖ = ${sci(res)}; error GCP vs ref = ${sci(eRel)}` };
    },
  });
  add({
    id: 'QA-3b', req: 3, nombre: 'Sistema con solución conocida',
    entrada: 'A tridiagonal (4,1) 4×4 y b = A·(1,2,3,4)ᵀ = (6,12,18,19)',
    esperado: 'x_ref = x_GCP = (1,2,3,4) con error < 10⁻¹⁰',
    run() {
      const s = E.createSession().load('ideal');
      const A = [[4, 1, 0, 0], [1, 4, 1, 0], [0, 1, 4, 1], [0, 0, 1, 4]], b = [6, 12, 18, 19];
      for (let i = 0; i < 4; i++) { for (let j = i; j < 4; j++) s.setCell(i, j, A[i][j]); s.setB(i, b[i]); }
      const r = s.compute(); const t = [1, 2, 3, 4];
      const e1 = rel(r.xref, t), e2 = rel(r.gcp.x, t);
      return { pass: r.valid && e1 < 1e-10 && e2 < 1e-10, obtenido: `x_ref = [${r.xref.map((v) => v.toFixed(8)).join(', ')}]; error ref ${sci(e1)}, GCP ${sci(e2)} (${r.gcp.iterations} it.)` };
    },
  });
  add({
    id: 'QA-3c', req: 3, nombre: 'Agregar y quitar variables',
    entrada: 'Escenario Ideal → «Agregar variable» (n = 5) → «Quitar variable» (n = 4)',
    esperado: 'Con n = 5 el sistema se resuelve y converge; al volver a n = 4 el resultado original se recupera; no se puede bajar de 4',
    run() {
      const s = E.createSession().load('ideal'); const base = s.compute().xref.slice();
      const added = s.addVariable(); const r5 = s.compute();
      s.removeVariable(); const r4 = s.compute(); const below = s.removeVariable();
      const pass = added && r5.valid && r5.n === 5 && r5.gcp.converged && r4.n === 4 && rel(r4.xref, base) < 1e-12 && below === false;
      return { pass, obtenido: `n=5 válido: ${r5.valid}, GCP ${r5.gcp.iterations} it.; n=4 recuperado (Δ = ${sci(rel(r4.xref, base))}); quitar con n=4 → ${below}` };
    },
  });
  add({
    id: 'QA-3d', req: 3, nombre: 'Edición simétrica automática',
    entrada: 'Con «Mantener simetría» activo, editar a₁₃ = 0.1',
    esperado: 'a₃₁ también vale 0.1 y la matriz sigue siendo válida',
    run() {
      const s = E.createSession().load('ideal'); s.setCell(0, 2, 0.1); const r = s.compute();
      return { pass: s.state.A[2][0] === 0.1 && r.valid, obtenido: `a₁₃ = ${s.state.A[0][2]}, a₃₁ = ${s.state.A[2][0]}; válido: ${r.valid}` };
    },
  });

  // ---------- 4. Comparativa de precondicionamiento ----------
  add({
    id: 'QA-4a', req: 4, nombre: 'GCP vs GC en el escenario mal condicionado',
    entrada: 'Escenario Mal condicionado, tol = 10⁻⁶, x₀ = 0, Jacobi',
    esperado: 'it(GCP) ≤ it(GC) y κ(M⁻¹A) < κ(A)',
    run() {
      const r = E.createSession().load('ill').compute();
      const pass = r.gcp.converged && r.gc.converged && r.gcp.iterations <= r.gc.iterations && r.condMA.kappa < r.condA.kappa;
      return { pass, obtenido: `GC: ${r.gc.iterations} it. · GCP: ${r.gcp.iterations} it.; κ(A) = ${sci(r.condA.kappa)} → κ(M⁻¹A) = ${r.condMA.kappa.toPrecision(4)}; error rel. GC ${sci(r.errGC.errRelNorm2)} vs GCP ${sci(r.errGCP.errRelNorm2)}` };
    },
  });
  add({
    id: 'QA-4b', req: 4, nombre: 'Precondicionamiento en tres escenarios',
    entrada: 'Escenarios Ideal, Bajo estrés y Mal condicionado con Jacobi',
    esperado: 'En ninguno el GCP necesita más iteraciones que el GC',
    run() {
      const out = E.runScenarios(E.DEFAULTS());
      const rows = ids.map((id) => `${label[id]}: GC ${out[id].res.gc.iterations} / GCP ${out[id].res.gcp.iterations}`);
      return { pass: ids.every((id) => out[id].res.gcp.iterations <= out[id].res.gc.iterations), obtenido: rows.join(' · ') };
    },
  });
  add({
    id: 'QA-4c', req: 4, nombre: 'Laboratorio de escalamiento (n grande)',
    entrada: 'A = S·T·S, n = 40, relación de escalas 10³ (κ(A) ≫ 1)',
    esperado: 'GCP converge con muchas menos iteraciones que GC',
    run() {
      const l = E.labExperiment(40, 1e3);
      return { pass: l.gcp.converged && l.gcp.iterations < l.gc.iterations, obtenido: `GC ${l.gc.iterations} it. (${l.gc.converged ? 'conv.' : 'no conv.'}) · GCP ${l.gcp.iterations} it.; κ(A) = ${sci(l.kA)} → κ(M⁻¹A) = ${l.kMA.toPrecision(4)}` };
    },
  });

  // ---------- Pruebas adicionales ----------
  add({
    id: 'QA-5', req: 'X', nombre: 'Verificación SPD en los tres escenarios',
    entrada: 'Escenarios Ideal, Bajo estrés, Mal condicionado',
    esperado: 'A = Aᵀ, autovalores > 0, menores principales > 0 y Cholesky exitoso',
    run() {
      const rows = []; let pass = true;
      ids.forEach((id) => {
        const m = Model.build(id), v = E.validateSystem(m.A, m.b);
        pass = pass && v.ok && v.spd.minorsOk && v.symmetric.ok;
        rows.push(`${label[id]}: λmín = ${sci(v.spd?.minEig)}, Δmín = ${sci(Math.min(...(v.spd?.minors || [NaN])))}`);
      });
      return { pass, obtenido: rows.join(' · ') };
    },
  });
  add({
    id: 'QA-6', req: 'X', nombre: 'Métodos directos coinciden',
    entrada: 'Cholesky, LU con pivoteo y Gauss en los tres escenarios',
    esperado: 'Diferencia relativa < 10⁻⁹ entre los tres métodos',
    run() {
      let worst = 0;
      ids.forEach((id) => { const c = E.createSession().load(id).compute().direct.cross; worst = Math.max(worst, c.choleskyVsLu, c.choleskyVsGauss); });
      return { pass: worst < 1e-9, obtenido: `Máxima diferencia relativa = ${sci(worst)}` };
    },
  });
  add({
    id: 'QA-7', req: 'X', nombre: 'Matriz diagonal: κ y convergencia exacta',
    entrada: 'A = diag(1, 10, 100, 1000), b = (1,1,1,1)',
    esperado: 'κ(A) = 1000; con Jacobi κ(M⁻¹A) = 1 y GCP converge en 1 iteración',
    run() {
      const A = La.zeros(4); [1, 10, 100, 1000].forEach((v, i) => (A[i][i] = v));
      const r = E.runAll(A, [1, 1, 1, 1], E.DEFAULTS());
      const pass = Math.abs(r.condA.kappa - 1000) < 1e-6 && Math.abs(r.condMA.kappa - 1) < 1e-9 && r.gcp.iterations === 1;
      return { pass, obtenido: `κ(A) = ${r.condA.kappa.toFixed(4)}, κ(M⁻¹A) = ${r.condMA.kappa.toFixed(6)}, GCP ${r.gcp.iterations} it., GC ${r.gc.iterations} it.` };
    },
  });
  add({
    id: 'QA-8', req: 'X', nombre: 'Error relativo no definido si x_ref,i = 0',
    entrada: 'A = I₄, b = (1, 0, 2, 3)',
    esperado: 'Para i = 2 el error relativo/porcentual se marca como no definido (null) y los demás sí se calculan',
    run() {
      const r = E.runAll(La.eye(4), [1, 0, 2, 3], E.DEFAULTS());
      const c = r.errGCP.comps;
      return { pass: c[1].Er === null && c[1].Ep === null && c[0].Er !== null, obtenido: `Er₂ = ${c[1].Er}; Er₁ = ${sci(c[0].Er)}` };
    },
  });
  add({
    id: 'QA-9', req: 'X', nombre: 'Nmáx insuficiente se informa sin fallar',
    entrada: 'Escenario Mal condicionado, tol = 10⁻¹², Nmáx = 1',
    esperado: '«No convergió» en GC y GCP, sin excepción; se reporta el residuo alcanzado',
    run() {
      const s = E.createSession().load('ill'); s.set('tol', 1e-12); s.set('nmax', 1);
      let r; try { r = s.compute(); } catch (e) { return { pass: false, obtenido: `Excepción: ${e.message}` }; }
      return { pass: r.valid && !r.gc.converged && !r.gcp.converged && r.gcp.iterations === 1, obtenido: `GC conv. = ${r.gc.converged}, GCP conv. = ${r.gcp.converged}, residuo GCP = ${sci(r.gcp.trueResidual)}` };
    },
  });
  add({
    id: 'QA-10', req: 'X', nombre: 'Precondicionadores alternativos (SSOR, IC(0))',
    entrada: 'Escenario Mal condicionado con SSOR (ω = 1.2) e IC(0)',
    esperado: 'Ambos convergen a la misma solución que la referencia',
    run() {
      const out = [];
      let pass = true;
      [['ssor', 1.2], ['ic0', 1]].forEach(([p, w]) => {
        const s = E.createSession().load('ill'); s.set('precond', p); s.set('omega', w); const r = s.compute();
        const ok = r.valid && r.gcp.converged && rel(r.gcp.x, r.xref) < 1e-6;
        pass = pass && ok; out.push(`${p.toUpperCase()}: ${r.gcp.iterations} it., κ(M⁻¹A) = ${r.condMA.kappa.toPrecision(4)}`);
      });
      return { pass, obtenido: out.join(' · ') };
    },
  });
  add({
    id: 'QA-11', req: 'X', nombre: 'Consistencia entre escenarios (cambio de unidades)',
    entrada: 'Solución del escenario Mal condicionado convertida a Bs vs solución del Ideal',
    esperado: 'Coinciden (el mal escalamiento cambia el condicionamiento, no la respuesta financiera)',
    run() {
      const a = E.createSession().load('ideal'), b = E.createSession().load('ill');
      const xa = a.compute().xref.map((v) => v * 1000), xb = b.state.model.toBs(b.compute().xref);
      const e = rel(xb, xa);
      return { pass: e < 1e-6, obtenido: `Ideal: [${xa.map((v) => v.toFixed(0)).join(', ')}] Bs; Mal cond. → [${xb.map((v) => v.toFixed(0)).join(', ')}] Bs; diferencia ${sci(e)}` };
    },
  });
  add({
    id: 'QA-12', req: 'X', nombre: 'Vector inicial x₀ ≠ 0',
    entrada: 'Escenario Ideal con x₀ = D⁻¹b y con x₀ personalizado',
    esperado: 'El GCP converge a la misma solución de referencia',
    run() {
      const a = E.createSession().load('ideal'); a.set('x0Mode', 'diag'); const ra = a.compute();
      const b = E.createSession().load('ideal'); b.set('x0Mode', 'custom'); [10, 1, 10, 5].forEach((v, i) => b.setX0(i, v)); const rb = b.compute();
      const pass = ra.gcp.converged && rb.gcp.converged && rel(ra.gcp.x, ra.xref) < 1e-6 && rel(rb.gcp.x, rb.xref) < 1e-6;
      return { pass, obtenido: `x₀ = D⁻¹b: ${ra.gcp.iterations} it.; x₀ personalizado: ${rb.gcp.iterations} it.` };
    },
  });
  add({
    id: 'QA-13', req: 'X', nombre: 'Integridad de los datos del modelo',
    entrada: 'Datos de Hydrotech (Costos_hydrotech.xlsx y Ficha Financiera)',
    esperado: 'Plan de financiamiento = Bs 40.000; cada columna de J suma 1; costos por línea = totales del Excel',
    run() {
      const total = Model.PLAN_BS.reduce((a, b) => a + b, 0);
      const J = Model.build('ideal').J, colOk = [0, 1, 2, 3].every((j) => Math.abs(J.reduce((s, r) => s + r[j], 0) - 1) < 1e-12);
      const costs = [0, 1, 2, 3].map((i) => Model.lineCost(i));
      const target = [47.132, 33.076, 523.75, 625];
      const costOk = costs.every((c, i) => Math.abs(c - target[i]) < 5e-3);
      return { pass: total === 40000 && colOk && costOk, obtenido: `Plan = Bs ${total}; Σ columnas J = 1: ${colOk}; costos: ${costs.map((c) => c.toFixed(2)).join(' / ')}` };
    },
  });

  function runAll() {
    return T.map((t) => {
      let r;
      try { r = t.run(); } catch (e) { r = { pass: false, obtenido: `Excepción no controlada: ${e.message}` }; }
      return { id: t.id, req: t.req, nombre: t.nombre, entrada: t.entrada, esperado: t.esperado, obtenido: r.obtenido, pass: r.pass };
    });
  }

  HF.QA = { tests: T, runAll };
  if (typeof module !== 'undefined' && module.exports) module.exports = HF.QA;
})();
