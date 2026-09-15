#!/usr/bin/env node
/**
 * Generate a compact Page Map draft from a probe summary.
 *
 * Usage:
 *   node scripts/generate_page_map.mjs source/probes/<state-id>.summary.json docs/page-maps/<state-id>.md
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, basename } from 'node:path'

function usage() {
  console.error('Usage: node scripts/generate_page_map.mjs <summary.json> <page-map.md>')
  process.exit(1)
}

const [summaryPath, outputPath] = process.argv.slice(2)
if (!summaryPath || !outputPath) usage()
if (!existsSync(summaryPath)) {
  console.error(`Summary file does not exist: ${summaryPath}`)
  process.exit(1)
}

let summary
try {
  summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
} catch (error) {
  console.error(`Failed to parse summary JSON: ${summaryPath}`)
  console.error(error.message)
  process.exit(1)
}
const stateId = summary.stateId || basename(summaryPath).replace(/\.summary\.json$/, '')

function text(value, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback
  return String(value).replace(/\s+/g, ' ').trim() || fallback
}

function cellText(value, fallback = '-') {
  return text(value, fallback).replace(/\|/g, '\\|')
}

function boxText(box) {
  if (!box) return '-'
  const x = box.x ?? box.left
  const y = box.y ?? box.top
  const w = box.w ?? box.width
  const h = box.h ?? box.height
  return [x, y, w, h].every((v) => v !== undefined) ? `${x},${y},${w}x${h}` : '-'
}

function listLines(items, mapper, empty = '- 暂无') {
  if (!items?.length) return empty
  return items.map(mapper).join('\n')
}

const tableColumns = summary.tableColumns || []
const formLabels = summary.formLabels || []
const regions = summary.keyRegions || summary.landmarks || []
const controls = summary.controlSamples || []
const toolbarButtons = summary.toolbarButtons || []
const sections = summary.sectionTitles || []
const doc = summary.document || {}
const viewport = summary.viewport || {}
const elementCounts = summary.elementCounts || {}
const completeness = summary.captureCompleteness || {}

const lines = [
  `# Page Map — ${stateId}`,
  '',
  '## Source Lock',
  '',
  `| Field | Value |`,
  `|---|---|`,
  `| state-id | ${stateId} |`,
  `| title | ${cellText(summary.title)} |`,
  `| url | ${cellText(summary.url)} |`,
  `| viewport | ${text(viewport.w ?? viewport.width)} × ${text(viewport.h ?? viewport.height)} |`,
  `| document | ${text(doc.scrollWidth)} × ${text(doc.scrollHeight)} |`,
  `| horizontalScroll | ${doc.horizontalScroll === undefined ? 'unknown' : String(!!doc.horizontalScroll)} |`,
  `| verticalScroll | ${doc.verticalScroll === undefined ? 'unknown' : String(!!doc.verticalScroll)} |`,
  `| archive | ${cellText(summary.inventoryArchive || summary.structureArchive)} |`,
  `| gate | ${cellText(completeness.passed === undefined ? 'unknown' : completeness.passed ? 'passed' : `failed: ${(completeness.failedChecks || []).join(', ')}`)} |`,
  '',
  '## Coverage',
  '',
  '| Metric | Value | Notes |',
  '|---|---|---|',
  `| totalVisibleNodes | ${text(elementCounts.totalVisibleNodes)} | from summary.elementCounts |`,
  `| tableHeaders | ${text(elementCounts.tableHeaders)} | tableColumns=${tableColumns.length} |`,
  `| formLabels | ${formLabels.length} | generated labels count |`,
  `| controls | ${controls.length} | Interaction Map draft caps at 15 rows |`,
  `| horizontal coverage | ${doc.horizontalScroll ? '需要标注横向滚动列' : '无或未知'} | Agent 校正 |`,
  `| vertical coverage | ${doc.verticalScroll ? '需要确认 below-fold 区块' : '无或未知'} | Agent 校正 |`,
  '',
  '## Structure Map',
  '',
  '| Region | Selector | Box | Notes |',
  '|---|---|---|---|',
  listLines(regions, (region, index) => {
    const name = cellText(region.name || region.selector || region.tag || `region-${index + 1}`)
    return `| ${name} | ${cellText(region.selector)} | ${cellText(boxText(region.box))} | 待校正 |`
  }, '| - | - | - | 待补充 |'),
  '',
  '## Table Columns',
  '',
  tableColumns.length
    ? tableColumns
        .map((col, index) => `${index + 1}. ${text(col.text || col.label || col.key)} | width=${text(col.width)} | sort=${!!col.hasSort} | filter=${!!col.hasFilter}${doc.horizontalScroll ? ' | 横向滚动需校正' : ''}`)
        .join('\n')
    : '- 无表格列或未采集到',
  '',
  '## Form Labels',
  '',
  formLabels.length ? formLabels.map((label, index) => `${index + 1}. ${text(label)}`).join('\n') : '- 无表单字段或未采集到',
  '',
  '## Sections And Toolbar',
  '',
  `- sections: ${sections.length ? sections.map((item) => text(item)).join(' / ') : '-'}`,
  `- toolbarButtons: ${toolbarButtons.length ? toolbarButtons.map((item) => text(item)).join(' / ') : '-'}`,
  '',
  '## Interaction Map',
  '',
  '| Control | Source behavior | Clone behavior | Verification |',
  '|---|---|---|---|',
  listLines(controls.slice(0, 15), (control) => {
    const label = cellText(control.text || control.placeholder || control.kind || control.tag)
    return `| ${label} | 待从源站校正 | 待实现 | 待验证 |`
  }, '| 待补充 | 待从源站校正 | 待实现 | 待验证 |'),
  '',
  '## Gaps',
  '',
  '- Agent 校正：确认 region 语义、核心交互行为、截图中的特殊状态。',
  '- Agent 校正：标记横向滚动列、below-fold 区块、未采样但可见的 pending 控件。',
]

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
console.log(`Page Map: ${outputPath}`)
