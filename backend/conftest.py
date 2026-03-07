import pytest
from rest_framework.test import APIClient

from tests.factories import (
    AgentTaskFactory,
    CycleFactory,
    IssueArtifactFactory,
    IssueDocumentFactory,
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
    ToonyAgentFactory,
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
def team(user):
    t = TeamFactory()
    TeamMembershipFactory(team=t, user=user, role="LEAD")
    return t


@pytest.fixture()
def label():
    return LabelFactory()


@pytest.fixture()
def project(organization, user):
    p = ProjectFactory(organization=organization, lead=user)
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


@pytest.fixture()
def toony_agent(user, organization):
    agent = ToonyAgentFactory(registered_by=user)
    agent.organizations.add(organization)
    return agent


@pytest.fixture()
def agent_task(organization, project, toony_agent, user):
    return AgentTaskFactory(
        organization=organization,
        project=project,
        toony_agent=toony_agent,
        created_by=user,
    )


@pytest.fixture()
def artifact(issue, agent_task):
    return IssueArtifactFactory(issue=issue, agent_task=agent_task)


@pytest.fixture()
def issue_document(issue, user):
    return IssueDocumentFactory(issue=issue, uploaded_by=user)


@pytest.fixture()
def user_api_key(user):
    from accounts.services.api_key_service import generate_api_key

    key_obj, raw_key = generate_api_key(user=user, name="test-key")
    key_obj._raw_key = raw_key
    return key_obj
