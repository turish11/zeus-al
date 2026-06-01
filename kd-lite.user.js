// ==UserScript==
// @name         KD Giveaway Lite
// @namespace    http://tampermonkey.net/
// @version      1.1.0
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
            AMATEUR:    { enabled: true,  cooldown: 60000,   minPrice: 6 },
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
        if (document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="cf-chl-widget"], iframe[id*="cf-challenge"]')) return true;
        const bodyText = document.body?.textContent?.toLowerCase() || '';
        if ((bodyText.includes('verifying you are a human') || bodyText.includes('security verification') ||
             bodyText.includes('ray id:')) && bodyText.length < 500) return true;
        const appRoot = document.getElementById('app-root');
        if (!appRoot || appRoot.children.length === 0) {
            if (Date.now() - cfLastCheck > 3000) return true;
        }
        return false;
    }

    async function handleCloudflare() {
        if (!isCloudflareChallenge()) { cfReloadCount = 0; return false; }
        log('Cloudflare challenge detected!', 'err');
        if (cfReloadCount >= CFG.cfMaxReloads) { log('Max CF reloads reached. Waiting 60s...', 'err'); await sleep(60000); cfReloadCount = 0; }
        cfReloadCount++;
        log('Reloading in ' + (CFG.cfReloadDelay/1000) + 's... (attempt ' + cfReloadCount + '/' + CFG.cfMaxReloads + ')', 'wait');
        const el = document.getElementById('kd-status');
        if (el) el.innerHTML = '<div class="kd-status-line err">Cloudflare detected - reloading...</div>';
        await sleep(CFG.cfReloadDelay);
        window.location.reload(true);
        return true;
    }

GM_addStyle('#kd-lite-panel{position:fixed;bottom:15px;right:15px;z-index:99999;background:#0d0d12;border:1px solid #222;border-radius:10px;padding:14px;color:#ccc;font-family:monospace;font-size:12px;min-width:240px;box-shadow:0 4px 24px rgba(0,0,0,.6);transition:transform .2s,opacity .2s}#kd-lite-panel.kd-minimized{transform:translateX(calc(100% - 36px));opacity:.7}#kd-lite-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #222}#kd-lite-header span{color:#e6a817;font-weight:bold;font-size:13px}.kd-toggle-btn{background:none;border:none;color:#666;cursor:pointer;font-size:14px;padding:0 4px}.kd-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}.kd-switch{width:30px;height:16px;background:#333;border-radius:8px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}.kd-switch.on{background:#e6a817}.kd-switch::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;background:#fff;border-radius:50%;transition:left .2s}.kd-switch.on::after{left:16px}.kd-status{margin-top:8px;padding-top:8px;border-top:1px solid #222}.kd-status-line{margin-bottom:3px;font-size:11px}.kd-status-line.ok{color:#4a4}.kd-status-line.wait{color:#aa4}.kd-status-line.err{color:#a44}.kd-action-btn{background:#e6a817;color:#0d0d12;border:none;border-radius:4px;padding:5px 12px;cursor:pointer;font-weight:bold;font-size:11px;margin-top:8px;width:100%;transition:opacity .15s}.kd-action-btn:hover{opacity:.85}.kd-log{margin-top:8px;padding:5px;background:#08080c;border-radius:4px;max-height:60px;overflow-y:auto;font-size:10px;line-height:1.4;color:#888}.kd-log-entry.ok{color:#4a4}.kd-log-entry.wait{color:#aa4}.kd-log-entry.err{color:#a44}.kd-price-input::-webkit-inner-spin-button,.kd-price-input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.kd-price-input{-moz-appearance:textfield}');

    let running = true, logBuf = [], catIndex = GM_getValue('kd_catIdx', 0), enteredCount = 0;

    function log(msg, type) {
        type = type || '';
        var t = new Date().toLocaleTimeString('en-GB');
        logBuf.push({t:t,msg:msg,type:type});
        if (logBuf.length > 30) logBuf.shift();
        if (CFG.debug) console.log('[KD-Lite] ' + msg);
        var el = document.getElementById('kd-logbox');
        if (el) { el.innerHTML = logBuf.map(function(x){return '<div class="kd-log-entry '+x.type+'">['+x.t+'] '+x.msg+'</div>';}).join(''); el.scrollTop = el.scrollHeight; }
    }

    function rnd(min, max) { return Math.random() * (max - min) + min; }
    function sleep(ms) { return new Promise(function(r){setTimeout(r,ms);}); }
    function loadConfig() { try { var s = GM_getValue('kd_cfg'); if (s) CFG.categories = JSON.parse(s).categories; } catch(e){} }
    function saveConfig() { GM_setValue('kd_cfg', {categories: CFG.categories}); }
    function msToStr(ms) { return ms>=3600000?Math.round(ms/3600000)+'h':ms>=60000?Math.round(ms/60000)+'m':ms>=1000?Math.round(ms/1000)+'s':ms+'ms'; }
    function canEnter(cat) { var c=CFG.categories[cat]; return c&&c.enabled&&Date.now()-GM_getValue('kd_last_'+cat,0)>=c.cooldown; }
    function markEntered(cat) { GM_setValue('kd_last_'+cat,Date.now()); }
    function waitFor(sel,ms){ms=ms||10000;return new Promise(function(res,rej){var el=document.querySelector(sel);if(el)return res(el);var o=new MutationObserver(function(){var e=document.querySelector(sel);if(e){o.disconnect();res(e);}});o.observe(document.body,{childList:true,subtree:true});setTimeout(function(){o.disconnect();j(new Error('timeout: '+sel));},ms);}); }
    function humanClick(el) {
        if (!el) return;
        var o = {bubbles:true,cancelable:true,view:window};
        ['mouseenter','mouseover','mousedown','mouseup','click'].forEach(function(t){el.dispatchEvent(new MouseEvent(t,o));});
        el.click();
    }

    function findGiveawayButton(category) {
        var labels = document.querySelectorAll('[data-testid="label-single-card-giveaway-category"]');
for (var i=0;i<labels.length;i++) {
            if (labels[i].textContent.trim() !== category) continue;
            var card = labels[i].closest('[data-testid="div-active-giveaways-list-single-card"]');
            if (!card) continue;
            var cfg = CFG.categories[category];
            var pe = card.querySelector('[data-testid="label-single-card-giveaway-reward-value-amount"] span[data-testid=""]');
            if (pe && cfg.minPrice > 0) {
                var val = parseFloat(pe.textContent.replace(/[^0-9.,]/g,'').replace(',','.'));
                if (!isNaN(val) && val < cfg.minPrice) { log(category+': price $'+val+' < min $'+cfg.minPrice+', skipping','wait'); continue; }
            }
            var btn = card.querySelector('[data-testid="btn-single-card-giveaway-join"]');
            if (btn) return btn;
        }
        return null;
    }

    async function navigateToGiveaways() {
        if (window.location.pathname.includes('/giveaways/list')) return;
        var link = document.querySelector('[data-testid="btn-tab-all-giveaways"]') || document.querySelector('a[href="/en/giveaways/list"]') || document.querySelector('a[href*="giveaway"]');
        if (link) humanClick(link); else window.location.href = '/en/giveaways/list';
        await sleep(rnd(1500,3000));
    }

    async function enterGiveaway(category) {
        log('Entering '+category+'...','wait');
        var cardBtn = findGiveawayButton(category);
        if (!cardBtn) { log('No '+category+' button found','err'); return false; }
        await sleep(rnd(CFG.clickDelayMin,CFG.clickDelayMax));
        humanClick(cardBtn);
        try { await waitFor('button[data-testid="btn-giveaway-join-the-giveaway"]',8000); }
        catch(e) { log('Giveaway detail page not loaded','err'); window.history.back(); return false; }
        await sleep(rnd(500,1500));
        if (document.querySelector('iframe[src*="captcha"],iframe[src*="recaptcha"],.g-recaptcha')) { log('Captcha detected - waiting...','wait'); await sleep(CFG.captchaTimeout); }
        var joinBtn = document.querySelector('button[data-testid="btn-giveaway-join-the-giveaway"]');
        if (joinBtn && !joinBtn.disabled) {
            await sleep(rnd(CFG.clickDelayMin,CFG.clickDelayMax));
            humanClick(joinBtn);
            log(category+' ENTERED','ok'); enteredCount++; markEntered(category);
            if (GM_notification) GM_notification({title:'KD Giveaway Entered',text:'Entered '+category+' giveaway',timeout:4000});
        } else if (joinBtn && joinBtn.disabled) {
            log(category+': already joined or ended','wait');
        } else {
            log(category+': join button not found','err');
        }
        await sleep(rnd(800,2000)); window.history.back(); await sleep(rnd(1000,2500));
        updatePanel(); return true;
    }

    async function scanListPage() {
        if (!running) return;
        var enabled = Object.keys(CFG.categories).filter(function(c){return canEnter(c);});
        if (!enabled.length) { log('All categories on cooldown','wait'); updatePanel(); return; }
        var tries = 0;
        while (tries < enabled.length && running) {
            var cat = enabled[catIndex % enabled.length]; catIndex++; GM_setValue('kd_catIdx',catIndex);
            if (canEnter(cat)) { if (await enterGiveaway(cat)) break; }
            tries++;
        }
        updatePanel();
    }

    function createPanel() {
        if (document.getElementById('kd-lite-panel')) return;
        var panel = document.createElement('div');
        panel.id = 'kd-lite-panel';
        panel.innerHTML = '<div id="kd-lite-header"><span>KD Lite</span><button class="kd-toggle-btn" id="kd-min-btn">-</button></div><div id="kd-rows"></div><button class="kd-action-btn" id="kd-scan-btn">Force Scan Now</button><div id="kd-status" class="kd-status"><div class="kd-status-line ok">Ready</div></div><div class="kd-log" id="kd-logbox"></div>';
        document.body.appendChild(panel);
        var min = false;
document.getElementById('kd-min-btn').onclick = function(){min=!min;panel.classList.toggle('kd-minimized',min);};
        document.getElementById('kd-scan-btn').onclick = scanListPage;
        renderConfig(); log('Panel loaded','ok');
    }

    function renderConfig() {
        var rows = document.getElementById('kd-rows');
        if (!rows) return;
        rows.innerHTML = '';
        Object.keys(CFG.categories).forEach(function(cat) {
            var cfg = CFG.categories[cat];
            var row = document.createElement('div');
            row.className = 'kd-row';
            row.style.marginBottom = '8px';
            row.innerHTML = '<div style="flex:1;display:flex;align-items:center;gap:6px;"><span>'+cat+'</span><span style="color:#666;font-size:10px;">$</span><input type="number" class="kd-price-input" data-cat="'+cat+'" value="'+cfg.minPrice+'" min="0" step="0.5" style="width:52px;background:#1a1a1a;color:#e6a817;border:1px solid #333;border-radius:3px;padding:2px 4px;font-size:11px;text-align:right;"></div><div class="kd-switch '+(cfg.enabled?'on':'')+'" data-cat="'+cat+'"></div>';
            row.querySelector('.kd-switch').onclick = function() {
                CFG.categories[cat].enabled = !CFG.categories[cat].enabled;
                this.classList.toggle('on',CFG.categories[cat].enabled);
                saveConfig(); updatePanel();
            };
            var inp = row.querySelector('.kd-price-input');
            inp.addEventListener('change', function() {
                var v = parseFloat(this.value)||0;
                CFG.categories[cat].minPrice = v;
                saveConfig();
                log(cat+' min price set to $'+v,'info');
            });
            inp.addEventListener('input', function() {
                CFG.categories[cat].minPrice = parseFloat(this.value)||0;
            });
            rows.appendChild(row);
        });
    }

    function updatePanel() {
        var el = document.getElementById('kd-status');
        if (!el) return;
        var enabled = Object.keys(CFG.categories).filter(function(c){return CFG.categories[c].enabled;});
        var lines = enabled.map(function(cat) {
            var cfg = CFG.categories[cat], last = GM_getValue('kd_last_'+cat,0);
            var rem = cfg.cooldown-(Date.now()-last);
            return rem>0?'<div class="kd-status-line wait">'+cat+': '+msToStr(rem)+' (min $'+cfg.minPrice+')</div>':'<div class="kd-status-line ok">'+cat+': ready (min $'+cfg.minPrice+')</div>';
        });
        lines.unshift('<div class="kd-status-line">Entered today: '+enteredCount+' | Running: '+(running?'yes':'paused')+'</div>');
        el.innerHTML = lines.slice(0,6).join('');
    }

    async function main() {
        loadConfig(); createPanel(); log('Bot started','ok');
        var lastPath = location.href;
        new MutationObserver(function(){if(location.href!==lastPath){lastPath=location.href;log('Navigated: '+location.pathname,'wait');}}).observe(document,{childList:true,subtree:true});
        while(true) {
            await sleep(CFG.scanInterval+rnd(0,3000));
            if (!running) continue;
            if (await handleCloudflare()) continue;
            cfLastCheck = Date.now();
            try {
                await navigateToGiveaways();
                if (await handleCloudflare()) continue;
                if (window.location.pathname.includes('/giveaways/list')) {
                    await waitFor('[data-testid="label-single-card-giveaway-category"]',12000);
                    await scanListPage();
                }
            } catch(e) { log('Error: '+e.message,'err'); if(await handleCloudflare()) continue; }
            updatePanel();
        }
    }

    window.KDLite = {
        pause: function(){running=false;log('PAUSED','wait');},
        resume: function(){running=true;log('RESUMED','ok');},
        scan: scanListPage,
        setCooldown: function(cat,ms){if(CFG.categories[cat]){CFG.categories[cat].cooldown=ms;saveConfig();renderConfig();}},
setMinPrice: function(cat,p){if(CFG.categories[cat]){CFG.categories[cat].minPrice=p;saveConfig();}},
        getState: function(){return {running:running,enteredCount:enteredCount,categories:CFG.categories};},
    };

    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(main,2000);});
    else setTimeout(main,2000);
})();
