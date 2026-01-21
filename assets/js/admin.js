const $ = (id) => document.getElementById(id);

const HISTORY_KEY = "shadow_admin_issue_history_v1";
const HISTORY_LIMIT = 200;

function setStatus(text) {
  const el = $("status");
  const mel = $("m_status");
  if (el) el.textContent = text;
  if (mel) mel.textContent = text;
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("复制失败：浏览器不支持剪贴板写入");
}

function nowText() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** ================== 状态机（严格门控） ==================
 * step 0: 初始（未确认管理员密码）
 * step 1: 管理员密码已确认（可刷新/可选择）
 * step 2: 已选择表单（可锁定）
 * step 3: 已锁定表单（可生成）
 * step 4: 已生成（可复制）
 */
let step = 0;
let lockedPack = null;   // { display_name, form_key, form_version }
let packsCache = [];     // 最近一次拉到的 active packs

// 统一读写：桌面控件 vs 手机控件
function valKey() { return ($("key")?.value ?? $("m_key")?.value ?? "").trim(); }
function setKey(v){ if ($("key")) $("key").value=v; if ($("m_key")) $("m_key").value=v; }

function valBase(){ return ($("base")?.value ?? "").trim(); }

function valEnterUrl(){ return ($("enterUrl")?.value ?? $("m_enterUrl")?.value ?? "").trim(); }
function setEnterUrl(v){ if ($("enterUrl")) $("enterUrl").value=v; if ($("m_enterUrl")) $("m_enterUrl").value=v; }

function valMsgTpl(){ return ($("msgTpl")?.value ?? $("m_msgTpl")?.value ?? ""); }
function setMsgTpl(v){ if ($("msgTpl")) $("msgTpl").value=v; if ($("m_msgTpl")) $("m_msgTpl").value=v; }

function setFormName(v){ if ($("formName")) $("formName").value=v; if ($("m_formName")) $("m_formName").value=v; }
function setFormVersion(v){ if ($("formVersion")) $("formVersion").value=v; if ($("m_formVersion")) $("m_formVersion").value=v; }

function setTokenOut(v){ if ($("tokenOutInput")) $("tokenOutInput").value=v; if ($("m_tokenOutInput")) $("m_tokenOutInput").value=v; }
function setMsgOut(v){ if ($("msgOut")) $("msgOut").value=v; if ($("m_msgOut")) $("m_msgOut").value=v; }

function deskSel(){ return $("packSelect"); }
function mobSel(){ return $("m_packSelect"); }

function disable(id, b){ const el=$(id); if (el) el.disabled=b; }
function applyGate() {
  // step 0
  disable("reloadPacks", !(step >= 1));
  disable("packSelect", !(step >= 1));
  disable("m_reloadPacks", !(step >= 1));
  disable("m_packSelect", !(step >= 1));

  // 锁定按钮：必须选到一个 pack（step>=2）
  disable("lockPack", !(step >= 2));
  disable("m_lockPack", !(step >= 2));

  // 生成按钮：必须锁定（step>=3）
  disable("go", !(step >= 3));
  disable("m_go", !(step >= 3));

  // 复制按钮：必须生成成功（step>=4）
  disable("copyToken", !(step >= 4));
  disable("copyMsg", !(step >= 4));
  disable("m_copyToken", !(step >= 4));
  disable("m_copyMsg", !(step >= 4));

  // 选择/刷新在锁定后不可操作
  if (step >= 3) {
    disable("reloadPacks", true);
    disable("packSelect", true);
    disable("m_reloadPacks", true);
    disable("m_packSelect", true);
  }
}

function setPackSelectPlaceholder(text){
  const ds = deskSel();
  const ms = mobSel();
  if (ds){
    ds.innerHTML="";
    const opt=document.createElement("option");
    opt.value="";
    opt.textContent=text;
    ds.appendChild(opt);
  }
  if (ms){
    ms.innerHTML="";
    const opt=document.createElement("option");
    opt.value="";
    opt.textContent=text;
    ms.appendChild(opt);
  }
}

function syncSelectValue(idxStr){
  const ds = deskSel();
  const ms = mobSel();
  if (ds) ds.value = idxStr;
  if (ms) ms.value = idxStr;
}

function resetAfterKeyConfirm() {
  lockedPack = null;
  step = 1;

  setTokenOut("");
  setMsgOut("");
  setFormName("");
  setFormVersion("");

  setPackSelectPlaceholder("确认管理员密码后刷新列表");
  packsCache = [];

  applyGate();
}

/** ========== packs (KV: /api/admin/packs) ========== **/
function isActivePack(p) {
  if (!p || typeof p !== "object") return false;
  if (p.active === true) return true;
  if (typeof p.status === "string" && p.status.toLowerCase() === "active") return true;
  return false;
}
function getPackFormKey(p) { return p.form_key || p.formKey || p.key || ""; }
function getPackFormVersion(p) { return p.form_version || p.formVersion || p.version || ""; }
function getPackDisplayName(p) { return (p.display_name || p.displayName || "").toString().trim(); }

async function fetchPacks() {
  const base = valBase();
  const adminKey = valKey();
  if (!adminKey) throw new Error("管理员密码不能为空");

  const res = await fetch(`${base}/api/admin/packs`, {
    method: "GET",
    headers: { "X-ADMIN-KEY": adminKey }
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);

  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("表单列表返回不是 JSON：\n" + text); }

  const packs = Array.isArray(data) ? data : (data.packs || data.data || []);
  if (!Array.isArray(packs)) throw new Error("表单列表格式不正确：\n" + text);

  return packs.filter(isActivePack);
}

function renderPacks(packs) {
  packsCache = packs;

  const ds = deskSel();
  const ms = mobSel();

  const fill = (sel) => {
    if (!sel) return;
    sel.innerHTML = "";
    if (!packs.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "（没有可用的 active 表单）";
      sel.appendChild(opt);
      return;
    }
    packs.forEach((p, idx) => {
      const display = getPackDisplayName(p) || `${getPackFormKey(p)}:${getPackFormVersion(p)}`;
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = display;
      sel.appendChild(opt);
    });
  };

  fill(ds);
  fill(ms);

  if (packs.length) {
    syncSelectValue("0");
    applySelectedPack();
  } else {
    setFormName("");
    setFormVersion("");
    step = Math.max(step, 1);
    applyGate();
  }
}

function selectedPackIndex(){
  const ds = deskSel();
  const ms = mobSel();
  const v = (ds && ds.value !== "") ? ds.value : (ms ? ms.value : "");
  return Number(v);
}

function applySelectedPack() {
  if (step < 1) return;

  const idx = selectedPackIndex();
  const p = packsCache[idx];

  if (!p) {
    setFormName("");
    setFormVersion("");
    step = 1;
    applyGate();
    return;
  }

  setFormName(getPackDisplayName(p) || "");
  setFormVersion(getPackFormVersion(p) || "");

  step = 2;
  applyGate();
}

/** ========== lock pack ========== **/
function lockCurrentPack() {
  if (step < 2) throw new Error("请先选择表单");

  const idx = selectedPackIndex();
  const p = packsCache[idx];
  if (!p) throw new Error("请选择有效的表单");

  const display_name = getPackDisplayName(p) || "未命名表单";
  const form_key = getPackFormKey(p);
  const form_version = getPackFormVersion(p);

  if (!form_key || !form_version) throw new Error("表单缺少 form_key 或 form_version");

  lockedPack = { display_name, form_key, form_version };
  step = 3;
  applyGate();

  setStatus(`已锁定表单：${display_name}（${form_key}:${form_version}）`);
}

/** ========== token ========== **/
async function requestToken() {
  const base = valBase();
  const adminKey = valKey();

  if (!adminKey) throw new Error("管理员密码不能为空");
  if (step < 3 || !lockedPack) throw new Error("请先锁定表单");

  const res = await fetch(`${base}/api/admin/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ADMIN-KEY": adminKey
    },
    body: JSON.stringify({
      form_key: lockedPack.form_key,
      form_version: lockedPack.form_version
    })
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);

  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("生成接口返回不是 JSON：\n" + text); }

  if (!data.token) throw new Error("服务端返回缺少 token 字段");
  return data.token;
}

/** ========== message ========== **/
function buildMessage(link, token) {
  const tpl = (valMsgTpl() || "").trim() ||
`你好，这里是你的入口与验证码：

入口链接：
{link}

验证码：
{token}

打开链接后输入验证码即可进入。`;

  return tpl
    .replaceAll("{link}", link.trim())
    .replaceAll("{token}", token.trim());
}

/** ========== history (localStorage) ========== **/
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveHistory(list) {
  const trimmed = list.slice(0, HISTORY_LIMIT);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}
function addHistoryItem(item) {
  const list = loadHistory();
  list.unshift(item);
  saveHistory(list);
  renderHistory();
}
function exportHistoryText() {
  const list = loadHistory();
  if (!list.length) return "暂无记录";
  return list.map(it =>
`[${it.issued_at}] ${it.display_name} (${it.form_version})
token: ${it.token}
`).join("\n");
}

function renderHistory() {
  const tbody = $("historyBody");
  if (!tbody) return;

  const list = loadHistory();
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">暂无记录</td></tr>`;
    return;
  }

  const esc = (s) => (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  tbody.innerHTML = list.map((it, idx) => `
    <tr>
      <td class="tokenCell">${esc(it.token)}</td>
      <td>${esc(it.issued_at)}</td>
      <td>${esc(it.display_name)}</td>
      <td>${esc(it.form_version)}</td>
      <td class="t-right">
        <button class="btn btn--ghost" data-copy="${idx}" type="button">复制</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("button[data-copy]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.getAttribute("data-copy"));
      const item = loadHistory()[idx];
      if (!item) return;
      try {
        await copyToClipboard(item.token);
        setStatus("已复制该条记录的验证码");
      } catch (e) {
        setStatus("复制失败：" + e.message);
      }
    });
  });
}

/** ========== init ========== **/
function bindToggleKey(btnId, inputId){
  const btn = $(btnId);
  const input = $(inputId);
  if (!btn || !input) return;
  btn.addEventListener("click", () => {
    const isPwd = input.type === "password";
    input.type = isPwd ? "text" : "password";
    btn.textContent = isPwd ? "隐藏" : "显示";
    if (btnId === "toggleKey") btn.textContent = isPwd ? "隐藏密码" : "显示密码";
    if (btnId === "m_toggleKey") btn.textContent = isPwd ? "隐藏" : "显示";
  });
}

function initConfirmKey(btnId) {
  const btn = $(btnId);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const key = valKey();
    if (!key) { setStatus("请先输入管理员密码，再点击确认"); return; }

    // 同步两端输入框
    setKey(key);

    resetAfterKeyConfirm();
    setStatus("管理员密码已确认：现在可以刷新列表并选择表单");
  });
}

function initReloadPacks(btnId) {
  const btn = $(btnId);
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (step < 1) { setStatus("请先确认管理员密码"); return; }

    try {
      setStatus("拉取表单列表中…");
      const packs = await fetchPacks();
      renderPacks(packs);
      setStatus("表单列表已加载：请选择表单，然后锁定");
    } catch (e) {
      setStatus("表单列表加载失败：" + e.message);
    }
  });
}

function initPackSelect(selId){
  const sel = $(selId);
  if (!sel) return;
  sel.addEventListener("change", () => {
    if (step < 1) return;
    if (step >= 3) return;
    // 同步另外一个 select
    syncSelectValue(sel.value);
    applySelectedPack();
  });
}

function initLockPack(btnId){
  const btn = $(btnId);
  if (!btn) return;
  btn.addEventListener("click", () => {
    try { lockCurrentPack(); }
    catch (e) { setStatus("锁定失败：" + e.message); }
  });
}

function initGenerate(btnId){
  const btn = $(btnId);
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (step < 3) { setStatus("请先锁定表单"); return; }

    // 清空旧输出
    setTokenOut("");
    setMsgOut("");
    applyGate();

    setStatus("生成中…");

    try {
      const token = await requestToken();
      setTokenOut(token);

      // 同步 enterUrl/msgTpl 到两端（避免改一个另一端没更新）
      setEnterUrl(valEnterUrl());
      setMsgTpl(valMsgTpl());

      const link = valEnterUrl();
      const msg = buildMessage(link, token);
      setMsgOut(msg);

      await copyToClipboard(msg);

      addHistoryItem({
        token,
        issued_at: nowText(),
        display_name: lockedPack ? lockedPack.display_name : "",
        form_key: lockedPack ? lockedPack.form_key : "",
        form_version: lockedPack ? lockedPack.form_version : ""
      });

      step = 4;
      applyGate();
      setStatus("成功：已生成验证码并复制发送文案（历史已记录）");
    } catch (e) {
      setStatus("失败：" + e.message);
    }
  });
}

function initCopy(btnId, getter, okMsg){
  const btn = $(btnId);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (step < 4) return;
    const text = getter();
    if (!text.trim()) return;
    try { await copyToClipboard(text); setStatus(okMsg); }
    catch (e){ setStatus("复制失败：" + e.message); }
  });
}

function initHistoryButtons(btnExportId, btnClearId){
  const exp = $(btnExportId);
  const clr = $(btnClearId);

  if (exp){
    exp.addEventListener("click", async () => {
      try {
        const text = exportHistoryText();
        await copyToClipboard(text);
        setStatus("已复制：历史导出文本");
      } catch (e) {
        setStatus("复制失败：" + e.message);
      }
    });
  }

  if (clr){
    clr.addEventListener("click", () => {
      localStorage.removeItem(HISTORY_KEY);
      renderHistory();
      setStatus("历史已清空（仅本机）");
    });
  }
}

(function boot() {
  renderHistory();

  step = 0;
  lockedPack = null;
  packsCache = [];

  setPackSelectPlaceholder("确认管理员密码后刷新列表");

  bindToggleKey("toggleKey","key");
  bindToggleKey("m_toggleKey","m_key");

  initConfirmKey("confirmKey");
  initConfirmKey("m_confirmKey");

  initReloadPacks("reloadPacks");
  initReloadPacks("m_reloadPacks");

  initPackSelect("packSelect");
  initPackSelect("m_packSelect");

  initLockPack("lockPack");
  initLockPack("m_lockPack");

  initGenerate("go");
  initGenerate("m_go");

  initCopy("copyToken", () => ($("tokenOutInput")?.value ?? $("m_tokenOutInput")?.value ?? ""), "已复制验证码");
  initCopy("m_copyToken", () => ($("m_tokenOutInput")?.value ?? $("tokenOutInput")?.value ?? ""), "已复制验证码");

  initCopy("copyMsg", () => ($("msgOut")?.value ?? $("m_msgOut")?.value ?? ""), "已复制发送文案");
  initCopy("m_copyMsg", () => ($("m_msgOut")?.value ?? $("msgOut")?.value ?? ""), "已复制发送文案");

  initHistoryButtons("exportHistory","clearHistory");
  initHistoryButtons("m_exportHistory","m_clearHistory");

  applyGate();
  setStatus("就绪：输入管理员密码后点击「确认」");
})();
