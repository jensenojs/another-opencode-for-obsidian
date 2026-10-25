> **Archived 2026-10-25.** 这个 change 在 0.5.x 已实装，但它改造的 `ServerManager` / `ExecutableResolver` / `customCommand` / `useCustomCommand` / `opencodePath` 在 0.6.0 随自起服务整体删除。当前形态见 [docs/plans/v2-attach-spec.md](../../../../../../docs/plans/v2-attach-spec.md)：插件只 attach 外部 opencode service，不 spawn、不解析可执行文件、不支持自定义启动命令。下面保留原文，作为为什么这些机制曾经存在、又为什么被拿掉的记录。

## ADDED Requirements

### Requirement: Custom shell command execution

The system SHALL support executing user-defined shell commands with full control over arguments and environment.

#### Scenario: Execute custom command with shell

- **GIVEN** useCustomCommand setting is true
- **AND** customCommand setting contains a shell command string
- **WHEN** the server is started
- **THEN** the system SHALL spawn the process with shell: true option
- **AND** execute the exact command string as provided by the user

#### Scenario: Custom command with environment variables

- **GIVEN** customCommand is "FOO=bar opencode serve --port 14096"
- **WHEN** the server is started
- **THEN** the system SHALL execute the command with shell: true
- **AND** the environment variable FOO SHALL be set to "bar"

#### Scenario: Custom command with custom arguments

- **GIVEN** customCommand is "opencode serve --port 9999 --verbose"
- **WHEN** the server is started
- **THEN** the system SHALL execute the command with shell: true
- **AND** pass exactly "--port 9999 --verbose" as arguments
- **AND** NOT append any default arguments (port, hostname, etc.)

#### Scenario: Custom command with wrapper script

- **GIVEN** customCommand is "/path/to/my-wrapper.sh"
- **WHEN** the server is started
- **THEN** the system SHALL execute the wrapper script via shell
- **AND** the wrapper script SHALL have full control of opencode invocation

### Requirement: No validation for custom commands

The system SHALL NOT validate custom commands before execution.

#### Scenario: Invalid custom command fails naturally

- **GIVEN** customCommand is "invalid-command-that-does-not-exist"
- **WHEN** the server is started
- **THEN** the system SHALL attempt to execute it
- **AND** let the spawn fail naturally with ENOENT error
- **AND** NOT perform pre-flight validation

### Requirement: User controls all arguments in custom mode

The system SHALL NOT append any default arguments when using custom command mode.

#### Scenario: User provides complete command

- **GIVEN** useCustomCommand is true
- **AND** customCommand is "opencode serve"
- **WHEN** the server is started
- **THEN** the system SHALL execute exactly "opencode serve"
- **AND** NOT append --port, --hostname, or --cors arguments
