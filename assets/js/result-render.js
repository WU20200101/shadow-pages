// assets/js/result-render.js
export function renderResult(container, data) {
  container.innerHTML = "";

  const cr = data?.client_result || {};

  // =========================
  // 1) Preferred: module1-5 protocol output
  // =========================
  const hasModules =
    cr?.module1?.text ||
    cr?.module2?.text ||
    cr?.module3?.text ||
    cr?.module4?.text ||
    cr?.module5?.text;

  if (hasModules) {
    const cards = [];

    if (cr?.module1?.text) {
      cards.push(card("你是否还能在关系中保持情绪的独立与稳定", [cr.module1.text]));
    }
    if (cr?.module2?.text) {
      cards.push(card("你在这段关系中的付出是否已经明显失衡或透支", [cr.module2.text]));
    }
    if (cr?.module3?.text) {
      cards.push(card("你对“被在意、被确认”的依赖程度", [cr.module3.text]));
    }
    if (cr?.module4?.text) {
      cards.push(card("你是否还能在关系中使用、表达和维护自己的边界", [cr.module4.text]));
    }
    if (cr?.module5?.text) {
      cards.push(card("情绪是否已经开始覆盖你的判断能力", [cr.module5.text]));
    }

    if (!cards.length) {
      container.innerHTML = `
        <section class="card">
          <p>你现在的判断，暂时还没有被某一个问题明显拉扯住。</p>
        </section>
      `;
      return;
    }

    container.innerHTML = cards.join("");

    // Optional meta (debug) - muted + safe
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
  container.innerHTML = `
    <section class="card">
      <p>你现在的判断，暂时还没有被某一个问题明显拉扯住。</p>
    </section>
  `;
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

function cardList(title, items) {
  const t = escapeHtml(title || "");
  const lis = (items || [])
    .filter(Boolean)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join("");
  return `
    <section class="card">
      ${t ? `<h3>${t}</h3>` : ""}
      <ul class="result__list">
        ${lis}
      </ul>
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
