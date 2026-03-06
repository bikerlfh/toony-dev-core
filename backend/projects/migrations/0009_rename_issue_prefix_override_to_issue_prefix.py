from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0008_alter_issue_labels_delete_label_delete_team_and_more"),
    ]

    operations = [
        migrations.RenameField(
            model_name="projectsettings",
            old_name="issue_prefix_override",
            new_name="issue_prefix",
        ),
        migrations.AlterField(
            model_name="projectsettings",
            name="issue_prefix",
            field=models.CharField(max_length=10),
        ),
    ]
