import pytest
from rest_framework.test import APIClient

from tests.factories import (
    CycleFactory,
    IssueFactory,
    LabelFactory,
    MembershipFactory,
    MilestoneFactory,
    OrganizationFactory,
    OrganizationSettingsFactory,
    ProjectFactory,
    ProjectMembershipFactory,
    ProjectSettingsFactory,
    TeamFactory,
    TeamMembershipFactory,
    UserFactory,
)


@pytest.fixture(autouse=True, scope="session")
def _override_settings(request):
    from django.test.utils import override_settings

    ctx = override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            }
        },
        CHANNEL_LAYERS={
            "default": {
                "BACKEND": "channels.layers.InMemoryChannelLayer",
            }
        },
    )
    ctx.enable()
    request.addfinalizer(ctx.disable)


@pytest.fixture()
def api_client():
    return APIClient()


@pytest.fixture()
def user(db):
    return UserFactory()


@pytest.fixture()
def other_user(db):
    return UserFactory()


@pytest.fixture()
def authenticated_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture()
def organization(user):
    org = OrganizationFactory()
    OrganizationSettingsFactory(organization=org)
    MembershipFactory(user=user, organization=org, role="OWNER")
    return org


@pytest.fixture()
def team(organization, user):
    t = TeamFactory(organization=organization)
    TeamMembershipFactory(team=t, user=user, role="LEAD")
    return t


@pytest.fixture()
def label(organization):
    return LabelFactory(organization=organization)


@pytest.fixture()
def project(organization, team, user):
    p = ProjectFactory(organization=organization, team=team, lead=user)
    ProjectSettingsFactory(project=p)
    ProjectMembershipFactory(project=p, user=user, role="LEAD")
    return p


@pytest.fixture()
def milestone(project):
    return MilestoneFactory(project=project)


@pytest.fixture()
def cycle(project):
    return CycleFactory(project=project)


@pytest.fixture()
def issue(project, user):
    return IssueFactory(project=project, reporter=user)
