"""Message routing service."""

import logging
from typing import Optional, TYPE_CHECKING

from linkos.models import UnifiedMessage

if TYPE_CHECKING:
    from linkos.services.session import SessionManager
    from linkos.services.agent import MockAgent

logger = logging.getLogger(__name__)


class MessageRouter:
    """Routes messages through the processing pipeline."""
    
    def __init__(self, session_manager: "SessionManager", agent: "MockAgent"):
        """Initialize message router."""
        self.session_manager = session_manager
        self.agent = agent
    
    async def route_message(self, message: UnifiedMessage) -> str:
        """Route message through pipeline and return response."""
        # Get or create session
        session = self.session_manager.get_or_create_session(
            platform=message.platform, user_id=message.user_id
        )
        
        # Update session
        self.session_manager.update_session(session.session_id, message.id)
        
        # Get context
        context = self.session_manager.get_session_context(session.session_id)
        
        # Process with agent
        try:
            response = await self.agent.process_message(message, context)
        except Exception as e:
            logger.error(f"Agent error: {e}")
            response = f"❌ Error: {str(e)}"
        
        return response
