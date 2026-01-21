const $ = (id) => document.getElementById(id);

/** ✅ 这里写死 Worker API Base（不再在页面展示） */
const API_BASE = "https://shadow-api.wuxiaofei1985.workers.dev";

const HISTORY_KEY = "shadow_admin_issue_history_v1";
const HISTORY_LIMIT = 200;

function setStatus(text) {
  const el = $("status");
  if (el) el.textContent = text;
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

function applyGate() {
  // step 0 -> 1
  $("reloadPacks").disabled = !(step >= 1);
  $("packSelect").disabled = !(step >= 1);

  // step 2 才能锁定
  $("lockPack").disabled = !(step >= 2);

  // step 3 才能生成
  $("go").disabled = !(step >= 3);

  // step 4 才能复制
  $("copyToken").disabled = !(step >= 4);
  $("copyMsg").disabled = !(step >= 4);

  // 锁定后：不允许刷新/选择
  if (step >= 3) {
    $("reloadPacks").disabled = true;
    $("packSelect").disabled = true;
  }
}

function resetAfterKeyConfirm() {
  lockedPack = null;
  step = 1;

  $("tokenOutInput").value = "";
  $("msgOut").value = "";
  $("formName").value = "";
  $("formVersion").value = "";

  const sel = $("packSelect");
  sel.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = "确认管理员密码后刷新列表";
  sel.appendChild(opt);

  packsCache = [];
  applyGate();
}

/** ========== packs ========== **/

function isActivePack(p) {
  if (!p || typeof p !== "object") return false;
  if (p.active === true) return true;
  if (typeof p.status === "string" && p.status.toLowerCase() === "active") return true;
  return false;
}

function getPackFormKey(p) {
  return p.form_key || p.formKey || p.key || "";
}

function getPackFormVersion(p) {
  return p.form_version || p.formVersion || p.version || "";
}

function getPackDisplayName(p) {
  // ✅ 必须使用 KV display_name
  return (p.display_name || p.displayName || "").toString().trim();
}

async function fetchPacks() {
  const adminKey = $("key").value;
  if (!adminKey) throw new Error("管理员密码不能为空");

  const res = await fetch(`${API_BASE}/api/admin/packs`, {
    method: "GET",
    headers: { "X-ADMIN-KEY": adminKey },
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

  const sel = $("packSelect");
  sel.innerHTML = "";

  if (!packs.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（没有可用的 active 表单）";
    sel.appendChild(opt);

    $("formName").value = "";
    $("formVersion").value = "";
    step = Math.max(step, 1);
    applyGate();
    return;
  }

  packs.forEach((p, idx) => {
    const display = getPackDisplayName(p) || `${getPackFormKey(p)}:${getPackFormVersion(p)}`;
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = display; // ✅ 下拉显示中文名
    sel.appendChild(opt);
  });

  sel.selectedIndex = 0;
  applySelectedPack();
}

function applySelectedPack() {
  if (step < 1) return;      // 未确认管理员密码，不允许选择
  if (step >= 3) return;     // 锁定后不允许变化

  const sel = $("packSelect");
  const idx = Number(sel.value);
  const p = packsCache[idx];

  if (!p) {
    $("formName").value = "";
    $("formVersion").value = "";
    step = 1;
    applyGate();
    return;
  }

  $("formName").value = getPackDisplayName(p) || "";
  $("formVersion").value = getPackFormVersion(p) || "";

  step = 2;
  applyGate();
}

/** ========== lock pack ========== **/
function lockCurrentPack() {
  if (step < 2) throw new Error("请先选择表单");

  const sel = $("packSelect");
  const idx = Number(sel.value);
  const p = packsCache[idx];

  if (!p) throw new Error("请选择有效的表单");

  const display_name = getPackDisplayName(p) || "未命名表单";
  const form_key = getPackFormKey(p);
  const form_version = getPackFormVersion(p);

  if (!form_key || !form_version) throw new Error("表单缺少 form_key 或 form_version");

  lockedPack = { display_name, form_key, form_version };

  step = 3;
  applyGate();

  setStatus(`已锁定表单：${display_name}（${form_version}）`);
}

/** ========== token ========== **/
async function requestToken() {
  const adminKey = $("key").value;

  if (!adminKey) throw new Error("管理员密码不能为空");
  if (step < 3 || !lockedPack) throw new Error("请先锁定表单");

  const res = await fetch(`${API_BASE}/api/admin/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ADMIN-KEY": adminKey,
    },
    body: JSON.stringify({
      form_key: lockedPack.form_key,
      form_version: lockedPack.form_version,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);

  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("生成接口返回不是 JSON：\n" + text); }

  if (!data.token) throw new Error("服务端返回缺少 token 字段");
  return data.token;
}

/** ========== message（模板后台固定，不给页面编辑） ========== **/
function buildMessage(link, token) {
  const tpl =
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
      <td>
        <button class="btn btn--primary btn--small" data-copy="${idx}" type="button">复制</button>
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
function initToggleKey() {
  $("toggleKey").addEventListener("click", () => {
    const input = $("key");
    const isPwd = input.type === "password";
    input.type = isPwd ? "text" : "password";
    $("toggleKey").textContent = isPwd ? "隐藏密码" : "显示密码";
  });
}

function initConfirmKey() {
  $("confirmKey").addEventListener("click", () => {
    const key = $("key").value;
    if (!key) {
      setStatus("请先输入管理员密码，再点击确认");
      return;
    }
    resetAfterKeyConfirm();
    setStatus("管理员密码已确认：现在可以刷新列表并选择表单");
  });
}

function initReloadPacks() {
  $("reloadPacks").addEventListener("click", async () => {
    if (step < 1) {
      setStatus("请先确认管理员密码");
      return;
    }
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

function initPackSelect() {
  $("packSelect").addEventListener("change", () => {
    applySelectedPack();
  });
}

function initLockPack() {
  $("lockPack").addEventListener("click", () => {
    try {
      lockCurrentPack();
    } catch (e) {
      setStatus("锁定失败：" + e.message);
    }
  });
}

function initGenerate() {
  $("go").addEventListener("click", async () => {
    if (step < 3) {
      setStatus("请先锁定表单");
      return;
    }

    // 清空旧输出
    $("tokenOutInput").value = "";
    $("msgOut").value = "";

    step = 3;
    applyGate();

    setStatus("生成中…");

    try {
      const token = await requestToken();
      $("tokenOutInput").value = token;

      const link = $("enterUrl").value.trim();
      const msg = buildMessage(link, token);
      $("msgOut").value = msg;

      // 写入历史（名称用 KV display_name）
      addHistoryItem({
        token,
        issued_at: nowText(),
        display_name: lockedPack ? lockedPack.display_name : "",
        form_key: lockedPack ? lockedPack.form_key : "",
        form_version: lockedPack ? lockedPack.form_version : "",
      });

      // 生成后允许复制
      step = 4;
      applyGate();

      setStatus("成功：已生成验证码（历史已记录）");
    } catch (e) {
      setStatus("失败：" + e.message);
    }
  });
}

function initCopyButtons() {
  $("copyToken").addEventListener("click", async () => {
    if (step < 4) return;
    const token = $("tokenOutInput").value.trim();
    if (!token) return;
    try {
      await copyToClipboard(token);
      setStatus("已复制验证码");
    } catch (e) {
      setStatus("复制失败：" + e.message);
    }
  });

  $("copyMsg").addEventListener("click", async () => {
    if (step < 4) return;
    const msg = $("msgOut").value;
    if (!msg.trim()) return;
    try {
      await copyToClipboard(msg);
      setStatus("已复制发送文案");
    } catch (e) {
      setStatus("复制失败：" + e.message);
    }
  });

  $("exportHistory").addEventListener("click", async () => {
    try {
      const text = exportHistoryText();
      await copyToClipboard(text);
      setStatus("已复制：历史导出文本");
    } catch (e) {
      setStatus("复制失败：" + e.message);
    }
  });

  $("clearHistory").addEventListener("click", () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    setStatus("历史已清空（仅本机）");
  });
}

(function boot() {
  renderHistory();

  step = 0;
  lockedPack = null;
  packsCache = [];

  // pack 下拉占位
  const sel = $("packSelect");
  sel.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = "确认管理员密码后刷新列表";
  sel.appendChild(opt);

  initToggleKey();
  initConfirmKey();
  initReloadPacks();
  initPackSelect();
  initLockPack();
  initGenerate();
  initCopyButtons();

  applyGate();
  setStatus("就绪：输入管理员密码后点击「确认」");
})();
