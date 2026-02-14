# Linkos

**Multi-platform messaging gateway for AI agents** - Connect your agents to messaging platforms like WhatsApp, Telegram, Discord, and Slack.

## 🚀 Quick Start

### 1. Install with uv

```bash
cd linkos
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -e .
```

### 2. Initialize Configuration

```bash
linkos init
```

This creates `config.toml`. Edit it and add your platform tokens:

```toml
[telegram]
enabled = true
token = "YOUR_BOT_TOKEN"  # Get from @BotFather

[discord]
enabled = true
token = "YOUR_BOT_TOKEN"  # Get from Discord Developer Portal
```

### 3. Run the Gateway

```bash
linkos gateway
```

That's it! The gateway will connect to your platforms via WebSocket and route messages to the AI agent.

## 📦 Architecture

```
Platform (WebSocket) → Client → UnifiedMessage → Router → AI Agent → Response
```

**No webhooks. No public URL needed. Just works.**

## 🔌 Supported Platforms

| Platform | Status | Library |
|----------|--------|---------|
| Telegram | ✅ Ready | python-telegram-bot (long polling) |
| Discord | ✅ Ready | discord.py (WebSocket gateway) |
| Slack | 🚧 Planned | slack-bolt (Socket Mode) |
| WhatsApp | 🚧 Planned | whatsapp-web.js bridge |

## 💡 Features

- **WebSocket-based** - No public IP or webhook URLs required
- **Unified message format** - Platform-agnostic AI agent
- **Session management** - Track conversations across platforms
- **Pluggable AI agents** - Easy to replace mock agent with real AI
- **Modern Python** - Uses `pyproject.toml` and `uv`

## 🛠️ Development

```bash
# Install with dev dependencies
uv pip install -e ".[dev]"

# Run tests
pytest

# Format code
black linkos/
ruff check linkos/
```

## 📝 Usage as Library

```python
from linkos import UnifiedMessage, Platform
from linkos.services import SessionManager, MessageRouter, MockAgent

# Initialize
session_manager = SessionManager()
agent = MockAgent()
router = MessageRouter(session_manager, agent)

# Process a message
message = UnifiedMessage(
    id="msg_1",
    platform=Platform.TELEGRAM,
    user_id="12345",
    session_id="telegram:12345",
    content="Hello!"
)

response = await router.route_message(message)
print(response)
```

## 🤖 Replace Mock Agent

```python
# linkos/services/agent.py
from openai import AsyncOpenAI

class OpenAIAgent:
    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)
    
    async def process_message(self, message, context):
        response = await self.client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": message.content}]
        )
        return response.choices[0].message.content
```

## 📄 License

MIT
