// assets/js/result-render.js
export function renderResult(container, data) {
  container.innerHTML = "";

  const blocks = data?.client_result?.blocks || [];
  if (!blocks.length) {
    container.innerHTML = `<p>本次没有命中任何高风险信号。</p>`;
    return;
  }

  container.innerHTML = blocks.map(b => `
    <section class="card">
      <h3>${escapeHtml(b.title || "")}</h3>
      ${(b.body || []).map(line => `<p>${escapeHtml(line)}</p>`).join("")}
    </section>
  `).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

