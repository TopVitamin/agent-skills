#!/usr/bin/env python3
import argparse
import html
import hashlib
import math
from urllib.parse import urlsplit, unquote
import json
import re
from pathlib import Path
from typing import Optional


SCOPE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def validate_schema(value, schema: dict, label: str = "$", errors=None) -> list[str]:
    """Validate the keywords used by the bundled schemas without third-party packages."""
    errors = [] if errors is None else errors
    if "oneOf" in schema:
        if sum(not validate_schema(value, option, label) for option in schema["oneOf"]) != 1:
            errors.append(f"{label}: must match exactly one supported shape")
        return errors
    types = schema.get("type", [])
    types = [types] if isinstance(types, str) else types
    matches = {
        "object": isinstance(value, dict), "array": isinstance(value, list),
        "string": isinstance(value, str), "integer": type(value) is int,
        "number": type(value) in (int, float) and math.isfinite(value), "boolean": type(value) is bool,
    }
    if types and not any(matches.get(kind, False) for kind in types):
        errors.append(f"{label}: expected {' or '.join(types)}")
        return errors
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{label}: expected one of {schema['enum']}")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{label}: missing {key}")
        for key, child in value.items():
            child_schema = schema.get("properties", {}).get(key, schema.get("additionalProperties", {}))
            if isinstance(child_schema, dict):
                validate_schema(child, child_schema, f"{label}.{key}", errors)
    elif isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{label}: requires at least {schema['minItems']} item(s)")
        for index, child in enumerate(value):
            validate_schema(child, schema.get("items", {}), f"{label}[{index}]", errors)
    elif isinstance(value, str):
        if len(value.strip()) < schema.get("minLength", 0):
            errors.append(f"{label}: must not be empty")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{label}: invalid format")
    elif type(value) in (int, float):
        if not math.isfinite(value) or value < schema.get("minimum", -math.inf) or value > schema.get("maximum", math.inf):
            errors.append(f"{label}: number outside supported range")
    return errors


def validate_document(document, schema_name: str, path: Path) -> list[str]:
    script_dir = Path(__file__).resolve().parent
    schema_path = script_dir / schema_name  # Project-local compiler installation.
    if not schema_path.exists():
        schema_path = script_dir.parent / "assets" / "annotation-kit" / schema_name
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    return validate_schema(document, schema, str(path))


MARKER = re.compile(r"^\s*<!--\s*anno:(start\s+id|end\s+id|id)\s*=\s*(?:\"([^\"]+)\"|'([^']+)'|([^\s>]+))[^>]*-->\s*$", re.I)


def parse_blocks(markdown: str) -> dict[str, str]:
    blocks, active, lines, legacy, fence = {}, None, [], False, None
    def finish():
        if active in blocks:
            raise ValueError(f"duplicate Markdown block id: {active}")
        blocks[active] = "\n".join(lines).strip()
    for number, line in enumerate(markdown.splitlines(), 1):
        fence_match = re.match(r"^\s*(`{3,}|~{3,})", line)
        if fence_match:
            token = fence_match.group(1)
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
            if active is not None:
                lines.append(line)
            continue
        match = MARKER.match(line) if fence is None else None
        if not match:
            if active is not None:
                lines.append(line)
            continue
        kind = match.group(1).lower().split()[0]
        block_id = next(value for value in match.groups()[1:] if value is not None)
        if kind == "end":
            if active != block_id or legacy:
                raise ValueError(f"line {number}: unmatched anno:end id={block_id}")
            finish(); active, lines = None, []
        else:
            if active is not None:
                if not legacy:
                    raise ValueError(f"line {number}: nested or unclosed block {active}")
                finish()
            if block_id in blocks:
                raise ValueError(f"duplicate Markdown block id: {block_id}")
            active, lines, legacy = block_id, [], kind == "id"
    if active is not None:
        if not legacy:
            raise ValueError(f"unclosed Markdown block id: {active}")
        finish()
    return blocks


def extract_block(markdown: str, block_id: str) -> str:
    return parse_blocks(markdown).get(str(block_id), "")


def resolve_source(config_path: Path, config: dict, markdown_file: str) -> Path:
    source_base = (config_path.parent / config.get("sourceBase", ".")).resolve()
    source_path = (source_base / markdown_file).resolve()
    try:
        source_path.relative_to(source_base)
    except ValueError as error:
        raise ValueError(f"markdownFile escapes sourceBase: {markdown_file}") from error
    return source_path


def compile_config(config_path: Path, allow_unmapped: bool = False, scope_override: str = "", check_sources: bool = False) -> tuple[dict, list[str], list[dict]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    errors = validate_document(config, "annotation.schema.json", config_path)
    if errors:
        return {"annotations": [], "coverage": coverage_summary([])}, errors, []
    scope = scope_override or str(config.get("scope", "")).strip()
    if scope and not SCOPE_PATTERN.fullmatch(scope):
        errors.append(f"invalid scope '{scope}' in {config_path}; use lowercase kebab-case")

    compiled = []
    seen_ids = set()
    seen_keys = set()
    requirements = {}
    annotation_sources = {}
    for item in config.get("sourceRequirements", []):
        requirement_id = str(item.get("id", "")).strip()
        if not requirement_id:
            errors.append(f"{config_path}: source requirement is missing id")
        elif requirement_id in requirements:
            errors.append(f"{config_path}: duplicate source requirement id: {requirement_id}")
        else:
            requirements[requirement_id] = item
            if check_sources:
                source = item["source"].split("#", 1)[0]
                if not urlsplit(source).scheme:
                    source_path = (config_path.parent / config.get("sourceBase", ".") / unquote(source)).resolve()
                    if not source or not source_path.is_file():
                        errors.append(f"source requirement {requirement_id}: source file not found: {source}")
    mapped_requirements = set()

    source_documents = {}
    source_blocks = {}
    for index, item in enumerate(config.get("annotations", [])):
        annotation = dict(item)
        annotation_id = str(annotation.get("id", "")).strip()
        if not annotation_id:
            errors.append(f"{config_path}: annotations[{index}] is missing id")
            continue
        if annotation_id in seen_ids:
            errors.append(f"{config_path}: duplicate annotation id: {annotation_id}")
            continue
        seen_ids.add(annotation_id)

        target = annotation.get("target") or {}
        selector = target.get("selector", "").strip() if isinstance(target, dict) else ""
        annotation_type = str(annotation.get("type", "") or "").strip()
        if annotation_type == "page-global":
            annotation["isPageGlobal"] = True
            annotation["type"] = "page-global"
            annotation["isGlobal"] = False
        elif (
            annotation_type == "global"
            or (isinstance(target, dict) and target.get("type") == "global")
            or (not selector and annotation_type != "element")
        ):
            annotation["isGlobal"] = True
            annotation["type"] = "global"
            if not target:
                annotation["target"] = {"type": "global"}
        else:
            annotation["isGlobal"] = False
            annotation["type"] = "element"
            if not selector:
                errors.append(f"{config_path}: annotation {annotation_id} is missing target.selector")

        markdown = annotation.get("markdown", "")
        markdown_file = annotation.get("markdownFile", "").strip()
        if markdown_file:
            try:
                source_path = resolve_source(config_path, config, markdown_file)
                if not source_path.exists():
                    errors.append(f"annotation {annotation_id} markdown file not found: {source_path}")
                else:
                    if str(source_path) not in source_blocks:
                        source_documents[str(source_path)] = source_path.read_text(encoding="utf-8")
                        source_blocks[str(source_path)] = parse_blocks(source_documents[str(source_path)])
                    annotation_sources[annotation_id] = str(source_path)
                    markdown = source_blocks[str(source_path)].get(str(annotation.get("blockId", annotation_id)), "")
                    if not markdown:
                        errors.append(f"annotation {annotation_id} block not found in {source_path}")
            except ValueError as error:
                errors.append(f"annotation {annotation_id}: {error}")
        if not str(markdown).strip():
            errors.append(f"annotation {annotation_id} has no Markdown content")

        source_refs = [str(ref) for ref in annotation.get("sourceRefs", [])]
        for ref in source_refs:
            mapped_requirements.add(ref)
            if ref not in requirements:
                errors.append(f"annotation {annotation_id} references unknown requirement: {ref}")

        annotation_key = str(annotation.get("key") or (f"{scope}:{annotation_id}" if scope else annotation_id))
        if annotation_key == "__vpa_page_rules__":
            errors.append("annotation key is reserved: __vpa_page_rules__")
        if annotation_key in seen_keys:
            errors.append(f"{config_path}: duplicate annotation key: {annotation_key}")
            continue
        seen_keys.add(annotation_key)
        annotation["id"] = annotation_id
        annotation["key"] = annotation_key
        annotation["scope"] = scope
        annotation["markdown"] = markdown
        annotation.pop("markdownFile", None)
        annotation.pop("blockId", None)
        compiled.append(annotation)

    compiled.sort(key=lambda item: (
        str(item.get("page", "")),
        0 if item.get("isPageGlobal") else (1 if item.get("isGlobal") else 2),
        item.get("order", 999999),
        str(item["id"])
    ))
    coverage = []
    for requirement_id, requirement in requirements.items():
        coverage.append({
            "id": requirement_id,
            "key": f"{scope}:{requirement_id}" if scope else requirement_id,
            "scope": scope,
            "source": requirement.get("source", ""),
            "page": requirement.get("page", ""),
            "status": "mapped" if requirement_id in mapped_requirements else "unmapped",
            "annotations": [item["key"] for item in compiled if requirement_id in item.get("sourceRefs", [])],
        })
    if not allow_unmapped:
        errors.extend(f"unmapped source requirement: {item['key']}" for item in coverage if item["status"] == "unmapped")

    full_markdown_parts = []
    emitted_documents = set()
    for ann in compiled:
        source_path = annotation_sources.get(str(ann["id"]))
        if source_path:
            if source_path not in emitted_documents:
                emitted_documents.add(source_path)
                full_markdown_parts.append(str(source_documents[source_path]).strip())
        elif str(ann.get("markdown", "")).strip():
            full_markdown_parts.append(f"### [{ann['id']}] {ann.get('moduleName', '')}\n\n{ann['markdown']}")
    full_markdown = "\n\n---\n\n".join(part for part in full_markdown_parts if part.strip())

    bundle = {
        "version": config.get("version", 1),
        "title": config.get("title", "Prototype Annotations"),
        "mermaid": config.get("mermaid", {}),
        "runtime": config.get("runtime", {}),
        "annotations": compiled,
        "fullMarkdown": full_markdown,
        "coverage": coverage_summary(coverage),
    }
    return bundle, errors, coverage


def coverage_summary(coverage: list[dict]) -> dict:
    return {
        "total": len(coverage),
        "mapped": sum(item["status"] == "mapped" for item in coverage),
        "unmapped": sum(item["status"] == "unmapped" for item in coverage),
    }


def resolve_workspace_input(workspace_path: Path, item) -> tuple[Path, str, int]:
    if isinstance(item, str):
        relative_path, scope, order = item, "", 999999
    else:
        relative_path = item.get("config", "")
        scope = str(item.get("scope", "")).strip()
        order = item.get("order", 999999)
    if not relative_path:
        raise ValueError("workspace input is missing config")
    config_path = (workspace_path.parent / relative_path).resolve()
    if not config_path.exists():
        raise ValueError(f"workspace config not found: {config_path}")
    return config_path, scope, order


def compile_workspace(workspace_path: Path, allow_unmapped: bool = False, check_sources: bool = False) -> tuple[dict, list[str], list[dict], dict]:
    workspace = json.loads(workspace_path.read_text(encoding="utf-8"))
    errors = validate_document(workspace, "annotation.workspace.schema.json", workspace_path)
    if errors:
        return {"annotations": [], "coverage": coverage_summary([])}, errors, [], workspace
    annotations = []
    coverage = []
    seen_keys = set()

    full_markdown_list = []
    for item in sorted(workspace.get("inputs", []), key=lambda value: value.get("order", 999999) if isinstance(value, dict) else 999999):
        try:
            config_path, scope, workspace_order = resolve_workspace_input(workspace_path, item)
        except ValueError as error:
            errors.append(str(error))
            continue
        bundle, config_errors, config_coverage = compile_config(config_path, allow_unmapped, scope, check_sources)
        errors.extend(config_errors)
        if bundle.get("fullMarkdown"):
            full_markdown_list.append(bundle["fullMarkdown"])
        for annotation in bundle["annotations"]:
            key = annotation["key"]
            if key in seen_keys:
                errors.append(f"duplicate annotation key across workspace: {key}")
                continue
            seen_keys.add(key)
            annotation["workspaceOrder"] = workspace_order
            annotations.append(annotation)
        coverage.extend(config_coverage)

    if not workspace.get("inputs"):
        errors.append("workspace has no inputs")

    annotations.sort(key=lambda item: (
        item.get("workspaceOrder", 999999),
        str(item.get("page", "")),
        0 if item.get("isGlobal") else 1,
        item.get("order", 999999),
        str(item.get("id", "")),
    ))

    full_markdown = "\n\n---\n\n".join([text for text in full_markdown_list if text.strip()])

    bundle = {
        "version": workspace.get("version", 1),
        "title": workspace.get("title", "Prototype Annotations"),
        "mermaid": workspace.get("mermaid", {}),
        "runtime": workspace.get("runtime", {}),
        "annotations": annotations,
        "fullMarkdown": full_markdown,
        "coverage": coverage_summary(coverage),
    }
    return bundle, errors, coverage, workspace


def write_inline_bundle(output_path: Path, bundle: dict) -> Path:
    inline_path = output_path.with_name("annotation.bundle.inline.js")
    inline_path.write_text(
        "window.__VITAMIN_ANNOTATION_CONFIG__ = "
        + json.dumps(bundle, ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )
    return inline_path


def coverage_markdown(coverage: list[dict]) -> str:
    lines = [
        "# 页面标注需求映射矩阵",
        "",
        "> 仅统计已声明需求 ID 的映射，不证明 PRD 完整性、来源有效性或 DOM 挂载成功。",
        "",
        "| 模块 | 来源需求 | 来源位置 | 页面 | 标注Key | 状态 |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for item in coverage:
        annotations = ", ".join(f"`{value}`" for value in item["annotations"]) or "-"
        status = "已映射" if item["status"] == "mapped" else "未映射"
        lines.append(f"| {item['scope'] or '-'} | `{item['id']}` | {item['source']} | {item['page']} | {annotations} | {status} |")
    return "\n".join(lines) + "\n"


def safe_url(value: str, image: bool = False) -> bool:
    protocol = urlsplit(html.unescape(value)).scheme.lower()
    return protocol in ("", "http", "https") or (protocol == "mailto" and not image)


def render_inline(value: str) -> str:
    rendered = html.escape(value)
    rendered = re.sub(r"`([^`]+)`", r"<code>\1</code>", rendered)
    rendered = re.sub(
        r"!\[([^\]]*)\]\(([^)]+)\)",
        lambda m: f'<img src="{m[2]}" alt="{m[1]}" style="max-width:100%">' if safe_url(m[2], True) else m[1],
        rendered,
    )
    rendered = re.sub(
        r"(?<!\!)\[([^\]]+)\]\(([^)]+)\)",
        lambda m: f'<a href="{m[2]}" target="_blank" rel="noopener noreferrer">{m[1]}</a>' if safe_url(m[2]) else m[1],
        rendered,
    )
    rendered = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", rendered)
    return re.sub(r"\*([^*]+)\*", r"<em>\1</em>", rendered)


def render_list(items: list[dict]) -> str:
    root = []
    stack = [(-1, root)]
    for item in items:
        while len(stack) > 1 and stack[-1][0] >= item["depth"]:
            stack.pop()
        node = {**item, "children": []}
        stack[-1][1].append(node)
        stack.append((item["depth"], node["children"]))

    def render_children(children: list[dict]) -> str:
        result = []
        index = 0
        while index < len(children):
            list_type = children[index]["type"]
            group = []
            while index < len(children) and children[index]["type"] == list_type:
                group.append(children[index])
                index += 1
            rows = []
            for item in group:
                nested = render_children(item["children"]) if item["children"] else ""
                rows.append(f"<li>{render_inline(item['text'])}{nested}</li>")
            result.append(f"<{list_type}>{''.join(rows)}</{list_type}>")
        return "".join(result)

    return render_children(root)


def split_table_row(line: str) -> list[str]:
    content = line.strip()
    if content.startswith("|"):
        content = content[1:]
    content = re.sub(r"(?<!\\)\|$", "", content)
    cells = re.split(r"(?<!\\)\|", content)
    return [cell.replace(r"\|", "|").strip() for cell in cells]


def render_markdown(markdown: str) -> str:
    normalized = str(markdown or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.splitlines()
    output = []
    list_items = []

    def flush_list() -> None:
        if list_items:
            output.append(render_list(list_items))
            list_items.clear()

    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped or stripped.startswith("<!--"):
            flush_list()
            index += 1
            continue
        if stripped.startswith("```"):
            flush_list()
            language = stripped[3:].strip().lower()
            code_lines = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(lines[index])
                index += 1
            class_name = ' class="language-mermaid"' if language == "mermaid" else ""
            output.append(f"<pre><code{class_name}>{html.escape(chr(10).join(code_lines))}</code></pre>")
            index += 1
            continue
        if re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", stripped):
            flush_list()
            output.append("<hr>")
            index += 1
            continue
        if "|" in stripped and index + 1 < len(lines):
            separator = split_table_row(lines[index + 1])
            if len(separator) > 1 and all(re.fullmatch(r":?-{3,}:?", cell) for cell in separator):
                flush_list()
                headers = split_table_row(stripped)
                rows = []
                index += 2
                while index < len(lines) and "|" in lines[index]:
                    rows.append(split_table_row(lines[index]))
                    index += 1
                head = "".join(f"<th>{render_inline(cell)}</th>" for cell in headers)
                body = "".join(
                    "<tr>" + "".join(f"<td>{render_inline(row[pos] if pos < len(row) else '')}</td>" for pos in range(len(headers))) + "</tr>"
                    for row in rows
                )
                output.append(f"<div class=\"table-wrap\"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>")
                continue
        heading = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading:
            flush_list()
            level = len(heading.group(1))
            output.append(f"<h{level}>{render_inline(heading.group(2))}</h{level}>")
            index += 1
            continue
        if stripped.startswith("> "):
            flush_list()
            output.append(f"<blockquote>{render_inline(stripped[2:])}</blockquote>")
            index += 1
            continue
        list_match = re.match(r"^(\s*)([-+*]|\d+\.)\s+(.+)$", line)
        if list_match:
            indent = len(list_match.group(1).replace("\t", "  "))
            list_items.append({
                "depth": indent // 2,
                "type": "ol" if list_match.group(2)[0].isdigit() else "ul",
                "text": list_match.group(3),
            })
            index += 1
            continue
        flush_list()
        output.append(f"<p>{render_inline(stripped)}</p>")
        index += 1
    flush_list()
    return "".join(output)


def html_document(bundle: dict) -> str:
    sections = []
    for annotation in bundle["annotations"]:
        export_id = annotation.get("key") if annotation.get("scope") else annotation["id"]
        badge_label = "[本页规则]" if annotation.get("isPageGlobal") else "[全局规则]" if annotation.get("isGlobal") else f"[{export_id}]"
        title = html.escape(f"{badge_label} {annotation.get('moduleName', '')}")
        rendered_markdown = render_markdown(annotation.get("markdown", ""))
        scope = html.escape(annotation.get("scope", ""))
        sections.append(f'<section><header><h2>{title}</h2><span class="scope">{scope}</span></header><article>{rendered_markdown}</article></section>')
    return """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>
body{{max-width:960px;margin:0 auto;padding:32px;font:14px/1.6 system-ui;color:#1f2937}}section{{padding:24px 0;border-bottom:1px solid #e5e7eb}}
header{{display:flex;align-items:center;gap:12px}}h1,h2,h3{{color:#111827}}.scope{{color:#64748b}}article p{{margin:0 0 12px}}
blockquote{{margin:12px 0;padding-left:12px;border-left:3px solid #cbd5e1;color:#475569}}pre{{padding:16px;overflow:auto;background:#f8fafc;border:1px solid #e5e7eb;white-space:pre-wrap}}
code{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}}.table-wrap{{overflow:auto}}table{{width:100%;border-collapse:collapse}}th,td{{padding:8px;border:1px solid #dbe2ea;text-align:left;vertical-align:top}}
</style></head><body><h1>{title}</h1>{sections}</body></html>
""".format(title=html.escape(bundle.get("title", "Prototype Annotations")), sections="".join(sections))


def resolve_optional_path(cli_value: str, document: dict, key: str, source_path: Path, default_name: str = "") -> Optional[Path]:
    if cli_value:
        return Path(cli_value).resolve()
    configured = document.get(key, "")
    if configured:
        return (source_path.parent / configured).resolve()
    return source_path.with_name(default_name) if default_name else None


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and compile annotation configs or a multi-module workspace.")
    parser.add_argument("source", help="annotation.config.json or annotation.workspace.json")
    parser.add_argument("--output", help="Output annotation.bundle.json. Workspace/config value is used when omitted.")
    parser.add_argument("--coverage", help="Optional coverage.md output path.")
    parser.add_argument("--html-output", help="Optional standalone rendered HTML output path.")
    parser.add_argument("--check", action="store_true", help="Validate only; do not write outputs.")
    parser.add_argument("--check-sources", action="store_true", help="Also verify local requirement source files exist; section accuracy still requires review.")
    parser.add_argument("--allow-unmapped", action="store_true", help="Allow source requirements without an annotation mapping.")
    args = parser.parse_args()

    source_path = Path(args.source).resolve()
    if not source_path.exists():
        raise SystemExit(f"Source does not exist: {source_path}")
    source_document = json.loads(source_path.read_text(encoding="utf-8"))
    if "inputs" in source_document:
        bundle, errors, coverage, source_document = compile_workspace(source_path, args.allow_unmapped, args.check_sources)
    else:
        bundle, errors, coverage = compile_config(source_path, args.allow_unmapped, check_sources=args.check_sources)
    if errors:
        raise SystemExit("Annotation compile failed:\n- " + "\n- ".join(errors))
    if args.check:
        print(f"Valid: {len(bundle['annotations'])} annotations, {len(coverage)} source requirements")
        return

    bundle["buildId"] = hashlib.sha256(json.dumps(bundle, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:16]
    output_path = resolve_optional_path(args.output, source_document, "output", source_path, "annotation.bundle.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Compiled annotation bundle: {output_path}")
    inline_path = write_inline_bundle(output_path, bundle)
    print(f"Wrote file:// inline bundle: {inline_path}")

    coverage_path = resolve_optional_path(args.coverage, source_document, "coverage", source_path)
    if coverage_path:
        coverage_path.parent.mkdir(parents=True, exist_ok=True)
        coverage_path.write_text(coverage_markdown(coverage), encoding="utf-8")
        print(f"Wrote coverage matrix: {coverage_path}")

    html_path = resolve_optional_path(args.html_output, source_document, "htmlOutput", source_path)
    if html_path:
        html_path.parent.mkdir(parents=True, exist_ok=True)
        html_path.write_text(html_document(bundle), encoding="utf-8")
        print(f"Wrote standalone HTML: {html_path}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(f"Annotation compile failed: {error}") from error
