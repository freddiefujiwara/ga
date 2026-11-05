// Decode the payload of a Google ID token (JWT) without verifying the
// signature. Verification and authorization happen server-side in
// tweet-gas; this is only used to read the signed-in account's email
// for display.
export function decodeJwtPayload(token) {
  const part = token.split(".")[1];
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );
  return JSON.parse(json);
}
