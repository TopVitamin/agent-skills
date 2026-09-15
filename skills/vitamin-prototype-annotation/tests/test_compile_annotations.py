import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "compile_annotations.py"
SCHEMA = Path(__file__).parents[1] / "assets" / "annotation-kit" / "annotation.schema.json"
SPEC = importlib.util.spec_from_file_location("compile_annotations", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def config(scope: str = "") -> dict:
    return {
        "version": 1,
        "scope": scope,
        "sourceRequirements": [{"id": "REQ-1", "source": "prd.md#rule"}],
        "annotations": [{
            "id": "1",
            "moduleName": "商品列表",
            "target": {"selector": "[data-anno='product-list']"},
            "sourceRefs": ["REQ-1"],
            "markdown": "## 业务规则\n\n- 支持**查询**。",
        }],
    }


class CompilerTests(unittest.TestCase):
    def test_single_config_remains_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "annotation.config.json"
            write_json(path, config("product"))
            bundle, errors, coverage = MODULE.compile_config(path)
            self.assertEqual(errors, [])
            self.assertEqual(bundle["annotations"][0]["key"], "product:1")
            self.assertEqual(coverage[0]["status"], "mapped")

    def test_workspace_allows_same_display_id_in_different_scopes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_json(root / "product.json", config())
            write_json(root / "purchase.json", config())
            workspace = root / "annotation.workspace.json"
            write_json(workspace, {
                "version": 1,
                "inputs": [
                    {"scope": "product", "config": "product.json"},
                    {"scope": "purchase", "config": "purchase.json"},
                ],
            })
            bundle, errors, _, _ = MODULE.compile_workspace(workspace)
            self.assertEqual(errors, [])
            self.assertEqual([item["id"] for item in bundle["annotations"]], ["1", "1"])
            self.assertEqual({item["key"] for item in bundle["annotations"]}, {"product:1", "purchase:1"})

    def test_duplicate_runtime_key_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "annotation.config.json"
            value = config("product")
            duplicate = dict(value["annotations"][0])
            duplicate.update({"id": "2", "key": "product:1"})
            value["annotations"].append(duplicate)
            write_json(path, value)
            _, errors, _ = MODULE.compile_config(path)
            self.assertIn("duplicate annotation key: product:1", "\n".join(errors))

    def test_html_output_renders_markdown(self):
        rendered = MODULE.html_document({
            "title": "标注",
            "annotations": [{
                "id": "1",
                "key": "product:1",
                "scope": "product",
                "moduleName": "商品列表",
                "markdown": "## 业务规则\n\n- 支持**查询**。",
            }],
        })
        self.assertIn("<h2>业务规则</h2>", rendered)
        self.assertIn("<li>支持<strong>查询</strong>。</li>", rendered)
        self.assertNotIn("## 业务规则", rendered)

    def test_runtime_initial_mode_is_preserved_and_declared(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "annotation.config.json"
            value = config("product")
            value["runtime"] = {"initialMode": "annotate"}
            write_json(path, value)
            bundle, errors, _ = MODULE.compile_config(path)
            self.assertEqual(errors, [])
            self.assertEqual(bundle["runtime"]["initialMode"], "annotate")
        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        self.assertEqual(
            schema["properties"]["runtime"]["properties"]["initialMode"]["enum"],
            ["preview", "annotate"],
        )

    def test_table_with_escaped_pipe(self):
        row = MODULE.split_table_row(r"| status | str \| int | 状态 \| 标识 |")
        self.assertEqual(row, ["status", "str | int", "状态 | 标识"])

        markdown = (
            "| 字段 | 类型 | 说明 |\n"
            "| --- | --- | --- |\n"
            "| code | int \\| str | 状态码 \\| 枚举 |\n"
        )
        rendered = MODULE.render_markdown(markdown)
        self.assertIn("<th>字段</th><th>类型</th><th>说明</th>", rendered)
        self.assertIn("<td>code</td><td>int | str</td><td>状态码 | 枚举</td>", rendered)

    def test_h4_heading_and_horizontal_rule_render(self):
        rendered = MODULE.render_markdown("#### 业务定义\n- 规则\n\n---\n\n后续段落")
        self.assertIn("<h4>业务定义</h4>", rendered)
        self.assertIn("<hr>", rendered)
        self.assertNotIn("####", rendered)
        self.assertNotIn("<p>---</p>", rendered)

    def test_mixed_inline_and_file_sources_keep_full_markdown_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "pages").mkdir()
            (root / "pages" / "list.md").write_text(
                "# 商品列表页规格\n\n<!-- anno:start id=1 -->\n### [1] 筛选栏\n- 局部规则\n<!-- anno:end id=1 -->\n",
                encoding="utf-8",
            )
            data = {
                "version": 1,
                "sourceRequirements": [
                    {"id": "REQ-G", "source": "prd.md#global"},
                    {"id": "REQ-1", "source": "prd.md#filter"},
                ],
                "annotations": [
                    {
                        "id": "global",
                        "type": "global",
                        "moduleName": "页面全局规则",
                        "sourceRefs": ["REQ-G"],
                        "markdown": "## 页面全局规则\n- 内联全局规则内容",
                    },
                    {
                        "id": "1",
                        "moduleName": "筛选栏",
                        "target": {"selector": "[data-anno='filter']"},
                        "sourceRefs": ["REQ-1"],
                        "markdownFile": "pages/list.md",
                        "blockId": "1",
                    },
                ],
            }
            write_json(root / "annotation.config.json", data)
            bundle, errors, _ = MODULE.compile_config(root / "annotation.config.json")
            self.assertEqual(errors, [])
            self.assertIn("内联全局规则内容", bundle["fullMarkdown"])
            self.assertIn("商品列表页规格", bundle["fullMarkdown"])

    def test_multiple_shared_rules_for_same_page_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            data = {
                "version": 1,
                "sourceRequirements": [
                    {"id": "REQ-G", "source": "prd.md#global"},
                ],
                "annotations": [
                    {"id": "global", "type": "global", "moduleName": "全局一", "sourceRefs": ["REQ-G"], "markdown": "- a"},
                    {"id": "global-2", "type": "global", "moduleName": "全局二", "sourceRefs": ["REQ-G"], "markdown": "- b"},
                ],
            }
            path = Path(directory) / "annotation.config.json"
            write_json(path, data)
            _, errors, _ = MODULE.compile_config(path)
            self.assertEqual(errors, [])

    def test_global_rule_compilation_and_full_markdown(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "annotation.config.json"
            data = {
                "version": 1,
                "scope": "demo",
                "sourceRequirements": [
                    {"id": "REQ-G", "source": "prd.md#global"},
                    {"id": "REQ-1", "source": "prd.md#btn"},
                ],
                "annotations": [
                    {
                        "id": "1",
                        "moduleName": "提交按钮",
                        "target": {"selector": "#submit-btn"},
                        "sourceRefs": ["REQ-1"],
                        "markdown": "## 按钮规则\n- 点击提交。",
                    },
                    {
                        "id": "global",
                        "type": "global",
                        "moduleName": "全局准入规则",
                        "sourceRefs": ["REQ-G"],
                        "markdown": "## 全局规则\n- 编辑模式只读。",
                    },
                ],
            }
            write_json(path, data)
            bundle, errors, _ = MODULE.compile_config(path)
            self.assertEqual(errors, [])
            self.assertEqual(len(bundle["annotations"]), 2)
            # 全局规则自动置顶
            self.assertEqual(bundle["annotations"][0]["id"], "global")
            self.assertTrue(bundle["annotations"][0]["isGlobal"])
            self.assertEqual(bundle["annotations"][1]["id"], "1")
            self.assertFalse(bundle["annotations"][1]["isGlobal"])
            self.assertIn("全局规则", bundle["fullMarkdown"])
            html_doc = MODULE.html_document(bundle)
            self.assertIn("[全局规则] 全局准入规则", html_doc)


if __name__ == "__main__":
    unittest.main()
