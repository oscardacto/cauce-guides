# Sequence — OAuth 2.1 Authorization Code with PKCE

**Contexto:** Login del portal de clientes (SPA → AWS Cognito).
**Requisitos:** OAuth 2.1, PKCE obligatorio (no client secret en el browser).

## Happy path

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario
  participant SPA as Web SPA
  participant AS as Cognito (Auth Server)
  participant API as Wallet API

  U->>SPA: Click "Login"
  SPA->>SPA: Genera code_verifier (random 43-128 chars)
  SPA->>SPA: code_challenge = base64url(SHA256(code_verifier))
  SPA->>AS: GET /authorize?response_type=code&code_challenge&code_challenge_method=S256&redirect_uri=...
  AS-->>U: Form de login
  U->>AS: Email + password (+ MFA TOTP)
  AS-->>SPA: 302 redirect_uri?code=AUTH_CODE
  Note over SPA: SPA recibe el code en el callback
  SPA->>AS: POST /token<br/>grant_type=authorization_code<br/>code=AUTH_CODE<br/>code_verifier=...
  AS->>AS: Verifica que SHA256(code_verifier) == code_challenge guardado
  AS-->>SPA: 200 { access_token, id_token, refresh_token }
  SPA->>API: GET /me Authorization: Bearer access_token
  API->>AS: GET /.well-known/jwks.json (cacheado 24h)
  API->>API: Valida firma JWT, exp, aud, iss
  API-->>SPA: 200 { perfil }
  SPA-->>U: Dashboard
```

## Error: code_verifier inválido

```mermaid
sequenceDiagram
  autonumber
  participant SPA
  participant AS as Cognito

  SPA->>AS: POST /token con code_verifier MAL formado
  AS-->>SPA: 400 invalid_grant
  Note over SPA: SPA descarta el flow y vuelve a /login
```

## Refresh token rotation

```mermaid
sequenceDiagram
  autonumber
  participant SPA
  participant AS as Cognito

  Note over SPA: access_token expirado (1h)
  SPA->>AS: POST /token<br/>grant_type=refresh_token<br/>refresh_token=...
  AS-->>SPA: 200 { access_token, refresh_token (NUEVO) }
  Note over SPA: Refresh viejo queda revocado
```

## Decisiones reflejadas

- **PKCE obligatorio:** SPA es public client; sin client secret. PKCE protege contra interceptación del code.
- **No state cookie:** SPA mantiene `state` en sessionStorage para validar el callback (CSRF).
- **JWKS cacheado 24h** en API: evita golpear `/.well-known/jwks.json` en cada request.
- **Refresh rotation activado:** un refresh roto = compromiso → cliente deslogueado forzado.
