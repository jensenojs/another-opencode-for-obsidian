# Change: Add Default View Location Setting

## Why

Users may prefer to have the OpenCode panel open in the main editor area instead of the sidebar, depending on their workflow and screen size. Currently, the view always opens in the right sidebar with no option to change this behavior.

## What Changes

- Add a new `defaultViewLocation` setting with options: `"sidebar"` or `"main"`
- Update view activation logic to respect this setting when opening the panel
- Sidebar opens in the right leaf (current behavior)
- Main opens in a new tab in the main editor area

## Impact

- Affected specs: `001-mvp-opencode-embed` (Settings Configuration, Sidebar View Registration, Ribbon Icon)
- Affected code: `src/types.ts`, `src/main.ts`, `src/SettingsTab.ts`
