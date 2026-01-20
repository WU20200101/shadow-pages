const $ = (id) => document.getElementById(id);

const DEFAULT_TEMPLATE =
`你好，这里是你的入口与验证码：

入口链接：
{link}

验证码：
{token}

打开链接后输入验证码即可进入。`;

function setStatus(text, kind = "muted") {
  const el = $("status");
  el.className = `status ${kind}`;
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
  const tpl = $("msgTpl").value || DEFAULT_TEMPLATE;
  return tpl
    .replaceAll("{link}", link.trim())
    .replaceAll("{token}", token.trim());
}

function toggleButtons(enabled) {
  $("copyMsg").disabled = !enabled;
  $("copyToken").disabled = !enabled;
}

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
      setStatus("已复制：发送文案", "muted");
    } catch (e) {
      setStatus("复制失败：" + e.message, "muted");
    }
  });

  $("copyToken").addEventListener("click", async () => {
    const token = $("tokenOut").textContent;
    if (!token || token === "—") return;
    try {
      await copyToClipboard(token);
      setStatus("已复制：验证码", "muted");
    } catch (e) {
      setStatus("复制失败：" + e.message, "muted");
    }
  });
}

// -----------------------
// NEW: load packs -> dropdown
// -----------------------
async function fetchPacks() {
  const base = $("base").value.trim();
  const adminKey = $("key").value;

  if (!base) throw new Error("Worker API Base 不能为空");
  if (!adminKey) throw new Error("ADMIN KEY 不能为空（需要用它拉取 pack 列表）");

  const res = await fetch(`${base}/api/admin/packs`, {
    method: "GET",
    headers: { "X-ADMIN-KEY": adminKey }
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("packs 返回不是 JSON：\n" + text);
  }

  const packs = Array.isArray(data.packs) ? data.packs : [];
  return packs.filter(p => p && p.active === true);
}

function fillPackSelect(packs) {
  const sel = $("packSelect");
  sel.innerHTML = "";

  if (!packs.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（没有可用的 active pack）";
    sel.appendChild(opt);
    $("formKey").value = "";
    $("formVersion").value = "";
    return;
  }

  for (const p of packs) {
    const opt = document.createElement("option");
    opt.value = `${p.form_key}@@${p.form_version}`;
    opt.textContent = p.display_name || `${p.form_key} / ${p.form_version}`;
    sel.appendChild(opt);
  }

  // 默认选第一个
  sel.selectedIndex = 0;
  syncSelectedPackToInputs();
}

function syncSelectedPackToInputs() {
  const sel = $("packSelect");
  const v = sel.value || "";
  const [form_key, form_version] = v.split("@@");
  $("formKey").value = form_key || "";
  $("formVersion").value = form_version || "";
}

function initPackSelect() {
  const sel = $("packSelect");
  if (!sel) return;

  sel.addEventListener("change", () => {
    syncSelectedPackToInputs();
    setStatus("已选择表单：" + ($("formKey").value || "-") + " / " + ($("formVersion").value || "-"));
  });
}

async function initLoadPacksButtonless() {
  // 在两种时机加载 packs：
  // 1) 页面启动（如果 key 已填）
  // 2) 当用户输入/粘贴 ADMIN KEY 后，自动尝试加载
  async function tryLoad() {
    try {
      setStatus("加载表单列表中…");
      const packs = await fetchPacks();
      fillPackSelect(packs);
      setStatus("表单列表已加载");
    } catch (e) {
      // 不阻塞：允许你以后加“手动输入”模式（目前 formKey/formVersion 是只读）
      setStatus("表单列表加载失败：" + (e.message || String(e)));
    }
  }

  // 启动先试一次（很多时候你已经把 key 粘好了）
  await tryLoad();

  // key 改变时再试
  $("key").addEventListener("change", tryLoad);
  $("base").addEventListener("change", tryLoad);
}

// -----------------------
// token
// -----------------------
async function requestToken() {
  const base = $("base").value.trim();
  const adminKey = $("key").value;
  const form_key = $("formKey").value.trim();
  const form_version = $("formVersion").value.trim();

  if (!base) throw new Error("Worker API Base 不能为空");
  if (!adminKey) throw new Error("ADMIN KEY 不能为空");
  if (!form_key) throw new Error("form_key 为空（请先选择表单）");
  if (!form_version) throw new Error("form_version 为空（请先选择表单）");

  const res = await fetch(`${base}/api/admin/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ADMIN-KEY": adminKey
    },
    body: JSON.stringify({ form_key, form_version })
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(text);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("服务端返回不是 JSON：\n" + text);
  }

  if (!data.token) throw new Error("服务端返回缺少 token 字段");
  return data.token;
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

      await copyToClipboard(msg);

      toggleButtons(true);
      setStatus("成功：已生成并复制发送文案到剪贴板");
    } catch (e) {
      $("tokenOut").textContent = "—";
      $("msgOut").textContent = "—";
      toggleButtons(false);
      setStatus("失败：" + (e.message || String(e)));
    }
  });
}

(async function boot() {
  initTemplate();
  initToggleKey();
  initCopyButtons();
  initPackSelect();
  initGenerate();

  // NEW: 自动加载 packs
  await initLoadPacksButtonless();
})();
