"""Message routing service."""

import logging
import asyncio
import json
import uuid
from typing import Optional, Any, List, TYPE_CHECKING

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
    
    async def route_message(self, message: UnifiedMessage) -> str:
        """Route message through pipeline and return response."""
        # Get or create session
        session = self.session_manager.get_or_create_session(
            platform=message.platform, user_id=message.user_id
        )
        
        # Update session with user message
        self.session_manager.update_session(session.session_id, message)
        
        # Get context
        context = self.session_manager.get_session_context(session.session_id)
        
        # Process with agent
        try:
            # 1. Check for AG-UI Protocol run() method (preferred for wrappers)
            if hasattr(self.agent, 'run') and callable(self.agent.run):
                response = await self._process_agui_run(message, session.history)
            
            # 2. Check for simple process_message (fallback)
            elif hasattr(self.agent, 'process_message'):
                response = await self.agent.process_message(message, context)
            
            # 3. Simple callable
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

    async def _process_agui_run(self, message: UnifiedMessage, history: List[dict]) -> str:
        """Bridge UnifiedMessage to AG-UI run() interface with full history."""
        
        # Map Linkos history to AG-UI messages
        ag_messages = []
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            msg_id = msg.get("id", str(uuid.uuid4()))
            
            if role == "user":
                ag_messages.append(UserMessage(id=msg_id, content=content))
            elif role == "assistant":
                ag_messages.append(AssistantMessage(id=msg_id, content=content))
            elif role == "system":
                ag_messages.append(SystemMessage(id=msg_id, content=content))
        
        # Construct AG-UI input
        ag_input = RunAgentInput(
            thread_id=message.session_id,
            run_id=str(uuid.uuid4()),
            messages=ag_messages,
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
                response_text += self._parse_agui_event(event)
        elif asyncio.iscoroutine(result):
            res = await result
            if isinstance(res, str):
                response_text = res
            else:
                for event in res:
                    response_text += self._parse_agui_event(event)

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
