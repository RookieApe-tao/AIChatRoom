/* 07-main.js —— 主流程、文件读写、事件绑定、初始化 */
"use strict";

/* ---- 组装发给模型的消息 ---- */
function buildMessages(id){
  const c = getAi(id);
  const topic = (state.cfg.topic || '').trim();
  let sys = c.persona.trim();
  if(topic) sys += '\n\n# 场景设定\n' + topic;                                   // 场景设定常驻 System，不怕历史截断丢失
  sys += '\n\n# 你的长期记忆\n' + ((state.mem[id] || '').trim() || '（暂无）');
  sys += '\n\n# 对话规则\n' + ((state.cfg.rules || '').trim() || DEFAULT_RULES); // 留空 = 内置默认规则
  const msgs = [{role: 'system', content: sys}];
  const lim = Math.max(0, parseInt(state.cfg.hist) || 0);                       // 历史条数限制；0 = 全量
  let hist = parseChat(state.logText);
  if(lim > 0 && hist.length > lim) hist = hist.slice(-lim);
  for(const m of hist){
    if(m.sp === id) msgs.push({role: 'assistant', content: m.text});
    else msgs.push({role: 'user', content: (m.sp === '人类' ? '【人类插话】' : '') + m.text});
  }
  if(msgs.length === 1){ // 冷启动：用场景设定开场
    msgs.push({role: 'user', content: '【人类】' + (topic ? ('场景设定：' + topic + '\n请各位进入以上场景，自然地开始对话。') : '请开始一段有趣、有营养的对话。') + '请你（' + c.name + '）先开口。'});
  }
  return msgs;
}

/* ---- 主流程 ---- */
async function startChat(roundsOverride){
  if(state.running) return;
  readCfgForm();
  const order = speakOrder();
  if(!order.length){ toast('发言顺序为空：请先添加 AI', 'err'); return; }
  const roster = order.map(getAi).filter(a => a && effCfg(a).key);
  if(!roster.length){ toast('请先在配置里至少为一个 AI 填写 API Key', 'err'); $('#btnToggleCfg').click(); return; }
  const skipped = order.map(getAi).filter(a => a && !effCfg(a).key).map(a => a.name);
  if(skipped.length) toast('未填 Key，已跳过：' + skipped.join('、'));
  const N = roster.length;
  let n;
  if(roundsOverride !== undefined){              // 指定轮数（人类「发送」= 1 轮）
    n = Math.max(1, roundsOverride) * N;         // 1 轮 = 参与的每个 AI 各发言一次
    state.unlimited = false;
  }else{
    const raw = parseInt(state.cfg.rounds);
    const unlimited = (raw === -1);              // 仅 -1 = 无限轮数，直到手动暂停
    if(unlimited) n = Infinity;
    else if(raw >= 1) n = Math.min(100000, raw) * N;
    else{ toast('轮数无效：请填 ≥1 的数字，或 -1 表示无限'); return; }
    state.unlimited = unlimited;
  }
  // 起始发言者：空对话→「开场先发言」；人类刚插话→「人类插话后先回应」；否则从上一位的下一位继续。
  // order 里可能混有未填 Key 的 AI（跳过不发言、不占轮数），起始位置须沿 order 循环找到第一个可发言者，
  // 不能把 order 下标直接模 roster 长度，否则错位导致某个 AI 连说两次。
  const firstRosterFrom = k => {
    for(let j = 0; j < order.length; j++){
      const r = roster.findIndex(a => a.id === order[(k + j) % order.length]);
      if(r >= 0) return r;
    }
    return 0;
  };
  let startIdx = 0;
  const last = lastSpeaker();
  if(!last) startIdx = firstRosterFrom(Math.max(0, order.indexOf(state.cfg.first)));
  else if(last === '人类') startIdx = firstRosterFrom(Math.max(0, order.indexOf(state.cfg.after)));
  else{ const i = order.indexOf(last); startIdx = i < 0 ? firstRosterFrom(0) : firstRosterFrom(i + 1); }
  const gap = Math.max(0, parseFloat(state.cfg.gap) || 0) * 1000;
  state.running = true; state.stop = false; updateRunBtns(); renderChat();
  try{
    for(let i = 0; i < n && !state.stop; i++){
      await speak(roster[(startIdx + i) % N].id);
      if(i < n - 1 && !state.stop) await sleep(gap);
    }
  }catch(e){ toast('对话中断：' + (e.message || e), 'err'); }
  state.running = false; state.stop = false; updateRunBtns(); renderChat();
}
function updateRunBtns(){
  $('#btnStart').disabled = state.running;
  $('#btnStart').textContent = state.running ? (state.unlimited ? '∞ 对话进行中…（点暂停结束）' : '对话进行中…') : '▶ 开始聊天';
  $('#btnPause').disabled = !state.running;
  $('#btnHumanContinue').disabled = state.running;
}
function humanSend(){
  const t = $('#humanInput').value.trim();
  if(!t){ toast('先输入点什么吧', 'err'); return; }
  readCfgForm();
  appendBlock('人类', t);
  $('#humanInput').value = '';
  if(!state.running) startChat(1);   // 「发送」：参与的每个 AI 依次各回复一条（1 轮）后停下，等待人类
}

/* ---- 文件读写 ---- */
function writeTxt(name, content){
  if(state.dir){
    return state.dir.getFileHandle(name, {create: true})
      .then(h => h.createWritable())
      .then(w => w.write(content).then(() => w.close()));
  }
  return Promise.resolve().then(saveStore); // 降级：暂存浏览器
}
function readDirFile(name){
  return state.dir.getFileHandle(name, {create: true}).then(h => h.getFile()).then(f => f.text());
}
function persistMem(ai){ writeTxt(memFileOf(ai.id), state.mem[ai.id] || '').catch(e => toast('写入记忆失败：' + e.message, 'err')); }
function download(name, content){
  const b = new Blob([content], {type: 'text/plain;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function connectDir(){
  if(!window.showDirectoryPicker){
    $('#fsBanner').style.display = 'block';
    toast('当前浏览器不支持文件读写 API，请使用 Chrome / Edge', 'err'); return;
  }
  try{
    const dir = await window.showDirectoryPicker({mode: 'readwrite'});
    clearTimeout(cfgSaveTimer);
    state.dir = dir;
    for(const f of [FILE_LOG, FILE_CFG, ...state.cfg.ais.map(a => memFileOf(a.id))]) await dir.getFileHandle(f, {create: true});
    state.logText = await readDirFile(FILE_LOG);
    for(const a of state.cfg.ais) state.mem[a.id] = await readDirFile(memFileOf(a.id));
    state.cfg.ais.forEach(a => state.memTime[a.id] = nowStr());
    const cfgTxt = await readDirFile(FILE_CFG);                // 配置以 config.txt 为准
    if(cfgTxt.trim()){ applyParsedCfg(parseCfgTxt(cfgTxt)); }
    else{ await writeTxt(FILE_CFG, serializeCfgTxt()); }       // 首次连接：把当前配置落盘
    state.cfg.ais.forEach(a => { if(!(a.id in state.mem)) state.mem[a.id] = ''; });
    $('#statusBox').classList.add('on');
    $('#statusText').textContent = '已连接目录：' + dir.name;
    renderConfig(); renderApiList(); applyCfgToForm(); renderAiList(); updateMemCard(); renderChat();
    toast('目录已连接，各 txt 将实时读写', 'ok');
  }catch(e){
    if(e && e.name === 'AbortError') return; // 用户取消选择
    toast('连接目录失败：' + (e.message || e), 'err');
  }
}

/* ---- 事件绑定 ---- */
$('#btnConnectDir').onclick = connectDir;
$('#btnReloadCfg').onclick = async () => {
  if(!state.dir){ toast('未连接目录：请先「连接目录」才能读取 config.txt', 'err'); return; }
  try{
    const txt = await readDirFile(FILE_CFG);
    if(txt.trim()){
      applyParsedCfg(parseCfgTxt(txt));
      state.cfg.ais.forEach(a => { if(!(a.id in state.mem)) state.mem[a.id] = ''; });
      renderConfig(); renderApiList(); applyCfgToForm(); renderAiList(); updateMemCard(); renderChat();
      toast('已从 config.txt 重载配置', 'ok');
    }else{ await writeTxt(FILE_CFG, serializeCfgTxt()); toast('config.txt 为空，已写入当前配置', 'ok'); }
  }catch(e){ toast('重载失败：' + (e.message || e), 'err'); }
};
$('#btnSaveCfgFile').onclick = async () => {
  readCfgForm();
  if(!state.dir){ toast('未连接目录：配置暂存浏览器，连接目录后自动写入 config.txt', 'err'); return; }
  try{ await writeTxt(FILE_CFG, serializeCfgTxt()); toast('已写入 config.txt', 'ok'); }
  catch(e){ toast('写入失败：' + (e.message || e), 'err'); }
};
$('#btnToggleCfg').onclick = () => {
  const p = $('#cfgPanel'); p.classList.toggle('open');
  $('#btnToggleCfg').textContent = p.classList.contains('open') ? '⚙ 收起配置' : '⚙ 配置';
};
$('#btnStart').onclick = () => startChat();   // 注意：不能直接绑 startChat，否则 click 事件会误当参数
$('#btnPause').onclick = () => { state.stop = true; toast('将在当前发言结束后暂停'); };
$('#btnRaw').onclick = () => openModal('chat_log.txt 原文', state.logText || '（空）');
$('#btnClear').onclick = () => {
  if(!confirm('确定清空聊天记录？该操作会同时清空 chat_log.txt')) return;
  state.logText = ''; persistLog(); renderChat(); toast('聊天记录已清空', 'ok');
};
$('#btnHumanSend').onclick = () => humanSend();
$('#btnHumanContinue').onclick = () => startChat();   // 「继续」：AI 们自行接着聊（不再等人类）
$('#humanInput').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); humanSend(); } });
$('#modalClose').onclick = () => $('#modal').classList.remove('show');
$('#modal').onclick = e => { if(e.target === $('#modal')) $('#modal').classList.remove('show'); };
$('#btnExportAll').onclick = () => {
  readCfgForm();
  download(FILE_LOG, state.logText || '');
  download(FILE_CFG, serializeCfgTxt());
  for(const a of state.cfg.ais) download(memFileOf(a.id), state.mem[a.id] || '');
  toast('已导出全部 txt（浏览器下载目录）', 'ok');
};
$('#btnImport').onclick = () => $('#fileImport').click();
$('#fileImport').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  let n = 0;
  for(const f of files){
    const txt = await f.text();
    if(f.name === FILE_LOG){ state.logText = txt; n++; }
    else if(f.name === FILE_CFG){ applyParsedCfg(parseCfgTxt(txt)); renderConfig(); renderApiList(); applyCfgToForm(); renderAiList(); updateMemCard(); n++; }
    else{ const ai = state.cfg.ais.find(a => memFileOf(a.id) === f.name); if(ai){ state.mem[ai.id] = txt; n++; } }
  }
  saveStore(); renderChat(); renderAiList(); updateMemCard();
  toast('导入完成（' + n + ' 个文件）', 'ok');
});

/* 发言顺序多选下拉：开合 */
$('#orderBox').addEventListener('click', e => {
  if(e.target.closest('.chip')) return;                 // 气泡上的小按钮自己处理
  $('#orderMsel').classList.toggle('open');
});
document.addEventListener('click', e => {
  if(!e.target.closest('#orderMsel')) $('#orderMsel').classList.remove('open');
});

/* 配置卡片：字段编辑（事件委托，动态卡片通用） */
function aiFieldChanged(e){
  const f = e.target.dataset && e.target.dataset.f; if(!f) return;
  const card = e.target.closest('[data-id]'); if(!card) return;
  const ai = getAi(card.dataset.id); if(!ai) return;
  ai[f] = (e.target.type === 'checkbox') ? e.target.checked : e.target.value;
  if(f === 'api'){
    const cc = state.cfg.apis.find(x => x.name === ai.api);
    if(cc && cc.model){
      ai.model = cc.model;                                   // 选择连接时带入其默认模型（之后仍可单独改）
      const mi = card.querySelector('[data-f="model"]'); if(mi) mi.value = cc.model;
    }
    card.querySelectorAll('.connrow').forEach(r => r.style.display = ai.api ? 'none' : '');
  }
  if(f === 'name'){ updateMemCard(); renderOrderSelects(); renderOrderMsel(); }
  persistCfg();
}
$('#aiCards').addEventListener('input', aiFieldChanged);
$('#aiCards').addEventListener('change', aiFieldChanged);

/* 动作按钮（事件委托） */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if(!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if(act === 'addAi') addAi();
  else if(act === 'delAi') delAi(id);
  else if(act === 'saveMem'){
    readGlobal();
    const ai = getAi(state.selAi); if(!ai) return;
    state.mem[ai.id] = $('#memTa').value; state.memTime[ai.id] = nowStr(); persistMem(ai); updateMemCard();
    toast(spName(ai.id) + ' 的记忆已保存', 'ok');
  }
  else if(act === 'updMem'){
    readGlobal();
    const ai = getAi(state.selAi); if(!ai) return;
    if(!effCfg(ai).key){ toast('请先填写 ' + ai.name + ' 的 API Key', 'err'); return; }
    toast(ai.name + ' 正在整理记忆…');
    queueMem(ai.id);
  }
  else if(act === 'expMem'){ const ai = getAi(state.selAi); if(ai) download(memFileOf(ai.id), state.mem[ai.id] || ''); }
  else if(act === 'addApiConn') addApiConn();
  else if(act === 'delApiConn') delApiConn(id);
  else if(act === 'optPersona') optimizePersona(id);
});

/* 全局配置输入自动保存 */
const cfgWrap = $('#cfgWrap');
['input', 'change'].forEach(ev => cfgWrap.addEventListener(ev, readCfgForm));

/* API 连接列表：字段编辑 */
function apiFieldChanged(e){
  const k = e.target.dataset && e.target.dataset.k; if(!k) return;
  const row = e.target.closest('[data-api]'); if(!row) return;
  const c = state.cfg.apis.find(x => x.name === row.dataset.api); if(!c) return;
  const oldName = c.name;
  c[k] = e.target.value;
  if(k === 'name' && oldName !== c.name){
    row.dataset.api = c.name;                                              // 同步行标识，后续编辑才找得到
    const del = row.querySelector('[data-act="delApiConn"]'); if(del) del.dataset.id = c.name;
    state.cfg.ais.forEach(a => { if(a.api === oldName) a.api = c.name; }); // 同步引用它的 AI
    renderOrderSelects(); renderOrderMsel();                               // 顺序下拉/气泡里若有引用名则刷新
    renderConfig();                                                        // 刷新 AI 卡片下拉选项（不重建连接列表，避免打断输入）
  }
  persistCfg();
}
$('#apiList').addEventListener('input', apiFieldChanged);
$('#apiList').addEventListener('change', apiFieldChanged);
$('#btnAddAiList').onclick = () => addAi();

/* ---- 初始化 ---- */
(function init(){
  loadCfg(); applyCfgToForm();
  if(!state.cfg.ais.some(a => a.id === state.selAi)) state.selAi = state.cfg.ais[0].id;
  if(!state.dir){
    const st = loadStore();
    if(st){
      state.logText = st.log || '';
      if(st.mem){ state.mem = st.mem; }
      else if(st.memA !== undefined){ state.mem = {AI1: st.memA || '', AI2: st.memB || ''}; }  // 旧版迁移
    }
  }
  state.cfg.ais.forEach(a => { if(!(a.id in state.mem)) state.mem[a.id] = ''; });
  renderConfig(); renderApiList(); renderAiList(); updateMemCard(); renderChat(); updateRunBtns();
  if(!window.showDirectoryPicker) $('#fsBanner').style.display = 'block';
})();
