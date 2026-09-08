# Kubernetes — Manifiestos base

Deployment, Service y HPA mínimos para un servicio en producción.
Reemplazar `{service-name}`, `{registry}` y `{tag}` antes de aplicar.

## Deployment + Service

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {service-name}
  labels:
    app: {service-name}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: {service-name}
  template:
    metadata:
      labels:
        app: {service-name}
    spec:
      containers:
        - name: {service-name}
          image: {registry}/{service-name}:{tag}
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {service-name}-secrets
                  key: database-url
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
---
apiVersion: v1
kind: Service
metadata:
  name: {service-name}
spec:
  selector:
    app: {service-name}
  ports:
    - port: 80
      targetPort: 3000
```

## HorizontalPodAutoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {service-name}-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {service-name}
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Checklist de producción

- [ ] `replicas >= 2` en todos los ambientes de prod.
- [ ] `requests` y `limits` definidos (memory y cpu).
- [ ] `readinessProbe` apunta a `/ready` (que valida deps externas).
- [ ] `livenessProbe` apunta a `/health` (que solo valida el proceso).
- [ ] Secretos vía `secretKeyRef`, nunca env plano.
- [ ] HPA con `minReplicas >= 2` y `maxReplicas` dimensionado al tráfico pico.
- [ ] `PodDisruptionBudget` si el servicio es crítico.
