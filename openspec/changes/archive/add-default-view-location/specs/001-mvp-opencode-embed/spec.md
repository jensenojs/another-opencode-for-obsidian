## MODIFIED Requirements

### Requirement: Settings Configuration

The plugin SHALL provide configurable settings for server port, hostname, executable path, project directory, auto-start behavior, and default view location.

#### Scenario: Settings persistence

- **WHEN** the user modifies settings
- **THEN** changes are persisted to plugin data
- **AND** the process manager is updated with new settings

#### Scenario: Default view location options

- **WHEN** the user configures default view location
- **THEN** the options available are "sidebar" and "main"
- **AND** the default value is "sidebar"

### Requirement: Sidebar View Registration

The plugin SHALL register an ItemView that displays in either the Obsidian sidebar or main editor area based on user settings.

#### Scenario: View activation in sidebar

- **WHEN** the user clicks the ribbon icon or runs the toggle command
- **AND** the default view location is set to "sidebar"
- **THEN** the OpenCode view opens in the right sidebar
- **AND** if the view already exists, it is revealed

#### Scenario: View activation in main area

- **WHEN** the user clicks the ribbon icon or runs the toggle command
- **AND** the default view location is set to "main"
- **THEN** the OpenCode view opens as a new tab in the main editor area
- **AND** if the view already exists in any location, it is revealed

### Requirement: Ribbon Icon

The plugin SHALL add a ribbon icon that activates the OpenCode view in the configured default location.

#### Scenario: Ribbon icon click

- **WHEN** the user clicks the OpenCode ribbon icon
- **THEN** the OpenCode view is activated in the location specified by the default view location setting
