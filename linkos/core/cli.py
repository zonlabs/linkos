"""CLI interface for linkos."""

import click
import asyncio
import logging
from linkos.gateway import Gateway

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)


@click.group()
@click.version_option(version="0.1.0")
def main():
    """Linkos - Multi-platform messaging gateway."""
    pass


@main.command()
@click.option(
    "--config",
    "-c",
    type=click.Path(exists=True),
    help="Path to configuration file",
)
def gateway(config):
    """Start the messaging gateway.
    
    Connects to configured platforms via WebSocket and routes messages to AI agent.
    
    Example:
    
        linkos gateway
        linkos gateway --config config.toml
    """
    click.echo("🚀 Starting Linkos gateway...")
    
    gw = Gateway(config_path=config)
    
    try:
        asyncio.run(gw.start())
    except KeyboardInterrupt:
        click.echo("\n👋 Shutting down gateway...")


@main.command()
def init():
    """Initialize configuration file.
    
    Creates a config.toml template with platform settings.
    """
    click.echo("📝 Creating config.toml template...")
    
    template = '''# Linkos Configuration

[telegram]
enabled = true
token = "YOUR_BOT_TOKEN"
# Get token from @BotFather

[discord]
enabled = false
token = "YOUR_BOT_TOKEN"
# Get from https://discord.com/developers/applications

[slack]
enabled = false
bot_token = "xoxb-..."
app_token = "xapp-..."
# Use Socket Mode

[agent]
# Type: "agui" for AG-UI protocol agents, "mock" for testing
type = "agui"

# AG-UI agent endpoint
endpoint = "http://localhost:8000/agent"

# Optional: Authentication headers
# [agent.headers]
# Authorization = "Bearer YOUR_TOKEN"

# Example with existing ADK agent:
# 1. Start your ADK agent: cd mcp-ts/examples/agents/agents/python && python -m uvicorn adk:app
# 2. Set endpoint above to: http://localhost:8000/agent
# 3. Run linkos gateway
'''
    
    with open("config.toml", "w") as f:
        f.write(template)
    
    click.echo("✅ Created config.toml")
    click.echo("📌 Edit the file and add your platform tokens")


if __name__ == "__main__":
    main()
