// ga frontend configuration.
//
// GOOGLE_CLIENT_ID: OAuth 2.0 Web client ID used for Google Sign-In.
//   The same client as the health site.
// GAS_ENDPOINT: the /exec URL of the ga-gas web app deployment.
//   The staging build overrides it with VITE_GAS_ENDPOINT; production
//   builds leave the variable unset and use the production URL below.
//
// There is deliberately no allowed-email check on the client side:
// authorization is enforced by ga-gas, which verifies the ID token
// and the account's email before returning data.
export const CONFIG = {
  GOOGLE_CLIENT_ID:
    "728154182351-5ribj1diqcp8jpfo3rnqk9rei1aka98t.apps.googleusercontent.com",
  GAS_ENDPOINT:
    import.meta.env.VITE_GAS_ENDPOINT ??
    "https://script.google.com/macros/s/AKfycbypis7IqAtM2u0_h7ysiZ5UgztUEwNYJ1zPMnr8IbTBXiyfiapfRMtD_9CxVpc5G8YVzQ/exec",
  // The blog's RSS feed (blog-gas ?o=rss): used to turn article page
  // paths in the ranking into article titles. Public content metadata,
  // so the production feed is used for both builds.
  BLOG_RSS_URL:
    "https://script.google.com/macros/s/AKfycbydcnw4yt5K8lz8Wf0PCbG6Q9yD3jf1W2lsGucOor2KII7duJr7qevcMiwNHJTe8GZH/exec?o=rss",
  // The blog API's titles payload (blog-gas ?o=titles): carries the
  // article id -> tag list map used for the blog tab's per-genre
  // rollup. Same public-metadata treatment as the RSS feed.
  BLOG_TITLES_URL:
    "https://script.google.com/macros/s/AKfycbydcnw4yt5K8lz8Wf0PCbG6Q9yD3jf1W2lsGucOor2KII7duJr7qevcMiwNHJTe8GZH/exec?o=titles",
  SITE_ORIGIN: "https://freddiefujiwara.com",
};
