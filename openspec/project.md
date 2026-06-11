# Project Context

## Purpose

Obsidian plugin that embeds the OpenCode AI assistant via an iframe. The plugin spawns a local OpenCode server process and displays its web UI in the Obsidian sidebar, enabling AI-assisted coding and note-taking within Obsidian.

## Tech Stack

- **TypeScript** - Primary language with strict null checks
- **Obsidian Plugin API** - For UI integration, views, settings, and commands
- **esbuild** - Bundler (ES2018 target, CommonJS output)
- **Node.js child_process** - For spawning the OpenCode server process
- **Bun** - Package manager and runtime

## Project Conventions

### Code Style

**Imports:**

- ES modules with named imports
- Order: Obsidian API → Node.js builtins → local modules
- Use `type` keyword for type-only imports
- Relative paths with `./` prefix

```typescript
import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { spawn, ChildProcess } from "child_process";
import type OpenCodePlugin from "./main";
import { OpenCodeSettings, DEFAULT_SETTINGS } from "./types";
```

**Naming Conventions:**
| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `OpenCodePlugin`, `ProcessManager` |
| Interfaces/Types | PascalCase | `OpenCodeSettings`, `ProcessState` |
| Constants | UPPER_CASE or camelCase | `DEFAULT_SETTINGS`, `OPENCODE_VIEW_TYPE` |
| Variables/functions | camelCase | `getVaultPath`, `startServer` |
| Private members | camelCase (no prefix) | `private processManager` |
| Files | PascalCase for classes | `ProcessManager.ts`, `OpenCodeView.ts` |

**TypeScript Patterns:**

- `strictNullChecks` enabled - always handle null/undefined
- Union types for state: `"stopped" | "starting" | "running" | "error"`
- `async/await` over raw Promises
- Explicit return types on public methods

### Architecture Patterns

**Project Structure:**

```
src/
├── main.ts           # Plugin entry, extends Plugin
├── types.ts          # Types and constants
├── OpenCodeView.ts   # Sidebar view (ItemView) with iframe
├── ProcessManager.ts # Server process lifecycle
├── SettingsTab.ts    # Settings UI (PluginSettingTab)
└── icons.ts          # Custom icon registration
```

**Obsidian Patterns:**

- Extend `Plugin` with `onload()`/`onunload()` lifecycle
- Extend `ItemView` for views: `getViewType()`, `onOpen()`, `onClose()`
- Extend `PluginSettingTab` for settings: `display()`
- DOM helpers: `createEl()`, `createDiv()`, `setIcon()`
- Register in `onload()`, clean up in `onunload()`

**State Management:**

- Callback-based subscriptions for state changes
- Centralized state in manager classes (ProcessManager)
- Immediate notification on state change via callbacks

**Error Handling:**

- try/catch for async operations
- `console.error()` for debugging
- `new Notice()` for user-facing errors
- Boolean returns for success/failure
- Silent catch for non-critical ops (health checks)

### Testing Strategy

Not currently configured. If adding tests:

- Use Vitest for test runner
- Place tests in `src/__tests__/` or `*.test.ts` files
- Add ESLint with `@typescript-eslint/parser` for linting

### Git Workflow

Standard feature branch workflow. Commit messages should be concise and describe the change.

## Domain Context

**OpenCode Server:**

- OpenCode is an AI assistant CLI that can run as a web server
- The plugin spawns `opencode serve` with port/hostname/CORS flags
- Server health is checked via `/global/health` endpoint
- Project directory is encoded as base64 in the URL path

**Obsidian Integration:**

- View is registered with `OPENCODE_VIEW_TYPE` constant
- Opens in right sidebar by default
- Supports lazy start (starts server when view opens)
- Auto-start option available in settings

**Process States:**

- `stopped` - Server not running
- `starting` - Server spawn initiated, waiting for health check
- `running` - Server healthy and responding
- `error` - Server failed to start or crashed

## Important Constraints

**Desktop Only:**

- Uses Node.js APIs (`child_process.spawn()`) unavailable on mobile
- File system access via vault adapter requires desktop
- Check for desktop environment before adding mobile-incompatible features

**Build Output:**

- Must produce single `main.js` file (CommonJS format)
- External: `obsidian`, `electron`, CodeMirror modules, Node.js builtins

**TypeScript Config:**

- Target: ES6
- Module: ESNext (bundled to CJS)
- Strict null checks enabled
- No implicit any

## External Dependencies

**Runtime:**

- OpenCode CLI must be installed on user's system (configurable path)
- Default port: 14096, hostname: 127.0.0.1

**Development:**

- `obsidian` - Obsidian API types and runtime
- `@types/node` - Node.js type definitions
- `esbuild` - Build bundler
- `typescript` - Type checking
