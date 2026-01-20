export function renderResult(container, data) {
  container.innerHTML = "";

  const blocks = Array.isArray(data?.client_result?.blocks)
    ? data.client_result.blocks
    : [];

  if (!blocks.length) {
    container.innerHTML = `
      <section class="card">
        <p>当前判断尚未命中可呈现的结构性张力。</p>
      </section>
    `;
    return;
  }

  container.innerHTML = blocks.map(b => {
    const title = escapeHtml(b.title || "");
    const body = Array.isArray(b.body) ? b.body : [];

    return `
      <section class="card">
        ${title ? `<h3>${title}</h3>` : ""}
        ${body.map(line => `<p>${escapeHtml(line)}</p>`).join("")}
      </section>
    `;
  }).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#39;"
  }[m]));
}
