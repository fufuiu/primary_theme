// Uses native updateTabDisplay on isolated DOM; never selects or scrolls the user's tabs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const source = fs.readFileSync(path.join(__dirname, '../plugins/primary-sidebar-scroll/main.js'), 'utf8');
const output = execFileSync('obsidian', ['vault=Personal OSV2', 'eval', `code=(() => {
    const native = app.workspace.rightSplit.children.find(child => typeof child.updateTabDisplay === 'function');
    if (!native) throw new Error('No sidebar tabs available for the isolated check');
    const original = app.plugins.plugins['primary-sidebar-scroll']?.originalUpdateTabDisplay || Object.getPrototypeOf(native).updateTabDisplay;
    const host = document.createElement('div');
    host.className = 'workspace';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:400px;pointer-events:none';
    host.style.setProperty('--primary-personal-theme', '1');
    const side = host.createDiv('mod-sidedock mod-right-split');
    const row = side.createDiv('workspace-tab-header-container-inner');
    row.style.cssText = 'display:flex;width:196px;flex:none;overflow-x:auto;gap:4px';
    const content = side.createDiv();
    const template = native.children[0].tabHeaderEl;
    const children = Array.from({length:8}, () => {
        const tabHeaderEl = template.cloneNode(true);
        tabHeaderEl.removeClass('is-active');
        row.append(tabHeaderEl);
        return {tabHeaderEl, containerEl:content.createDiv(), loadIfDeferred() {}};
    });
    const prototype = Object.create(Object.getPrototypeOf(native));
    prototype.updateTabDisplay = original;
    const fixture = Object.assign(Object.create(prototype), {
        children, currentTab:0, isStacked:false, tabsInnerEl:row, tabsContainerEl:content,
        containerEl:host, getRoot:() => app.workspace.rightSplit, updateSlidingTabs() {},
        workspace:{requestSaveLayout() {}, requestResize() {}}
    });
    const callbacks = [];
    class Plugin { register(callback) { callbacks.push(callback); } }
    function WorkspaceTabs() {}
    WorkspaceTabs.prototype = prototype;
    const module = {exports:{}};
    new Function('require', 'module', 'exports', ${JSON.stringify(source)})(
        () => ({Plugin, WorkspaceTabs}), module, module.exports);
    const plugin = new module.exports();
    document.body.append(host);
    const results = {};
    const select = index => { fixture.currentTab = index; fixture.updateTabDisplay(); return row.scrollLeft; };
    try {
        select(0);
        row.scrollLeft = 36;
        results.nativeJump = select(2);
        select(0);
        plugin.onload();
        row.scrollLeft = 36;
        results.visible = select(2);
        results.visibleLeft = select(1);
        results.partlyVisible = select(6);
        results.hiddenRight = select(7);
        results.hiddenLeft = select(0);
        select(7);
        row.scrollLeft = 0;
        results.refresh = select(7);
        row.scrollLeft = 36;
        select(1);
        row.style.width = '250px';
        results.resize = select(1);
        row.style.width = '196px';
        fixture.getRoot = () => app.workspace.rootSplit;
        row.scrollLeft = 36;
        results.editor = select(2);
        fixture.getRoot = () => app.workspace.rightSplit;
        host.style.setProperty('--primary-personal-theme', '0');
        row.scrollLeft = 36;
        results.otherTheme = select(2);
        host.style.setProperty('--primary-personal-theme', '1');
        row.scrollLeft = 36;
        results.themeReenabled = select(2);
        callbacks.forEach(callback => callback());
        results.unloadRestored = prototype.updateTabDisplay === original;
        row.scrollLeft = 36;
        results.disabled = select(2);
        plugin.onload();
        const wrapper = prototype.updateTabDisplay;
        const laterWrapper = function(...args) { return wrapper.apply(this, args); };
        prototype.updateTabDisplay = laterWrapper;
        callbacks.at(-1)();
        results.laterWrapperPreserved = prototype.updateTabDisplay === laterWrapper;
        row.scrollLeft = 36;
        results.disabledThroughWrapper = select(2);
        return JSON.stringify(results);
    } finally {
        callbacks.forEach(callback => callback());
        host.remove();
    }
})()`], {encoding:'utf8', maxBuffer:2*1024*1024}).trim();

assert(output.startsWith('=> '), output);
const result = JSON.parse(output.slice(3));
assert.notEqual(result.nativeJump, 36, 'Fixture does not reproduce the native jump');
for (const name of ['visible','visibleLeft','partlyVisible','editor']) {
    assert(Math.abs(result[name]-36) <= 0.1, `${name} changes the manual scroll position`);
}
assert(Math.abs(result.resize-34) <= 1, 'Resize should only clamp a position beyond the new scroll limit');
assert(Math.abs(result.hiddenRight-88) <= 1, 'Hidden last tab should move only to its nearest visible edge');
assert.equal(result.hiddenLeft, 0, 'Hidden first tab should move only to its nearest visible edge');
assert.equal(result.refresh, 0, 'Refresh/focus must not pull a manually scrolled strip back to the active tab');
assert.equal(result.otherTheme, result.nativeJump, 'Fix changes sidebar behavior under another theme');
assert.equal(result.themeReenabled, 36, 'Fix does not resume when the personal theme is selected again');
assert(result.unloadRestored && result.laterWrapperPreserved, 'Unloading should preserve other plugins');
assert.equal(result.disabled, result.nativeJump, 'Unloading did not restore native behavior');
assert.equal(result.disabledThroughWrapper, result.nativeJump, 'Disabled fix remains active inside another wrapper');
console.log('通过：原生跳动复现、可见标签位置保持、不可见标签最小定位、刷新/缩放、主题切换、正文标签及卸载恢复。');
