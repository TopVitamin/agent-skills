#!/usr/bin/env node
/**
 * Probe app-level shell + surface tokens from logged-in Chrome via CDP.
 * Writes source/probes/shell-tokens.json, surface-tokens.json,
 * source-css-vars.json, and element-token-map.json
 *
 * Usage:
 *   node scripts/cdp_probe_tokens.mjs --target=TARGET_ID --out source/probes
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

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
  const out = get('--out') || 'source/probes'
  if (!target) {
    console.error('Usage: node cdp_probe_tokens.mjs --target=ID [--out source/probes]')
    process.exit(1)
  }
  return { target, outDir: resolve(out) }
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

const PROBE_SCRIPT = `(() => {
  const vis = el => { const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
  const box = el => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return {
    x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),
    bg:s.backgroundColor, border:s.border, borderBottom:s.borderBottom, borderTop:s.borderTop,
    padding:s.padding, margin:s.margin, fontSize:s.fontSize, fontWeight:s.fontWeight,
    lineHeight:s.lineHeight, color:s.color, borderRadius:s.borderRadius, boxShadow:s.boxShadow
  };};
  const readVars = (el) => {
    if (!el) return {};
    const s = getComputedStyle(el);
    const vars = {};
    for (let i = 0; i < s.length; i += 1) {
      const name = s.item(i);
      if (name.startsWith('--')) {
        const value = s.getPropertyValue(name).trim();
        if (value) vars[name] = value;
      }
    }
    return vars;
  };
  const compactClass = el => {
    if (!el) return '';
    if (typeof el.className === 'string') return el.className.trim().replace(/\\s+/g, ' ').slice(0, 240);
    return '';
  };
  const esc = value => (window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'));
  const selectorFor = (label, el) => {
    if (!el) return null;
    if (el.id) return '#' + esc(el.id);
    const cls = compactClass(el).split(' ').filter(Boolean).slice(0, 3).map(c => '.' + esc(c)).join('');
    return cls ? el.tagName.toLowerCase() + cls : label;
  };
  const sourceCssVars = {
    html: readVars(document.documentElement),
    body: readVars(document.body),
    themeRoots: [...document.querySelectorAll('[data-theme], [class*="theme"], [class*="Theme"]')]
      .slice(0, 8)
      .map((el, index) => ({
        index,
        selector: selectorFor('themeRoot', el),
        className: compactClass(el),
        vars: readVars(el),
      }))
      .filter(item => Object.keys(item.vars).length > 0),
  };
  const flatVars = Object.assign({}, sourceCssVars.html, sourceCssVars.body, ...sourceCssVars.themeRoots.map(item => item.vars));
  const normalizeValue = value => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const varsByValue = {};
  Object.entries(flatVars).forEach(([name, value]) => {
    const key = normalizeValue(value);
    if (!key) return;
    if (!varsByValue[key]) varsByValue[key] = [];
    varsByValue[key].push(name);
  });
  const tokenHints = style => {
    const hints = {};
    Object.entries(style || {}).forEach(([prop, value]) => {
      const matched = varsByValue[normalizeValue(value)];
      if (matched) hints[prop] = matched.slice(0, 12);
    });
    return hints;
  };
  const sider = document.querySelector('.ant-layout-sider');
  const logo = document.querySelector('.menu_logo, .logo, [class*="logo"]');
  const menuLink = document.querySelector('.leftMenu .menu li a, .ant-layout-sider .ant-menu-item a, .ant-layout-sider a');
  const menuIcon = menuLink?.querySelector('.iconfont, .anticon, i, svg');
  const menuText = menuLink?.querySelector('.mText, span');
  const tab = document.querySelector('.ant-tabs-tab-active') || document.querySelector('.ant-tabs-tab');
  const tabInactive = document.querySelector('.ant-tabs-tab:not(.ant-tabs-tab-active)');
  const header = document.querySelector('.header, .ant-layout-header');
  const pageHeader = document.querySelector('.page-header');
  const antCard = document.querySelector('.ant-card');
  const antCardBordered = document.querySelector('.ant-card-bordered');
  const th = document.querySelector('.ant-table-thead th, .vxe-header--column');
  const vxeWrap = document.querySelector('.vxe-table--header-wrapper');
  const layout = document.querySelector('.ant-layout');
  const content = document.querySelector('.ant-layout-content');
  const footerBar = [...document.querySelectorAll('div')].find(d => {
    const r=d.getBoundingClientRect(); return r.height>=40&&r.height<=80&&d.innerText?.includes('保存')&&getComputedStyle(d).position==='fixed' || (r.bottom>innerHeight-80&&d.innerText?.includes('保存后打印'));
  });
  const addon = document.querySelector('.ant-input-group-addon');
  const targets = {
    sidebar: sider,
    logo,
    menuLink,
    menuIcon,
    menuText,
    header,
    tabActive: tab,
    tabInactive,
    pageHeader,
    cardPlain: antCard && !antCard.className.includes('bordered') ? antCard : null,
    cardBordered: antCardBordered,
    tableTh: th,
    vxeHeaderWrap: vxeWrap,
    layout,
    content,
    footerBar,
    inputAddon: addon,
  };
  const elementTokenMap = Object.fromEntries(Object.entries(targets)
    .filter(([, el]) => el && vis(el))
    .map(([label, el]) => {
      const style = box(el);
      return [label, {
        selector: selectorFor(label, el),
        className: compactClass(el),
        tagName: el.tagName.toLowerCase(),
        style,
        tokenHints: tokenHints(style),
      }];
    }));
  return JSON.stringify({
    url: location.href,
    title: document.title,
    probedAt: new Date().toISOString(),
    sourceCssVars,
    cssVarStats: {
      html: Object.keys(sourceCssVars.html).length,
      body: Object.keys(sourceCssVars.body).length,
      themeRoots: sourceCssVars.themeRoots.reduce((total, item) => total + Object.keys(item.vars).length, 0),
    },
    elementTokenMap,
    shell: {
      sidebar: sider ? { width: box(sider).w, bg: box(sider).bg } : null,
      logo: logo ? { ...box(logo), backgroundImage: getComputedStyle(logo).backgroundImage?.slice(0,200) } : null,
      menuItem: menuLink ? box(menuLink) : null,
      menuIcon: menuIcon ? box(menuIcon) : null,
      menuText: menuText ? box(menuText) : null,
      menuLayout: menuLink && menuIcon ? 'icon-left-text-inline' : 'unknown',
      header: header ? box(header) : null,
      tabActive: tab ? box(tab) : null,
      tabInactive: tabInactive ? box(tabInactive) : null,
    },
    surfaces: {
      canvas: layout ? { bg: box(layout).bg } : null,
      content: content ? { margin: box(content).margin, padding: box(content).padding } : null,
      pageHeader: pageHeader ? box(pageHeader) : null,
      cardPlain: antCard && !antCard.className.includes('bordered') ? box(antCard) : null,
      cardBordered: antCardBordered ? box(antCardBordered) : null,
      tableTh: th ? box(th) : null,
      vxeHeaderWrap: vxeWrap ? box(vxeWrap) : null,
      footerBar: footerBar ? box(footerBar) : null,
      inputAddon: addon ? box(addon) : null,
    }
  });
})()`

function normalizeShell(raw) {
  const s = raw.shell || {}
  return {
    probedFrom: raw.url,
    probedAt: raw.probedAt,
    sidebar: {
      width: s.sidebar?.w ?? 100,
      background: s.sidebar?.bg || '#ffffff',
      logo: {
        width: s.logo?.w ?? 80,
        height: s.logo?.h ?? 65,
        margin: s.logo?.margin || '0 10px 5px',
        backgroundImage: s.logo?.backgroundImage || null,
      },
      menuItemHeight: s.menuItem?.h ?? 43,
      menuIconSize: s.menuIcon?.w ?? 18,
      menuIconColor: s.menuIcon?.bg === 'rgba(0, 0, 0, 0)' ? (s.menuIcon?.color || '#404866') : '#404866',
      menuTextColor: s.menuText?.color || '#111111',
      menuLayout: s.menuLayout || 'icon-left-text-inline',
    },
    header: {
      height: s.header?.h ?? 64,
      background: s.header?.bg || '#ffffff',
      tabsTop: (s.tabActive?.y ?? 24) - (s.header?.y ?? 0),
      tabHeight: s.tabActive?.h ?? 40,
      tabPadding: s.tabActive?.padding || '0 16px',
      tabMarginRight: '8px',
      tabInactiveBg: s.tabInactive?.bg || '#fafafa',
      tabInactiveBorder: s.tabInactive?.border?.match(/rgb[^)]+/)?.[0] || '#f3f4f9',
      tabActiveBg: s.tabActive?.bg || '#f3f6ff',
      tabActiveColor: s.tabActive?.color || '#145eff',
      tabRadius: s.tabActive?.borderRadius || '4px 4px 0 0',
    },
    content: {
      margin: raw.surfaces?.content?.margin || '16px 8px 0',
      paddingLeft: 16,
      pageHeaderHeight: raw.surfaces?.pageHeader?.h ?? 49,
      pageHeaderPadding: raw.surfaces?.pageHeader?.padding || '8px 16px',
    },
  }
}

function normalizeSurface(raw) {
  const sf = raw.surfaces || {}
  const th = sf.tableTh || {}
  return {
    probedFrom: raw.url,
    probedAt: raw.probedAt,
    canvas: { bg: sf.canvas?.bg || '#e0e2e8' },
    content: { margin: sf.content?.margin || '16px 8px 0' },
    pageHeader: {
      bg: sf.pageHeader?.bg || '#ffffff',
      borderBottom: th.borderBottom || sf.pageHeader?.borderBottom || '1px solid #e8e8e8',
      padding: sf.pageHeader?.padding || '8px 16px',
    },
    card: {
      plain: {
        bg: sf.cardPlain?.bg || '#ffffff',
        border: 'none',
        radius: sf.cardPlain?.borderRadius || '2px',
        bodyPadding: '8px',
      },
      bordered: {
        bg: sf.cardBordered?.bg || '#ffffff',
        border: sf.cardBordered?.border || '1px solid #e8e8e8',
        radius: sf.cardBordered?.borderRadius || '2px',
        margin: '16px 0',
      },
    },
    listTable: {
      theadBg: th.bg || '#e0e2e8',
      theadHeight: th.h ?? 42,
      cellBorderRight: '1px solid #cccccc',
      cellBorderBottom: '1px solid #cccccc',
      emptyBorder: '1px solid #e8e8e8',
    },
    addTable: {
      vxeHeaderWrapBg: sf.vxeHeaderWrap?.bg || '#f8f8f9',
      vxeColHeadBg: th.bg || '#e0e2e8',
      vxeGrid: '#e8eaec',
      footerBarBg: sf.footerBar?.bg || '#ffffff',
      footerBarBorderTop: sf.footerBar?.borderTop || '1px solid #e8e8e8',
      footerBarShadow: sf.footerBar?.boxShadow || '0 -1px 2px rgba(0,0,0,0.03)',
    },
    sectionTitle: {
      borderBottom: '1px solid #e8e8e8',
      fontSize: '16px',
      fontWeight: 500,
      padding: '0 8px',
    },
    inputAddon: { bg: sf.inputAddon?.bg || '#fafafa' },
    controlBorder: '#d9d9d9',
    divider: '#e8e8e8',
    tableGrid: '#cccccc',
  }
}

function normalizeSourceCssVars(raw) {
  return {
    probedFrom: raw.url,
    probedAt: raw.probedAt,
    stats: raw.cssVarStats || {},
    vars: raw.sourceCssVars || { html: {}, body: {}, themeRoots: [] },
    note: 'Use source CSS custom properties when they match computed styles; otherwise trust shell/surface computed tokens.',
  }
}

function normalizeElementTokenMap(raw) {
  return {
    probedFrom: raw.url,
    probedAt: raw.probedAt,
    elements: raw.elementTokenMap || {},
  }
}

async function main() {
  const { target, outDir } = parseArgs()
  mkdirSync(outDir, { recursive: true })

  const evalRes = await cdp(`/eval?target=${target}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: PROBE_SCRIPT,
  })
  const rawStr = evalRes.value ?? evalRes.raw
  if (!rawStr) {
    console.error('CDP eval failed', evalRes)
    process.exit(1)
  }
  const raw = JSON.parse(rawStr)
  const shell = normalizeShell(raw)
  const surface = normalizeSurface(raw)
  const sourceCssVars = normalizeSourceCssVars(raw)
  const elementTokenMap = normalizeElementTokenMap(raw)

  const shellPath = `${outDir}/shell-tokens.json`
  const surfacePath = `${outDir}/surface-tokens.json`
  const cssVarsPath = `${outDir}/source-css-vars.json`
  const elementMapPath = `${outDir}/element-token-map.json`
  writeFileSync(shellPath, JSON.stringify(shell, null, 2), 'utf8')
  writeFileSync(surfacePath, JSON.stringify(surface, null, 2), 'utf8')
  writeFileSync(cssVarsPath, JSON.stringify(sourceCssVars, null, 2), 'utf8')
  writeFileSync(elementMapPath, JSON.stringify(elementTokenMap, null, 2), 'utf8')

  console.log(`Shell:   ${shellPath}`)
  console.log(`Surface: ${surfacePath}`)
  console.log(`CSS vars: ${cssVarsPath}`)
  console.log(`Element token map: ${elementMapPath}`)
  console.log(`Sidebar ${shell.sidebar.width}px, header ${shell.header.height}px, canvas ${surface.canvas.bg}, css vars html/body/theme ${sourceCssVars.stats.html || 0}/${sourceCssVars.stats.body || 0}/${sourceCssVars.stats.themeRoots || 0}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
