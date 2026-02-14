"""Main gateway orchestrator."""

import asyncio
import logging
from pathlib import Path
from typing import Optional

from linkos.clients.telegram import TelegramClient
from linkos.clients.discord import DiscordClient
from linkos.services.session import SessionManager
from linkos.services.agent import MockAgent
from linkos.services.router import MessageRouter

logger = logging.getLogger(__name__)


class Gateway:
    """
    Main gateway that coordinates platform clients and message routing.
    
    Like nanobot's gateway, this:
    1. Loads configuration
    2. Initializes platform clients (WebSocket connections)
    3. Routes messages through unified pipeline
    4. Manages sessions and AI agent
    """
    
    def __init__(self, config_path: Optional[str] = None):
        """Initialize gateway with optional config path."""
        self.config_path = Path(config_path) if config_path else None
        self.config = self._load_config()
        
        # Initialize services
        self.session_manager = SessionManager()
        self.agent = self._init_agent()
        self.router = MessageRouter(self.session_manager, self.agent)
        
        # Platform clients
        self.clients = []
        self._init_clients()
    
    def _load_config(self) -> dict:
        """Load configuration from file."""
        import sys
        
        # Use tomllib for Python 3.11+, tomli for older versions
        if sys.version_info >= (3, 11):
            import tomllib
        else:
            try:
                import tomli as tomllib
            except ImportError:
                logger.warning("tomli not installed, using default config")
                return {
                    "telegram": {"enabled": False, "token": ""},
                    "discord": {"enabled": False, "token": ""},
                    "slack": {"enabled": False, "bot_token": "", "app_token": ""},
                }
        
        # Try to load config.toml
        config_file = self.config_path or Path("config.toml")
        
        if not config_file.exists():
            logger.warning(f"Config file {config_file} not found, using defaults")
            return {
                "telegram": {"enabled": False, "token": ""},
                "discord": {"enabled": False, "token": ""},
                "slack": {"enabled": False, "bot_token": "", "app_token": ""},
            }
        
        try:
            with open(config_file, "rb") as f:
                config = tomllib.load(f)
            logger.info(f"✅ Loaded config from {config_file}")
            return config
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
            return {
                "telegram": {"enabled": False, "token": ""},
                "discord": {"enabled": False, "token": ""},
                "slack": {"enabled": False, "bot_token": "", "app_token": ""},
            }
    
    def _init_agent(self):
        """Initialize AI agent based on config."""
        agent_config = self.config.get("agent", {})
        agent_type = agent_config.get("type", "mock")
        
        if agent_type == "agui":
            # AG-UI protocol client
            try:
                from linkos.agui import AGUIClient
                endpoint = agent_config.get("endpoint")
                
                if not endpoint:
                    logger.error("AG-UI agent requires 'endpoint' in config")
                    logger.info("Falling back to mock agent")
                    return MockAgent()
                
                headers = agent_config.get("headers", {})
                logger.info(f"🤖 Initializing AG-UI client: {endpoint}")
                return AGUIClient(endpoint=endpoint, headers=headers)
                
            except ImportError as e:
                logger.error(f"Failed to import AG-UI client: {e}")
                logger.info("Falling back to mock agent")
                return MockAgent()
        else:
            logger.info("🤖 Using mock agent")
            return MockAgent()
    
    def _init_clients(self):
        """Initialize enabled platform clients."""
        # Telegram
        if self.config.get("telegram", {}).get("enabled"):
            token = self.config["telegram"]["token"]
            if token:
                telegram_client = TelegramClient(token, self.router)
                self.clients.append(telegram_client)
                logger.info("✅ Telegram client initialized")
        
        # Discord
        if self.config.get("discord", {}).get("enabled"):
            token = self.config["discord"]["token"]
            if token:
                discord_client = DiscordClient(token, self.router)
                self.clients.append(discord_client)
                logger.info("✅ Discord client initialized")
        
        # Add more platforms as needed
    
    async def start(self):
        """Start all platform clients."""
        if not self.clients:
            logger.warning("⚠️  No clients configured. Run 'linkos init' to create config.")
            logger.info("💡 For testing, add platform tokens to config.toml")
            return
        
        logger.info(f"🚀 Starting {len(self.clients)} client(s)...")
        
        # Start all clients concurrently
        tasks = [client.start() for client in self.clients]
        await asyncio.gather(*tasks)
    
    async def stop(self):
        """Stop all platform clients."""
        logger.info("👋 Stopping clients...")
        tasks = [client.stop() for client in self.clients]
        await asyncio.gather(*tasks)
