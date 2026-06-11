## Why

Currently, the plugin requires users to manually specify an OpenCode path in settings, defaulting to just "opencode" (expecting it in PATH). This creates friction for new users who haven't configured anything yet. We need:

1. **Autodetect on first run** - Seamless setup for new users
2. **Custom command support** - Power users need flexibility for custom flags, env vars, wrapper scripts
3. **Backward compatibility** - Existing `opencodePath` settings must continue working

## What Changes

### New Capabilities

- **Startup autodetect**: On every plugin startup with empty `opencodePath`, automatically search for opencode executable
  - Check PATH first
  - Check platform-specific common locations (homebrew, ~/.local/bin, etc.)
  - Save found path to settings if successful
  - Show toast notification if not found, prompting user to check Settings
- **Manual autodetect button**: "Autodetect" button in Settings to trigger search on demand
- **Custom command mode**: Toggle between "Path" and "Custom command"
  - Path mode: Use `opencodePath` directly, append default args (`--serve --port X`)
  - Custom mode: Full shell command, user controls all arguments
  - Custom mode uses `shell: true` for maximum flexibility

### Settings Schema Changes

```typescript
interface OpenCodeSettings {
  // ... existing fields ...
  opencodePath: string; // Path to executable (or empty)
  customCommand: string; // Full shell command
  useCustomCommand: boolean; // Toggle: false=path, true=custom
}
```

### UI Changes

- Toggle: "Use custom command" (default: off)
- When off: Show path input + "Autodetect" button
- When on: Show custom command textarea

### Validation

- Path mode: Verify with `opencode --version` (existing behavior)
- Custom mode: Trust user, let it fail naturally

## Capabilities

### New Capabilities

- `executable-autodetect`: Cross-platform executable detection on startup when path is empty
- `custom-command-launch`: Shell-based command execution with full user control

### Modified Capabilities

- `process-launch`: Extended to support both direct path execution and shell-based custom commands

## Impact

- **Settings (`src/types.ts`)**: Add new fields to `OpenCodeSettings` interface
- **Settings UI (`src/settings/SettingsTab.ts`)**: Add toggle, autodetect button, conditional inputs
- **Process spawning (`src/server/ServerManager.ts`)**: Route to appropriate spawn method based on mode
- **New module**: `src/server/ExecutableResolver.ts` for cross-platform autodetect logic

## Success Criteria

- [ ] Plugin attempts autodetect on every startup when path is empty
- [ ] If autodetect fails, user sees clear toast notification with action to check Settings
- [ ] Existing `opencodePath` values continue working (backward compatibility)
- [ ] Users can switch to custom command mode for full control
- [ ] Settings UI clearly distinguishes path vs custom command modes
- [ ] Manual "Autodetect" button works in Settings
