/* 02-config.js —— 配置读写：localStorage 降级 + config.txt 序列化/解析 */
"use strict";

function saveCfgLS(){ try{ localStorage.setItem(LS_CFG, JSON.stringify(state.cfg)); }catch(e){} }

function loadCfg(){
  try{
    let raw = localStorage.getItem(LS_CFG);
    if(!raw) raw = localStorage.getItem(LS_CFG_OLD);           // 旧版本迁移
    if(!raw) return;
    const c = JSON.parse(raw);
    if(Array.isArray(c.ais) && c.ais.length){
      state.cfg.ais = c.ais.map(a => Object.assign({mem:true, think:true, api:''}, a));
    }else if(c.A && c.B){                                      // 最初的双 AI 结构迁移
      const mk = (id, s) => Object.assign({id, name:s.name, base:s.base, key:s.key, model:s.model, temp:s.temp, mem:s.mem, think:true, api:'', persona:s.persona});
      state.cfg.ais = [mk('AI1', c.A), mk('AI2', c.B)];
    }
    if(Array.isArray(c.apis)) state.cfg.apis = c.apis; else state.cfg.apis = [];
    ['topic','rules','hist','stream','rounds','gap','after','first'].forEach(k => { if(c[k] !== undefined) state.cfg[k] = c[k]; });
    if(Array.isArray(c.order)) state.cfg.order = c.order;
    if(!Array.isArray(state.cfg.order) || !state.cfg.order.length) state.cfg.order = state.cfg.ais.map(a => a.id);
    state.cfg.order = state.cfg.order.filter(id => state.cfg.ais.some(a => a.id === id));
    if(!state.cfg.order.length) state.cfg.order = state.cfg.ais.map(a => a.id);
    if(!state.cfg.order.includes(state.cfg.first)) state.cfg.first = state.cfg.order[0];
    if(!state.cfg.order.includes(state.cfg.after)) state.cfg.after = state.cfg.order[0];
  }catch(e){}
}

/* ---- 发言顺序：id/名称 解析 ---- */
function resolveOrderTokens(tokens){
  const out = [];
  for(const t of tokens){
    const a = state.cfg.ais.find(x => x.id.toLowerCase() === t.toLowerCase()) || state.cfg.ais.find(x => x.name === t);
    if(a && !out.includes(a.id)) out.push(a.id);
  }
  return out;
}
function speakOrder(){                       // 实际参与发言的 AI（按顺序）
  let list = (state.cfg.order || []).filter(id => getAi(id));
  if(!list.length) list = state.cfg.ais.map(a => a.id);
  return list;
}

/* ---- 表单 <-> 模型 ---- */
function readGlobal(){
  const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const gc = id => { const el = document.getElementById(id); return el ? el.checked : false; };
  state.cfg.topic = g('f_topic'); state.cfg.rules = g('f_rules'); state.cfg.hist = g('f_hist');
  state.cfg.stream = gc('f_stream');
  state.cfg.rounds = g('f_rounds'); state.cfg.gap = g('f_gap');
  if(!Array.isArray(state.cfg.order) || !state.cfg.order.length) state.cfg.order = state.cfg.ais.map(a => a.id);
  state.cfg.first = state.cfg.order.includes(g('f_first')) ? g('f_first') : state.cfg.order[0];
  state.cfg.after = state.cfg.order.includes(g('f_after')) ? g('f_after') : state.cfg.order[0];
}
function readCfgForm(){ readGlobal(); renderOrderSelects(); renderOrderMsel(); persistCfg(); }
function applyCfgToForm(){
  $('#f_topic').value = state.cfg.topic; $('#f_rules').value = state.cfg.rules; $('#f_hist').value = state.cfg.hist;
  $('#f_stream').checked = !!state.cfg.stream;
  $('#f_rounds').value = state.cfg.rounds; $('#f_gap').value = state.cfg.gap;
  renderOrderSelects(); renderOrderMsel();
}

/* ---- config.txt 序列化 / 解析 ---- */
function escCfgVal(s){ return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n'); }
function unescCfgVal(s){ return s.replace(/\\n|\\\\/g, m => m === '\\n' ? '\n' : '\\'); }

function serializeCfgTxt(){
  const L = [];
  L.push('# ===================================================');
  L.push('# AI 多角色对话实验室 配置文件（config.txt）');
  L.push('# 可直接手动编辑：value 里的换行写成 \\n ；# 开头为注释行');
  L.push('# AI 数量可扩展：复制一个 [AI#] 分节并把编号 +1 即可（如 [AI3]）');
  L.push('# order = 参与发言的 AI 与先后顺序（逗号分隔，留空=全部）；first = 开场先发言；after = 人类插话后先回应');
  L.push('# 手动改完保存后，到页面顶部点「⟳ 重载配置」生效');
  L.push('# ===================================================');
  L.push('');
  for(const a of state.cfg.ais){
    L.push('# ---- ' + a.name + ' ----');
    L.push('[' + a.id + ']');
    L.push('name = ' + a.name);
    L.push('base = ' + a.base);
    L.push('key = ' + a.key);
    L.push('model = ' + a.model);
    L.push('temp = ' + a.temp);
    L.push('autoMem = ' + (a.mem ? '1' : '0'));
    L.push('showThink = ' + (a.think !== false ? '1' : '0'));
    L.push('api = ' + (a.api || ''));
    L.push('persona = ' + escCfgVal(a.persona));
    L.push('');
  }
  L.push('# ---- API 连接（供各 AI 下拉选择复用；格式：名称 = 地址|Key|默认模型） ----');
  L.push('[API]');
  for(const c of state.cfg.apis) L.push(c.name + ' = ' + c.base + '|' + c.key + '|' + (c.model || ''));
  L.push('');
  L.push('# ---- 全局 ----');
  L.push('[全局]');
  L.push('topic = ' + escCfgVal(state.cfg.topic));
  L.push('rules = ' + escCfgVal(state.cfg.rules || ''));
  L.push('hist = ' + (parseInt(state.cfg.hist) || 0));
  L.push('stream = ' + (state.cfg.stream ? '1' : '0'));
  L.push('rounds = ' + state.cfg.rounds);
  L.push('gap = ' + state.cfg.gap);
  L.push('order = ' + speakOrder().join(','));
  L.push('first = ' + state.cfg.first);
  L.push('after = ' + state.cfg.after);
  L.push('');
  return L.join('\n');
}
function parseCfgTxt(txt){
  const out = {}; let sec = 'G';
  for(const raw of txt.split(/\r?\n/)){
    const line = raw.trim();
    if(!line || line.startsWith('#')) continue;
    const m = line.match(/^\[(.+)\]$/);
    if(m){
      sec = legacyId(m[1].trim());
      if(!/^AI\d+$/.test(sec) && sec !== 'G' && sec !== 'API' && sec !== '人类') sec = 'G';
      out[sec] = out[sec] || {};   // 空分节也要建立（如空的 [API]）
      continue;
    }
    const i = line.indexOf('=');
    if(i < 0) continue;
    (out[sec] = out[sec] || {})[line.slice(0, i).trim()] = unescCfgVal(line.slice(i + 1).trim());   // 保留键名大小写（连接名含大写）
  }
  return out;
}
function applyParsedCfg(p){
  const ids = Object.keys(p).filter(k => /^AI\d+$/.test(k)).sort((a, b) => +a.slice(2) - +b.slice(2));
  if(ids.length){
    state.cfg.ais = ids.map(id => {
      const s = p[id], old = state.cfg.ais.find(a => a.id === id);
      const ai = old || {id, name: s.name || ('AI-' + id.slice(2)), base:'https://api.deepseek.com', key:'', model:'deepseek-chat', temp:0.8, mem:true, think:true, persona:''};
      if(s.name) ai.name = s.name;
      if(s.base) ai.base = s.base;
      if(s.key) ai.key = s.key;
      if(s.model) ai.model = s.model;
      if(s.temp !== undefined && s.temp !== '') ai.temp = s.temp;
      if(s.persona !== undefined) ai.persona = s.persona;
      if(s.autoMem !== undefined) ai.mem = (s.autoMem === '1' || s.autoMem === 'true');
      if(s.showThink !== undefined) ai.think = (s.showThink === '1' || s.showThink === 'true');
      if(s.api !== undefined) ai.api = s.api;
      return ai;
    });
  }
  if(p.API){
    state.cfg.apis = Object.entries(p.API).map(([name, v]) => {
      const parts = String(v).split('|');
      return {name, base: parts[0] || '', key: parts[1] || '', model: parts[2] || ''};
    });
  }
  // 文件里没有 [API] 分节（旧版配置文件）→ 保留当前已定义的连接，不覆盖
  const g = p.G || {};
  if(g.topic !== undefined) state.cfg.topic = g.topic;
  if(g.rules !== undefined) state.cfg.rules = g.rules;
  if(g.hist !== undefined) state.cfg.hist = g.hist;
  if(g.stream !== undefined) state.cfg.stream = (g.stream === '1' || g.stream === 'true');
  if(g.rounds !== undefined) state.cfg.rounds = g.rounds;
  if(g.gap !== undefined) state.cfg.gap = g.gap;
  if(g.order !== undefined) state.cfg.order = resolveOrderTokens(String(g.order).split(/[,，、;；\s]+/).filter(Boolean));
  if(g.first) state.cfg.first = legacyId(g.first);
  if(g.after) state.cfg.after = legacyId(g.after);
  if(!Array.isArray(state.cfg.order) || !state.cfg.order.length) state.cfg.order = state.cfg.ais.map(a => a.id);
  state.cfg.order = state.cfg.order.filter(id => state.cfg.ais.some(a => a.id === id));
  if(!state.cfg.order.length) state.cfg.order = state.cfg.ais.map(a => a.id);
  if(!state.cfg.order.includes(state.cfg.first)) state.cfg.first = state.cfg.order[0];
  if(!state.cfg.order.includes(state.cfg.after)) state.cfg.after = state.cfg.order[0];
  const names = state.cfg.apis.map(c => c.name);
  state.cfg.ais.forEach(a => { if(a.api && !names.includes(a.api)) a.api = ''; });
}

/* ---- 自动写回（防抖 600ms；未连接目录时降级存浏览器） ---- */
let cfgSaveTimer = null;
function persistCfg(){
  if(state.dir){
    clearTimeout(cfgSaveTimer);
    cfgSaveTimer = setTimeout(() => { writeTxt(FILE_CFG, serializeCfgTxt()).catch(e => toast('写入 config.txt 失败：' + e.message, 'err')); }, 600);
  }else saveCfgLS();
}
