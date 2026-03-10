from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("toony_agents", "0002_rename_awaiting_approval_to_waiting_for_answer"),
    ]

    operations = [
        migrations.AlterField(
            model_name="taskevent",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("LOG", "Log"),
                    ("TOOL_USE", "Tool Use"),
                    ("TOOL_RESULT", "Tool Result"),
                    ("QUESTION_ASKED", "Question Asked"),
                    ("QUESTION_ANSWERED", "Question Answered"),
                    ("REPLY", "Reply"),
                    ("STATUS_CHANGE", "Status Change"),
                    ("ERROR", "Error"),
                ],
                max_length=20,
            ),
        ),
    ]
