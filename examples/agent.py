"""
A cleaner agent.py consolidating the LangChain/LangGraph agent logic.
"""

import os
import uvicorn
import asyncio
from typing import Any, Dict, Optional, List
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import nest_asyncio

load_dotenv()
nest_asyncio.apply()

from ag_ui_langgraph import add_langgraph_fastapi_endpoint, LangGraphAgent
from copilotkit import CopilotKitMiddleware, LangGraphAGUIAgent
from langchain_mcp_adapters.client import MultiServerMCPClient
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver
from langchain_litellm import ChatLiteLLM

from mcp_utils import make_serializable

# ---------------------------------------------------------------------------
# Library Monkeypatch (Temporary fix for ag-ui-langgraph bug)
# ---------------------------------------------------------------------------
import uuid
import json
from langchain_core.messages import ToolMessage
try:
    from langgraph.prebuilt import Command
except ImportError:
    Command = None
from ag_ui_langgraph.agent import LangGraphAgent, EventType, ToolCallStartEvent, ToolCallArgsEvent, ToolCallEndEvent, ToolCallResultEvent, normalize_tool_content, dump_json_safe

async def _patched_handle_single_event(self, event, state):
    """
    Patched event handler to fix crash when tools return non-object outputs (like raw lists/strings).
    This logic handles ToolCallResultEvent safely by extracting tool_call_id from multiple sources.
    """
    event_type = event.get("event")
    
    # We only care about overriding the OnToolEnd logic
    if event_type == "on_tool_end":
        tool_call_output = event["data"]["output"]

        # Handle Command objects (LangGraph native)
        if Command is not None and isinstance(tool_call_output, Command):
            messages = tool_call_output.update.get('messages', [])
            tool_messages = [m for m in messages if isinstance(m, ToolMessage)]
            for tool_msg in tool_messages:
                yield self._dispatch_event(ToolCallResultEvent(
                    type=EventType.TOOL_CALL_RESULT,
                    tool_call_id=tool_msg.tool_call_id,
                    message_id=str(uuid.uuid4()),
                    content=normalize_tool_content(tool_msg.content),
                    role="tool"
                ))
            return

        # Handle direct ToolMessage output
        if isinstance(tool_call_output, ToolMessage):
            yield self._dispatch_event(ToolCallResultEvent(
                type=EventType.TOOL_CALL_RESULT,
                tool_call_id=tool_call_output.tool_call_id,
                message_id=str(uuid.uuid4()),
                content=normalize_tool_content(tool_call_output.content),
                role="tool"
            ))
            return

        # Handle raw output fallback (The Fix)
        # 1. Start events
        if not self.active_run["has_function_streaming"]:
            input_data = event.get("data", {}).get("input") or {}
            tool_call_id = (
                event.get("metadata", {}).get("langgraph_tool_call_id") or
                input_data.get("id") or
                input_data.get("tool_call_id") or
                event.get("run_id")
            )
            yield self._dispatch_event(ToolCallStartEvent(
                type=EventType.TOOL_CALL_START,
                tool_call_id=tool_call_id,
                tool_call_name=event["data"].get("name", "tool"),
                parent_message_id=tool_call_id,
                raw_event=event
            ))
            yield self._dispatch_event(ToolCallArgsEvent(
                type=EventType.TOOL_CALL_ARGS,
                tool_call_id=tool_call_id,
                delta=dump_json_safe(input_data),
                raw_event=event
            ))
            yield self._dispatch_event(ToolCallEndEvent(
                type=EventType.TOOL_CALL_END,
                tool_call_id=tool_call_id,
                raw_event=event
            ))

        # 2. Result event
        input_data = event.get("data", {}).get("input") or {}
        tool_call_id = (
            event.get("metadata", {}).get("langgraph_tool_call_id") or
            input_data.get("id") or
            input_data.get("tool_call_id") or
            event.get("run_id")
        )
        yield self._dispatch_event(ToolCallResultEvent(
            type=EventType.TOOL_CALL_RESULT,
            tool_call_id=tool_call_id,
            message_id=str(uuid.uuid4()),
            content=normalize_tool_content(tool_call_output),
            role="tool"
        ))
        return

    # Use original handler for all other events
    async def _identity_gen(gen):
        for item in gen:
            yield item
            
    # However, since _handle_single_event is a standard generator, we can just call the original
    # but the original is private so we have to be careful.
    # Actually, it's easier to just call the original implementation for non-tool-end events.
    # But since we've already replaced it, we'd need to save the original.
    
# Save original and apply patch
LangGraphAgent._original_handle_single_event = LangGraphAgent._handle_single_event

def wrapper(self, event, state):
    if event.get("event") == "on_tool_end":
        return _patched_handle_single_event(self, event, state)
    return self._original_handle_single_event(event, state)

LangGraphAgent._handle_single_event = wrapper

# Configuration & Prompt
# ---------------------------------------------------------------------------

NOW = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds")

SYSTEM_PROMPT = f"""
You are acting as a real human in messaging apps like WhatsApp and Telegram,
not as an AI assistant.

Current date and time is {NOW}.

STYLE:
- Write like a normal person texting in a chat.
- Be concise, direct, and friendly.
- Use simple language; skip long formal paragraphs unless truly needed.
- Do NOT say things like "As an AI", "as a language model", or mention models,
  prompts, or system instructions.

MENTION HANDLING:
- Messages may include @handles (e.g. @example_user) to address specific people.
- When a message clearly addresses the user you represent via an @handle,
  answer in the first person ("I", "me", "my") as if you ARE that user.
- When replying on their behalf, keep answers plausible for a real person:
  - You can reference reasonable preferences or context from the chat history.
  - If you genuinely don't know something, say that in a natural way.

GENERAL:
- Prefer helpful, pragmatic answers over theoretical explanations.
- When using external tools (search, research, etc.), keep the final answer
  clean and human-sounding; don't expose internal tool details.
"""

# MCP Servers Config
MCP_SERVERS = {
    "exa": {
        "transport": "http",
        "url": "https://mcp.exa.ai/mcp?tools=web_search_exa,deep_search_exa,"
               "get_code_context_exa,crawling_exa,company_research_exa,"
               "linkedin_search_exa,deep_researcher_start,deep_researcher_check",
    },
    "context7": {
        "transport": "http",
        "url": "https://mcp.context7.com/mcp",
    },
    "deepwiki": {
        "transport": "http",
        "url": "https://mcp.deepwiki.com/mcp",
    },
}

# ---------------------------------------------------------------------------
# MCP Tools Helper
# ---------------------------------------------------------------------------

async def get_mcp_tools() -> List[Any]:
    try:
        client = MultiServerMCPClient(MCP_SERVERS)
        raw_tools = await client.get_tools()
        # Wrap tools to make them serializable for MemorySaver
        return make_serializable(raw_tools, MCP_SERVERS)
    except Exception as e:
        print(f"⚠️ Warning: Failed to fetch MCP tools: {e}")
        return []

# ---------------------------------------------------------------------------
# FastAPI setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Linkos LangGraph Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fetch MCP tools for agent configuration
def load_tools():
    try:
        # nest_asyncio allows asyncio.run() even if a loop is already running
        return asyncio.run(get_mcp_tools())
    except Exception as e:
        print(f"⚠️ Error loading tools: {e}")
        return []

_mcp_tools = load_tools()

# Create the agent logic
agent_graph = create_deep_agent(
    model=ChatLiteLLM(model="gpt-4o"),
    tools=_mcp_tools,
    middleware=[CopilotKitMiddleware()], 
    system_prompt=SYSTEM_PROMPT,
    checkpointer=MemorySaver()
)

add_langgraph_fastapi_endpoint(
    app=app,
    agent=LangGraphAgent(
        name="sample_agent",
        description="An example agent to use as a starting point for your own agent.",
        graph=agent_graph,
    ),
    path="/agent",
)
