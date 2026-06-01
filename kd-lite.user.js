// ==UserScript==
// @name         KD Giveaway Lite
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Standalone Key-Drop giveaway auto-enter with anti-detection
// @author       anonymous
// @include      *://*key*drop*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const CFG = {
        categories: {
            AMATEUR:    { enabled: true,  cooldown: 60000,   minPrice: 0 },
            CONTENDER:  { enabled: true,  cooldown: 300000,  minPrice: 0 },
            CHALLENGER: { enabled: true,  cooldown: 3600000, minPrice: 0 },
            CHAMPION:   { enabled: false, cooldown: 21600000, minPrice: 0 },
        },
        clickDelayMin: 300,
        clickDelayMax: 1800,
        scanInterval: 8000,
        captchaTimeout: 30000,
        debug: true,
        cfCheckInterval: 5000,
        cfReloadDelay: 3000,
        cfMaxReloads: 5,
    };

    let cfReloadCount = 0;
    let cfLastCheck = Date.now();

    function isCloudflareChallenge() {
        const title = document.title.toLowerCase();
        if (title.includes('just a moment') || title.includes('attention required') ||
            title.includes('checking your browser') || title.includes('verify')) return true;
        const cfIframe = document.querySelector(
            'iframe[src*="challenges.cloudflare.com"], iframe[src*="cf-chl-widget"], iframe[id*="cf-challenge"]');
        if (cfIframe) return true;
        const bodyText = document.body?.textContent?.toLowerCase() || '';
        if ((bodyText.includes('verifying you are a human') ||
             bodyText.includes('checking your browser') ||
             bodyText.includes('security verification') ||
             bodyText.includes('ray id:')) && bodyText.length < 500) return true;
        const appRoot = document.getElementById('app-root');
        if (!appRoot || appRoot.children.length === 0) {
            if (Date.now() - cfLastCheck > 3000) return true;
        }
        return false;
    }

    async function handleCloudflare() {
        if (!isCloudflareChallenge()) { cfReloadCount = 0; return false; }
        log('⚠️ Cloudflare challenge detected!', 'err');
        if (cfReloadCount >= CFG.cfMaxReloads) {
            log(`Max CF reloads (${CFG.cfMaxReloads}) reached. Waiting 60s...`, 'err');
            await sleep(60000); cfReloadCount = 0;
        }
        cfReloadCount++;
        log(`Reloading in ${CFG.cfReloadDelay/1000}s... (attempt ${cfReloadCount}/${CFG.cfMaxReloads})`, 'wait');
        const el = document.getElementById('kd-status');
        if (el) el.innerHTML = '<div class="kd-status-line err">⚠️ Cloudflare detected — reloading...</div>';
        await sleep(CFG.cfReloadDelay);
        window.location.reload(true);
        return true;
    }

    GM_addStyle(`
        #kd-lite-panel { position:fixed; bottom:15px; right:15px; z-index:99999; background:#0d0d12;
            border:1px solid #222; border-radius:10px; padding:14px; color:#ccc; font-family:monospace;
            font-size:12px; min-width:220px; box-shadow:0 4px 24px rgba(0,0,0,.6); transition:transform .2s,opacity .2s; }
        #kd-lite-panel.kd-minimized { transform:translateX(calc(100% - 36px)); opacity:.7; }
        #kd-lite-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #222; }
        #kd-lite-header span { color:#e6a817; font-weight:bold; font-size:13px; }
        .kd-toggle-btn { background:none; border:none; color:#666; cursor:pointer; font-size:14px; padding:0 4px; }
        .kd-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:5px; }
        .kd-row span { flex:1; }
.kd-switch { width:30px; height:16px; background:#333; border-radius:8px; position:relative; cursor:pointer; transition:background .2s; flex-shrink:0; }
        .kd-switch.on { background:#e6a817; }
        .kd-switch::after { content:''; position:absolute; top:2px; left:2px; width:12px; height:12px; background:#fff; border-radius:50%; transition:left .2s; }
        .kd-switch.on::after { left:16px; }
        .kd-status { margin-top:8px; padding-top:8px; border-top:1px solid #222; }
        .kd-status-line { margin-bottom:3px; font-size:11px; }
        .kd-status-line.ok { color:#4a4; } .kd-status-line.wait { color:#aa4; } .kd-status-line.err { color:#a44; }
        .kd-action-btn { background:#e6a817; color:#0d0d12; border:none; border-radius:4px; padding:5px 12px; cursor:pointer; font-weight:bold; font-size:11px; margin-top:8px; width:100%; transition:opacity .15s; }
        .kd-action-btn:hover { opacity:.85; }
        .kd-log { margin-top:8px; padding:5px; background:#08080c; border-radius:4px; max-height:60px; overflow-y:auto; font-size:10px; line-height:1.4; color:#888; }
        .kd-log-entry.ok { color:#4a4; } .kd-log-entry.wait { color:#aa4; } .kd-log-entry.err { color:#a44; }
    `);

    let running = true, logBuf = [], catIndex = GM_getValue('kd_catIdx', 0), enteredCount = 0;

    function log(msg, type = '') {
        const t = new Date().toLocaleTimeString('en-GB');
        logBuf.push({ t, msg, type });
        if (logBuf.length > 30) logBuf.shift();
        if (CFG.debug) console.log(`[KD-Lite] ${msg}`);
        const el = document.getElementById('kd-logbox');
        if (el) { el.innerHTML = logBuf.map(x => `<div class="kd-log-entry ${x.type}">[${x.t}] ${x.msg}</div>`).join(''); el.scrollTop = el.scrollHeight; }
    }

    function rnd(min, max) { return Math.random() * (max - min) + min; }
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function loadConfig() { try { const s = GM_getValue('kd_cfg'); if (s) Object.assign(CFG.categories, JSON.parse(s).categories); } catch(e) {} }
    function saveConfig() { GM_setValue('kd_cfg', { categories: CFG.categories }); }
    function msToStr(ms) { return ms >= 3600000 ? Math.round(ms/3600000)+'h' : ms >= 60000 ? Math.round(ms/60000)+'m' : ms >= 1000 ? Math.round(ms/1000)+'s' : ms+'ms'; }
    function canEnter(cat) { const c = CFG.categories[cat]; if (!c || !c.enabled) return false; return Date.now() - GM_getValue('kd_last_'+cat, 0) >= c.cooldown; }
    function markEntered(cat) { GM_setValue('kd_last_' + cat, Date.now()); }
    function waitFor(sel, ms = 10000) {
        return new Promise((res, rej) => {
            const e = document.querySelector(sel); if (e) return res(e);
            const o = new MutationObserver(() => { const x = document.querySelector(sel); if (x) { o.disconnect(); res(x); } });
            o.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { o.disconnect(); rej(new Error('timeout: ' + sel)); }, ms);
        });
    }
    function humanClick(el) {
        if (!el) return;
        const o = { bubbles: true, cancelable: true, view: window, detail: 1 };
        ['pointerover','pointerenter','mouseover','mouseenter','pointerdown','mousedown','pointerup','mouseup','click']
            .forEach(t => el.dispatchEvent(new PointerEvent(t, o)));
        el.click();
    }

    function findGiveawayButton(category) {
        for (const label of document.querySelectorAll('[data-testid="label-single-card-giveaway-category"]')) {
            if (label.textContent.trim() !== category) continue;
            const card = label.closest('[data-testid="div-active-giveaways-list-single-card"]');
            if (!card) continue;
            const cfg = CFG.categories[category];
            const pe = card.querySelector('[data-testid="label-single-card-giveaway-reward-value-amount"] span[data-testid=""]');
            if (pe && cfg.minPrice > 0) {
                const v = parseFloat(pe.textContent.replace(/[^0-9.,]/g,'').replace(',','.'));
if (!isNaN(v) && v < cfg.minPrice) { log(`${category}: price $${v} < min $${cfg.minPrice}`, 'wait'); continue; }
            }
            const b = card.querySelector('[data-testid="btn-single-card-giveaway-join"]');
            if (b) return b;
        }
        return null;
    }

    async function navigateToGiveaways() {
        if (window.location.pathname.includes('/giveaways/list')) return;
        const link = document.querySelector('[data-testid="btn-tab-all-giveaways"]') ||
                     document.querySelector('a[href="/en/giveaways/list"]') ||
                     document.querySelector('a[href*="giveaway"]');
        if (link) humanClick(link); else window.location.href = '/en/giveaways/list';
        await sleep(rnd(1500, 3000));
    }

    async function enterGiveaway(category) {
        log(`Entering ${category}...`, 'wait');
        const cardBtn = findGiveawayButton(category);
        if (!cardBtn) { log(`No ${category} button found`, 'err'); return false; }
        await sleep(rnd(CFG.clickDelayMin, CFG.clickDelayMax));
        humanClick(cardBtn);
        try { await waitFor('button[data-testid="btn-giveaway-join-the-giveaway"]', 8000); }
        catch { log('Giveaway detail page not loaded', 'err'); window.history.back(); return false; }
        await sleep(rnd(500, 1500));
        if (document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], .g-recaptcha')) {
            log('Captcha detected — waiting...', 'wait'); await sleep(CFG.captchaTimeout);
        }
        const joinBtn = document.querySelector('button[data-testid="btn-giveaway-join-the-giveaway"]');
        if (joinBtn && !joinBtn.disabled) {
            await sleep(rnd(CFG.clickDelayMin, CFG.clickDelayMax));
            humanClick(joinBtn);
            log(`${category} ✓ ENTERED`, 'ok');
            enteredCount++;
            markEntered(category);
            if (GM_notification) GM_notification({ title: 'KD Giveaway Entered', text: `Entered ${category} giveaway ✓`, timeout: 4000 });
        } else if (joinBtn && joinBtn.disabled) {
            log(`${category}: already joined or ended`, 'wait');
        } else {
            log(`${category}: join button not found`, 'err');
        }
        await sleep(rnd(800, 2000));
        window.history.back();
        await sleep(rnd(1000, 2500));
        updatePanel();
        return true;
    }

    async function scanListPage() {
        if (!running) return;
        const enabled = Object.keys(CFG.categories).filter(c => canEnter(c));
        if (!enabled.length) { log('All categories on cooldown', 'wait'); updatePanel(); return; }
        let tries = 0;
        while (tries < enabled.length && running) {
            const cat = enabled[catIndex % enabled.length]; catIndex++; GM_setValue('kd_catIdx', catIndex);
            if (canEnter(cat)) { if (await enterGiveaway(cat)) break; }
            tries++;
        }
        updatePanel();
    }

    function createPanel() {
        if (document.getElementById('kd-lite-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'kd-lite-panel';
        panel.innerHTML = `
            <div id="kd-lite-header">
                <span>⊕ KD Lite</span>
                <button class="kd-toggle-btn" id="kd-min-btn">—</button>
            </div>
            <div id="kd-rows"></div>
            <button class="kd-action-btn" id="kd-scan-btn">▶️ Force Scan Now</button>
            <div id="kd-status" class="kd-status"><div class="kd-status-line ok">Ready</div></div>
            <div class="kd-log" id="kd-logbox"></div>`;
        document.body.appendChild(panel);
        let min = false;
        document.getElementById('kd-min-btn').onclick = () => { min = !min; panel.classList.toggle('kd-minimized', min); };
        document.getElementById('kd-scan-btn').onclick = () => scanListPage();
        renderConfig();
        log('Panel loaded', 'ok');
    }

    function renderConfig() {
const rows = document.getElementById('kd-rows');
        if (!rows) return;
        rows.innerHTML = '';
        for (const [cat, cfg] of Object.entries(CFG.categories)) {
            const row = document.createElement('div');
            row.className = 'kd-row';
            row.innerHTML = `<span>${cat}</span><div class="kd-switch ${cfg.enabled?'on':''}" data-cat="${cat}"></div>`;
            row.querySelector('.kd-switch').onclick = function () {
                CFG.categories[cat].enabled = !CFG.categories[cat].enabled;
                this.classList.toggle('on', CFG.categories[cat].enabled);
                saveConfig(); updatePanel();
            };
            rows.appendChild(row);
        }
        const d = document.createElement('div');
        d.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid #222;font-size:10px;color:#666;';
        d.innerHTML = 'Cooldowns: ' + Object.entries(CFG.categories).filter(([,c])=>c.enabled).map(([k,c])=>`<span style="margin-right:8px">${k}: ${msToStr(c.cooldown)}</span>`).join('');
        rows.appendChild(d);
    }

    function updatePanel() {
        const el = document.getElementById('kd-status');
        if (!el) return;
        const enabled = Object.keys(CFG.categories).filter(c => CFG.categories[c].enabled);
        const lines = enabled.map(cat => {
            const cfg = CFG.categories[cat], last = GM_getValue('kd_last_'+cat, 0);
            const rem = cfg.cooldown - (Date.now() - last);
            return rem > 0 ? `<div class="kd-status-line wait">${cat}: ${msToStr(rem)}</div>` : `<div class="kd-status-line ok">${cat}: ready</div>`;
        });
        lines.unshift(`<div class="kd-status-line">Entered: ${enteredCount} | Running: ${running?'yes':'paused'}</div>`);
        el.innerHTML = lines.slice(0, 6).join('');
    }

    async function main() {
        loadConfig(); createPanel(); log('Bot started', 'ok');
        let lastPath = location.href;
        new MutationObserver(() => {
            if (location.href !== lastPath) { lastPath = location.href; log('Navigated: ' + location.pathname, 'wait'); }
        }).observe(document, { childList: true, subtree: true });

        while (true) {
            await sleep(CFG.scanInterval + rnd(0, 3000));
            if (!running) continue;
            if (await handleCloudflare()) continue;
            cfLastCheck = Date.now();
            try {
                await navigateToGiveaways();
                if (await handleCloudflare()) continue;
                if (window.location.pathname.includes('/giveaways/list')) {
                    await waitFor('[data-testid="label-single-card-giveaway-category"]', 12000);
                    await scanListPage();
                }
            } catch (e) { log('Error: ' + e.message, 'err'); if (await handleCloudflare()) continue; }
            updatePanel();
        }
    }

    window.KDLite = {
        pause: () => { running = false; log('PAUSED', 'wait'); },
        resume: () => { running = true; log('RESUMED', 'ok'); },
        scan: () => scanListPage(),
        setCooldown: (cat, ms) => { if (CFG.categories[cat]) { CFG.categories[cat].cooldown = ms; saveConfig(); renderConfig(); } },
        setMinPrice: (cat, p) => { if (CFG.categories[cat]) { CFG.categories[cat].minPrice = p; saveConfig(); } },
        getState: () => ({ running, enteredCount, cfReloadCount, categories: CFG.categories }),
        isCloudflare: () => isCloudflareChallenge(),
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(main, 2000));
    else setTimeout(main, 2000);
})();
