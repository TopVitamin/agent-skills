#!/usr/bin/env python3
"""Copy a read-only annotation runtime; do not rewrite business components."""
import argparse
import html
import json
import os
import re
import shutil
from pathlib import Path

STYLE_TAG = '<link rel="stylesheet" href="{base}/runtime.css">'
INLINE_BUNDLE_TAG = '<script src="{base}/annotation.bundle.inline.js"></script>'
SCRIPT_TAG = '<script src="{base}/runtime.js"></script>'
RUNTIME_FILES = ("runtime.js", "runtime.css")
OPTIONAL_FILES = ("annotation.config.json", "annotation.schema.json", "annotation.workspace.schema.json", "annotation.example.md")


def resolve_destination(target_dir: Path, public_path: str) -> Path:
    target_dir = target_dir.resolve()
    destination = (target_dir / public_path).resolve()
    try:
        destination.relative_to(target_dir)
    except ValueError as error:
        raise SystemExit("Destination must stay inside the target project") from error
    return destination


def copy_assets(skill_dir: Path, target_dir: Path, public_path: str, force_config: bool) -> Path:
    source = skill_dir / "assets" / "annotation-kit"
    destination = resolve_destination(target_dir, public_path)
    destination.mkdir(parents=True, exist_ok=True)
    for filename in RUNTIME_FILES + OPTIONAL_FILES:
        target_file = resolve_destination(target_dir, str(destination / filename))
        if filename in RUNTIME_FILES or not target_file.exists() or (force_config and filename == 'annotation.config.json'):
            shutil.copy2(source / filename, target_file)
    return destination


def inject_html(html_path: Path, base_href: str) -> bool:
    text = html_path.read_text(encoding="utf-8")
    base = html.escape(base_href.rstrip("/"), quote=True)
    # Replace only our tags, including old module tags and equivalent quote styles.
    # A marked block makes path changes and repeated installation idempotent.
    text_without = re.sub(r'<!-- vpa:assets:start -->[\s\S]*?<!-- vpa:assets:end -->\s*', '', text)
    text_without = re.sub(r'<script\b[^>]*\bsrc=[\"\'][^\"\']*annotation-kit/(?:runtime\.js|annotation\.bundle\.inline\.js)[\"\'][^>]*>\s*</script>\s*', '', text_without, flags=re.I)
    text_without = re.sub(r'<link\b[^>]*\bhref=[\"\'][^\"\']*annotation-kit/runtime\.css[\"\'][^>]*>\s*', '', text_without, flags=re.I)
    block = '\n'.join(['<!-- vpa:assets:start -->', STYLE_TAG.format(base=base), INLINE_BUNDLE_TAG.format(base=base), SCRIPT_TAG.format(base=base), '<!-- vpa:assets:end -->']) + '\n'
    if re.search(r'</body\s*>', text_without, re.I):
        updated = re.sub(r'</body\s*>', lambda m: block + m.group(0), text_without, count=1, flags=re.I)
    else:
        updated = block + text_without
    if updated == text:
        return False
    html_path.write_text(updated, encoding='utf-8')
    return True


def default_public_path(target: Path) -> str:
    package = target / 'package.json'
    if package.is_file():
        data = json.loads(package.read_text(encoding='utf-8'))
        deps = {**data.get('dependencies', {}), **data.get('devDependencies', {})}
        if any(key in deps for key in ('vite', 'next', 'nuxt')):
            return 'public/annotation-kit'
    return 'annotation-kit'


def install_compiler(skill_dir: Path, target: Path) -> Path:
    destination = resolve_destination(target, 'tools/annotation')
    destination.mkdir(parents=True, exist_ok=True)
    for name in ('compile_annotations.py', 'check_annotation_assets.py'):
        shutil.copy2(skill_dir / 'scripts' / name, resolve_destination(target, str(destination / name)))
    for name in ('annotation.schema.json', 'annotation.workspace.schema.json'):
        shutil.copy2(skill_dir / 'assets/annotation-kit' / name, resolve_destination(target, str(destination / name)))
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description='Install read-only prototype annotation assets.')
    parser.add_argument('target', help='Target project or static output directory')
    parser.add_argument('--public-path', help='Asset directory inside target; default: public/annotation-kit for Vite/Next/Nuxt projects, otherwise annotation-kit')
    parser.add_argument('--base-href', help='Explicit deployed URL prefix, e.g. /demo/annotation-kit; default computed per HTML file')
    parser.add_argument('--inject', action='store_true')
    parser.add_argument('--html', action='append', default=[], help='HTML path relative to target (or absolute); repeat for multiple entries')
    parser.add_argument('--force-config', action='store_true', help='Explicitly replace configuration template; source Markdown is preserved')
    parser.add_argument('--with-compiler', action='store_true', help='Copy portable compiler, schemas and asset checker to tools/annotation for CI builds')
    args = parser.parse_args()
    skill_dir = Path(__file__).resolve().parents[1]
    target = Path(args.target).resolve()
    if not target.is_dir():
        raise SystemExit(f'Target directory does not exist: {target}')
    public_path = args.public_path or default_public_path(target)
    destination = resolve_destination(target, public_path)
    html_files = [resolve_destination(target, item) for item in (args.html or ['index.html'])] if args.inject else []
    for page in html_files:
        if not page.is_file():
            raise SystemExit(f'HTML entry not found: {page}; SSR projects need layout integration (omit --inject)')
    copy_assets(skill_dir, target, public_path, args.force_config)
    print(f'Installed annotation assets: {destination}')
    if args.with_compiler:
        print(f'Installed portable build tools: {install_compiler(skill_dir, target)}')
    public_dir = target / 'public'
    for page in html_files:
        if args.base_href:
            base = args.base_href
        elif destination.is_relative_to(public_dir):
            base = '/' + destination.relative_to(public_dir).as_posix()
        else:
            base = Path(os.path.relpath(destination, page.parent)).as_posix()
            if not base.startswith('.'):
                base = './' + base
        changed = inject_html(page, base)
        print(f'{"Injected" if changed else "Already present"}: {page}')
    print('Next: replace the example with PRD-derived Markdown, compile annotation.bundle.json, and include the asset directory in the deployment.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(f'Annotation installation failed: {error}') from error
