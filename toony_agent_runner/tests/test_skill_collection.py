"""Tests for skill collection from .claude/skills/ directories."""

from __future__ import annotations

from pathlib import Path

import pytest

from toony_agent_runner.workspace import (
    collect_skills,
    _extract_description,
    _parse_skill_dir,
)


# ---------------------------------------------------------------------------
# _extract_description tests
# ---------------------------------------------------------------------------


class TestExtractDescription:
    """Verify _extract_description parses skill markdown correctly."""

    def test_simple_content(self):
        content = "# My Skill\n\nThis skill does something useful."
        assert _extract_description(content) == "This skill does something useful."

    def test_skips_frontmatter(self):
        content = "---\nname: my-skill\ntype: project\n---\n\n# Heading\n\nActual description here."
        assert _extract_description(content) == "Actual description here."

    def test_skips_headings(self):
        content = "# Title\n## Subtitle\n### Section\n\nFirst real line."
        assert _extract_description(content) == "First real line."

    def test_skips_empty_lines(self):
        content = "\n\n\n# Title\n\n\nDescription after blanks."
        assert _extract_description(content) == "Description after blanks."

    def test_truncates_long_lines(self):
        long_line = "A" * 200
        content = f"# Title\n\n{long_line}"
        result = _extract_description(content)
        assert len(result) == 120
        assert result.endswith("...")

    def test_returns_empty_for_headings_only(self):
        content = "# Title\n## Section\n### Subsection"
        assert _extract_description(content) == ""

    def test_returns_empty_for_empty_content(self):
        assert _extract_description("") == ""

    def test_returns_empty_for_frontmatter_only(self):
        content = "---\nname: test\n---"
        assert _extract_description(content) == ""

    def test_multiple_frontmatter_blocks(self):
        content = "---\nname: test\n---\n---\nother: block\n---\n\nReal description."
        assert _extract_description(content) == "Real description."


# ---------------------------------------------------------------------------
# _parse_skill_dir tests
# ---------------------------------------------------------------------------


class TestParseSkillDir:
    """Verify _parse_skill_dir extracts name and description from a skill directory."""

    def test_with_skill_md(self, tmp_path: Path):
        skill_dir = tmp_path / "brainstorming"
        skill_dir.mkdir()
        (skill_dir / "skill.md").write_text("# Brainstorming\n\nHelp turn ideas into designs.")

        result = _parse_skill_dir(skill_dir)
        assert result == {"name": "brainstorming", "description": "Help turn ideas into designs."}

    def test_with_other_md_file(self, tmp_path: Path):
        skill_dir = tmp_path / "my-skill"
        skill_dir.mkdir()
        (skill_dir / "readme.md").write_text("# My Skill\n\nDoes cool things.")

        result = _parse_skill_dir(skill_dir)
        assert result == {"name": "my-skill", "description": "Does cool things."}

    def test_no_md_files_returns_none(self, tmp_path: Path):
        skill_dir = tmp_path / "empty-skill"
        skill_dir.mkdir()
        (skill_dir / "config.yml").write_text("key: value")

        result = _parse_skill_dir(skill_dir)
        assert result is None

    def test_unreadable_file_returns_empty_description(self, tmp_path: Path):
        skill_dir = tmp_path / "bad-skill"
        skill_dir.mkdir()
        skill_file = skill_dir / "skill.md"
        skill_file.write_bytes(b"\xff\xfe" + b"\x00" * 100)

        result = _parse_skill_dir(skill_dir)
        assert result is not None
        assert result["name"] == "bad-skill"

    def test_prefers_skill_md_over_other_files(self, tmp_path: Path):
        skill_dir = tmp_path / "my-skill"
        skill_dir.mkdir()
        (skill_dir / "skill.md").write_text("# Skill\n\nFrom skill.md.")
        (skill_dir / "readme.md").write_text("# Readme\n\nFrom readme.md.")

        result = _parse_skill_dir(skill_dir)
        assert result["description"] == "From skill.md."

    def test_with_frontmatter(self, tmp_path: Path):
        skill_dir = tmp_path / "tdd"
        skill_dir.mkdir()
        (skill_dir / "skill.md").write_text(
            "---\nname: tdd\ntype: project\n---\n\n# Test-Driven Development\n\nWrite tests before code."
        )

        result = _parse_skill_dir(skill_dir)
        assert result == {"name": "tdd", "description": "Write tests before code."}


# ---------------------------------------------------------------------------
# collect_skills tests
# ---------------------------------------------------------------------------


class TestCollectSkills:
    """Verify collect_skills scans project-level and user-level skill directories."""

    def test_project_level_skills(self, tmp_path: Path, monkeypatch):
        project_dir = tmp_path / "my-project"
        project_dir.mkdir()

        skills_dir = project_dir / ".claude" / "skills"
        skill1 = skills_dir / "brainstorming"
        skill1.mkdir(parents=True)
        (skill1 / "skill.md").write_text("# Brainstorming\n\nTurn ideas into designs.")

        skill2 = skills_dir / "tdd"
        skill2.mkdir()
        (skill2 / "skill.md").write_text("# TDD\n\nTest-driven development.")

        monkeypatch.setattr(Path, "home", lambda: tmp_path / "no-home")

        result = collect_skills(project_dir)
        assert len(result) == 2
        names = [s["name"] for s in result]
        assert "brainstorming" in names
        assert "tdd" in names

    def test_user_level_skills(self, tmp_path: Path, monkeypatch):
        project_dir = tmp_path / "my-project"
        project_dir.mkdir()

        user_skills_dir = tmp_path / "home" / ".claude" / "skills"
        skill1 = user_skills_dir / "global-skill"
        skill1.mkdir(parents=True)
        (skill1 / "skill.md").write_text("# Global\n\nA global skill.")

        monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")

        result = collect_skills(project_dir)
        assert len(result) == 1
        assert result[0]["name"] == "global-skill"
        assert result[0]["description"] == "A global skill."

    def test_project_level_takes_precedence(self, tmp_path: Path, monkeypatch):
        project_dir = tmp_path / "my-project"
        project_dir.mkdir()

        # Project-level skill
        proj_skill = project_dir / ".claude" / "skills" / "shared-skill"
        proj_skill.mkdir(parents=True)
        (proj_skill / "skill.md").write_text("# Shared\n\nProject version.")

        # User-level skill with same name
        user_skill = tmp_path / "home" / ".claude" / "skills" / "shared-skill"
        user_skill.mkdir(parents=True)
        (user_skill / "skill.md").write_text("# Shared\n\nUser version.")

        monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")

        result = collect_skills(project_dir)
        assert len(result) == 1
        assert result[0]["description"] == "Project version."

    def test_empty_project_no_skills(self, tmp_path: Path, monkeypatch):
        project_dir = tmp_path / "empty-project"
        project_dir.mkdir()

        monkeypatch.setattr(Path, "home", lambda: tmp_path / "no-home")

        result = collect_skills(project_dir)
        assert result == []

    def test_nonexistent_project_dir(self, tmp_path: Path, monkeypatch):
        monkeypatch.setattr(Path, "home", lambda: tmp_path / "no-home")

        result = collect_skills(tmp_path / "does-not-exist")
        assert result == []

    def test_skips_non_directory_entries(self, tmp_path: Path, monkeypatch):
        project_dir = tmp_path / "my-project"
        skills_dir = project_dir / ".claude" / "skills"
        skills_dir.mkdir(parents=True)

        # Create a regular file that should be skipped
        (skills_dir / "not-a-skill.txt").write_text("I'm not a skill")

        # Create a valid skill directory
        skill = skills_dir / "real-skill"
        skill.mkdir()
        (skill / "skill.md").write_text("# Real\n\nA real skill.")

        monkeypatch.setattr(Path, "home", lambda: tmp_path / "no-home")

        result = collect_skills(project_dir)
        assert len(result) == 1
        assert result[0]["name"] == "real-skill"

    def test_combines_project_and_user_skills(self, tmp_path: Path, monkeypatch):
        project_dir = tmp_path / "my-project"
        project_dir.mkdir()

        # Project skill
        proj_skill = project_dir / ".claude" / "skills" / "proj-only"
        proj_skill.mkdir(parents=True)
        (proj_skill / "skill.md").write_text("# Proj\n\nProject only.")

        # User skill (different name)
        user_skill = tmp_path / "home" / ".claude" / "skills" / "user-only"
        user_skill.mkdir(parents=True)
        (user_skill / "skill.md").write_text("# User\n\nUser only.")

        monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")

        result = collect_skills(project_dir)
        assert len(result) == 2
        names = [s["name"] for s in result]
        assert "proj-only" in names
        assert "user-only" in names
