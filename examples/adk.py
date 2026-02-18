"""Basic Chat feature."""

from __future__ import annotations
from contextlib import asynccontextmanager
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Dict

from fastapi import FastAPI
from linkos import Gateway
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from google.adk.agents import LlmAgent
from google.adk import tools as adk_tools
from google.adk.models.lite_llm import LiteLlm  # For multi-model support
from google.adk.tools import ToolContext
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

GEMINI_MODEL = "gemini-2.0-flash"
OPENAI_MODEL = "openai/gpt-4o"
DEEPSEEK_MODEL = "deepseek/deepseek-chat"
MODEL_CLAUDE_SONNET = "anthropic/claude-3-sonnet-20240229"

NOW = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds")

# Shared LLM instance that we reconfigure dynamically based on llm_config
model = LiteLlm(model=DEEPSEEK_MODEL)


def get_llm(tool_context: ToolContext) -> Dict[str, str]:
    """
    Configure the LLM provider and API key from state.llm_config.

    app/hub injects:
      state["llm_config"] = {
        "llm_provider": "...",
        "llm_api_key": "..."
      }
    """
    llm_config = tool_context.state.get("llm_config")
    print(f"llm_config: {llm_config}")
    if not llm_config:
        return {
            "status": "error",
            "message": "No llm_config in state. Make sure app/hub is injecting it.",
        }

    provider = llm_config.get("llm_provider")
    api_key = llm_config.get("llm_api_key")

    if not provider or not api_key:
        return {
            "status": "error",
            "message": "llm_config missing llm_provider or llm_api_key",
        }

    if provider == "openai":
        os.environ["OPENAI_API_KEY"] = api_key
        model.model = OPENAI_MODEL
    elif provider == "deepseek":
        os.environ["DEEPSEEK_API_KEY"] = api_key
        model.model = DEEPSEEK_MODEL
    elif provider == "anthropic":
        os.environ["ANTHROPIC_API_KEY"] = api_key
        model.model = MODEL_CLAUDE_SONNET
    elif provider == "google":
        os.environ["GOOGLE_API_KEY"] = api_key
        model.model = GEMINI_MODEL
    else:
        return {
            "status": "error",
            "message": f"Unknown llm provider: {provider}",
        }

    return {
        "status": "success",
        "provider": provider,
        "model": model.model,
    }


# Configure logging level
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# Component-specific loggers
logging.getLogger("adk_agent").setLevel(logging.DEBUG)
logging.getLogger("event_translator").setLevel(logging.INFO)
logging.getLogger("session_manager").setLevel(logging.WARNING)
logging.getLogger("endpoint").setLevel(logging.ERROR)

# Create a sample ADK agent (this would be your actual agent)
sample_agent = LlmAgent(
    name="assistant",
    model=model,
    instruction=f"""
    You are a helpful, casual assistant. 
    Act like a human, not an AI. 
    - Use a conversational, friendly tone.
    - Avoid robotic phrases like "As an AI language model" or "I can help with that".
    - Keep responses concise and direct, like a text message.
    - Use occasional emojis if appropriate, but don't overdo it.
    - If you don't know something, just say so naturally.
    Current date and time is {NOW}.

    Before answering in a new session, you MUST first call the `get_llm` tool
    to configure your underlying LLM using state.llm_config (injected from app/hub).
 """,
    tools=[
        get_llm,
        McpToolset(
            connection_params=StreamableHTTPConnectionParams(
                url="https://mcp.exa.ai/mcp?tools=web_search_exa,deep_search_exa,get_code_context_exa,crawling_exa,company_research_exa,linkedin_search_exa,deep_researcher_start,deep_researcher_check",
            ),
        ),
    ],
)

# Create ADK middleware agent instance
chat_agent = ADKAgent(
    adk_agent=sample_agent,
    app_name="agents",
    user_id="demo_user",
    session_timeout_seconds=3600,
    use_in_memory_services=True,
)

# Start Linkos Gateway controlled by lifespan
# gateway = Gateway()
# gateway.set_agent(chat_agent)

# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     """Manage application lifecycle."""
#     gateway.start()
#     yield
#     await gateway.stop()

# Create FastAPI app
app = FastAPI(title="ADK Middleware Basic Chat")

# Add the ADK endpoint
add_adk_fastapi_endpoint(app, chat_agent, path="/agent")
