"""Session models (reused from previous implementation)."""

from datetime import datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field

from linkos.models.message import Platform


class SessionState(str, Enum):
    """Possible session states."""

    ACTIVE = "active"
    WAITING = "waiting"
    CLOSED = "closed"


class Session(BaseModel):
    """Conversation session with a user on a specific platform."""

    session_id: str = Field(
        ..., description="Unique session identifier (format: platform:user_id)"
    )
    platform: Platform = Field(..., description="Platform name")
    user_id: str = Field(..., description="Platform-specific user ID")
    created_at: datetime = Field(
        default_factory=datetime.utcnow, description="Session creation time"
    )
    last_active: datetime = Field(
        default_factory=datetime.utcnow, description="Last message timestamp"
    )
    message_history: list[str] = Field(
        default_factory=list, description="List of message IDs in order"
    )
    history: list[dict] = Field(
        default_factory=list, description="Full message history (role, content, etc.)"
    )
    context: dict[str, Any] = Field(
        default_factory=dict, description="Custom session context/state"
    )
    state: SessionState = Field(
        default=SessionState.ACTIVE, description="Current session state"
    )

    def update_activity(self, message: Any) -> None:
        """Update session with new message activity."""
        self.last_active = datetime.utcnow()
        message_id = getattr(message, "id", str(message))
        self.message_history.append(message_id)
        
        # Store for AG-UI history (role, content)
        if hasattr(message, "role") and hasattr(message, "content"):
            self.history.append({
                "id": message.id,
                "role": message.role,
                "content": message.content
            })
        elif hasattr(message, "content"): # UnifiedMessage has content but no role field (it's implicit user)
            self.history.append({
                "id": message.id,
                "role": "user",
                "content": message.content
            })

    def is_active(self) -> bool:
        """Check if session is active."""
        return self.state == SessionState.ACTIVE
