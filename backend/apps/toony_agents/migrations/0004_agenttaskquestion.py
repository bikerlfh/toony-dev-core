import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("toony_agents", "0003_rename_approval_event_types_to_question"),
    ]

    operations = [
        migrations.CreateModel(
            name="AgentTaskQuestion",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("question_id", models.UUIDField(unique=True)),
                ("text", models.TextField()),
                ("answer", models.TextField(blank=True, null=True)),
                ("answered_at", models.DateTimeField(blank=True, null=True)),
                ("session_id", models.CharField(max_length=255)),
                (
                    "task",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="questions",
                        to="toony_agents.agenttask",
                    ),
                ),
            ],
            options={
                "db_table": "agent_task_questions",
                "ordering": ["created_at"],
            },
        ),
    ]
