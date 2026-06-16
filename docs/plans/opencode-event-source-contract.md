# OpenCode event source contract

## Background

This plugin should not infer OpenCode runtime state from the embedded Web UI. The
Web UI can show its own question and permission dialogs. The Obsidian plugin only
needs OpenCode events when those events add Obsidian-native evidence or
diagnostics.

The concrete question for this task is narrow: identify the stable upstream
event source and decide where it belongs in this plugin. This document does not
implement an event bridge.

## Problem Existence

The problem is real because future plugin features need to know whether OpenCode
has a stable event contract before they add code:

- session state can drive diagnostics and restored context checks;
- permission and question events can explain why a session is waiting, but the
  Web UI already owns the interactive popup;
- TUI events may matter for coexistence with terminal workflows;
- Graph and context features need current session identity without reparsing
  iframe URLs.

The problem should disappear if upstream has no stable event surface. In that
case the plugin should record `unsupported` and avoid inventing a private
protocol. Current upstream does have an event surface.

## Inventory

Local upstream checkout:

- `/Users/oujinsai/Projects/ai-cli/opencode`
- branch: `dev`
- HEAD during this inventory: `5d0f86606a`

Upstream contract files inspected:

- `/Users/oujinsai/Projects/ai-cli/opencode/packages/sdk/openapi.json`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/opencode/src/server/routes/instance/httpapi/groups/event.ts`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/opencode/src/server/routes/instance/httpapi/api.ts`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/opencode/src/event-v2-bridge.ts`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/plugin/src/index.ts`

Upstream tests inspected:

- `/Users/oujinsai/Projects/ai-cli/opencode/packages/opencode/test/server/httpapi-event.test.ts`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/opencode/test/server/httpapi-v2-location.test.ts`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/opencode/test/server/httpapi-sdk.test.ts`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/opencode/test/server/httpapi-exercise/index.ts`

Migration evidence from upstream commit log:

- `25edeaf473 fix(sdk): preserve generated event contracts`
- `53849bd866 fix(sync): publish events on injected project bus`
- `cb35493242 fix(bus): acquire PubSub subscription eagerly to close /event race`
- `9b815bcbd2 feat(core): add location-based permission service (#30287)`
- `f4851e3bd9 fix(tui): route question responses by session directory (#30578)`
- `3cf1cef7fe fix(tui): route permission replies to session directory (#30851)`
- `76ecf2e58c refactor(core): make v2 session inputs event sourced (#30785)`
- `47a45601fd refactor(tui): replace v2 sync with data context (#31826)`
- `8bf0675997 feat(server): add v2 session API endpoints (#31822)`
- `87c33b3d85 fix(plugin): reuse active server for client requests`

Local plugin files inspected:

- `src/client/OpenCodeClient.ts`
- `src/proxy/OpenCodeWebUiProxy.ts`
- `src/proxy/ProxyInjection.ts`
- `src/bridge/OpenCodeBridge.ts`
- `src/bridge/BridgeProtocol.ts`
- `src/context/ContextSessionResolver.ts`
- `docs/plans/tui-plugin-coexistence.md`
- `docs/plans/context-control-surface.md`
- `scripts/harness/bridgeReport.ts`

## Upstream Event Surfaces

OpenCode currently exposes two event streams.

### Legacy Instance Event Stream

`GET /event`

OpenAPI operation:

- `operationId: "event.subscribe"`
- query: `directory`, `workspace`
- response content type: `text/event-stream`
- documented schema: `#/components/schemas/Event`

The server handler emits:

- initial `server.connected`;
- later events as `{ id, type, properties }`;
- `server.heartbeat`;
- `server.instance.disposed` before stream termination.

The handler filters by instance directory and workspace. Upstream tests confirm
that the stream stays open and receives `session.created` after creating a
session.

### V2 Location Event Stream

`GET /api/event`

OpenAPI operation:

- `operationId: "v2.event.subscribe"`
- query: deep object `location[directory]`, `location[workspace]`;
- response content type: `text/event-stream`;
- description: "Subscribe to native event payloads for a location."

Upstream tests confirm that `/api/event` emits native EventV2 payloads with
resolved location data. A `session.created` event includes the location directory
and project directory.

This is the better long-lived source for this plugin. The OpenCode dev branch is
actively moving session, permission, question, and TUI behavior toward v2
location semantics. The commit log shows recent fixes specifically routing
permission and question replies by session directory and handling events across
workspaces.

## Decision

The selected source for future Obsidian-side OpenCode events is:

```text
GET /api/event
operationId: v2.event.subscribe
content-type: text/event-stream
location query: location[directory], location[workspace]
wire payload: native EventV2 payloads with location
```

`GET /event` remains useful as a legacy compatibility signal and as evidence
that the event stream is stable. New plugin code should prefer `/api/event`
because it carries resolved location information and matches the current v2
migration direction.

The plugin should not use OpenCode plugin hooks as its primary event source.
The hook interface has an `event` hook, but hooks run inside OpenCode server
plugins. This Obsidian plugin already talks to an OpenCode server over HTTP. A
server-side OpenCode plugin would add another deployment unit and another
configuration surface.

## Bridge / Proxy Boundary

The product-level bridge is broader than iframe traffic. This plugin bridges
Obsidian and OpenCode through several contract-backed surfaces:

- OpenCode HTTP APIs and SSE events;
- the embedded OpenCode Web UI transport;
- Obsidian workspace, vault, MetadataCache, and editor APIs;
- the plugin's local iframe `postMessage` protocol.

Those surfaces should stay based on the two upstream gold standards: OpenCode's
OpenAPI/source contracts and Obsidian's documented API/runtime facts. The broad
bridge can later support OpenCode events flowing into Obsidian, or Obsidian
context changes flowing into OpenCode. That does not make every bridge concern a
responsibility of the same class.

The broad bridge module is `src/bridge/OpenCodeBridge.ts`. It is the plugin-side
entry point for OpenCode contracts that Obsidian consumes. The first implemented
contract is the read-only event stream. Future Obsidian-to-OpenCode bridge
features can be added there when they have a stable upstream contract.

The concrete `src/proxy/OpenCodeWebUiProxy.ts` class remains the owner for Web UI
transport:

- forward browser requests from the iframe to OpenCode;
- strip CSP from HTML responses so local bridge/theme scripts can run;
- inject the local bridge script and Obsidian appearance styles;
- forward websocket upgrades.

`OpenCodeWebUiProxy.ts` should not own OpenCode event semantics. It can pass SSE
bytes through when the Web UI asks for them, but plugin runtime state should not
be recovered from proxied browser traffic.

Reasons:

- `OpenCodeWebUiProxy.ts` sees iframe traffic, not the plugin's chosen session
  contract;
- the Web UI may subscribe to routes for its own state shape;
- adding event parsing to `OpenCodeWebUiProxy.ts` would mix HTTP transport, HTML
  mutation, and application state;
- the plugin already has a Node-side `OpenCodeClient` path that bypasses CORS and
  can use the OpenAPI contract directly.

## BridgeProtocol Boundary

`src/bridge/BridgeProtocol.ts` remains a local iframe protocol. It should not be
extended with OpenCode event names.

Current bridge messages are local plugin messages:

- `proxy:loaded`;
- `view:toggle`;
- `vault-file:open`;
- `theme:diagnostics`;
- `theme:update`.

OpenCode event types such as `session.created`, `permission.v2.asked`,
`question.v2.asked`, or `tui.session.select` belong to the upstream OpenCode
contract. If the plugin consumes them later, it should parse them in a dedicated
Node-side event source and publish a small local state snapshot to Obsidian UI
components. The iframe bridge should only carry iframe-local facts.

## Session Binding

The Obsidian plugin must bind events through two facts:

- OpenCode location: `settings.projectDirectory`, and later workspace id if the
  plugin supports explicit workspace routing;
- current session id: `CurrentContextSession`.

`CurrentContextSession` remains the only current-session resolver. Event code
must not parse iframe URLs in strategy layers.

The event stream itself can contain events for multiple sessions inside the same
location. The consumer should filter session-owned events by
`properties.sessionID` or `data.sessionID`, depending on the upstream payload
shape of the selected route.

## First Consumer Scope

First-stage consumption should be read-only and diagnostic.

Allowed first-stage state:

- connected;
- disconnected;
- failed;
- unsupported;
- last event type;
- last event time;
- last session-owned event for the current session;
- whether the current session appears idle, busy, errored, or waiting when the
  upstream event says so.

Permission and question events may be recorded as facts, but the status bar
should not copy the Web UI's interactive dialogs. The Web UI already owns those
dialogs. Obsidian-native UI should only surface them later if it adds a clear
workflow the Web UI does not cover.

TUI events should not be implemented in this task. TUI coexistence remains a
separate product path. If later implemented, it should still consume the same
event source contract.

## Follow-up Shape

The first read-only implementation has two pieces:

```text
src/bridge/OpenCodeBridge.ts
src/client/OpenCodeEventSource.ts
```

Responsibilities:

- `OpenCodeBridge` owns lifecycle and exposes one plugin-side bridge entry point;
- `OpenCodeEventSource` opens `GET /api/event` from the plugin main process;
- include `location[directory]` from settings;
- parse SSE frames;
- keep a bounded diagnostics snapshot;
- filter current-session facts through `CurrentContextSession`;
- expose read-only state to diagnostics and future UI.

It should not:

- alter `OpenCodeWebUiProxy.ts`;
- add OpenCode event names to `BridgeProtocol`;
- read iframe DOM;
- duplicate Web UI permission/question dialogs;
- send replies to permission or question requests.

`OpenCodeClient` may host low-level HTTP/SSE helpers if that keeps connection
setup and request headers in one place. The event state machine should remain
separate from context write APIs.

## Harness Expectations

`bun run dev:bridge` already resolves OpenCode local gold standards:

- OpenAPI from `/Users/oujinsai/Projects/ai-cli/opencode/packages/sdk/openapi.json`;
- plugin hook types from `/Users/oujinsai/Projects/ai-cli/opencode/packages/plugin/src/index.ts`;
- local bridge messages from `src/bridge/BridgeProtocol.ts`.

Future event implementation should extend the harness to assert:

- `/api/event` exists with `operationId: "v2.event.subscribe"`;
- response content type includes `text/event-stream`;
- the OpenAPI has event schemas for session, permission, question, and TUI
  events, or explicitly reports which group is absent;
- local code does not add upstream OpenCode event names to `BridgeProtocol`.

Do not maintain a handwritten list of all OpenCode event types in this plugin.
Use the local OpenAPI as the gold standard.

## Risks

The largest risk is upstream migration churn. The OpenCode dev branch is still
actively changing v2 session, sync, location, permission, and question surfaces.
That argues for consuming the OpenAPI route and keeping the first plugin
consumer diagnostic-only.

The second risk is UI duplication. Permission and question are already handled
by OpenCode Web UI. The plugin should not add a second interactive surface until
there is an Obsidian-specific workflow.

The third risk is boundary drift. Parsing event traffic in
`OpenCodeWebUiProxy.ts` would make proxy state depend on whatever the iframe
happens to request. The plugin should open its own Node-side event subscription
when it needs state.

## Acceptance

- Event source is selected as `/api/event` / `v2.event.subscribe`.
- `/event` is documented as legacy compatibility, not the preferred new source.
- `OpenCodeBridge.ts` owns the broad Obsidian/OpenCode bridge entry point.
  `OpenCodeWebUiProxy.ts` remains Web UI transport and HTML injection only.
- `BridgeProtocol` remains local iframe protocol only.
- First-stage permission/question/tui handling is diagnostic and read-only.
- Future implementation can be written without re-researching the event source.
- `bun run dev:bridge` passes against the local OpenCode dev checkout.

## Reference Links

- OpenCode OpenAPI source:
  <https://github.com/sst/opencode/blob/dev/packages/sdk/openapi.json>
- OpenCode event route group:
  <https://github.com/sst/opencode/blob/dev/packages/opencode/src/server/routes/instance/httpapi/groups/event.ts>
- OpenCode event route handler:
  <https://github.com/sst/opencode/blob/dev/packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts>
- OpenCode HTTP API composition:
  <https://github.com/sst/opencode/blob/dev/packages/opencode/src/server/routes/instance/httpapi/api.ts>
- OpenCode EventV2 bridge:
  <https://github.com/sst/opencode/blob/dev/packages/opencode/src/event-v2-bridge.ts>
- OpenCode plugin hook types:
  <https://github.com/sst/opencode/blob/dev/packages/plugin/src/index.ts>
