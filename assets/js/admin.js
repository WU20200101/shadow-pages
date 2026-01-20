const $ = (id) => document.getElementById(id);

const DEFAULT_TEMPLATE =
`你好，这里是你的入口与验证码：

入口链接：
{link}

验证码：
{token}

打开链接后输入验证码即可进入。`;

function setStatus(text) {
  const el = $("status");
  el.textContent = text;
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
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
  return true;
}

function buildMessage(link, token) {
  const tpl = ($("msgTpl").value || DEFAULT_TEMPLATE);
  return tpl
    .replaceAll("{link}", link.trim())
    .replaceAll("{token}", token.trim());
}

function toggleButtons(enabled) {
  $("copyMsg").disabled = !enabled;
  $("copyToken").disabled = !enabled;
}

/** ========== Packs ========== **/

function isActivePack(p) {
  if (!p || typeof p !== "object") return false;
  if (p.active === true) return true;
  if (typeof p.status === "string" && p.status.toLowerCase() === "active") return true;
  return false;
}

function getPackLabel(p) {
  // 尽量给你一个稳定可读的 label
  return (
    p.label ||
    p.name ||
    p.title ||
    `${p.form_key || p.formKey || "unknown"} / ${p.form_version || p.formVersion || "?"}`
  );
}

function getPackFormKey(p) {
  return p.form_key || p.formKey || p.key || "";
}

function getPackFormVersion(p) {
  return p.form_version || p.formVersion || p.version || "";
}

function renderPacks(packs) {
  const sel = $("packSelect");
  sel.innerHTML = "";

  const actives = (packs || []).filter(isActivePack);
  if (!actives.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（没有可用的 active pack）";
    sel.appendChild(opt);
    $("formKey").value = "";
    $("formVersion").value = "";
    return;
  }

  actives.forEach((p, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = getPackLabel(p);
    opt._pack = p; // 绑定对象
    sel.appendChild(opt);
  });

  // 默认选择第一项
  sel.selectedIndex = 0;
  applySelectedPack();
}

function applySelectedPack() {
  const sel = $("packSelect");
  const opt = sel.options[sel.selectedIndex];
  const p = opt && opt._pack;

  $("formKey").value = p ? getPackFormKey(p) : "";
  $("formVersion").value = p ? getPackFormVersion(p) : "";
}

async function fetchPacks() {
  const base = $("base").value.trim();
  const adminKey = $("key").value;

  if (!base) throw new Error("Worker API Base 不能为空");
  if (!adminKey) throw new Error("ADMIN KEY 不能为空（需要用它拉取 pack 列表）");

  const res = await fetch(`${base}/api/admin/packs`, {
    method: "GET",
    headers: {
      "X-ADMIN-KEY": adminKey
    }
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("packs 返回不是 JSON：\n" + text);
  }

  // 兼容：可能是 {packs:[...]} 或直接 [...]
  const packs = Array.isArray(data) ? data : (data.packs || data.data || []);
  if (!Array.isArray(packs)) throw new Error("packs 数据格式不正确：\n" + text);

  return packs;
}

/** ========== Token ========== **/

async function requestToken() {
  const base = $("base").value.trim();
  const adminKey = $("key").value;
  const form_key = $("formKey").value.trim();
  const form_version = $("formVersion").value.trim();

  if (!base) throw new Error("Worker API Base 不能为空");
  if (!adminKey) throw new Error("ADMIN KEY 不能为空");
  if (!form_key) throw new Error("form_key 为空（请先选择 pack）");
  if (!form_version) throw new Error("form_version 为空（请先选择 pack）");

  const res = await fetch(`${base}/api/admin/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ADMIN-KEY": adminKey
    },
    body: JSON.stringify({ form_key, form_version })
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("token 返回不是 JSON：\n" + text);
  }

  if (!data.token) throw new Error("服务端返回缺少 token 字段");
  return data.token;
}

/** ========== UI Init ========== **/

function initTemplate() {
  const tplEl = $("msgTpl");
  if (!tplEl.value) tplEl.value = DEFAULT_TEMPLATE;
}

function initToggleKey() {
  $("toggleKey").addEventListener("click", () => {
    const input = $("key");
    const isPwd = input.type === "password";
    input.type = isPwd ? "text" : "password";
    $("toggleKey").textContent = isPwd ? "隐藏" : "显示";
  });
}

function initCopyButtons() {
  $("copyMsg").addEventListener("click", async () => {
    const msg = $("msgOut").textContent;
    if (!msg || msg === "—") return;
    try {
      await copyToClipboard(msg);
      setStatus("已复制：发送文案");
    } catch (e) {
      setStatus("复制失败：" + e.message);
    }
  });

  $("copyToken").addEventListener("click", async () => {
    const token = $("tokenOut").textContent;
    if (!token || token === "—") return;
    try {
      await copyToClipboard(token);
      setStatus("已复制：验证码");
    } catch (e) {
      setStatus("复制失败：" + e.message);
    }
  });
}

function initGenerate() {
  $("go").addEventListener("click", async () => {
    toggleButtons(false);
    $("tokenOut").textContent = "生成中…";
    $("msgOut").textContent = "生成中…";
    setStatus("请求中…");

    try {
      const token = await requestToken();
      const link = $("enterUrl").value.trim();
      const msg = buildMessage(link, token);

      $("tokenOut").textContent = token;
      $("msgOut").textContent = msg;

      // 默认自动复制“发送文案”
      await copyToClipboard(msg);

      toggleButtons(true);
      setStatus("成功：已生成并复制发送文案到剪贴板");
    } catch (e) {
      $("tokenOut").textContent = "—";
      $("msgOut").textContent = "—";
      toggleButtons(false);
      setStatus("失败：" + e.message);
    }
  });
}

function initPackSelect() {
  $("packSelect").addEventListener("change", applySelectedPack);
}

function initAutoLoadPacks() {
  // 设计原则：不偷偷请求。需要 admin key 才能拉 pack。
  // 做法：当 key 输入完成并失焦，自动拉一次 pack 列表。
  const keyEl = $("key");

  let loading = false;
  const load = async () => {
    if (loading) return;
    loading = true;
    setStatus("拉取 pack 列表中…");
    try {
      const packs = await fetchPacks();
      renderPacks(packs);
      setStatus("就绪（pack 列表已加载）");
    } catch (e) {
      // 不阻塞你手工输入，但提示原因
      setStatus("表单列表加载失败：" + e.message + "（需要用它拉取 pack 列表）");
    } finally {
      loading = false;
    }
  };

  keyEl.addEventListener("blur", load);

  // 如果你粘贴 key 后不点别处，也可以按 Enter 触发一次
  keyEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") load();
  });
}

(function boot() {
  initTemplate();
  initToggleKey();
  initCopyButtons();
  initGenerate();
  initPackSelect();
  initAutoLoadPacks();
  setStatus("就绪（输入 ADMIN KEY 后会自动拉取 pack 列表）");
})();
