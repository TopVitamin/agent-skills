import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "install_annotation_kit.py"
SPEC = importlib.util.spec_from_file_location("install_annotation_kit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

SKILL_DIR = Path(__file__).parents[1]


class InstallTests(unittest.TestCase):
    def test_copy_assets_copies_runtime_and_preserves_existing_config(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory).resolve()
            destination = MODULE.copy_assets(SKILL_DIR, target, "annotation-kit", False)
            self.assertTrue((destination / "runtime.js").exists())
            self.assertTrue((destination / "runtime.css").exists())
            self.assertTrue((destination / "annotation.config.json").exists())

            (destination / "annotation.config.json").write_text('{"marker": true}', encoding="utf-8")
            MODULE.copy_assets(SKILL_DIR, target, "annotation-kit", False)
            self.assertIn("marker", (destination / "annotation.config.json").read_text(encoding="utf-8"))

            MODULE.copy_assets(SKILL_DIR, target, "annotation-kit", True)
            self.assertNotIn("marker", (destination / "annotation.config.json").read_text(encoding="utf-8"))

    def test_inject_html_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            page = Path(directory) / "index.html"
            page.write_text("<html><head><title>t</title></head><body><div>app</div></body></html>", encoding="utf-8")
            self.assertTrue(MODULE.inject_html(page, "./annotation-kit"))
            text = page.read_text(encoding="utf-8")
            self.assertIn('<link rel="stylesheet" href="./annotation-kit/runtime.css">', text)
            self.assertIn('<script src="./annotation-kit/annotation.bundle.inline.js"></script>', text)
            self.assertIn('<script src="./annotation-kit/runtime.js"></script>', text)
            self.assertEqual(text.count("runtime.css"), 1)
            self.assertFalse(MODULE.inject_html(page, "./annotation-kit"))

    def test_inject_html_without_head_and_body(self):
        with tempfile.TemporaryDirectory() as directory:
            page = Path(directory) / "fragment.html"
            page.write_text("<div>app</div>", encoding="utf-8")
            self.assertTrue(MODULE.inject_html(page, "./annotation-kit"))
            text = page.read_text(encoding="utf-8")
            self.assertTrue(text.startswith('<!-- vpa:assets:start -->'))
            self.assertIn('<script src="./annotation-kit/annotation.bundle.inline.js"></script>', text)
            self.assertIn('<script src="./annotation-kit/runtime.js"></script>', text)

    def test_resolve_destination_rejects_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(SystemExit):
                MODULE.resolve_destination(Path(directory).resolve(), "../outside")


if __name__ == "__main__":
    unittest.main()
