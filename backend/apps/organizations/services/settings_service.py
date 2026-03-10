from organizations.selectors import get_organization_settings


def update_organization_settings(organization, **kwargs):
    settings = get_organization_settings(organization)
    allowed_fields = {
        "default_project_methodology",
        "timezone",
        "notification_preferences",
        "allowed_ip_ranges",
        "audit_log_retention_days",
    }
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(settings, field, value)
    settings.save()
    return settings
