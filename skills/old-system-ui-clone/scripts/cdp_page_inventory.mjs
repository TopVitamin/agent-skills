#!/usr/bin/env node
/**
 * CDP page inventory for logged-in legacy UI capture.
 * Writes:
 *   <out>.inventory.json  — full archive (safe to keep off-context)
 *   <out>.summary.json    — derived summary with captureCompleteness gate
 *
 * Usage:
 *   node scripts/cdp_page_inventory.mjs --target=ID --state-id=buy-list-default --out source/probes/buy-list-default
 *
 * Requires web-access CDP proxy on localhost:3456
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const PROXY = process.env.CDP_PROXY_URL || 'http://localhost:3456'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (name) => {
    const eq = args.find((a) => a.startsWith(`${name}=`))
    if (eq) return eq.slice(name.length + 1)
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : null
  }
  const target = get('--target')
  const stateId = get('--state-id')
  const out = get('--out')
  const scroll = !args.includes('--no-scroll')
  if (!target || !stateId || !out) {
    console.error('Usage: node cdp_page_inventory.mjs --target=ID --state-id=ID --out path/prefix [--no-scroll]')
    process.exit(1)
  }
  return { target, stateId, out: resolve(out), scroll }
}

async function cdp(path, init) {
  const res = await fetch(`${PROXY}${path}`, init)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

const INVENTORY_SCRIPT = `(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  const slim = (el) => {
    const s = getComputedStyle(el)
    return {
      color: s.color,
      backgroundColor: s.backgroundColor,
      fontSize: s.fontSize,
      border: s.border,
      borderRadius: s.borderRadius,
      padding: s.padding,
    }
  }
  const count = (sel) => [...document.querySelectorAll(sel)].filter(vis).length

  const tableCols = [
    ...document.querySelectorAll('.ant-table-thead th, .vxe-header--column, .vxe-table--header th, table thead th'),
  ]
    .filter(vis)
    .map((th) => ({
      text: (th.innerText || '').replace(/\\s+/g, ' ').trim(),
      width: Math.round(th.getBoundingClientRect().width),
      hasSort: !!th.querySelector('.ant-table-column-sorter, .sort--active, [class*="sort"]'),
      hasFilter: !!th.querySelector('.ant-table-filter-trigger, [class*="filter"]'),
    }))

  const formLabels = [...document.querySelectorAll('.ant-form-item-label label, form label, .form-label')]
    .filter(vis)
    .map((l) => (l.innerText || '').trim())
    .filter(Boolean)

  const sectionTitles = [...document.querySelectorAll('h1,h2,h3,h4')]
    .filter(vis)
    .map((el) => (el.innerText || '').trim())
    .filter((t) => t && t.length < 40)

  const toolbarButtons = [...document.querySelectorAll('button, .ant-btn, a.ant-btn')]
    .filter(vis)
    .map((b) => (b.innerText || '').trim())
    .filter(Boolean)

  const regionSels = [
    ['sider', '.ant-layout-sider, aside, [class*="sidebar"]'],
    ['header', 'header, .ant-layout-header, [class*="header"]'],
    ['tabs', '.ant-tabs'],
    ['toolbar', '[class*="toolbar"], [class*="operator"], [class*="table-operator"]'],
    ['filter', '[class*="filter"], [class*="search"]'],
    ['table', '.ant-table, .vxe-table, table'],
    ['pagination', '.ant-pagination, [class*="pagination"]'],
    ['form', 'form, .ant-form'],
    ['footer', '[class*="footer"], .ant-drawer-footer'],
  ]
  const keyRegions = regionSels
    .map(([name, sel]) => {
      const el = document.querySelector(sel)
      if (!el || !vis(el)) return null
      return { name, selector: sel, box: box(el), layout: slim(el) }
    })
    .filter(Boolean)

  const controls = []
  const pushControl = (el, kind) => {
    if (!vis(el)) return
    controls.push({
      kind,
      text: ((el.innerText || el.placeholder || '') + '').trim().slice(0, 60),
      box: box(el),
      layout: slim(el),
    })
  }
  ;[...document.querySelectorAll('input, textarea, select, button, .ant-select-selection')]
    .filter(vis)
    .slice(0, 40)
    .forEach((el) => {
      const tag = el.tagName.toLowerCase()
      const kind = el.classList.contains('ant-select-selection') ? 'select' : tag
      pushControl(el, kind)
    })

  const doc = document.documentElement
  return JSON.stringify({
    url: location.href,
    title: document.title,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    document: {
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      horizontalScroll: doc.scrollWidth > window.innerWidth,
      verticalScroll: doc.scrollHeight > window.innerHeight,
    },
    elementCounts: {
      totalVisibleNodes: count('*'),
      buttons: count('button, .ant-btn'),
      inputs: count('input, textarea'),
      selects: count('.ant-select'),
      tableHeaders: tableCols.length,
      icons: count('.anticon, [class*="icon"]'),
    },
    tableColumns: tableCols,
    formLabels: [...new Set(formLabels)],
    sectionTitles: [...new Set(sectionTitles)],
    toolbarButtons: [...new Set(toolbarButtons)],
    keyRegions,
    controlSamples: controls.slice(0, 20),
  })
})()`

function buildSummary(inventory, stateId, inventoryFile) {
  const failed = []
  const isList = inventory.elementCounts?.tableHeaders > 0
  const isForm = (inventory.formLabels?.length || 0) > 3

  if (!inventory.elementCounts?.totalVisibleNodes) failed.push('elementCounts.totalVisibleNodes')
  if (isList && !inventory.tableColumns?.length) failed.push('tableColumns')
  if (isForm && (inventory.formLabels?.length || 0) < 5) failed.push('formLabels (<5)')
  if ((inventory.keyRegions?.length || 0) < (isForm ? 6 : 5)) failed.push('keyRegions too few')
  if ((inventory.controlSamples?.length || 0) < 8) failed.push('controlSamples (<8)')

  return {
    stateId,
    url: inventory.url,
    title: inventory.title,
    viewport: inventory.viewport,
    document: inventory.document,
    inventoryArchive: inventoryFile,
    generatedBy: 'cdp-page-inventory',
    elementCounts: inventory.elementCounts,
    tableColumns: inventory.tableColumns,
    formLabels: inventory.formLabels,
    sectionTitles: inventory.sectionTitles,
    toolbarButtons: inventory.toolbarButtons,
    keyRegions: inventory.keyRegions,
    controlSamples: inventory.controlSamples,
    captureCompleteness: {
      passed: failed.length === 0,
      failedChecks: failed,
      probedAt: new Date().toISOString(),
    },
    usage: 'Derived from inventory archive. Do not hand-edit without re-running cdp_page_inventory.mjs',
  }
}

async function main() {
  const { target, stateId, out, scroll } = parseArgs()
  const prefix = out.endsWith('.json') ? out.replace(/\.(inventory|summary)\.json$/, '') : out
  mkdirSync(dirname(prefix), { recursive: true })

  if (scroll) {
    await cdp(`/scroll?target=${target}&direction=bottom`)
    await new Promise((r) => setTimeout(r, 400))
    await cdp(`/scroll?target=${target}&y=0`)
    await new Promise((r) => setTimeout(r, 200))
  }

  const evalRes = await cdp(`/eval?target=${target}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: INVENTORY_SCRIPT,
  })
  const raw = evalRes.value ?? evalRes.raw
  if (!raw) {
    console.error('CDP eval failed:', evalRes)
    process.exit(1)
  }
  const inventory = JSON.parse(raw)
  inventory.stateId = stateId
  inventory.generatedBy = 'cdp-page-inventory'
  inventory.probedAt = new Date().toISOString()

  const inventoryPath = `${prefix}.inventory.json`
  const summaryPath = `${prefix}.summary.json`
  writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2), 'utf8')

  const summary = buildSummary(inventory, stateId, inventoryPath.split('/').pop())
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8')

  console.log(`Inventory: ${inventoryPath}`)
  console.log(`Summary:   ${summaryPath}`)
  console.log(
    `Gate: ${summary.captureCompleteness.passed ? 'PASSED' : 'FAILED'} — ${summary.captureCompleteness.failedChecks.join(', ') || 'ok'}`,
  )
  console.log(
    `Nodes: ${inventory.elementCounts.totalVisibleNodes}, cols: ${inventory.tableColumns.length}, labels: ${inventory.formLabels.length}`,
  )
  process.exit(summary.captureCompleteness.passed ? 0 : 2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
