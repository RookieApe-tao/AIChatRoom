/* 05-render.js —— 所有界面渲染 */
"use strict";

function renderChips(){
  $('#fileChips').innerHTML = '<code>' + state.cfg.ais.map(a => memFileOf(a.id)).join('</code><code>') + '</code><code>' + FILE_LOG + '</code><code>' + FILE_CFG + '</code>';
}

/* ---- 聊天区 ---- */
function renderChat(){
  const arr = parseChat(state.logText);
  const list = $('#chatList'); list.innerHTML = '';
  for(const m of arr){
    const div = document.createElement('div'); div.className = 'msg ' + (m.sp === '人类' ? 'h' : 'ai');
    if(m.sp !== '人类'){
      div.style.setProperty('--c', aiColor(m.sp));
      if(state.cfg.ais.length > 2) div.classList.toggle('rev', state.cfg.ais.findIndex(a => a.id === m.sp) % 2 === 1);
    }
    const bub = document.createElement('div'); bub.className = 'bubble';
    const who = document.createElement('div'); who.className = 'who'; who.textContent = spName(m.sp) + ' · ' + m.time;
    const rs = state.thinkMap[m.sp + '|' + m.time];
    if(rs){
      const d = document.createElement('details'); d.className = 'think-box';
      const sm = document.createElement('summary'); sm.textContent = '💭 思考过程';
      const tw = document.createElement('div'); tw.className = 'think-txt'; tw.textContent = rs;
      d.appendChild(sm); d.appendChild(tw); bub.appendChild(d);
    }
    const txt = document.createElement('div'); txt.className = 'txt'; txt.textContent = m.text;
    bub.appendChild(who); bub.appendChild(txt); div.appendChild(bub); list.appendChild(div);
  }
  $('#turnCount').textContent = arr.length;
  $('#emptyTip').style.display = arr.length ? 'none' : 'block';
  const nx = nextInOrder();
  $('#nextHint').textContent = state.running ? '对话进行中…' : '已停·等你发言或点「继续」｜下一位：' + (nx ? spName(nx) : '—');
  scrollBottom();
}
function scrollBottom(){ const s = $('#chatScroll'); s.scrollTop = s.scrollHeight; }

function setThinking(id, on){
  const list = $('#chatList');
  let el = document.getElementById('thinking_' + id);
  if(on){
    if(el) return el;
    el = document.createElement('div'); el.id = 'thinking_' + id; el.className = 'msg ai think';
    el.style.setProperty('--c', aiColor(id));
    const bub = document.createElement('div'); bub.className = 'bubble';
    const who = document.createElement('div'); who.className = 'who'; who.textContent = spName(id) + ' 正在思考…';
    const txt = document.createElement('div'); txt.className = 'txt';
    txt.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    bub.appendChild(who); bub.appendChild(txt); el.appendChild(bub); list.appendChild(el); scrollBottom();
    return el;
  }
  if(el) el.remove(); return null;
}

/* ---- 左：AI 列表 ---- */
function renderAiList(){
  const list = $('#aiList'); if(!list) return; list.innerHTML = '';
  const order = speakOrder();
  state.cfg.ais.forEach(ai => {
    const item = document.createElement('div');
    item.className = 'ai-item' + (ai.id === state.selAi ? ' sel' : '');
    item.style.setProperty('--c', aiColor(ai.id));
    const dot = document.createElement('span'); dot.className = 'cdot'; dot.style.background = aiColor(ai.id);
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = ai.name;
    const ord = document.createElement('span'); ord.className = 'ord';
    const oi = order.indexOf(ai.id);
    ord.textContent = oi >= 0 ? '第' + (oi + 1) + '位' : '不参与';
    const aid = document.createElement('span'); aid.className = 'aid'; aid.textContent = ai.id;
    item.appendChild(dot); item.appendChild(nm); item.appendChild(ord); item.appendChild(aid);
    item.onclick = () => { state.selAi = ai.id; renderAiList(); updateMemCard(); };
    list.appendChild(item);
  });
}
function updateMemCard(){
  const id = state.selAi, ai = getAi(id);
  $('#memDot').style.background = ai ? aiColor(id) : '#98a1ad';
  $('#memName').textContent = ai ? (ai.name + ' 的记忆') : '记忆';
  $('#memTime').textContent = state.memTime[id] || '未更新';
  $('#memTa').value = state.mem[id] || '';
}

/* ---- 右：选中 AI 的记忆 ---- */

/* ---- 配置卡片 ---- */
function aiCardHtml(ai){
  const c = aiColor(ai.id);
  return `<div class="card" data-id="${ai.id}">
    <h3><span class="dot" style="background:${c}"></span>
      <input class="layui-input ai-name" data-f="name" value="${escH(ai.name)}" style="flex:1;height:28px;font-weight:600">
      <span class="layui layui-badge layui-bg-gray" style="flex:none" title="AI 编号，用于「发言顺序」配置">${ai.id}</span>
      <button class="layui layui-btn layui-btn-xs layui-btn-primary" data-act="delAi" data-id="${ai.id}" title="删除该 AI">✕</button>
    </h3>
    <div class="swtrow">
      <label class="swt" title="发言后自动让 AI 整理更新记忆文件"><input type="checkbox" data-f="mem" ${ai.mem ? 'checked' : ''}><i></i></label><span class="swt-label">自动记忆</span>
      <label class="swt" title="在聊天气泡中展开查看该 AI 的思考过程"><input type="checkbox" data-f="think" ${ai.think !== false ? 'checked' : ''}><i></i></label><span class="swt-label">思考</span>
    </div>
    <div class="row"><label>API 连接</label><select class="layui-input" data-f="api" style="flex:1">
      <option value="">独立配置（使用下方地址 / Key / 模型）</option>
      ${state.cfg.apis.map(cc => `<option value="${escH(cc.name)}" ${ai.api === cc.name ? 'selected' : ''}>${escH(cc.name)}（${escH(cc.base.replace(/^https?:\/\//, ''))}${cc.model ? ' · ' + escH(cc.model) : ''}）</option>`).join('')}
    </select></div>
    <div class="row connrow" style="${ai.api ? 'display:none' : ''}"><label>API 地址</label><input class="layui-input" data-f="base" value="${escH(ai.base)}"></div>
    <div class="hint connrow" style="${ai.api ? 'display:none' : ''}">OpenAI 规范兼容。DeepSeek https://api.deepseek.com ｜ GLM https://open.bigmodel.cn/api/coding/paas/v4 ｜ MiMo https://api.xiaomimimo.com/v1 ｜ Kimi https://api.moonshot.cn/v1</div>
    <div class="row connrow" style="${ai.api ? 'display:none' : ''}"><label>API Key</label><input class="layui-input" data-f="key" type="password" value="${escH(ai.key)}" autocomplete="off"></div>
    <div class="row"><label>模型</label><input class="layui-input" data-f="model" value="${escH(ai.model)}"></div>
    <div class="row"><label>温度</label><input class="layui-input" data-f="temp" type="number" min="0" max="2" step="0.1" value="${escH(ai.temp)}"></div>
    <div class="row" style="align-items:flex-start"><label>人设</label><div style="flex:1;min-width:0">
      <textarea class="layui-textarea" data-f="persona" rows="3">${escH(ai.persona)}</textarea>
      <button class="layui layui-btn layui-btn-sm layui-btn-primary" style="margin-top:6px" data-act="optPersona" data-id="${ai.id}">✨ AI优化人设</button>
    </div></div>
  </div>`;
}
function renderConfig(){
  $('#aiCards').innerHTML = state.cfg.ais.map(aiCardHtml).join('')
    + '<div class="card add-card"><button class="layui layui-btn layui-btn-sm layui-btn-normal" data-act="addAi">➕ 添加 AI</button>'
    + '<span class="hint" style="margin:0 0 0 10px">新 AI 默认用 DeepSeek 接口，添加后自行修改地址 / Key / 模型 / 人设</span></div>';
  renderOrderSelects(); renderOrderMsel();
}

/* ---- API 连接列表 ---- */
function renderApiList(){
  const list = $('#apiList'); if(!list) return;
  if(!state.cfg.apis.length){
    list.innerHTML = '<div class="hint" style="margin:0">还没有连接：点上方「➕ 添加连接」创建（名称可自取，如 GLM），然后在各 AI 卡片的「API 连接」下拉里选择复用。</div>';
    return;
  }
  list.innerHTML = state.cfg.apis.map(c => `<div class="api-row" data-api="${escH(c.name)}">
    <input class="layui-input" data-k="name" value="${escH(c.name)}" placeholder="名称">
    <input class="layui-input" data-k="base" value="${escH(c.base)}" placeholder="API 地址">
    <input class="layui-input" data-k="key" type="password" value="${escH(c.key)}" placeholder="Key" autocomplete="off">
    <input class="layui-input" data-k="model" value="${escH(c.model || '')}" placeholder="默认模型">
    <button class="layui layui-btn layui-btn-sm layui-btn-primary" data-act="delApiConn" data-id="${escH(c.name)}" title="删除该连接">✕</button>
  </div>`).join('');
}

/* ---- 发言顺序：多选下拉 ---- */
function renderOrderSelects(){
  const order = speakOrder();
  const opts = order.map(id => `<option value="${id}">${escH(spName(id))}</option>`).join('');
  $('#f_first').innerHTML = opts; $('#f_after').innerHTML = opts;
  if(!order.includes(state.cfg.first)) state.cfg.first = order[0];
  if(!order.includes(state.cfg.after)) state.cfg.after = order[0];
  $('#f_first').value = state.cfg.first; $('#f_after').value = state.cfg.after;
}
function renderOrderMsel(){
  const chips = $('#orderChips'); if(!chips) return; chips.innerHTML = '';
  if(!state.cfg.order.length){
    const p = document.createElement('span'); p.className = 'msel-empty'; p.textContent = '留空 = 全部 AI 参与按配置顺序'; chips.appendChild(p);
  }
  state.cfg.order.forEach((id, i) => {
    const ai = getAi(id); if(!ai) return;
    const s = document.createElement('span'); s.className = 'chip'; s.style.setProperty('--c', aiColor(id));
    const b = document.createElement('b'); b.textContent = (i + 1) + '. ';
    const nm = document.createElement('span'); nm.textContent = ai.name;
    const up = document.createElement('span'); up.className = 'mv'; up.textContent = '▲'; up.title = '上移'; up.onclick = e => { e.stopPropagation(); moveOrder(id, -1); };
    const dn = document.createElement('span'); dn.className = 'mv'; dn.textContent = '▼'; dn.title = '下移'; dn.onclick = e => { e.stopPropagation(); moveOrder(id, 1); };
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.title = '移出'; x.onclick = e => { e.stopPropagation(); toggleOrder(id, false); };
    s.appendChild(b); s.appendChild(nm); s.appendChild(up); s.appendChild(dn); s.appendChild(x);
    chips.appendChild(s);
  });
  const pop = $('#orderPop'); if(!pop) return; pop.innerHTML = '';
  const tools = document.createElement('div'); tools.className = 'msel-tools';
  const all = document.createElement('a'); all.textContent = '全选';
  all.onclick = e => { e.stopPropagation(); state.cfg.order = state.cfg.ais.map(x => x.id); persistCfg(); renderOrderMsel(); renderOrderSelects(); };
  const none = document.createElement('a'); none.textContent = '清空';
  none.onclick = e => { e.stopPropagation(); state.cfg.order = []; persistCfg(); renderOrderMsel(); renderOrderSelects(); };
  tools.appendChild(all); tools.appendChild(none); pop.appendChild(tools);
  state.cfg.ais.forEach(ai => {
    const item = document.createElement('label'); item.className = 'msel-item';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = state.cfg.order.includes(ai.id);
    cb.onchange = ev => { ev.stopPropagation(); toggleOrder(ai.id, ev.target.checked); };
    const dot = document.createElement('span'); dot.className = 'cdot'; dot.style.background = aiColor(ai.id);
    const nm = document.createElement('span'); nm.textContent = ai.name;
    const aid = document.createElement('span'); aid.className = 'aid'; aid.textContent = ai.id;
    item.appendChild(cb); item.appendChild(dot); item.appendChild(nm); item.appendChild(aid);
    pop.appendChild(item);
  });
}
function toggleOrder(id, on){
  state.cfg.order = state.cfg.order.filter(x => x !== id);
  if(on) state.cfg.order.push(id);
  persistCfg(); renderOrderMsel(); renderOrderSelects();
}
function moveOrder(id, d){
  const i = state.cfg.order.indexOf(id), j = i + d;
  if(i < 0 || j < 0 || j >= state.cfg.order.length) return;
  [state.cfg.order[i], state.cfg.order[j]] = [state.cfg.order[j], state.cfg.order[i]];
  persistCfg(); renderOrderMsel();
}

/* ---- 弹窗 ---- */
function openModal(title, text){ $('#modalTitle').textContent = title; $('#modalPre').textContent = text; $('#modal').classList.add('show'); }
