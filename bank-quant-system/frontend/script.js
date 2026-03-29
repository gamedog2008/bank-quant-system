const API_BASE = 'https://api.mystock.us.ci'; // 你的专属 API 域名

const ALL_BANKS = {'601398':'工商银行','601288':'农业银行','601939':'建设银行','601988':'中国银行','601328':'交通银行','601658':'邮储银行','600036':'招商银行','601166':'兴业银行','601998':'中信银行','600000':'浦发银行','600016':'民生银行','601818':'光大银行','000001':'平安银行','601916':'浙商银行','600015':'华夏银行','600919':'江苏银行','600926':'杭州银行','601169':'北京银行','601009':'南京银行','002142':'宁波银行','601229':'上海银行','601838':'成都银行','601577':'长沙银行','601963':'重庆银行','601665':'齐鲁银行','600908':'无锡银行','600916':'常熟银行','601077':'渝农商行','601528':'瑞丰银行','002807':'江阴银行','002839':'张家港行','002936':'郑州银行','002948':'青岛银行','002956':'苏州银行','002958':'青农商行','603323':'盛农银行','601860':'紫金银行','601997':'贵阳银行','600928':'西安银行','601162':'甘肃银行','601093':'广州银行','601128':'常熟银行'};
let sortConfig = { key: 'score', asc: false }; 
let myChart = null; 
let authToken = localStorage.getItem('bank_token') || '';
let globalData = null; 

async function apiFetch(url, options = {}) {
    options.headers = { 'Content-Type': 'application/json', 'Authorization': authToken, ...(options.headers || {}) };
    const res = await fetch(API_BASE + url, options);
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    return res;
}

async function apiGet(forceFetch = false) { 
    if (!forceFetch && globalData) return globalData; 
    const r = await apiFetch('/api/data'); 
    globalData = await r.json(); 
    return globalData; 
}

async function apiSet(obj) { 
    const r = await apiFetch('/api/set', { method: 'POST', body: JSON.stringify(obj) }); 
    if (globalData && globalData.user) {
        for (let k in obj) {
            if (typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
                globalData.user[k] = { ...globalData.user[k], ...obj[k] };
            } else {
                globalData.user[k] = obj[k];
            }
        }
    }
    return await r.json(); 
}

function logout() {
    localStorage.removeItem('bank_token');
    document.getElementById('login-modal').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
}

async function renderTable(forceFetch = false) {
    const data = await apiGet(forceFetch);
    const myCodes = data.user?.my_bank_list || [];
    const period = parseInt(document.getElementById('period-selector').value);
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - period);
    const cutoff = cutoffDate.toISOString().slice(0,10).replace(/-/g,'');

    let tableData = myCodes.map(code => {
        const c = data.cache[code] || {}; 
        const uConf = data.user[`bank_${code}`] || {}; 
        const h = (c.h || []).filter(x => x.d >= cutoff).map(x => x.v).sort((a,b)=>a-b);
        let distMidText = '---', distMidClass = '', statText = '待同步', pctClass = '', distVal = 999, pct = 999;
        
        if (h.length > 50) {
            const pb = parseFloat(c.pb), mid = h[Math.floor(h.length/2)];
            distVal = ((pb - mid) / mid) * 100;
            distMidText = (distVal > 0 ? '+': '') + distVal.toFixed(1) + '%';
            distMidClass = distVal <= 0 ? 'pct-low' : 'pct-high';
            const low = h[Math.floor(h.length*0.05)], high = h[Math.floor(h.length*0.95)];
            pct = (h.filter(v => v < pb).length / h.length) * 100;
            statText = `${low.toFixed(2)}-${high.toFixed(2)} (${pct.toFixed(1)}%)`;
            pctClass = pct <= 20 ? 'pct-low' : (pct >= 80 ? 'pct-high' : '');
        }
        
        const buyT = uConf.buy || 0.6, sellT = uConf.sell || 1.0;
        const bps = c.bps || 0;
        const buyPrice = bps ? (buyT * bps).toFixed(2) : '--';
        const sellPrice = bps ? (sellT * bps).toFixed(2) : '--';

        let score = 0; let details = [];
        let s1 = 0; if (pct <= 10) s1 = 25; else if (pct <= 25) s1 = 20; else if (pct <= 50) s1 = 10;
        score += s1; details.push(`估值分位: +${s1}分`);

        let s2 = 0; let avgDv = 0;
        const sortedDvYears = Object.keys(c.yearly_dv || {}).sort((a,b) => b - a).slice(0, 5);
        const dvValues = sortedDvYears.map(y => parseFloat(c.yearly_dv[y])).filter(v => !isNaN(v));
        if (dvValues.length > 0) avgDv = dvValues.reduce((a, b) => a + b, 0) / dvValues.length;
        if (avgDv >= 6.0) s2 = 25; else if (avgDv >= 5.0) s2 = 20; else if (avgDv >= 4.0) s2 = 10;
        score += s2; details.push(`5年股息 : +${s2}分`);

        let s3 = 0; let avgRoe = 0; let avgRoeText = '--';
        const roeValues = (c.annual_data || []).slice(0, 5).map(item => parseFloat(item.roe)).filter(v => !isNaN(v));
        if (roeValues.length > 0) { avgRoe = roeValues.reduce((a, b) => a + b, 0) / roeValues.length; avgRoeText = avgRoe.toFixed(2) + '%'; }
        if (avgRoe >= 12.0) s3 = 20; else if (avgRoe >= 10.0) s3 = 15; else if (avgRoe >= 8.0) s3 = 10;
        score += s3; details.push(`5年ROE  : +${s3}分`);

        let s4 = 0; let nplFloat = parseFloat(c.npl) || 9.9;
        if (nplFloat <= 1.0) s4 = 15; else if (nplFloat <= 1.2) s4 = 10; else if (nplFloat <= 1.4) s4 = 5;
        score += s4; details.push(`不良率  : +${s4}分`);
        
        let s5 = 0; let pcrFloat = parseFloat(c.pcr) || 0;
        if (pcrFloat >= 300) s5 = 15; else if (pcrFloat >= 200) s5 = 10; else if (pcrFloat >= 150) s5 = 5;
        score += s5; details.push(`拨备率  : +${s5}分`);

        score = Math.round(score);
        let scoreClass = score >= 80 ? 'score-a' : (score >= 60 ? 'score-b' : 'score-c');
        let tooltipText = `【评分明细 (满分100)】\n----------------\n${details.join('\n')}\n----------------\n总计: ${score} 分`;

        return { code, price: c.price||'---', pb: c.pb||'---', dv: c.dv||0, distVal, distMidText, distMidClass, statText, pctClass, 
                 buy: buyT, sell: sellT, buyPrice, sellPrice, score, scoreClass, avgRoe, avgRoeText, tooltipText,
                 npl: c.npl || 0, pcr: c.pcr || 0, originalIndex: myCodes.indexOf(code) };
    });

    const canDrag = sortConfig.key === null;
    document.getElementById('drag-tip').style.visibility = canDrag ? 'visible' : 'hidden';
    if (sortConfig.key) tableData.sort((a,b) => (sortConfig.asc ? 1 : -1) * (parseFloat(a[sortConfig.key]) - parseFloat(b[sortConfig.key])));

    document.getElementById('main-table').innerHTML = tableData.map((d, i) => `
        <tr draggable="${canDrag}" data-index="${d.originalIndex}">
            <td data-label="🏦 名称" style="text-align: left; padding-left: 10px;">
                <div style="display: flex; align-items: center;">
                    ${canDrag ? '<span class="drag-handle">⋮⋮</span>' : ''}
                    <span class="ai-btn-trigger clickable-text" data-c="${d.code}" title="点击呼叫 AI 策略分析" style="margin: 0; padding:0;">${ALL_BANKS[d.code]}</span>
                </div>
            </td>
            <td data-label="⭐ 健康分" style="cursor: help;"><span class="score-badge ${d.scoreClass}" title="${d.tooltipText}">${d.score}</span></td>
            <td data-label="💰 现价 (回测)">
                <span class="bt-btn-trigger clickable-text" data-c="${d.code}" title="🚀 点击进行历史回测" style="font-size: 15px; margin-right: 6px;">${d.price}</span>
                <span style="font-size:12px; font-family: monospace; color: var(--text-muted);"><span style="color:var(--success);">(买:${d.buyPrice})</span><span style="color:var(--danger); margin-left: 2px;">(卖:${d.sellPrice})</span></span>
            </td>
            <td data-label="📈 PB估值"><span class="pb-btn-trigger clickable-text" data-c="${d.code}" title="点击查看 PB 走势图" style="font-family: monospace; font-size: 14px;">${d.pb}</span></td>
            <td data-label="🎯 买卖防线">
                <div style="display: inline-flex; align-items: center; justify-content: center;">
                    <input type="number" step="0.01" value="${d.buy}" class="set-line" data-t="buy" data-c="${d.code}" style="color:var(--danger);"> <span style="color: var(--border); margin: 0 2px;">/</span>
                    <input type="number" step="0.01" value="${d.sell}" class="set-line" data-t="sell" data-c="${d.code}" style="color:var(--success);">
                </div>
            </td>
            <td data-label="⚖️ 距中位"><span class="stat-box ${d.distMidClass}">${d.distMidText}</span></td>
            <td data-label="📊 估值分位"><span class="stat-box ${d.pctClass}">${d.statText}</span></td>
            <td data-label="💸 股息率"><span class="dv-btn-trigger clickable-text" data-c="${d.code}" title="点击查看历年股息率" style="font-family: monospace; font-size: 14px;">${d.dv?parseFloat(d.dv).toFixed(2)+'%':'---'}</span></td>
            <td data-label="💡 5年ROE" style="color:#8b5cf6; font-family: monospace; font-weight:600;">${d.avgRoeText}</td>
            <td data-label="⚠️ 不良率" style="color:var(--danger); font-family: monospace; font-weight:600;">${d.npl ? d.npl.toFixed(2)+'%' : '--'}</td>
            <td data-label="🛡️ 拨备率" style="color:var(--success); font-family: monospace; font-weight:600;">${d.pcr ? d.pcr.toFixed(2)+'%' : '--'}</td>
            <td data-label="🗑️ 移除"><button class="btn-del" data-c="${d.code}" title="移除该银行">×</button></td>
        </tr>
    `).join('');
    bindTableEvents();
}

function bindTableEvents() {
    document.querySelectorAll('.set-line').forEach(el => el.onchange = async (e) => {
        await apiSet({ [`bank_${e.target.dataset.c}`]: { [e.target.dataset.t]: parseFloat(e.target.value) } });
        renderTable(); 
    });

    document.querySelectorAll('.btn-del').forEach(b => b.onclick = async () => {
        b.innerHTML = '⏳'; 
        const s = await apiGet();
        const list = s.user.my_bank_list.filter(c => c !== b.dataset.c);
        await apiSet({ my_bank_list: list }); 
        updateSelector(); renderTable(); 
    });

    // ========================================================
    // 🌟 核心：流式前端解析 (打字机效果)
    // ========================================================
    document.querySelectorAll('.ai-btn-trigger').forEach(btn => btn.onclick = async () => {
        const code = btn.dataset.c;
        document.getElementById('ai-modal').style.display = 'flex';
        document.getElementById('ai-title').innerText = `🤖 ${ALL_BANKS[code]} - AI 策略报告 (连接中...)`;
        
        const contentDiv = document.getElementById('ai-content');
        contentDiv.innerHTML = '<div style="color: var(--text-muted); text-align: center; margin-top: 40px;">⏳ 正在与云端建立流式连接通道...</div>';

        try {
            const r = await fetch(API_BASE + '/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': authToken },
                body: JSON.stringify({ code })
            });

            if (!r.ok) { contentDiv.innerHTML = `<div style="color:var(--danger); text-align:center; margin-top:40px;">🚨 接口请求失败：状态码 ${r.status}</div>`; return; }

            // 1. 如果命中本地 KV 缓存，后端会直接返回 JSON
            const contentType = r.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const res = await r.json();
                document.getElementById('ai-title').innerText = `🤖 ${ALL_BANKS[code]} - AI 策略报告`;
                contentDiv.innerHTML = res.success ? res.analysis.replace(/\n/g, '<br>') : `请求失败：\n${res.message}`;
                return;
            }

            // 2. 如果是实时思考，开启打字机效果
            document.getElementById('ai-title').innerText = `🤖 ${ALL_BANKS[code]} - AI 策略报告 (流式生成中 🟢)`;
            contentDiv.innerHTML = ''; 
            
            const reader = r.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullHtml = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            let token = data.choices[0]?.delta?.content || '';
                            
                            if (token) {
                                fullHtml += token;
                                // 将大模型的 <think> 标签替换为漂亮的灰色引用框
                                let displayHtml = fullHtml
                                    .replace(/<think>/g, '<div style="color:#94a3b8; font-size:0.9em; border-left:3px solid #cbd5e1; padding-left:10px; margin:10px 0; background:#f8fafc; padding: 10px; border-radius:4px;"><i>🤔 AI 深度思考过程：<br>')
                                    .replace(/<\/think>/g, '</i></div><br>')
                                    .replace(/\n/g, '<br>');
                                
                                contentDiv.innerHTML = displayHtml;
                                contentDiv.scrollTop = contentDiv.scrollHeight; // 自动滚到底部
                            }
                        } catch(e) {}
                    }
                }
            }
            document.getElementById('ai-title').innerText = `🤖 ${ALL_BANKS[code]} - AI 策略报告`;
        } catch(e) {
            contentDiv.innerHTML += `<div style="color: var(--danger); text-align: center; margin-top: 20px;">🚨 连接意外中断：${e.message}</div>`;
        }
    });

    document.querySelectorAll('.bt-btn-trigger').forEach(btn => btn.onclick = () => runBacktest(btn.dataset.c));
    document.querySelectorAll('.pb-btn-trigger').forEach(span => span.onclick = () => showPbChart(span.dataset.c));
    
    document.querySelectorAll('.dv-btn-trigger').forEach(btn => btn.onclick = async () => {
        const code = btn.dataset.c; const data = await apiGet(); const dvMap = (data.cache[code] || {}).yearly_dv || {};
        document.getElementById('data-title').innerText = `${ALL_BANKS[code]} · 历史股息率`;
        let html = `<table class="modern-table"><thead><tr><th>年份</th><th>年末股息率 (%)</th></tr></thead><tbody>`;
        const sortedYears = Object.keys(dvMap).sort((a,b) => b - a).slice(0, 5);
        sortedYears.forEach(y => { html += `<tr><td style="color:var(--text-muted);">${y}</td><td style="color:var(--primary); font-weight:600;">${parseFloat(dvMap[y]).toFixed(2)}%</td></tr>`; });
        html += `</tbody></table>`;
        if(sortedYears.length === 0) html = "<p style='color:var(--text-muted); margin-top:20px;'>暂无数据，请先点击右上角 [TS Token] 进行同步</p>";
        document.getElementById('data-content').innerHTML = html; document.getElementById('data-modal').style.display = 'flex';
    });

    const rows = document.querySelectorAll('#main-table tr');
    let dragSrcEl = null; let isHandleClicked = false; 
    rows.forEach(row => {
        if(row.getAttribute('draggable') === 'false') return;
        row.addEventListener('mousedown', function(e) { isHandleClicked = e.target.classList.contains('drag-handle'); });
        row.addEventListener('dragstart', function(e) {
            if (!isHandleClicked) { e.preventDefault(); return false; }
            dragSrcEl = this; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/html', this.innerHTML); this.classList.add('dragging'); 
        });
        row.addEventListener('dragover', function(e) { e.preventDefault(); this.classList.add('drag-over'); return false; });
        row.addEventListener('dragleave', function(e) { this.classList.remove('drag-over'); });
        row.addEventListener('dragend', function(e) { this.classList.remove('dragging'); rows.forEach(r => r.classList.remove('drag-over')); });
        row.addEventListener('drop', async function(e) {
            e.stopPropagation(); this.classList.remove('drag-over');
            if (dragSrcEl !== this) {
                const srcIdx = parseInt(dragSrcEl.getAttribute('data-index'));
                const tgtIdx = parseInt(this.getAttribute('data-index'));
                const data = await apiGet(); const list = [...data.user.my_bank_list];
                const item = list.splice(srcIdx, 1)[0]; list.splice(tgtIdx, 0, item);
                await apiSet({ my_bank_list: list }); renderTable(); 
            }
            return false;
        });
    });
}

async function runBacktest(code) {
    const data = await apiGet();
    const cache = data.cache[code];
    const uConf = data.user[`bank_${code}`] || {};
    const buyT = uConf.buy || 0.6, sellT = uConf.sell || 1.0;
    const period = parseInt(document.getElementById('period-selector').value);
    
    if (!cache || !cache.h || cache.h.length === 0 || cache.h[0].c === undefined) {
        alert("缺少历史收盘价数据，请先同步数据！"); return;
    }

    const cutoffDate = new Date(); cutoffDate.setFullYear(cutoffDate.getFullYear() - period);
    const cutoffStr = cutoffDate.toISOString().slice(0,10).replace(/-/g,'');
    
    const historyData = cache.h.filter(x => x.d >= cutoffStr).sort((a,b) => a.d.localeCompare(b.d));
    if (historyData.length === 0) { alert("该周期内无数据"); return; }

    let initCapital = 100000; let capital = initCapital; let shares = 0; let buyPrice = 0;
    let wins = 0; let trades = 0; let maxDrawdown = 0; let peakEquity = initCapital; let logsHtml = '';

    for(let row of historyData) {
        let price = parseFloat(row.c); let pb = parseFloat(row.v);
        let dateFmt = row.d.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');

        if (shares === 0 && pb <= buyT) {
            shares = capital / price; buyPrice = price; capital = 0;
            logsHtml = `<div style="color:var(--danger); padding:6px 0; border-bottom:1px dashed #eee;">🔴 ${dateFmt} 买入 | PB: ${pb} | 价格: ¥${price.toFixed(2)}</div>` + logsHtml;
        } else if (shares > 0 && pb >= sellT) {
            capital = shares * price; let profit = capital - (shares * buyPrice);
            if (profit > 0) wins++; trades++; shares = 0;
            let pColor = profit >= 0 ? 'var(--danger)' : 'var(--success)';
            logsHtml = `<div style="color:var(--success); padding:6px 0; border-bottom:1px dashed #eee;">🟢 ${dateFmt} 卖出 | PB: ${pb} | 价格: ¥${price.toFixed(2)} | <span style="color:${pColor}">盈亏: ¥${profit.toFixed(0)}</span></div>` + logsHtml;
        }
        let currentEquity = shares > 0 ? shares * price : capital;
        if (currentEquity > peakEquity) peakEquity = currentEquity;
        let drawdown = (peakEquity - currentEquity) / peakEquity;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    let finalEquity = shares > 0 ? shares * historyData[historyData.length-1].c : capital;
    let totalReturnPct = ((finalEquity - initCapital) / initCapital) * 100;
    let annReturnPct = totalReturnPct / period;
    let winRate = trades > 0 ? (wins/trades)*100 : 0;

    document.getElementById('backtest-title').innerText = `🚀 ${ALL_BANKS[code]} · 历史防线回测`;
    document.getElementById('backtest-summary').innerHTML = `
        <div style="text-align:center;"><div style="font-size:12px; color:var(--text-muted); font-weight:normal;">回测周期</div><div style="color:var(--text-main); font-size:16px;">近 ${period} 年</div></div>
        <div style="text-align:center;"><div style="font-size:12px; color:var(--text-muted); font-weight:normal;">你的策略</div><div style="color:var(--text-main); font-size:16px;">${buyT} 买 / ${sellT} 卖</div></div>
        <div style="text-align:center;"><div style="font-size:12px; color:var(--text-muted); font-weight:normal;">年化收益</div><div style="color:${annReturnPct>=0?'var(--danger)':'var(--success)'}; font-size:16px;">${annReturnPct.toFixed(1)}%</div></div>
        <div style="text-align:center;"><div style="font-size:12px; color:var(--text-muted); font-weight:normal;">交易胜率</div><div style="color:var(--text-main); font-size:16px;">${winRate.toFixed(0)}%</div></div>
        <div style="text-align:center;"><div style="font-size:12px; color:var(--text-muted); font-weight:normal;">最大回撤</div><div style="color:var(--success); font-size:16px;">-${(maxDrawdown*100).toFixed(1)}%</div></div>
    `;
    if(logsHtml === '') logsHtml = '<div style="color:#888; text-align:center; margin-top:30px;">未触发买卖，防线设置可能过严。</div>';
    document.getElementById('backtest-content').innerHTML = logsHtml; document.getElementById('backtest-modal').style.display = 'flex';
}

async function showPbChart(code) {
    const data = await apiGet(); const cache = data.cache[code];
    if (!cache || !cache.h || cache.h.length === 0) { alert("暂无数据，请同步。"); return; }
    const uConf = data.user[`bank_${code}`] || {};
    const buyT = uConf.buy || 0.6, sellT = uConf.sell || 1.0, period = parseInt(document.getElementById('period-selector').value);
    const cutoffDate = new Date(); cutoffDate.setFullYear(cutoffDate.getFullYear() - period);
    const cutoffStr = cutoffDate.toISOString().slice(0,10).replace(/-/g,'');
    const chartData = cache.h.filter(x => x.d >= cutoffStr).map(x => [x.d.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'), x.v]).sort((a, b) => a[0].localeCompare(b[0]));
    if (chartData.length === 0) return;
    
    document.getElementById('chart-modal').style.display = 'flex';
    if (!myChart) myChart = echarts.init(document.getElementById('chart-container')); else myChart.clear();
    myChart.setOption({
        title: { text: `${ALL_BANKS[code]} 近${period}年 PB 走势`, left: 'center' },
        tooltip: { trigger: 'axis', formatter: '{b}<br/>PB: {c}' },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'time', boundaryGap: false }, 
        yAxis: { type: 'value', scale: true, name: 'PB' },
        series: [{ name: 'PB', type: 'line', data: chartData, showSymbol: false,
            areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(59,130,246,0.3)' }, { offset: 1, color: 'rgba(59,130,246,0.05)' }]) },
            itemStyle: { color: '#3b82f6' },
            markLine: { symbol: ['none', 'none'], silent: true, data: [ { yAxis: buyT, name: '买入', lineStyle: { color: '#ef4444', type: 'dashed' }, label: { formatter: '🔴买入: {c}', position: 'end', color: '#ef4444' } }, { yAxis: sellT, name: '卖出', lineStyle: { color: '#10b981', type: 'dashed' }, label: { formatter: '🟢卖出: {c}', position: 'end', color: '#10b981' } } ] }
        }]
    });
}

function closeModal() { document.getElementById('chart-modal').style.display = 'none'; }
function closeAiModal() { document.getElementById('ai-modal').style.display = 'none'; }
function closeBacktestModal() { document.getElementById('backtest-modal').style.display = 'none'; }

async function updateSelector() {
    const data = await apiGet(); const myCodes = data.user?.my_bank_list || [];
    const avail = Object.keys(ALL_BANKS).filter(c => !myCodes.includes(c));
    document.getElementById('bank-selector').innerHTML = avail.map(c => `<option value="${c}">${ALL_BANKS[c]}</option>`).join('');
}

const executeLogin = async () => {
    const u = document.getElementById('username').value.trim(); const p = document.getElementById('password').value.trim();
    if (!u || !p) return alert("请输入账号密码");
    const btn = document.getElementById('login-btn'); btn.innerText = "正在连接云端..."; btn.disabled = true;
    try {
        const res = await fetch(API_BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
        if (!res.ok) throw new Error(`云端异常: ${res.status}`);
        const d = await res.json();
        if (d.success) { authToken = d.token; localStorage.setItem('bank_token', authToken); document.getElementById('current-user').innerText = u; document.getElementById('login-modal').style.display = 'none'; document.getElementById('app-content').style.display = 'block'; initApp(); } 
        else alert(d.message);
    } catch (e) { alert("🚨 连接失败: " + e.message); } finally { btn.innerText = "进入看板"; btn.disabled = false; }
};

document.getElementById('login-btn').onclick = executeLogin;
document.getElementById('password').onkeyup = (e) => { if (e.key === 'Enter') executeLogin(); };

async function initApp() {
    updateSelector(); renderTable(true); 
    
    const pyFinanceBtn = document.getElementById('py-finance-btn');
    if(pyFinanceBtn) {
        pyFinanceBtn.onclick = async () => {
            pyFinanceBtn.innerText = "⏳ 并发收集中..."; pyFinanceBtn.disabled = true;
            try {
                const r = await apiFetch('/api/update-finance', { method: 'POST' });
                const res = await r.json();
                if(res.success) { alert("✅ " + res.message); renderTable(true); } else alert("❌ " + res.message);
            } catch(e) {} finally { pyFinanceBtn.innerText = "📊 爬最新财报"; pyFinanceBtn.disabled = false; }
        };
    }

    document.getElementById('add-btn').onclick = async () => {
        const c = document.getElementById('bank-selector').value; const data = await apiGet(); const l = data.user.my_bank_list || [];
        if (c && !l.includes(c)) { l.push(c); await apiSet({ my_bank_list: l }); updateSelector(); renderTable(); }
    };

    document.getElementById('ai-btn').onclick = async () => {
        const data = await apiGet();
        document.getElementById('ai-url-input').value = data.user.ai_url || ''; document.getElementById('ai-key-input').value = data.user.ai_key || '';
        const modelSelect = document.getElementById('ai-model-select');
        if (data.user.ai_model) modelSelect.innerHTML = `<option value="${data.user.ai_model}">${data.user.ai_model}</option>`;
        else modelSelect.innerHTML = `<option value="">请先点击刷新获取...</option>`;
        document.getElementById('ai-config-modal').style.display = 'flex';
    };

    document.getElementById('fetch-models-btn').onclick = async () => {
        const url = document.getElementById('ai-url-input').value.trim(), key = document.getElementById('ai-key-input').value.trim();
        if (!url || !key) return alert("请先填写！");
        const btn = document.getElementById('fetch-models-btn'); btn.innerText = "⏳ 刷新中..."; btn.disabled = true;
        try {
            const r = await apiFetch('/api/models', { method: 'POST', body: JSON.stringify({ ai_url: url, ai_key: key }) });
            const res = await r.json();
            if (res.success && res.models && res.models.length > 0) { document.getElementById('ai-model-select').innerHTML = res.models.map(m => `<option value="${m}">${m}</option>`).join(''); alert("✅ 获取成功！"); } 
            else alert("❌ 失败: " + res.message);
        } catch(e) { } finally { btn.innerText = "🔄 刷新获取"; btn.disabled = false; }
    };

    document.getElementById('save-ai-btn').onclick = async () => {
        const url = document.getElementById('ai-url-input').value.trim(), model = document.getElementById('ai-model-select').value.trim(), key = document.getElementById('ai-key-input').value.trim();
        await apiSet({ ai_url: url, ai_model: model, ai_key: key }); document.getElementById('ai-config-modal').style.display = 'none'; alert("✅ 配置已保存！");
    };

    const logModal = document.getElementById('log-modal'); const logConsole = document.getElementById('log-console');
    document.getElementById('log-view-btn').onclick = () => { logModal.style.display = 'flex'; refreshLogs(); };

    async function refreshLogs() {
        if (logModal.style.display !== 'flex') return;
        try {
            const r = await apiFetch('/api/logs'); const res = await r.json();
            if (res.success) {
                logConsole.innerHTML = res.logs.map(line => {
                    let color = "#94a3b8";
                    if (line.includes('错误') || line.includes('失败') || line.includes('❌') || line.includes('限制')) color = "#ef4444";
                    if (line.includes('成功') || line.includes('✅') || line.includes('完成')) color = "#10b981";
                    if (line.includes('开始') || line.includes('正在') || line.includes('🚀') || line.includes('🤖')) color = "#38bdf8";
                    return `<div style="color: ${color}; margin-bottom: 6px; border-bottom: 1px solid #1e293b; padding-bottom: 4px;">${line}</div>`;
                }).join('');
                logConsole.scrollTop = logConsole.scrollHeight; 
            }
        } catch (e) {} setTimeout(refreshLogs, 2000);
    }

    document.getElementById('close-log-btn').onclick = () => logModal.style.display = 'none';
    document.getElementById('clear-log-btn').onclick = async () => { await apiFetch('/api/logs/clear', { method: 'POST' }); logConsole.innerHTML = '<div style="color: #64748b;">已清空...</div>'; };

    document.getElementById('token-btn').onclick = async () => {
        const data = await apiGet(); const t = prompt("请输入 Tushare Token:", data.user?.ts_token || '');
        if (t !== null) { await apiSet({ ts_token: t.trim() }); fetch(API_BASE + '/api/sync', { method: 'POST', headers: { 'Authorization': authToken, 'Content-Type': 'application/json' } }); alert("同步已在云端开启，请看日志。"); }
    };
    
    document.getElementById('sct-btn').onclick = async () => { const data = await apiGet(); const k = prompt("请输入 Server酱:", data.user?.sct_key || ''); if (k !== null) { await apiSet({ sct_key: k.trim() }); alert("已保存"); } };
    
    ['header-score', 'header-pb', 'header-dist', 'header-dv', 'header-roe', 'header-npl', 'header-pcr'].forEach(id => document.getElementById(id).onclick = () => {
        let k = id.split('-')[1]; if (k === 'dist') k = 'distVal'; if (k === 'roe') k = 'avgRoe'; 
        if (sortConfig.key === k) sortConfig.asc = !sortConfig.asc; else { sortConfig.key = k; sortConfig.asc = (k !== 'score' && k !== 'dv' && k !== 'roe'); } 
        renderTable(); 
    });
    
    document.getElementById('period-selector').onchange = () => renderTable();
    document.getElementById('close-modal-btn').onclick = closeModal;
    document.getElementById('close-ai-btn').onclick = closeAiModal;
    document.getElementById('close-backtest-btn').onclick = closeBacktestModal;
    document.getElementById('close-ai-config-btn').onclick = () => document.getElementById('ai-config-modal').style.display = 'none';
    document.getElementById('close-data-btn').onclick = () => document.getElementById('data-modal').style.display = 'none';
    
    document.addEventListener('click', (e) => {
        if (['chart-modal','ai-modal','backtest-modal','ai-config-modal','log-modal','data-modal'].includes(e.target.id)) document.getElementById(e.target.id).style.display = 'none';
    });
    setInterval(() => renderTable(true), 30000); 
}

document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        fetch(API_BASE + '/api/data', { headers: { 'Authorization': authToken } }).then(res => {
            if (res.ok) { document.getElementById('login-modal').style.display = 'none'; document.getElementById('app-content').style.display = 'block'; document.getElementById('current-user').innerText = atob(authToken).split(':')[0]; initApp(); } 
            else logout();
        }).catch(logout);
    }
});
window.onresize = function() { if (myChart) myChart.resize(); };