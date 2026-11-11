/*
 * linalg.js — Álgebra lineal densa mínima, sin dependencias.
 * Contiene: utilidades de vectores/matrices, Cholesky, LU y Gauss con pivoteo,
 * determinantes (menores principales), autovalores simétricos (Jacobi cíclico)
 * y discos de Gershgorin.
 */
(function () {
  const HF = (globalThis.HF = globalThis.HF || {});
  const La = {};

  // ---------- utilidades básicas ----------
  La.zeros = (n, m = n) => Array.from({ length: n }, () => new Array(m).fill(0));
  La.eye = (n) => { const I = La.zeros(n); for (let i = 0; i < n; i++) I[i][i] = 1; return I; };
  La.clone = (A) => A.map((r) => r.slice());
  La.transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
  La.dot = (u, v) => { let s = 0; for (let i = 0; i < u.length; i++) s += u[i] * v[i]; return s; };
  La.norm2 = (v) => Math.sqrt(La.dot(v, v));
  La.sub = (u, v) => u.map((x, i) => x - v[i]);
  La.matVec = (A, x) => A.map((r) => { let s = 0; for (let j = 0; j < r.length; j++) s += r[j] * x[j]; return s; });
  La.matMul = (A, B) => {
    const n = A.length, k = B.length, m = B[0].length, C = La.zeros(n, m);
    for (let i = 0; i < n; i++)
      for (let p = 0; p < k; p++) {
        const a = A[i][p];
        if (a === 0) continue;
        for (let j = 0; j < m; j++) C[i][j] += a * B[p][j];
      }
    return C;
  };
  La.maxAbs = (A) => A.reduce((m, r) => r.reduce((mm, v) => Math.max(mm, Math.abs(v)), m), 0);
  La.isFiniteVec = (v) => v.every((x) => Number.isFinite(x));
  La.isFiniteMat = (A) => A.every((r) => La.isFiniteVec(r));
  La.maxAbsDiff = (u, v) => u.reduce((m, x, i) => Math.max(m, Math.abs(x - v[i])), 0);

  // ---------- simetría ----------
  La.symmetryCheck = (A, tol = 1e-9) => {
    const n = A.length;
    let maxDiff = 0, scale = 0, pi = -1, pj = -1;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) scale = Math.max(scale, Math.abs(A[i][j]));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const d = Math.abs(A[i][j] - A[j][i]);
        if (d > maxDiff) { maxDiff = d; pi = i; pj = j; }
      }
    const relDiff = scale > 0 ? maxDiff / scale : 0;
    return { ok: relDiff <= tol, maxDiff, relDiff, i: pi, j: pj };
  };
  La.symmetrize = (A) => A.map((r, i) => r.map((v, j) => (v + A[j][i]) / 2));

  // ---------- sustituciones ----------
  La.forwardSub = (L, b) => {            // L y = b  (L triangular inferior)
    const n = b.length, y = new Array(n);
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let j = 0; j < i; j++) s -= L[i][j] * y[j];
      y[i] = s / L[i][i];
    }
    return y;
  };
  La.backSubLT = (L, y) => {             // Lᵀ x = y
    const n = y.length, x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < n; j++) s -= L[j][i] * x[j];
      x[i] = s / L[i][i];
    }
    return x;
  };
  La.backSubU = (U, y) => {              // U x = y (U triangular superior)
    const n = y.length, x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < n; j++) s -= U[i][j] * x[j];
      x[i] = s / U[i][i];
    }
    return x;
  };

  // ---------- Cholesky A = L Lᵀ ----------
  La.cholesky = (A) => {
    const n = A.length, L = La.zeros(n);
    for (let j = 0; j < n; j++) {
      let s = A[j][j];
      for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
      if (!(s > 1e-14 * Math.abs(A[j][j])) || !(A[j][j] > 0)) {
        return { ok: false, failIndex: j, pivot: s, message: `Pivote no positivo en la fila ${j + 1} (valor ${s.toExponential(3)}).` };
      }
      L[j][j] = Math.sqrt(s);
      for (let i = j + 1; i < n; i++) {
        let t = A[i][j];
        for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k];
        L[i][j] = t / L[j][j];
      }
    }
    return { ok: true, L };
  };
  La.choleskySolve = (A, b) => {
    const f = La.cholesky(A);
    if (!f.ok) return { ok: false, message: f.message };
    const y = La.forwardSub(f.L, b);
    const x = La.backSubLT(f.L, y);
    return { ok: true, x, L: f.L, y };
  };

  // ---------- LU con pivoteo parcial: P A = L U ----------
  La.lu = (A) => {
    const n = A.length, U = La.clone(A), L = La.zeros(n), perm = [...Array(n).keys()];
    let sign = 1;
    for (let k = 0; k < n; k++) {
      let p = k, mx = Math.abs(U[k][k]);
      for (let i = k + 1; i < n; i++) if (Math.abs(U[i][k]) > mx) { mx = Math.abs(U[i][k]); p = i; }
      if (mx < 1e-300) return { ok: false, message: 'Matriz singular (pivote nulo en LU).', singularAt: k };
      if (p !== k) {
        [U[p], U[k]] = [U[k], U[p]];
        [L[p], L[k]] = [L[k], L[p]];
        [perm[p], perm[k]] = [perm[k], perm[p]];
        sign = -sign;
      }
      for (let i = k + 1; i < n; i++) {
        const f = U[i][k] / U[k][k];
        L[i][k] = f;
        for (let j = k; j < n; j++) U[i][j] -= f * U[k][j];
      }
    }
    for (let i = 0; i < n; i++) L[i][i] = 1;
    return { ok: true, L, U, perm, sign };
  };
  La.luSolve = (A, b) => {
    const f = La.lu(A);
    if (!f.ok) return f;
    const pb = f.perm.map((i) => b[i]);
    const y = La.forwardSub(f.L, pb);
    const x = La.backSubU(f.U, y);
    return { ok: true, x, L: f.L, U: f.U, perm: f.perm, y, pb };
  };
  La.det = (A) => {
    const f = La.lu(A);
    if (!f.ok) return 0;
    let d = f.sign;
    for (let i = 0; i < A.length; i++) d *= f.U[i][i];
    return d;
  };
  La.leadingMinors = (A) => {
    const out = [];
    for (let k = 1; k <= A.length; k++) out.push(La.det(A.slice(0, k).map((r) => r.slice(0, k))));
    return out;
  };

  // ---------- Eliminación de Gauss con pivoteo parcial (con traza) ----------
  La.gauss = (A, b, trace = false) => {
    const n = b.length, M = A.map((r, i) => [...r, b[i]]), steps = [];
    if (trace) steps.push({ label: 'Matriz aumentada [A | b]', M: La.clone(M) });
    for (let k = 0; k < n; k++) {
      let p = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
      if (Math.abs(M[p][k]) < 1e-300) return { ok: false, message: 'Matriz singular (pivote nulo en Gauss).' };
      if (p !== k) [M[p], M[k]] = [M[k], M[p]];
      for (let i = k + 1; i < n; i++) {
        const f = M[i][k] / M[k][k];
        for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
        M[i][k] = 0;
      }
      if (trace) steps.push({ label: `Paso ${k + 1}: pivote ${M[k][k].toExponential(3)}${p !== k ? ` (se intercambian filas ${k + 1} ↔ ${p + 1})` : ''}; se anula la columna ${k + 1} bajo la diagonal`, M: La.clone(M) });
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return { ok: true, x, steps };
  };

  // ---------- autovalores de matriz simétrica (Jacobi cíclico) ----------
  La.eigSym = (A0) => {
    const n = A0.length, A = La.clone(A0);
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0, dg = 0;
      for (let i = 0; i < n; i++) { dg += A[i][i] * A[i][i]; for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j]; }
      if (off <= 1e-30 * Math.max(dg, 1e-300)) break;
      for (let p = 0; p < n - 1; p++)
        for (let q = p + 1; q < n; q++) {
          const apq = A[p][q];
          if (Math.abs(apq) < 1e-300) continue;
          const theta = (A[q][q] - A[p][p]) / (2 * apq);
          const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          A[p][p] -= t * apq;
          A[q][q] += t * apq;
          A[p][q] = A[q][p] = 0;
          for (let r = 0; r < n; r++) {
            if (r === p || r === q) continue;
            const arp = A[r][p], arq = A[r][q];
            A[r][p] = A[p][r] = c * arp - s * arq;
            A[r][q] = A[q][r] = s * arp + c * arq;
          }
        }
    }
    return A.map((r, i) => r[i]).sort((a, b) => a - b);
  };

  // ---------- Gershgorin ----------
  La.gershgorin = (A) => {
    const discs = A.map((r, i) => {
      const rad = r.reduce((s, v, j) => (j === i ? s : s + Math.abs(v)), 0);
      return { i, center: r[i], radius: rad, lo: r[i] - rad, hi: r[i] + rad };
    });
    return { discs, strictlyDominant: discs.every((d) => d.center > d.radius), minLower: Math.min(...discs.map((d) => d.lo)) };
  };

  HF.La = La;
  if (typeof module !== 'undefined' && module.exports) module.exports = La;
})();
