# Project Context

## Purpose

Another OpenCode integration for Obsidian. The plugin attaches to an OpenCode service the user already runs, renders that service's Web UI in an Obsidian view, and adds vault navigation, prompt context attachments, and diagnostics around it. It never spawns, restarts, or terminates a process.

## Tech Stack

- **TypeScript** — primary language, strict null checks
- **Obsidian Plugin API** — views, settings, commands, workspace events
- **esbuild** — bundler (ES2018 target, CommonJS output)
- **Node.js `http` / `fs` / `os` / `path`** — service probing, file reads, runtime paths; the plugin never starts a process
- **Bun** — package manager, build runner, test runner

## Project Conventions

### Code Style

**Imports:**

- ES modules with named imports
- Order: Obsidian API → Node.js builtins → local modules
- `type` keyword for type-only imports
- Relative paths with `./` prefix

```typescript
import { Notice, Plugin } from "obsidian";
import { request as httpRequest } from "http";
import { attachService, type ServiceHandle } from "./server/ServiceDiscovery";
```

**Naming Conventions:**

| Type           | Convention                     | Example                                     |
| -------------- | ------------------------------ | ------------------------------------------- |
| Classes        | PascalCase                     | `OpenCodePlugin`, `OpenCodeWebUiProxy`      |
| Interfaces     | PascalCase                     | `OpenCodeSettings`, `ServiceStatus`         |
| Constants      | UPPER_CASE or camelCase        | `DEFAULT_SETTINGS`, `OPENCODE_VIEW_TYPE`    |
| Functions      | camelCase                      | `attachService`, `buildPromptAttachments`   |
| Private members| camelCase (no prefix)          | `private serviceStatus`                     |
| Files          | PascalCase for classes         | `ServiceDiscovery.ts`, `OpenCodeView.ts`    |

**TypeScript Patterns:**

- `strictNullChecks` enabled — handle null/undefined explicitly
- Union types for state: `"attached" | "unavailable"`
- `async/await` over raw promises
- Explicit return types on public methods
- Node builtins imported as ES modules; `builtin-modules` marks them external in esbuild

### Architecture Patterns

**Project Structure:**

```
src/
├── main.ts                  # Plugin entry, attach wiring, commands
├── types.ts                 # Settings and context candidate types
├── client/                  # OpenCode HTTP client + SSE event source
├── server/                  # Service discovery and service state
├── bridge/                  # Web UI proxy, HTML/script injection, local messages
├── context/                 # Candidate registry, prompt attachments, status bar
├── graph/                   # Vault link graph read model
├── debug/                   # XDG diagnostics and status.json
├── settings/                # Settings tab
├── theme/                   # Obsidian-derived Web UI tokens
└── ui/                      # View and view manager
```

**Service Data Flow:**

- `~/.local/state/opencode/service*.json` → `ServiceHandle {name, url, password, version, pid}` → three consumers: HTTP client, event source, local proxy
- `ServiceHandle` is the only source of url and password; nothing else parses the state file

**Context Data Flow:**

- Obsidian facts (open notes, selection, explicit commands) → `CandidateRegistry` → `buildPromptAttachments()` → prompt request body `files`

**State Management:**

- Callback-based subscriptions for state changes
- `serviceStatus` has a single writer (`applyServiceStatus`); `getServiceState()` derives from it
- Runtime status is mirrored to XDG `status.json` for the harness; it never contains the service password

**Error Handling:**

- Failures return `null` / `false` and are logged with the facts needed to diagnose them
- No silent catch of broken invariants; a failed attach is a visible `unavailable` state with a reason
- `new Notice()` only for actions the user must take
- Boolean returns for success/failure on operations with two outcomes

### Testing Strategy

- `bun test`, files under `tests/` mirroring `src/`
- HTTP behavior is tested against a local `http.Server`, never a mocked client
- `bun run check` = `format:check && lint && build && typecheck && test`

### Git Workflow

Feature branch per change; concise commit messages describing the change. Issue tracking uses `br` (beads) under `.beads/`.

## Domain Context

**OpenCode Service:**

- OpenCode 2.1+ runs as a user-owned service (`opencode service start`), independent of Obsidian
- The service registers itself at `~/.local/state/opencode/service.json` (additional instances use `service-<name>.json`), with `url`, `pid`, `version`, `password`, permissions `0600`
- Liveness authority is `GET /api/info` with Basic auth (`opencode:<password>`): HTTP 200 plus `version` and `pid`
- Every HTTP call goes to `/api/*`; the project directory travels as the `directory` query parameter, never as a header
- Prompt entry point is `POST /api/session/{id}/prompt`; the session list is `GET /api/session?directory=<abs>&limit=<n>&order=<asc|desc>`, responding `{data, cursor}`
- Events come from `GET /api/event` (SSE); frames carry `location.directory` and are filtered client-side
- Liveness of the connection, not polling, decides service death: the SSE stream ending means the service is gone

**Obsidian Integration:**

- View registered with `OPENCODE_VIEW_TYPE`, opened in sidebar or main area per `defaultViewLocation`
- View renders two states: attached (iframe) and unavailable (command, reason, log path, retry)
- Ribbon icon activates the view; six commands cover panel, deep view, diagnostics, and context

**Service States:**

- `attached` — a service answered `/api/info` and the proxy points at it
- `unavailable` — no reachable service; the plugin retries every 10 seconds and shows `opencode service start`

## Important Constraints

**Desktop Only:**

- Uses Node.js `http` and `fs`, unavailable on mobile
- File system access through the vault adapter also requires desktop

**Build Output:**

- Must produce a single `main.js` (CommonJS)
- External: `obsidian`, `electron`, `@codemirror/*`, `@lezer/*`, and all Node builtins

**TypeScript Config:**

- Target: ES6, module ESNext (bundled to CJS)
- Strict null checks, no implicit any

## External Dependencies

**Runtime:**

- OpenCode 2.1+ service reachable on the local machine, started by the user

**Development:**

- `obsidian` — API types and runtime
- `@types/node` — Node.js type definitions
- `esbuild` — bundler
- `typescript` — type checking
- `prettier`, `eslint` — formatting and lint
