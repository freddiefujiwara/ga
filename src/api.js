// Requests to the ga4-gas endpoint (GET with query parameters; the
// bridge is a plain doGet). Auth travels as an id_token parameter
// (Google sign-in) or a share_token parameter (temporary access link).
// Each function returns the parsed JSON ({ ok: true, ... } on success).

function buildUrl(endpoint, auth, params) {
  const url = new URL(endpoint);
  if (auth && auth.idToken) {
    url.searchParams.set("id_token", auth.idToken);
  }
  if (auth && auth.shareToken) {
    url.searchParams.set("share_token", auth.shareToken);
  }
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function getJson(endpoint, auth, params, fetchImpl) {
  const res = await fetchImpl(buildUrl(endpoint, auth, params));
  return res.json();
}

export async function fetchReport(endpoint, auth, params, fetchImpl = fetch) {
  return getJson(endpoint, auth, params, fetchImpl);
}

// Lightweight call to check a share link: resolves with the bridge's
// response ({ ok: true, _share: { expires_at } } for a live link).
export async function validateShareToken(endpoint, shareToken, fetchImpl = fetch) {
  return getJson(endpoint, { shareToken }, { dimensions: "", limit: 1 }, fetchImpl);
}

// Owner-only share administration: action is "issue_share" or
// "revoke_share"; requires the owner's Google ID token.
export async function shareAction(endpoint, idToken, action, fetchImpl = fetch) {
  return getJson(endpoint, { idToken }, { action }, fetchImpl);
}

// --- Report shaping helpers (pure, unit-tested) ---

export function rowsOf(response) {
  if (!response || !response.ok || !response.data) {
    return [];
  }
  return response.data.rows || [];
}

export function totalsOf(response) {
  const row = rowsOf(response)[0];
  if (!row) {
    return { views: 0, users: 0, sessions: 0 };
  }
  const values = row.metricValues.map((m) => Number(m.value) || 0);
  return { views: values[0] || 0, users: values[1] || 0, sessions: values[2] || 0 };
}

// Daily rows come back as YYYYMMDD dimension values; sort ascending
// and shape them for the chart.
export function dailySeries(response) {
  return rowsOf(response)
    .map((row) => ({
      date: row.dimensionValues[0].value,
      views: Number(row.metricValues[0].value) || 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function dimensionRanking(response, limit = 10) {
  return rowsOf(response)
    .slice(0, limit)
    .map((row) => ({
      name: row.dimensionValues[0].value,
      views: Number(row.metricValues[0].value) || 0,
    }));
}
