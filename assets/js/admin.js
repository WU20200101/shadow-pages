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

function safeDisable(id, disabled) {
  const el = $(id);
  if (el) el.disabled = !!disabled;
}

function applyGate() {
  // step 0
  safeDisable("reloadPacks", !(step >= 1));
  safeDisable("packSelect", !(step >= 1));

  // 锁定按钮：必须选到一个 pack（step>=2）
  safeDisable("lockPack", !(step >= 2));

  // 生成按钮：必须锁定（step>=3）
  safeDisable("go", !(step >= 3));

  // 复制按钮：必须生成成功（step>=4）
  safeDisable("copyToken", !(step >= 4));
  safeDisable("copyMsg", !(step >= 4));

  // 选择/刷新在锁定后不可操作
  if (step >= 3) {
    safeDisable("reloadPacks", true);
    safeDisable("packSelect", true);
  }
}

function resetAfterKeyConfirm() {
  // 密码确认后：清空所有“后置状态”
  lockedPack = null;
  step = 1;

  const tokenEl = $("tokenOutInput");
  const msgOutEl = $("msgOut");
  const formNameEl = $("formName");
  const formVerEl = $("formVersion");

  if (tokenEl) tokenEl.value = "";
  if (msgOutEl) msgOutEl.value = "";
  if (formNameEl) formNameEl.value = "";
  if (formVerEl) formVerEl.value = "";

  // packSelect 先清空占位
  const sel = $("packSelect");
  if (sel) {
    sel.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "确认管理员密码后刷新列表";
    sel.appendChild(opt);
  }

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
  const base = ($("base")?.value || "").trim();
  const adminKey = $("key")?.value || "";

  if (!adminKey) throw new Error("管理员密码不能为空");
  if (!base) throw new Error("Worker API Base 不能为空");

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

  const sel = $("packSelect");
  if (!sel) return;

  sel.innerHTML = "";

  if (!packs.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（没有可用的 active 表单）";
    sel.appendChild(opt);

    if ($("formName")) $("formName").value = "";
    if ($("formVersion")) $("formVersion").value = "";

    step = Math.max(step, 1); // 仍停留在可刷新状态
    applyGate();
    return;
  }

  packs.forEach((p, idx) => {
    const display = getPackDisplayName(p) || `${getPackFormKey(p)}:${getPackFormVersion(p)}`;
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = display; // ✅ 下拉显示 display_name
    sel.appendChild(opt);
  });

  sel.selectedIndex = 0;
  applySelectedPack();
}

function applySelectedPack() {
  if (step < 1) return; // 未确认管理员密码，不允许选择

  const sel = $("packSelect");
  if (!sel) return;

  const idx = Number(sel.value);
  const p = packsCache[idx];

  if (!p) {
    if ($("formName")) $("formName").value = "";
    if ($("formVersion")) $("formVersion").value = "";
    step = 1;
    applyGate();
    return;
  }

  if ($("formName")) $("formName").value = getPackDisplayName(p) || "";
  if ($("formVersion")) $("formVersion").value = getPackFormVersion(p) || "";

  // ✅ 选到表单才进入 step 2
  step = 2;
  applyGate();
}

/** ========== lock pack ========== **/

function lockCurrentPack() {
  if (step < 2) throw new Error("请先选择表单");

  const sel = $("packSelect");
  if (!sel) throw new Error("packSelect 不存在");

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

  setStatus(`已锁定表单：${display_name}（${form_key}:${form_version}）`);
}

/** ========== token ========== **/

async function requestToken() {
  const base = ($("base")?.value || "").trim();
  const adminKey = $("key")?.value || "";

  if (!adminKey) throw new Error("管理员密码不能为空");
  if (!base) throw new Error("Worker API Base 不能为空");
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
  const tplEl = $("msgTpl");
  const tpl = (tplEl?.value || "").trim() ||
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

function initToggleKey() {
  const btn = $("toggleKey");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const input = $("key");
    if (!input) return;
    const isPwd = input.type === "password";
    input.type = isPwd ? "text" : "password";
    btn.textContent = isPwd ? "隐藏密码" : "显示密码";
  });
}

function initConfirmKey() {
  const btn = $("confirmKey");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const key = $("key")?.value || "";
    if (!key) {
      setStatus("请先输入管理员密码，再点击确认");
      return;
    }
    resetAfterKeyConfirm();
    setStatus("管理员密码已确认：现在可以刷新列表并选择表单");
  });
}

function initReloadPacks() {
  const btn = $("reloadPacks");
  if (!btn) return;

  btn.addEventListener("click", async () => {
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
      setStatus("表单列表加载失败：" + (e?.message || e));
    }
  });
}

function initPackSelect() {
  const sel = $("packSelect");
  if (!sel) return;

  sel.addEventListener("change", () => {
    if (step < 1) return;
    if (step >= 3) return; // 锁定后不允许再变
    applySelectedPack();
  });
}

function initLockPack() {
  const btn = $("lockPack");
  if (!btn) return;

  btn.addEventListener("click", () => {
    try {
      lockCurrentPack();
    } catch (e) {
      setStatus("锁定失败：" + (e?.message || e));
    }
  });
}

function initGenerate() {
  const btn = $("go");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (step < 3) {
      setStatus("请先锁定表单");
      return;
    }

    // 清空旧输出
    if ($("tokenOutInput")) $("tokenOutInput").value = "";
    if ($("msgOut")) $("msgOut").value = "";
    safeDisable("copyToken", true);
    safeDisable("copyMsg", true);

    setStatus("生成中…");

    try {
      const token = await requestToken();
      if ($("tokenOutInput")) $("tokenOutInput").value = token;

      const link = ($("enterUrl")?.value || "").trim();
      const msg = buildMessage(link, token);
      if ($("msgOut")) $("msgOut").value = msg;

      // 默认：生成后立刻复制发送文案
      await copyToClipboard(msg);

      // 写入历史（名称用 KV display_name）
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
      setStatus("失败：" + (e?.message || e));
    }
  });
}

function initCopyButtons() {
  const c1 = $("copyToken");
  if (c1) {
    c1.addEventListener("click", async () => {
      if (step < 4) return;
      const token = ($("tokenOutInput")?.value || "").trim();
      if (!token) return;
      try {
        await copyToClipboard(token);
        setStatus("已复制验证码");
      } catch (e) {
        setStatus("复制失败：" + (e?.message || e));
      }
    });
  }

  const c2 = $("copyMsg");
  if (c2) {
    c2.addEventListener("click", async () => {
      if (step < 4) return;
      const msg = ($("msgOut")?.value || "");
      if (!msg.trim()) return;
      try {
        await copyToClipboard(msg);
        setStatus("已复制发送文案");
      } catch (e) {
        setStatus("复制失败：" + (e?.message || e));
      }
    });
  }

  const exp = $("exportHistory");
  if (exp) {
    exp.addEventListener("click", async () => {
      try {
        const text = exportHistoryText();
        await copyToClipboard(text);
        setStatus("已复制：历史导出文本");
      } catch (e) {
        setStatus("复制失败：" + (e?.message || e));
      }
    });
  }

  const clr = $("clearHistory");
  if (clr) {
    clr.addEventListener("click", () => {
      localStorage.removeItem(HISTORY_KEY);
      renderHistory();
      setStatus("历史已清空（仅本机）");
    });
  }
}

(function boot() {
  // 历史先渲染
  renderHistory();

  // 初始状态：step=0
  step = 0;
  lockedPack = null;
  packsCache = [];

  // 初始 pack 下拉占位
  const sel = $("packSelect");
  if (sel) {
    sel.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "确认管理员密码后刷新列表";
    sel.appendChild(opt);
  }

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
