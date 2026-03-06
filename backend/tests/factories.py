import factory
from django.utils import timezone

from accounts.models import User
from accounts.models.membership import MembershipRole, OrganizationMembership
from organizations.models import Organization, OrganizationSettings
from projects.models import (
    Cycle,
    Issue,
    IssueArtifact,
    IssueComment,
    Milestone,
    Project,
    ProjectMembership,
    ProjectSettings,
)
from workspace.models import Label, Team, TeamMembership
from toony_agents.models import AgentTask, AgentTaskStatus, ToonyAgent, ToonyAgentKey


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f"user{n}")
    email = factory.LazyAttribute(lambda obj: f"{obj.username}@test.com")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    password = factory.PostGenerationMethodCall("set_password", "testpass123")


class OrganizationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Organization

    name = factory.Sequence(lambda n: f"Org {n}")
    slug = factory.Sequence(lambda n: f"org-{n}")
    description = "Test organization"


class OrganizationSettingsFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = OrganizationSettings

    organization = factory.SubFactory(OrganizationFactory)


class MembershipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = OrganizationMembership

    user = factory.SubFactory(UserFactory)
    organization = factory.SubFactory(OrganizationFactory)
    role = MembershipRole.MEMBER


class TeamFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Team

    name = factory.Sequence(lambda n: f"Team {n}")
    slug = factory.Sequence(lambda n: f"team-{n}")
    identifier = factory.Sequence(lambda n: f"T{n}")
    description = "Test team"


class TeamMembershipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = TeamMembership

    team = factory.SubFactory(TeamFactory)
    user = factory.SubFactory(UserFactory)
    role = "MEMBER"


class LabelFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Label

    name = factory.Sequence(lambda n: f"Label {n}")
    color = "#6b7280"


class ProjectFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Project

    organization = factory.SubFactory(OrganizationFactory)
    name = factory.Sequence(lambda n: f"Project {n}")
    slug = factory.Sequence(lambda n: f"project-{n}")
    description = "Test project"
    lead = factory.SubFactory(UserFactory)


class ProjectSettingsFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProjectSettings

    project = factory.SubFactory(ProjectFactory)
    issue_prefix = factory.Sequence(lambda n: f"PRJ{n}")


class ProjectMembershipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProjectMembership

    project = factory.SubFactory(ProjectFactory)
    user = factory.SubFactory(UserFactory)
    role = "CONTRIBUTOR"


class MilestoneFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Milestone

    project = factory.SubFactory(ProjectFactory)
    name = factory.Sequence(lambda n: f"Milestone {n}")
    description = "Test milestone"


class CycleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Cycle

    project = factory.SubFactory(ProjectFactory)
    name = factory.Sequence(lambda n: f"Cycle {n}")
    number = factory.Sequence(lambda n: n + 1)
    start_date = factory.LazyFunction(lambda: timezone.now().date())
    end_date = factory.LazyFunction(
        lambda: (timezone.now() + timezone.timedelta(days=14)).date()
    )


class IssueFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Issue

    project = factory.SubFactory(ProjectFactory)
    reporter = factory.SubFactory(UserFactory)
    title = factory.Sequence(lambda n: f"Issue {n}")
    identifier = factory.Sequence(lambda n: f"TEST-{n}")
    description = "Test issue"


class IssueCommentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = IssueComment

    issue = factory.SubFactory(IssueFactory)
    author = factory.SubFactory(UserFactory)
    body = "Test comment"


class ToonyAgentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ToonyAgent

    name = factory.Sequence(lambda n: f"Bot {n}")
    slug = factory.Sequence(lambda n: f"bot-{n}")
    registered_by = factory.SubFactory(UserFactory)


class ToonyAgentKeyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ToonyAgentKey

    toony_agent = factory.SubFactory(ToonyAgentFactory)
    key_hash = factory.Sequence(lambda n: f"hash_{n}")
    key_prefix = factory.Sequence(lambda n: f"tok_ta_{n}")
    name = "default"
    created_by = factory.SubFactory(UserFactory)


class AgentTaskFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = AgentTask

    organization = factory.SubFactory(OrganizationFactory)
    toony_agent = factory.SubFactory(ToonyAgentFactory)
    title = factory.Sequence(lambda n: f"Task {n}")
    prompt = "Fix the bug"
    created_by = factory.SubFactory(UserFactory)


class IssueArtifactFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = IssueArtifact

    issue = factory.SubFactory(IssueFactory)
    agent_task = factory.SubFactory(AgentTaskFactory)
    title = factory.Sequence(lambda n: f"Artifact {n}")
    artifact_type = "PLAN"
    content = "# Test Plan\n\nThis is a test artifact."
    session_id = factory.Sequence(lambda n: f"session_{n}")
