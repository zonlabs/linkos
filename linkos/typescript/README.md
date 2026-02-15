# LinkOS TypeScript SDK

TypeScript implementation of LinkOS.

## Architecture

```mermaid
graph LR
    A[Telegram Bot<br/>(Telegraf)] --> B[Linkos Hub<br/>@link-os/core]
    B --> C[AG-UI Agent<br/>@ag-ui/client]
```
## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run Hub in development mode
pnpm --filter @link-os/hub dev
```

## Packages

- **@link-os/core** - Core gateway and routing logic
- **@link-os/whatsapp** - WhatsApp platform client
- **@link-os/telegram** - Telegram platform client
- **@link-os/types** - Shared TypeScript types


## Configuration

```env
# .env
TELEGRAM_TOKEN=your_bot_token
AGENT_URL=http://localhost:8001/agent
PORT=8081
```

## Development

```bash
# Run tests
pnpm test

# Clean build artifacts
pnpm clean

# Run all packages in dev mode
pnpm dev
```
