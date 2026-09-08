# Helm Chart — Layout y convenciones

Layout de referencia para empaquetar un servicio con Helm. Optimizado para
multi-ambiente (dev, staging, prod) con secretos externos.

## Estructura

```
charts/{service-name}/
  Chart.yaml             ← metadata (name, version, appVersion, dependencies)
  values.yaml            ← valores por defecto (dev)
  values-staging.yaml    ← overrides staging
  values-prod.yaml       ← overrides prod (replicas altas, HPA max alto)
  templates/
    _helpers.tpl         ← named templates reutilizables (labels, fullname)
    deployment.yaml
    service.yaml
    ingress.yaml
    configmap.yaml
    hpa.yaml
    pdb.yaml             ← PodDisruptionBudget si crítico
    externalsecret.yaml  ← si se usa External Secrets Operator
```

## `values.yaml` base

```yaml
replicaCount: 2

image:
  repository: registry.example.com/service-name
  tag: ""            # inyectado desde pipeline: --set image.tag=$SHA
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80
  targetPort: 3000

resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "256Mi"
    cpu: "500m"

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

ingress:
  enabled: false
  className: nginx
  hosts: []
  tls: []
```

## `values-prod.yaml`

```yaml
replicaCount: 3

resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "1000m"

autoscaling:
  minReplicas: 3
  maxReplicas: 30

ingress:
  enabled: true
  hosts:
    - host: service.example.com
      paths: [/]
  tls:
    - secretName: service-tls
      hosts: [service.example.com]
```

## Gestión de secretos

No incluir secretos en values. Opciones:

- **ExternalSecrets Operator**: apunta a AWS Secrets Manager / Vault / GCP
  Secret Manager. Recomendado.
- **SealedSecrets**: secretos encriptados dentro del repo. Útil si no hay
  gestor de secretos disponible.
- **Secret manual vía kubectl + --from-literal**: solo para dev local.

## Instalación

```bash
# Staging
helm upgrade --install {service} charts/{service} \
  -f charts/{service}/values-staging.yaml \
  --set image.tag=$SHA \
  --namespace staging

# Prod (con approval manual)
helm upgrade --install {service} charts/{service} \
  -f charts/{service}/values-prod.yaml \
  --set image.tag=$SHA \
  --namespace production \
  --atomic --timeout 5m
```

`--atomic` asegura rollback automático si el deploy falla dentro del timeout.
