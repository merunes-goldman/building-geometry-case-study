// Fetch client for the API of docs/DESIGN.md, "API contract". Override the base with VITE_API_BASE.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

// An HTTP error from the API: the message is the `detail` string of the response.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/v1${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("The backend is unreachable.");
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail;
    throw new ApiError(res.status, detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
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
