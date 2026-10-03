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

// FIDE profile: the rating boxes read "std 1850", "rapid 1790", "blitz Not rated"; the details list "FIDE title: None".
export function parseFide(html) {
  const text = pageText(html);
  const out = {};
  let found = 0;
  for (const [key, label] of [["std", "std"], ["rapid", "rapid"], ["blitz", "blitz"]]) {
    const m = new RegExp("\\b" + label + "\\b\\s*(\\d{3,4}|not rated|unrated)", "i").exec(text);
    if (!m) continue;
    found++;
    if (/rated/i.test(m[1])) out[key] = "";
    else { const n = plausible(m[1]); if (n == null) return { error: "Unexpected " + key + " rating: " + m[1], sample: sampleAround(text, [/\bstd\b/i]) }; out[key] = n; }
  }
  if (!found) return { error: "No ratings found on the FIDE page", sample: sampleAround(text, [/rating/i, /\bstd\b/i]) };
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

async function getPage(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "en,he;q=0.8" } });
  if (!r.ok) throw new Error("The page answered " + r.status);
  const buf = new Uint8Array(await r.arrayBuffer());
  const ct = r.headers.get("content-type") || "";
  let cs = (/charset=([\w-]+)/i.exec(ct) || [])[1];
  if (!cs) { const head = new TextDecoder("latin1").decode(buf.slice(0, 2048)); cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1] || "utf-8"; }
  try { return new TextDecoder(cs.toLowerCase()).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}
const cleanIds = (a, max = 80) => [...new Set((Array.isArray(a) ? a : []).map(x => String(x).replace(/\D/g, "")).filter(x => x.length >= 3 && x.length <= 12))].slice(0, max);

// A few pages at a time, to be gentle with both sites.
async function each(ids, fn, width = 4) {
  const out = {}; let i = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (i < ids.length) { const id = ids[i++]; try { out[id] = await fn(id); } catch (e) { out[id] = { error: String(e && e.message || e) }; } }
  }));
  return out;
}

export async function handle(req) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Send JSON" }, 400); }
  const fide = await each(cleanIds(body.fide), async id => parseFide(await getPage("https://ratings.fide.com/profile/" + id)));
  const icf = await each(cleanIds(body.icf), async id => parseIcf(await getPage("https://www.chess.org.il/Players/Player.aspx?Id=" + id)));
  return json({ fide, icf, checked: new Date().toISOString() });
}

if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(handle);
