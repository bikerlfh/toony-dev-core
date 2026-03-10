from importers.plugins import ImportPlugin
from importers.plugins.linear_plugin import LinearPlugin

PLUGIN_REGISTRY: dict[str, type[ImportPlugin]] = {
    "LINEAR": LinearPlugin,
}


def get_plugin(provider: str) -> ImportPlugin:
    plugin_class = PLUGIN_REGISTRY.get(provider)
    if plugin_class is None:
        raise ValueError(f"No import plugin registered for provider: {provider}")
    return plugin_class()
