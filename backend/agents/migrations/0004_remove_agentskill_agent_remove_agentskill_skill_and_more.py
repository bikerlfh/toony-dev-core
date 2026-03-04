from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agents', '0003_rename_skill_content_to_markdown'),
    ]

    operations = [
        # 1. Remove old constraints before renaming
        migrations.RemoveConstraint(
            model_name='agent',
            name='unique_org_agent_slug',
        ),
        migrations.RemoveConstraint(
            model_name='agent',
            name='unique_global_agent_slug',
        ),
        migrations.RemoveConstraint(
            model_name='agentskill',
            name='unique_agent_skill',
        ),

        # 2. Rename models (preserves data, just updates Django's internal state)
        migrations.RenameModel(
            old_name='Agent',
            new_name='SubAgent',
        ),
        migrations.RenameModel(
            old_name='AgentSkill',
            new_name='SubAgentSkill',
        ),

        # 3. Rename the FK field on SubAgentSkill: agent → sub_agent
        migrations.RenameField(
            model_name='subagentskill',
            old_name='agent',
            new_name='sub_agent',
        ),

        # 4. Rename DB tables
        migrations.AlterModelTable(
            name='subagent',
            table='sub_agents',
        ),
        migrations.AlterModelTable(
            name='subagentskill',
            table='sub_agent_skills',
        ),

        # 5. Add new constraints with updated names
        migrations.AddConstraint(
            model_name='subagent',
            constraint=models.UniqueConstraint(
                condition=models.Q(('organization__isnull', False)),
                fields=('organization', 'slug'),
                name='unique_org_sub_agent_slug',
            ),
        ),
        migrations.AddConstraint(
            model_name='subagent',
            constraint=models.UniqueConstraint(
                condition=models.Q(('organization__isnull', True)),
                fields=('slug',),
                name='unique_global_sub_agent_slug',
            ),
        ),
        migrations.AddConstraint(
            model_name='subagentskill',
            constraint=models.UniqueConstraint(
                fields=('sub_agent', 'skill'),
                name='unique_sub_agent_skill',
            ),
        ),
    ]
