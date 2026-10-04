// Rank Up — official ratings helper (Supabase Edge Function "ratings").
// Browsers can't read ratings.fide.com or chess.org.il directly, so the app asks this function,
// which fetches the public player pages and returns just the numbers.
// Request:  POST {fide: ["2807681", ...], icf: ["20256", ...]}   (signed-in users only)
// Response: {fide: {"2807681": {std, rapid, blitz, title} | {error, sample}}, icf: {"20256": {rating} | {error, sample}}}
// A rating is "" when the player is unrated on that list. Anything that doesn't look like a rating is reported, never guessed.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UA = "Mozilla/5.0 (compatible; RankUp/1.0; chess coach ratings)";

// Page text without tags, scripts or entities, with whitespace collapsed.
export function pageText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ").replace(/<\/(div|p|td|th|tr|li|span|h\d)>/gi, " </$1> ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ").trim();
}
const plausible = v => { const n = +v; return Number.isInteger(n) && n >= 100 && n <= 3500 ? n : null; };
const sampleAround = (text, words) => {
  const i = Math.max(0, ...words.map(w => text.search(w))); return text.slice(Math.max(0, i - 150), i + 250);
};

// FIDE profile. The page has a box per list (standard, rapid, blitz) holding the rating and the list's name,
// e.g. <div class="profile-standart ..."><p>1850</p><p>STANDARD</p></div>, or "Not rated". Read the boxes first;
// otherwise read the text, where the number comes either before the name ("1850 STANDARD") or after it ("std 1850").
const LISTS = [["std", "standart|standard|std|classical"], ["rapid", "rapid"], ["blitz", "blitz"]];
const ratingIn = t => { const m = /(\d{3,4})|(not\s*rated|unrated)/i.exec(t); return !m ? undefined : m[2] ? "" : plausible(m[1]); };
export function parseFide(html) {
  const out = {};
  // 1. the rating boxes, by their class names
  for (const [key, names] of LISTS) {
    const m = new RegExp('class="[^"]*\\bprofile-(?:' + names + ')\\b[^"]*"[^>]*>([\\s\\S]*?)</div>', "i").exec(html);
    if (m) { const v = ratingIn(pageText(m[1])); if (v !== undefined && v !== null) out[key] = v; }
  }
  const text = pageText(html);
  // 2. the text: "1850 STANDARD 1700 RAPID Not rated BLITZ" or "std 1850 rapid 1700 blitz Not rated"
  if (!Object.keys(out).length) {
    const after = new RegExp("(\\d{3,4}|not\\s*rated|unrated)\\s*(" + LISTS.map(l => l[1]).join("|") + ")\\b", "gi");
    const before = new RegExp("\\b(" + LISTS.map(l => l[1]).join("|") + ")\\b\\s*(\\d{3,4}|not\\s*rated|unrated)", "gi");
    const keyOf = name => LISTS.find(([, n]) => new RegExp("^(?:" + n + ")$", "i").test(name))[0];
    // the layout is "number first" when a number sits right before STANDARD/RAPID/BLITZ in capitals
    const numberFirst = /(\d{3,4}|not\s*rated)\s*(STANDARD|STANDART|RAPID|BLITZ)\b/.test(text);
    for (const m of text.matchAll(numberFirst ? after : before)) {
      const [val, name] = numberFirst ? [m[1], m[2]] : [m[2], m[1]];
      const k = keyOf(name); if (k in out) continue;
      const v = ratingIn(val); if (v === null) return { error: "Unexpected " + k + " rating: " + val, sample: sampleAround(text, [/standard|\bstd\b/i]) };
      out[k] = v;
    }
  }
  if (!Object.keys(out).length) return { error: "No ratings found on the FIDE page", sample: sampleAround(text, [/standard|\bstd\b/i, /rating/i]) };
  // a list that wasn't shown at all is left as it was, not cleared
  const t = /FIDE title:?\s*(.{1,40}?)\s+(?:Other titles|Federation|B-Year|Sex|FIDE ID|World Rank|$)/i.exec(text);
  out.title = t && !/^(none|-)$/i.test(t[1].trim()) ? t[1].trim() : "";
  return out;
}

// chess.org.il player page: the Israeli rating appears next to "מד כושר" (or "Israeli rating" on the English page).
export function parseIcf(html) {
  const text = pageText(html);
  const pats = [/מד[\s-]*כושר(?:\s*ישראלי)?\s*[:\-]?\s*(\d{3,4})/, /דירוג\s*ישראלי\s*[:\-]?\s*(\d{3,4})/, /Israeli\s*rating\s*[:\-]?\s*(\d{3,4})/i];
  for (const p of pats) { const m = p.exec(text); if (m) { const n = plausible(m[1]); if (n != null) return { rating: n }; } }
  if (/(לא\s*מדורג|ללא\s*מד\s*כושר|unrated|not rated)/i.test(text)) return { rating: "" };
  return { error: "No Israeli rating found on the chess.org.il page", sample: sampleAround(text, [/מד/, /rating/i]) };
}

async function getPage(url, ms = 20000) {
  let r;
  try { r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "en,he;q=0.8" }, signal: AbortSignal.timeout(ms) }); }
  catch (e) { throw new Error(e && e.name === "TimeoutError" ? "The page didn't answer within " + Math.round(ms / 1000) + " seconds" : "Couldn't reach the page: " + (e && e.message || e)); }
  if (!r.ok) throw new Error("The page answered " + r.status);
  const buf = new Uint8Array(await r.arrayBuffer());
  const ct = r.headers.get("content-type") || "";
  let cs = (/charset=([\w-]+)/i.exec(ct) || [])[1];
  if (!cs) { const head = new TextDecoder("latin1").decode(buf.slice(0, 2048)); cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1] || "utf-8"; }
  try { return new TextDecoder(cs.toLowerCase()).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}
const cleanIds = (a, max = 80) => [...new Set((Array.isArray(a) ? a : []).map(x => String(x).replace(/\D/g, "")).filter(x => x.length >= 3 && x.length <= 12))].slice(0, max);

// A few pages at a time, to be gentle with both sites. Supabase stops a function after about 150 seconds,
// so no new page is started after the deadline; those are reported and the app tries them again later.
async function each(ids, fn, width, deadline) {
  const out = {}; let i = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (i < ids.length) {
      const id = ids[i++];
      if (Date.now() > deadline) { out[id] = { error: "Not checked this time (the site was too slow); will try again" }; continue; }
      try { out[id] = await fn(id); } catch (e) { out[id] = { error: String(e && e.message || e) }; }
    }
  }));
  return out;
}

export async function handle(req) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  // Only signed-in users of the app. Checked here (instead of the "Verify JWT" switch, which can reject
  // tokens from Supabase's newer signing keys) by asking Supabase who the token belongs to. The project key
  // for that question is the one the app itself sent (it's public), else the one Supabase provides.
  const env = globalThis.Deno && Deno.env;
  const base = env && env.get("SUPABASE_URL");
  if (base) {
    const keys = [req.headers.get("apikey"), env.get("SUPABASE_ANON_KEY"), env.get("SUPABASE_PUBLISHABLE_KEY")].filter(Boolean);
    let ok = false; const why = [];
    for (const k of [...new Set(keys)]) {
      const who = await fetch(base + "/auth/v1/user", { headers: { Authorization: req.headers.get("authorization") || "", apikey: k } }).catch(e => ({ ok: false, status: 0, text: async () => String(e) }));
      if (who.ok) { ok = true; break; }
      why.push("auth answered " + who.status + ": " + (await who.text()).slice(0, 160));
    }
    if (!ok) return json({ error: "Sign in to the app to check ratings", detail: why.join(" | ") || "no project key" }, 401);
  }
  let body;
  try { body = await req.json(); } catch { return json({ error: "Send JSON" }, 400); }
  // ratings.fide.com is slow: two pages at a time, up to 40 seconds each. chess.org.il at the same time.
  const deadline = Date.now() + 95000;
  const [fide, icf] = await Promise.all([
    each(cleanIds(body.fide), async id => parseFide(await getPage("https://ratings.fide.com/profile/" + id, 40000)), 2, deadline),
    each(cleanIds(body.icf), async id => parseIcf(await getPage("https://www.chess.org.il/Players/Player.aspx?Id=" + id, 20000)), 4, deadline),
  ]);
  return json({ fide, icf, checked: new Date().toISOString() });
}

if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(handle);
