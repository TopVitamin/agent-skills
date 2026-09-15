#!/usr/bin/env python3
"""Check the files that must ship together; no network or third-party dependencies."""
import argparse
import json
from pathlib import Path


def check_assets(directory: Path) -> dict:
    for name in ('runtime.js', 'runtime.css', 'annotation.bundle.json', 'annotation.bundle.inline.js'):
        path = directory / name
        if not path.is_file() or not path.stat().st_size:
            raise ValueError(f'Missing or empty deployment asset: {path}')
    bundle = json.loads((directory / 'annotation.bundle.json').read_text(encoding='utf-8'))
    if not isinstance(bundle.get('annotations'), list) or not bundle['annotations']:
        raise ValueError('Bundle has no annotations')
    inline = (directory / 'annotation.bundle.inline.js').read_text(encoding='utf-8').strip()
    prefix = 'window.__VITAMIN_ANNOTATION_CONFIG__ = '
    if not inline.startswith(prefix) or not inline.endswith(';'):
        raise ValueError('Invalid inline bundle')
    if json.loads(inline[len(prefix):-1]) != bundle:
        raise ValueError('JSON and inline bundle differ; compile and publish them together')
    if any(a.get('markdownFile') for a in bundle['annotations']):
        raise ValueError('Bundle still references source Markdown; compile it before publishing')
    if not bundle.get('fullMarkdown'):
        raise ValueError('Bundle is missing the complete Markdown export')
    return {'annotations': len(bundle['annotations']), 'buildId': bundle.get('buildId'), 'coverage': bundle.get('coverage')}


def main():
    parser = argparse.ArgumentParser(description='Validate deployable annotation assets (not DOM mounting or remote hosting).')
    parser.add_argument('directory', help='Built annotation-kit directory, e.g. dist/annotation-kit')
    args = parser.parse_args()
    result = check_assets(Path(args.directory).resolve())
    print('Deployment assets valid: ' + json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        raise SystemExit(f'Annotation assets invalid: {error}') from error
