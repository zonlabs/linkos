"""
Linkos - Multi-platform messaging gateway.

A lightweight package for connecting AI agents to messaging platforms
via WebSocket connections.
"""

__version__ = "0.1.0"

# Core runtime - Import directly from modules to avoid circularity with core/__init__.py
from .core.gateway import Gateway

from .models.message import UnifiedMessage, Platform, MessageType
from .models.session import Session, SessionState

__all__ = [
    "Gateway",
    "UnifiedMessage",
    "Platform",
    "MessageType",
    "Session",
    "SessionState",
]
