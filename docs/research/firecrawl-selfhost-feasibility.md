# Firecrawl local `/v2/search`: focused feasibility

2026-09-25 — **Research only. Nothing installed, built, started, or tested.** Only public HTTP documentation/source was read; no browser or local secret/configuration inspection. This file is the only project change.

## Decision

**No-go on the currently reported machine budget.** The coordinator reports WSL has only **1.8 GiB available and 1.9/2 GiB swap already used**. Do not add the official multi-service Firecrawl stack or another SearxNG instance now.

**The underlying no-cloud-key route is legitimate and exists in official source:** `/v2/search` can use direct DuckDuckGo HTML search, optionally SearxNG, with database authentication disabled. However, the inspected official deployment is not a lightweight standalone search server. No supported, dependency-minimal official `/v2/search` launcher or directly executable search-module recipe was established. Thus: **technically viable with more capacity; not a verified viable deployment here now.** [1–5]

The existing CodeOSS/agents and 32 tests are coordinator-provided context, not evidence that Firecrawl works. Research completion must not be represented as an implemented or tested Firecrawl integration.

The coordinator subsequently made one real keyless POST to the official cloud `/v2/search` for `site:cursor.com Cursor 3 Agents Window Editor Window`. It returned HTTP 403 requiring an API key for this IP, with no results. Exact sanitized request/response: `firecrawl-attempt.json`. No account was created, no other provider credential was sent, and no alternate-address/bypass attempt was made.

## Exact source findings

The official self-host guide pins **`v2.11.162`**, resolved to **`7666c1f9ae8720a6bba271e0f60b6a217f8a5210`**. The requested `mendableai/firecrawl` repository redirects to the official current `firecrawl/firecrawl` location. Its v2 backend selection was also compared with main at `7ecc538d02f6d5d4784d2de0049495a1864fb661`; the same provider precedence remains. Deployment claims below concern the pinned release. [1–3]

Actual v2 call chain: controller → `search/execute.ts` → `search/v2/index.ts` → selected backend. [2]

| Variable | Actual meaning |
| --- | --- |
| `USE_DB_AUTHENTICATION=false` | Official self-host auth-disabled mode; no Firecrawl cloud key, bearer header, or Supabase account required for the documented local evaluation. Not the cloud's limited keyless free tier. [1] |
| `FIRE_ENGINE_BETA_URL` | Nonempty selects Fire-engine **before** SearxNG and immediately returns that path's result. Leave unset/empty. Fire-engine is not included in the default open-source stack. [2,4] |
| `SEARXNG_ENDPOINT` | Optional SearxNG **base URL**, e.g. `http://searxng:8080`. Firecrawl appends `/search`; do not include that suffix. [2] |
| `SEARXNG_ENGINES` | Passed as the `engines` query parameter. `duckduckgo` is an official key-free HTML-engine example. Empty uses instance defaults, which are not a blanket assurance that every engine is key-free. [2,6] |
| `SEARXNG_CATEGORIES` | Passed as `categories`; use `general` for the proposed web-search scope. [2] |
| `TEST_SUITE_SELF_HOSTED` | **Must remain false/unset.** True can fabricate an `https://example.com` result titled `DDG Anti-Bot Test Page` when DuckDuckGo blocks requests. Never use it to claim live search success. [3] |
| `NUQ_BACKEND` | Unset/empty retains the PostgreSQL queue path. No FoundationDB server needed for this path. [1,5] |
| `NUQ_WORKER_COUNT` | Actual harness process-count setting; default **5**. `1` reduces workers but does not create a search-only API. The pinned Compose file does not forward it from root `.env`; an explicit API environment override is needed. [5] |

If Fire-engine is unset, configured SearxNG is tried first; empty/error SearxNG results fall back to DuckDuckGo. Without SearxNG, DuckDuckGo is used directly. Escaping backend errors are caught and return `{}`. Consequently, HTTP 200 / `success: true` can coexist with no useful results. [2,3]

**Stale instructions:** pinned `SELF_HOST.md` says Google is the default; v2 executable source uses **DuckDuckGo**. `SEARCHAPI_API_KEY` / `SEARCHAPI_ENGINE` appear in the public development template but are not used by the inspected v2 selector and are not prerequisites. Do not acquire those keys or copy the development `.env.example` wholesale: it enables DB authentication by default. [2,4]

## Does public-engine search work without a key?

**Yes in implementation, not guaranteed in operation.** Firecrawl's `ddgsearch.ts` fetches `https://html.duckduckgo.com/html?...` with `undici`, parses HTML via JSDOM, and submits HTML pagination forms. There is no upstream account/API-key requirement in this implementation. Its CAPTCHA/anti-bot detection and exception handling explicitly acknowledge failure cases. [3]

The SearxNG adapter makes an unauthenticated `GET <base>/search` with `q`, `language`, `engines`, `categories`, `pageno`, and `format=json`. A private instance using the official `duckduckgo` engine can query the public HTML interface without a purchased key. Its query-derived pagination token is not a user-supplied API credential. An arbitrary public SearxNG instance is not a reliable dependency: JSON may be disabled and automation may be blocked. [2,6]

If an authorized, reachable SearxNG instance **already exists**, relevant minimal instance settings are:

```yaml
use_default_settings:
  engines:
    keep_only:
      - duckduckgo
server:
  secret_key: "REPLACE_WITH_LOCALLY_GENERATED_RANDOM_SECRET"
  limiter: false
  public_instance: false
search:
  formats: [html, json]
```

The SearxNG secret is a locally generated application secret, not a cloud key. Disabling the limiter avoids its additional Valkey requirement for a private instance. Official container port: 8080; configuration path: `/etc/searxng/settings.yml`. **Do not start this additional container under the current resource constraint.** Reusing SearxNG also does not remove the Firecrawl server's own dependencies. [6]

Scope: plain **web** results, not cloud-equivalent image/news/enterprise search. Both inspected local adapters produce `web`. SearxNG's adapter does not map country/location. Omit `scrapeOptions` initially; destination scraping happens only with nonempty `scrapeOptions.formats`. Markdown retrieval is a separate acceptance stage, not required for URL/title/description search. [2]

## Can the official search module run directly or as a lightweight API?

**Not established; do not claim it can.** `ddgsearch.ts` exports a TypeScript function, not a CLI or HTTP listener. It imports `undici`, JSDOM, Firecrawl config, logger, entities, and `getSecureDispatcher` from the scraper's safe-fetch implementation. The v2 dispatcher additionally imports SearxNG and Fire-engine adapters. Extracting it or writing a new listener would be a custom reduced service requiring dependency/build/security work—not the documented official `/v2/search` deployment. No direct Node 24 module execution or reduced-runtime test was performed. [2,3]

The conservative official runtime has **five long-running containers**:

1. `api`: HTTP server plus worker subprocesses managed by `harness.js --start-docker`.
2. `redis`.
3. `rabbitmq`.
4. `nuq-postgres`: queue database configured by the harness; start explicitly because API `depends_on` does not list it.
5. `playwright-service`: retained by the official API dependency graph, even though result-only DuckDuckGo requests do not themselves use a browser.

SearxNG adds a sixth. Dropping these services/workers would require a separately validated custom-runtime investigation. The pinned Compose file also defines `foundationdb` and `foundationdb-init` without optional profiles, so bare `docker compose up` starts unnecessary services even with PostgreSQL queueing. Selecting only the five named services avoids that trap. [5]

**Node 24 compatibility:** the official API Dockerfile uses **`node:22-slim`**, pnpm **11.4.0**, Go **1.24**, Rust/native compilation, and Linux dependencies. Existing Windows/WSL host Node 24 need not change if Docker is used, but it does not establish a working native Windows or Node 24 build. This is not a plain single-file Node service. Compose's 8G API and 4G Playwright memory limits are caps, not measured minimum requirements; no smaller RAM benchmark was established. [5,7]

## Exact next plan, without deployment now

1. **Defer runtime/integration.** Preserve the existing application; report Firecrawl as researched but not operational. Do not consume the remaining WSL capacity or obtain paid/cloud keys.
2. **If capacity becomes available**, use a separate pinned official checkout and the documented Docker route—not source copied into CodeOSS:

   ```bash
   # Future commands only; not executed during research.
   git clone --depth 1 --branch v2.11.162 \
     https://github.com/mendableai/firecrawl.git firecrawl-v2.11.162
   git -C firecrawl-v2.11.162 rev-parse HEAD
   # Expected: 7666c1f9ae8720a6bba271e0f60b6a217f8a5210
   ```

   In that dedicated checkout, use a fresh root `.env` with `USE_DB_AUTHENTICATION=false`, `POSTGRES_USER=postgres`, a locally generated strong `POSTGRES_PASSWORD`, and `POSTGRES_DB=postgres` (required by the included pg_cron setup). Leave cloud/provider keys, Fire-engine, SearxNG, `BULL_AUTH_KEY`, and `NUQ_BACKEND` unset. Keep the test flag false. Bind the API's published port to loopback. [1,5]

   The **service-selection command**, after that configuration and adequate resource allocation, is:

   ```bash
   docker compose up --build -d redis rabbitmq nuq-postgres playwright-service api
   ```

   This identifies the minimum conservative service set, **not permission or a recommendation to execute it now**, and is not a complete production deployment recipe.
3. **Require actual endpoint evidence** before wiring the agent adapter:

   ```bash
   curl --fail --silent --show-error --max-time 5 \
     http://127.0.0.1:3002/v0/health/readiness

   curl --fail-with-body --silent --show-error --max-time 75 \
     -X POST http://127.0.0.1:3002/v2/search \
     -H 'Content-Type: application/json' \
     -d '{"query":"Node.js official documentation","limit":3}'
   ```

   No authorization header. Require nonempty `data.web` with genuine URLs/titles/descriptions; reject the dummy anti-bot page. Repeat with a second distinct query. Readiness alone is insufficient. If using SearxNG, separately verify its JSON response and that Firecrawl did not fall back to DuckDuckGo. [1–3]
4. **Integrate only after success:** point the existing adapter at the loopback HTTP endpoint and surface blocked/unavailable/empty results honestly. If a five-service deployment remains unacceptable, explicitly state that a lightweight official Firecrawl route is unproven; do not relabel a custom DuckDuckGo wrapper as official Firecrawl or introduce another API provider.

## License/source compatibility

The server repository is primarily **AGPL-3.0**; SDKs and some UI components have MIT exceptions. The API package manifest's `"license": "ISC"` conflicts with the top-level license/README and should not be treated as a permissive grant for the entire server. AGPL section 2 permits running the unmodified program; section 13 requires modified network versions to offer Corresponding Source to their remote users. Distribution adds obligations. Prefer a separate HTTP service; copying/linking/bundling server source into CodeOSS needs a specific licensing review. Do not assert either that HTTP clients automatically become AGPL or that bundling has no obligations. [8]

Open-source permission does not override public engines' terms or blocking. Firecrawl itself requires users to respect website policies. No anti-bot bypass or cloud access is part of this recommendation. [8]

## Focused primary references

1. Official self-host guide, version and no-auth evaluation: https://docs.firecrawl.dev/contributing/self-host
2. Pinned v2 implementation: [selector](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/apps/api/src/search/v2/index.ts), [SearxNG adapter](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/apps/api/src/search/v2/searxng.ts), [execution](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/apps/api/src/search/execute.ts), [controller response](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/apps/api/src/controllers/v2/search.ts#L321-L326). [Main selector cross-check](https://github.com/mendableai/firecrawl/blob/7ecc538d02f6d5d4784d2de0049495a1864fb661/apps/api/src/search/v2/index.ts).
3. Pinned direct DDG source, dependencies and fake-test-result branch: https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/apps/api/src/search/v2/ddgsearch.ts
4. Repository instructions and development template: [SELF_HOST.md](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/SELF_HOST.md), [.env.example](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/apps/api/.env.example).
5. Official deployment/runtime: [Compose](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/docker-compose.yaml), [harness startup](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/apps/api/src/harness.ts#L818-L921), [worker configuration](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/apps/api/src/config.ts#L219-L239).
6. Official SearxNG documentation: [DuckDuckGo implementation](https://docs.searxng.org/dev/engines/online/duckduckgo.html), [JSON formats](https://docs.searxng.org/admin/settings/settings_search.html), [server/limiter](https://docs.searxng.org/admin/settings/settings_server.html), [engine filtering](https://docs.searxng.org/admin/settings/settings.html), [container paths/port](https://docs.searxng.org/admin/installation-docker.html). Official engine name verified in [default settings](https://github.com/searxng/searxng/blob/master/searx/settings.yml).
7. Official Docker toolchain: https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/apps/api/Dockerfile
8. License/policy sources: [LICENSE](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/LICENSE), [README](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/README.md#license), [API manifest](https://github.com/mendableai/firecrawl/blob/7666c1f9ae8720a6bba271e0f60b6a217f8a5210/apps/api/package.json).
