## 1. Settings Schema Updates

- [x] 1.1 Add `customCommand` field to `OpenCodeSettings` interface in `src/types.ts`
- [x] 1.2 Add `useCustomCommand` boolean field to `OpenCodeSettings` interface
- [x] 1.3 Update `DEFAULT_SETTINGS` with new fields (empty string and false)

## 2. Executable Resolver Module

- [x] 2.1 Create `src/server/ExecutableResolver.ts` with cross-platform detection logic
- [x] 2.2 Implement `resolveFromPath()` to check PATH for 'opencode' executable
- [x] 2.3 Implement `resolve()` method with proper precedence:
  - Check if configured path is absolute and exists → return it
  - Extract basename from configured path (handle both "opencode" and "/path/to/opencode")
- [x] 2.4 Implement platform-specific directory search:
  - Linux: ~/.local/bin/, ~/.opencode/bin/, ~/.bun/bin/, ~/.npm-global/bin/, ~/.nvm/versions/node/\*/bin/, /usr/local/bin/, /usr/bin/
  - macOS: ~/.local/bin/, /opt/homebrew/bin/, /usr/local/bin/
  - Windows: %LOCALAPPDATA%\opencode\bin\, %USERPROFILE%\.bun\bin\, %USERPROFILE%\.local\bin\
- [x] 2.5 Implement nvm wildcard expansion for ~/.nvm/versions/node/\*/bin/
- [x] 2.6 Ensure fallback: return configured path if search fails

## 3. ServerManager Updates

- [x] 3.1 Modify `ServerManager.start()` to check `useCustomCommand` setting
- [x] 3.2 Implement path mode spawning (direct spawn with default args)
- [x] 3.3 Implement custom command mode spawning (shell: true, no args appended)
- [x] 3.4 Ensure working directory is set correctly for both modes
- [x] 3.5 Add support for verifying path mode executable with `opencode --version`

## 4. Main Plugin Integration

- [x] 4.1 Add autodetect logic in `main.ts` `onload()` method
- [x] 4.2 Implement autodetect trigger: when `opencodePath` is empty and `useCustomCommand` is false
- [x] 4.3 On successful autodetect: save path to settings, show success Notice
- [x] 4.4 On failed autodetect: show error Notice "Could not find opencode. Please check Settings"
- [x] 4.5 Import and use `ExecutableResolver` from main plugin

## 5. Settings UI Updates

- [x] 5.1 Add toggle switch "Use custom command" in `SettingsTab.ts`
- [x] 5.2 Conditionally show path input field when toggle is off
- [x] 5.3 Conditionally show custom command textarea when toggle is on
- [x] 5.4 Add "Autodetect" button next to path input
- [x] 5.5 Implement autodetect button click handler that:
  - Calls `ExecutableResolver.resolve()`
  - Updates path input if found
  - Shows success/error Notice
- [x] 5.6 Add descriptive text explaining custom command mode behavior
- [x] 5.7 Ensure settings are saved when toggling between modes

## 6. Testing & Validation

- [x] 6.1 Test autodetect finds opencode in PATH
- [x] 6.2 Test autodetect finds opencode in platform-specific location
- [x] 6.3 Test autodetect shows error when not found
- [x] 6.4 Test path mode spawns correctly with default args
- [x] 6.5 Test custom command mode spawns via shell without extra args
- [x] 6.6 Test custom command with environment variables works
- [x] 6.7 Verify backward compatibility: existing opencodePath values still work
- [x] 6.8 Test manual autodetect button in Settings
- [x] 6.9 Test toggle saves and restores correctly

## 7. Error Message Improvements

- [x] 7.1 Enhance verifyCommand in PosixProcess.ts with detailed error messages
  - Distinguish between "not found" and "not executable"
  - Provide chmod instructions for permission errors
  - Include actionable guidance ("Check Settings → OpenCode path, or click 'Autodetect'")
- [x] 7.2 Enhance verifyCommand in WindowsProcess.ts with detailed error messages
- [x] 7.3 Display error details in Settings UI below "Status: Error" badge
- [x] 7.4 Show toast notification with error message when activation fails from main UI
- [x] 7.5 Add CSS styling for error message display in settings

## 8. Documentation

- [x] 8.1 Update README.md with new settings options
- [x] 8.2 Document autodetect behavior and common installation locations
- [x] 8.3 Add examples of custom command usage
