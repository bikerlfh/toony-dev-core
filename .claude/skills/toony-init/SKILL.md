---
name: toony-init
description: "Initialize TOONY marker protocol rules for a project. Creates .claude/rules/toony-markers.md in the project root so Claude knows how to signal questions and task completion to the Toony agent runner. Run once per project."
---

# Toony Init

Creates the `.claude/rules/toony-markers.md` file in the current project so Claude knows how to use the TOONY marker protocol when running inside the Toony agent runner.

## Steps

Check if the file already exists:

```bash
cat .claude/rules/toony-markers.md 2>/dev/null
```

If it exists, ask the user if they want to overwrite it. If they say no, stop.

Create `.claude/rules/` directory if it doesn't exist, then create `.claude/rules/toony-markers.md` with this exact content:

```markdown
# TOONY Marker Protocol

When running inside the Toony agent runner, use these markers in your responses to signal questions and task completion.

## Asking a question

When you need to ask the user a question, include this marker in your response:

<!--TOONY:{"action":"question","text":"your question here","type":"free_text"}-->

For multiple choice questions with options:

<!--TOONY:{"action":"question","text":"your question here","type":"options","options":[{"label":"Option A"},{"label":"Option B"}]}-->

Optional fields: `header` (string), `multi_select` (boolean, default false), option `description` (string).

## Completing a task

When you have fully completed the assigned task, include this marker:

<!--TOONY:{"action":"finish","summary":"brief summary of what was done"}-->

**Important:**
- Do NOT include the finish marker if you need more information or the task is incomplete
- Do NOT include the finish marker if you just asked a question
- Only include one marker per response
```

After creating, confirm success:

```
Created .claude/rules/toony-markers.md
The TOONY marker protocol is now active for this project.
```
