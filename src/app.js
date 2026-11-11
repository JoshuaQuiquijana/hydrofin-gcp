/*
 * app.js — Interfaz: estado reactivo (sesión del motor) + renderizado de los 10 módulos.
 * Toda la matemática vive en engine.js / solvers.js / linalg.js; aquí solo se presenta.
 */
(function () {
  const HF = globalThis.HF;
  const { La, Engine: E, Model: M, Precond, Charts: Ch, CONFIG: CF, QA } = HF;
  const sess = E.createSession();
  const baseline = E.runScenarios(E.DEFAULTS());          // resultados "de referencia" con ajustes por defecto
  const ui = { errMethod: 'gcp', errFmt: 'dec', cmp: null, qa: null, qaUi: null };

  // ---------- utilidades ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const SUBD = '₀₁₂₃₄₅₆₇₈₉';
  const sb = (i) => String(i).split('').map((c) => SUBD[+c]).join('');
  const EXPD = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const spw = (e) => String(e).split('').map((c) => (c === '-' ? '⁻' : EXPD[+c])).join('');
  function sci(v, d = 2) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    if (!Number.isFinite(v)) return '∞';
    if (v === 0) return '0';
    const [m, e] = v.toExponential(d).split('e');
    return `${m}·10${spw(parseInt(e, 10))}`;
  }
  function fmt(v, d = 6) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    if (!Number.isFinite(v)) return '∞';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a < 1e-4 || a >= 1e7) return sci(v, Math.max(2, d - 3));
    return String(parseFloat(v.toPrecision(d)));
  }
  const money = (v) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const vecE = (v) => `[${v.map((x) => (x === null ? '—' : x === 0 ? '0' : x.toExponential(2))).join(', ')}]`;
  const vec = (v, d = 5) => `[${v.map((x) => fmt(x, d)).join(', ')}]`;
  const varName = (i) => `x${sb(i + 1)}`;
  const kappaTxt = (k) => (Number.isFinite(k) ? (k >= 1e4 ? sci(k, 2) : fmt(k, 4)) : '∞');
  const STATE_NAME = { ideal: 'Ideal', stress: 'Bajo estrés', ill: 'Mal condicionado' };

  function matHtml(A, f = (v) => fmt(v, 5)) {
    return `<div class="mat"><table>${A.map((r) => `<tr>${r.map((v) => `<td>${f(v)}</td>`).join('')}</tr>`).join('')}</table></div>`;
  }
  function colHtml(v, f = (x) => fmt(x, 5)) { return matHtml(v.map((x) => [x]), f); }
  function table(head, rows, { cls = '', numCols = [] } = {}) {
    return `<div class="tablewrap"><table class="t ${cls}"><thead><tr>${head.map((h, i) => `<th class="${numCols.includes(i) ? 'n' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  const tr = (cells, numCols = []) => `<tr>${cells.map((c, i) => `<td class="${numCols.includes(i) ? 'n' : ''}">${c}</td>`).join('')}</tr>`;
  const badge = (ok, yes = 'Sí', no = 'No') => `<span class="badge ${ok ? 'ok' : 'no'}">${ok ? yes : no}</span>`;

  // =====================================================================
  // MÓDULO 1 — Inicio
  // =====================================================================
  function render1() {
    const ill = baseline.ill.res, c = CF;
    $('b1').innerHTML = `
      <div class="eyebrow">${esc(c.asignatura)}</div>
      <h1>Asignación del financiamiento de Hydrotech con Gradientes Conjugados Precondicionado</h1>
      <p>Aplicación web que formula el reparto de la necesidad de financiamiento de un emprendimiento hidropónico real como un sistema lineal simétrico definido positivo <b>Ax = b</b> (n = 4), lo resuelve con un método directo y con GC / GCP, y analiza precisión, condicionamiento y velocidad de convergencia en tres escenarios: <b>ideal</b>, <b>bajo estrés</b> y <b>mal condicionado</b>.</p>
      <div class="idcard">
        <div><b>Estudiante</b>${esc(c.estudiante)}</div><div><b>Mención</b>${esc(c.mencion)}</div>
        <div><b>Universidad</b>${esc(c.universidad)}</div><div><b>Facultad · Carrera</b>${esc(c.facultad)} · ${esc(c.carrera)}</div>
        <div><b>Modalidad</b>${esc(c.modalidad)}</div><div><b>Área</b>Finanzas · Gestión del emprendimiento Hydrotech</div>
        <div><b>Fecha</b>${esc(c.fecha)}</div>${c.repoUrl ? `<div><b>Código fuente</b><a href="${esc(c.repoUrl)}" target="_blank" rel="noopener">${esc(c.repoUrl)}</a></div>` : ''}
      </div>
      <div class="kpis">
        <div class="kpi"><div class="v">4</div><div class="l">variables (líneas de negocio), n ≥ 4</div></div>
        <div class="kpi"><div class="v">10⁻⁶</div><div class="l">tolerancia ‖rₖ‖/‖b‖</div></div>
        <div class="kpi"><div class="v">${kappaTxt(ill.condA.kappa)}</div><div class="l">κ(A) en el escenario mal condicionado</div></div>
        <div class="kpi"><div class="v">${kappaTxt(ill.condMA.kappa)}</div><div class="l">κ(M⁻¹A) con Jacobi (mismo escenario)</div></div>
        <div class="kpi"><div class="v">${ill.gc.iterations} → ${ill.gcp.iterations}</div><div class="l">iteraciones GC → GCP (mal condicionado)</div></div>
        <div class="kpi"><div class="v" id="kpi-qa">…</div><div class="l">pruebas QA aprobadas</div></div>
      </div>
      <h3 style="color:#fff">Guía de uso</h3>
      <ol class="steps">
        <li>En <a href="#m5">Tres escenarios</a> carga <b>Ideal</b>, <b>Bajo estrés</b> o <b>Mal condicionado</b> y compara la tabla.</li>
        <li>En <a href="#m4">Entrada de datos</a> edita cualquier coeficiente de A o b: todo se recalcula al instante.</li>
        <li>Cambia la tolerancia, x₀ o el precondicionador (Jacobi, SSOR, IC(0)) y observa <a href="#m7">GCP vs GC</a>.</li>
        <li>Revisa los errores por variable en <a href="#m8">Análisis de errores</a> y el método directo en <a href="#m6">Solución de referencia</a>.</li>
        <li>Verifica el software en <a href="#m9">Pruebas QA</a>: provoca una matriz inválida y mira cómo se notifica.</li>
      </ol>`;
    $('foot-text').textContent = `HydroFin · ${c.estudiante} · ${c.universidad} · ${c.asignatura}`;
  }

  // =====================================================================
  // MÓDULO 2 — Caso de estudio
  // =====================================================================
  function render2() {
    const L = M.LINES, planTot = M.PLAN_BS.reduce((a, b) => a + b, 0);
    const linesRows = L.map((l, i) => tr([`<b>${esc(l.name)}</b>`, esc(l.sheet), l.units, fmt(M.lineCost(i), 6), fmt(M.unitCost(i), 4), money(l.incomeBs), `<span class="small muted">${esc(l.incomeNote)}</span>`], [2, 3, 4, 5]));
    const planRows = M.RUBROS.map((r, k) => tr([`<b>${esc(r.name)}</b>`, `<span class="small muted">${esc(r.ficha)}</span>`, money(M.PLAN_BS[k]), `${(100 * M.PLAN_BS[k] / planTot).toFixed(1)} %`], [2, 3]));
    const det = L.map((l, i) => {
      const tot = M.lineCost(i);
      const rows = M.ITEMS[i].map(([n, a, r]) => tr([esc(n), fmt(a, 5), esc(M.RUBROS[r].name), `${(100 * a / tot).toFixed(1)} %`], [1, 3]));
      return `<details><summary>${esc(l.name)} — costo mensual Bs ${fmt(tot, 6)} (hoja «${esc(l.sheet)}»)</summary>${table(['Ítem de costo', 'Bs/mes', 'Rubro asignado', '% de la línea'], rows, { numCols: [1, 3] })}</details>`;
    }).join('');
    $('b2').innerHTML = `
      <p><b>Hydrotech</b> es un emprendimiento familiar de hidroponía que vende <b>hortalizas</b>, <b>plantines</b>, <b>kits hidropónicos</b> para hogares y <b>capacitaciones</b>. Con un financiamiento de <b>Bs ${money(planTot)}</b> en el horizonte, la pregunta de gestión es: <i>¿cuánto de ese capital conviene asignar a cada línea de negocio, de modo que cada rubro (insumos, equipo, personal, operación) reciba su presupuesto planificado sin desorganizar la operación actual?</i></p>
      <h3>Por qué este problema conduce a un sistema lineal SPD</h3>
      <p>Cada línea consume los cuatro rubros en proporciones distintas (su estructura de costos real). Si x<sub>i</sub> es lo invertido en la línea i, el gasto resultante en el rubro k es (Jx)<sub>k</sub>. Se busca el x que minimiza la desviación respecto del presupuesto de cada rubro, penalizando también alejarse de la mezcla actual (costo de reorganizar). Es un problema de <b>mínimos cuadrados regularizado</b> cuyas ecuaciones normales son <b>Ax = b</b> con A simétrica y definida positiva — justo el caso para el que se diseñó el GCP. Es un modelo de <i>planificación de recursos entre unidades</i>, coherente con la mención de Desarrollo de Software (simulador de asignación presupuestaria con validaciones y pruebas).</p>
      <h3>Líneas de negocio y datos de origen</h3>
      ${table(['Línea (variable)', 'Hoja del Excel', 'Unidades/mes', 'Costo mensual (Bs)', 'Costo unitario c<sub>i</sub> (Bs)', 'Ingreso mensual (Bs)', 'Procedencia del ingreso'], linesRows, { numCols: [2, 3, 4, 5] })}
      <h3>Plan de financiamiento por rubro</h3>
      ${table(['Rubro k', 'Composición en la Ficha Financiera', 'Plan y<sub>k</sub> (Bs)', '%'], planRows, { numCols: [2, 3] })}
      <p class="small muted">Total: Bs ${money(planTot)} (coincide con «Monto total que necesito» de la Ficha Financiera).</p>
      <h3>Detalle de costos y asignación a rubros</h3>
      <p class="small muted">Cada ítem de costo de Costos_hydrotech.xlsx se asigna a un rubro; la proporción de la línea en cada rubro forma las columnas de la matriz J (sus columnas suman 1).</p>
      ${det}
      <h3>Procedencia de los datos y supuestos</h3>
      <ul>
        <li><b>Datos reales de Hydrotech:</b> costos por ítem y por línea (Costos_hydrotech.xlsx), ingresos mensuales y plan de financiamiento de Bs 40.000 (Ficha Financiera).</li>
        <li><b>Estimación:</b> el ingreso de plantines (Bs 100/mes = 100 unidades × Bs 1) no figura en la Ficha; se estimó con la hoja «Plantínes».</li>
        <li><b>Dato corregido:</b> la Ficha tiene los «costos» en 0; por eso el modelo usa las hojas de costos detalladas.</li>
        <li><b>Parámetros de modelado (no son datos):</b> ρ<sub>i</sub> = 0,25 (inercia operativa) y w<sub>k</sub> = 1 (rubros con igual prioridad). Son editables en la matriz y su efecto es visible en tiempo real.</li>
        <li><b>Escenario de estrés:</b> las inflaciones por rubro y caídas de ventas son <b>hipótesis de simulación</b>, no mediciones.</li>
      </ul>`;
  }

  // =====================================================================
  // MÓDULO 3 — Formulación (parte estática + parte dinámica)
  // =====================================================================
  function render3Static() {
    const L = M.LINES;
    const vars = L.map((l, i) => tr([`<b>${varName(i)}</b>`, `Inversión asignada a <b>${esc(l.name)}</b>`, 'miles de Bs (escenarios 1 y 2)', `${esc(l.short)}: unidades financiables/mes (escenario 3), c<sub>${i + 1}</sub> = Bs ${fmt(M.unitCost(i), 4)}/unidad`])).join('');
    const sc = M.SCENARIOS;
    const paramRows = ['ideal', 'stress', 'ill'].map((id) => tr([`<b>${STATE_NAME[id]}</b>`, sc[id].rho, `(${sc[id].mult.map((v) => v.toFixed(2).replace('.', ',')).join('; ')})`, `(${sc[id].sales.map((v) => v.toFixed(2).replace('.', ',')).join('; ')})`, sc[id].unitScaled ? 'S = diag(c<sub>i</sub>/1000): A₃ = S·A₁·S' : 'miles de Bs'])).join('');
    $('b3').innerHTML = `
      <h3>Variables</h3>
      ${table(['Variable', 'Significado financiero', 'Unidad (esc. 1 y 2)', 'Unidad (esc. 3 — mal condicionado)'], [vars])}
      <h3>Modelo</h3>
      <div class="formula">Φ(x) = ½ Σₖ wₖ [ (J x)ₖ − yₖ ]²  +  ½ Σᵢ ρᵢ ( xᵢ − x⁰ᵢ )²
∇Φ(x) = 0  ⟹  ( JᵀWJ + R ) x = JᵀW y + R x⁰   ⟹   A x = b
A = JᵀWJ + R          b = JᵀW y + R x⁰</div>
      <ul class="small">
        <li><b>J</b> (4×4): J<sub>ki</sub> = fracción del costo de la línea i que va al rubro k (estructura de costos real). <b>y</b>: presupuesto planificado por rubro (miles de Bs). <b>x⁰</b>: mezcla actual proporcional a los ingresos. <b>W = diag(w)</b>, <b>R = diag(ρ)</b>.</li>
        <li><b>Interpretación de a<sub>ii</sub></b> = Σₖ wₖ J²<sub>ki</sub> + ρᵢ: «rigidez» de la línea i — cuánto penaliza el modelo desviar el gasto de los rubros que esa línea consume y reorganizarla.</li>
        <li><b>Interpretación de a<sub>ij</sub></b> (i ≠ j) = Σₖ wₖ J<sub>ki</sub> J<sub>kj</sub> ≥ 0: <i>acoplamiento</i>. Las líneas i y j compiten por los mismos rubros; si una recibe más capital, el modelo reduce la otra para no exceder el presupuesto compartido. Es simétrico porque la competencia es mutua.</li>
        <li><b>Interpretación de b<sub>i</sub></b> = Σₖ wₖ J<sub>ki</sub> yₖ + ρᵢ x⁰ᵢ: «empuje» de la línea i — cuánto capital reclaman los rubros que consume más su nivel actual de actividad.</li>
      </ul>
      <h4>Parámetros por escenario</h4>
      ${table(['Escenario', 'ρ<sub>i</sub>', 'Inflación por rubro (insumos; equipo; personal; operación)', 'Factor de ventas (hort.; plant.; kits; cap.)', 'Medida de las variables'], [paramRows])}
      <h3>Demostración formal: A es simétrica y definida positiva</h3>
      <ol>
        <li><b>Simetría.</b> W y R son diagonales ⟹ (JᵀWJ)ᵀ = JᵀWᵀJ = JᵀWJ y Rᵀ = R ⟹ Aᵀ = A.</li>
        <li><b>Definición positiva (escenarios 1 y 2).</b> Para x ≠ 0: xᵀAx = Σₖ wₖ (Jx)ₖ² + Σᵢ ρᵢ xᵢ² ≥ ρ<sub>mín</sub>‖x‖² &gt; 0, pues wₖ ≥ 0 y ρᵢ &gt; 0. Además λ<sub>mín</sub>(A) ≥ ρ<sub>mín</sub> = 0,25.</li>
        <li><b>Escenario 3.</b> A₃ = S A₁ S con S diagonal invertible (c<sub>i</sub> &gt; 0): A₃ᵀ = A₃ y xᵀA₃x = (Sx)ᵀA₁(Sx) &gt; 0 para x ≠ 0 (congruencia). El mal escalamiento no destruye la positividad, solo agranda κ.</li>
        <li><b>Verificación numérica</b> (autovalores y criterio de Sylvester) — abajo, para los tres escenarios y para la matriz actualmente cargada.</li>
      </ol>
      <div id="f-dyn"></div>`;
  }

  function render3Dynamic() {
    const out = {}; ['ideal', 'stress', 'ill'].forEach((id) => { const m = M.build(id); out[id] = { m, v: E.validateSystem(m.A, m.b) }; });
    const rows = ['ideal', 'stress', 'ill'].map((id) => {
      const { v } = out[id];
      return tr([`<b>${STATE_NAME[id]}</b>`, sci(v.symmetric.relDiff, 1), sci(v.spd.minEig), sci(v.spd.maxEig), v.spd.minors.map((x, k) => `Δ${sb(k + 1)} = ${sci(x, 2)}`).join('<br>'), kappaTxt(v.spd.maxEig / v.spd.minEig), badge(v.ok, 'SPD ✓', 'No')], [1, 2, 3, 5]);
    });
    const res = sess.compute(), v = res.validation, st = sess.state;
    let cur = '';
    if (v && v.symmetric && v.spd) {
      cur = `<p>Simetría: error relativo máx. ${sci(v.symmetric.relDiff, 1)} ${badge(v.symmetric.ok, '✓', '✗')} · λ<sub>mín</sub> = ${sci(v.spd.minEig)} · λ<sub>máx</sub> = ${sci(v.spd.maxEig)} · menores principales: ${v.spd.minors.map((x, k) => `Δ${sb(k + 1)} = ${sci(x, 2)}`).join(', ')} ${badge(v.spd.minorsOk && v.spd.ok, 'todos > 0 ✓', 'falla')}.<br>Gershgorin: ${v.gershgorin.strictlyDominant ? 'A es estrictamente diagonal dominante ⇒ SPD (condición suficiente).' : 'A no es diagonal dominante (la definición positiva se concluye por autovalores/Sylvester).'}</p>`;
    } else if (v) cur = `<div class="callout bad"><b>La matriz actual no se puede verificar:</b> ${esc((v.errors || []).join(' '))}</div>`;
    $('f-dyn').innerHTML = `
      ${table(['Escenario', 'Error de simetría', 'λ<sub>mín</sub>', 'λ<sub>máx</sub>', 'Menores principales (Sylvester)', 'κ(A)', 'SPD'], rows, { numCols: [1, 2, 3, 5] })}
      <h3>Sistema actualmente cargado: ${esc(STATE_NAME[st.scenarioId] || st.scenarioId)}${st.modified ? ' <span class="badge info">modificado</span>' : ''}</h3>
      <div class="mats"><span class="mono">A =</span>${matHtml(st.A, (x) => fmt(x, 5))}<span class="mono">b =</span>${colHtml(st.b, (x) => fmt(x, 5))}</div>
      <p class="small muted">Unidad de las variables: ${esc(st.unit)}. Ecuaciones: ${st.b.map((_, i) => `(${i + 1}) ` + st.A[i].map((a, j) => `${fmt(a, 4)}·${varName(j)}`).join(' + ') + ` = ${fmt(st.b[i], 4)}`).slice(0, 3).join(' &nbsp;|&nbsp; ')} …</p>
      ${cur}`;
  }

  // =====================================================================
  // MÓDULO 4 — Entrada de datos
  // =====================================================================
  const cellStr = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(6))) : '');
  function render4Static() {
    $('b4').innerHTML = `
      <p>Edita directamente los coeficientes de <b>A</b> y los términos independientes <b>b</b>. Con «Mantener simetría» activo, al cambiar a<sub>ij</sub> se actualiza a<sub>ji</sub>. Los resultados de los módulos 5–8 se recalculan al instante.</p>
      <div class="row"><span class="mono">Escenario cargado:</span> <span id="scen-badge" class="badge info"></span>
        <button data-load="ideal" class="sc-ideal">Ideal</button><button data-load="stress" class="sc-stress">Bajo estrés</button><button data-load="ill" class="sc-ill">Mal condicionado</button></div>
      <div id="editor" class="editor"></div>
      <div class="controls">
        <label class="f">Tolerancia (‖rₖ‖/‖b‖ &lt; tol)<input type="text" id="ctl-tol" inputmode="decimal" aria-label="Tolerancia"></label>
        <label class="f">Iteraciones máximas Nmáx<input type="text" id="ctl-nmax" inputmode="numeric" aria-label="Nmáx"></label>
        <label class="f">Precondicionador M<select id="ctl-pre">${Object.entries(Precond.TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label class="f" id="omega-wrap">Parámetro ω de SSOR (0 &lt; ω &lt; 2)<input type="text" id="ctl-omega" inputmode="decimal"></label>
        <label class="f">Vector inicial x₀<select id="ctl-x0"><option value="zero">x₀ = 0 (por defecto)</option><option value="diag">x₀ = D⁻¹b</option><option value="custom">x₀ personalizado</option></select></label>
      </div>
      <div id="x0-custom" class="row"></div>
      <div class="row">
        <label class="f chk"><input type="checkbox" id="ctl-sym"> Mantener simetría al editar</label>
        <button class="primary" id="btn-run">▶ Ejecutar y ver resultados</button>
        <button id="btn-reset">↺ Restablecer escenario</button>
        <button id="btn-symm">Simetrizar A ← (A+Aᵀ)/2</button>
        <button id="btn-add">＋ Variable</button><button id="btn-del">− Variable</button>
      </div>
      <div id="banner" class="callout" role="status"></div>`;
  }
  function buildEditor() {
    const st = sess.state, n = sess.n();
    let h = '<table><thead><tr><th></th>';
    for (let j = 0; j < n; j++) h += `<th>${varName(j)}</th>`;
    h += '<th class="sepcol"></th><th>b</th></tr></thead><tbody>';
    for (let i = 0; i < n; i++) {
      h += `<tr><th class="rowh">${varName(i)} ${esc(st.names[i])}</th>`;
      for (let j = 0; j < n; j++) h += `<td><input class="cell" type="text" inputmode="decimal" data-m="A" data-i="${i}" data-j="${j}" value="${cellStr(st.A[i][j])}" aria-label="a${i + 1}${j + 1}"></td>`;
      h += `<td class="sepcol"></td><td><input class="cell bcol" type="text" inputmode="decimal" data-m="b" data-i="${i}" value="${cellStr(st.b[i])}" aria-label="b${i + 1}"></td></tr>`;
    }
    $('editor').innerHTML = h + '</tbody></table>';
    buildX0();
  }
  function buildX0() {
    const w = $('x0-custom');
    if (sess.settings.x0Mode !== 'custom') { w.innerHTML = ''; return; }
    w.innerHTML = '<span class="mono">x₀ =</span>' + sess.settings.x0Custom.map((v, i) => `<label class="f">${varName(i)}<input class="cell" type="text" data-m="x0" data-i="${i}" value="${cellStr(v)}"></label>`).join('');
  }
  function syncControls() {
    const s = sess.settings;
    $('ctl-tol').value = Number.isFinite(s.tol) ? s.tol.toExponential(0).replace('e-', 'e-') : '';
    $('ctl-nmax').value = Number.isFinite(s.nmax) ? s.nmax : '';
    $('ctl-pre').value = s.precond; $('ctl-omega').value = s.omega;
    $('omega-wrap').style.display = s.precond === 'ssor' ? '' : 'none';
    $('ctl-x0').value = s.x0Mode; $('ctl-sym').checked = s.symmetricEdit;
    const st = sess.state;
    const b = $('scen-badge'); b.textContent = `${STATE_NAME[st.scenarioId]}${st.modified ? ' · modificado' : ''} · n = ${sess.n()}`;
    b.className = `badge sc-${st.scenarioId}`;
    document.querySelectorAll('[data-load]').forEach((el) => el.classList.toggle('on', el.dataset.load === st.scenarioId));
    $('btn-add').disabled = sess.n() >= E.MAX_N; $('btn-del').disabled = sess.n() <= E.MIN_N;
  }

  function renderBanner(res) {
    const b = $('banner'), pill = $('status-pill');
    if (res.valid) {
      const v = res.validation;
      b.className = 'callout good';
      b.innerHTML = `✔ <b>Sistema válido.</b> A es simétrica (error relativo ${sci(v.symmetric.relDiff, 1)}) y definida positiva (λ<sub>mín</sub> = ${sci(v.spd.minEig)}, todos los menores principales &gt; 0). n = ${res.n} · κ(A) = ${kappaTxt(res.condA.kappa)}.${res.precondNote ? `<br><span class="small">ℹ ${esc(res.precondNote)}</span>` : ''}${v.warnings.map((w) => `<br><span class="small">⚠ ${esc(w)}</span>`).join('')}`;
      pill.className = 'pill ok'; pill.textContent = `Sistema válido · κ(A) = ${kappaTxt(res.condA.kappa)}`;
    } else {
      b.className = 'callout bad';
      b.innerHTML = `✖ <b>El sistema no se puede resolver.</b> <ul>${res.validation.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul><span class="small">Corrige los datos, usa «Simetrizar A» o «Restablecer escenario». La aplicación no se ha detenido: los módulos 6–8 esperan un sistema válido.</span>`;
      pill.className = 'pill err'; pill.textContent = 'Matriz no válida';
    }
  }

  // =====================================================================
  // MÓDULO 5 — Tres escenarios + tabla comparativa
  // =====================================================================
  function interpret(id, out) {
    const o = out[id], r = o.res;
    if (!r.valid) return 'Sistema no válido con los ajustes actuales.';
    const bs = o.model.toBs(r.xref), tot = bs.reduce((a, b) => a + b, 0), names = o.model.names;
    const need = o.model.y.reduce((a, b) => a + b, 0) * 1000;
    const top = bs.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([v, i]) => `${names[i]} (${(100 * v / tot).toFixed(0)} %)`).join(' y ');
    let s = `Asigna Bs ${money(tot)} frente a una necesidad de Bs ${money(need)} (${(100 * tot / need).toFixed(0)} % de cobertura); el grueso va a ${top}.`;
    if (id === 'ideal') s += ` κ(A) = ${kappaTxt(r.condA.kappa)}: bien condicionada; GC y GCP convergen en ${r.gc.iterations} y ${r.gcp.iterations} iteraciones.`;
    if (id === 'stress' && out.ideal.res.valid) {
      const ideal = out.ideal.model.toBs(out.ideal.res.xref), d = bs.map((v, i) => v - ideal[i]);
      const k = d.reduce((m, v, i) => (Math.abs(v) > Math.abs(d[m]) ? i : m), 0);
      s += ` Frente al ideal la necesidad sube Bs ${money(need - M.PLAN_BS.reduce((a, b) => a + b, 0))} y el mayor reajuste es en ${names[k]} (${d[k] >= 0 ? '+' : '−'}Bs ${money(Math.abs(d[k]))}). κ(A) pasa de ${kappaTxt(out.ideal.res.condA.kappa)} a ${kappaTxt(r.condA.kappa)}: el estrés <b>desplaza el punto de equilibrio</b> sin alterar significativamente el condicionamiento.`;
    }
    if (id === 'ill') s += ` Es la misma respuesta financiera que el escenario Ideal (solo cambia la unidad de medida), pero κ(A) = ${kappaTxt(r.condA.kappa)} obliga a precondicionar: ${r.precond.name} lo reduce a κ(M⁻¹A) = ${kappaTxt(r.condMA.kappa)}.`;
    return s;
  }
  function settingsForCompare() { const s = sess.settings; return { tol: s.tol, nmax: s.nmax, precond: s.precond, omega: s.omega, x0Mode: s.x0Mode === 'custom' ? 'zero' : s.x0Mode, direct: s.direct, symmetricEdit: true }; }

  function render5Static() {
    $('b5').innerHTML = `
      <p>Los tres escenarios comparten las <b>mismas cuatro variables</b> y la estructura A = JᵀWJ + R; solo cambian los coeficientes con fundamento financiero. Los botones cargan el escenario en la <a href="#m4">entrada de datos</a> y ejecutan todo.</p>
      <div class="row"><button data-load="ideal" class="sc-ideal">Cargar: Ideal</button><button data-load="stress" class="sc-stress">Cargar: Bajo estrés</button><button data-load="ill" class="sc-ill">Cargar: Mal condicionado</button></div>
      <div class="grid2">
        <div class="card"><h4><span class="badge sc-ideal">1 · Ideal</span></h4><p class="small">Situación estable. <b>Datos:</b> estructura de costos tal como en Costos_hydrotech.xlsx; presupuestos del plan de Bs 40.000; mezcla actual ∝ ingresos mensuales; ρ = 0,25.</p><p class="small"><b>Coherencia:</b> diagonal dominante y κ(A) bajo; es el punto de comparación de los otros dos.</p></div>
        <div class="card"><h4><span class="badge sc-stress">2 · Bajo estrés</span></h4><p class="small"><b>Perturbación (hipótesis):</b> inflación por rubro — insumos +30 %, equipo +15 %, personal +10 %, operación +20 % — y caída de ventas — hortalizas −10 %, plantines −10 %, kits −30 %, capacitaciones −25 %.</p><p class="small"><b>Efecto matemático:</b> cambian b (mayores presupuestos y menor mezcla actual) y A (por los pesos de J). Se analiza si el algoritmo reacciona o solo se desplaza el equilibrio.</p></div>
        <div class="card"><h4><span class="badge sc-ill">3 · Mal condicionado</span></h4><p class="small"><b>Causa:</b> mal escalamiento diagonal. Cada variable se expresa en su unidad operativa, z<sub>i</sub> = x<sub>i</sub>/s<sub>i</sub>, con s<sub>i</sub> = costo unitario de la línea (Bs 0,65 · 0,33 · 523,75 · 69,44): razón de escalas ≈ 1.600.</p><p class="small"><b>Efecto:</b> A₃ = S A₁ S, b₃ = S b₁; sigue siendo SPD, κ crece ≈ 10⁵ veces y la solución en Bs no cambia. Por ser escalamiento diagonal, corresponde el <b>precondicionador de Jacobi</b>.</p></div>
      </div>
      <h3>Tabla comparativa obligatoria</h3>
      <p class="small muted" id="cmp-note"></p>
      <div id="cmp-table"></div>
      <div class="row"><button id="btn-csv">⬇ Descargar tabla (CSV)</button></div>
      <div class="grid2"><div><h4>Inversión asignada por línea (Bs)</h4><div id="ch-alloc"></div></div><div><h4>Iteraciones por escenario</h4><div id="ch-iters"></div></div></div>`;
  }
  function render5() {
    const settings = settingsForCompare(), out = E.runScenarios(settings), ids = ['ideal', 'stress', 'ill'];
    ui.cmp = out;
    $('cmp-note').textContent = `Calculada con los ajustes actuales: tol = ${sci(settings.tol, 0)}, Nmáx = ${settings.nmax}, precondicionador = ${Precond.TYPES[settings.precond]}${settings.precond === 'ssor' ? ` (ω = ${settings.omega})` : ''}, x₀ = ${settings.x0Mode === 'diag' ? 'D⁻¹b' : '0'}, método directo = ${settings.direct}. Independiente de las ediciones manuales de A y b.`;
    const cols = ids.map((id) => out[id]);
    const row = (label, f, cls = '') => `<tr><td><b>${label}</b></td>${cols.map((o) => `<td class="${cls}">${o.res.valid ? f(o) : '—'}</td>`).join('')}</tr>`;
    const unit = (o) => (o.model.params.unitScaled ? 'unidades financiables/mes' : 'miles de Bs');
    const rows = [
      row('Solución numérica de referencia (método directo)', (o) => `<span class="mono">${vec(o.res.xref, 5)}</span><br><span class="small muted">${unit(o)}</span>`),
      row('Equivalente en Bs', (o) => `<span class="mono">${vec(o.model.toBs(o.res.xref).map(Math.round), 8)}</span>`),
      row('Solución GCP', (o) => `<span class="mono">${vec(o.res.gcp.x, 5)}</span>`),
      row('Error absoluto E<sub>a</sub> por variable', (o) => `<span class="mono">${vecE(o.res.errGCP.comps.map((c) => c.Ea))}</span>`),
      row('Error porcentual E<sub>p</sub> por variable (%)', (o) => `<span class="mono">${vecE(o.res.errGCP.comps.map((c) => c.Ep))}</span>`),
      row('Iteraciones GC (sin precondicionar)', (o) => `<b>${o.res.gc.iterations}</b>`, 'n'),
      row('Iteraciones GCP (precondicionado)', (o) => `<b>${o.res.gcp.iterations}</b>`, 'n'),
      row('Número de condición κ(A)', (o) => kappaTxt(o.res.condA.kappa), 'n'),
      row('Número de condición κ(M⁻¹A)', (o) => kappaTxt(o.res.condMA.kappa), 'n'),
      row('Residuo relativo final GCP', (o) => sci(o.res.gcp.trueResidual, 2), 'n'),
      row('¿Convergió el algoritmo?', (o) => badge(o.res.gcp.converged), ''),
      row('Interpretación financiera', (o) => `<span class="small">${interpret(o.model.id, out)}</span>`),
    ];
    $('cmp-table').innerHTML = `<div class="tablewrap"><table class="t"><thead><tr><th>Indicador</th>${ids.map((id) => `<th><span class="badge sc-${id}">${STATE_NAME[id]}</span></th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    if (cols.every((o) => o.res.valid)) {
      $('ch-alloc').innerHTML = Ch.barGroup(cols[0].model.names, ids.map((id, k) => ({ name: STATE_NAME[id], cls: `sc-${id}`, values: cols[k].model.toBs(cols[k].res.xref).map((v) => Math.max(0, v)) })), { yLabel: 'Bs', fmt: money });
      $('ch-iters').innerHTML = Ch.barGroup(ids.map((i) => STATE_NAME[i]), [{ name: 'GC', cls: 'gc', values: cols.map((o) => o.res.gc.iterations) }, { name: 'GCP', cls: 'gcp', values: cols.map((o) => o.res.gcp.iterations) }], { yLabel: 'iteraciones', fmt: (v) => String(Math.round(v)) });
    }
  }
  function downloadCsv() {
    if (!ui.cmp) return;
    const ids = ['ideal', 'stress', 'ill'], q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [['Indicador', ...ids.map((i) => STATE_NAME[i])].map(q).join(',')];
    const add = (label, f) => lines.push([label, ...ids.map((id) => (ui.cmp[id].res.valid ? f(ui.cmp[id]) : ''))].map(q).join(','));
    add('Solución de referencia', (o) => o.res.xref.join(' ; ')); add('Solución GCP', (o) => o.res.gcp.x.join(' ; '));
    add('Error absoluto', (o) => o.res.errGCP.comps.map((c) => c.Ea).join(' ; ')); add('Error porcentual', (o) => o.res.errGCP.comps.map((c) => (c.Ep === null ? 'n/d' : c.Ep)).join(' ; '));
    add('Iteraciones GC', (o) => o.res.gc.iterations); add('Iteraciones GCP', (o) => o.res.gcp.iterations);
    add('kappa(A)', (o) => o.res.condA.kappa); add('kappa(M^-1 A)', (o) => o.res.condMA.kappa);
    add('Residuo relativo GCP', (o) => o.res.gcp.trueResidual); add('Convergió', (o) => (o.res.gcp.converged ? 'Sí' : 'No'));
    add('Interpretación financiera', (o) => interpret(o.model.id, ui.cmp).replace(/<[^>]+>/g, ''));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'hydrofin_tabla_comparativa.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // =====================================================================
  // MÓDULO 6 — Solución de referencia
  // =====================================================================
  function render6(res) {
    const el = $('b6');
    if (!res.valid) { el.innerHTML = `<div class="callout bad">Sin solución de referencia: el sistema actual no es válido (ver Entrada de datos).</div>`; return; }
    const d = res.direct, m = d.method, data = d.data, st = sess.state;
    const tab = (k, t) => `<button data-direct="${k}" class="${m === k ? 'on' : ''}">${t}</button>`;
    let detail = '';
    if (m === 'cholesky') detail = `<p>Se factoriza <b>A = L Lᵀ</b> (L triangular inferior con diagonal positiva; existe y es única porque A es SPD), luego se resuelve <b>L y = b</b> (sustitución hacia adelante) y <b>Lᵀ x = y</b> (hacia atrás).</p><div class="mats"><span class="mono">L =</span>${matHtml(data.L, (x) => fmt(x, 5))}<span class="mono">y =</span>${colHtml(data.y)}</div>`;
    if (m === 'lu') detail = `<p>Factorización con pivoteo parcial <b>P A = L U</b>; se resuelve <b>L y = P b</b> y <b>U x = y</b>. Permutación de filas: [${data.perm.map((p) => p + 1).join(', ')}].</p><div class="mats"><span class="mono">L =</span>${matHtml(data.L, (x) => fmt(x, 4))}<span class="mono">U =</span>${matHtml(data.U, (x) => fmt(x, 4))}</div>`;
    if (m === 'gauss') detail = `<p>Eliminación gaussiana con pivoteo parcial sobre [A | b] y sustitución regresiva.</p>${data.steps.map((s) => `<details><summary>${esc(s.label)}</summary>${matHtml(s.M, (x) => fmt(x, 4))}</details>`).join('')}`;
    const bs = st.bsPerUnit, tot = res.xref.map((v, i) => v * bs[i]).reduce((a, b) => a + b, 0);
    const rows = res.xref.map((v, i) => tr([`<b>${varName(i)}</b> ${esc(st.names[i])}`, `<span id="ref-x-${i}">${fmt(v, 8)}</span>`, st.unit, money(v * bs[i]), tot > 0 ? `${(100 * v * bs[i] / tot).toFixed(1)} %` : '—'], [1, 3, 4])).join('');
    const resid = La.norm2(La.sub(st.b, La.matVec(st.A, res.xref))) / La.norm2(st.b);
    $('b6').innerHTML = `
      <p>La <b>solución numérica de referencia</b> se obtiene con un método directo (aquí puede clasificarse como «solución exacta» salvo error de redondeo). Elige el método:</p>
      <div class="seg">${tab('cholesky', 'Cholesky')}${tab('lu', 'LU')}${tab('gauss', 'Gauss')}</div>
      ${detail}
      <h3>Solución x<sub>ref</sub></h3>
      ${table(['Variable', 'x<sub>ref</sub>', 'Unidad', 'Equivalente en Bs', '% del total'], [rows], { numCols: [1, 3, 4] })}
      <p class="small">Verificación: ‖b − A·x<sub>ref</sub>‖₂/‖b‖₂ = <b>${sci(resid, 2)}</b>. Contraste entre métodos directos: |Cholesky − LU| = ${sci(d.cross.choleskyVsLu, 1)}, |Cholesky − Gauss| = ${sci(d.cross.choleskyVsGauss, 1)} (diferencias relativas): los tres coinciden a precisión de máquina.</p>`;
  }

  // =====================================================================
  // MÓDULO 7 — GCP vs GC
  // =====================================================================
  function iterTable(run) {
    const rows = run.steps.slice(0, 60).map((s) => tr([s.k, s.alpha === null ? '—' : fmt(s.alpha, 5), s.beta === null ? '—' : fmt(s.beta, 5), sci(s.res, 3), `<span class="mono">${vec(s.x, 5)}</span>`], [0, 1, 2, 3]));
    return table(['k', 'α<sub>k−1</sub>', 'β<sub>k−1</sub>', '‖r<sub>k</sub>‖/‖b‖', 'x<sub>k</sub>'], rows, { numCols: [0, 1, 2, 3] }) + (run.steps.length > 60 ? '<p class="small muted">(Se muestran las primeras 60 iteraciones.)</p>' : '');
  }
  function render7(res) {
    const el = $('b7-main');
    if (!res.valid) { el.innerHTML = `<div class="callout bad">Los solvers no se ejecutaron: el sistema actual no es válido (ver módulo 4).</div>`; return; }
    const { gc, gcp } = res, st = sess.state;
    const card = (t, r, cls, extra) => `<div class="card"><h4><span class="badge ${cls}">${t}</span></h4>
      <div class="kpis" style="margin:6px 0"><div class="kpi"><div class="v" id="sum-${cls}-it">${r.iterations}</div><div class="l">iteraciones</div></div><div class="kpi"><div class="v" style="font-size:19px">${sci(r.trueResidual, 2)}</div><div class="l">residuo relativo final</div></div></div>
      <p class="small">¿Convergió (‖rₖ‖/‖b‖ &lt; ${sci(sess.settings.tol, 0)})? ${badge(r.converged)}${r.breakdown ? ` <span class="bad-t">${esc(r.breakdown)}</span>` : ''}<br>${extra}</p></div>`;
    const gain = gc.iterations > 0 ? gc.iterations - gcp.iterations : 0;
    const rows = res.xref.map((v, i) => tr([`<b>${varName(i)}</b> ${esc(st.names[i])}`, fmt(v, 7), fmt(gc.x[i], 7), fmt(gcp.x[i], 7)], [1, 2, 3])).join('');
    el.innerHTML = `
      <p>Se ejecutan en paralelo el <b>GCP</b> con M = ${esc(res.precond.name)} y el <b>GC simple</b> (M = I, solo como contraste), con x₀ = ${sess.settings.x0Mode === 'zero' ? '0' : sess.settings.x0Mode === 'diag' ? 'D⁻¹b' : 'personalizado'}.</p>
      <div class="grid2">
        ${card('GC (sin precondicionar)', gc, 'gc', `κ(A) = <b>${kappaTxt(res.condA.kappa)}</b>`)}
        ${card(`GCP · ${esc(res.precond.name)}`, gcp, 'gcp', `κ(M⁻¹A) = <b>${kappaTxt(res.condMA.kappa)}</b> · reducción de κ: ×${fmt(res.condA.kappa / res.condMA.kappa, 3)}`)}
      </div>
      <div class="callout ${gcp.iterations <= gc.iterations ? 'good' : 'warn'}">${gcp.iterations < gc.iterations ? `GCP necesita <b>${gain}</b> iteración(es) menos que GC.` : gcp.iterations === gc.iterations ? 'GCP y GC necesitan el mismo número de iteraciones (en sistemas pequeños y bien escalados el precondicionamiento aporta poco).' : 'Con este precondicionador GCP necesita más iteraciones que GC.'} En exactitud, GC termina en ≤ n = ${res.n} pasos; la ganancia crece con n (ver laboratorio).${res.precondNote ? `<br><span class="small">ℹ ${esc(res.precondNote)}</span>` : ''}</div>
      <h4>Convergencia: residuo relativo vs iteración</h4>
      ${Ch.lineLog([{ name: 'GC', cls: 'gc', values: gc.history }, { name: 'GCP', cls: 'gcp', values: gcp.history }], { tol: sess.settings.tol })}
      <h4>Vectores aproximados (${esc(st.unit)})</h4>
      ${table(['Variable', 'x<sub>ref</sub> (directo)', 'x<sub>GC</sub>', 'x<sub>GCP</sub>'], [rows], { numCols: [1, 2, 3] })}
      <details><summary>Detalle iteración por iteración — GCP</summary>${iterTable(gcp)}</details>
      <details><summary>Detalle iteración por iteración — GC</summary>${iterTable(gc)}</details>`;
  }
  function render7Static() {
    $('b7').innerHTML = `<div id="b7-main"></div>
      <h3>Laboratorio de escalamiento (extra: sistemas más grandes)</h3>
      <p class="small">Con n = 4 el GC termina en ≤ 4 pasos por teoría, así que la diferencia es pequeña. Para ver el beneficio real del precondicionamiento, este laboratorio resuelve A = S T S (T Toeplitz AR(1), S con escalas entre 1 y la razón elegida) con solución conocida x = (1,…,1).</p>
      <div class="controls"><label class="f">Tamaño n: <b id="lab-n-v">40</b><input type="range" id="lab-n" min="4" max="100" value="40"></label><label class="f">Razón de escalas: 10<sup id="lab-r-v">3</sup><input type="range" id="lab-r" min="0" max="5" step="0.5" value="3"></label></div>
      <div id="lab-out"></div>`;
  }
  function renderLab() {
    const n = +$('lab-n').value, ex = +$('lab-r').value;
    $('lab-n-v').textContent = n; $('lab-r-v').textContent = String(ex).replace('.', ',');
    const l = E.labExperiment(n, Math.pow(10, ex), 1e-6, 20000);
    $('lab-out').innerHTML = `<div class="kpis">
      <div class="kpi"><div class="v" style="color:var(--gc)">${l.gc.iterations}</div><div class="l">iteraciones GC ${l.gc.converged ? '' : '(no convergió)'}</div></div>
      <div class="kpi"><div class="v" style="color:var(--gcp)">${l.gcp.iterations}</div><div class="l">iteraciones GCP (Jacobi)</div></div>
      <div class="kpi"><div class="v">${l.kA ? kappaTxt(l.kA) : '—'}</div><div class="l">κ(A)${l.kA ? '' : ' (n &gt; 80: no calculado)'}</div></div>
      <div class="kpi"><div class="v">${l.kMA ? kappaTxt(l.kMA) : '—'}</div><div class="l">κ(M⁻¹A)</div></div></div>
      <p class="small">Error relativo final: GC ${sci(l.errGC)} · GCP ${sci(l.errGCP)}.</p>
      ${Ch.lineLog([{ name: 'GC', cls: 'gc', values: l.gc.history }, { name: 'GCP', cls: 'gcp', values: l.gcp.history }], { tol: 1e-6, h: 260 })}`;
  }

  // =====================================================================
  // MÓDULO 8 — Análisis de errores
  // =====================================================================
  function render8(res) {
    const el = $('b8');
    if (!res.valid) { el.innerHTML = `<div class="callout bad">Sin análisis de errores: el sistema actual no es válido.</div>`; return; }
    const m = ui.errMethod, er = m === 'gcp' ? res.errGCP : res.errGC, run = m === 'gcp' ? res.gcp : res.gc, st = sess.state;
    const f = ui.errFmt === 'sci' ? (v) => sci(v, 3) : (v) => fmt(v, 6);
    const rows = er.comps.map((c) => tr([`<b>${varName(c.i)}</b> ${esc(st.names[c.i])}`, fmt(c.xref, 8), fmt(c.x, 8), f(c.Ea), c.Er === null ? '<span class="muted" title="x_ref = 0">no definido</span>' : f(c.Er), c.Ep === null ? '<span class="muted">no definido</span>' : f(c.Ep) + ' %'], [1, 2, 3, 4, 5])).join('');
    el.innerHTML = `
      <div class="row"><span class="mono">Método:</span><div class="seg"><button data-errm="gcp" class="${m === 'gcp' ? 'on' : ''}">GCP</button><button data-errm="gc" class="${m === 'gc' ? 'on' : ''}">GC</button></div>
        <span class="mono">Formato:</span><div class="seg"><button data-errf="dec" class="${ui.errFmt === 'dec' ? 'on' : ''}">Decimal</button><button data-errf="sci" class="${ui.errFmt === 'sci' ? 'on' : ''}">Científico</button></div></div>
      <div class="formula">E<sub>a,i</sub> = |x<sub>ref,i</sub> − x<sub>${m.toUpperCase()},i</sub>|    E<sub>r,i</sub> = E<sub>a,i</sub> / |x<sub>ref,i</sub>|  (no definido si x<sub>ref,i</sub> = 0)    E<sub>p,i</sub> = E<sub>r,i</sub> × 100 %</div>
      ${table(['Variable', 'x<sub>ref</sub>', `x<sub>${m.toUpperCase()}</sub>`, 'Error absoluto E<sub>a</sub>', 'Error relativo E<sub>r</sub>', 'Error porcentual E<sub>p</sub>'], [rows], { numCols: [1, 2, 3, 4, 5] })}
      <div class="kpis"><div class="kpi"><div class="v" style="font-size:20px">${sci(er.residualRel, 2)}</div><div class="l">residuo relativo global ‖b − A·x‖₂/‖b‖₂</div></div>
        <div class="kpi"><div class="v" style="font-size:20px">${sci(er.errNorm2, 2)}</div><div class="l">‖x<sub>ref</sub> − x<sub>${m.toUpperCase()}</sub>‖₂</div></div>
        <div class="kpi"><div class="v" style="font-size:20px">${run.iterations}</div><div class="l">iteraciones</div></div>
        <div class="kpi"><div class="v" style="font-size:20px">${kappaTxt(res.condA.kappa)} → ${kappaTxt(res.condMA.kappa)}</div><div class="l">κ(A) → κ(M⁻¹A)</div></div></div>
      <h4>Error absoluto por variable (escala log): GC vs GCP</h4>
      ${Ch.barGroup(st.names.map((n, i) => varName(i)), [{ name: 'GC', cls: 'gc', values: res.errGC.comps.map((c) => c.Ea) }, { name: 'GCP', cls: 'gcp', values: res.errGCP.comps.map((c) => c.Ea) }], { log: true, yLabel: 'E_a' })}
      <p class="small muted">Barras muy bajas indican error del orden del redondeo de máquina (≈10⁻¹⁶). Si el error es exactamente 0 se dibuja en el piso del gráfico.</p>`;
  }

  // =====================================================================
  // MÓDULO 9 — QA
  // =====================================================================
  const REQ = { 1: 'Obligatoria 1 · Carga de escenarios', 2: 'Obligatoria 2 · Validación de matriz no válida', 3: 'Obligatoria 3 · Edición dinámica', 4: 'Obligatoria 4 · Comparativa de precondicionamiento', X: 'Pruebas adicionales' };
  function render9Static() {
    $('b9').innerHTML = `<p>Documentación y ejecución comprobable de las pruebas (Entrada · Resultado esperado · Resultado obtenido · Conclusión). Cada prueba ejecuta el motor real; las marcadas <span class="badge info">UI</span> manipulan además la interfaz (escriben en las celdas, pulsan botones y leen el DOM). Las mismas pruebas del motor corren en consola con <code>npm test</code>.</p>
      <div class="qa-sum"><button class="primary" id="btn-qa">▶ Ejecutar todas las pruebas</button><span id="qa-sum"></span></div><div id="qa-table"></div>`;
  }
  function render9() {
    const all = (ui.qa || []).concat(ui.qaUi || []);
    if (!all.length) { $('qa-table').innerHTML = ''; return; }
    const ok = all.filter((t) => t.pass).length;
    $('qa-sum').innerHTML = `<span class="badge ${ok === all.length ? 'ok' : 'no'}">${ok} / ${all.length} aprobadas</span>`;
    const kq = $('kpi-qa'); if (kq) kq.textContent = `${ok}/${all.length}`;
    let h = '';
    ['1', '2', '3', '4', 'X'].forEach((g) => {
      const items = all.filter((t) => String(t.req) === g);
      if (!items.length) return;
      h += `<tr><td class="grp" colspan="6">${REQ[g]}</td></tr>` + items.map((t) => `<tr><td class="mono">${t.id}</td><td><b>${esc(t.nombre)}</b>${t.ui ? ' <span class="badge info">UI</span>' : ''}</td><td class="small">${esc(t.entrada)}</td><td class="small">${esc(t.esperado)}</td><td class="small">${esc(t.obtenido)}</td><td>${t.pass ? '<span class="badge ok">Aprobada</span>' : '<span class="badge no">Fallida</span>'}</td></tr>`).join('');
    });
    $('qa-table').innerHTML = `<div class="tablewrap"><table class="t"><thead><tr><th>ID</th><th>Prueba</th><th>Entrada</th><th>Resultado esperado</th><th>Resultado obtenido</th><th>Conclusión</th></tr></thead><tbody>${h}</tbody></table></div>`;
  }

  // ---- pruebas que ejercitan la interfaz real ----
  function snapshot() {
    const st = sess.state;
    return { st: { ...st, A: La.clone(st.A), b: st.b.slice(), names: st.names.slice(), bsPerUnit: st.bsPerUnit.slice() }, set: { ...sess.settings, x0Custom: sess.settings.x0Custom.slice() } };
  }
  function restore(sn) { sess.state = sn.st; sess.settings = sn.set; sess.set('tol', sess.settings.tol); fullRender(); }
  function typeInto(sel, value) { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); flush(); return el; }
  function runUiTests() {
    const sn = snapshot(), out = [];
    const T = (id, req, nombre, entrada, esperado, fn) => {
      let r; try { r = fn(); } catch (e) { r = { pass: false, obtenido: `Excepción: ${e.message}` }; }
      out.push({ id, req, nombre, entrada, esperado, obtenido: r.obtenido, pass: r.pass, ui: true });
    };
    try {
      T('QA-UI-1', 3, 'Edición dinámica en la interfaz', 'Escenario Ideal; se escribe a₁₁ + 1 en la celda (1,1) del editor', 'El valor x₁ de la solución de referencia mostrada en el DOM cambia sin recargar y GCP sigue coincidiendo con la referencia', () => {
        sess.load('ideal'); fullRender();
        const before = $('ref-x-0').textContent;
        typeInto('#editor input[data-m="A"][data-i="0"][data-j="0"]', String(sess.state.A[0][0] + 1));
        const after = $('ref-x-0').textContent, r = sess.compute();
        return { pass: before !== after && r.valid && La.norm2(La.sub(r.gcp.x, r.xref)) / La.norm2(r.xref) < 1e-6, obtenido: `x₁ref en pantalla: ${before} → ${after}; GCP ${r.gcp.iterations} it.` };
      });
      T('QA-UI-2', 2, 'Matriz no simétrica en la interfaz', 'Se desactiva «Mantener simetría» y se escribe a₁₂ = 9 en el editor', 'El banner muestra el error en rojo, los módulos 6–8 informan que no se ejecutaron y la página sigue operativa', () => {
        sess.load('ideal'); fullRender();
        const chk = $('ctl-sym'); chk.checked = false; chk.dispatchEvent(new Event('change', { bubbles: true }));
        typeInto('#editor input[data-m="A"][data-i="0"][data-j="1"]', '9');
        const banner = $('banner');
        const pass = banner.classList.contains('bad') && banner.textContent.includes('no es simétrica') && $('b7-main').textContent.includes('no se ejecutaron') && $('status-pill').classList.contains('err');
        return { pass, obtenido: banner.textContent.replace(/\s+/g, ' ').trim().slice(0, 140) + '…' };
      });
      T('QA-UI-3', 1, 'Botones de escenarios en la interfaz', 'Se pulsan los botones «Ideal», «Bajo estrés» y «Mal condicionado» del módulo 5', 'Cada pulsación carga el escenario y los contadores de iteración GC/GCP se actualizan en pantalla', () => {
        const rows = []; let pass = true;
        ['ideal', 'stress', 'ill'].forEach((id) => {
          document.querySelector(`#b5 [data-load="${id}"]`).click(); flush();
          const gc = +$('sum-gc-it').textContent, gcp = +$('sum-gcp-it').textContent, badge_ = $('scen-badge').textContent;
          pass = pass && badge_.includes(STATE_NAME[id]) && Number.isInteger(gc) && Number.isInteger(gcp);
          rows.push(`${STATE_NAME[id]}: GC ${gc} / GCP ${gcp}`);
        });
        return { pass, obtenido: rows.join(' · ') };
      });
      T('QA-UI-4', 4, 'Cambio de precondicionador desde la interfaz', 'Escenario Mal condicionado; se elige Jacobi, SSOR e IC(0) en el selector', 'En los tres casos GCP converge y su número de iteraciones es ≤ al de GC', () => {
        sess.load('ill'); fullRender(); const rows = []; let pass = true;
        ['jacobi', 'ssor', 'ic0'].forEach((p) => {
          const sel = $('ctl-pre'); sel.value = p; sel.dispatchEvent(new Event('change', { bubbles: true })); flush();
          const r = sess.compute(); pass = pass && r.valid && r.gcp.converged && r.gcp.iterations <= r.gc.iterations;
          rows.push(`${p}: GCP ${r.gcp.iterations} / GC ${r.gc.iterations}`);
        });
        return { pass, obtenido: rows.join(' · ') };
      });
    } finally { restore(sn); }
    return out;
  }
  function runAllQA() {
    ui.qa = QA.runAll(); ui.qaUi = runUiTests(); render9();
  }

  // =====================================================================
  // MÓDULO 10 — Conclusiones y referencias
  // =====================================================================
  function render10() {
    const b = baseline, rI = b.ideal.res, rS = b.stress.res, rL = b.ill.res, lab = E.labExperiment(40, 1e3);
    const bsI = b.ideal.model.toBs(rI.xref), bsS = b.stress.model.toBs(rS.xref), tI = bsI.reduce((a, c) => a + c, 0), tS = bsS.reduce((a, c) => a + c, 0), nm = b.ideal.model.names;
    const pct = (v, t) => `${(100 * v / t).toFixed(0)} %`;
    const maxErr = Math.max(...['ideal', 'stress', 'ill'].map((id) => b[id].res.errGCP.errRelNorm2));
    const needS = b.stress.model.y.reduce((a, c) => a + c, 0) * 1000;
    const dS = bsS.map((v, i) => v - bsI[i]);
    $('b10').innerHTML = `
      <h3>Interpretación técnica</h3>
      <ul>
        <li><b>Validez.</b> Las matrices de los tres escenarios son simétricas y definidas positivas (autovalores &gt; 0 y menores de Sylvester &gt; 0); ver módulo 3.</li>
        <li><b>Exactitud.</b> El GCP alcanzó la tolerancia 10⁻⁶ en <b>${rI.gcp.iterations}</b>, <b>${rS.gcp.iterations}</b> y <b>${rL.gcp.iterations}</b> iteraciones (ideal, estrés, mal condicionado), con error relativo respecto a la solución directa ≤ ${sci(maxErr, 1)}.</li>
        <li><b>Condicionamiento.</b> κ(A) = ${kappaTxt(rI.condA.kappa)} (ideal) y ${kappaTxt(rS.condA.kappa)} (estrés): la perturbación <i>solo desplaza el punto de equilibrio</i>, no empeora el condicionamiento. El mal escalamiento eleva κ(A) a ${kappaTxt(rL.condA.kappa)} (×${sci(rL.condA.kappa / rI.condA.kappa, 1)}); el precondicionador de Jacobi lo devuelve a κ(M⁻¹A) = ${kappaTxt(rL.condMA.kappa)}.</li>
        <li><b>Velocidad.</b> En el escenario mal condicionado GC necesitó ${rL.gc.iterations} iteraciones y GCP ${rL.gcp.iterations}; además GC terminó con error relativo ${sci(rL.errGC.errRelNorm2, 1)} frente a ${sci(rL.errGCP.errRelNorm2, 1)} del GCP, porque el error de GC se amplifica con κ(A). Con n = 4 la ventaja en iteraciones es pequeña (GC finaliza en ≤ n pasos); en el laboratorio (n = 40, razón de escalas 10³) es de ${lab.gc.iterations} → ${lab.gcp.iterations} iteraciones.</li>
        <li><b>Elección del precondicionador.</b> El mal condicionamiento de este caso es de <i>escalamiento diagonal</i>, por eso Jacobi es suficiente. Si hubiera fuerte acoplamiento fuera de la diagonal se recomendaría SSOR o IC(0), ambos disponibles en la aplicación.</li>
      </ul>
      <h3>Interpretación financiera</h3>
      <ul>
        <li><b>Escenario ideal.</b> De la necesidad de Bs 40.000 el modelo reparte Bs ${money(tI)} (cobertura ${pct(tI, 40000)}): ${nm.map((n, i) => `${n} ${pct(bsI[i], tI)}`).join(' · ')}. Los kits y las hortalizas concentran el capital porque son las líneas que más consumen equipo/infraestructura e insumos; los plantines casi no requieren capital propio (sus costos son pequeños y casi todos insumos).</li>
        <li><b>Bajo estrés.</b> Con la inflación y caída de ventas supuestas, la necesidad sube a Bs ${money(needS)} (+${(100 * (needS / 40000 - 1)).toFixed(0)} %) y el modelo asigna Bs ${money(tS)} (${pct(tS, needS)} de cobertura): ${nm.map((n, i) => `${n} ${dS[i] >= 0 ? '+' : '−'}${money(Math.abs(dS[i]))}`).join(' · ')} Bs respecto al ideal. Lectura de gestión: ante una crisis de costos hay que reforzar capital de trabajo/insumos de las líneas de producción y no se puede cubrir todo el incremento con el mismo financiamiento.</li>
        <li><b>Mal condicionado.</b> Mide las mismas inversiones en unidades operativas; la respuesta financiera es idéntica a la del ideal. Es una advertencia de ingeniería: un modelo correcto puede ser numéricamente frágil si sus variables tienen magnitudes muy distintas, y precondicionar lo resuelve.</li>
      </ul>
      <h3>Limitaciones</h3>
      <ul class="small">
        <li>El ingreso de plantines es una estimación; los parámetros ρ y w son decisiones de modelado; las inflaciones y caídas de ventas del escenario 2 son hipótesis, no datos.</li>
        <li>El modelo no impone Σx = 40.000 ni x ≥ 0 (con ρ = 0,25 los resultados son positivos); la «cobertura» mide cuánto del plan alcanza a financiar. Incorporar restricciones llevaría a un problema KKT indefinido, fuera del alcance de GC/GCP.</li>
        <li>Los números de condición se calculan con autovalores (κ₂ = λ<sub>máx</sub>/λ<sub>mín</sub>), válidos por ser A simétrica definida positiva.</li>
      </ul>
      <h3>Aporte de la mención (Desarrollo de Software)</h3>
      <div class="arch">
        <div class="box"><b>src/linalg.js</b>Álgebra lineal propia: Cholesky, LU, Gauss, autovalores (Jacobi), Gershgorin.</div>
        <div class="box"><b>src/solvers.js</b>GC/GCP, precondicionadores Jacobi · SSOR · IC(0), κ y errores.</div>
        <div class="box"><b>src/model.js</b>Datos de Hydrotech y constructor de los tres escenarios.</div>
        <div class="box"><b>src/engine.js</b>Validación matemática, sesión reactiva y laboratorio (sin DOM).</div>
        <div class="box"><b>src/qa.js</b>${QA.tests.length} pruebas compartidas con Node (<code>npm test</code>) + ${(ui.qaUi || []).length || 4} pruebas de interfaz.</div>
        <div class="box"><b>src/app.js · charts.js</b>Interfaz reactiva y gráficos SVG propios; sin frameworks ni dependencias.</div>
      </div>
      <ul class="small">
        <li><b>Validaciones de entrada:</b> números con coma o punto, celdas inválidas marcadas, simetría, definición positiva, n ≥ 4, tolerancia, Nmáx y ω; los errores se notifican sin detener la aplicación.</li>
        <li><b>Reactividad:</b> cualquier cambio recalcula referencia, GC, GCP, errores y gráficos; la tabla comparativa se exporta a CSV; el diseño se adapta a móviles y al modo oscuro.</li>
      </ul>
      <h3>Fuentes de datos</h3>
      <ul class="small"><li>Costos_hydrotech.xlsx — hojas «costos Lech», «Plantínes», «Kits Hidr» y «Capacitaciones» (costos por ítem).</li><li>2. Ficha Financiera – Cálculos (Excel) — ingresos mensuales y necesidad de financiamiento (Bs 40.000) por rubro.</li></ul>
      <h3>Referencias</h3>
      <ol class="refs">
        <li>Suñagua S., P. (2020). <i>Método de Gradientes Conjugados Precondicionado</i>. Revista Boliviana de Matemática – UMSA, 04, 2–7.</li>
        <li>Golub, G. H., &amp; Van Loan, C. F. (2013). <i>Matrix Computations</i> (4th ed.). Johns Hopkins University Press.</li>
        <li>Saad, Y. (2003). <i>Iterative Methods for Sparse Linear Systems</i> (2nd ed.). SIAM.</li>
      </ol>`;
  }

  // =====================================================================
  // orquestación
  // =====================================================================
  let queued = false;
  function renderResults() {
    const res = sess.compute();
    syncControls(); renderBanner(res); render3Dynamic(); render5(); render6(res); render7(res); render8(res);
  }
  function flush() { queued = false; renderResults(); }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(() => { if (queued) flush(); }); } }
  function fullRender() { buildEditor(); flush(); }

  function bind() {
    const editor = $('editor');
    editor.addEventListener('input', (ev) => {
      const t = ev.target; if (!t.classList || !t.classList.contains('cell')) return;
      const i = +t.dataset.i, j = +t.dataset.j, k = t.dataset.m, ok = Number.isFinite(E.parseNum(t.value));
      if (k === 'A') {
        sess.setCell(i, j, t.value);
        if (sess.settings.symmetricEdit && i !== j) { const mir = editor.querySelector(`[data-m="A"][data-i="${j}"][data-j="${i}"]`); if (mir) { mir.value = t.value; mir.classList.toggle('invalid', !ok); } }
      } else if (k === 'b') sess.setB(i, t.value);
      t.classList.toggle('invalid', !ok); schedule();
    });
    $('x0-custom').addEventListener('input', (ev) => { const t = ev.target; if (t.dataset.m === 'x0') { sess.setX0(+t.dataset.i, t.value); t.classList.toggle('invalid', !Number.isFinite(E.parseNum(t.value))); schedule(); } });
    $('ctl-tol').addEventListener('input', (e) => { sess.set('tol', E.parseNum(e.target.value)); schedule(); });
    $('ctl-nmax').addEventListener('input', (e) => { sess.set('nmax', E.parseNum(e.target.value)); schedule(); });
    $('ctl-omega').addEventListener('input', (e) => { sess.set('omega', E.parseNum(e.target.value)); schedule(); });
    $('ctl-pre').addEventListener('change', (e) => { sess.set('precond', e.target.value); flush(); });
    $('ctl-x0').addEventListener('change', (e) => { sess.set('x0Mode', e.target.value); buildX0(); flush(); });
    $('ctl-sym').addEventListener('change', (e) => { sess.set('symmetricEdit', e.target.checked); });
    $('btn-run').addEventListener('click', () => { flush(); $('m7').scrollIntoView({ behavior: 'smooth' }); });
    $('btn-reset').addEventListener('click', () => { sess.load(sess.state.scenarioId); fullRender(); });
    $('btn-symm').addEventListener('click', () => { sess.symmetrize(); fullRender(); });
    $('btn-add').addEventListener('click', () => { sess.addVariable(); fullRender(); });
    $('btn-del').addEventListener('click', () => { sess.removeVariable(); fullRender(); });
    $('btn-csv').addEventListener('click', downloadCsv);
    $('btn-qa').addEventListener('click', () => { runAllQA(); });
    $('lab-n').addEventListener('input', renderLab); $('lab-r').addEventListener('input', renderLab);
    document.addEventListener('click', (ev) => {
      const t = ev.target.closest('button'); if (!t) return;
      if (t.dataset.load) { sess.load(t.dataset.load); fullRender(); }
      else if (t.dataset.direct) { sess.set('direct', t.dataset.direct); flush(); }
      else if (t.dataset.errm) { ui.errMethod = t.dataset.errm; flush(); }
      else if (t.dataset.errf) { ui.errFmt = t.dataset.errf; flush(); }
    });
    // resaltar el módulo visible en la navegación
    const links = [...document.querySelectorAll('#nav a')];
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${e.target.id}`)); }), { rootMargin: '-30% 0px -60% 0px' });
      document.querySelectorAll('.mod').forEach((m) => io.observe(m));
    }
  }

  function init() {
    render1(); render2(); render3Static(); render4Static(); render5Static(); render7Static(); render9Static();
    bind(); buildEditor(); renderResults(); renderLab();
    ui.qa = QA.runAll(); render9(); render10();            // QA del motor al cargar
    ui.qaUi = runUiTests(); render9(); render10();          // QA de interfaz (restaura el estado después)
  }
  HF.App = { sess, flush, runAllQA, ui };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
