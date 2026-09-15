import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module
compiler, installer, checker = (load(name) for name in ('compile_annotations', 'install_annotation_kit', 'check_annotation_assets'))


class RegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.addCleanup(self.temp.cleanup)

    def compile(self, data, check_sources=False):
        path = self.root / 'config.json'; path.write_text(json.dumps(data))
        return compiler.compile_config(path, check_sources=check_sources)

    def annotation(self, **kwargs):
        return {'id': 'one', 'type': 'element', 'moduleName': '区域', 'target': {'selector': '#one'}, 'markdown': '- rule', **kwargs}

    def test_invalid_schema_rejected(self):
        for data in ({}, {'version': 1, 'annotations': []}, {'version': 1, 'annotations': [self.annotation(type='typo')]}, {'version': 1, 'annotations': [self.annotation(viewScope='list')]}, {'version': 1, 'runtime': {'layout': 'invalid'}, 'annotations': [self.annotation()]}):
            with self.subTest(data=data):
                self.assertTrue(self.compile(data)[1])

    def test_path_only_page_global(self):
        bundle, errors, _ = self.compile({'version': 1, 'annotations': [self.annotation(type='page-global', page='/orders', target={})]})
        self.assertEqual(errors, []); self.assertTrue(bundle['annotations'][0]['isPageGlobal'])

    def test_missing_requirement_source_is_optional_but_checkable(self):
        data = {'version': 1, 'sourceRequirements': [{'id': 'REQ', 'source': 'prd.md#rule'}], 'annotations': [self.annotation(sourceRefs=['REQ'])]}
        self.assertEqual(self.compile(data)[1], [])
        self.assertIn('source file not found', '\n'.join(self.compile(data, True)[1]))
        (self.root / 'prd.md').write_text('# rule')
        self.assertEqual(self.compile(data, True)[1], [])

    def test_block_structure_and_exact_ids(self):
        text = '<!-- anno:start id=10 -->\nten\n<!-- anno:end id=10 -->\n<!-- anno:start id=1 -->\none\n<!-- anno:end id=1 -->'
        self.assertEqual(compiler.extract_block(text, '1'), 'one')
        for invalid in [text + '\n<!-- anno:start id=1 -->\nagain\n<!-- anno:end id=1 -->', '<!-- anno:start id=1 -->\nx', '<!-- anno:start id=1 -->\n<!-- anno:end id=2 -->', '<!-- anno:start id=1 -->\n<!-- anno:start id=2 -->']:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError): compiler.parse_blocks(invalid)

    def test_legacy_and_fenced_markers(self):
        self.assertEqual(compiler.extract_block('<!-- anno:id=1 -->\none\n<!-- anno:id=2 -->\ntwo', '1'), 'one')
        text = '```md\n<!-- anno:start id=1 -->\n```\n<!-- anno:start id=1 -->\nreal\n<!-- anno:end id=1 -->'
        self.assertEqual(compiler.extract_block(text, '1'), 'real')

    def test_duplicate_file_block_fails_all_references_cleanly(self):
        (self.root / 'page.md').write_text('<!-- anno:start id=1 -->\nx\n<!-- anno:start id=2 -->')
        data = {'version': 1, 'annotations': [self.annotation(id='1', markdownFile='page.md'), self.annotation(id='2', markdownFile='page.md')]}
        self.assertEqual(len(self.compile(data)[1]), 2)

    def test_coverage_is_mapping_not_mounting(self):
        text = compiler.coverage_markdown([{'scope': '', 'id': 'R', 'source': 'prd.md', 'page': '/', 'annotations': ['1'], 'status': 'mapped'}])
        self.assertIn('已映射', text); self.assertNotIn('已挂载', text)

    def test_html_rejects_script_links(self):
        self.assertNotIn('href="javascript:', compiler.render_inline('[bad](javascript:alert)'))
        self.assertIn('href="https:', compiler.render_inline('[ok](https://example.com)'))

    def test_template_can_compile_and_checker_detects_stale_inline(self):
        destination = installer.copy_assets(ROOT, self.root, 'annotation-kit', False)
        installer.install_compiler(ROOT, self.root)
        subprocess.run([sys.executable, str(self.root / 'tools/annotation/compile_annotations.py'), str(destination / 'annotation.config.json')], check=True, capture_output=True)
        result = checker.check_assets(destination)
        self.assertEqual(result['annotations'], 2); self.assertTrue(result['buildId'])
        bundle_path = destination / 'annotation.bundle.json'; bundle = json.loads(bundle_path.read_text()); bundle['title'] = 'new'; bundle_path.write_text(json.dumps(bundle))
        with self.assertRaisesRegex(ValueError, 'differ'): checker.check_assets(destination)

    def test_no_output_on_failed_compilation(self):
        output = self.root / 'annotation.bundle.json'; output.write_text('previous')
        config = self.root / 'config.json'; config.write_text('{}')
        run = subprocess.run([sys.executable, str(ROOT / 'scripts/compile_annotations.py'), str(config), '--output', str(output)], capture_output=True)
        self.assertNotEqual(run.returncode, 0); self.assertEqual(output.read_text(), 'previous')

    def test_inject_preserves_unrelated_scripts_and_updates_base(self):
        page = self.root / 'index.html'; page.write_text('<HTML><BODY><script src="/host/runtime.js"></script><script type="module" src="./annotation-kit/runtime.js"></script></BODY></HTML>')
        installer.inject_html(page, '/demo/annotation-kit')
        self.assertIn('/host/runtime.js', page.read_text()); self.assertNotIn('type="module"', page.read_text())
        installer.inject_html(page, '/new/annotation-kit')
        self.assertNotIn('/demo/', page.read_text()); self.assertEqual(page.read_text().count('/new/annotation-kit/runtime.js'), 1)
        self.assertFalse(installer.inject_html(page, '/new/annotation-kit'))

    def test_relative_html_paths_are_relative_to_target(self):
        (self.root / 'pages').mkdir(); page = self.root / 'pages/中文.html'; page.write_text('<body>host</body>')
        run = subprocess.run([sys.executable, str(ROOT / 'scripts/install_annotation_kit.py'), str(self.root), '--inject', '--html', 'pages/中文.html'], cwd='/tmp', capture_output=True)
        self.assertEqual(run.returncode, 0, run.stderr); self.assertIn('../annotation-kit/runtime.js', page.read_text())

    def test_public_detection_uses_framework_not_arbitrary_folder(self):
        (self.root / 'public').mkdir()
        self.assertEqual(installer.default_public_path(self.root), 'annotation-kit')
        (self.root / 'package.json').write_text('{"devDependencies":{"vite":"example"}}')
        self.assertEqual(installer.default_public_path(self.root), 'public/annotation-kit')

    def test_workspace_order_preserves_full_export_and_shared_rules(self):
        for name in ('first', 'second'):
            (self.root / (name + '.json')).write_text(json.dumps({'version': 1, 'annotations': [self.annotation(type='global', markdown=name)]}))
        workspace = self.root / 'workspace.json'
        workspace.write_text(json.dumps({'version': 1, 'inputs': [{'scope': 'second', 'config': 'second.json', 'order': 2}, {'scope': 'first', 'config': 'first.json', 'order': 1}]}))
        bundle, errors, _, _ = compiler.compile_workspace(workspace)
        self.assertEqual(errors, [])
        self.assertEqual([a['scope'] for a in bundle['annotations']], ['first', 'second'])
        self.assertLess(bundle['fullMarkdown'].index('first'), bundle['fullMarkdown'].index('second'))

    def test_config_and_markdown_preserved_and_symlink_escape_rejected(self):
        dest = installer.copy_assets(ROOT, self.root, 'annotation-kit', False)
        source = dest / 'annotation.example.md'; source.write_text('user content')
        installer.copy_assets(ROOT, self.root, 'annotation-kit', True)
        self.assertEqual(source.read_text(), 'user content')
        with tempfile.TemporaryDirectory() as external:
            (dest / 'runtime.js').unlink(); (dest / 'runtime.js').symlink_to(Path(external) / 'runtime.js')
            with self.assertRaises(SystemExit): installer.copy_assets(ROOT, self.root, 'annotation-kit', False)


if __name__ == '__main__': unittest.main()
