// Requests to the ga-gas endpoint (GET with query parameters; the
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

// --- Article titles from the blog RSS feed ---

function unescapeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Parse the blog RSS into a Map of article id -> title. The feed's
// item links are https://freddiefujiwara.com/blog/<id>. Tolerant by
// design: anything unparsable is skipped, never thrown.
export function parseRssTitles(xml) {
  const titles = new Map();
  if (typeof xml !== "string") {
    return titles;
  }
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  let item;
  while ((item = itemPattern.exec(xml)) !== null) {
    const title = /<title>([\s\S]*?)<\/title>/.exec(item[1]);
    const link = /<link>([\s\S]*?)<\/link>/.exec(item[1]);
    if (!title || !link) {
      continue;
    }
    const id = unescapeXml(link[1].trim()).split("/").filter(Boolean).pop();
    if (id) {
      titles.set(id, unescapeXml(title[1].trim()));
    }
  }
  return titles;
}

export async function fetchArticleTitles(rssUrl, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(rssUrl);
    return parseRssTitles(await res.text());
  } catch {
    return new Map();
  }
}

// --- Page path display (title + link) ---

// Friendly labels for the site's own app pages. Blog article paths
// are resolved through the RSS titles instead.
const KNOWN_PAGES = {
  "/": "トップページ",
  "/blog/": "ブログ トップ",
  "/list-of-stuff/": "持ち物リスト",
  "/health/": "健康",
  "/asset/": "資産",
  "/alarm/": "アラーム",
  "/tweet/": "ツイート",
  "/ga/": "アクセス解析",
};

// Shape one GA pagePath into a display label and a link target.
// Article paths appear both as /<id> and /blog/<id>; both resolve to
// the canonical /blog/<id> URL. Unknown paths keep the raw path as
// the label and still link to the page itself.
export function pageDisplay(path, titles, origin) {
  const href = (p) => `${origin}${p}`;
  if (KNOWN_PAGES[path]) {
    return { label: KNOWN_PAGES[path], href: href(path) };
  }
  const id = path.replace(/^\/(blog\/)?/, "").replace(/\/$/, "");
  if (id && !id.includes("/") && titles && titles.has(id)) {
    return { label: titles.get(id), href: href(`/blog/${id}`) };
  }
  return { label: path, href: href(path) };
}
