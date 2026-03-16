from django.db import transaction

from common.exceptions import ConflictError
from projects.models import (
    Project,
    ProjectMemberRole,
    ProjectMembership,
    ProjectSettings,
)
from projects.selectors import get_project_by_slug


def create_project(organization, name, slug, creator, **kwargs):
    issue_prefix = kwargs.pop("issue_prefix")

    if get_project_by_slug(organization, slug):
        raise ConflictError("A project with this slug already exists in the organization.")

    with transaction.atomic():
        project = Project.objects.create(
            organization=organization,
            name=name,
            slug=slug,
            lead=creator,
            **kwargs,
        )
        ProjectSettings.objects.create(
            project=project,
            issue_prefix=issue_prefix,
        )
        ProjectMembership.objects.create(
            project=project,
            user=creator,
            role=ProjectMemberRole.LEAD,
        )

    return project


def update_project(project, **kwargs):
    allowed_fields = {
        "name",
        "description",
        "short_summary",
        "status",
        "priority",
        "start_date",
        "target_date",
        "sort_order",
        "icon",
        "color",
    }
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(project, field, value)
    project.save()
    return project


def delete_project(project):
    project.delete()


def add_project_member(project, user, role=ProjectMemberRole.CONTRIBUTOR, actor=None):
    existing = ProjectMembership.objects.filter(
        project=project,
        user=user,
    ).first()
    if existing:
        raise ConflictError("User is already a member of this project.")
    membership = ProjectMembership.objects.create(
        project=project,
        user=user,
        role=role,
    )

    if actor:
        from notifications.services import notify
        notify("project.member_added", {"project": project, "member": user, "actor": actor})

    return membership


def update_project_member_role(membership, new_role):
    membership.role = new_role
    membership.save()
    return membership


def remove_project_member(membership, actor=None):
    project = membership.project
    member = membership.user
    membership.delete()

    if actor:
        from notifications.services import notify
        notify("project.member_removed", {"project": project, "member": member, "actor": actor})


def update_project_settings(settings_obj, **kwargs):
    allowed_fields = {
        "repository_url",
        "default_branch",
        "branch_naming_convention",
        "issue_prefix",
        "auto_task_prompt_template",
    }
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(settings_obj, field, value)
    settings_obj.save()
    return settings_obj
