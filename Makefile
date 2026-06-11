VAULT ?= /Users/oujinsai/obsidian
OPENCODE ?= /Users/oujinsai/Projects/ai-cli/opencode

.PHONY: build test lint format format-check check install status logs doctor bridge theme reload

build:
	bun run build

test:
	bun test

lint:
	bun run lint

format:
	bun run format

format-check:
	bun run format:check

check:
	bun run check

install:
	bun run harness install --vault $(VAULT)

status:
	bun run harness status --vault $(VAULT)

logs:
	bun run harness logs --vault $(VAULT)

doctor:
	bun run harness doctor --vault $(VAULT) --opencode $(OPENCODE)

bridge:
	bun run harness bridge --opencode $(OPENCODE)

theme:
	bun run harness theme --vault $(VAULT)

reload:
	obsidian plugin:reload id=opencode-obsidian
