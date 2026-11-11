/*
 * solvers.js — Gradientes Conjugados (GC) y Gradientes Conjugados Precondicionado (GCP),
 * precondicionadores (Jacobi, SSOR, IC(0)), números de condición y análisis de errores.
 *
 * Algoritmo GCP (forma estándar, Golub & Van Loan 2013 §11.5; Saad 2003 alg. 9.1),
 * con la notación del desafío (Suñagua, 2020):
 *   r0 = b − A x0 ;  M z0 = r0 ;  p0 = z0
 *   para k = 0,1,2,...
 *     α_k     = (r_kᵀ z_k) / (p_kᵀ A p_k)
 *     x_{k+1} = x_k + α_k p_k
 *     r_{k+1} = r_k − α_k A p_k
 *     M z_{k+1} = r_{k+1}
 *     β_k     = (r_{k+1}ᵀ z_{k+1}) / (r_kᵀ z_k)
 *     p_{k+1} = z_{k+1} + β_k p_k
 *   parada: ‖r_k‖₂ / ‖b‖₂ < tol  ó  k = Nmáx.
 * El GC simple es el caso M = I.
 */
(function () {
  const HF = (globalThis.HF = globalThis.HF || {});
  const La = HF.La || require('./linalg.js');
  const { dot, norm2, matVec, matMul, zeros } = La;

  const Precond = {};

  Precond.TYPES = {
    jacobi: 'Jacobi (diagonal)',
    ssor: 'SSOR (Gauss-Seidel simétrico)',
    ic0: 'Cholesky incompleto IC(0)',
  };

  /** Construye M (explícita, para κ(M⁻¹A)) y la función solve(r) = M⁻¹ r. */
  Precond.make = (A, type = 'jacobi', opts = {}) => {
    const n = A.length;
    if (type === 'jacobi') {
      const d = A.map((r, i) => r[i]);
      if (d.some((v) => !(v > 0))) return { ok: false, message: 'Jacobi requiere diagonal positiva.' };
      const M = zeros(n); d.forEach((v, i) => (M[i][i] = v));
      return { ok: true, type, name: Precond.TYPES.jacobi, M, solve: (r) => r.map((v, i) => v / d[i]) };
    }
    if (type === 'ssor') {
      const w = opts.omega ?? 1;
      if (!(w > 0 && w < 2)) return { ok: false, message: 'SSOR requiere 0 < ω < 2.' };
      const d = A.map((r, i) => r[i]);
      if (d.some((v) => !(v > 0))) return { ok: false, message: 'SSOR requiere diagonal positiva.' };
      const theta = w * (2 - w);
      const DL = zeros(n), DU = zeros(n), Dinv = zeros(n);
      for (let i = 0; i < n; i++) {
        Dinv[i][i] = 1 / d[i];
        DL[i][i] = d[i]; DU[i][i] = d[i];
        for (let j = 0; j < i; j++) { DL[i][j] = w * A[i][j]; DU[j][i] = w * A[i][j]; }
      }
      // M = (1/θ)(D+ωL) D⁻¹ (D+ωLᵀ)
      const M = matMul(matMul(DL, Dinv), DU).map((r) => r.map((v) => v / theta));
      const solve = (r) => {
        const t = r.map((v) => v * theta);
        const y = La.forwardSub(DL, t);
        const wv = y.map((v, i) => v * d[i]);
        return La.backSubU(DU, wv);
      };
      return { ok: true, type, name: `SSOR (ω = ${w})`, omega: w, M, solve };
    }
    if (type === 'ic0') {
      // IC(0): L con el mismo patrón de ceros que A
      const Lc = zeros(n);
      for (let k = 0; k < n; k++) {
        let s = A[k][k];
        for (let j = 0; j < k; j++) s -= Lc[k][j] * Lc[k][j];
        if (!(s > 1e-14 * Math.abs(A[k][k]))) return { ok: false, message: `IC(0) se rompe en la fila ${k + 1} (pivote ≤ 0).` };
        Lc[k][k] = Math.sqrt(s);
        for (let i = k + 1; i < n; i++) {
          if (A[i][k] === 0) continue;
          let t = A[i][k];
          for (let j = 0; j < k; j++) t -= Lc[i][j] * Lc[k][j];
          Lc[i][k] = t / Lc[k][k];
        }
      }
      const M = matMul(Lc, La.transpose(Lc));
      return {
        ok: true, type, name: Precond.TYPES.ic0, M, Lfactor: Lc,
        solve: (r) => La.backSubLT(Lc, La.forwardSub(Lc, r)),
        note: 'Con A densa, el patrón de IC(0) es completo y coincide con Cholesky (M = A).',
      };
    }
    return { ok: false, message: `Precondicionador desconocido: ${type}` };
  };

  // ---------- Gradientes Conjugados (Precondicionado) ----------
  function pcg(A, b, opts = {}) {
    const n = b.length;
    const tol = opts.tol ?? 1e-6, nmax = opts.nmax ?? 1000;
    const x = (opts.x0 || new Array(n).fill(0)).slice();
    const pre = opts.precond || null;
    const Ax = matVec(A, x);
    const r = b.map((v, i) => v - Ax[i]);
    const bn = norm2(b), den = bn > 0 ? bn : 1;
    let z = pre ? pre.solve(r) : r.slice();
    const p = z.slice();
    let rz = dot(r, z);
    const history = [norm2(r) / den];
    const steps = [{ k: 0, alpha: null, beta: null, res: history[0], x: x.slice() }];
    let k = 0, converged = history[0] < tol, breakdown = null;
    while (!converged && k < nmax) {
      const Ap = matVec(A, p), pAp = dot(p, Ap);
      if (!(pAp > 0)) { breakdown = 'pᵀAp ≤ 0: A no es definida positiva.'; break; }
      const alpha = rz / pAp;
      for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * Ap[i]; }
      z = pre ? pre.solve(r) : r.slice();
      const rzNew = dot(r, z), beta = rzNew / rz;
      for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
      rz = rzNew; k++;
      const res = norm2(r) / den;
      history.push(res);
      if (steps.length < 400) steps.push({ k, alpha, beta, res, x: x.slice() });
      if (!Number.isFinite(res)) { breakdown = 'Desbordamiento numérico.'; break; }
      converged = res < tol;
    }
    const tr = La.sub(b, matVec(A, x));
    return {
      x, iterations: k, converged, history, steps, breakdown,
      recursiveResidual: history[history.length - 1],
      trueResidual: norm2(tr) / den,
    };
  }

  // ---------- números de condición ----------
  /** κ₂(A) = λmax/λmin para A simétrica definida positiva. */
  function condSPD(A) {
    const ev = La.eigSym(La.symmetrize(A));
    const lmin = ev[0], lmax = ev[ev.length - 1];
    return { eig: ev, lmin, lmax, kappa: lmin > 0 ? lmax / lmin : Infinity };
  }
  /** κ(M⁻¹A) = cond de L⁻¹ A L⁻ᵀ con M = L Lᵀ (mismos autovalores que M⁻¹A). */
  function condPreconditioned(A, M) {
    const f = La.cholesky(M);
    if (!f.ok) return { eig: [], kappa: NaN, message: 'M no es definida positiva' };
    const n = A.length, Y = zeros(n);
    for (let j = 0; j < n; j++) {
      const col = La.forwardSub(f.L, A.map((r) => r[j]));
      for (let i = 0; i < n; i++) Y[i][j] = col[i];
    }
    const C = zeros(n);
    const Yt = La.transpose(Y);
    for (let j = 0; j < n; j++) {
      const col = La.forwardSub(f.L, Yt.map((r) => r[j]));
      for (let i = 0; i < n; i++) C[i][j] = col[i];
    }
    const ev = La.eigSym(La.symmetrize(C));
    return { eig: ev, lmin: ev[0], lmax: ev[ev.length - 1], kappa: ev[0] > 0 ? ev[ev.length - 1] / ev[0] : Infinity };
  }

  // ---------- análisis de errores ----------
  function errorAnalysis(xref, x, A, b) {
    const comps = xref.map((xr, i) => {
      const Ea = Math.abs(xr - x[i]);
      const defined = Math.abs(xr) > 1e-14;
      const Er = defined ? Ea / Math.abs(xr) : null;
      return { i, xref: xr, x: x[i], Ea, Er, Ep: Er === null ? null : Er * 100 };
    });
    const bn = norm2(b);
    const res = La.sub(b, matVec(A, x));
    return {
      comps,
      residualRel: bn > 0 ? norm2(res) / bn : null,
      errNorm2: norm2(La.sub(xref, x)),
      errRelNorm2: norm2(xref) > 0 ? norm2(La.sub(xref, x)) / norm2(xref) : null,
    };
  }

  HF.Precond = Precond;
  HF.Solvers = { pcg, condSPD, condPreconditioned, errorAnalysis };
  if (typeof module !== 'undefined' && module.exports) module.exports = { Precond, ...HF.Solvers };
})();
