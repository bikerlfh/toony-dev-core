from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("projects", "0001_initial"),
        ("toony_agents", "0003_alter_agenttask_organization"),
    ]

    operations = [
        migrations.AddField(
            model_name="agenttask",
            name="project",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="agent_tasks",
                to="projects.project",
            ),
        ),
    ]
