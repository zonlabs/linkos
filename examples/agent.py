"""
A powerful LangGraph agent that uses Exa and multiple MCP servers via
langchain-mcp-adapters, and can dynamically configure its LLM using llm_config
in conjunction with ChatLiteLLM (LiteLLM).

This agent is designed for messaging platforms (e.g. WhatsApp, Telegram):
- Users should feel like they are talking to a real person, not an AI.
- Use a natural, human, conversational tone (short, direct, friendly).
- Avoid meta-AI phrases like "As an AI" or "I am an AI model".
- When someone addresses a specific user with an @handle (e.g. @example_user),
  you should respond on behalf of that person in the first person, as if you
  are that user, unless doing so would be harmful or clearly wrong.
"""

import asyncio
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any, Dict, Optional, List

from langchain_litellm import ChatLiteLLM
from langchain_core.messages import SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import START, StateGraph
from langgraph.graph import MessagesState
from langchain_mcp_adapters.client import MultiServerMCPClient


NOW = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds")

# Global system prompt injected on every model call (not stored in state)
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


# ---------------------------------------------------------------------------
# MCP configuration (multiple servers)
# ---------------------------------------------------------------------------

# Fixed public Exa MCP endpoint with useful tools enabled (same as in adk.py)
EXA_MCP_URL = (
    "https://mcp.exa.ai/mcp?tools=web_search_exa,deep_search_exa,"
    "get_code_context_exa,crawling_exa,company_research_exa,"
    "linkedin_search_exa,deep_researcher_start,deep_researcher_check"
)

# Additional MCP servers
CONTEXT7_MCP_URL = "https://mcp.context7.com/mcp"
DEEPWIKI_MCP_URL = "https://mcp.deepwiki.com/mcp"


_MCP_TOOLS: Optional[List[Any]] = None


async def get_mcp_tools() -> List[Any]:
    """
    Lazily load MCP tools from Exa, Context7, DeepWiki, and Linkup using
    langchain-mcp-adapters. Cached after first load.
    """
    global _MCP_TOOLS
    if _MCP_TOOLS is not None:
        return _MCP_TOOLS

    servers: Dict[str, Dict[str, Any]] = {
        "exa": {
            "transport": "http",
            "url": EXA_MCP_URL,
        },
        "context7": {
            "transport": "http",
            "url": CONTEXT7_MCP_URL,
        },
        "deepwiki": {
            "transport": "http",
            "url": DEEPWIKI_MCP_URL,
        },
    }

    client = MultiServerMCPClient(servers)
    _MCP_TOOLS = await client.get_tools()
    return _MCP_TOOLS


# ---------------------------------------------------------------------------
# LangGraph state and model node
# ---------------------------------------------------------------------------

class AgentState(MessagesState):
    """
    LangGraph state that:
    - Tracks conversation messages (from MessagesState)
    - Optionally carries llm_config injected by LinkOS Hub:
        {
          "llm_provider": "...",
          "llm_api_key": "..."
        }
    """

    llm_config: Optional[Dict[str, Any]]


async def call_model(state: AgentState) -> Dict[str, Any]:
    """
    Core model node.

    Uses llm_config from state (if present) to configure the underlying LLM.
    For now we support OpenAI via ChatLiteLLM and allow overriding the API key
    by setting the appropriate environment variable dynamically.
    """
    llm_config = state.get("llm_config") or {}
    provider = (llm_config.get("llm_provider") or "").lower()
    api_key = llm_config.get("llm_api_key")

    # Default model: OpenAI gpt-4o using env-based key
    model_name = "gpt-4o-mini"

    # Configure provider-specific API keys for LiteLLM if provided
    if provider == "openai" and api_key:
        os.environ["OPENAI_API_KEY"] = api_key
        model_name = "gpt-4o-mini"
    elif provider == "anthropic" and api_key:
        os.environ["ANTHROPIC_API_KEY"] = api_key
        model_name = "claude-3-sonnet-20240229"
    elif provider == "deepseek" and api_key:
        os.environ["DEEPSEEK_API_KEY"] = api_key
        model_name = "deepseek-chat"
    elif provider == "google" and api_key:
        os.environ["GOOGLE_API_KEY"] = api_key
        model_name = "gemini-2.0-flash"

    llm = ChatLiteLLM(model=model_name)

    # Bind MCP tools so the agent can call them when useful
    mcp_tools = await get_mcp_tools()
    bound_llm = llm.bind_tools(mcp_tools)

    # LangGraph MessagesState expects a list of messages
    messages: List[Any] = state["messages"]

    # Prepend our global system prompt for the model only (do NOT store it
    # back into state, so it isn't duplicated across turns).
    model_messages: List[Any] = [SystemMessage(content=SYSTEM_PROMPT)] + messages

    response = await bound_llm.ainvoke(model_messages)
    # Log the model response content for observability
    try:
        resp_text = getattr(response, "content", str(response))
        print(f"🧠 Agent response: {str(resp_text)[:500]}")
    except Exception:
        pass

    return {"messages": messages + [response]}


# ---------------------------------------------------------------------------
# Compile LangGraph
# ---------------------------------------------------------------------------

memory = MemorySaver()

builder = StateGraph(AgentState)
builder.add_node("call_model", call_model)

builder.add_edge(START, "call_model")

graph = builder.compile(checkpointer=memory)
