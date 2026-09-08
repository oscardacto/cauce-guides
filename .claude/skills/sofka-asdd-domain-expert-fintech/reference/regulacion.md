# Regulación y Compliance — Fintech / Banca

## PCI-DSS (Payment Card Industry Data Security Standard)

- **Alcance**: Cualquier sistema que procese, transmita o almacene datos de tarjeta
- **Principio clave**: Reducir el alcance del CDE (Cardholder Data Environment) al mínimo
- **Reglas críticas de desarrollo**:
  - Nunca almacenar CVV, PIN ni datos sensibles de autenticación post-autorización
  - PAN debe estar protegido donde sea almacenado (cifrado AES-256 o tokenización)
  - Transmisión de datos de tarjeta solo sobre TLS 1.2+
  - Logs nunca deben contener PAN completo (máximo primeros 6 y últimos 4 dígitos)

## KYC / AML

- **KYC**: Verificar identidad del cliente antes de permitir operaciones financieras
  - Niveles: básico (nombre, documento), estándar (+dirección, actividad), reforzado (PEP, alto riesgo)
- **AML**: Detectar y reportar operaciones sospechosas de lavado de activos
  - Umbrales de reporte: varían por jurisdicción (típico ≥ USD 10.000 en efectivo en Colombia/LATAM)
  - Listas de sanción: OFAC, ONU, GAFI — validar en onboarding y periódicamente
  - Regulación local: SFC en Colombia, CNBV en México, BCB en Brasil
