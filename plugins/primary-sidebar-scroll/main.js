const { Plugin, WorkspaceTabs } = require('obsidian');

module.exports = class SidebarScrollFix extends Plugin {
    onload() {
        const prototype = WorkspaceTabs.prototype;
        const original = prototype.updateTabDisplay;
        if (typeof original !== 'function') throw new Error('Obsidian 的标签更新接口已变化，侧栏滚动修复未启用。');
        this.originalUpdateTabDisplay = original;

        let enabled = true;
        function updateTabDisplay(...args) {
            const row = this.tabsInnerEl;
            if (!enabled || this.isStacked || !row || !this.getRoot()?.containerEl?.classList.contains('mod-sidedock')) {
                return original.apply(this, args);
            }

            const position = row.scrollLeft;
            const previous = row.querySelector('.is-active');
            const result = original.apply(this, args);
            // Obsidian resets this offset on every sidebar update, including focus changes.
            row.scrollLeft = position;

            const selected = this.children[this.currentTab]?.tabHeaderEl;
            if (selected && selected !== previous && row.clientWidth > 0) {
                const viewport = row.getBoundingClientRect();
                const left = viewport.left + row.clientLeft;
                const right = left + row.clientWidth;
                const target = selected.getBoundingClientRect();
                if (target.right <= left) row.scrollLeft += target.left - left;
                else if (target.left >= right) row.scrollLeft += target.right - right;
            }
            return result;
        }

        prototype.updateTabDisplay = updateTabDisplay;
        this.register(() => {
            enabled = false;
            if (prototype.updateTabDisplay === updateTabDisplay) prototype.updateTabDisplay = original;
        });
    }
};
