# Purpose

Define the automated release management system for the Obsidian plugin, including version bumping, manifest synchronization, and GitHub release automation. This system follows Obsidian plugin best practices and naturally enables BRAT (Beta Reviewers Auto-update Tool) compatibility.

## Requirements

### Requirement: Version bump commands

The system SHALL provide commands to bump patch, minor, and major versions.

#### Scenario: Patch version bump

- **GIVEN** the current version is "0.1.0"
- **WHEN** a developer runs `bun run version:patch`
- **THEN** the package.json version SHALL be updated to "0.1.1"
- **AND** a git commit SHALL be created with message "0.1.1" containing the updated files
- **AND** a git tag "v0.1.1" SHALL be created
- **AND** the commit and tag SHALL be pushed to origin

#### Scenario: Minor version bump

- **GIVEN** the current version is "0.1.5"
- **WHEN** a developer runs `bun run version:minor`
- **THEN** the package.json version SHALL be updated to "0.2.0"
- **AND** a git commit SHALL be created with message "0.2.0" containing the updated files
- **AND** a git tag "v0.2.0" SHALL be created
- **AND** the commit and tag SHALL be pushed to origin

#### Scenario: Major version bump

- **GIVEN** the current version is "0.5.2"
- **WHEN** a developer runs `bun run version:major`
- **THEN** the package.json version SHALL be updated to "1.0.0"
- **AND** a git commit SHALL be created with message "1.0.0" containing the updated files
- **AND** a git tag "v1.0.0" SHALL be created
- **AND** the commit and tag SHALL be pushed to origin

### Requirement: Manifest version synchronization

During any version bump, the `version` field in `manifest.json` SHALL be automatically updated to match the new package.json version.

#### Scenario: Synchronized version bump

- **GIVEN** package.json contains `"version": "0.1.0"`
- **AND** manifest.json contains `"version": "0.1.0"`
- **WHEN** a developer runs `bun run version:minor`
- **THEN** package.json SHALL be updated to `"version": "0.2.0"`
- **AND** manifest.json SHALL be updated to `"version": "0.2.0"`
- **AND** both files SHALL be included in the same git commit

#### Scenario: Manifest structure preservation

- **GIVEN** manifest.json contains fields: id, name, version, minAppVersion, description, author, isDesktopOnly
- **WHEN** the version is updated during version bump
- **THEN** all fields except `version` SHALL remain unchanged
- **AND** the JSON structure and formatting SHALL be preserved

### Requirement: Clean working directory

Version commands SHALL fail if the git working directory is not clean.

#### Scenario: Uncommitted changes prevent version bump

- **GIVEN** there are uncommitted changes in the working directory
- **WHEN** a developer runs any version command
- **THEN** the command SHALL fail with an error message
- **AND** no version bump, commit, or tag SHALL be created

### Requirement: Automated release workflow

When a version tag is pushed, a GitHub Actions workflow SHALL automatically build the plugin and create a GitHub release.

#### Scenario: Tag push triggers workflow

- **WHEN** a developer pushes a tag named `v0.1.0` to the repository
- **THEN** the GitHub Actions release workflow SHALL start execution within 1 minute

#### Scenario: Workflow builds and releases

- **GIVEN** the release workflow executes
- **WHEN** the build succeeds
- **THEN** a GitHub release SHALL be created with name matching the git tag (e.g., "0.1.0" for tag "v0.1.0")
- **AND** the release SHALL be marked as a pre-release
- **AND** the release SHALL include the required assets: `manifest.json`, `main.js`, `styles.css`
- **AND** the released manifest.json SHALL contain the correct version matching the tag

#### Scenario: Build failure prevents release

- **WHEN** the build command fails
- **THEN** the workflow SHALL fail without creating a GitHub release
- **AND** an error notification SHALL be visible in the Actions tab

### Note: BRAT Compatibility

This release management system follows standard Obsidian plugin conventions (semantic versioning, proper manifest.json, version-tagged releases with required assets). As a result, the plugin is naturally compatible with BRAT (Beta Reviewers Auto-update Tool) without requiring any BRAT-specific implementation.
