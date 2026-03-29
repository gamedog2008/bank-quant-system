// ==========================================
// 🏦 银行双擎量化系统 - Cloudflare Worker (流式终极版)
// ==========================================

const ALL_BANKS_CODES = ['601398','601288','601939','601988','601328','601658','600036','601166','601998','600000','600016','601818','000001','601916','600015','600919','600926','601169','601009','002142','601229','601838','601577','601963','601665','600908','600916','601077','601528','002807','002839','002936','002948','002956','002958','603323','601860','601997','600928','601162','601093','601128'];
const TS_URL = 'https://api.tushare.pro';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

function formatAiUrl(rawUrl, isModelList = false) {
  let url = rawUrl.trim();
  if (!url) return '';
  if (!url.startsWith('http')) url = 'https://' + url;
  while (url.endsWith('/')) url = url.slice(0, -1);
  if (isModelList) {
      if (url.endsWith('/chat/completions')) url = url.replace('/chat/completions', '/models');
      else if (!url.endsWith('/models')) url = url + '/models';
  } else {
      if (!url.endsWith('/chat/completions')) {
          if (url.endsWith('/v1')) url = url + '/chat/completions';
          else url = url + '/v1/chat/completions';
      }
  }
  return url;
}

async function getDb(env) {
  const users = await env.BANK_DB.get('users', 'json') || {};
  const cache = await env.BANK_DB.get('cache', 'json') || {};
  return { users, cache };
}
async function saveUsers(env, users) { await env.BANK_DB.put('users', JSON.stringify(users)); }
async function saveCache(env, cache) { await env.BANK_DB.put('cache', JSON.stringify(cache)); }

async function addLog(env, msg) {
  let logs = await env.BANK_DB.get('logs', 'json') || [];
  const time = new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
  logs.push(`[${time}] ${msg}`);
  if (logs.length > 200) logs.shift();
  await env.BANK_DB.put('logs', JSON.stringify(logs));
  console.log(msg);
}

async function checkAuth(req, env) {
  const token = req.headers.get('authorization');
  if (!token) return null;
  try {
    const [username, pwd] = atob(token).split(':');
    const { users } = await getDb(env);
    if (users[username] && users[username].password === pwd) return username;
  } catch (e) { return null; }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/login' && request.method === 'POST') {
        const { username, password } = await request.json();
        let { users } = await getDb(env);
        if (!users[username]) {
          users[username] = { password, my_bank_list: ['601398','601288','601939','601988'], ts_token: '', sct_key: '', ai_url: '', ai_model: '', ai_key: '' };
          await saveUsers(env, users);
          await addLog(env, `🆕 新用户注册: ${username}`);
        } else if (users[username].password !== password) {
          return jsonResp({ success: false, message: '密码错误' });
        }
        await addLog(env, `👤 用户登录: ${username}`);
        return jsonResp({ success: true, token: btoa(`${username}:${password}`) });
      }

      const user = await checkAuth(request, env);
      if (!user) return jsonResp({ error: 'Unauthorized' }, 401);

      if (path === '/api/data' && request.method === 'GET') {
        const { users, cache } = await getDb(env);
        try {
            const codesStr = ALL_BANKS_CODES.map(c => (c.startsWith('6') ? `s_sh${c}` : `s_sz${c}`)).join(',');
            const qtRes = await fetch(`https://qt.gtimg.cn/q=${codesStr}`);
            const qtText = await qtRes.text();
            let priceUpdated = false;
            qtText.split(';').forEach(row => {
                if (!row.includes('~')) return;
                const parts = row.split('~');
                const match = row.match(/_([shz]{2})(\d{6})=/);
                if (match) {
                    const cCode = match[2];
                    if (cache[cCode] && cache[cCode].bps) {
                        const newPrice = parseFloat(parts[3]).toFixed(2);
                        if (cache[cCode].price !== newPrice) {
                            cache[cCode].price = newPrice;
                            cache[cCode].pb = (parts[3] / cache[cCode].bps).toFixed(3);
                            priceUpdated = true;
                        }
                    }
                }
            });
            if (priceUpdated) ctx.waitUntil(saveCache(env, cache)); 
        } catch(e) {}
        return jsonResp({ user: users[user], cache });
      }

      if (path === '/api/set' && request.method === 'POST') {
        const body = await request.json();
        let { users } = await getDb(env);
        for (let key in body) {
          if (typeof body[key] === 'object' && !Array.isArray(body[key])) users[user][key] = { ...users[user][key], ...body[key] };
          else users[user][key] = body[key];
        }
        await saveUsers(env, users);
        return jsonResp({ success: true });
      }

      if (path === '/api/logs' && request.method === 'GET') {
        let logs = await env.BANK_DB.get('logs', 'json') || [];
        return jsonResp({ success: true, logs });
      }
      if (path === '/api/logs/clear' && request.method === 'POST') {
        await env.BANK_DB.put('logs', JSON.stringify([]));
        return jsonResp({ success: true });
      }

      if (path === '/api/models' && request.method === 'POST') {
        const { ai_url, ai_key } = await request.json();
        if (!ai_url || !ai_key) return jsonResp({ success: false, message: '必须提供 URL 和 Key' });
        const fetchUrl = formatAiUrl(ai_url, true);
        await addLog(env, `🔄 正在拉取 AI 模型列表...`);
        try {
          const response = await fetch(fetchUrl, { headers: { 'Authorization': `Bearer ${ai_key}` } });
          const data = await response.json();
          if (data && data.data) {
            return jsonResp({ success: true, models: data.data.map(m => m.id) });
          } else {
            return jsonResp({ success: false, message: '获取失败，接口返回格式不符' });
          }
        } catch (e) {
          return jsonResp({ success: false, message: '请求失败，请检查网络或 Key' }); 
        }
      }

      if (path === '/api/update-finance' && request.method === 'POST') {
        await addLog(env, `🚀 启动云端极速并发爬虫...`);
        const { cache } = await getDb(env);
        let updatedCount = 0;
        const fetchPromises = ALL_BANKS_CODES.map(async (code) => {
          const em_code = code.startsWith('6') ? `SH${code}` : `SZ${code}`;
          try {
            const res = await fetch(`https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?type=0&code=${em_code}`, { headers: { "User-Agent": "Mozilla/5.0" } });
            const data = await res.json();
            if (data?.data?.length > 0) {
              for (const report of data.data) {
                if (report.NONPERLOAN && report.BLDKBBL && report.NONPERLOAN !== "--" && report.BLDKBBL !== "--") {
                  if (!cache[code]) cache[code] = {};
                  cache[code].npl = Number(parseFloat(report.NONPERLOAN).toFixed(2));
                  cache[code].pcr = Number(parseFloat(report.BLDKBBL).toFixed(2));
                  updatedCount++; break;
                }
              }
            }
          } catch(e) {}
        });
        await Promise.all(fetchPromises);
        await saveCache(env, cache);
        await addLog(env, `✅ 财报更新完成，共 ${updatedCount} 家`);
        return jsonResp({ success: true, message: `更新 ${updatedCount} 家` });
      }

      if (path === '/api/sync' && request.method === 'POST') {
        const syncTask = async () => {
            const { users, cache } = await getDb(env);
            const token = users[user]?.ts_token;
            if (!token) return;
            await addLog(env, `🔄 启动 Tushare 断点续传...`);
            let hasUpdate = false; let fetchCount = 0;

            for (const code of ALL_BANKS_CODES) {
               const c = cache[code] || {};
               if (c.h && c.h.length > 0 && c.annual_data && c.annual_data.length > 0) continue;
               if (fetchCount >= 40) {
                   await addLog(env, `⚠️ 触及并发限制，请再次点击 [TS Token] 补齐！`); break;
               }

               try {
                  const tsCode = code.startsWith('6') ? `${code}.SH` : `${code}.SZ`;
                  const r1 = await fetch(TS_URL, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_name: 'daily_basic', token, params: { ts_code: tsCode, start_date: "20160101", end_date: "20261231" }, fields: 'trade_date,pb,close,dv_ratio' })
                  });
                  fetchCount++;
                  const d1 = await r1.json();
                  if (d1.code === 0 && d1.data?.items?.length > 0) {
                    const its = d1.data.items;
                    let yearly_dv = {};
                    its.forEach(x => { let y = String(x[0]).substring(0, 4); if (!yearly_dv[y] && x[3]) yearly_dv[y] = x[3]; });
                    if (!cache[code]) cache[code] = {};
                    cache[code].price = its[0][2].toFixed(2); cache[code].pb = its[0][1].toFixed(3);
                    cache[code].dv = its[0][3]; cache[code].bps = its[0][2]/its[0][1];
                    cache[code].h = its.map(x => ({ d: x[0], v: x[1], c: x[2] })).filter(v => v.v > 0);
                    cache[code].yearly_dv = yearly_dv; hasUpdate = true;
                  }
   
                  const currentYear = new Date().getFullYear();
                  const r2 = await fetch(TS_URL, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_name: 'fina_indicator', token, params: { ts_code: tsCode, start_date: `${currentYear - 6}0101`, end_date: `${currentYear}1231` }, fields: 'end_date,or_yoy,dt_netprofit_yoy,roe,eps' })
                  });
                  fetchCount++;
                  const d2 = await r2.json();
                  if (d2.code === 0 && d2.data?.items?.length > 0) {
                    const items = d2.data.items;
                    const annualReports = []; const seenYears = new Set();
                    for (let x of items) {
                        if (x[0].endsWith('1231')) {
                            let year = x[0].substring(0, 4);
                            if (!seenYears.has(year)) { seenYears.add(year); annualReports.push(x); if (annualReports.length === 5) break; }
                        }
                    }
                    let historyStr = annualReports.slice(0, 3).map(x => `- 【${x[0].substring(0, 4)}年报】营收同比: ${x[1]?x[1].toFixed(2):'--'}% | 利润同比: ${x[2]?x[2].toFixed(2):'--'}% | ROE: ${x[3]?x[3].toFixed(2):'--'}%`).join('\n');
                    let annualData = annualReports.map(x => ({ year: x[0].substring(0, 4), roe: x[3] ? x[3].toFixed(2) : '--', eps: x[4] ? x[4].toFixed(2) : '--' }));
                    if (!cache[code]) cache[code] = {};
                    cache[code].history = historyStr; cache[code].annual_data = annualData; hasUpdate = true;
                  }
               } catch(e) {}
            }
            if (hasUpdate) await saveCache(env, cache);
            if (fetchCount < 40) await addLog(env, `✅ 所有银行数据 100% 补齐！`);
        };
        ctx.waitUntil(syncTask());
        return jsonResp({ success: true, message: "Sync Started" });
      }

      // =================================================================
      // 🌟 AI 核心：流式打字机输出 (Server-Sent Events)
      // =================================================================
      if (path === '/api/ai' && request.method === 'POST') {
        const { code } = await request.json();
        const { users, cache } = await getDb(env);
        const uConf = users[user];
        if (!uConf.ai_key) return jsonResp({ success: false, message: '未配置 AI' });
        
        const d = new Date(new Date().getTime() + 8 * 60 * 60 * 1000); 
        d.setDate(d.getDate() - (d.getDay()||7) + 1);
        const weekId = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const kvAiKey = `ai_${code}_${weekId}`;

        const cachedReport = await env.BANK_DB.get(kvAiKey);
        if (cachedReport) {
            await addLog(env, `⚡ 命中 KV 缓存: 瞬间读取本地存档`);
            // 命中缓存时，为了前端统一解析，依然返回 JSON，前端会特殊处理
            return jsonResp({ success: true, analysis: `> *(💡 投研系统提示：以下为本周智能缓存，提取于本周初)*\n\n${cachedReport}` });
        }

        let url = formatAiUrl(uConf.ai_url, false);
        await addLog(env, `🤖 云端正建立流式连接...`);
        const c = cache[code] || {};
        
        let prompt = `你现在是一位资深的A股银行业研究员和量化专家。请基于以下实时数据及Tushare近3年财报趋势深度诊断该银行。要求：按模块输出，必须使用 Markdown 表格、列表和 Emoji 图标排版，拒绝套话。\n### 🌐 宏观大局观与基本面诊断\n*(系统提示：当前国内处于宽货币周期，LPR持续下调，十年期国债收益率在低位徘徊。)*\n${c.history||'暂无历史'}\n\n### 📊 实时估值与资产质量体检\n* 现价：${c.price}元\n* PB：${c.pb}倍 \n* 股息率：${c.dv}%\n* 不良率：${c.npl||'--'}% \n* 拨备覆盖率：${c.pcr||'--'}% \n\n### 🎯 操盘策略与防线修正建议\n* 用户原设防线: 买入PB ${uConf[`bank_${code}`]?.buy||0.6}，卖出PB ${uConf[`bank_${code}`]?.sell||1.0}。\n* 修正建议: (评判原设定是否合理，给出建议值)\n* 最终操作评级: (【🚨强烈买入 / 🟢逢低布局 / 🟡持有观望 / 🔴逢高减仓】必选一项)`;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${uConf.ai_key}` },
            // 🚨 核心改动：开启 stream: true
            body: JSON.stringify({ model: uConf.ai_model, messages: [{role: 'user', content: prompt}], stream: true })
        });
        
        if (!res.ok) { return jsonResp({ success: false, message: `大模型接口返回异常状态码: ${res.status}` }); }

        // 把数据流劈成两路：一路给前端网页打字机，一路留给 Worker 悄悄存 KV
        const [clientStream, workerStream] = res.body.tee();

        ctx.waitUntil((async () => {
            const reader = workerStream.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                                fullText += data.choices[0].delta.content;
                            }
                        } catch(e) {}
                    }
                }
            }
            const finalAnalysis = fullText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            if (finalAnalysis) {
                await env.BANK_DB.put(kvAiKey, finalAnalysis);
                await addLog(env, `✅ AI 流式分析完毕，并已自动存入 KV 缓存`);
            }
        })());

        // 直接把流怼回给前端，规避 100s 超时
        return new Response(clientStream, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", ...corsHeaders }
        });
      }

      return jsonResp({ error: 'Not found' }, 404);
    } catch (err) {
      return jsonResp({ error: err.message }, 500);
    }
  }
};