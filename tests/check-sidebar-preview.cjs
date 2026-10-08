// Run with Personal OSV2 open, both sidebars expanded, Claudian in compact mode, and Primary-OnePage-preview enabled.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const cli = (...args) => execFileSync('obsidian', ['vault=Personal OSV2', ...args], { encoding: 'utf8' }).trim();
const evaluate = code => {
    const output = cli('eval', `code=${code}`);
    assert(output.startsWith('=> '), output);
    return JSON.parse(output.slice(3));
};
const move = (x, y) => cli('dev:cdp', 'method=Input.dispatchMouseEvent',
    `params=${JSON.stringify({ type: 'mouseMoved', x, y, button: 'none' })}`);
const cdp = (method, params) => JSON.parse(cli('dev:cdp', `method=${method}`, `params=${JSON.stringify(params)}`));
const forcedHeaders = new Set();
const hoverPanel = (type, active = true) => {
    const rootNode = cdp('DOM.getDocument', {depth:0}).root.nodeId;
    const nodeId = cdp('DOM.querySelector', {nodeId:rootNode, selector:`.mod-sidedock [data-type="${type}"] .nav-header:first-child`}).nodeId;
    if (nodeId) cdp('CSS.forcePseudoState', {nodeId, forcedPseudoClasses:active ? ['hover'] : []});
    if (active) forcedHeaders.add(type);
};
const settlePanelActions = () => evaluate(`(() => {
    for (const header of document.querySelectorAll('.mod-sidedock .workspace-leaf-content .nav-header:first-child')) {
        const svg = header.querySelector('svg');
        if (svg) getComputedStyle(svg).width;
        header.getAnimations({subtree:true}).forEach(animation => animation.finish());
    }
    return JSON.stringify(true);
})()`);
const measure = () => evaluate(`(() => {
    const rect = selector => {
        const e = document.querySelector(selector);
        const r = e.getBoundingClientRect(), s = getComputedStyle(e);
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom, clickable:hit===e||e.contains(hit),
            borderWidth:s.borderTopWidth, shadow:s.boxShadow };
    };
    const controls = (selector, root = document) => [...root.querySelectorAll(selector)].map((e, index) => {
        const r = e.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const svg = e.querySelector('svg')?.getBoundingClientRect();
        return { label:e.getAttribute('aria-label')||'Sidebar toggle', index,
            icon:svg ? {width:svg.width, height:svg.height} : null,
            radius:parseFloat(getComputedStyle(e).borderTopLeftRadius),
            x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom,
            clickable:hit===e||e.contains(hit) };
    }).filter(r => r.width > 0 && r.height > 0);
    return JSON.stringify({ root:rect('.mod-root'), left:rect('.mod-left-split'),
        right:rect('.mod-right-split'), ribbon:rect('.workspace-ribbon'),
        tab:rect('.mod-root .workspace-tab-header.is-active'),
        page:rect('.mod-root .workspace-leaf-content'),
        fileHeader:rect('[data-type="file-explorer"] .nav-header'),
        fileList:rect('[data-type="file-explorer"] .nav-files-container'),
        chatVisible:[...document.querySelectorAll('.claudian-container')].some(e => e.getBoundingClientRect().width > 0),
        panelHeaders:[...document.querySelectorAll('.mod-sidedock .workspace-leaf-content .nav-header:first-child')]
            .filter(e => e.getBoundingClientRect().width > 0 && e.querySelector('.nav-action-button'))
            .map(e => { const r = e.getBoundingClientRect(), row = getComputedStyle(e.querySelector('.nav-buttons-container')); return {type:e.closest('.workspace-leaf-content').dataset.type,
                background:row.backgroundColor, gap:row.gap,
                x:r.x, y:r.y, width:r.width, height:r.height, buttons:controls('.nav-action-button', e),
                groups:[...e.querySelectorAll('.nav-buttons-container :not(.nav-action-button):has(> .nav-action-button)')].map(g => {
                    const s = getComputedStyle(g);
                    return {border:parseFloat(s.borderTopWidth), radius:parseFloat(s.borderTopLeftRadius), height:g.getBoundingClientRect().height,
                        gap:parseFloat(s.gap), separators:[...g.querySelectorAll('.nav-action-button')].map(b => parseFloat(getComputedStyle(b).borderLeftWidth))};
                })}; }),
        standardControl:controls('.mod-root .view-actions .clickable-icon')[0],
        ribbonControls:controls('.workspace-ribbon .clickable-icon'),
        fileControls:controls('[data-type="file-explorer"] .nav-action-button'),
        chatControls:controls('.claudian-view-input-nav-row .claudian-input-nav-btn') });
})()`);

let view = measure();
const restingPoint = [view.root.x + view.root.width / 2, 100];
try {
    for (const panel of view.panelHeaders) hoverPanel(panel.type, false);
    move(...restingPoint);
    settlePanelActions();
    view = measure();
    assert(view.fileControls.every(c => c.width <= 5 && c.icon?.width === 0), 'File toolbar buttons do not collapse into dots');
    const restingListY = view.fileList.y;
    for (const panel of view.panelHeaders) {
        assert(panel.buttons.every(c => c.width <= 6 && c.icon?.width === 0), `Panel does not collapse: ${panel.type}`);
        assert(panel.groups.every(g => g.border === 0 && g.gap >= 4 && g.separators.every(w => w === 0)),
            `Collapsed panel still has boxes or separators: ${panel.type}`);
        hoverPanel(panel.type);
        settlePanelActions();
        const expanded = measure().panelHeaders.find(p => p.type === panel.type);
        assert(expanded.height > panel.height, `Panel does not expand: ${panel.type}`);
        const centers = expanded.buttons.map(c => c.y + c.height / 2);
        assert(Math.max(...centers) - Math.min(...centers) <= 1, `Panel actions wrap onto another row: ${panel.type}`);
        assert(expanded.buttons.every(c => c.width >= 20 && c.height >= 20 && c.icon?.width >= 12 && c.clickable),
            `Panel controls squeezed or covered: ${panel.type}`);
        const standard = view.standardControl;
        assert(expanded.buttons.every(c => c.height <= standard.height+1) && expanded.groups.every(g => g.height <= standard.height+2),
            `Panel buttons are oversized relative to page controls: ${panel.type}`);
        assert.equal(expanded.background, 'rgba(0, 0, 0, 0)', 'Panel toolbar should have a transparent surface');
        assert.equal(expanded.gap, '2px', 'Panel toolbar spacing differs');
        assert(expanded.buttons.every(c => c.icon?.width === standard.icon.width && c.icon?.height === standard.icon.height),
            `Panel icons differ from regular page icons: ${panel.type}`);
        assert(expanded.groups.every(g => g.radius === standard.radius), `Panel group corners differ from page controls: ${panel.type}`);
    }
    hoverPanel('file-explorer');
    settlePanelActions();
    view = measure();
    assert(view.fileList.y > restingListY, 'Collapsed toolbar does not recover vertical space');
    assert(view.fileControls.every(c => c.icon?.width >= 12), 'File toolbar icons do not reappear');
    assert(view.ribbon.x >= 0 && view.ribbon.right <= view.left.x + 1, 'Ribbon overlaps the sidebar');
    assert(view.left.right <= view.root.x + 1, 'Left sidebar overlaps the document');
    assert(view.root.right <= view.right.x + 1, 'Document overlaps the right sidebar');
    assert.equal(view.page.borderWidth, '0px', 'Document still has a frame');
    assert.equal(view.tab.borderWidth, '0px', 'Active tab still has an accent outline');
    if (view.chatVisible) assert.equal(view.chatControls.length, 3, 'Claudian compact navigation is missing');
    for (const control of view.chatControls) {
        assert(control.icon?.width >= 12 && control.icon?.height >= 12,
            `Claudian icon squeezed or hidden: ${control.label}`);
    }
    for (const group of [view.ribbonControls, view.fileControls, ...(view.chatVisible ? [view.chatControls] : [])]) {
        assert(group.length > 0, 'Controls missing');
        for (const [index, control] of group.entries()) {
            assert(control.width >= 20 && control.height >= 20 && control.clickable,
                `Control covered or too small: ${control.label}`);
            for (const other of group.slice(index + 1)) {
                const overlapX = Math.min(control.right, other.right) - Math.max(control.x, other.x);
                const overlapY = Math.min(control.bottom, other.bottom) - Math.max(control.y, other.y);
                assert(overlapX <= 1 || overlapY <= 1, `Overlapping controls: ${control.label}, ${other.label}`);
            }
        }
    }
    const sidebarTabs = evaluate(`(() => {
        const rect = e => { const r = e.getBoundingClientRect(); return {x:r.x, y:r.y, width:r.width, height:r.height, right:r.right}; };
        const hit = e => { const r = rect(e), target = document.elementFromPoint(r.x+r.width/2, r.y+r.height/2); return target===e||e.contains(target); };
        const measureHeader = header => {
            const row = header.querySelector('.workspace-tab-header-container-inner'),
                menu = header.querySelector('.workspace-tab-header-tab-list .clickable-icon');
            return {row:rect(row), overflow:row.scrollWidth-row.clientWidth, menu:rect(menu),
                tabs:[...row.querySelectorAll('.workspace-tab-header')].map(e => ({...rect(e), hit:hit(e), icon:rect(e.querySelector('svg'))}))};
        };
        const actual = [...document.querySelectorAll('.mod-sidedock > .workspace-tabs.mod-top > .workspace-tab-header-container')]
            .filter(e => e.offsetWidth > 0).map(measureHeader);
        const windowButton = rect(document.querySelector('.titlebar-button.mod-minimize'));
        const side = document.querySelector('.mod-right-split'), original = side.querySelector('.workspace-tab-header-container');
        const host = document.createElement('div'), copy = side.cloneNode(false), tabs = original.parentElement.cloneNode(false), header = original.cloneNode(true);
        host.className = 'workspace';
        host.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px;height:300px;pointer-events:none';
        host.setAttribute('aria-hidden', 'true');
        tabs.append(header); copy.append(tabs); host.append(copy); document.body.append(host);
        try {
            const layouts = [250,300,338,420,500].map(width => {
                copy.style.width = width+'px';
                const row = header.querySelector('.workspace-tab-header-container-inner');
                row.scrollLeft = 0;
                const result = {width, ...measureHeader(header)};
                row.scrollLeft = row.scrollWidth;
                result.lastAtEnd = rect(row.lastElementChild).right <= rect(row).right+1;
                return result;
            });
            return JSON.stringify({actual, windowButton, layouts});
        } finally { host.remove(); }
    })()`);
    assert(sidebarTabs.actual.length >= 2, 'Sidebar tab strips missing');
    for (const panel of sidebarTabs.actual) {
        assert.equal(panel.menu.width, 0, 'Sidebar tabs have a duplicate dropdown entry');
        assert(panel.tabs.every(tab => Math.abs(tab.y+tab.height/2-sidebarTabs.windowButton.y-sidebarTabs.windowButton.height/2) <= 1),
            'Sidebar tabs and window controls are vertically misaligned');
        if (panel.overflow <= 1) assert(panel.tabs.every(tab => tab.hit), 'Fitting sidebar tabs are obscured');
    }
    const iconSize = sidebarTabs.actual.at(-1).tabs[0].icon.width;
    for (const panel of sidebarTabs.layouts) {
        assert.equal(panel.menu.width, 0, 'Sidebar tabs have a duplicate dropdown entry at width '+panel.width);
        assert(panel.tabs.every(tab => tab.width >= 22 && tab.height >= 24 && tab.icon.width === iconSize && tab.icon.height === iconSize),
            'Sidebar icons shrink or targets collapse at width '+panel.width);
        const widths = panel.tabs.map(tab => tab.width);
        assert(Math.max(...widths)-Math.min(...widths) <= 0.1, 'Sidebar tabs have uneven widths');
        assert(panel.lastAtEnd, 'Last sidebar tab cannot be reached by scrolling');
        if (panel.tabs.length <= 7 && panel.width >= 338) assert(panel.overflow <= 1, 'Seven tabs should fit at width '+panel.width);
    }
    const colors = evaluate(`(() => {
        const sample = document.createElement('div');
        sample.style.cssText = 'position:fixed;left:-9999px;pointer-events:none';
        sample.innerHTML = '<div class="markdown-preview-view markdown-rendered reader">' +
            [1,2,3,4,5,6].map(n => '<h'+n+'>标题</h'+n+'>').join('') +
            '<strong>重点</strong><em>补充</em><a class="internal-link">链接</a>' +
            ['tip','warning','error'].map(type => '<div class="callout" data-callout="'+type+'"><div class="callout-title">提示</div><div class="callout-icon"></div></div>').join('') +
            '<blockquote><p>说明与 <code>7z</code></p></blockquote><pre><code>7z l 文件.7z</code></pre>' +
            '<table><thead><tr><th>动词</th></tr></thead><tbody><tr><td>解压</td></tr></tbody></table></div>' +
            '<div class="markdown-source-view mod-cm6 is-live-preview"><div class="cm-s-obsidian editor">' +
            [1,2,3,4,5,6].map(n => '<div class="cm-line HyperMD-header HyperMD-header-'+n+'"><span class="cm-header-'+n+'">标题</span></div>').join('') +
            '<span class="cm-strong">重点</span><span class="cm-em">补充</span>' +
            '<span class="cm-hmd-internal-link"><span class="cm-underline">链接</span></span>' +
            ['first','middle','last'].map(id => '<div class="cm-line HyperMD-quote quote-'+id+'">说明</div>').join('') +
            '<div class="HyperMD-codeblock-bg HyperMD-codeblock-begin-bg">代码</div>' +
            '<div class="HyperMD-codeblock-bg HyperMD-codeblock-end-bg">结束</div></div></div>';
        document.body.appendChild(sample);
        const color = selector => getComputedStyle(sample.querySelector(selector)).color;
        const surface = selector => {
            const s = getComputedStyle(sample.querySelector(selector));
            return { background:s.backgroundColor, top:parseFloat(s.borderTopWidth), bottom:parseFloat(s.borderBottomWidth),
                left:parseFloat(s.borderLeftWidth), radius:s.borderTopLeftRadius, padding:s.padding };
        };
        try {
            return JSON.stringify({ background:getComputedStyle(document.body).getPropertyValue('--background-primary').trim(),
                headings:[1,2,3,4,5,6].map(n => color('.reader h'+n)),
                editorHeadings:[1,2,3,4,5,6].map(n => color('.editor .cm-header-'+n)),
                emphasis:['.reader strong','.reader em','.reader .internal-link'].map(color),
                editorEmphasis:['.editor .cm-strong','.editor .cm-em','.editor .cm-underline'].map(color),
                callouts:['tip','warning','error'].map(type => ({
                    title:color('[data-callout="'+type+'"] .callout-title'),
                    icon:color('[data-callout="'+type+'"] .callout-icon') })),
                surfaces:['blockquote','pre','th','td','.quote-first','.quote-middle','.quote-last',
                    '.HyperMD-codeblock-begin-bg','.HyperMD-codeblock-end-bg'].map(surface),
                typography:['.reader','.markdown-source-view'].map(selector => {
                    const s = getComputedStyle(sample.querySelector(selector)), body = getComputedStyle(document.body);
                    return { lineHeight:s.getPropertyValue('--line-height-normal').trim(),
                        fontsUnchanged:['--font-text-theme','--font-text-size','--font-normal','--font-semibold','--font-bold']
                            .every(key => s.getPropertyValue(key) === body.getPropertyValue(key)) };
                }) });
        } finally { sample.remove(); }
    })()`);
    assert.equal(new Set(colors.headings).size, 6, 'Heading levels lost their distinct colors');
    assert.equal(new Set(colors.emphasis).size, 3, 'Emphasis and links are indistinguishable');
    assert.deepEqual(colors.headings, colors.editorHeadings, 'Reading and editing heading colors differ');
    assert.deepEqual(colors.emphasis, colors.editorEmphasis, 'Reading and editing emphasis colors differ');
    assert.equal(new Set(colors.callouts.map(c => c.title)).size, 3, 'Callout types lost their distinct colors');
    assert(colors.callouts.every(c => c.title === c.icon), 'Callout titles and icons use different semantic colors');
    const luminance = channels => channels.map(value => value / 255).reduce((sum, value, i) =>
        sum + [0.2126, 0.7152, 0.0722][i] * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4), 0);
    const background = luminance([1,3,5].map(i => parseInt(colors.background.slice(i, i + 2), 16)));
    for (const color of [...colors.headings, ...colors.emphasis]) {
        const foreground = luminance(color.match(/[\d.]+/g).slice(0,3).map(Number));
        const ratio = (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
        assert(ratio >= 4.5, `Text contrast too low: ${color}, ${ratio}`);
    }
    const [quote, code, header, cell, first, middle, last, begin, end] = colors.surfaces;
    assert.equal(quote.background, first.background, 'Quote surfaces differ between modes');
    assert.equal(quote.top, 0, 'Quote has an extra frame');
    assert(first.top > 0 && middle.top === 0 && middle.bottom === 0 && last.bottom > 0,
        'Consecutive quote lines no longer form one padded block');
    assert(code.top > 0 && begin.top > 0 && end.bottom > 0 && code.background === begin.background,
        'Code surfaces or boundaries differ between modes');
    assert.equal(header.background, 'rgba(0, 0, 0, 0)', 'Table header has a competing filled background');
    assert(header.top === 0 && header.left === 0 && header.bottom > cell.top, 'Table header hierarchy lost');
    assert.equal(header.padding, '8px 12px', 'Table spacing is too tight');
    assert.equal(header.padding, cell.padding, 'Header and cells have different spacing');
    assert(colors.typography.every(t => t.fontsUnchanged && t.lineHeight === '1.7'), 'Document typography changed unexpectedly');
    const motion = evaluate(`(async () => {
        const fs = require('fs'), root = ${JSON.stringify(require('node:path').resolve(__dirname, '..'))};
        const base = [...document.styleSheets].filter(s => s.href?.includes('app.css'))
            .map(s => [...s.cssRules].map(r => r.cssText).join(String.fromCharCode(10))).join(String.fromCharCode(10));
        const markup = document.querySelector('[data-type="file-explorer"] .nav-header').outerHTML;
        const css = fs.readFileSync(root + '/theme.css', 'utf8') + fs.readFileSync(root + '/snippets/Primary-OnePage-preview.css', 'utf8');
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;left:-9999px;width:338px;height:200px';
        document.body.appendChild(frame);
        try {
            frame.srcdoc = '<style>' + base + '</style><style>' + css.replaceAll(':hover', '.motion-hover') + '</style>' +
                '<style>html,body{contain:none!important;height:auto;display:block}.workspace{height:auto;display:block}' +
                '.workspace-split.mod-sidedock{width:338px!important;height:auto!important;margin:0!important;padding:0!important}' +
                '.workspace-leaf-content{height:auto}</style><body class="mod-linux obsidian-app theme-light">' +
                '<div class="workspace"><div class="workspace-split mod-sidedock"><div class="workspace-leaf-content">' +
                '<div class="view-content">' + markup + '</div></div></div></div>';
            await new Promise(resolve => frame.onload = resolve);
            const header = frame.contentDocument.querySelector('.nav-header'),
                row = header.querySelector('.nav-buttons-container'), button = header.querySelector('.nav-action-button'),
                svg = button.querySelector('svg'), style = e => frame.contentWindow.getComputedStyle(e);
            const snapshot = () => ({row:row.getBoundingClientRect().width, button:button.getBoundingClientRect().width,
                icon:svg.getBoundingClientRect().width, height:header.getBoundingClientRect().height});
            style(svg).width;
            header.getAnimations({subtree:true}).forEach(a => a.finish());
            const rest = snapshot(), traces = [];
            for (const opening of [true, false]) {
                header.classList.toggle('motion-hover', opening);
                style(svg).width;
                const animations = header.getAnimations({subtree:true});
                animations.forEach(a => a.pause());
                const samples = [];
                for (const time of [0,16,32,64,120,200,320]) {
                    animations.forEach(a => a.currentTime = time);
                    samples.push(snapshot());
                }
                animations.forEach(a => a.finish());
                style(svg).width;
                traces.push(samples);
            }
            return JSON.stringify({rest, traces});
        } finally { frame.remove(); }
    })()`);
    const [opening, closing] = motion.traces;
    for (const key of ['row','button','icon','height']) {
        assert(Math.abs(opening[0][key]-motion.rest[key]) <= 0.15, 'Toolbar jumps at the start of opening: '+key);
        assert(Math.abs(closing.at(-1)[key]-motion.rest[key]) <= 0.15, 'Toolbar does not return to its collapsed size: '+key);
        for (let i = 1; i < opening.length; i++) {
            assert(opening[i][key] >= opening[i-1][key]-0.15, 'Toolbar reverses while opening: '+key);
            assert(closing[i][key] <= closing[i-1][key]+0.15, 'Toolbar reverses while closing: '+key);
        }
    }
    assert(opening.at(-1).icon === view.standardControl.icon.width, 'Expanded animation ends at the wrong icon size');
    assert([...opening, ...closing].every(s => s.icon <= s.button+0.15), 'Animated icon overflows its button');
    console.log('通过：侧栏标签对齐与尺寸适配、无重复下拉入口、操作栏尺寸与点击区域、动画收放、文档配色与字体参数检查通过。');
} finally {
    for (const type of forcedHeaders) hoverPanel(type, false);
    move(...restingPoint);
}
