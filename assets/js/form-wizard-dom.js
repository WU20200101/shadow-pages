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

function normStr(v){ return (v ?? "").toString(); }

function totalSteps(schema){
  const qs = schema?.questions || [];
  return 1 + (Array.isArray(qs) ? qs.length : 0); // 1=声明+免责声明合并页
}

/** Step 0：声明+简介+免责声明 合并页 */
function renderIntroAndDisclaimer(mount, displayName, state){
  mount.innerHTML = "";

  mount.appendChild(el("div", { class:"stepTitle", text:"声明与免责声明" }));

  mount.appendChild(el("div", { class:"help" }, [
    document.createTextNode(`${displayName} 用于“判断前校验”。请按直觉填写，不需要解释。`),
    el("br"),
    document.createTextNode("系统只呈现结构化结果，不替你做决定。"),
    el("br"),
    el("br"),
    document.createTextNode("免责声明："),
    el("br"),
    document.createTextNode("1）本系统不提供行动建议，也不对任何结果负责。"),
    el("br"),
    document.createTextNode("2）你提交的信息将用于生成判断结果与结构化呈现。"),
    el("br"),
    document.createTextNode("3）继续即表示你理解并同意以上内容。")
  ]));

  const id = "agree_disclaimer";
  const cb = el("input", { type:"checkbox", id });
  cb.checked = !!state.agreed;
  cb.addEventListener("change", () => state.agreed = cb.checked);

  const row = el("div", { class:"choiceRow" }, [
    cb,
    el("label", { for:id, text:"我已阅读并同意免责声明，开始填写" })
  ]);

  mount.appendChild(el("div", { style:"height:12px" }));
  mount.appendChild(row);
}

function renderQuestion(mount, q, answers){
  mount.innerHTML = "";
  mount.appendChild(el("div", { class:"stepTitle stepTitle--q", text: q.title || q.id || "" }));

  // text：hint 作为 placeholder（不再单独占一行）
  if (q.type === "text") {
    const ta = el("textarea", {
      rows:"6",
      placeholder: q.hint ? normStr(q.hint) : "请输入",
      class: "input"
    });
    ta.value = normStr(answers[q.id]);
    ta.addEventListener("input", () => { answers[q.id] = ta.value; });
    mount.appendChild(ta);
    return;
  }

  // 非 text：如果有 hint，仍显示小字提示（不挤占输入区）
  if (q.hint) {
    mount.appendChild(el("div", { class:"help", text: q.hint }));
  }

  // single
  if (q.type === "single") {
    const list = el("div", { class:"choiceList" });
    const current = answers[q.id];

    (q.options || []).forEach((opt, idx) => {
      const id = `${q.id}_${idx}_wiz`;
      const input = el("input", { type:"radio", name:`wiz_${q.id}`, id, value: opt });
      if (current === opt) input.checked = true;

      input.addEventListener("change", () => { answers[q.id] = opt; });

      const row = el("div", { class:"choiceRow" }, [
        input,
        el("label", { for:id, text: opt })
      ]);
      list.appendChild(row);
    });

    mount.appendChild(list);
    return;
  }

  // multi
  if (q.type === "multi") {
    const list = el("div", { class:"choiceList" });
    const current = Array.isArray(answers[q.id]) ? answers[q.id] : [];

    (q.options || []).forEach((opt, idx) => {
      const id = `${q.id}_${idx}_wiz`;
      const input = el("input", { type:"checkbox", id, value: opt });
      input.checked = current.includes(opt);

      input.addEventListener("change", () => {
        const arr = Array.isArray(answers[q.id]) ? answers[q.id] : [];
        const has = arr.includes(opt);
        let next = arr;
        if (input.checked && !has) next = [...arr, opt];
        if (!input.checked && has) next = arr.filter(x => x !== opt);
        answers[q.id] = next;
      });

      const row = el("div", { class:"choiceRow" }, [
        input,
        el("label", { for:id, text: opt })
      ]);
      list.appendChild(row);
    });

    mount.appendChild(list);
    return;
  }

  // scale
  if (q.type === "scale") {
    const min = Number(q.min ?? 1);
    const max = Number(q.max ?? 7);
    const cur = typeof answers[q.id] === "number" ? answers[q.id] : min;

    const range = el("input", { type:"range", min:String(min), max:String(max), value:String(cur) });
    const val = el("span", { class:"rangeVal", text: String(cur) });

    range.addEventListener("input", () => {
      const v = Number(range.value);
      answers[q.id] = v;
      val.textContent = String(v);
    });

    const wrap = el("div", { class:"rangeWrap" }, [
      range,
      el("div", { class:"rangeMeta" }, [
        el("span", { text: String(min) }),
        val,
        el("span", { text: String(max) })
      ])
    ]);
    mount.appendChild(wrap);
    return;
  }

  mount.appendChild(el("div", { class:"help", text:`未知题型：${q.type}` }));
}

function validateCurrent(schema, idx, state){
  // idx=0：声明+免责声明合并页
  if (idx === 0) {
    if (!state.agreed) return "请先勾选同意免责声明";
    return null;
  }

  // idx>=1：问题页（idx-1 对应 questions 下标）
  const questions = schema?.questions || [];
  const q = questions[idx - 1];
  if (!q || !q.required) return null;

  const v = state.answers[q.id];

  if (q.type === "single") {
    if (!v) return `请回答：${q.title}`;
  } else if (q.type === "scale") {
    if (typeof v !== "number" || Number.isNaN(v)) return `请滑动选择：${q.title}`;
  } else if (q.type === "multi") {
    const minSel = q.min_selected ?? 1;
    const n = Array.isArray(v) ? v.length : 0;
    if (n < minSel) return `请选择至少 ${minSel} 项：${q.title}`;
  } else if (q.type === "text") {
    if (!normStr(v).trim()) return `请填写：${q.title}`;
  }
  return null;
}

// 回灌成你原 collectAnswers 能读取的 DOM 结构（submit.js 不动）
function materialize(schema, answers, container){
  container.innerHTML = "";

  const questions = schema?.questions || [];
  for (const q of questions) {
    const wrap = el("div", { class: "q" });
    wrap.appendChild(el("div", { class:"q-title", text: q.title || q.id || "" }));

    if (q.type === "single") {
      const options = q.options || [];
      const name = q.id;
      const group = el("div", { class:"q-body" });

      options.forEach((opt, idx) => {
        const id = `${name}_${idx}`;
        const inputAttrs = { type:"radio", name, id, value: opt };
        if (q.required) inputAttrs.required = "required";
        const input = el("input", inputAttrs);
        if (answers[q.id] === opt) input.checked = true;

        const label = el("label", { for:id, class:"opt", text: opt });
        group.appendChild(el("div", { class:"opt-row" }, [input, label]));
      });
      wrap.appendChild(group);
    }

    else if (q.type === "multi") {
      const options = q.options || [];
      const group = el("div", { class:"q-body" });
      const picked = Array.isArray(answers[q.id]) ? answers[q.id] : [];

      options.forEach((opt, idx) => {
        const id = `${q.id}_${idx}`;
        const input = el("input", { type:"checkbox", id, value: opt, "data-qid": q.id });
        if (picked.includes(opt)) input.checked = true;

        const label = el("label", { for:id, class:"opt", text: opt });
        group.appendChild(el("div", { class:"opt-row" }, [input, label]));
      });
      wrap.appendChild(group);
    }

    else if (q.type === "scale") {
      const min = String(q.min ?? 1);
      const max = String(q.max ?? 7);
      const v = (typeof answers[q.id] === "number") ? answers[q.id] : Number(min);

      const input = el("input", { type:"range", min, max, value: String(v), "data-qid": q.id });
      wrap.appendChild(el("div", { class:"q-body" }, [input]));
    }

    else if (q.type === "text") {
      const textarea = el("textarea", { rows:"3", "data-qid": q.id, placeholder:"可选填写" });
      textarea.value = normStr(answers[q.id] || "");
      wrap.appendChild(el("div", { class:"q-body" }, [textarea]));
    }

    container.appendChild(wrap);
  }
}

export function createWizardDom({ mount, schema, displayName, setStatus, onUI }) {
  const questions = Array.isArray(schema?.questions) ? schema.questions : [];
  const total = totalSteps(schema);

  const state = { idx: 0, agreed: false, answers: {} };

  const isLast = () => state.idx === total - 1;

  const progressText = () => {
    if (state.idx === 0) return `步骤 1 / ${total}`;
    return `问题 ${state.idx} / ${questions.length}`;
  };

  const progressRatio = () => {
    if (total <= 1) return 0;
    return state.idx / (total - 1);
  };

  const nextText = () => isLast() ? "提交" : "下一步";

  const render = () => {
    if (state.idx === 0) {
      renderIntroAndDisclaimer(mount, displayName, state);
      setStatus?.("勾选同意后点击「下一步」开始填写");
    } else {
      renderQuestion(mount, questions[state.idx - 1], state.answers);
      setStatus?.("按直觉选择/填写，然后点击「下一步」");
    }
    onUI?.({ nextText: nextText(), progressText: progressText(), progressRatio: progressRatio() });
  };

  const next = () => {
    const err = validateCurrent(schema, state.idx, state);
    if (err) throw new Error(err);

    if (isLast()) {
      return { done: true, answers: state.answers };
    }
    state.idx += 1;
    render();
    return { done: false, answers: state.answers };
  };

  const materializeTo = (container) => materialize(schema, state.answers, container);

  render();
  return { next, materializeTo };
}
