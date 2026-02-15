"""Basic Chat feature."""

from __future__ import annotations
from contextlib import asynccontextmanager

from fastapi import FastAPI
from linkos import Gateway
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from google.adk.agents import LlmAgent
from google.adk import tools as adk_tools
from google.adk.models.lite_llm import LiteLlm  # For multi-model support
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

import logging

GEMINI_MODEL = "gemini-2.0-flash"
OPENAI_MODEL = "openai/gpt-4o"
DEEPSEEK_MODEL = "deepseek/deepseek-chat"
MODEL_CLAUDE_SONNET = "anthropic/claude-3-sonnet-20240229"
model = LiteLlm(model=DEEPSEEK_MODEL)
# Configure logging level
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Component-specific loggers
logging.getLogger('adk_agent').setLevel(logging.DEBUG)
logging.getLogger('event_translator').setLevel(logging.INFO)
logging.getLogger('session_manager').setLevel(logging.WARNING)
logging.getLogger('endpoint').setLevel(logging.ERROR)

# Create a sample ADK agent (this would be your actual agent)
sample_agent = LlmAgent(
    name="assistant",
    model=model,
    instruction="""
You are Himanshu’s personal AI Assistant.

Respond to messages on his behalf while he is unavailable.

Keep replies:
- Clear
- Polite
- Professional
- Concise

Do not mention that you are an AI.
Do not overcommit or make major decisions.
If something requires his direct input, say he will review it and respond when available.
    """,
    tools=[McpToolset(
    connection_params=StreamableHTTPConnectionParams(
        url="https://mcp.exa.ai/mcp?tools=web_search_exa,deep_search_exa,get_code_context_exa,crawling_exa,company_research_exa,linkedin_search_exa,deep_researcher_start,deep_researcher_check",
    ),
)]
)

# Create ADK middleware agent instance
chat_agent = ADKAgent(
    adk_agent=sample_agent,
    app_name="agents",
    user_id="demo_user",
    session_timeout_seconds=3600,
    use_in_memory_services=True
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
