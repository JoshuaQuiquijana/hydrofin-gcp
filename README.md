# HydroFin · Gradientes Conjugados Precondicionado aplicado a las finanzas de Hydrotech

Desafío académico de **Métodos Numéricos** (UMSA · Facultad de Ciencias Puras y Naturales · Carrera de Informática) — mención **Desarrollo de Software**, modalidad individual, área **Finanzas**.

Aplicación web interactiva que modela la asignación del financiamiento (Bs 40.000) de **Hydrotech**, un emprendimiento hidropónico real, como un sistema lineal **Ax = b** con **A simétrica y definida positiva** (n = 4), y lo resuelve con:

- un **método directo** (Cholesky, LU con pivoteo o Gauss) → *solución numérica de referencia*;
- **Gradientes Conjugados Precondicionado (GCP)** con precondicionador de Jacobi, SSOR o IC(0);
- **Gradientes Conjugados simple (GC)** solo como contraste.

Tolerancia ‖rₖ‖₂/‖b‖₂ < 10⁻⁶ en los **tres escenarios**: ideal, bajo estrés financiero y mal condicionado.

> Web pública: https://joshuaquiquijana.github.io/hydrofin-gcp/

## El modelo en una línea

Las variables `xᵢ` son la inversión (miles de Bs) en cada línea de negocio: **Hortalizas, Plantines, Kits hidropónicos, Capacitaciones**. Se minimiza

```
Φ(x) = ½ Σₖ wₖ [(J x)ₖ − yₖ]² + ½ Σᵢ ρᵢ (xᵢ − x⁰ᵢ)²   ⇒   (JᵀWJ + R) x = JᵀW y + R x⁰   ⇒   A x = b
```

- `J` (4×4): fracción del costo de cada línea que corresponde a cada rubro (insumos, equipo/infraestructura/tecnología, personal, operación) — sale de `Costos_hydrotech.xlsx`.
- `y`: plan de financiamiento por rubro (Ficha Financiera, suma Bs 40.000).
- `x⁰`: mezcla actual de actividad (proporcional a ingresos). `ρ`: inercia operativa. `W`: prioridad de los rubros.
- **A es SPD por construcción**: `xᵀAx = Σ wₖ(Jx)ₖ² + Σ ρᵢxᵢ² ≥ ρ_mín‖x‖² > 0`.
- **Escenario 3** = `A₃ = S A₁ S`, `b₃ = S b₁` con `S = diag(costo unitario)`: mismas inversiones medidas en unidades operativas ⇒ mal escalamiento diagonal (κ ≈ 3·10⁶) que Jacobi corrige (κ(M⁻¹A) ≈ 5).

La web explica y demuestra todo esto en sus 10 módulos (formulación, demostración SPD, procedencia de datos, supuestos y limitaciones).

## Módulos de la web 

1. Inicio · 2. Caso de estudio · 3. Formulación · 4. Entrada de datos · 5. Tres escenarios (+ tabla comparativa y CSV) · 6. Solución de referencia · 7. GCP vs GC (+ laboratorio n grande) · 8. Análisis de errores · 9. Pruebas QA · 10. Conclusiones y referencias.

## Ejecutar localmente

No requiere instalación ni dependencias (HTML + JavaScript puro).

```bash
# opción 1: abrir index.html directamente en el navegador
# opción 2: servidor local
python3 -m http.server 8000      # y abrir http://localhost:8000
# pruebas del motor numérico (Node ≥ 16)
npm test                         # = node tests/run-tests.js
```


## Arquitectura

```
index.html            estructura de los 10 módulos
css/styles.css        estilos (responsive, modo oscuro)
src/config.js         datos del estudiante (editar)
src/linalg.js         álgebra lineal: Cholesky, LU, Gauss, autovalores (Jacobi), Gershgorin
src/solvers.js        GC/GCP, precondicionadores (Jacobi, SSOR, IC(0)), κ(A), κ(M⁻¹A), errores
src/model.js          datos de Hydrotech + constructor de los 3 escenarios
src/engine.js         validación matemática, sesión reactiva, laboratorio (sin DOM)
src/qa.js             casos de prueba (compartidos por la web y por Node)
src/charts.js         gráficos SVG propios
src/app.js            interfaz y renderizado
tests/run-tests.js    ejecuta la batería QA en consola
```

Principio de diseño: **núcleo numérico sin DOM** (`linalg`, `solvers`, `model`, `engine`) separado de la interfaz (`app`, `charts`), de modo que las mismas funciones se prueban en Node y en el navegador.

## Algoritmo GCP implementado

Con la notación del desafío:

```
r0 = b − A x0 ;  M z0 = r0 ;  p0 = z0
para k = 0,1,2,…
  αk = (rkᵀ zk) / (pkᵀ A pk)
  x(k+1) = xk + αk pk
  r(k+1) = rk − αk A pk
  M z(k+1) = r(k+1)
  βk = (r(k+1)ᵀ z(k+1)) / (rkᵀ zk)
  p(k+1) = z(k+1) + βk pk
parada: ‖rk‖₂/‖b‖₂ < tol  ó  k = Nmáx
```

> **Nota:** 


## Datos

- `Costos_hydrotech.xlsx` (hojas *costos Lech*, *Plantínes*, *Kits Hidr*, *Capacitaciones*): costos por ítem.
- *Ficha Financiera – Cálculos*: ingresos mensuales y necesidad de financiamiento por rubro.
- **Estimaciones/supuestos** (documentados en la web): ingreso de plantines (Bs 100/mes), ρ = 0,25, w = 1, y los porcentajes de inflación y caída de ventas del escenario de estrés. Los Excel originales no se incluyen en el repositorio.

## Historial de commits

El desafío pide un repositorio con historial. Desde la carpeta que contiene `hydrofin/`, ejecuta `bash crear_historial_git.sh` (viene junto a esa carpeta en el zip; léelo antes) para crear commits ordenados con **tu** identidad de Git, luego:

```bash
git remote add origin https://github.com/<usuario>/<repositorio>.git
git branch -M main && git push -u origin main
```

## Referencias

- Suñagua S., P. (2020). *Método de Gradientes Conjugados Precondicionado*. Revista Boliviana de Matemática – UMSA, 04, 2–7.
- Golub, G. H., & Van Loan, C. F. (2013). *Matrix Computations* (4th ed.). Johns Hopkins University Press.
- Saad, Y. (2003). *Iterative Methods for Sparse Linear Systems* (2nd ed.). SIAM.
