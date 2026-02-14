"""Unified message schema (reused from previous implementation)."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class Platform(str, Enum):
    """Supported messaging platforms."""

    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"
    DISCORD = "discord"
    SLACK = "slack"


class MessageType(str, Enum):
    """Types of messages that can be processed."""

    TEXT = "text"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"
    FILE = "file"
    LOCATION = "location"
    CONTACT = "contact"
    STICKER = "sticker"
    UNKNOWN = "unknown"


class MessageContext(BaseModel):
    """Additional context about the message."""

    reply_to: Optional[str] = Field(None, description="ID of message being replied to")
    thread_id: Optional[str] = Field(None, description="Thread/conversation ID")
    is_edited: bool = Field(default=False, description="Whether message was edited")
    is_forwarded: bool = Field(default=False, description="Whether message was forwarded")


class UnifiedMessage(BaseModel):
    """Unified message format used internally across all platforms."""

    id: str = Field(..., description="Unique message identifier")
    platform: Platform = Field(..., description="Source platform")
    user_id: str = Field(..., description="Platform-specific user identifier")
    session_id: str = Field(..., description="Internal session identifier")
    content: str = Field(..., description="Message content (text, URL, etc.)")
    message_type: MessageType = Field(default=MessageType.TEXT, description="Type of message")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Message timestamp"
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict, description="Platform-specific metadata"
    )
    context: Optional[MessageContext] = Field(None, description="Message context")
