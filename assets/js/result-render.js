// assets/js/result-render.js
export function renderResult(container, data) {
  container.innerHTML = "";

  const cr = data?.client_result || {};

  // ===== debug (一定要留着，定位缓存/数据) =====
  console.log("[RESULT_RENDER] VERSION = 20260124_1");
  try {
    console.log("[RESULT_RENDER] client_result keys:", Object.keys(cr || {}));
    console.log("[RESULT_RENDER] module3:", cr?.module3);
    console.log("[RESULT_RENDER] module3.text:", cr?.module3?.text);
  } catch (e) {
    console.warn("[RESULT_RENDER] debug log failed:", e);
  }

  // =========================
  // 1) Preferred: protocol output (module1-5)
  // =========================
  const hasModules = ["module1", "module2", "module3", "module4", "module5"].some(
    (k) => typeof cr?.[k]?.text === "string" && cr[k].text.trim()
  );

  if (hasModules) {
    const titleMap = {
      module1: "情绪稳定度",
      module2: "关系投入度",
      module3: "安全感",
      module4: "边界感",
      module5: "清醒度",
    };

    const order = ["module1", "module2", "module3", "module4", "module5"];
    const cards = [];

    for (const k of order) {
      const text = cr?.[k]?.text;

      if (typeof text === "string" && text.trim()) {
        cards.push(card(titleMap[k], [text]));
      } else {
        console.warn(`[RESULT_RENDER] skip ${k} because text=`, text);
      }
    }

    if (!cards.length) {
      container.innerHTML = emptyCard();
      return;
    }

    container.innerHTML = cards.join("");

    // meta line (debug)
    if (cr?.meta?.generated_at || cr?.meta?.engine) {
      const metaLine = [
        cr?.meta?.engine ? `engine: ${escapeHtml(cr.meta.engine)}` : null,
        cr?.meta?.generated_at ? `generated: ${escapeHtml(cr.meta.generated_at)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      if (metaLine) {
        container.innerHTML += `<div class="result__meta">${metaLine}</div>`;
      }
    }

    return;
  }

  // =========================
  // 2) Legacy fallback: blocks output
  // =========================
  const blocks = Array.isArray(cr?.blocks) ? cr.blocks : [];
  if (blocks.length) {
    container.innerHTML = blocks
      .map((b) => {
        const title = escapeHtml(b.title || "");
        const body = Array.isArray(b.body) ? b.body : [];
        return `
          <section class="card">
            ${title ? `<h3>${title}</h3>` : ""}
            ${body.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
          </section>
        `;
      })
      .join("");
    return;
  }

  // =========================
  // 3) Nothing
  // =========================
  container.innerHTML = emptyCard();
}

// ----- UI helpers -----

function card(title, paragraphs) {
  const t = escapeHtml(title || "");
  const ps = (paragraphs || [])
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
  return `
    <section class="card">
      ${t ? `<h3>${t}</h3>` : ""}
      ${ps}
    </section>
  `;
}

function emptyCard() {
  return `
    <section class="card">
      <p>你现在的判断，暂时还没有被某一个问题明显拉扯住。</p>
    </section>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[m]));
}
