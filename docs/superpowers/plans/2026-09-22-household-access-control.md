# Household Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a shared household access code before a deployed device can read ledger pages or APIs, while trusting the device for 30 days.

**Architecture:** The Node server owns code verification, signed session issuance, rate limiting, and all API authorization. Nginx calls an internal session-check endpoint before serving the SPA and redirects unauthenticated page requests to a standalone, public unlock page; the unlock page posts the code and then reloads the protected application.

**Tech Stack:** Node 22 `crypto`, Express 4, TypeScript, Vue 3, Vitest, Supertest, Nginx, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-22-access-control-and-category-management-design.md`

## Global Constraints

- Production requires non-empty `FAMILY_ACCESS_CODE` and `SESSION_SECRET`.
- Do not store the access code in SQLite, IndexedDB, localStorage, or Vue state after submission.
- Trusted-device cookie lifetime is exactly 30 days; use `HttpOnly`, `SameSite=Strict`, `Path=/`, and production-only `Secure`.
- All business `/api` routes require a valid session; only session/unlock/lock and health routes are public.
- Failed unlocks are limited to five attempts per client IP over 15 rolling minutes.
- Production must terminate HTTPS and redirect HTTP to HTTPS.

---

## File Structure

- Create: `server/src/auth/config.ts` - parses and validates environment-backed access settings.
- Create: `server/src/auth/session.ts` - opaque signed-cookie creation, verification, clearing, and timing-safe code comparison.
- Create: `server/src/auth/rateLimit.ts` - bounded in-memory failed-attempt tracker keyed by trusted client IP.
- Create: `server/src/middleware/access.ts` - Express middleware that enforces a verified session and emits JSON `401`.
- Create: `server/src/routes/access.routes.ts` - public unlock, lock, and internal session-check endpoints.
- Create: `server/src/routes/access.routes.test.ts` - Supertest session and rate-limit coverage.
- Modify: `server/src/app.ts` - constructs access dependencies, mounts public access routes before the guard, then mounts protected routes.
- Modify: `server/src/main.ts` - validates production configuration and enables proxy trust only for configured reverse proxies.
- Create: `web/public/unlock.html` - self-contained public unlock page; no app bundle or persisted secret.
- Modify: `web/src/lib/api.ts` - dispatches a single `family-access-lost` event on `401` before raising `ApiError`.
- Modify: `web/src/lib/api.test.ts` - proves a `401` emits the session-loss event.
- Modify: `web/src/App.vue` - handles session-loss by replacing the document with `/unlock.html?next=<hash>`.
- Modify: `deploy/nginx.conf` - uses `auth_request` for `/` and `/api`, exposes only unlock/access endpoints, and applies HTTPS redirect configuration.
- Create: `deploy/Dockerfile.app` - builds and runs the current Node/SQLite server.
- Modify: `deploy/docker-compose.prod.yml` - replaces the obsolete Java/MySQL app service with the Node app and a persistent SQLite data volume.
- Modify: `deploy/README.md` - documents the Node deployment, environment secrets, HTTPS, rotation, and lock verification.

### Task 1: Add Configurable, Testable Session Primitives

**Files:**
- Create: `server/src/auth/config.ts`
- Create: `server/src/auth/session.ts`
- Create: `server/src/auth/rateLimit.ts`
- Test: `server/src/auth/session.test.ts`

**Interfaces:**
- Produces: `AccessConfig`, `readAccessConfig(env)`, `assertProductionAccessConfig(config)`, `createSessionCookie(config, now)`, `verifySessionCookie(value, config, now)`, `clearSessionCookie(config)`, `codesMatch(provided, expected)`, and `FailedAttemptLimiter`.
- Consumes: Node `crypto`; no Express imports.

- [ ] **Step 1: Write failing session and limiter tests**

```ts
const config = readAccessConfig({
  NODE_ENV: 'production', FAMILY_ACCESS_CODE: 'house-code', SESSION_SECRET: 'x'.repeat(48),
});
expect(verifySessionCookie(cookieValue(createSessionCookie(config, new Date('2026-09-22'))), config,
  new Date('2026-10-21'))).toBe(true);
expect(verifySessionCookie(cookieValue(createSessionCookie(config, new Date('2026-09-22'))), config,
  new Date('2026-10-23'))).toBe(false);
expect(codesMatch('house-code', config.accessCode)).toBe(true);
expect(codesMatch('wrong', config.accessCode)).toBe(false);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- server/src/auth/session.test.ts`

Expected: FAIL because `server/src/auth/session.ts` does not exist.

- [ ] **Step 3: Implement config, signed payload, and bounded limiter**

```ts
export interface AccessConfig {
  enabled: boolean;
  production: boolean;
  accessCode: string;
  sessionSecret: string;
  cookieName: 'family_access';
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000;
}

export function codesMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
```

Use a base64url JSON payload containing `{ exp: number }` plus a SHA-256 HMAC.
Reject malformed payloads, signature mismatches, and expired payloads. Limiters must purge expired timestamps before checking the five-attempt threshold.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- server/src/auth/session.test.ts`

Expected: PASS, including malformed cookie, expiration, secret rotation, wrong code, and five-attempt cases.

- [ ] **Step 5: Commit primitives**

```bash
git add server/src/auth
git commit -m "feat: add signed household access sessions"
```

### Task 2: Guard Server APIs and Expose Access Endpoints

**Files:**
- Create: `server/src/middleware/access.ts`
- Create: `server/src/routes/access.routes.ts`
- Create: `server/src/routes/access.routes.test.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/main.ts`
- Test: `server/src/smoke.test.ts`

**Interfaces:**
- Consumes: `AccessConfig`, `verifySessionCookie`, `createSessionCookie`, `clearSessionCookie`, `codesMatch`, and `FailedAttemptLimiter` from Task 1.
- Produces: `accessRoutes(deps)`, `requireAccess(deps)`, and `createApp(db, { accessConfig? })`.
- Contract: `POST /api/access/unlock` accepts `{ code: string }`; `POST /api/access/lock` clears the cookie; `GET /api/access/session` returns 204 only with a valid session; denied protected APIs return `{ error: { code: 'ACCESS_REQUIRED', message: '需要家庭访问口令' } }` with 401.

- [ ] **Step 1: Write failing route tests**

```ts
const app = createApp(db, { accessConfig: enabledTestConfig });
await request(app).get('/api/family').expect(401);
const unlock = await request(app).post('/api/access/unlock').send({ code: 'house-code' }).expect(204);
const cookie = unlock.headers['set-cookie'][0];
await request(app).get('/api/family').set('Cookie', cookie).expect(200);
await request(app).post('/api/access/lock').set('Cookie', cookie).expect(204);
```

Also cover incorrect code, sixth failed attempt (429), an invalid cookie, `Secure` cookie behavior in production, and disabled configuration preserving existing test behavior.

- [ ] **Step 2: Run route tests to verify failure**

Run: `npm test -- server/src/routes/access.routes.test.ts`

Expected: FAIL because access routes and middleware are absent.

- [ ] **Step 3: Implement public-before-guard routing**

```ts
app.set('trust proxy', accessConfig.trustProxy);
app.use('/api/access', accessRoutes(accessDeps));
app.get('/healthz', (_req, res) => res.status(204).end());
app.use('/api', requireAccess(accessDeps));
app.use('/api/family', familyRoutes(db));
```

`requireAccess` must be a no-op when access is disabled. `main.ts` must call `assertProductionAccessConfig` before `listen`, so a production process never starts with an unprotected configuration.

- [ ] **Step 4: Run focused and regression server tests**

Run: `npm test -- server/src/routes/access.routes.test.ts server/src/smoke.test.ts`

Expected: PASS. The smoke suite must keep its existing behavior by constructing `createApp` with access disabled.

- [ ] **Step 5: Commit server access control**

```bash
git add server/src/app.ts server/src/main.ts server/src/middleware/access.ts server/src/routes/access.routes.ts server/src/routes/access.routes.test.ts server/src/smoke.test.ts
git commit -m "feat: protect ledger APIs with household access"
```

### Task 3: Add Public Unlock UX and 401 Recovery

**Files:**
- Create: `web/public/unlock.html`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/lib/api.test.ts`
- Modify: `web/src/App.vue`
- Test: `web/src/App.test.ts`

**Interfaces:**
- Consumes: `POST /api/access/unlock` and `POST /api/access/lock` from Task 2.
- Produces: a public unlock page that accepts `?next=%23settings` and a browser `family-access-lost` event carrying no secret data.

- [ ] **Step 1: Write failing client tests**

```ts
window.addEventListener('family-access-lost', onLost, { once: true });
mockFetch({ error: { code: 'ACCESS_REQUIRED', message: '需要家庭访问口令' } }, { status: 401, ok: false });
await expect(apiGet('/api/family')).rejects.toMatchObject({ status: 401 });
expect(onLost).toHaveBeenCalledTimes(1);
```

Add an `App.test.ts` case that dispatches the event and expects navigation to start with `/unlock.html?next=`.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- web/src/lib/api.test.ts web/src/App.test.ts`

Expected: FAIL because no event or redirect exists.

- [ ] **Step 3: Implement the unlock page and session-loss redirect**

```ts
if (res.status === 401) {
  window.dispatchEvent(new CustomEvent('family-access-lost'));
}
```

`unlock.html` must use an inline form, submit JSON to `/api/access/unlock`, display generic failure/rate-limit text, and use `location.replace(next || '/')` after 204. It must not cache, log, or persist the entered code. `App.vue` must register and remove one listener and preserve `window.location.hash` using `encodeURIComponent`.

- [ ] **Step 4: Run frontend tests and typecheck**

Run: `npm test -- web/src/lib/api.test.ts web/src/App.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit unlock UX**

```bash
git add web/public/unlock.html web/src/lib/api.ts web/src/lib/api.test.ts web/src/App.vue web/src/App.test.ts
git commit -m "feat: add household unlock flow"
```

### Task 4: Make the Production Proxy Run and Enforce the Node Guard

**Files:**
- Create: `deploy/Dockerfile.app`
- Modify: `deploy/nginx.conf`
- Modify: `deploy/docker-compose.prod.yml`
- Modify: `deploy/README.md`
- Test: `deploy/nginx.conf` through `nginx -t` in the web image.

**Interfaces:**
- Consumes: Node server listening on `3001`, `/api/access/session`, `/api/access/unlock`, `/api/access/lock`, and `web/public/unlock.html`.
- Produces: production deployment in which Nginx `auth_request` protects `/`, `/assets/`, and protected `/api` traffic.

- [ ] **Step 1: Add failing deployment checks**

```bash
docker compose -f deploy/docker-compose.prod.yml config
docker build -f deploy/Dockerfile.web -t family-ledger-web-test .
docker run --rm family-ledger-web-test nginx -t
```

Expected before implementation: the composition still references `../backend` and cannot run the current Node service.

- [ ] **Step 2: Build the Node production image and correct Compose topology**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY server ./server
CMD ["./node_modules/.bin/tsx", "server/src/main.ts"]
```

Compose must pass `NODE_ENV=production`, `FAMILY_ACCESS_CODE`, and `SESSION_SECRET` to `app`, persist `/app/data` in a named volume, and remove the obsolete Java/MySQL services from this Node deployment definition. Do not expose app port 3001 publicly.

- [ ] **Step 3: Apply Nginx auth-request and public unlock exceptions**

```nginx
location = /_access_check {
    internal;
    proxy_pass http://app:3001/api/access/session;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Cookie $http_cookie;
}
location / { auth_request /_access_check; try_files $uri $uri/ /index.html; error_page 401 = /unlock.html; }
location = /unlock.html { try_files $uri =404; }
location = /api/access/unlock { proxy_pass http://app:3001; }
```

Keep proxy forwarding headers for all API locations. In the documented TLS deployment, add a port-80 redirect server and a 443 TLS server; certificate paths are explicitly supplied through deployment configuration rather than hard-coded.

- [ ] **Step 4: Update operations documentation and validate configuration**

Run: `docker compose -f deploy/docker-compose.prod.yml config && docker run --rm family-ledger-web-test nginx -t`

Expected: PASS. The README must document `.env` entries for `FAMILY_ACCESS_CODE` and `SESSION_SECRET`, HTTPS certificate setup, 30-day behavior, `Lock this device`, and rotating `SESSION_SECRET` to revoke all devices.

- [ ] **Step 5: Commit deployment support**

```bash
git add deploy/Dockerfile.app deploy/nginx.conf deploy/docker-compose.prod.yml deploy/README.md
git commit -m "deploy: protect household ledger behind nginx access check"
```

### Task 5: Run End-to-End Verification

**Files:**
- Modify: `server/src/routes/access.routes.test.ts` only if gaps are found.
- Modify: `web/src/lib/api.test.ts` only if gaps are found.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: evidence that the protected deployment denies ledger data before unlock and works afterward.

- [ ] **Step 1: Run all automated checks**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 2: Run a local production smoke test**

```bash
FAMILY_ACCESS_CODE='test-house-code' SESSION_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef' \
docker compose -f deploy/docker-compose.prod.yml up -d --build
curl -i http://localhost/api/family
curl -i -c /tmp/family-cookie -H 'Content-Type: application/json' \
  -d '{"code":"test-house-code"}' http://localhost/api/access/unlock
curl -i -b /tmp/family-cookie http://localhost/api/family
```

Expected: first ledger request is denied or redirected to unlock, unlock sets an HttpOnly cookie, and the final request returns family JSON.

- [ ] **Step 3: Stop only this test deployment after recording results**

Run: `docker compose -f deploy/docker-compose.prod.yml down`

Expected: containers stop while the named SQLite volume remains intact.

- [ ] **Step 4: Commit any verification-only corrections**

```bash
git add server web deploy
git commit -m "test: cover household access deployment"
```
