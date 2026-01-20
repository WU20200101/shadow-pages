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
  // 优先：Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  // 兼容：execCommand
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

async function requestToken() {
  const base = $("base").value.trim();
  const adminKey = $("key").value;
  const form_key = $("formKey").value.trim();
  const form_version = $("formVersion").value.trim();

  if (!base) throw new Error("Worker API Base 不能为空");
  if (!adminKey) throw new Error("ADMIN KEY 不能为空");
  if (!form_key) throw new Error("form_key 不能为空");
  if (!form_version) throw new Error("form_version 不能为空");

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
    // 直接抛原始内容，方便你看到 Worker 返回了什么
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

      // 默认：自动复制“发送文案”（更符合你要“直接发给客户”）
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

(function boot() {
  initTemplate();
  initToggleKey();
  initCopyButtons();
  initGenerate();
})();
