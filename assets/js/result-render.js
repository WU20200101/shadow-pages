// assets/js/result-render.js
export function renderResult(container, data) {
  container.innerHTML = "";

  const cr = data?.client_result || {};

  // ===== toggle debug here =====
  const DEBUG = true;

  // normalize text
  const t1 = getText(cr?.module1?.text);
  const t2 = getText(cr?.module2?.text);
  const t3 = getText(cr?.module3?.text);
  const t4 = getText(cr?.module4?.text);
  const t5 = getText(cr?.module5?.text);

  const hasModules = !!(t1 || t2 || t3 || t4 || t5);

  if (hasModules) {
    const cards = [];

    if (t1) cards.push(card("一、你现在所处的判断状态，大致是这样的：", [t1]));
    if (t2) cards.push(card("二、现在最容易让你判断变得吃力的地方是：", [t2]));
    if (t3) cards.push(card("三、下面这些地方，可能还需要你再看一眼：", [t3]));
    if (t4) cards.push(card("四、关于这份结果，你需要知道的几件事", [t4]));
    if (t5) cards.push(card("五、你可以怎么理解和使用这份结果", [t5]));

    if (!cards.length) {
      container.innerHTML = `
        <section class="card">
          <p>你现在的判断，暂时还没有被某一个问题明显拉扯住。</p>
        </section>
      `;
      return;
    }

    container.innerHTML = cards.join("");

    // meta line
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

    // ===== debug panel (tells truth) =====
    if (DEBUG) {
      const dbg = {
        hasModules,
        keys: {
          m1: cr?.module1?.key,
          m2: cr?.module2?.key,
          m3: cr?.module3?.key,
          m4: cr?.module4?.key,
          m5: cr?.module5?.key,
        },
        lengths: {
          m1: t1.length,
          m2: t2.length,
          m3: t3.length,
          m4: t4.length,
          m5: t5.length,
        },
        meta: cr?.meta || null,
      };

      container.innerHTML += `
        <pre class="result__debug">${escapeHtml(JSON.stringify(dbg, null, 2))}</pre>
      `;
    }

    return;
  }

  // legacy fallback
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

  container.innerHTML = `
    <section class="card">
      <p>你现在的判断，暂时还没有被某一个问题明显拉扯住。</p>
    </section>
  `;
}

function getText(v) {
  if (v == null) return "";
  return String(v).trim(); // ✅ 核心：trim 统一处理
}

// ----- UI helpers -----
function card(title, paragraphs) {
  const t = escapeHtml(title || "");
  const ps = (paragraphs || [])
    .filter((x) => String(x).trim().length > 0)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
  return `
    <section class="card">
      ${t ? `<h3>${t}</h3>` : ""}
      ${ps}
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
