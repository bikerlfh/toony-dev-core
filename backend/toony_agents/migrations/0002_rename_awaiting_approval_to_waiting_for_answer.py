from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("toony_agents", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="agenttask",
            name="status",
            field=models.CharField(
                choices=[
                    ("QUEUED", "Queued"),
                    ("ASSIGNED", "Assigned"),
                    ("RUNNING", "Running"),
                    ("WAITING_FOR_ANSWER", "Waiting for Answer"),
                    ("COMPLETED", "Completed"),
                    ("FAILED", "Failed"),
                    ("CANCELLED", "Cancelled"),
                ],
                default="QUEUED",
                max_length=20,
            ),
        ),
    ]
