"""Main gateway orchestrator."""

import asyncio
import logging
import os
from pathlib import Path
from typing import Optional, Any

from linkos.clients.telegram import TelegramClient
from linkos.clients.discord import DiscordClient
from linkos.clients.whatsapp import WhatsAppClient
from linkos.services.session import SessionManager
from linkos.services.agent import MockAgent
from linkos.services.router import MessageRouter

logger = logging.getLogger(__name__)


class Gateway:
    """
    Main gateway that coordinates platform clients and message routing.
    
    Linkos Gateway can be used:
    1. Via CLI: `linkos start` (loads config.toml)
    2. Via SDK: `Gateway(agent=my_agent)` (Magic mode: auto-starts)
    """
    
    def __init__(
        self, 
        config_path: Optional[str] = None,
        agent: Optional[Any] = None,
        telegram_token: Optional[str] = None,
        discord_token: Optional[str] = None,
    ):
        """
        Initialize gateway.
        
        Args:
            config_path: Path to config.toml
            agent: Agent instance (if provided, Linkos starts in "Magic SDK" mode)
            telegram_token: Telegram bot token (overrides config/env)
            discord_token: Discord bot token (overrides config/env)
        """
        self.config_path = Path(config_path) if config_path else None
        self.config = self._load_config()
        
        # Merge direct arguments into config
        if telegram_token:
            self.config["telegram"]["token"] = telegram_token
            self.config["telegram"]["enabled"] = True
        if discord_token:
            self.config["discord"]["token"] = discord_token
            self.config["discord"]["enabled"] = True
            
        # Initialize services
        self.session_manager = SessionManager()
        self.agent = agent if agent else self._init_agent()
        self.router = MessageRouter(self.session_manager, self.agent)
        
        # Platform clients
        self.clients = []
        self._daemon_task = None
        self._init_clients()
        
        # Magic mode: if agent is provided, auto-start in background
        if agent:
            self.start()
    
    def _load_config(self) -> dict:
        """Load configuration from file and environment."""
        import sys
        
        # Default empty config
        config = {
            "telegram": {"enabled": False, "token": os.environ.get("TELEGRAM_TOKEN", "")},
            "discord": {"enabled": False, "token": os.environ.get("DISCORD_TOKEN", "")},
            "whatsapp": {
                "enabled": False, 
                "bridge_url": os.environ.get("WHATSAPP_BRIDGE_URL", "ws://localhost:6001"),
            },
            "slack": {"enabled": False, "bot_token": "", "app_token": ""},
        }
        
        # Overwrite with environment defaults if tokens exist
        if config["telegram"]["token"]:
            config["telegram"]["enabled"] = True
        if config["discord"]["token"]:
            config["discord"]["enabled"] = True
        if os.environ.get("ENABLE_WHATSAPP"):
            config["whatsapp"]["enabled"] = True
            
        # Use tomllib for Python 3.11+, tomli for older versions
        if sys.version_info >= (3, 11):
            import tomllib
        else:
            try:
                import tomli as tomllib
            except ImportError:
                return config
        
        # Try to load config.toml
        config_file = self.config_path or Path("config.toml")
        
        if config_file.exists():
            try:
                with open(config_file, "rb") as f:
                    file_config = tomllib.load(f)
                    # Merge file_config into config
                    for key in ["telegram", "discord", "whatsapp", "slack"]:
                        if key in file_config:
                            config[key].update(file_config[key])
                logger.info(f"✅ Loaded config from {config_file}")
            except Exception as e:
                logger.error(f"Failed to load config file: {e}")
        
        return config
    
    def set_agent(self, agent: Any):
        """Set agent instance programmatically."""
        self.agent = agent
        # Update router if it exists
        if hasattr(self, 'router'):
            self.router.agent = agent
        logger.info(f"✅ Agent set programmatically: {type(agent).__name__}")
    
    def _init_agent(self):
        """Initialize AI agent based on config."""
        agent_config = self.config.get("agent", {})
        agent_type = agent_config.get("type", "mock")
        
        if agent_type == "local":
            try:
                instance_path = agent_config.get("instance")
                if not instance_path:
                    logger.error("Local agent requires 'instance' in config")
                    return MockAgent()
                
                logger.info(f"🤖 Loading local agent from: {instance_path}")
                return self._import_agent_instance(instance_path)
            except Exception as e:
                logger.error(f"Failed to load local agent: {e}", exc_info=True)
                return MockAgent()
        
        elif agent_type == "agui":
            try:
                from linkos.agui import AGUIClient
                endpoint = agent_config.get("endpoint")
                if not endpoint:
                    logger.error("AG-UI agent requires 'endpoint' in config")
                    return MockAgent()
                
                headers = agent_config.get("headers", {})
                logger.info(f"🤖 Initializing AG-UI client: {endpoint}")
                return AGUIClient(endpoint=endpoint, headers=headers)
            except ImportError as e:
                logger.error(f"Failed to import AG-UI client: {e}")
                return MockAgent()
        
        return MockAgent()
            
    def _import_agent_instance(self, instance_path: str) -> Any:
        """Import agent instance from module path."""
        import importlib
        try:
            if ":" not in instance_path:
                raise ValueError(f"Invalid import path: {instance_path}. Use 'module:attribute' format")
            
            module_path, obj_name = instance_path.split(":", 1)
            module = importlib.import_module(module_path)
            return getattr(module, obj_name)
        except Exception as e:
            raise ImportError(f"Failed to import {instance_path}: {e}")

    def _init_clients(self):
        """Initialize enabled platform clients."""
        # Telegram
        if self.config["telegram"].get("enabled"):
            token = self.config["telegram"].get("token")
            if token:
                telegram_client = TelegramClient(token, self.router)
                self.clients.append(telegram_client)
                logger.info("✅ Telegram client initialized")
        
        # Discord
        if self.config["discord"].get("enabled"):
            token = self.config["discord"].get("token")
            if token:
                discord_client = DiscordClient(token, self.router)
                self.clients.append(discord_client)
                logger.info("✅ Discord client initialized")

        # WhatsApp
        if self.config["whatsapp"].get("enabled"):
            bridge_url = self.config["whatsapp"].get("bridge_url")
            
            if bridge_url:
                wa_client = WhatsAppClient(bridge_url, self.router)
                self.clients.append(wa_client)
                logger.info(f"✅ WhatsApp client initialized (Bridge: {bridge_url})")
    
    def start(self):
        """
        Start the gateway.
        
        Detects if an event loop is running (FastAPI/Uvicorn) and schedules 
        a background task. If no loop is running, it starts a daemon thread.
        """
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                logger.info("📡 Event loop detected, scheduling Linkos in background...")
                loop.create_task(self._start_async())
                return
        except RuntimeError:
            pass

        # No running loop, start in a daemon thread
        import threading
        logger.info("� No running loop, starting Linkos in a daemon thread...")
        thread = threading.Thread(target=self._run_standalone, daemon=True)
        thread.start()

    def _run_standalone(self):
        """Run the gateway in a fresh event loop (for threads)."""
        asyncio.run(self._start_async())

    async def _start_async(self):
        """Actual async start logic."""
        if not self.clients:
            logger.warning("⚠️ No clients configured. Linkos is idle.")
            return
        
        logger.info(f"🚀 Starting {len(self.clients)} client(s)...")
        tasks = [client.start() for client in self.clients]
        await asyncio.gather(*tasks)
    
    async def stop(self):
        """Stop all platform clients."""
        logger.info("👋 Stopping clients...")
        tasks = [client.stop() for client in self.clients]
        await asyncio.gather(*tasks)
        
        # Await the main background task to ensure clean exit
        if self._daemon_task and not self._daemon_task.done():
            try:
                await self._daemon_task
            except asyncio.CancelledError:
                pass
