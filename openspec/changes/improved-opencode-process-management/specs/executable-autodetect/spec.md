## ADDED Requirements

### Requirement: Cross-platform executable autodetection

The system SHALL provide a mechanism to automatically detect the opencode executable location across macOS, Linux, and Windows platforms.

#### Scenario: Autodetect finds executable in PATH

- **GIVEN** the platform PATH contains an executable named "opencode"
- **WHEN** autodetection is triggered
- **THEN** the system SHALL return the full path to the executable

#### Scenario: Configured absolute path takes precedence

- **GIVEN** opencodePath is set to an absolute path like "/opt/opencode/bin/opencode"
- **AND** the file exists at that location
- **WHEN** autodetection is triggered
- **THEN** the system SHALL return the configured absolute path directly
- **AND** skip searching platform-specific locations

#### Scenario: Autodetect finds executable in platform-specific location

- **GIVEN** opencodePath is set to "opencode" (not an absolute path)
- **OR** the configured absolute path does not exist
- **AND** opencode is installed at a platform-specific common location
  - Linux: ~/.local/bin/opencode, ~/.opencode/bin/opencode, ~/.bun/bin/opencode, ~/.npm-global/bin/opencode, ~/.nvm/versions/node/\*/bin/opencode, /usr/local/bin/opencode, /usr/bin/opencode
  - macOS: ~/.local/bin/opencode, /opt/homebrew/bin/opencode, /usr/local/bin/opencode
  - Windows: %LOCALAPPDATA%\opencode\bin\opencode.exe, %USERPROFILE%\.bun\bin\opencode.exe
- **WHEN** autodetection is triggered
- **THEN** the system SHALL extract the basename from configured path (e.g., "opencode")
- **AND** search platform-specific locations for that basename
- **AND** return the full path if found

#### Scenario: Basename extraction for custom executable names

- **GIVEN** opencodePath is set to "my-custom-opencode"
- **WHEN** autodetection is triggered
- **THEN** the system SHALL search for "my-custom-opencode" in platform-specific locations
- **AND** return the full path if found

#### Scenario: Autodetect fails to find executable - fallback to configured path

- **GIVEN** opencode is not in PATH or any platform-specific location
- **AND** opencodePath is set to "opencode"
- **WHEN** autodetection is triggered
- **THEN** the system SHALL return the configured path "opencode" as fallback
- **AND** display a toast notification to the user: "Could not find opencode. Please check Settings"

### Requirement: Startup autodetection

The system SHALL attempt to autodetect the opencode executable on every plugin startup when the path is not configured.

#### Scenario: Startup autodetect succeeds

- **GIVEN** the plugin loads
- **AND** opencodePath setting is empty
- **WHEN** the plugin initializes
- **THEN** the system SHALL trigger autodetection
- **AND** if found, save the path to opencodePath setting
- **AND** display a success notification: "OpenCode executable found at <path>"

#### Scenario: Startup autodetect fails

- **GIVEN** the plugin loads
- **AND** opencodePath setting is empty
- **WHEN** the plugin initializes
- **THEN** the system SHALL trigger autodetection
- **AND** if not found, display a toast notification: "Could not find opencode. Please check Settings"

### Requirement: Manual autodetect trigger

The system SHALL provide a UI control to manually trigger autodetection at any time.

#### Scenario: User clicks Autodetect button

- **GIVEN** the user is on the Settings page
- **AND** Path mode is selected
- **WHEN** the user clicks the "Autodetect" button
- **THEN** the system SHALL trigger autodetection
- **AND** if found, update the opencodePath field with the detected path
- **AND** display a success notification

#### Scenario: Manual autodetect fails

- **GIVEN** the user clicks the "Autodetect" button
- **WHEN** autodetection fails to find the executable
- **THEN** the system SHALL display a toast notification: "Could not find opencode. Please check your installation."
