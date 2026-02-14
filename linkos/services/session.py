"""Session management service (reused from previous implementation)."""

from datetime import datetime
from typing import Dict, Optional

from linkos.models import Session, Platform, SessionState


class SessionManager:
    """
    Manages conversation sessions across platforms.
    
    For MVP, uses in-memory dictionary storage.
    For production, replace with Redis, PostgreSQL, or MongoDB.
    """
    
    def __init__(self):
        """Initialize session manager with empty storage."""
        self._sessions: Dict[str, Session] = {}
    
    def get_or_create_session(
        self, platform: Platform, user_id: str, initial_context: Optional[dict] = None
    ) -> Session:
        """Get existing session or create a new one."""
        session_id = f"{platform.value}:{user_id}"
        
        if session_id in self._sessions:
            session = self._sessions[session_id]
            session.last_active = datetime.utcnow()
            return session
        
        session = Session(
            session_id=session_id,
            platform=platform,
            user_id=user_id,
            context=initial_context or {},
        )
        
        self._sessions[session_id] = session
        return session
    
    def update_session(self, session_id: str, message_id: str) -> None:
        """Update session with new message activity."""
        if session_id in self._sessions:
            self._sessions[session_id].update_activity(message_id)
    
    def get_session_context(self, session_id: str) -> dict:
        """Get session context data."""
        session = self._sessions.get(session_id)
        return session.context if session else {}
    
    def update_session_context(self, session_id: str, context: dict) -> None:
        """Update session context."""
        if session_id in self._sessions:
            self._sessions[session_id].context.update(context)
