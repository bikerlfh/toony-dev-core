from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    services = {}
    healthy = True

    # Check database
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        services["database"] = "up"
    except Exception:
        services["database"] = "down"
        healthy = False

    # Check Redis
    try:
        cache.set("health_check", "ok", 10)
        if cache.get("health_check") == "ok":
            services["redis"] = "up"
        else:
            services["redis"] = "down"
            healthy = False
    except Exception:
        services["redis"] = "down"
        healthy = False

    data = {
        "status": "healthy" if healthy else "unhealthy",
        "services": services,
        "timestamp": timezone.now().isoformat(),
        "version": settings.APP_VERSION,
    }

    return Response(data, status=200 if healthy else 503)
