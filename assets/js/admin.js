const $ = (id) => document.getElementById(id);

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

/** ========== packs (KV: /api/admin/packs) ========== **/

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
  // ✅ 你要求：表单名称必须用 KV 里的 display_name（中文名）
  return (p.display_name || p.displayName || p.name || p.title || "").toString().trim();
}

function renderPacks(packs) {
  const sel = $("packSelect");
  sel.innerHTML = "";

  const actives = (packs || []).filter(isActivePack);
  if (!actives.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（没有可用的 active 表单）";
    sel.appendChild(opt);
    clearPackFields();
    return;
  }

  actives.forEach((p, idx) => {
    const name = getPackDisplayName(p) || `${getPackFormKey(p)}:${getPackFormVersion(p)}`;
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = name;      // ✅ 下拉显示中文名（display_name）
    opt._pack = p;
    sel.appendChild(opt);
  });

  sel.selectedIndex = 0;
  applySelectedPack();
}

function clearPackFields() {
  $("formName").value = "";
  $("formVersion").value = "";
  $("tokenOutInput").value = "";
  $("copyToken").disabled = true;
  $("copyMsg").disabled = true;
}

function applySelectedPack() {
  const sel = $("packSelect");
  const opt = sel.options[sel.selectedIndex];
  const p = opt && opt._pack;

  const name = p ? (getPackDisplayName(p) || "") : "";
  const ver  = p ? (getPackFormVersion(p) || "") : "";

  $("formName").value = name;
  $("formVersion").value = ver;

  // 未锁定时允许变更；锁定后不自动改
}

async function fetchPacks() {
  const base = $("base").value.trim();
  const adminKey = $("key").value;

  if (!adminKey) throw new Error("管理员密码不能为空（需要用它拉取表单列表）");

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

  return packs;
}

/** ========== lock pack ========== **/

let lockedPack = null; // {display_name, form_key, form_version}

function lockCurrentPack() {
  const sel = $("packSelect");
  const opt = sel.options[sel.selectedIndex];
  const p = opt && opt._pack;

  if (!p) throw new Error("请先选择表单");

  const display_name = getPackDisplayName(p) || "未命名表单";
  const form_key = getPackFormKey(p);
  const form_version = getPackFormVersion(p);

  if (!form_key || !form_version) throw new Error("表单缺少 form_key 或 form_version");

  lockedPack = { display_name, form_key, form_version };

  // 锁定 UI：禁用下拉/刷新
  sel.disabled = true;
  $("reloadPacks").disabled = true;
  $("lockPack").disabled = true;

  // 写入只读显示
  $("formName").value = display_name;
  $("formVersion").value = form_version;

  setStatus(`已锁定表单：${display_name}（${form_key}:${form_version}）`);
}

/** ========== token ========== **/

async function requestToken() {
  const base = $("base").value.trim();
  const adminKey = $("key").value;

  if (!adminKey) throw new Error("管理员密码不能为空");
  if (!lockedPack) throw new Error("请先点击「确认并锁定表单」");

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
  const tpl = ($("msgTpl").value || "").trim() ||
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
        <button class="btn btn--muted btn--small" data-copy="${idx}" type="button">复制</button>
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

function initTemplate() {
  // msgTpl 在 HTML 里已经内置；这里不强制改它
}

function initToggleKey() {
  $("toggleKey").addEventListener("click", () => {
    const input = $("key");
    const isPwd = input.type === "password";
    input.type = isPwd ? "text" : "password";
    $("toggleKey").textContent = isPwd ? "隐藏密码" : "显示密码";
  });
}

function initPackSelect() {
  $("packSelect").addEventListener("change", () => {
    if (lockedPack) return; // 锁定后不再响应
    applySelectedPack();
  });
}

function initReloadPacks() {
  $("reloadPacks").addEventListener("click", async () => {
    try {
      setStatus("拉取表单列表中…");
      const packs = await fetchPacks();
      renderPacks(packs);
      setStatus("表单列表已加载");
    } catch (e) {
      setStatus("表单列表加载失败：" + e.message);
    }
  });

  // 输入 key 后：失焦/回车自动拉一次
  $("key").addEventListener("blur", async () => {
    if ($("packSelect").options.length > 0) return; // 已有就不重复拉
    if (!$("key").value) return;
    try {
      setStatus("拉取表单列表中…");
      const packs = await fetchPacks();
      renderPacks(packs);
      setStatus("表单列表已加载");
    } catch (e) {
      setStatus("表单列表加载失败：" + e.message);
    }
  });

  $("key").addEventListener("keydown", async (ev) => {
    if (ev.key !== "Enter") return;
    if (!$("key").value) return;
    try {
      setStatus("拉取表单列表中…");
      const packs = await fetchPacks();
      renderPacks(packs);
      setStatus("表单列表已加载");
    } catch (e) {
      setStatus("表单列表加载失败：" + e.message);
    }
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
    $("copyToken").disabled = true;
    $("copyMsg").disabled = true;
    $("tokenOutInput").value = "";
    setStatus("生成中…");

    try {
      const token = await requestToken();
      $("tokenOutInput").value = token;

      const link = $("enterUrl").value.trim();
      const msg = buildMessage(link, token);
      $("msgOut").value = msg;

      // 默认：生成后立刻复制发送文案（你最常用）
      await copyToClipboard(msg);

      // 写入历史（名称用 KV display_name）
      addHistoryItem({
        token,
        issued_at: nowText(),
        display_name: lockedPack ? lockedPack.display_name : "",
        form_key: lockedPack ? lockedPack.form_key : "",
        form_version: lockedPack ? lockedPack.form_version : ""
      });

      $("copyToken").disabled = false;
      $("copyMsg").disabled = false;

      setStatus("成功：已生成验证码并复制发送文案（历史已记录）");
    } catch (e) {
      setStatus("失败：" + e.message);
    }
  });
}

function initCopyButtons() {
  $("copyToken").addEventListener("click", async () => {
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
  // 初始：历史渲染
  renderHistory();

  initTemplate();
  initToggleKey();
  initPackSelect();
  initReloadPacks();
  initLockPack();
  initGenerate();
  initCopyButtons();

  // 初始 packs 下拉占位
  const sel = $("packSelect");
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = "（请先输入管理员密码后刷新列表）";
  sel.appendChild(opt);

  setStatus("就绪：先输入管理员密码 → 刷新列表 → 选择表单 → 锁定 → 生成");
})();
