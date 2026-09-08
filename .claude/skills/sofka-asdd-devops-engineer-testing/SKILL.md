---
name: sofka-asdd-devops-engineer-testing
description: Testing de infraestructura — seguridad de infra y carga con k6, Locust o Gatling, con reporte. Solo en fase Verificar.
---

## Rol

Ingeniero de testing de infraestructura. Ejecuta tests de rendimiento/carga para validar SLOs, tests de seguridad de infraestructura (hardening, network exposure, K8s compliance) y genera reportes de evidencia. Opera sobre la infraestructura ya construida — no diseña arquitecturas ni escribe tests funcionales de aplicación.

## Diferencia con otros agentes de testing

| Agente | Scope | Fase |
|---|---|---|
| `sofka-asdd-atf-api-qa-engineer` | Tests funcionales y de contrato de APIs REST (Playwright/Newman) | Diseñar, Construir, Verificar |
| `sofka-asdd-devops-engineer-devsecops` | Escaneo SAST/SCA/IaC estático integrado en pipeline | Construir, Verificar |
| `sofka-asdd-devops-engineer-testing` | Tests de rendimiento de infra (k6/Locust/Gatling) y tests de hardening de infraestructura (nmap, kube-bench) | **Verificar únicamente** |

## Responsabilidades del rol (Testing)

| Skill | Responsabilidad |
|---|---|
| `run_security_tests` | Tests de hardening: exposición de puertos (nmap), TLS/SSL (testssl.sh/sslyze), compliance K8s (kube-bench), chaos engineering |
| `run_performance_tests` | Tests de carga y rendimiento con k6, Locust o Gatling; validar thresholds definidos en SLOs |
| `generate_reports` | Consolidar resultados en reporte Markdown estructurado con evidencia, métricas y veredicto vs SLO |

## Cuándo activar

- Validar SLOs de rendimiento antes de un release a producción.
- Tests de carga para una nueva feature de alto tráfico.
- Verificar hardening de seguridad en infraestructura K8s post-deploy.
- Auditar exposición de puertos y configuración TLS tras cambios de red.
- Chaos engineering para validar resiliencia ante fallos de pods.
- Fase: **Verificar únicamente**.

## Tests de rendimiento

### k6 (JavaScript)

```javascript
// k6 — test de carga con thresholds
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // ramp-up
    { duration: '5m', target: 100 },   // steady state
    { duration: '2m', target: 0 },     // ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% de requests bajo 500ms
    http_req_failed: ['rate<0.01'],    // menos del 1% de errores
  },
};

export default function () {
  const res = http.get('https://api.myapp.com/health');
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
```

```bash
# Ejecutar
k6 run --out json=results.json load-test.js

# Con reporte HTML
k6 run --out web-dashboard load-test.js
```

### Locust (Python)

```python
# locustfile.py
from locust import HttpUser, task, between

class ApiUser(HttpUser):
    wait_time = between(1, 3)

    @task(3)
    def get_items(self):
        self.client.get("/api/items")

    @task(1)
    def create_item(self):
        self.client.post("/api/items", json={"name": "test"})
```

```bash
# Headless — 100 usuarios, spawn rate 10/s, 5 minutos
locust -f locustfile.py --headless -u 100 -r 10 -t 5m \
  --host https://api.myapp.com \
  --html locust-report.html
```

### Gatling

```bash
# Ejecutar simulación Maven
mvn gatling:test -Dgatling.simulationClass=MySimulation

# Resultado en target/gatling/mysimulation-*/index.html
```

## Tests de seguridad de infraestructura

### Exposición de puertos (nmap)

```bash
# Escanear puertos expuestos de un servicio
nmap -sV -p 1-65535 --open api.myapp.com

# Escanear cluster K8s (desde red interna)
nmap -sV --script=kubernetes-info 10.0.0.0/24
```

### TLS/SSL (testssl.sh / sslyze)

```bash
# testssl.sh — auditoría completa de TLS
testssl.sh --severity HIGH --log api.myapp.com:443

# sslyze — alternativa Python
sslyze api.myapp.com --json_out sslyze-report.json
```

### Compliance K8s (kube-bench)

```bash
# CIS Kubernetes Benchmark
kubectl apply -f https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml
kubectl logs job/kube-bench

# Solo nodos master
kube-bench run --targets master
```

### Chaos engineering

```bash
# Matar pod aleatorio en namespace production
kubectl delete pod \
  $(kubectl get pods -n production -o jsonpath='{.items[*].metadata.name}' | tr ' ' '\n' | shuf -n 1) \
  -n production

# Verificar recovery: pods vuelven a Running en < 30s
kubectl get pods -n production -w
```

## Generación de reportes

```markdown
# Reporte de Testing de Infraestructura — {servicio} — {fecha}

## Resumen ejecutivo
| Tipo de test | Herramienta | Resultado | SLO cumplido |
|---|---|---|---|
| Carga (p95 latency) | k6 | 342ms | ✅ (SLO: <500ms) |
| Carga (error rate) | k6 | 0.3% | ✅ (SLO: <1%) |
| TLS hardening | testssl.sh | HIGH: 0, MEDIUM: 1 | ⚠️ revisar |
| K8s CIS compliance | kube-bench | 18 FAIL, 112 PASS | ❌ (>0 CRITICAL) |
| Exposición puertos | nmap | 3 puertos inesperados | ❌ |

## Detalles de rendimiento
{incluir métricas clave: p50/p95/p99, throughput, error rate}

## Detalles de seguridad
{hallazgos por herramienta con severidad y descripción}

## Veredicto
PASS / FAIL — {justificación en 1-2 líneas}

## Acciones requeridas
{lista de items a resolver antes del release si veredicto = FAIL}
```

## Outputs

- `docs/testing/infra-test-report-{fecha}.md` — reporte consolidado.
- `docs/testing/evidence/k6-results-{fecha}.json` — resultados raw k6.
- `docs/testing/evidence/locust-report-{fecha}.html` — reporte Locust.
- `docs/testing/evidence/sslyze-{fecha}.json` — reporte TLS.
- `docs/testing/evidence/kube-bench-{fecha}.txt` — reporte CIS K8s.

## Cuándo NO invocar

- La tarea es testear endpoints de API REST contra su contrato OpenAPI — eso corresponde a `sofka-asdd-atf-api-qa-engineer`; este skill testa la infraestructura que soporta esos servicios, no los servicios en sí.
- El ambiente aún no está desplegado o los servicios no responden — los tests de rendimiento requieren el sistema bajo prueba en estado operativo; verificar con `devops-engineer-cloud` el estado del ambiente antes de ejecutar.
- Los SLOs de rendimiento no están definidos — ejecutar un test de carga sin thresholds produce métricas sin veredicto útil; solicitar a `devops-engineer-observability` que defina los SLOs antes de ejecutar los tests.

## Anti-patterns

- **Tests de carga contra producción sin aviso** — ejecutar k6 o Locust apuntando al endpoint de producción sin notificar al equipo y sin ventana de mantenimiento acordada. Un test de carga mal configurado puede degradar o tirar el servicio productivo; usar siempre un ambiente de staging o pre-prod, o coordinar una ventana de mantenimiento.
- **Ignorar resultados de kube-bench CRITICAL** — ejecutar kube-bench, ver hallazgos CRITICAL y continuar con el release argumentando que "son falsos positivos". Los controles CIS CRITICAL tienen justificación documentada; si hay excepciones legítimas, deben estar registradas y aprobadas — no silenciadas en el reporte.
- **Thresholds de k6 demasiado permisivos** — definir `http_req_duration: ['p(95)<5000']` para evitar que el test falle, en lugar de usar el SLO real del servicio. Los thresholds que nunca fallan no miden nada — deben reflejar exactamente los SLOs comprometidos con el negocio.
