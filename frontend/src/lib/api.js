// Fetch client for the API of docs/DESIGN.md, "API contract". Override the base with VITE_API_BASE.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function request(path, body) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/v1${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("The backend is unreachable.");
  }
  if (!response.ok) {
    // Every error body is { detail }: a string from the API's own checks, FastAPI's list of { loc, msg } for request validation.
    const detail = (await response.json().catch(() => ({}))).detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).join("; ")
      : detail;
    throw Object.assign(
      new Error(message ?? `${response.status} ${response.statusText}`),
      { status: response.status, detail },
    );
  }
  return response.json();
}

export const getHealth = () => request("/health");
export const listSites = () => request("/sites");
export const createSite = (name, polygon) =>
  request("/sites", { name, polygon });
export const listOptions = (siteId) => request(`/sites/${siteId}/options`);
export const createOption = (siteId, option) =>
  request(`/sites/${siteId}/options`, option);
export const previewMassing = (siteId, constraints) =>
  request("/massing/preview", { site_id: siteId, constraints });
