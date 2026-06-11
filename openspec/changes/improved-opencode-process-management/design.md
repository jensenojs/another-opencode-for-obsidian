## Context

### Current Implementation

The plugin uses a simple `opencodePath: string` setting that defaults to "opencode". The `ServerManager` spawns this directly with default arguments:

```typescript
this.process = this.processImpl.start(
  this.settings.opencodePath,
  ["serve", "--port", this.settings.port.toString(), ...],
  options
);
```

Platform-specific process implementations (`PosixProcess`, `WindowsProcess`) handle spawning and verification. The `verifyCommand` method checks if the executable exists.

### New Requirements

1. One-time autodetect for new users (empty path on first run)
2. Support custom shell commands with full user control
3. Maintain backward compatibility with existing path-based configuration

## Goals / Non-Goals

**Goals:**

- Provide zero-configuration setup for new users via autodetect
- Enable power users to use custom commands with full flexibility
- Maintain backward compatibility for existing users
- Clear UI distinction between path mode and custom command mode
- Platform-aware executable detection (PATH + common locations)

**Non-Goals:**

- Complex command builder UI (simple text input for custom commands)
- Automatic installation of opencode
- Validation of custom commands before execution

## Decisions

### 1. Settings Schema Extension

**Decision:** Extend existing settings rather than replace.

**Rationale:**

- Maintains backward compatibility - existing configs continue working
- Simple migration - just add new fields with sensible defaults
- Minimal code changes to existing path-based logic

**Alternatives considered:**

- Replace with structured command object - rejected due to breaking change
- Separate settings sections - rejected as overkill for this feature

**Implementation:**

```typescript
interface OpenCodeSettings {
  // ... existing fields ...
  opencodePath: string; // Still used as primary path
  customCommand: string; // New: shell command
  useCustomCommand: boolean; // New: toggle mode
}
```

### 2. Autodetect Trigger Strategy

**Decision:** Autodetect runs on every plugin startup when path is empty.

**Rationale:**

- Reminds user to configure or disable the plugin if opencode is missing
- Simpler implementation - no state tracking needed
- If user installs opencode later, it will be detected automatically

**Alternatives considered:**

- Run once and remember with flag - rejected as hides the problem
- Run only manually - rejected as adds friction for new users
- Explicit "first setup" wizard - rejected as overkill

**Implementation:**

```typescript
// In main.ts onload()
if (!this.settings.opencodePath && !this.settings.useCustomCommand) {
  await this.attemptAutodetect();
}
```

### 3. Custom Command Spawning Strategy

**Decision:** Use `shell: true` for custom commands, user controls ALL arguments.

**Rationale:**

- Maximum flexibility - env vars, pipes, complex invocations all work
- Simple mental model - "what you type is what runs"
- No ambiguity about argument concatenation

**Alternatives considered:**

- Parse and split custom command - rejected as fragile
- Merge plugin args with custom args - rejected as confusing
- Separate args array - rejected as limiting

**Implementation:**

```typescript
// Path mode
this.process = spawn(opencodePath, ["serve", "--port", port, ...], options);

// Custom mode
this.process = spawn(customCommand, [], { ...options, shell: true });
```

### 4. Executable Detection Order

**Decision:** Check PATH first, then platform-specific common locations.

**Rationale:**

- Respects user's environment setup
- Common locations cover most package manager installs (homebrew, cargo, npm -g, etc.)

**Search algorithm:**

1. If configured path is absolute and exists, return it directly
2. Extract basename from configured path (e.g., "opencode" from "/path/to/opencode" or just "opencode")
3. Search platform-specific locations for that basename:
   - **Linux:** `~/.local/bin/`, `~/.opencode/bin/`, `~/.bun/bin/`, `~/.npm-global/bin/`, `~/.nvm/versions/node/*/bin/`, `/usr/local/bin/`, `/usr/bin/`
   - **macOS:** `~/.local/bin/`, `/opt/homebrew/bin/`, `/usr/local/bin/`
   - **Windows:** `%LOCALAPPDATA%\opencode\bin\`, `%USERPROFILE%\.bun\bin\`, `%USERPROFILE%\.local\bin\`
4. If found, return full path; if not found, return configured path as fallback

**nvm wildcard handling:** For `~/.nvm/versions/node/*/bin/`, expand the wildcard to find actual Node version directories.

### 5. UI Layout

**Decision:** Toggle switch to select mode, conditional display of relevant input.

**Rationale:**

- Clear mental model - one or the other, not both
- Reduces visual clutter
- Toggle state directly maps to `useCustomCommand` boolean

**Layout:**

```
Command Mode:
[  Use custom command  ●─────○  ]

[Path Mode - shown when toggle off]
OpenCode path: [____________] [Autodetect]

[Custom Mode - shown when toggle on]
Custom command:
[______________________________]
(Full shell command with all arguments)
```

## Risks / Trade-offs

**[Risk]** Custom command mode is powerful but dangerous - users can break their setup.
→ **Mitigation:** This is intentional flexibility. Users opting into "custom command" are advanced users. No validation performed - natural failure on spawn.

**[Risk]** Autodetect could find wrong executable (different binary with same name).
→ **Mitigation:** Low probability - "opencode" is unique. Could add version check in future if needed.

**[Risk]** Users may not understand difference between path and custom command modes.
→ **Mitigation:** Clear UI labels and descriptions. Path mode is default, custom mode opt-in.

**[Risk]** Toast notification on every startup might be annoying if user intentionally leaves path empty.
→ **Mitigation:** User can switch to custom command mode (even with empty command) to suppress autodetect, or configure a path.

## Migration Plan

1. **No breaking changes** - existing configs with `opencodePath` set continue working
2. **New fields** default to empty/false
3. **Autodetect** triggers on every startup when path is empty and custom command mode is disabled
4. **Settings UI** adapts to existing data - if `opencodePath` is set, starts in path mode

## Open Questions

None - design is complete based on user requirements.
