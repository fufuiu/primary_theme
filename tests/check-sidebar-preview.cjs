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
    console.log('通过：功能区全部图标及文件操作可直接点击，无按钮堆叠或面板重叠。');
} finally {
    move(...restingPoint);
}
