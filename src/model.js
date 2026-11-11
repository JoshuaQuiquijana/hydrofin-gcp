/*
 * model.js — Modelo financiero de Hydrotech y constructor de los tres escenarios.
 *
 * Modelo (asignación presupuestaria regularizada, mínimos cuadrados ponderados):
 *   Φ(x) = ½ Σ_k w_k ( (J x)_k − y_k )²  +  ½ Σ_i ρ_i ( x_i − x⁰_i )²
 *   ∇Φ = 0  ⇒  (JᵀWJ + R) x = JᵀW y + R x⁰   ⇒   A x = b
 *
 *   x_i  : inversión asignada a la línea de negocio i (miles de Bs)
 *   J_ki : fracción del costo de la línea i que corresponde al rubro k (columnas suman 1)
 *   y_k  : presupuesto planificado del rubro k (Ficha Financiera, necesidad de Bs 40.000)
 *   x⁰_i : mezcla actual de actividad (proporcional a los ingresos mensuales)
 *   ρ_i  : costo de reorganizar (inercia operativa) ;  w_k : prioridad del rubro k
 *
 * Todos los datos de COSTOS provienen de Costos_hydrotech.xlsx; los INGRESOS y el PLAN de
 * financiamiento provienen de la Ficha Financiera. Los parámetros del escenario de estrés
 * son SUPUESTOS de simulación (documentados abajo), no datos observados.
 */
(function () {
  const HF = (globalThis.HF = globalThis.HF || {});
  const La = HF.La || require('./linalg.js');

  const RUBROS = [
    { id: 'insumos', name: 'Materia prima e insumos', ficha: 'Materia prima/inventario' },
    { id: 'equipo', name: 'Equipo, infraestructura y tecnología', ficha: 'Equipo/maquinaria + Adecuación e infraestructura + Tecnología' },
    { id: 'personal', name: 'Personal', ficha: 'Personal' },
    { id: 'operacion', name: 'Operación, comercialización y capital de trabajo', ficha: 'Capital de trabajo + Marketing' },
  ];
  // Plan de financiamiento (Bs) por rubro — Ficha Financiera, sección E (suma Bs 40.000)
  const PLAN_BS = [12000, 5000 + 5500 + 3000, 7500, 5000 + 2000];

  const LINES = [
    { id: 'hort', name: 'Hortalizas hidropónicas', short: 'Hortalizas', sheet: 'costos Lech', units: 72, incomeBs: 1008, incomeNote: 'Ficha Financiera (A. Mis ingresos)' },
    { id: 'plan', name: 'Plantines', short: 'Plantines', sheet: 'Plantínes', units: 100, incomeBs: 100, incomeNote: 'Estimado: 100 plantines × Bs 1 (hoja Plantínes); no figura en la Ficha' },
    { id: 'kits', name: 'Kits hidropónicos familiares', short: 'Kits', sheet: 'Kits Hidr', units: 1, incomeBs: 700, incomeNote: 'Ficha Financiera: sistema hidropónico familiar' },
    { id: 'cap', name: 'Capacitaciones', short: 'Capacitaciones', sheet: 'Capacitaciones', units: 9, incomeBs: 360, incomeNote: 'Ficha Financiera (A. Mis ingresos)' },
  ];

  // Ítems de costo mensual (Bs) por línea, con rubro asignado (índice en RUBROS)
  const ITEMS = [
    [ // Hortalizas (hoja "costos Lech", 72 unidades/mes)
      ['Semillas', 1.08, 0], ['Solución nutritiva', 0.108, 0], ['Agua para solución nutritiva', 0.864, 0],
      ['Bajador de pH', 0.04, 0], ['Jabón potásico', 2.4, 0], ['Embalaje y etiquetado', 21.6, 0],
      ['Depreciación de maquinaria', 1.25, 1], ['Depreciación del sistema', 0.67, 1],
      ['Energía eléctrica', 6.32, 3], ['Gas', 8, 3], ['Agua', 4.8, 3],
    ],
    [ // Plantines (hoja "Plantínes", 100 unidades/mes)
      ['Semillas de lechuga verde crespa', 0.75, 0], ['Solución nutritiva', 2.0, 0], ['Agua para solución nutritiva', 0.221, 0],
      ['Embalaje y etiquetado', 20, 0], ['Materiales de limpieza', 9, 0], ['Agua', 1.105, 3],
    ],
    [ // Kits (hoja "Kits Hidr", 1 kit)
      ['Manual', 5, 0], ['Solución nutritiva', 120, 0], ['Semillas/plantines', 10, 0],
      ['Tubos y accesorios', 32.5, 1], ['Tubo PVC 3"', 30, 1], ['Tubo PVC 2"', 26.25, 1], ['Codos', 12, 1], ['T', 28, 1],
      ['Y', 14, 1], ['Reductor inyectado', 28, 1], ['Balde', 35, 1], ['Bomba de agua', 130, 1], ['Manguera', 3, 1],
      ['Transporte y acompañamiento', 50, 3],
    ],
    [ // Capacitaciones (hoja "Capacitaciones", 9 participantes)
      ['Material didáctico', 18, 0], ['Facilitador (mano de obra)', 315, 2], ['Refrigerio para participantes', 135, 3],
      ['Publicidad y difusión', 112, 3], ['Transporte de materiales', 45, 3],
    ],
  ];

  const lineCost = (i) => ITEMS[i].reduce((s, it) => s + it[1], 0);
  const unitCost = (i) => lineCost(i) / LINES[i].units;       // Bs por unidad (c_i)

  /** Escenarios. `mult` = inflación por rubro; `sales` = factor de ventas por línea. */
  const SCENARIOS = {
    ideal: {
      id: 'ideal', name: 'Ideal', short: 'Ideal',
      mult: [1, 1, 1, 1], sales: [1, 1, 1, 1], rho: 0.25, w: [1, 1, 1, 1], unitScaled: false,
      resumen: 'Operación estable: costos y ventas actuales de Hydrotech, inercia moderada.',
    },
    stress: {
      id: 'stress', name: 'Bajo estrés financiero', short: 'Bajo estrés',
      mult: [1.30, 1.15, 1.10, 1.20], sales: [0.90, 0.90, 0.70, 0.75], rho: 0.25, w: [1, 1, 1, 1], unitScaled: false,
      resumen: 'Inflación de costos por rubro y caída de ventas por línea (supuestos de simulación).',
    },
    ill: {
      id: 'ill', name: 'Mal condicionado', short: 'Mal condicionado',
      mult: [1, 1, 1, 1], sales: [1, 1, 1, 1], rho: 0.25, w: [1, 1, 1, 1], unitScaled: true,
      resumen: 'Mismo modelo ideal, pero cada variable se mide en su unidad operativa (unidades financiables al costo unitario de la línea): mal escalamiento diagonal.',
    },
  };

  function build(id) {
    const sc = SCENARIOS[id];
    const n = LINES.length;
    // J: estructura de costos por rubro, con inflación diferenciada
    const J = La.zeros(4, n);
    for (let j = 0; j < n; j++) {
      let tot = 0;
      for (const [, amt, r] of ITEMS[j]) { J[r][j] += amt * sc.mult[r]; tot += amt * sc.mult[r]; }
      for (let r = 0; r < 4; r++) J[r][j] /= tot;
    }
    const y = PLAN_BS.map((v, k) => (v * sc.mult[k]) / 1000);                      // miles de Bs
    const incTot = LINES.reduce((s, l) => s + l.incomeBs, 0);
    const x0 = LINES.map((l, i) => ((l.incomeBs / incTot) * 40) * sc.sales[i]);      // miles de Bs
    const Jt = La.transpose(J);
    const A = La.zeros(n), b = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += sc.w[k] * J[k][i] * J[k][j];
        A[i][j] = s + (i === j ? sc.rho : 0);
      }
      let t = sc.rho * x0[i];
      for (let k = 0; k < 4; k++) t += sc.w[k] * J[k][i] * y[k];
      b[i] = t;
    }
    let Af = A, bf = b, bsPerUnit = LINES.map(() => 1000), S = null;
    if (sc.unitScaled) {
      S = LINES.map((_, i) => unitCost(i) / 1000);           // miles de Bs por unidad
      Af = A.map((r, i) => r.map((v, j) => S[i] * v * S[j]));
      bf = b.map((v, i) => S[i] * v);
      bsPerUnit = LINES.map((_, i) => unitCost(i));
    }
    return {
      id, name: sc.name, short: sc.short, resumen: sc.resumen, params: sc,
      names: LINES.map((l) => l.short),
      unit: sc.unitScaled ? 'unidades financiables/mes' : 'miles de Bs',
      A: Af, b: bf, J, y, x0, S, bsPerUnit,
      toBs: (x) => x.map((v, i) => v * bsPerUnit[i]),
    };
  }

  HF.Model = { RUBROS, PLAN_BS, LINES, ITEMS, SCENARIOS, lineCost, unitCost, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = HF.Model;
})();
