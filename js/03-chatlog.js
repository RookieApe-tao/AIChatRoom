/* 03-chatlog.js —— 聊天记录解析 / 序列化 / 发言顺序预测 */
"use strict";

/* 解析 chat_log.txt：### [AI1|AI2|...|人类] 时间 分段（兼容旧 [A]/[B] 标记） */
function parseChat(text){
  const out = []; if(!text) return out;
  const head = /^### \[(.+?)\] (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*$/;
  let cur = null;
  for(const ln of text.split(/\r?\n/)){
    const m = ln.match(head);
    if(m){ if(cur) out.push(cur); cur = {sp: legacyId(m[1]), time: m[2], lines: []}; }
    else if(cur) cur.lines.push(ln);
  }
  if(cur) out.push(cur);
  return out.map(b => ({sp: b.sp, time: b.time, text: b.lines.join('\n').trim()})).filter(b => b.text);
}

function appendBlock(sp, text, reasoning){
  text = String(text).trim(); if(!text) return;
  const time = nowStr();
  const block = '### [' + sp + '] ' + time + '\n' + text + '\n';
  state.logText = state.logText ? state.logText.replace(/\s+$/, '') + '\n\n' + block : block;
  if(reasoning && String(reasoning).trim()) state.thinkMap[sp + '|' + time] = String(reasoning).trim();  // 思考过程仅用于展示
  persistLog(); renderChat();
}

function lastSpeaker(){
  const arr = parseChat(state.logText);
  return arr.length ? arr[arr.length - 1].sp : null;
}

/* 预测下一位发言者（用于界面提示；与 startChat 一致：跳过未填 Key 的 AI） */
function nextInOrder(){
  const order = speakOrder(); if(!order.length) return null;
  const can = id => { const a = getAi(id); return a && effCfg(a).key; };
  const n = order.length;
  const from = id => { const i = order.indexOf(id); return i < 0 ? 0 : i; };
  const last = lastSpeaker();
  let k;
  if(!last) k = from(order.includes(state.cfg.first) ? state.cfg.first : order[0]);
  else if(last === '人类') k = from(order.includes(state.cfg.after) ? state.cfg.after : order[0]);
  else k = from(last) + (order.includes(last) ? 1 : 0);
  for(let j = 0; j < n; j++){ const c = order[(k + j) % n]; if(can(c)) return c; }
  return null;
}

function persistLog(){ writeTxt(FILE_LOG, state.logText).catch(e => toast('写入聊天记录失败：' + e.message, 'err')); }
