// assets/js/form-render.js
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}

export function renderForm(container, schema) {
  container.innerHTML = "";

  const questions = schema?.questions || [];
  if (!Array.isArray(questions) || questions.length === 0) {
    container.appendChild(el("p", { text: "schema 为空或无 questions" }));
    return;
  }

  for (const q of questions) {
    const wrap = el("div", { class: "q" });

    const title = el("div", { class: "q-title", text: q.title || q.id || "" });
    wrap.appendChild(title);

    // single
    if (q.type === "single") {
      const options = q.options || [];
      const name = q.id;

      const group = el("div", { class: "q-body" });
      options.forEach((opt, idx) => {
        const id = `${name}_${idx}`;
        const input = el("input", {
          type: "radio",
          name,
          id,
          value: opt,
          ...(q.required ? { required: "required" } : {}),
        });
        const label = el("label", { for: id, class: "opt", text: opt });
        group.appendChild(el("div", { class: "opt-row" }, [input, label]));
      });
      wrap.appendChild(group);
    }

    // multi
    else if (q.type === "multi") {
      const options = q.options || [];
      const group = el("div", { class: "q-body" });
      options.forEach((opt, idx) => {
        const id = `${q.id}_${idx}`;
        const input = el("input", {
          type: "checkbox",
          id,
          value: opt,
          "data-qid": q.id,
        });
        const label = el("label", { for: id, class: "opt", text: opt });
        group.appendChild(el("div", { class: "opt-row" }, [input, label]));
      });
      // required 的多选最小约束留给 submit 校验
      wrap.appendChild(group);
    }

    // scale
    else if (q.type === "scale") {
      const input = el("input", {
        type: "range",
        min: String(q.min ?? 1),
        max: String(q.max ?? 7),
        value: String(q.min ?? 1),
        "data-qid": q.id,
      });
      const val = el("span", { class: "scale-val", text: String(input.value) });
      input.addEventListener("input", () => (val.textContent = String(input.value)));

      const row = el("div", { class: "q-body" }, [
        input,
        el("div", { class: "scale-meta" }, [
          el("span", { text: String(q.min ?? 1) }),
          val,
          el("span", { text: String(q.max ?? 7) }),
        ]),
      ]);
      wrap.appendChild(row);
    }

    // text
    else if (q.type === "text") {
      const textarea = el("textarea", {
        rows: "3",
        "data-qid": q.id,
        placeholder: "可选填写",
      });
      wrap.appendChild(el("div", { class: "q-body" }, [textarea]));
    }

    else {
      wrap.appendChild(el("p", { text: `未知题型：${q.type}` }));
    }

    container.appendChild(wrap);
  }
}

export function collectAnswers(schema, root = document) {
  const answers = {};
  const questions = schema?.questions || [];

  for (const q of questions) {
    if (q.type === "single") {
      const checked = root.querySelector(`input[type="radio"][name="${q.id}"]:checked`);
      if (checked) answers[q.id] = checked.value;
    } else if (q.type === "multi") {
      const boxes = [...root.querySelectorAll(`input[type="checkbox"][data-qid="${q.id}"]`)];
      const picked = boxes.filter(b => b.checked).map(b => b.value);
      if (picked.length) answers[q.id] = picked;
    } else if (q.type === "scale") {
      const range = root.querySelector(`input[type="range"][data-qid="${q.id}"]`);
      if (range) answers[q.id] = Number(range.value);
    } else if (q.type === "text") {
      const ta = root.querySelector(`textarea[data-qid="${q.id}"]`);
      if (ta && ta.value.trim()) answers[q.id] = ta.value.trim();
    }
  }

  return answers;
}

export function validateAnswers(schema, answers) {
  const questions = schema?.questions || [];
  const errs = [];

  for (const q of questions) {
    if (!q.required) continue;

    const v = answers[q.id];

    if (q.type === "single") {
      if (!v) errs.push(`请回答：${q.title}`);
    } else if (q.type === "scale") {
      if (typeof v !== "number" || Number.isNaN(v)) errs.push(`请滑动选择：${q.title}`);
    } else if (q.type === "multi") {
      const minSel = q.min_selected ?? 1;
      const n = Array.isArray(v) ? v.length : 0;
      if (n < minSel) errs.push(`请选择至少 ${minSel} 项：${q.title}`);
    } else if (q.type === "text") {
      // required 的 text（如果以后用到）
      if (!v) errs.push(`请填写：${q.title}`);
    }
  }

  return errs;
}

