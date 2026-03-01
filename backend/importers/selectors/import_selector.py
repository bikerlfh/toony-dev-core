from importers.models import ImportJob, ImportMapping


def list_organization_import_jobs(organization):
    return ImportJob.objects.filter(organization=organization).order_by("-created_at")


def get_import_job_by_id(organization, job_id):
    return ImportJob.objects.filter(organization=organization, id=job_id).first()


def list_import_mappings(import_job):
    return ImportMapping.objects.filter(import_job=import_job).order_by("created_at")
