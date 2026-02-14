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
    context: dict[str, Any] = Field(
        default_factory=dict, description="Custom session context/state"
    )
    state: SessionState = Field(
        default=SessionState.ACTIVE, description="Current session state"
    )

    def update_activity(self, message_id: str) -> None:
        """Update session with new message activity."""
        self.last_active = datetime.utcnow()
        self.message_history.append(message_id)

    def is_active(self) -> bool:
        """Check if session is active."""
        return self.state == SessionState.ACTIVE
