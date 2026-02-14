"""
Linkos - Multi-platform messaging gateway.

A lightweight package for connecting AI agents to messaging platforms
via WebSocket connections.
"""

__version__ = "0.1.0"

# Core runtime
from linkos.core import cli, Gateway

from linkos.models.message import UnifiedMessage, Platform, MessageType
from linkos.models.session import Session, SessionState

__all__ = [
    "cli",
    "Gateway",
    "UnifiedMessage",
    "Platform",
    "MessageType",
    "Session",
    "SessionState",
]
