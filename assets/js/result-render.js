// assets/js/result-render.js
// P1 Result Renderer v1
// 只负责：pathId → modules → 渲染 5 个固定模块
// 不做任何判断、不解释、不兜底

export async function renderResult(container, data) {
  container.innerHTML = "";

  // 1️⃣ 从 rules 结果中取 pathId（已保证只有 1 个 block）
  const blocks = data?.client_result?.blocks || [];
  if (!blocks.length) {
    container.innerHTML = `<p class="muted">当前未形成可输出的判断结果。</p>`;
    return;
  }

  const pathId = blocks[0].template_id;
  const state = stateFromPathId(pathId);

  // 2️⃣ 从 sessionStorage 取 r2_path（由 enter 阶段注入）
  const r2_path = getR2Path();
  if (!r2_path) {
    container.innerHTML = `<p class="muted">缺少结果文案路径（r2_path）。</p>`;
    return;
  }

  try {
    // 3️⃣ 拉取 5 个模块 JSON
    const [m1, m2, m3, m4, m5] = await Promise.all([
      fetchPackJson(r2_path, "module1.json"),
      fetchPackJson(r2_path, "module2.json"),
      fetchPackJson(r2_path, "module3.json"),
      fetchPackJson(r2_path, "module4.json"),
      fetchPackJson(r2_path, "module5.json"),
    ]);

    // 4️⃣ 按协议取值（严格，不兜底）
    const module1Text = m1[state];
    const module2Text = m2[pathId];
    const module3List = m3[pathId];
    const module4Text = m4.text;
    const module5Text = m5.text;

    // 5️⃣ 协议校验（有一个缺失就直接中断）
    if (
      !module1Text ||
      !module2Text ||
      !Array.isArray(module3List) ||
      !module4Text ||
      !module5Text
    ) {
      throw new Error(`P1_OUTPUT_INCOMPLETE: ${pathId}`);
    }

    // 6️⃣ 渲染（严格 5 模块顺序）
    container.appendChild(renderTextCard("当前判断状态", module1Text));
    container.appendChild(renderTextCard("判断张力集中点", module2Text));
    container.appendChild(renderListCard("尚未被确认的判断要素", module3List));
    container.appendChild(renderTextCard("判断边界声明", module4Text));
    container.appendChild(renderTextCard("使用方式说明", module5Text));

    // —— 调试信息（确认跑通后可删）——
    const dbg = document.createElement("p");
    dbg.className = "muted";
    dbg.textContent = `DEBUG · pathId=${pathId}`;
    container.appendChild(dbg);

  } catch (e) {
    container.innerHTML = `<p class="muted">结果渲染失败：${escapeHtml(e.message)}</p>`;
  }
}

/* ================= 工具函数 ================= */

// 根据 pathId 推导 state
function stateFromPathId(pathId) {
  if (pathId === "S0") return "S0";
  if (pathId.startsWith("S1-")) return "S1";
  if (pathId.startsWith("S2-")) return "S2";
  return "S0";
}

// 从 enter_payload 中读取 r2_path
function getR2Path() {
  try {
    const raw = sessionStorage.getItem("enter_payload");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.r2_path || null;
  } catch {
    return null;
  }
}

// ⚠️ 这里假设你已把 R2 映射为 /packs/
// 如果不是，改这一行即可
const PACKS_BASE = "/shadow-packs/";

// 拉取 pack 内 JSON
async function fetchPackJson(r2_path, filename) {
  const url = `${PACKS_BASE}${r2_path}${filename}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`PACK_MISSING: ${filename}`);
  return await res.json();
}

// 渲染文本模块
function renderTextCard(title, text) {
  const sec = document.createElement("section");
  sec.className = "card";
  sec.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(text)}</p>
  `;
  return sec;
}

// 渲染列表模块
function renderListCard(title, items) {
  const sec = document.createElement("section");
  sec.className = "card";
  const lis = items.map(i => `<li>${escapeHtml(i)}</li>`).join("");
  sec.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <ul>${lis}</ul>
  `;
  return sec;
}

// XSS 防护
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#39;"
  }[m]));
}
