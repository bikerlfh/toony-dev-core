from datetime import date, timedelta

from django.core.management.base import BaseCommand

from accounts.models import User
from organizations.services import create_organization
from projects.services import (
    create_cycle,
    create_issue,
    create_milestone,
    create_project,
    create_comment,
)
from workspace.services import (
    add_team_member,
    create_label,
    create_team,
)


class Command(BaseCommand):
    help = "Seed the database with demo data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete all data before seeding",
        )

    def handle(self, *args, **options):
        if options["flush"]:
            self.stdout.write("Flushing existing data...")
            from projects.models import Issue, Cycle, Milestone, Project
            from workspace.models import Team, Label, ProjectTeam
            from organizations.models import Organization
            Issue.objects.all().delete()
            Cycle.objects.all().delete()
            Milestone.objects.all().delete()
            ProjectTeam.objects.all().delete()
            Project.objects.all().delete()
            Team.objects.all().delete()
            Label.objects.all().delete()
            Organization.objects.all().delete()
            User.objects.filter(
                username__in=["admin", "member"]
            ).delete()
            self.stdout.write(self.style.SUCCESS("Data flushed."))

        if User.objects.filter(username="admin").exists():
            self.stdout.write(self.style.WARNING("Seed data already exists. Skipping."))
            return

        self.stdout.write("Creating users...")
        admin = User.objects.create_user(
            username="admin",
            email="admin@toony.dev",
            password="admin123",
            first_name="Admin",
            last_name="User",
        )
        member = User.objects.create_user(
            username="member",
            email="member@toony.dev",
            password="member123",
            first_name="Member",
            last_name="User",
        )

        self.stdout.write("Creating organization...")
        org = create_organization(
            name="Toony Demo",
            slug="toony-demo",
            owner=admin,
            description="Demo organization for Toony Dev Core",
        )

        # Add member to org
        from organizations.services import add_member
        add_member(org, member, "MEMBER", invited_by=admin)

        self.stdout.write("Creating teams...")
        eng_team = create_team(
            name="Engineering",
            slug="engineering",
            identifier="ENG",
            creator=admin,
            description="Engineering team",
        )
        des_team = create_team(
            name="Design",
            slug="design",
            identifier="DES",
            creator=admin,
            description="Design team",
        )
        add_team_member(eng_team, member)
        add_team_member(des_team, member)

        self.stdout.write("Creating labels...")
        labels = {}
        label_data = [
            ("Bug", "#ef4444", "Something isn't working"),
            ("Feature", "#3b82f6", "New feature or request"),
            ("Enhancement", "#8b5cf6", "Improvement to existing feature"),
            ("Documentation", "#6b7280", "Documentation updates"),
            ("Priority: Critical", "#dc2626", "Critical priority"),
        ]
        for name, color, description in label_data:
            labels[name] = create_label(name, color=color, description=description)

        self.stdout.write("Creating projects...")
        today = date.today()
        p1 = create_project(
            organization=org,
            name="Backend API",
            slug="backend-api",
            creator=admin,
            issue_prefix="BE",
            description="Core backend REST API",
            status="IN_PROGRESS",
            priority="HIGH",
            start_date=today - timedelta(days=30),
            target_date=today + timedelta(days=60),
        )
        p2 = create_project(
            organization=org,
            name="Frontend App",
            slug="frontend-app",
            creator=admin,
            issue_prefix="FE",
            description="Next.js frontend application",
            status="IN_PROGRESS",
            priority="HIGH",
            start_date=today - timedelta(days=14),
            target_date=today + timedelta(days=90),
        )
        p3 = create_project(
            organization=org,
            name="Design System",
            slug="design-system",
            creator=admin,
            issue_prefix="DS",
            description="UI component library and design tokens",
            status="PLANNED",
            priority="MEDIUM",
        )

        # Associate projects with teams
        from workspace.services import add_project_team
        add_project_team(p1, eng_team)
        add_project_team(p2, eng_team)
        add_project_team(p3, des_team)

        # Add member to projects
        from projects.services import add_project_member
        add_project_member(p1, member)
        add_project_member(p2, member)

        self.stdout.write("Creating milestones...")
        ms1 = create_milestone(
            project=p1,
            name="v1.0 - MVP",
            description="Minimum viable product release",
            target_date=today + timedelta(days=30),
            status="IN_PROGRESS",
        )
        ms2 = create_milestone(
            project=p1,
            name="v1.1 - Polish",
            description="Post-MVP improvements and bug fixes",
            target_date=today + timedelta(days=60),
        )

        self.stdout.write("Creating cycles...")
        cycle1 = create_cycle(
            project=p1,
            name="Sprint 1",
            start_date=today - timedelta(days=14),
            end_date=today,
            status="ACTIVE",
        )

        self.stdout.write("Creating issues...")
        issues_data = [
            ("Set up user authentication", "Implement JWT auth endpoints",
             "DONE", "HIGH", admin, ms1, cycle1, ["Feature"]),
            ("Create organization CRUD", "Full CRUD for organizations",
             "DONE", "HIGH", admin, ms1, cycle1, ["Feature"]),
            ("Add team management", "Team creation and membership",
             "IN_PROGRESS", "MEDIUM", admin, ms1, cycle1, ["Feature"]),
            ("Implement RBAC", "Role-based access control",
             "IN_PROGRESS", "HIGH", member, ms1, None,
             ["Feature", "Enhancement"]),
            ("Fix login redirect", "Users not redirected after login",
             "TODO", "URGENT", admin, None, None, ["Bug"]),
            ("Add API documentation", "Swagger/OpenAPI docs",
             "TODO", "LOW", None, ms2, None, ["Documentation"]),
            ("Database optimization", "Add indexes for common queries",
             "BACKLOG", "MEDIUM", None, ms2, None, ["Enhancement"]),
            ("Set up CI/CD", "GitHub Actions pipeline",
             "BACKLOG", "HIGH", None, ms2, None, ["Feature"]),
            ("Design landing page", "Create mockups for landing page",
             "TODO", "MEDIUM", member, None, None, ["Feature"]),
            ("Component library", "Build reusable UI components",
             "BACKLOG", "LOW", None, None, None, ["Feature"]),
        ]

        created_issues = []
        for title, desc, issue_status, priority, assignee, milestone, cycle, label_names in issues_data:
            project = p3 if title in ("Design landing page", "Component library") else p1
            issue_labels = [labels[n].id for n in label_names]
            issue = create_issue(
                project=project,
                reporter=admin,
                title=title,
                description=desc,
                status=issue_status,
                priority=priority,
                assignee=assignee,
                milestone=milestone,
                cycle=cycle,
                label_ids=issue_labels,
            )
            created_issues.append(issue)

        self.stdout.write("Creating comments...")
        comments_data = [
            (created_issues[0], admin, "JWT implementation complete. Refresh tokens working."),
            (created_issues[0], member, "Tested all endpoints. LGTM!"),
            (created_issues[2], admin, "Started working on team membership model."),
            (created_issues[3], member, "Should we use 5 roles or keep it simpler?"),
            (created_issues[4], admin, "This is a regression from the latest auth refactor."),
        ]
        for issue, author, body in comments_data:
            create_comment(issue=issue, author=author, body=body)

        self.stdout.write(self.style.SUCCESS(
            "Seed data created successfully!\n"
            "  - 2 users (admin / admin123, member / member123)\n"
            "  - 1 organization (toony-demo)\n"
            "  - 2 teams, 5 labels, 3 projects\n"
            "  - 2 milestones, 1 cycle\n"
            "  - 10 issues, 5 comments"
        ))
