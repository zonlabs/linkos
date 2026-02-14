# Linkos

**Multi-platform messaging gateway for AI agents.** 

Connect agents to Telegram and Discord with zero-boilerplate. No webhooks or public URLs required.

## 🚀 Quick Start

### 1. Install
```bash
uv pip install -e .
```

### 2. Configure Platforms
Linkos uses environment variables for zero-config startup.
```bash
export TELEGRAM_TOKEN="your_token"
export DISCORD_TOKEN="your_token"
```

### 3. Usage
Add one line to your existing agent script. Linkos detects the environment (FastAPI or standalone) and runs in the background.

```python
from linkos import Gateway
from my_agent import my_ai_agent

# Magic Mode: starts clients and history management automatically
Gateway(agent=my_ai_agent)
```

## 📦 Core Architecture

- **Magic Gateway**: Auto-detects running event loops (FastAPI/Uvicorn) or starts a background thread.
- **AG-UI Bridge**: Standardized interface for `LangGraph`, `ADK`, and custom agents via the `run()` or `process_message()` methods.
- **Smart History**: Persists full message context to keep multi-turn agents in sync.

## 🔌 Supported Platforms

| Platform | Library |
|----------|---------|
| **Telegram** | `python-telegram-bot` (long polling) |
| **Discord** | `discord.py` (WebSocket) |
| **Slack** | Coming Soon |

## 🤖 Agent Interfaces

Linkos supports three ways to talk to your agent:
1. **AG-UI Protocol**: `agent.run(input)` (Streaming events)
2. **Simple Class**: `agent.process_message(message, context)`
3. **Callable**: `async def my_agent(text: str) -> str`

## 📄 License
MIT
