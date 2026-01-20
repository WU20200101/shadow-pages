// assets/js/api.js
export const API_BASE = "https://shadow-api.wuxiaofei1985.workers.dev";

export async function apiPost(path, data) {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }

  if (!resp.ok) {
    const msg = (json && (json.error || json.message)) ? (json.error || json.message) : text || `HTTP ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    err.payload = json;
    throw err;
  }
  return json ?? {};
}

export async function apiGet(path) {
  const resp = await fetch(`${API_BASE}${path}`);
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }

  if (!resp.ok) {
    const msg = (json && (json.error || json.message)) ? (json.error || json.message) : text || `HTTP ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    err.payload = json;
    throw err;
  }
  return json ?? {};
}

