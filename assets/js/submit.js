// assets/js/submit.js
import { apiPost } from "./api.js";
import { collectAnswers, validateAnswers } from "./form-render.js";

export async function submitFlow({ token, schema }) {
  const answers = collectAnswers(schema, document);
  const errs = validateAnswers(schema, answers);
  if (errs.length) {
    alert(errs.join("\n"));
    return;
  }

  const data = await apiPost("/api/submit", { token, answers });
  const rid = data?.result_id;
  if (!rid) throw new Error("submit 未返回 result_id");

  // 进入 3 秒等待页
  window.location.href = `/waiting.html?rid=${encodeURIComponent(rid)}`;
}

