/* 04-api.js —— 大模型调用（OpenAI 规范兼容），返回 {content, reasoning} */
"use strict";

/* AI 实际使用的连接：下拉选择了某条 API 连接则复用其地址 / Key */
function effCfg(ai){
  const c = ai.api ? state.cfg.apis.find(x => x.name === ai.api) : null;
  return c ? Object.assign({}, ai, {base: c.base, key: c.key}) : ai;
}

/* ---- 自动重试 ----
   可重试：网络错误 / CORS / 超时、HTTP 408 425 429 500 502 503 504（瞬时故障）、AI 空返回。
   不重试（重试也没用，直接失败）：HTTP 400/401/403/404 等参数或鉴权错误、未配置地址/Key。 */
const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
const API_RETRY_MAX = 3;                    // 总尝试次数（含首次）
const apiDelay = ms => new Promise(r => setTimeout(r, ms));

async function callLLM(cfg, messages, tempOverride, onDelta){
  const base = (cfg.base || '').trim().replace(/\/+$/, '');
  if(!base) throw new Error(cfg.name + ' 的 API 地址为空');
  if(!cfg.key) throw new Error(cfg.name + ' 的 API Key 为空');
  let lastErr;
  for(let attempt = 1; attempt <= API_RETRY_MAX; attempt++){
    try{
      return await callLLMOnce(base, cfg, messages, tempOverride, onDelta);
    }catch(e){
      lastErr = e;
      const msg = String((e && e.message) || e);
      const m = msg.match(/^HTTP (\d{3})/);
      const retryable = m ? RETRYABLE_HTTP.has(+m[1])
        : !(msg.includes('API 地址为空') || msg.includes('API Key 为空'));
      if(!retryable || attempt >= API_RETRY_MAX) throw e;
      toast(cfg.name + ' 请求失败（' + msg.slice(0, 50) + '），自动重试 ' + attempt + '/' + (API_RETRY_MAX - 1) + '…');
      await apiDelay(1000 * attempt);       // 1s、2s 递增退避
    }
  }
  throw lastErr;
}

async function callLLMOnce(base, cfg, messages, tempOverride, onDelta){
  const stream = typeof onDelta === 'function' && !!state.cfg.stream;   // 开关打开且调用方给了回调才走流式
  const body = {model: (cfg.model || '').trim(), messages: messages, stream: stream};
  const t = tempOverride !== undefined ? tempOverride : parseFloat(cfg.temp);
  if(!isNaN(t)) body.temperature = t;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 120000);
  let res;
  try{
    res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key},
      body: JSON.stringify(body), signal: ctl.signal
    });
  }catch(e){ throw new Error('请求失败（网络 / CORS / 超时）→ ' + base); }
  finally{ clearTimeout(timer); }
  if(!res.ok){
    let d = ''; try{ d = (await res.text()).slice(0, 200); }catch(_){}
    throw new Error('HTTP ' + res.status + ' ' + (d || ''));
  }
  if(!stream){
    const data = await res.json();
    const msg = data && data.choices && data.choices[0] && data.choices[0].message || {};
    const content = String(msg.content || '').trim();
    const reasoning = String(msg.reasoning_content || msg.reasoning || '').trim();   // 思考过程（GLM / MiMo 等默认返回）
    if(!content) throw new Error('AI 返回了空内容');
    return {content, reasoning};
  }
  // ---- SSE 流式读取：delta 增量拼接，onDelta(累计内容, 累计思考) 实时回调 ----
  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '', raw = '', content = '', reasoning = '';
  try{
    while(true){
      const {done, value} = await reader.read();
      if(done) break;
      const chunk = dec.decode(value, {stream: true});
      buf += chunk; raw += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();                              // 末段可能不完整，留待下一块
      for(const line of lines){
        const s = line.trim();
        if(!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if(!payload || payload === '[DONE]') continue;
        try{
          const j = JSON.parse(payload);
          const d = (j.choices && j.choices[0] && j.choices[0].delta) || {};
          if(d.content){ content += d.content; onDelta(content, reasoning); }
          const r = d.reasoning_content || d.reasoning;
          if(r){ reasoning += r; onDelta(content, reasoning); }
        }catch(_){}
      }
    }
  }catch(e){ throw new Error('流式读取中断：' + (e.message || e)); }
  if(!content.trim()){                                // 兜底：接口忽略 stream 参数、直接回了整段 JSON
    try{
      const j = JSON.parse(raw);
      const msg = j.choices && j.choices[0] && (j.choices[0].message || j.choices[0].delta) || {};
      content = String(msg.content || '').trim();
      reasoning = String(msg.reasoning_content || msg.reasoning || '').trim();
    }catch(_){}
  }
  if(!content.trim()) throw new Error('AI 返回了空内容');
  return {content, reasoning};
}

/* 去掉模型可能带出的名字前缀 / 代码块标记 */
function sanitize(id, out){
  let s = stripFences(out);
  const c = getAi(id); const nm = c ? c.name : id;
  s = s.replace(/^\[[^\]\n]{1,12}\]\s*/, '').replace(new RegExp('^' + escReg(nm) + '\\s*[:：]\\s*'), '');
  return s.trim();
}
function stripFences(s){ return s.replace(/^\s*```[a-zA-Z0-9]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim(); }
