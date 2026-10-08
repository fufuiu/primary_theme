// Samples real Git markup in an isolated frame; never hovers or clicks the user's controls.
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = execFileSync('obsidian', ['vault=Personal OSV2', 'eval', `code=(async () => {
    const fs = require('fs'), root = ${JSON.stringify(root)};
    const base = [...document.styleSheets].filter(s => s.href?.includes('app.css'))
        .map(s => [...s.cssRules].map(r => r.cssText).join(String.fromCharCode(10))).join(String.fromCharCode(10));
    const component = [...document.styleSheets].filter(s => [...s.cssRules].some(r => r.selectorText?.includes('.commit-action-group')))
        .map(s => [...s.cssRules].map(r => r.cssText).join(String.fromCharCode(10))).join(String.fromCharCode(10));
    const markup = document.querySelector('.workspace-leaf-content[data-type="git-view"] .nav-header')?.outerHTML;
    if (!markup || !component) throw new Error('Git toolbar has not been loaded');
    const css = fs.readFileSync(root+'/theme.css', 'utf8') + component +
        fs.readFileSync(root+'/snippets/Primary-OnePage-preview.css', 'utf8');
    const results = [];
    for (const width of [250,338,420]) {
        const frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:'+width+'px;height:200px;pointer-events:none';
        document.body.append(frame);
        try {
            const loaded = new Promise(resolve => frame.onload = resolve);
            frame.srcdoc = '<style>'+base+'</style><style>'+css.replaceAll(':hover', '.motion-hover')+'</style>'+
                '<style>html,body{contain:none!important;height:auto;display:block}.workspace{height:auto;display:block}' +
                '.workspace-split.mod-sidedock{width:'+width+'px!important;height:auto!important;margin:0!important;padding:0!important}' +
                '.workspace-leaf-content{height:auto}</style><body class="mod-linux obsidian-app theme-light">' +
                '<div class="workspace"><div class="workspace-split mod-sidedock"><div class="workspace-leaf-content" data-type="git-view">' +
                '<div class="view-content">'+markup+'</div></div></div></div>';
            await loaded;
            const doc = frame.contentDocument, header = doc.querySelector('.nav-header'), group = doc.querySelector('.commit-action-group');
            header.querySelectorAll('.has-active-menu').forEach(e => e.classList.remove('has-active-menu'));
            const style = e => frame.contentWindow.getComputedStyle(e);
            const canvas = doc.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            const snapshot = () => {
                const s = style(group);
                context.fillStyle = '#ffffff'; context.fillRect(0,0,1,1);
                context.fillStyle = s.borderTopColor; context.fillRect(0,0,1,1);
                return {color:s.borderTopColor, painted:[...context.getImageData(0,0,1,1).data].slice(0,3),
                    border:parseFloat(s.borderTopWidth), height:group.getBoundingClientRect().height,
                    buttons:[...header.querySelectorAll('.nav-action-button')].map(e => {
                        const b = e.getBoundingClientRect(), i = e.querySelector('svg').getBoundingClientRect();
                        return {width:b.width, height:b.height, center:b.y+b.height/2, icon:i.width};
                    })};
            };
            style(group).borderTopColor;
            header.getAnimations({subtree:true}).forEach(a => a.finish());
            const rest = snapshot(), traces = [];
            for (const [opening, times, finish] of [
                [true,[0,16,32,64,120,200,320],true], [false,[0,16,32,64,120,200,320],true],
                [true,[0,16,32,64,120],false], [false,[0,16,32],false],
                [true,[0,16,32,64,120,200,320],true], [false,[0,16,32,64,120,200,320],true]
            ]) {
                header.classList.toggle('motion-hover', opening);
                style(group).borderTopColor;
                const animations = header.getAnimations({subtree:true});
                animations.forEach(a => a.pause());
                const samples = times.map(time => {
                    animations.forEach(a => a.currentTime = time);
                    return {time,...snapshot()};
                });
                traces.push({opening,samples});
                if (finish) animations.forEach(a => a.finish());
            }
            results.push({width,rest,traces});
        } finally { frame.remove(); }
    }
    return JSON.stringify(results);
})()`], {encoding:'utf8', maxBuffer:2*1024*1024}).trim();

assert(output.startsWith('=> '), output);
const layouts = JSON.parse(output.slice(3));
for (const layout of layouts) {
    const expanded = layout.traces[0].samples.at(-1);
    assert(expanded.border > 0 && expanded.height <= 29, 'Expanded Git group loses its regular border or size');
    assert(expanded.buttons.every(b => b.icon === 15 && b.height === 27 && b.width >= 20), 'Expanded controls are squeezed');
    const centers = expanded.buttons.map(b => b.center);
    assert(Math.max(...centers)-Math.min(...centers) <= 1, 'Git controls wrap onto another row');
    for (const trace of layout.traces) for (const sample of trace.samples) {
        if (sample.border > 0) assert(sample.painted.every((channel,i) => channel >= expanded.painted[i]-2),
            'Border darkens during animation: '+JSON.stringify({width:layout.width, opening:trace.opening, time:sample.time, color:sample.color}));
        assert(sample.buttons.every(b => b.icon <= b.width+0.15), 'Animated icon overflows its button');
    }
    assert.equal(layout.rest.border, 0, 'Collapsed Git group still has a frame');
    assert.equal(layout.traces.at(-1).samples.at(-1).border, 0, 'Git group does not return to its collapsed state');
}
console.log('通过：Git 分组边框在展开、收起及中途反向时无深色闪烁；250/338/420px 下尺寸与单行布局正常。');
