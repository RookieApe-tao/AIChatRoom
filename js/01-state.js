/* 01-state.js —— 常量、全局状态、通用工具 */
"use strict";
const $ = s => document.querySelector(s);
const FILE_LOG = 'chat_log.txt', FILE_CFG = 'config.txt';
const LS_CFG = 'dualai_cfg_v5', LS_CFG_OLD = 'dualai_cfg_v4', LS_STORE = 'dualai_store_v2';
const PALETTE = ['#2b7fff','#8e4ef0','#16baaa','#e6a23c','#e0567c','#10b981','#6366f1','#d46b08'];
const MAX_AI = 8;
const memFileOf = id => 'memory_ai' + id.replace(/^AI/, '') + '.txt';
const escH = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* 内置默认对话规则（「对话规则」留空时使用） */
const DEFAULT_RULES = '- 你正在与另外的 AI 进行多轮对话，期间可能有人类插话（以【人类插话】开头）。\n- 直接输出你要说的话本身：不要输出自己的名字、时间、编号或任何前缀。\n- 每次发言保持简短自然（通常 1~4 句话）：回应他人观点、补充或提出新想法。\n- 长期记忆仅供你参考，不要在对话中复述记忆本身。';

const DEF_CFG = {
  ais: [
    {id:'AI1', name:'智谱GLM', base:'https://open.bigmodel.cn/api/coding/paas/v4', key:'your-zhipu-api-key-here', model:'glm-5.3-flash', temp:0.8, mem:true, think:true,
     persona:'你是「智谱GLM」，一个好奇心旺盛、想象力丰富的畅想家。你喜欢提出有趣的观点和大胆的脑洞，说话热情、简洁，偶尔幽默。'},
    {id:'AI2', name:'小米MiMo', base:'https://api.xiaomimimo.com/v1', key:'sk-your-api-key-here', model:'mimo-v2.5', temp:0.8, mem:true, think:true,
     persona:'你是「小米MiMo」，一个理性严谨的批判性思考者。你善于质疑、补充和收敛话题，说话冷静、有条理、简洁。'}
  ],
  topic:'', rules:DEFAULT_RULES, hist:0, stream:false, rounds:6, gap:1, after:'AI1', first:'AI1', order:[], apis:[]
};
const state = {
  cfg: JSON.parse(JSON.stringify(DEF_CFG)),
  dir: null,                        // 已授权的目录句柄
  logText: '', mem: {}, memTime: {},// 聊天记录镜像 + 各 AI 记忆镜像（按 id）
  thinkMap: {},                     // 思考过程（仅展示，不写入文件）
  running: false, stop: false, unlimited: false,
  selAi: 'AI1',                     // 左侧列表当前选中的 AI
  memChain: {}
};

/* ---- 通用工具 ---- */
function nowStr(){
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const escReg = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const getAi = id => state.cfg.ais.find(a => a.id === id);
const aiColor = id => { const i = state.cfg.ais.findIndex(a => a.id === id); return i < 0 ? '#98a1ad' : PALETTE[i % PALETTE.length]; };
const legacyId = t => t === 'A' ? 'AI1' : (t === 'B' ? 'AI2' : t);   // 兼容旧日志/旧配置
function spName(sp){
  if(sp === '人类') return '人类';
  const a = getAi(sp); return a ? a.name : sp;
}
function saveStore(){ try{ localStorage.setItem(LS_STORE, JSON.stringify({log: state.logText, mem: state.mem})); }catch(e){} }
function loadStore(){ try{ return JSON.parse(localStorage.getItem(LS_STORE)); }catch(e){ return null; } }

let toastBox = null;
function toast(msg, type){
  if(!toastBox){ toastBox = document.createElement('div'); toastBox.id = 'toastBox'; document.body.appendChild(toastBox); }
  const d = document.createElement('div'); d.className = 'toast ' + (type || ''); d.textContent = msg; toastBox.appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 350); }, 2600);
}
