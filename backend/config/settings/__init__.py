import os

environment = os.environ.get("ENVIRONMENT", "development")

if environment == "production":
    from config.settings.production import *  # noqa: F401, F403
else:
    from config.settings.development import *  # noqa: F401, F403
