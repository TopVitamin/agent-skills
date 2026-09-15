#!/usr/bin/env python3
"""Validate the lightweight repository contract for every packaged Skill."""

from __future__ import annotations

import re
import sys
from pathlib import Path


NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def frontmatter_value(text: str, key: str) -> str | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end < 0:
        return None
    match = re.search(rf"^{re.escape(key)}:\s*([^\n]+)$", text[4:end], re.MULTILINE)
    return match.group(1).strip().strip('"\'') if match else None


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    skills_root = root / "skills"
    skill_dirs = sorted(path for path in skills_root.iterdir() if path.is_dir())
    if not skill_dirs:
        print("No skill directories found under skills/", file=sys.stderr)
        return 1

    errors: list[str] = []
    for skill_dir in skill_dirs:
        entrypoint = skill_dir / "SKILL.md"
        if not entrypoint.is_file():
            errors.append(f"{skill_dir}: missing SKILL.md")
            continue

        text = entrypoint.read_text(encoding="utf-8")
        name = frontmatter_value(text, "name")
        description = frontmatter_value(text, "description")
        if not name:
            errors.append(f"{entrypoint}: missing frontmatter name")
        elif name != skill_dir.name:
            errors.append(f"{entrypoint}: name {name!r} does not match directory")
        elif not NAME_RE.fullmatch(name):
            errors.append(f"{entrypoint}: invalid skill name {name!r}")
        if not description:
            errors.append(f"{entrypoint}: missing frontmatter description")
        if "[TODO:" in text:
            errors.append(f"{entrypoint}: unfinished scaffold placeholder")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    print(f"Validated {len(skill_dirs)} skill(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
