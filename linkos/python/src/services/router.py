"""Message routing service."""

import logging
import asyncio
import json
import uuid
from typing import Optional, Any, List, TYPE_CHECKING
from collections.abc import Callable, Awaitable

from linkos.models import UnifiedMessage

from ag_ui.core import (
    RunAgentInput, 
    UserMessage, 
    AssistantMessage,
    SystemMessage,
    EventType,
    TextMessageContentEvent
)

if TYPE_CHECKING:
    from linkos.services.session import SessionManager

logger = logging.getLogger(__name__)


class MessageRouter:
    """Routes messages through the processing pipeline."""
    
    def __init__(self, session_manager: "SessionManager", agent: Any):
        """Initialize message router."""
        self.session_manager = session_manager
        self.agent = agent
    
    async def route_message(self, message: UnifiedMessage, on_token: Optional[Callable[[str], Awaitable[None]]] = None) -> str:
        """
        Route message through pipeline and return response.
        
        Args:
            message: The message to route.
            on_token: Optional async callback for streaming tokens.
        """
        # Get or create session
        session = self.session_manager.get_or_create_session(
            platform=message.platform, user_id=message.user_id
        )
        
        # Update session with user message
        self.session_manager.update_session(session.session_id, message)
        
        # Get context
        context = self.session_manager.get_session_context(session.session_id)
        
        # Process with agent
        # Process with agent
        try:
            # Check for compiled LangGraph (bypassing buggy AG-UI wrapper)
            if hasattr(self.agent, 'graph') and hasattr(self.agent.graph, 'astream_events'):
                 response = await self._process_langgraph_run(message, session.history, on_token)

            # Check for AG-UI Protocol run() method
            elif hasattr(self.agent, 'run') and callable(self.agent.run):
                response = await self._process_agui_run(message, session.history, on_token)
            
            # Check for simple process_message (fallback)
            elif hasattr(self.agent, 'process_message'):
                # Note: simple process_message doesn't support streaming callback easily unless modified
                response = await self.agent.process_message(message, context)
            
            # Check for simple callable
            elif callable(self.agent):
                if asyncio.iscoroutinefunction(self.agent):
                    response = await self.agent(message.content)
                else:
                    response = self.agent(message.content)
            
            else:
                raise AttributeError(f"Agent {type(self.agent).__name__} does not implement a supported interface (run, process_message, or __call__)")

            # Record assistant response in history
            if response and not response.startswith("❌ Error:"):
                # Create a pseudo-message for the assistant response to update history
                assistant_msg = type('obj', (object,), {
                    'id': str(uuid.uuid4()),
                    'role': 'assistant',
                    'content': response
                })
                self.session_manager.update_session(session.session_id, assistant_msg)

            return response

        except Exception as e:
            logger.error(f"Agent error: {e}", exc_info=True)
            return f"❌ Error: {str(e)}"

    async def _process_agui_run(self, message: UnifiedMessage, history: List[dict], on_token: Optional[Callable[[str], Awaitable[None]]] = None) -> str:
        """Bridge UnifiedMessage to AG-UI run() interface with full history."""
        
        # Only send the current message to the agent, as LangGraph manages state via thread_id
        current_usermsg = UserMessage(
            id=message.id,
            content=message.content
        )
        
        # Construct AG-UI input
        ag_input = RunAgentInput(
            thread_id=message.session_id,
            run_id=str(uuid.uuid4()),
            messages=[current_usermsg],
            state={},
            tools=[],
            context=[],
            forwarded_props={}
        )
        
        response_text = ""
        
        # Call agent.run()
        result = self.agent.run(ag_input)
        
        if hasattr(result, '__aiter__'):
            async for event in result:
                delta = self._parse_agui_event(event)
                if delta:
                    response_text += delta
                    if on_token:
                        await on_token(delta)
        elif asyncio.iscoroutine(result):
            res = await result
            if isinstance(res, str):
                response_text = res
                if on_token:
                    await on_token(res)
            else:
                for event in res:
                    delta = self._parse_agui_event(event)
                    if delta:
                        response_text += delta
                        if on_token:
                            await on_token(delta)

        return response_text or "⚠️ Agent produced no response."

    def _parse_agui_event(self, event: Any) -> str:
        """Parse text from various AG-UI event formats."""
        if isinstance(event, str):
            try:
                event_data = json.loads(event)
                if event_data.get("type") == EventType.TEXT_MESSAGE_CONTENT:
                    return event_data.get("delta", "")
            except json.JSONDecodeError:
                pass
        elif isinstance(event, TextMessageContentEvent):
            return event.delta
        elif hasattr(event, "type") and event.type == EventType.TEXT_MESSAGE_CONTENT:
            return getattr(event, "delta", "")
        
        return ""

    async def _process_langgraph_run(self, message: UnifiedMessage, history: List[dict], on_token: Optional[Callable[[str], Awaitable[None]]] = None) -> str:
        """
        Process message directly with Linkos native LangGraph support.
        
        This bypasses the AG-UI wrapper to provide more robust state management
        and direct access to the graph's streaming capabilities.
        """
        try:
            from langchain_core.messages import HumanMessage
        except ImportError:
            logger.error("LangChain not installed, cannot use LangGraph directly.")
            return "❌ Error: LangChain dependencies not found."

        # Convert Linkos message to LangChain HumanMessage
        human_msg = HumanMessage(content=message.content, id=message.id)
        
        # Configure the run with the session ID as thread_id for state persistence
        config = {"configurable": {"thread_id": message.session_id}}
        
        response_text = ""
        
        try:
            # Stream events using the v2 API for token-by-token output
            async for event in self.agent.graph.astream_events(
                {"messages": [human_msg]}, 
                config, 
                version="v2"
            ):
                event_type = event.get("event")
                
                # Filter for chat model stream events to capture generated text
                if event_type == "on_chat_model_stream":
                    data = event.get("data", {})
                    chunk = data.get("chunk")
                    if chunk and chunk.content:
                        content = chunk.content
                        response_text += content
                        if on_token:
                            await on_token(content)
                        
        except Exception as e:
            logger.error(f"LangGraph execution error: {e}", exc_info=True)
            return f"❌ Error executing agent: {str(e)}"

        return response_text or "⚠️ Agent produced no response."
