# Linkos Examples

This directory contains examples demonstrating zero-boilerplate integration of Linkos with different agent frameworks.

## Examples

### 1. LangGraph Agent (`main.py`)
Demonstrates integration with a LangGraph agent. Linkos automatically detects the FastAPI event loop and runs in the background.

### 2. ADK Agent (`adk.py`)
Demonstrates integration with a Google ADK agent. 

## Usage

### 1. Configure Environment
Set your platform tokens as environment variables:

```bash
export TELEGRAM_TOKEN="your_token"
export DISCORD_TOKEN="your_token"
```

### 2. Install Dependencies
It's recommended to use `uv` for easy dependency management:

```bash
# From the root directory
uv pip install -e .
uv pip install -r examples/pyproject.toml
```

### 3. Run
Launch any example using `uvicorn`:

```bash
# LangGraph Example
uv run uvicorn main:app --port 8000

# ADK Example
uv run uvicorn adk:app --port 8000
```

## 💡 How it works
Both examples use the "Magic Gateway" pattern:
```python
# Just one line after your app/agent setup
Gateway(agent=your_agent)
```
Linkos will automatically start the Telegram/Discord clients and begin routing messages to your agent using the **AG-UI Protocol**.
