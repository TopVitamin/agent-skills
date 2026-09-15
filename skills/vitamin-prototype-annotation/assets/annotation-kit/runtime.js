(() => {
'use strict';
// Classic-script compatible with file://; keep host globals untouched.
if (window.VitaminAnnotations) return;
const api = {};
window.VitaminAnnotations = api;

const VPA_STATE = {
  config: null,
  configBaseUrl: location.href,
  mode: 'preview',
  layout: 'drawer',
  drawerSide: 'right',
  badges: new Map(),
  openPopups: new Map(),
  markdownFiles: new Map(),
  mermaidPromise: null,
  toolbarPos: { x: window.innerWidth - 220, y: window.innerHeight - 54 },
  toolbarDocked: true,
  toolbarExpanded: false,
  toolbarDockBottom: 48,
  measureScheduled: false,
  lastContext: '',
  readerAll: false,
  refreshPromise: null,
  targetObserver: null,
  observedTargets: new Set(),
  viewDisplayIndexMap: new Map(),
  popupOpacity: 100,
};

const VPA_RUNTIME_SCRIPT_URL = (() => {
  const script = document.currentScript;
  if (script && script.src) return script.src;
  const node = document.querySelector('script[src*="annotation-kit/runtime.js"], script[src*="/runtime.js"]');
  return node?.src || '';
})();

const PAGE_RULES_KEY = '__vpa_page_rules__';

function stop(event) {
  event.preventDefault();
  event.stopPropagation();
}

function annotationKey(annotation) {
  return String(annotation.key || annotation.id);
}

function annotationExportId(annotation) {
  return annotation.scope ? annotationKey(annotation) : String(annotation.id);
}

function initialAnnotationMode(config) {
  return config?.runtime?.initialMode === 'annotate' ? 'annotate' : 'preview';
}

function currentRouteCandidates() {
  const routes = new Set();
  const addVariants = (pathname) => {
    routes.add(pathname);
    routes.add(`${pathname}${location.hash}`);
    routes.add(`${pathname}${location.search}${location.hash}`);
  };
  addVariants(location.pathname);
  try {
    addVariants(decodeURIComponent(location.pathname));
  } catch (error) {
    // Keep the raw pathname variants when decoding fails.
  }
  return [...routes];
}

function currentViewScope() {
  const value = document.body.dataset.vpaView
    || document.querySelector('[data-vpa-view]')?.dataset.vpaView
    || '';
  return String(value).trim();
}

function viewScopeLabel(scope) {
  const labels = VPA_STATE.config?.runtime?.viewScopeLabels || {};
  return labels[scope] || scope;
}

function matchesViewScope(annotation) {
  const scopes = annotation.viewScope;
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.includes('*')) return true;
  const current = currentViewScope();
  if (!current) return false;
  return scopes.includes(current);
}

function isPageGlobalAnnotation(annotation) {
  return annotation?.type === 'page-global' || Boolean(annotation?.isPageGlobal);
}

function stripLeadingMarkdownHeading(markdown) {
  return String(markdown || '').replace(/^#{1,3}\s+[^\n]*\n+/, '').trim();
}

function visibleElementAnnotations(showAllModules = false) {
  return sortedAnnotations().filter((annotation) => (
    annotation.type === 'element'
    && !annotation.isGlobal
    && annotationVisibleInContext(annotation, showAllModules)
  ));
}

function buildViewDisplayIndexMap(annotations) {
  const map = new Map();
  annotations.forEach((annotation, index) => {
    map.set(annotationKey(annotation), index + 1);
  });
  return map;
}

function refreshViewDisplayIndexMap() {
  VPA_STATE.viewDisplayIndexMap = buildViewDisplayIndexMap(visibleElementAnnotations());
}

function annotationDisplayIndex(annotation) {
  if (!annotation || isPageGlobalAnnotation(annotation) || annotation.isGlobal || annotation.type === 'global') {
    return null;
  }
  return VPA_STATE.viewDisplayIndexMap?.get(annotationKey(annotation)) || null;
}

function annotationDisplayLabel(annotation) {
  if (isPageGlobalAnnotation(annotation)) return '规则';
  if (annotation.isGlobal || annotation.type === 'global') return '全局';
  const index = annotationDisplayIndex(annotation);
  return index ? String(index) : String(annotation.id);
}

function partitionReaderAnnotations(annotations) {
  return {
    pageGlobals: annotations.filter(isPageGlobalAnnotation),
    globals: annotations.filter(a => a.type === 'global' || a.isGlobal),
    elements: annotations.filter(a => a.type === 'element' && !a.isGlobal),
  };
}

function annotationVisibleInContext(annotation, showAllModules = false) {
  return showAllModules || currentPageMatches(annotation);
}

function readerAnnotations(showAllModules = false) {
  return sortedAnnotations().filter(a => annotationVisibleInContext(a, showAllModules));
}

function hideToolbarWhenEmpty() {
  const value = VPA_STATE.config?.runtime?.hideToolbarWhenEmpty;
  return value === undefined ? true : Boolean(value);
}

function currentPageHasAnnotations() {
  return readerAnnotations().length > 0;
}

function buildReaderDocument(annotations) {
  const { pageGlobals, globals, elements } = partitionReaderAnnotations(annotations);
  const toc = [], parts = [], sections = [];
  function heading(title, id, level = 'h2') {
    toc.push({id, level, text: title});
    parts.push(`${level === 'h2' ? '##' : '###'} ${title}\n`);
    sections.push(`<${level} id="${id}">${escapeHtml(title)}</${level}>`);
  }
  for (const [title, id, rules] of [
    ['本页规则', 'vpa-rules', pageGlobals], ['跨页规则', 'vpa-shared-rules', globals],
  ]) {
    if (!rules.length) continue;
    heading(title, id);
    for (const rule of rules) {
      const markdown = getAnnotationMarkdown(rule);
      parts.push(markdown);
      sections.push(renderMarkdown(markdown));
    }
  }
  if (elements.length) {
    heading('界面标注', 'vpa-elements');
    elements.forEach((annotation, index) => {
      const id = 'vpa-section-' + Array.from(annotationKey(annotation), c => c.codePointAt(0).toString(16)).join('-');
      heading(`${index + 1}. ${annotation.moduleName || annotation.id}`, id, 'h3');
      const markdown = stripLeadingMarkdownHeading(getAnnotationMarkdown(annotation));
      parts.push(markdown);
      sections.push(renderMarkdown(markdown));
    });
  }
  return {markdown: parts.join('\n\n').trim(), toc, html: sections.join('\n')};
}

function currentPageGlobalAnnotation() {
  const rules = readerAnnotations().filter(a => isPageGlobalAnnotation(a) || a.type === 'global' || a.isGlobal);
  if (!rules.length) return null;
  return {
    id: PAGE_RULES_KEY, key: PAGE_RULES_KEY, type: 'page-global',
    moduleName: `本页规则 · ${viewScopeLabel(currentViewScope()) || '当前页'}`,
    markdown: buildReaderDocument(rules).markdown,
  };
}

function applyRuntimeStyle(element) {
  const zIndexBase = Number(VPA_STATE.config?.runtime?.zIndexBase);
  if (Number.isFinite(zIndexBase)) element.style.setProperty('--vpa-z-base', String(zIndexBase));
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function splitTableRow(line) {
  let content = line.trim();
  if (content.startsWith('|')) content = content.slice(1);
  content = content.replace(/(?<!\\)\|$/, '');
  return content.split(/(?<!\\)\|/).map((cell) => cell.replaceAll('\\|', '|').trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function safeMarkdownUrl(value, image = false) {
  const decoded = value.replace(/&amp;/g, '&').replace(/&#(?:0*39|x0*27);/gi, "'").replace(/&quot;/g, '"');
  try {
    const url = new URL(decoded, VPA_STATE.configBaseUrl);
    if (!['http:', 'https:', 'file:'].includes(url.protocol) && !(url.protocol === 'mailto:' && !image)) return '';
    if (url.protocol === 'file:' && location.protocol !== 'file:') return '';
    return escapeHtml(url.href);
  } catch { return ''; }
}

function renderInline(text) {
  const tokens = [];
  const token = html => `\u0000${tokens.push(html) - 1}\u0000`;
  let rendered = escapeHtml(text);
  rendered = rendered.replace(/`([^`]+)`/g, (_, code) => token(`<code>${code}</code>`));
  rendered = rendered.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const safe = safeMarkdownUrl(url, true);
    return token(safe ? `<img src="${safe}" alt="${alt}" class="vpa-img" />` : alt);
  });
  rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safe = safeMarkdownUrl(url);
    return token(safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>` : label);
  });
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return rendered.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
}

function renderList(items) {
  const root = [];
  const stack = [{ depth: -1, children: root }];
  for (const item of items) {
    while (stack.length > 1 && stack[stack.length - 1].depth >= item.depth) stack.pop();
    const node = { ...item, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push({ depth: item.depth, children: node.children });
  }

  function renderChildren(children) {
    let html = '';
    for (let index = 0; index < children.length;) {
      const type = children[index].type;
      const group = [];
      while (index < children.length && children[index].type === type) {
        group.push(children[index]);
        index += 1;
      }
      html += `<${type}>${group.map((item) => {
        const task = item.text.match(/^\[([ xX])\]\s+(.+)$/);
        const content = task
          ? `<input type="checkbox" disabled${task[1].toLowerCase() === 'x' ? ' checked' : ''}> ${renderInline(task[2])}`
          : renderInline(item.text);
        return `<li>${content}${item.children.length ? renderChildren(item.children) : ''}</li>`;
      }).join('')}</${type}>`;
    }
    return html;
  }
  return renderChildren(root);
}

function renderMarkdown(markdown) {
  const normalized = String(markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const html = [];
  let list = [];

  function flushList() {
    if (!list.length) return;
    html.push(renderList(list));
    list = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('<!--')) {
      flushList();
      continue;
    }
    if (trimmed.startsWith('```')) {
      flushList();
      const language = trimmed.slice(3).trim().toLowerCase();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      const code = codeLines.join('\n');
      if (language === 'mermaid') {
        html.push(`<div class="vpa-mermaid" data-mermaid-source="${escapeHtml(code)}">${escapeHtml(code)}</div>`);
      } else {
        html.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
      }
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      html.push('<hr>');
      continue;
    }
    if (trimmed.includes('|') && lines[index + 1] && isTableSeparator(lines[index + 1])) {
      flushList();
      const headers = splitTableRow(trimmed);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      html.push(`<div class="vpa-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${renderInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }
    if (trimmed.startsWith('> ')) {
      flushList();
      html.push(`<blockquote>${renderInline(trimmed.slice(2))}</blockquote>`);
      continue;
    }
    const listMatch = line.match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const indent = listMatch[1].replaceAll('\t', '  ').length;
      list.push({ depth: Math.floor(indent / 2), type: /\d+\./.test(listMatch[2]) ? 'ol' : 'ul', text: listMatch[3] });
      continue;
    }
    flushList();
    html.push(`<p>${renderInline(trimmed)}</p>`);
  }
  flushList();
  return html.join('');
}

function getGlobalMermaid() {
  const raw = window.mermaid;
  if (!raw) return null;
  return (raw && typeof raw.render === 'function') ? raw : (raw.default || raw);
}

async function ensureMermaid() {
  const mermaidConfig = VPA_STATE.config?.mermaid || {};
  if (mermaidConfig.enabled === false) return null;
  const existing = getGlobalMermaid();
  if (existing) return existing;

  const sources = mermaidConfig.src
    ? [resolveAnnotationUrl(mermaidConfig.src)]
    : [
        'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js',
        'https://unpkg.com/mermaid@10/dist/mermaid.min.js'
      ];

  if (!VPA_STATE.mermaidPromise) {
    VPA_STATE.mermaidPromise = (async () => {
      for (const scriptSrc of sources) {
        const loaded = await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = scriptSrc;
          script.onload = () => {
            VPA_STATE.ownsMermaid = true;
            resolve(true);
          };
          script.onerror = () => {
            script.remove();
            resolve(false);
          };
          document.head.appendChild(script);
        });
        const m = getGlobalMermaid();
        if (loaded && m) return m;
      }
      console.warn('[vitamin-prototype-annotation] Failed to load Mermaid from all configured sources');
      return null;
    })();
  }
  return VPA_STATE.mermaidPromise;
}

async function renderMermaidIn(root) {
  const nodes = Array.from(root.querySelectorAll('.vpa-mermaid:not([data-rendered])'));
  if (!nodes.length) return;
  const mermaid = await ensureMermaid();
  if (!mermaid || typeof mermaid.render !== 'function') {
    nodes.forEach((node) => {
      node.classList.add('vpa-mermaid-source');
      node.dataset.rendered = 'source';
    });
    return;
  }
  if (!VPA_STATE.mermaidInitialized) {
    try {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'neutral',
        ...(VPA_STATE.config?.mermaid?.options || {})
      });
      VPA_STATE.mermaidInitialized = true;
    } catch (e) {
      console.warn('[vitamin-prototype-annotation] Mermaid init error', e);
    }
  }
  await Promise.all(nodes.map(async (node, index) => {
    const source = (node.getAttribute('data-mermaid-source') || node.textContent || '').trim();
    if (!source) return;
    try {
      const id = `vpa_m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}_${index}`;
      const result = await mermaid.render(id, source);
      node.innerHTML = result.svg;
      node.dataset.rendered = 'svg';
      node.classList.remove('vpa-mermaid-source', 'vpa-mermaid-error');
      if (typeof result.bindFunctions === 'function') {
        result.bindFunctions(node);
      }
    } catch (error) {
      console.warn('[vitamin-prototype-annotation] Mermaid render error:', error);
      node.classList.add('vpa-mermaid-error');
      node.textContent = source;
      node.dataset.rendered = 'error';
    }
  }));
}

function setMarkdownContent(container, markdown) {
  container.innerHTML = `<div class="vpa-markdown">${renderMarkdown(markdown)}</div>`;
  renderMermaidIn(container).catch((error) => console.error('[vitamin-prototype-annotation]', error));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMarkdownBlock(markdown, blockId) {
  const id = escapeRegExp(blockId);
  const startEndPattern = new RegExp(`<!--\\s*anno:start\\s+id=["']?${id}["']?[^>]*-->([\\s\\S]*?)<!--\\s*anno:end\\s+id=["']?${id}["']?\\s*-->`, 'i');
  const startEndMatch = markdown.match(startEndPattern);
  if (startEndMatch) return startEndMatch[1].trim();

  const lines = String(markdown || '').split('\n');
  const output = [];
  let collecting = false;
  for (const line of lines) {
    const isAnyMarker = /<!--\s*anno:(id|start)\s*=/i.test(line) || /<!--\s*anno:(id|start)\s+/i.test(line);
    const isTargetMarker = new RegExp(`<!--\\s*anno:(id|start)(\\s+|=)[^>]*${id}`, 'i').test(line);
    if (isTargetMarker) {
      collecting = true;
      continue;
    }
    if (collecting && isAnyMarker) break;
    if (collecting && !/<!--\s*anno:end/i.test(line)) output.push(line);
  }
  return output.join('\n').trim();
}

function resolveAnnotationUrl(path) {
  return new URL(path, VPA_STATE.configBaseUrl).href;
}

async function hydrateMarkdownAnnotations() {
  VPA_STATE.markdownFiles.clear();
  const annotations = VPA_STATE.config.annotations || [];
  const files = [...new Set(annotations.map((item) => item.markdownFile).filter(Boolean))];

  await Promise.all(files.map(async (file) => {
    const url = resolveAnnotationUrl(file);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load annotation markdown: ${url}`);
    VPA_STATE.markdownFiles.set(file, await response.text());
  }));

  for (const annotation of annotations) {
    if (!annotation.markdownFile) continue;
    const markdown = VPA_STATE.markdownFiles.get(annotation.markdownFile) || '';
    annotation.markdown = extractMarkdownBlock(markdown, annotation.blockId || annotation.id) || annotation.markdown || '';
  }
}

function getAnnotationMarkdown(annotation) {
  return annotation.markdown || '';
}

function sortedAnnotations() {
  return [...(VPA_STATE.config.annotations || [])].sort((left, right) => {
    const workspaceCompare = Number(left.workspaceOrder ?? 999999) - Number(right.workspaceOrder ?? 999999);
    if (workspaceCompare) return workspaceCompare;
    const pageCompare = String(left.page || '').localeCompare(String(right.page || ''));
    if (pageCompare) return pageCompare;
    const orderCompare = Number(left.order ?? 999999) - Number(right.order ?? 999999);
    if (orderCompare) return orderCompare;
    return String(left.id).localeCompare(String(right.id), undefined, { numeric: true });
  });
}

function currentPageMatches(annotation) {
  if (!matchesViewScope(annotation)) return false;
  const routes = currentRouteCandidates();
  if (annotation.routeMatcher) {
    try {
      const matcher = new RegExp(annotation.routeMatcher);
      return routes.some((route) => matcher.test(route));
    } catch (error) {
      console.warn(`[vitamin-prototype-annotation] Invalid routeMatcher for ${annotation.id}`);
      return false;
    }
  }
  if (!annotation.page || annotation.page === '*') return true;
  if (annotation.page.startsWith('#')) return location.hash === annotation.page;
  return routes.some((route) => route === annotation.page);
}

function findTargets(annotation) {
  let hidden = [];
  for (const selector of [annotation.target?.selector, ...(annotation.target?.fallbackSelectors || [])].filter(Boolean)) {
    try {
      const matches = [...document.querySelectorAll(selector)].filter(e => !e.closest('.vpa-root, .vpa-popup, .vpa-toolbar, .vpa-fullscreen-reader'));
      if (matches.some(e => isVisibleTarget(e, e.getBoundingClientRect()))) return matches;
      if (!hidden.length) hidden = matches;
    } catch { /* Report missing targets through diagnostics; do not break the host. */ }
  }
  return hidden;
}

function findTarget(annotation) {
  const targets = findTargets(annotation);
  return targets.find(e => isVisibleTarget(e, e.getBoundingClientRect())) || targets[0] || null;
}

function isVisibleTarget(target, rect) {
  if (!target.isConnected || !rect.width || !rect.height || !target.getClientRects().length) return false;
  let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
  let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
  for (let node = target; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    if (node !== target && /(hidden|clip|auto|scroll)/.test(style.overflowX + style.overflowY)) {
      const clip = node.getBoundingClientRect();
      if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) {left = Math.max(left, clip.left); right = Math.min(right, clip.right);}
      if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) {top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);}
    }
  }
  return right > left && bottom > top;
}

function ensureRoot() {
  let root = document.querySelector('.vpa-root');
  if (!root) {
    root = document.createElement('div');
    root.className = 'vpa-root';
    document.body.appendChild(root);
  }
  applyRuntimeStyle(root);
  return root;
}

function showToast(message) {
  let toast = document.querySelector('.vpa-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'vpa-toast';
    document.body.appendChild(toast);
  }
  applyRuntimeStyle(toast);
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toast._timer);
  toast._timer = window.setTimeout(() => toast.classList.remove('show'), 1800);
}

function contextKey() { return `${location.href}|${currentViewScope()}`; }

function closePopups() {
  removeDrawerBackdrop();
  VPA_STATE.openPopups.forEach(p => p.remove());
  VPA_STATE.openPopups.clear();
}

function removeDrawerBackdrop() {
  document.querySelector('.vpa-drawer-backdrop')?.remove();
}

function syncDrawerBackdrop() {
  let backdrop = document.querySelector('.vpa-drawer-backdrop');
  const hasDrawer = Array.from(VPA_STATE.openPopups.values()).some((p) => p.classList.contains('vpa-drawer'));
  if (!hasDrawer) {
    if (backdrop) backdrop.remove();
    return;
  }
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'vpa-drawer-backdrop';
    applyRuntimeStyle(backdrop);
    backdrop.addEventListener('click', (event) => {
      stop(event);
      closeAllDrawers();
    });
    document.body.appendChild(backdrop);
  }
}

function closeAllDrawers() {
  removeDrawerBackdrop();
  for (const [k, p] of VPA_STATE.openPopups.entries()) {
    if (p.classList.contains('vpa-drawer')) {
      p.remove();
      VPA_STATE.openPopups.delete(k);
    }
  }
}

function syncViewContext() {
  const context = contextKey();
  refreshViewDisplayIndexMap();
  if (context === VPA_STATE.lastContext) return;
  VPA_STATE.lastContext = context;
  closePopups();
  document.querySelector('.vpa-fullscreen-reader')?._close();
  VPA_STATE.readerAll = false;
  renderToolbar();
}

function openPageRulesPopup() {
  const annotation = currentPageGlobalAnnotation();
  if (annotation) openPopup(annotation);
  else showToast('当前页面暂无本页规则');
}

function diagnostics() {
  return {
    route: location.pathname + location.search + location.hash,
    view: currentViewScope(),
    pageHasAnnotations: currentPageHasAnnotations(),
    toolbarVisible: !hideToolbarWhenEmpty() || currentPageHasAnnotations(),
    coverage: VPA_STATE.config?.coverage || null,
    annotations: sortedAnnotations().map(a => {
      if (!matchesViewScope(a) && !currentViewScope()) return {key: annotationKey(a), status: 'missing-view'};
      if (!currentPageMatches(a)) return {key: annotationKey(a), status: 'out-of-context'};
      if (a.type !== 'element') return {key: annotationKey(a), status: 'readable'};
      const matches = findTargets(a);
      const visible = matches.filter(e => isVisibleTarget(e, e.getBoundingClientRect()));
      return {key: annotationKey(a), status: visible.length > 1 ? 'ambiguous' : visible.length ? 'visible' : matches.length ? 'hidden' : 'missing-target'};
    }),
  };
}

function measureBadges() {
  for (const target of VPA_STATE.observedTargets) {
    if (!target.isConnected) { VPA_STATE.targetObserver?.unobserve(target); VPA_STATE.observedTargets.delete(target); }
  }
  syncViewContext();
  refreshViewDisplayIndexMap();
  const root = ensureRoot();
  const visibleIds = new Set();
  if (VPA_STATE.mode === 'preview') {
    VPA_STATE.badges.forEach((badge) => badge.remove());
    VPA_STATE.badges.clear();
    return;
  }

  for (const annotation of sortedAnnotations()) {
    if (annotation.isGlobal || annotation.type === 'global' || isPageGlobalAnnotation(annotation)) continue;
    if (!currentPageMatches(annotation)) continue;
    const target = findTarget(annotation);
    if (!target) continue;
    if (VPA_STATE.targetObserver && !VPA_STATE.observedTargets.has(target)) {
      VPA_STATE.targetObserver.observe(target); VPA_STATE.observedTargets.add(target);
    }
    const rect = target.getBoundingClientRect();
    if (!isVisibleTarget(target, rect)) continue;
    const key = annotationKey(annotation);
    visibleIds.add(key);
    let badge = VPA_STATE.badges.get(key);
    if (!badge) {
      badge = document.createElement('button');
      badge.className = 'vpa-badge';
      badge.type = 'button';
      badge.dataset.annotationKey = key;
      badge.addEventListener('click', (event) => {
        stop(event);
        openPopup(badge._annotation);
      });
      root.appendChild(badge);
      VPA_STATE.badges.set(key, badge);
    }
    badge._annotation = annotation;
    badge.textContent = annotationDisplayLabel(annotation);
    badge.setAttribute('aria-label', `查看标注：${annotation.moduleName || annotation.id}`);
    badge.style.left = `${Math.min(window.innerWidth - 28, Math.max(4, rect.right - 4))}px`;
    badge.style.top = `${Math.min(window.innerHeight - 20, Math.max(4, rect.top - 8))}px`;
  }

  VPA_STATE.badges.forEach((badge, id) => {
    if (!visibleIds.has(id)) {
      badge.remove();
      VPA_STATE.badges.delete(id);
    }
  });
}

function scheduleMeasure() {
  if (VPA_STATE.measureScheduled) return;
  VPA_STATE.measureScheduled = true;
  window.requestAnimationFrame(() => {
    VPA_STATE.measureScheduled = false;
    measureBadges();
  });
}

function makeDraggable(element, handle = element) {
  element.style.touchAction = 'none';
  handle.style.touchAction = 'none';

  let justDragged = false;

  // Intercept click during capture phase to prevent accidental button trigger after dragging
  element.addEventListener('click', (event) => {
    if (justDragged) {
      stop(event);
      event.stopImmediatePropagation();
      justDragged = false;
    }
  }, true);

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (element.classList.contains('vpa-drawer')) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const rect = element.getBoundingClientRect();
    const offsetX = startX - rect.left;
    const offsetY = startY - rect.top;

    let isDragging = false;
    const pointerId = event.pointerId;

    function onPointerMove(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // Differentiate between click and drag gesture (4px threshold)
      if (!isDragging) {
        if (Math.hypot(dx, dy) < 4) return;
        isDragging = true;
        justDragged = true;

        try {
          handle.setPointerCapture(pointerId);
        } catch (_) {}

        element.classList.add('vpa-is-dragging');
        document.body.classList.add('vpa-is-dragging');

        if (element.classList.contains('vpa-toolbar')) {
          element.classList.remove('vpa-docked');
          element.classList.add('vpa-expanded');
          VPA_STATE.toolbarDocked = false;
          VPA_STATE.toolbarExpanded = true;
          updateToolbarExpandedState(element);
        }

        element.style.transition = 'none';
        element.style.right = 'auto';
        element.style.bottom = 'auto';
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.top}px`;
      }

      e.preventDefault();

      const width = element.offsetWidth || rect.width;
      const height = element.offsetHeight || rect.height;
      const minX = 8;
      const maxX = Math.max(minX, window.innerWidth - width - 8);
      const minY = 8;
      const maxY = Math.max(minY, window.innerHeight - height - 8);

      const targetX = Math.max(minX, Math.min(maxX, e.clientX - offsetX));
      const targetY = Math.max(minY, Math.min(maxY, e.clientY - offsetY));

      element.style.left = `${targetX}px`;
      element.style.top = `${targetY}px`;
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove, { passive: false });
      window.removeEventListener('pointerup', onPointerUp, { passive: false });
      window.removeEventListener('pointercancel', onPointerUp, { passive: false });

      try {
        handle.releasePointerCapture(pointerId);
      } catch (_) {}

      if (isDragging) {
        element.classList.remove('vpa-is-dragging');
        document.body.classList.remove('vpa-is-dragging');
        element.style.transition = '';

        const finalRect = element.getBoundingClientRect();
        if (element.classList.contains('vpa-toolbar')) {
          if (window.innerWidth - finalRect.right < 36) {
            VPA_STATE.toolbarDocked = true;
            VPA_STATE.toolbarExpanded = false;
            VPA_STATE.toolbarDockBottom = Math.max(16, window.innerHeight - finalRect.bottom);
            element.classList.add('vpa-docked');
            element.classList.remove('vpa-expanded');
            element.style.left = 'auto';
            element.style.top = 'auto';
            element.style.right = '0';
            element.style.bottom = `${VPA_STATE.toolbarDockBottom}px`;
            updateToolbarExpandedState(element);
            showToast('已贴边收起');
          } else {
            VPA_STATE.toolbarDocked = false;
            VPA_STATE.toolbarExpanded = true;
            element.classList.remove('vpa-docked');
            element.classList.add('vpa-expanded');
            VPA_STATE.toolbarPos = { x: finalRect.left, y: finalRect.top, userMoved: true };
            updateToolbarExpandedState(element);
          }
        }

        setTimeout(() => {
          justDragged = false;
        }, 120);
      }
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: false });
    window.addEventListener('pointercancel', onPointerUp, { passive: false });
  });
}

function makeResizable(element) {
  ['left', 'right', 'bottom', 'bottom-left', 'bottom-right'].forEach((direction) => {
    const handle = document.createElement('span');
    handle.className = `vpa-resize vpa-resize-${direction}`;
    handle.addEventListener('mousedown', (event) => {
      stop(event);
      const rect = element.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, left: rect.left, width: rect.width, height: rect.height };
      function move(moveEvent) {
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;
        let left = start.left;
        let width = start.width;
        let height = start.height;
        if (direction.includes('right')) width = start.width + dx;
        if (direction.includes('left')) {
          width = start.width - dx;
          left = start.left + dx;
        }
        if (direction.includes('bottom')) height = start.height + dy;
        element.style.left = `${Math.max(8, left)}px`;
        element.style.width = `${Math.max(Math.min(360, innerWidth - 16), Math.min(innerWidth - 16, width))}px`;
        element.style.height = `${Math.max(260, Math.min(window.innerHeight - 16, height))}px`;
      }
      function up() {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      }
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    element.appendChild(handle);
  });
}

async function openPopup(annotation) {
  const key = annotationKey(annotation);
  if (annotation.markdownFile) {
    await hydrateMarkdownAnnotations();
  }

  const badgeLabel = escapeHtml(annotationDisplayLabel(annotation));

  let popup = VPA_STATE.openPopups.get(key);
  if (VPA_STATE.layout === 'drawer') {
    const existingDrawer = Array.from(VPA_STATE.openPopups.values()).find((p) => p.classList.contains('vpa-drawer'));
    if (existingDrawer) {
      popup = existingDrawer;
      for (const [k, p] of VPA_STATE.openPopups.entries()) {
        if (p === popup) VPA_STATE.openPopups.delete(k);
      }
      VPA_STATE.openPopups.set(key, popup);
      popup.innerHTML = '';
    }
  }

  const isLeftDrawer = VPA_STATE.layout === 'drawer' && VPA_STATE.drawerSide === 'left';
  if (!popup) {
    popup = document.createElement('section');
    popup.className = `vpa-popup ${VPA_STATE.layout === 'drawer' ? 'vpa-drawer' : ''} ${isLeftDrawer ? 'vpa-drawer-left' : ''}`;
    applyRuntimeStyle(popup);
    popup.addEventListener('click', (event) => event.stopPropagation());
    popup.addEventListener('mousedown', (event) => event.stopPropagation());
    document.body.appendChild(popup);
    VPA_STATE.openPopups.set(key, popup);
  } else if (VPA_STATE.layout === 'drawer') {
    popup.classList.toggle('vpa-drawer-left', VPA_STATE.drawerSide === 'left');
  }

  if (VPA_STATE.layout !== 'drawer') {
    removeDrawerBackdrop();
    const badgeRect = VPA_STATE.badges.get(key)?.getBoundingClientRect();
    const preferredLeft = badgeRect ? badgeRect.left - 450 - 8 : window.innerWidth - 480;
    const preferredTop = badgeRect ? badgeRect.bottom + 8 : 72;
    popup.style.left = `${Math.max(8, Math.min(window.innerWidth - 458, preferredLeft))}px`;
    popup.style.top = `${Math.max(8, Math.min(window.innerHeight - 568, preferredTop))}px`;
    popup.style.width = '450px';
    popup.style.height = '560px';
  } else {
    popup.style.left = '';
    popup.style.top = '';
    const currentDrawerWidth = VPA_STATE.drawerWidth || VPA_STATE.config?.runtime?.drawerWidth || 480;
    popup.style.setProperty('--vpa-drawer-width', `${currentDrawerWidth}px`);
    popup.style.width = `${currentDrawerWidth}px`;
    popup.style.height = '';
    syncDrawerBackdrop();
  }

  popup.innerHTML = '';

  const isFloating = VPA_STATE.layout !== 'drawer';
  const opacityVal = Number.isFinite(VPA_STATE.popupOpacity) ? VPA_STATE.popupOpacity : 100;
  if (isFloating && opacityVal < 100) {
    popup.style.opacity = (opacityVal / 100).toFixed(2);
  } else {
    popup.style.opacity = '';
  }

  const header = document.createElement('header');
  header.className = 'vpa-popup-header';
  const toggleBtnText = VPA_STATE.layout === 'drawer' ? '⧉ 浮窗' : '⇥ 抽屉';
  const toggleSideBtnText = VPA_STATE.drawerSide === 'left' ? '⇥ 居右' : '⇤ 居左';
  const sideBtnStyle = VPA_STATE.layout === 'drawer' ? '' : 'style="display:none;"';
  const opacityCtrlStyle = isFloating ? '' : 'style="display:none;"';
  header.innerHTML = `
    <span class="vpa-badge-static">${badgeLabel}</span>
    <strong>需求描述：【${escapeHtml(annotation.moduleName || annotation.title || annotation.id)}】</strong>
    <div class="vpa-popup-actions">
      <div class="vpa-opacity-ctrl" ${opacityCtrlStyle} title="拖拽调节透明度，点击图标快速切换">
        <span class="vpa-opacity-icon" title="点击切换半透明 / 实色">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;display:block;">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 2a10 10 0 0 1 0 20Z" fill="currentColor"></path>
          </svg>
        </span>
        <input type="range" class="vpa-opacity-slider" min="20" max="100" value="${opacityVal}" step="5" aria-label="调节浮窗透明度">
        <span class="vpa-opacity-val">${opacityVal}%</span>
      </div>
      <button type="button" class="vpa-popup-btn vpa-toggle-side" ${sideBtnStyle} title="切换抽屉左停靠或右停靠">${toggleSideBtnText}</button>
      <button type="button" class="vpa-popup-btn vpa-toggle-layout" title="切换停靠抽屉或自由浮窗">${toggleBtnText}</button>
      <button type="button" class="vpa-popup-btn vpa-close" title="关闭">✕</button>
    </div>
  `;
  popup.appendChild(header);

  const body = document.createElement('div');
  body.className = 'vpa-popup-body';
  setMarkdownContent(body, getAnnotationMarkdown(annotation));
  popup.appendChild(body);

  const opacityCtrl = header.querySelector('.vpa-opacity-ctrl');
  const opacitySlider = header.querySelector('.vpa-opacity-slider');
  const opacityValText = header.querySelector('.vpa-opacity-val');
  const opacityIcon = header.querySelector('.vpa-opacity-icon');

  if (opacitySlider) {
    const applyOpacity = (val) => {
      val = Math.max(15, Math.min(100, Number(val)));
      VPA_STATE.popupOpacity = val;
      const ratio = (val / 100).toFixed(2);
      popup.style.opacity = val === 100 ? '' : ratio;
      if (opacityValText) opacityValText.textContent = `${val}%`;
      opacitySlider.value = val;
      opacitySlider.title = `透明度: ${val}% (点击图标快速切换)`;
    };

    const onOpacityInput = () => applyOpacity(opacitySlider.value);
    opacitySlider.addEventListener('input', onOpacityInput);
    opacitySlider.addEventListener('change', onOpacityInput);

    if (opacityIcon) {
      opacityIcon.addEventListener('click', (e) => {
        stop(e);
        const targetVal = VPA_STATE.popupOpacity < 100 ? 100 : 50;
        applyOpacity(targetVal);
      });
    }

    ['pointerdown', 'mousedown', 'touchstart'].forEach((ev) => {
      opacitySlider.addEventListener(ev, (e) => e.stopPropagation());
    });
    opacityCtrl?.addEventListener('pointerdown', (e) => e.stopPropagation());
    opacityCtrl?.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  const sideBtn = header.querySelector('.vpa-toggle-side');
  if (sideBtn) {
    sideBtn.addEventListener('click', (event) => {
      stop(event);
      VPA_STATE.drawerSide = VPA_STATE.drawerSide === 'left' ? 'right' : 'left';
      if (VPA_STATE.drawerSide === 'left') {
        popup.classList.add('vpa-drawer-left');
        sideBtn.textContent = '⇥ 居右';
      } else {
        popup.classList.remove('vpa-drawer-left');
        sideBtn.textContent = '⇤ 居左';
      }
      makeDrawerResizable(popup);
    });
  }

  header.querySelector('.vpa-toggle-layout').addEventListener('click', (event) => {
    stop(event);
    if (popup.classList.contains('vpa-drawer')) {
      VPA_STATE.layout = 'floating';
      popup.classList.remove('vpa-drawer');
      popup.classList.remove('vpa-drawer-left');
      popup.style.left = `${Math.max(8, window.innerWidth - 480)}px`;
      popup.style.top = '72px';
      popup.style.width = '480px';
      popup.style.height = `${Math.min(580, innerHeight - 88)}px`;
      header.querySelector('.vpa-toggle-layout').textContent = '⇥ 抽屉';
      if (sideBtn) sideBtn.style.display = 'none';
      if (opacityCtrl) {
        opacityCtrl.style.display = '';
        const curVal = Number.isFinite(VPA_STATE.popupOpacity) ? VPA_STATE.popupOpacity : 100;
        popup.style.opacity = curVal === 100 ? '' : (curVal / 100).toFixed(2);
        if (opacitySlider) opacitySlider.value = curVal;
        if (opacityValText) opacityValText.textContent = `${curVal}%`;
      }
      removeDrawerBackdrop();
    } else {
      VPA_STATE.layout = 'drawer';
      for (const [otherKey, other] of VPA_STATE.openPopups) {
        if (other !== popup && other.classList.contains('vpa-drawer')) { other.remove(); VPA_STATE.openPopups.delete(otherKey); }
      }
      popup.classList.add('vpa-drawer');
      if (VPA_STATE.drawerSide === 'left') {
        popup.classList.add('vpa-drawer-left');
      } else {
        popup.classList.remove('vpa-drawer-left');
      }
      popup.style.left = '';
      popup.style.top = '';
      const currentDrawerWidth = VPA_STATE.drawerWidth || VPA_STATE.config?.runtime?.drawerWidth || 480;
      popup.style.setProperty('--vpa-drawer-width', `${currentDrawerWidth}px`);
      popup.style.width = `${currentDrawerWidth}px`;
      popup.style.height = '';
      header.querySelector('.vpa-toggle-layout').textContent = '⧉ 浮窗';
      if (sideBtn) {
        sideBtn.style.display = '';
        sideBtn.textContent = VPA_STATE.drawerSide === 'left' ? '⇥ 居右' : '⇤ 居左';
      }
      if (opacityCtrl) opacityCtrl.style.display = 'none';
      popup.style.opacity = '';
      syncDrawerBackdrop();
      makeDrawerResizable(popup);
    }
  });

  header.querySelector('.vpa-close').addEventListener('click', (event) => {
    stop(event);
    popup.remove();
    VPA_STATE.openPopups.delete(key);
    syncDrawerBackdrop();
  });

  makeDraggable(popup, header);
  makeResizable(popup);
  makeDrawerResizable(popup);
}

function makeDrawerResizable(popup) {
  let handle = popup.querySelector('.vpa-drawer-resize-handle');
  if (!handle) {
    handle = document.createElement('div');
    popup.appendChild(handle);
  }
  const isLeft = VPA_STATE.drawerSide === 'left' || popup.classList.contains('vpa-drawer-left');
  handle.className = `vpa-drawer-resize-handle ${isLeft ? 'vpa-drawer-resize-right' : 'vpa-drawer-resize-left'}`;
  handle.title = isLeft ? '向右拖拽拉宽抽屉，双击重置宽度' : '向左拖拽拉宽抽屉，双击重置宽度';

  if (handle._bound) return;
  handle._bound = true;

  handle.addEventListener('mousedown', (event) => {
    stop(event);
    handle.classList.add('resizing');
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const activeLeft = VPA_STATE.drawerSide === 'left' || popup.classList.contains('vpa-drawer-left');
      const rawWidth = activeLeft ? e.clientX : (window.innerWidth - e.clientX);
      const newWidth = Math.max(Math.min(280, window.innerWidth - 16), Math.min(window.innerWidth - 16, rawWidth));
      popup.style.setProperty('--vpa-drawer-width', `${newWidth}px`);
      popup.style.width = `${newWidth}px`;
      VPA_STATE.drawerWidth = newWidth;
    }

    function onUp() {
      handle.classList.remove('resizing');
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  handle.addEventListener('dblclick', (event) => {
    stop(event);
    const currentWidth = popup.offsetWidth;
    const targetWidth = currentWidth > 620 ? (VPA_STATE.config?.runtime?.drawerWidth || 480) : Math.min(820, window.innerWidth - 60);
    popup.style.setProperty('--vpa-drawer-width', `${targetWidth}px`);
    popup.style.width = `${targetWidth}px`;
    VPA_STATE.drawerWidth = targetWidth;
  });
}

function exportAll() {
  const chunks = [`# ${VPA_STATE.config.title || 'Prototype Annotations'}`];
  for (const annotation of sortedAnnotations()) {
    const isGlobal = Boolean(annotation.isGlobal || annotation.type === 'global');
    const label = isGlobal ? '全局规则' : annotationExportId(annotation);
    chunks.push(`\n\n## [${label}] ${annotation.moduleName || annotation.title || ''}\n\n${getAnnotationMarkdown(annotation)}`);
  }
  const blob = new Blob([VPA_STATE.config.fullMarkdown || chunks.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'prototype-annotations.md';
  link.click();
  URL.revokeObjectURL(url);
}



function openFullscreenReader() {
  let reader = document.querySelector('.vpa-fullscreen-reader');
  if (reader) reader._close();
  reader = document.createElement('div');
  reader.className = 'vpa-fullscreen-reader';
  applyRuntimeStyle(reader);

  const currentScope = currentViewScope();
  const annotations = readerAnnotations(VPA_STATE.readerAll);
  const { pageGlobals, globals, elements } = partitionReaderAnnotations(annotations);
  const { markdown, toc, html: renderedHtml } = buildReaderDocument(annotations);

  const tocHtml = toc.length
    ? toc.map((item) => `<a class="vpa-fs-toc-item ${item.level === 'h3' ? 'level-3' : ''}" href="#${item.id}" data-target="${item.id}">${escapeHtml(item.text)}</a>`).join('')
    : '<div style="color:#94a3b8;font-size:12px;padding:8px 10px;">暂无目录</div>';

  const pageTitle = currentScope
    ? `${VPA_STATE.config?.title || '业务标注'} · ${viewScopeLabel(currentScope)}`
    : (VPA_STATE.config?.title || '业务标注');
  const scopeHint = pageGlobals.length || globals.length
    ? `本页规则 + ${elements.length} 处界面标注`
    : `${elements.length} 处界面标注`;

  reader.innerHTML = `
    <header class="vpa-fs-header">
      <div class="vpa-fs-title-area">
        <button type="button" class="vpa-popup-btn vpa-fs-back">‹ 返回原型 (ESC)</button>
        <div class="vpa-fs-title-stack">
          <h2>${escapeHtml(pageTitle)}</h2>
          <div class="vpa-fs-scope-hint">${escapeHtml(scopeHint)}</div>
        </div>
      </div>
      <div class="vpa-fs-actions">
        <button type="button" class="vpa-popup-btn vpa-fs-scope">${VPA_STATE.readerAll ? "返回当前页面" : "查看全部页面"}</button>
        <button type="button" class="vpa-popup-btn vpa-fs-copy">${VPA_STATE.readerAll ? "复制全部页面 Markdown" : "复制本页 Markdown"}</button>
        <button type="button" class="vpa-popup-btn vpa-fs-download">下载全部</button>
        <button type="button" class="vpa-popup-btn vpa-fs-close">✕</button>
      </div>
    </header>
    <div class="vpa-fs-body">
      <nav class="vpa-fs-toc">
        <div class="vpa-fs-toc-title">${VPA_STATE.readerAll ? "全部页面目录" : "本页目录"}</div>
        <div class="vpa-fs-toc-list">${tocHtml}</div>
      </nav>
      <main class="vpa-fs-content">
        <div class="vpa-fs-content-inner vpa-markdown">
          ${renderedHtml}
        </div>
      </main>
    </div>
    <button type="button" class="vpa-fs-back-top" title="回到顶部" aria-label="回到顶部">↑</button>
  `;

  const contentPane = reader.querySelector('.vpa-fs-content');
  const backTopBtn = reader.querySelector('.vpa-fs-back-top');
  const updateBackTopVisibility = () => {
    if (!contentPane || !backTopBtn) return;
    backTopBtn.classList.toggle('is-visible', contentPane.scrollTop > 240);
  };
  contentPane?.addEventListener('scroll', updateBackTopVisibility, { passive: true });
  backTopBtn?.addEventListener('click', () => {
    contentPane?.scrollTo({ top: 0, behavior: 'smooth' });
  });
  updateBackTopVisibility();

  const previousFocus = document.activeElement;
  reader.setAttribute('role', 'dialog');
  reader.setAttribute('aria-modal', 'true');
  reader.setAttribute('aria-label', '业务标注阅读器');
  const close = () => {
    contentPane?.removeEventListener('scroll', updateBackTopVisibility);
    reader.remove();
    window.removeEventListener('keydown', onKey, true);
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { stop(e); close(); }
    if (e.key === 'Tab') {
      const items = [...reader.querySelectorAll('button, a[href]')];
      if (e.shiftKey && document.activeElement === items[0]) { stop(e); items.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === items.at(-1)) { stop(e); items[0]?.focus(); }
    }
  };
  reader._close = close;
  window.addEventListener('keydown', onKey, true);
  reader.querySelector('.vpa-fs-scope').addEventListener('click', () => {
    VPA_STATE.readerAll = !VPA_STATE.readerAll; openFullscreenReader();
  });

  reader.querySelector('.vpa-fs-back').addEventListener('click', close);
  reader.querySelector('.vpa-fs-close').addEventListener('click', close);
  reader.querySelector('.vpa-fs-download').addEventListener('click', exportAll);
  reader.querySelector('.vpa-fs-copy').addEventListener('click', () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(markdown).then(() => showToast('已复制本页 Markdown')).catch(() => showToast('复制失败'));
    } else {
      showToast('浏览器限制无法写入剪贴板');
    }
  });

  reader.querySelectorAll('.vpa-fs-toc-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetEl = reader.querySelector(`#${item.dataset.target}`);
      if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.body.appendChild(reader);
  reader.querySelector('.vpa-fs-back').focus();
  renderMermaidIn(reader).catch(console.error);
}

function refreshOpenPopups() {
  const annotationsByKey = new Map((VPA_STATE.config.annotations || []).map((annotation) => [annotationKey(annotation), annotation]));
  for (const [key, popup] of VPA_STATE.openPopups.entries()) {
    const annotation = key === PAGE_RULES_KEY ? currentPageGlobalAnnotation() : annotationsByKey.get(key);
    if (!annotation || (key !== PAGE_RULES_KEY && !currentPageMatches(annotation))) {
      popup.remove();
      VPA_STATE.openPopups.delete(key);
      continue;
    }
    const title = popup.querySelector('.vpa-popup-header strong');
    const badge = popup.querySelector('.vpa-badge-static');
    const body = popup.querySelector('.vpa-popup-body');
    if (title) title.textContent = `需求描述：【${annotation.moduleName || annotation.title || annotation.id}】`;
    if (badge) badge.textContent = annotationDisplayLabel(annotation);
    if (body) setMarkdownContent(body, getAnnotationMarkdown(annotation));
  }
}

async function reloadBundle() {
  if (VPA_STATE.refreshPromise) return VPA_STATE.refreshPromise;
  VPA_STATE.refreshPromise = (async () => {
    const oldConfig = VPA_STATE.config, oldBase = VPA_STATE.configBaseUrl;
    try {
      const config = validateRuntimeConfig(await loadConfig(true));
      VPA_STATE.config = config;
      await hydrateMarkdownAnnotations();
    } catch (error) {
      VPA_STATE.config = oldConfig; VPA_STATE.configBaseUrl = oldBase;
      throw error;
    }
    VPA_STATE.mermaidPromise = null;
    refreshViewDisplayIndexMap();
    ensureRoot();
    refreshOpenPopups();
    renderToolbar();
    measureBadges();
    if (document.querySelector('.vpa-fullscreen-reader')) openFullscreenReader();
    return diagnostics();
  })();
  try { return await VPA_STATE.refreshPromise; }
  finally { VPA_STATE.refreshPromise = null; }
}

function updateToolbarExpandedState(toolbar) {
  const isExpanded = Boolean(VPA_STATE.toolbarExpanded);
  toolbar.classList.toggle('vpa-expanded', isExpanded);
  const toggleBtn = toolbar.querySelector('.vpa-toolbar-toggle-btn');
  if (toggleBtn) {
    toggleBtn.title = (isExpanded || !VPA_STATE.toolbarDocked) ? '收起工具栏至侧边' : '展开业务标注工具栏';
  }
}

function renderToolbar() {
  let toolbar = document.querySelector('.vpa-toolbar');
  if (toolbar) toolbar.remove();
  if (hideToolbarWhenEmpty() && !currentPageHasAnnotations()) {
    return;
  }
  toolbar = document.createElement('div');
  toolbar.className = 'vpa-toolbar';

  const dragIcon = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="7" r="1.5"/><circle cx="8" cy="7" r="1.5"/><circle cx="2" cy="12" r="1.5"/><circle cx="8" cy="12" r="1.5"/></svg>`;
  const eyeIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const eyeOffIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;
  const bookIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  const expandIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
  const chevronIcon = `<svg class="vpa-toggle-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;

  const modeIsAnnotate = VPA_STATE.mode === 'annotate';
  const modeBtnClass = modeIsAnnotate ? 'active' : '';

  const pageRulesBtnHtml = currentPageGlobalAnnotation()
    ? `<span class="vpa-toolbar-divider"></span><button type="button" data-page-rules title="查看当前页面的本页规则">${bookIcon}<span>本页规则</span></button>`
    : '';

  toolbar.innerHTML = `
    <button type="button" class="vpa-toolbar-toggle-btn" title="${VPA_STATE.toolbarExpanded ? '收起工具栏至侧边' : '展开业务标注工具栏'}">
      <span class="vpa-dock-dot"></span>
      ${chevronIcon}
    </button>
    <button type="button" class="vpa-drag" title="按住拖拽工具栏位置">${dragIcon}</button>
    <span class="vpa-toolbar-divider"></span>
    <button type="button" data-toggle-mode class="${modeBtnClass}" title="切换页面业务标注显示或隐藏">${modeIsAnnotate ? eyeIcon : eyeOffIcon}<span>标注开关</span></button>
    ${pageRulesBtnHtml}
    <span class="vpa-toolbar-divider"></span>
    <button type="button" data-fullscreen title="全屏查看当前页面与全部业务规格">${expandIcon}<span>全屏查看</span></button>
  `;
  toolbar.addEventListener('click', (event) => event.stopPropagation());
  applyRuntimeStyle(toolbar);

  // Toggle button (clicks to expand or collapse)
  const toggleBtn = toolbar.querySelector('.vpa-toolbar-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (event) => {
      stop(event);
      if (!VPA_STATE.toolbarDocked) {
        VPA_STATE.toolbarDocked = true;
        VPA_STATE.toolbarExpanded = false;
        toolbar.classList.add('vpa-docked');
        toolbar.style.left = 'auto';
        toolbar.style.top = 'auto';
        toolbar.style.right = '0';
        updateToolbarExpandedState(toolbar);
        showToast('已贴边收起');
        return;
      }
      VPA_STATE.toolbarExpanded = !VPA_STATE.toolbarExpanded;
      updateToolbarExpandedState(toolbar);
    });
  }

  toolbar.querySelector('[data-toggle-mode]').addEventListener('click', (event) => {
    stop(event);
    VPA_STATE.mode = VPA_STATE.mode === 'preview' ? 'annotate' : 'preview';
    const btn = toolbar.querySelector('[data-toggle-mode]');
    const isAnnotate = VPA_STATE.mode === 'annotate';
    btn.classList.toggle('active', isAnnotate);
    btn.innerHTML = `${isAnnotate ? eyeIcon : eyeOffIcon}<span>标注开关</span>`;
    if (!isAnnotate) { closePopups(); document.querySelector('.vpa-fullscreen-reader')?._close(); }
    measureBadges();
    showToast(isAnnotate ? '已开启标注模式' : '已关闭标注，进入纯净演示模式');
  });

  if (toolbar.querySelector('[data-page-rules]')) {
    toolbar.querySelector('[data-page-rules]').addEventListener('click', (event) => {
      stop(event);
      openPageRulesPopup();
    });
  }

  toolbar.querySelector('[data-fullscreen]').addEventListener('click', (event) => {
    stop(event);
    openFullscreenReader();
  });

  makeDraggable(toolbar, toolbar);
  document.body.appendChild(toolbar);

  if (VPA_STATE.toolbarDocked) {
    toolbar.classList.add('vpa-docked');
    toolbar.style.left = 'auto';
    toolbar.style.top = 'auto';
    toolbar.style.right = '0';
    toolbar.style.bottom = `${VPA_STATE.toolbarDockBottom || 48}px`;
    updateToolbarExpandedState(toolbar);
  } else if (VPA_STATE.toolbarPos?.userMoved) {
    const width = toolbar.offsetWidth || 300;
    const height = toolbar.offsetHeight || 38;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    toolbar.style.left = `${Math.max(8, Math.min(maxLeft, VPA_STATE.toolbarPos.x))}px`;
    toolbar.style.top = `${Math.max(8, Math.min(maxTop, VPA_STATE.toolbarPos.y))}px`;
    toolbar.style.right = 'auto';
    toolbar.style.bottom = 'auto';
  } else {
    toolbar.style.left = 'auto';
    toolbar.style.top = 'auto';
    toolbar.style.right = '16px';
    toolbar.style.bottom = '16px';
  }
}

function validateRuntimeConfig(config) {
  if (!config || !Array.isArray(config.annotations)) throw new Error('Invalid annotation bundle: annotations must be an array');
  for (const annotation of config.annotations) {
    if (!annotation || annotation.id === undefined || !annotation.moduleName) throw new Error('Invalid annotation in bundle');
    annotation.type ||= annotation.target?.selector ? 'element' : 'global';
    if (!['element', 'page-global', 'global'].includes(annotation.type)) throw new Error('Invalid annotation type');
  }
  return config;
}

async function reloadInlineBundle(url) {
  const previous = window.__VITAMIN_ANNOTATION_CONFIG__;
  const request = new URL(url); request.searchParams.set('vpa_refresh', String(Date.now()));
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let timer;
    const finish = error => {
      clearTimeout(timer); script.remove();
      if (error) { window.__VITAMIN_ANNOTATION_CONFIG__ = previous; reject(error); }
      else resolve(window.__VITAMIN_ANNOTATION_CONFIG__);
    };
    script.src = request.href;
    script.onload = () => finish(window.__VITAMIN_ANNOTATION_CONFIG__ === previous ? new Error('Inline bundle did not update') : null);
    script.onerror = () => finish(new Error('Failed to reload local annotation bundle'));
    timer = setTimeout(() => finish(new Error('Timed out loading local annotation bundle')), 10000);
    document.head.appendChild(script);
  });
}

async function loadConfig(refresh = false) {
  const scriptUrl = VPA_RUNTIME_SCRIPT_URL || location.href;
  const bundleUrl = new URL('./annotation.bundle.json', scriptUrl).href;
  VPA_STATE.configBaseUrl = bundleUrl;
  if (location.protocol === 'file:') {
    if (!refresh && window.__VITAMIN_ANNOTATION_CONFIG__) return window.__VITAMIN_ANNOTATION_CONFIG__;
    return reloadInlineBundle(new URL('./annotation.bundle.inline.js', scriptUrl).href);
  }
  // HTTP deployments always re-read the published JSON, never a stale inline snapshot.
  const response = await fetch(bundleUrl, {cache: 'no-store'});
  if (!response.ok) throw new Error(`Failed to load annotation bundle (${response.status}): ${bundleUrl}`);
  return response.json();
}

async function boot() {
  try {
    VPA_STATE.config = validateRuntimeConfig(await loadConfig());
    VPA_STATE.mode = initialAnnotationMode(VPA_STATE.config);
    VPA_STATE.layout = VPA_STATE.config?.runtime?.layout || 'drawer';
    if (VPA_STATE.config?.runtime?.toolbarDocked !== undefined) {
      VPA_STATE.toolbarDocked = Boolean(VPA_STATE.config.runtime.toolbarDocked);
    }
    await hydrateMarkdownAnnotations();
    ensureRoot();
    VPA_STATE.lastContext = contextKey();
    if (window.ResizeObserver) VPA_STATE.targetObserver = new ResizeObserver(scheduleMeasure);
    renderToolbar();
    measureBadges();
    ensureMermaid().catch(() => {});
    window.__VPA_SYNC_VIEW__ = scheduleMeasure;
    // History API emits no native event; preserve host semantics and only schedule measurement.
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (...args) { const result = original.apply(this, args); scheduleMeasure(); return result; };
    }
    document.addEventListener('load', scheduleMeasure, true);
    document.addEventListener('transitionend', scheduleMeasure, true);
    document.addEventListener('animationend', scheduleMeasure, true);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    window.addEventListener('hashchange', scheduleMeasure);
    window.addEventListener('popstate', scheduleMeasure);
    new MutationObserver((mutations) => {
      const hasBusinessMutation = mutations.some((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-vpa-view' && mutation.target === document.body) {
          return true;
        }
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        return target && !target.closest('.vpa-root, .vpa-popup, .vpa-toolbar, .vpa-toast, .vpa-fullscreen-reader');
      });
      if (hasBusinessMutation) scheduleMeasure();
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
  } catch (error) {
    console.error('[vitamin-prototype-annotation]', error);
    showToast('标注加载失败，请检查部署资源');
    throw error;
  }
}

api.refresh = reloadBundle;
api.sync = scheduleMeasure;
api.diagnostics = diagnostics;
api.ready = document.readyState === 'loading'
  ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once: true})).then(boot)
  : boot();
api.ready.catch(() => {});
})();
