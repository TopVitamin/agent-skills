// Optional browser regression suite. Runtime/compile users do not need Node or Playwright.
// Run: NODE_PATH=<existing-playwright-node-modules> node tests/test_runtime.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vpa-browser-'));
const source = path.join(temp, 'source'), deployment = path.join(temp, 'deploy');
const artifacts = process.env.VPA_ARTIFACT_DIR || path.join(os.tmpdir(), 'vpa-qa');
fs.mkdirSync(artifacts, {recursive: true});
const python = process.env.PYTHON || 'python3';
const command = (...args) => execFileSync(python, args, {env: {...process.env, PYTHONDONTWRITEBYTECODE:'1'}, stdio:'pipe'});
fs.cpSync(path.join(root, 'examples/static'), source, {recursive:true});
command(path.join(root, 'scripts/install_annotation_kit.py'), source, '--inject', '--with-compiler');
const configPath = path.join(source,'docs/annotations/annotation.config.json');
function publish() {
  command(path.join(source,'tools/annotation/compile_annotations.py'),configPath,'--check-sources');
  command(path.join(source,'tools/annotation/check_annotation_assets.py'),path.join(source,'annotation-kit'));
  fs.mkdirSync(path.join(deployment,'preview'),{recursive:true});
  fs.cpSync(path.join(source,'annotation-kit'),path.join(deployment,'preview/annotation-kit'),{recursive:true});
  fs.copyFileSync(path.join(source,'index.html'),path.join(deployment,'preview/index.html'));
}
publish();
fs.copyFileSync(path.join(root,'examples/static/index.html'),path.join(deployment,'preview/plain.html'));
fs.copyFileSync(path.join(source,'index.html'),path.join(deployment,'preview/中文页面.html'));
let broken = false;
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if (broken && pathname.endsWith('annotation.bundle.json')) {res.writeHead(503);return res.end('temporarily unavailable');}
  let file = path.join(deployment,pathname);
  if (!file.startsWith(deployment)) {res.writeHead(403);return res.end();}
  if (pathname.endsWith('/')) file=path.join(file,'index.html');
  if (!fs.existsSync(file) && ['/preview/orders','/preview/other'].includes(pathname)) file=path.join(deployment,'preview/index.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);return res.end('not found');}
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};
  res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'text/plain','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
let browser;
const checks=[];
async function check(name, fn){await fn();checks.push(name);console.log('PASS '+name);}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
  const page=await context.newPage();
  const errors=[], external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('file:'))external.push(r.url())});
  const ready=async()=>{await page.waitForFunction(()=>Boolean(window.VitaminAnnotations));await page.evaluate(()=>VitaminAnnotations.ready)};
  const count=async n=>page.waitForFunction(n=>document.querySelectorAll('.vpa-badge').length===n,n);
  await page.goto(origin+'/preview/plain.html');
  const baseline=await page.locator('#business-app').boundingBox();
  await page.goto(origin+'/preview/');await ready();
  await check('cloud-shaped subdirectory deployment, no source files needed',async()=>{
    assert.equal(await page.title(),'原型标注接入示例');
    assert.equal(await page.evaluate(()=>renderMarkdown('host')),'host');
    assert.equal(await page.evaluate(()=>renderToolbar()),'host toolbar');
    assert.deepEqual(await page.locator('#business-app').boundingBox(),baseline);
    assert.equal(await page.locator('.vpa-toolbar').count(),1);
    assert.equal(await page.locator('.vpa-badge').count(),0);
  });
  await page.click('[data-toggle-mode]');await count(1);
  await check('badges, shared rules and page rules are readable',async()=>{
    await page.click('[data-page-rules]');
    const content=await page.locator('.vpa-popup-body').innerText();assert(content.includes('跨页规则'));assert(content.includes('查询结果'));
    assert.deepEqual(await page.locator('#business-app').boundingBox(),baseline);
    const drawer = await page.locator('.vpa-popup').boundingBox(); assert.equal(drawer.y, 0); assert.equal(drawer.height, 900);
    await page.screenshot({path:path.join(artifacts,'desktop-rules.png'),animations:'disabled'});
    await page.click('.vpa-close');
  });
  await check('reader TOC stays aligned with nested source headings and full export',async()=>{
    await page.click('[data-fullscreen]');
    const links=await page.locator('.vpa-fs-toc-item').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,target:document.getElementById(n.dataset.target)?.textContent})));
    for(const link of links)assert.equal(link.text,link.target);
    assert(!(await page.locator('.vpa-fs-content').innerText()).includes('最多 20'));
    await page.click('.vpa-fs-scope');assert((await page.locator('.vpa-fs-content').innerText()).includes('最多 20'));
    const downloadPromise=page.waitForEvent('download');await page.click('.vpa-fs-download');const download=await downloadPromise;
    const text=fs.readFileSync(await download.path(),'utf8');assert(text.includes('这段引言'));assert(text.includes('<!-- anno:start id=shared -->'));assert(text.includes('文档末尾说明'));
    await page.keyboard.press('Escape');assert.equal(await page.locator('.vpa-fullscreen-reader').count(),0);
  });
  await check('hidden regions and multiple matching cached containers',async()=>{
    await page.click('#show-help');await count(2);await page.click('[data-annotation-key="demo:help"]');assert((await page.locator('.vpa-popup-body').innerText()).includes('不触发真实业务导出'));await page.click('.vpa-close');await page.click('#close-help');await count(1);
    await page.evaluate(()=>{const hidden=document.createElement('section');hidden.hidden=true;hidden.dataset.anno='product-table';document.body.prepend(hidden)});await count(1);
  });
  await check('view switches clear stale popups while form actions still work',async()=>{
    await page.click('[data-annotation-key="demo:table"]');await page.click('#go-create');await page.waitForSelector('[data-annotation-key="demo:form"]');await count(1);assert.equal(await page.locator('.vpa-popup').count(),0);
    await page.fill('#product-name','演示名称');await page.click('button[type="submit"]');assert((await page.locator('#save-result').innerText()).includes('演示保存成功'));
    await page.click('[data-page-rules]');assert((await page.locator('.vpa-popup-body').innerText()).includes('保存边界'));
    await page.click('[data-toggle-mode]');await count(0);assert.equal(await page.locator('.vpa-popup').count(),0);
  });
  await check('HTTP refresh reads republished Markdown, not initial inline snapshot',async()=>{
    const md=path.join(source,'docs/annotations/page.md');fs.writeFileSync(md,fs.readFileSync(md,'utf8').replace('最多 20 个字符','最多 20 个字符（更新标注测试）'));publish();
    await page.evaluate(()=>VitaminAnnotations.refresh());await page.click('[data-toggle-mode]');await count(1);await page.click('[data-annotation-key="demo:form"]');assert((await page.locator('.vpa-popup-body').innerText()).includes('更新标注测试'));
    broken=true;const result=await page.evaluate(()=>VitaminAnnotations.refresh().then(()=>false,()=>true));assert(result);assert((await page.locator('.vpa-popup-body').innerText()).includes('更新标注测试'));broken=false;
  });
  await check('scope absence does not leak other views; regex overrides wildcard page',async()=>{
    const config=JSON.parse(fs.readFileSync(configPath));config.annotations.push({id:'route',type:'element',page:'*',routeMatcher:'^/preview/orders$',moduleName:'路径匹配测试',target:{selector:'#business-app'},markdown:'路径专属测试'});fs.writeFileSync(configPath,JSON.stringify(config));publish();
    await page.evaluate(()=>VitaminAnnotations.refresh());
    await page.evaluate(()=>{delete document.body.dataset.vpaView;VitaminAnnotations.sync()});await count(0);
    assert((await page.evaluate(()=>VitaminAnnotations.diagnostics())).annotations.some(a=>a.status==='missing-view'));
    await page.evaluate(()=>history.pushState({},'','/preview/orders'));await count(1);
    await page.click('[data-annotation-key="demo:route"]');await page.evaluate(()=>history.replaceState({},'','/preview/other'));await count(0);assert.equal(await page.locator('.vpa-popup').count(),0);assert.equal(await page.locator('.vpa-toolbar').count(),0);
    await page.evaluate(()=>history.pushState({},'','/preview/orders'));assert.equal(await page.locator('.vpa-toolbar').count(),1);
  });
  await check('duplicate runtime injection does not replace host state or duplicate UI',async()=>{
    await page.addScriptTag({url:origin+'/preview/annotation-kit/runtime.js'});assert.equal(await page.locator('.vpa-toolbar').count(),1);assert.equal(await page.evaluate(()=>boot()),'host boot');
  });
  await check('Chinese filename route and mobile reader remain inside viewport',async()=>{
    await page.setViewportSize({width:390,height:844});await page.goto(origin+'/preview/中文页面.html');await ready();await page.click('[data-toggle-mode]');await count(1);await page.click('[data-page-rules]');
    const rect=await page.locator('.vpa-popup').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=391);
    await page.click('[data-fullscreen]');assert.equal(await page.locator('.vpa-fs-scope').isVisible(),true);
    await page.locator('.vpa-fullscreen-reader').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
    assert(await page.locator('.vpa-fs-scope').evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)); }));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(artifacts,'mobile-reader.png'),animations:'disabled'});
  });
  await check('file:// refresh reloads compiled inline content',async()=>{
    await page.setViewportSize({width:1280,height:900});await page.goto(pathToFileURL(path.join(source,'index.html')).href);await ready();await page.click('[data-toggle-mode]');await count(1);
    const md=path.join(source,'docs/annotations/page.md');fs.writeFileSync(md,fs.readFileSync(md,'utf8').replace('名称按包含关系筛选','名称按包含关系筛选（本地更新验证）'));publish();
    await page.evaluate(()=>VitaminAnnotations.refresh());await page.click('[data-annotation-key="demo:table"]');assert((await page.locator('.vpa-popup-body').innerText()).includes('本地更新验证'));
  });
  await check('no runtime exceptions or automatic external requests',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[])});
  console.log(JSON.stringify({passed:checks.length,artifacts,checks},null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{await browser?.close();server.close();fs.rmSync(temp,{recursive:true,force:true})});
