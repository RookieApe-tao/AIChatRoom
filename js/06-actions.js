/* 06-actions.js —— 发言、记忆整理、人设优化、AI 增删 */
"use strict";

async function speak(id){
  const el = setThinking(id, true);
  try{
    const {content, reasoning} = await callLLM(effCfg(getAi(id)), buildMessages(id), undefined, (text) => {
      if(!el || !text) return;                              // 只有思考增量的阶段保持「正在思考」动画
      const txt = el.querySelector('.txt'); if(!txt) return;
      if(el.classList.contains('think')){                   // 首个内容片段：把思考气泡变成直播气泡
        el.classList.remove('think');
        const who = el.querySelector('.who'); if(who) who.textContent = spName(id) + ' 正在回复…';
        txt.innerHTML = '';
      }
      txt.textContent = text; scrollBottom();               // text 为累计内容，直接整段刷新
    });
    appendBlock(id, sanitize(id, content), (getAi(id).think !== false) ? reasoning : null);
    if(getAi(id).mem) queueMem(id);
  }finally{ if(el) el.remove(); }
}

function queueMem(id){
  state.memChain[id] = Promise.resolve(state.memChain[id])
    .then(() => updateMemory(id))
    .catch(e => toast(spName(id) + ' 的记忆更新失败：' + (e.message || e), 'err'));
}

async function updateMemory(id){
  const c = getAi(id);
  const logView = parseChat(state.logText).map(m => '【' + spName(m.sp) + '】 ' + m.text).join('\n\n') || '（还没有对话）';
  const sys = '你是「' + c.name + '」。下面是你的长期记忆文件的当前内容，以及目前为止的完整聊天记录。\n'
    + '请把值得长期记住的信息（其他角色的设定与偏好、关键事实、达成共识、有趣观点、待办、你的立场变化等）整理进记忆，删除过时无用的内容。\n'
    + '直接输出更新后的完整记忆文本（纯文本，可分条），不要任何解释、不要代码块标记；若无需改动，也原样输出全部内容。\n\n'
    + '# 当前记忆\n' + ((state.mem[id] || '').trim() || '（空）') + '\n\n# 聊天记录\n' + logView;
  const {content} = await callLLM(effCfg(c), [{role: 'system', content: sys}, {role: 'user', content: '请输出更新后的完整记忆文件内容。'}], 0.3);
  const txt = stripFences(content || '').trim();
  if(txt){
    state.mem[id] = txt; state.memTime[id] = nowStr();
    persistMem(c); updateMemCard();
  }
}

/* ---- AI 数量扩展 ---- */
function addAi(){
  if(state.cfg.ais.length >= MAX_AI){ toast('最多支持 ' + MAX_AI + ' 个 AI', 'err'); return; }
  let n = state.cfg.ais.length + 1;
  while(getAi('AI' + n)) n++;
  const id = 'AI' + n;
  state.cfg.ais.push({id, name:'AI-' + n, base:'https://api.deepseek.com', key:'', model:'deepseek-chat', temp:0.8, mem:true, think:true, persona:''});
  state.mem[id] = ''; state.memTime[id] = '未更新';
  if(!state.cfg.order.includes(id)) state.cfg.order.push(id);
  state.selAi = id;
  persistCfg(); renderConfig(); renderAiList(); updateMemCard();
  toast('已添加 ' + spName(id) + '，记得填写 API Key 和人设', 'ok');
}
function delAi(id){
  if(state.cfg.ais.length <= 1){ toast('至少保留一个 AI', 'err'); return; }
  const ai = getAi(id); if(!ai) return;
  if(!confirm('删除「' + ai.name + '」？其记忆文件 ' + memFileOf(id) + ' 会保留在磁盘上。')) return;
  state.cfg.ais = state.cfg.ais.filter(a => a.id !== id);
  state.cfg.order = state.cfg.order.filter(x => x !== id);
  if(!state.cfg.order.length) state.cfg.order = state.cfg.ais.map(a => a.id);
  if(state.cfg.first === id) state.cfg.first = state.cfg.order[0];
  if(state.cfg.after === id) state.cfg.after = state.cfg.order[0];
  if(state.selAi === id) state.selAi = state.cfg.ais[0].id;
  persistCfg(); renderConfig(); renderAiList(); updateMemCard(); renderChat();
  toast('已删除 ' + ai.name, 'ok');
}

/* ---- 人设 AI 优化 ---- */
async function optimizePersona(id){
  readCfgForm();
  const c = getAi(id); if(!c) return;
  if(!effCfg(c).key){ toast('请先填写 ' + c.name + ' 的 API Key', 'err'); return; }
  const btn = document.querySelector('[data-act="optPersona"][data-id="' + id + '"]');
  const ta = document.querySelector('#aiCards [data-id="' + id + '"] [data-f="persona"]');
  const cur = ta.value.trim();
  if(cur && !confirm('将用 AI 优化后的人设替换当前人设（原内容会被覆盖），继续？')) return;
  btn.disabled = true; const oldTxt = btn.textContent; btn.textContent = '✨ 优化中…';
  try{
    const sys = '你是一位资深提示词工程师。请把下面这个AI角色的人设优化成一段更丰满、更能指导对话风格的人设提示词（system prompt）。要求：\n'
      + '- 保留原有角色的核心设定与性格方向' + (cur ? '' : '，并为它设计一个鲜明、有记忆点的性格') + '；\n'
      + '- 明确说话风格、语气、常用句式或口头禅、行为边界；\n'
      + '- 100~250字，纯文本段落，直接输出人设正文；\n'
      + '- 不要解释、不要标题、不要代码块、不要用引号包裹。';
    const usr = cur ? ('角色名：' + c.name + '\n当前人设：\n' + cur) : ('角色名：' + c.name + '。请从零设计一段有个性的人设。');
    const {content} = await callLLM(effCfg(c), [{role: 'system', content: sys}, {role: 'user', content: usr}], 0.7);
    ta.value = stripFences(content);
    ta.dispatchEvent(new Event('input', {bubbles: true}));   // 触发保存
    toast(c.name + ' 的人设已优化并保存', 'ok');
  }catch(e){ toast('人设优化失败：' + (e.message || e), 'err'); }
  finally{ btn.disabled = false; btn.textContent = oldTxt; }
}

/* ---- API 连接增删 ---- */
function addApiConn(){
  state.cfg.apis.push({name: '连接' + (state.cfg.apis.length + 1), base: 'https://api.deepseek.com', key: '', model: ''});
  persistCfg(); renderApiList(); renderConfig();
  toast('已添加连接，填好地址 / Key / 默认模型后在 AI 卡片下拉中选择', 'ok');
}
function delApiConn(name){
  state.cfg.apis = state.cfg.apis.filter(c => c.name !== name);
  state.cfg.ais.forEach(a => { if(a.api === name) a.api = ''; });   // 引用该连接的 AI 回退独立配置
  persistCfg(); renderApiList(); renderConfig();
  toast('已删除连接 ' + name + '，引用它的 AI 已回退为独立配置', 'ok');
}
