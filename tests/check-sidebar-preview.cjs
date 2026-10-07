// Run with Personal OSV2 open, both sidebars expanded, and Primary-OnePage-preview enabled.
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
const measure = () => evaluate(`(() => {
    const rect = selector => {
        const e = document.querySelector(selector);
        const r = e.getBoundingClientRect(), s = getComputedStyle(e);
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom, clickable:hit===e||e.contains(hit),
            borderWidth:s.borderTopWidth, shadow:s.boxShadow };
    };
    const controls = selector => [...document.querySelectorAll(selector)].map((e, index) => {
        const r = e.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { label:e.getAttribute('aria-label')||'Sidebar toggle', index,
            x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom,
            clickable:hit===e||e.contains(hit) };
    }).filter(r => r.width > 0 && r.height > 0);
    return JSON.stringify({ root:rect('.mod-root'), left:rect('.mod-left-split'),
        right:rect('.mod-right-split'), ribbon:rect('.workspace-ribbon'),
        tab:rect('.mod-root .workspace-tab-header.is-active'),
        page:rect('.mod-root .workspace-leaf-content'),
        ribbonControls:controls('.workspace-ribbon .clickable-icon'),
        fileControls:controls('[data-type="file-explorer"] .nav-action-button') });
})()`);

let view = measure();
const restingPoint = [view.root.x + view.root.width / 2, 100];
try {
    move(...restingPoint);
    view = measure();
    assert(view.ribbon.x >= 0 && view.ribbon.right <= view.left.x + 1, 'Ribbon overlaps the sidebar');
    assert(view.left.right <= view.root.x + 1, 'Left sidebar overlaps the document');
    assert(view.root.right <= view.right.x + 1, 'Document overlaps the right sidebar');
    assert.equal(view.page.borderWidth, '0px', 'Document still has a frame');
    assert.equal(view.tab.borderWidth, '0px', 'Active tab still has an accent outline');
    for (const group of [view.ribbonControls, view.fileControls]) {
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
    const colors = evaluate(`(() => {
        const sample = document.createElement('div');
        sample.style.cssText = 'position:fixed;left:-9999px;pointer-events:none';
        sample.innerHTML = '<div class="markdown-rendered reader">' +
            [1,2,3,4,5,6].map(n => '<h'+n+'>标题</h'+n+'>').join('') +
            '<strong>重点</strong><em>补充</em><a class="internal-link">链接</a>' +
            ['tip','warning','error'].map(type => '<div class="callout" data-callout="'+type+'"><div class="callout-title">提示</div><div class="callout-icon"></div></div>').join('') + '</div>' +
            '<div class="markdown-source-view mod-cm6"><div class="cm-s-obsidian editor">' +
            [1,2,3,4,5,6].map(n => '<div class="cm-line HyperMD-header HyperMD-header-'+n+'"><span class="cm-header-'+n+'">标题</span></div>').join('') +
            '<span class="cm-strong">重点</span><span class="cm-em">补充</span>' +
            '<span class="cm-hmd-internal-link"><span class="cm-underline">链接</span></span></div></div>';
        document.body.appendChild(sample);
        const color = selector => getComputedStyle(sample.querySelector(selector)).color;
        try {
            return JSON.stringify({ background:getComputedStyle(document.body).getPropertyValue('--background-primary').trim(),
                headings:[1,2,3,4,5,6].map(n => color('.reader h'+n)),
                editorHeadings:[1,2,3,4,5,6].map(n => color('.editor .cm-header-'+n)),
                emphasis:['.reader strong','.reader em','.reader .internal-link'].map(color),
                editorEmphasis:['.editor .cm-strong','.editor .cm-em','.editor .cm-underline'].map(color),
                callouts:['tip','warning','error'].map(type => ({
                    title:color('[data-callout="'+type+'"] .callout-title'),
                    icon:color('[data-callout="'+type+'"] .callout-icon') })) });
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
    console.log('通过：全部按钮可点击且不重叠；文档色彩分层清楚、两种模式一致，文字对比度通过。');
} finally {
    move(...restingPoint);
}
