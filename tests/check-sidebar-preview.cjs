// Run with Personal OSV2 open and Primary-OnePage-preview enabled.
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
        return { x:r.x, y:r.y, width:r.width, right:r.right, clickable:hit===e||e.contains(hit),
            borderWidth:s.borderTopWidth, shadow:s.boxShadow };
    };
    return JSON.stringify({ root:rect('.mod-root'), left:rect('.mod-left-split'),
        right:rect('.mod-right-split'), ribbon:rect('.workspace-ribbon'),
        ribbonButton:rect('.workspace-ribbon .clickable-icon'),
        actions:rect('[data-type="file-explorer"] .nav-header'),
        actionButton:rect('[data-type="file-explorer"] .nav-action-button'),
        tab:rect('.mod-root .workspace-tab-header.is-active'),
        page:rect('.mod-root .workspace-leaf-content') });
})()`);

let view = measure();
const restingPoint = [view.root.x + view.root.width / 2, 100];
try {
    move(...restingPoint);
    view = measure();
    assert(view.ribbon.right <= view.left.x, 'Resting ribbon overlaps the sidebar');
    assert(view.left.right <= view.root.x + 1, 'Left sidebar overlaps the document');
    assert(view.root.right <= view.right.x + 1, 'Document overlaps the right sidebar');
    assert.equal(view.page.borderWidth, '0px', 'Document still has a frame');
    assert.equal(view.tab.borderWidth, '0px', 'Active tab still has an accent outline');
    move(2, view.ribbon.y + 10);
    view = measure();
    assert(view.ribbon.x >= 0 && view.ribbonButton.clickable, 'Ribbon does not reveal usable controls');
    move(view.actions.x + view.actions.width / 2, view.actions.y + 10);
    view = measure();
    assert(view.actionButton.width >= 20 && view.actionButton.clickable, 'File actions cannot be reached');
    console.log('通过：侧栏无重叠，工具栏和文件操作可用，页面与标签页无多余描边。');
} finally {
    move(...restingPoint);
}
