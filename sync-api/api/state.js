/* 학습노트 실시간 동기화 API (Vercel 서버리스 + Neon Postgres)
 * GET  /api/state?space=<sha256 64자>&since=<서버시각 ms>  → { now, items: { 키: {t, v} } }  (since 이후 바뀐 키만)
 * PUT  /api/state?space=...  body { 키: {t, v} }  → 키별로 t(수정시각)가 더 최신일 때만 덮어씀
 * space = 브라우저에서 sha256(사이트키 + ":" + 동기화 코드) → 서버는 코드를 모름
 */
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const ORIGINS = [/^https:\/\/rlaalswo4942\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/];
const MAX_BODY = 3.5 * 1024 * 1024;

module.exports = async (req, res) => {
  const origin = req.headers.origin || "";
  if (ORIGINS.some(r => r.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  const space = String(req.query.space || "");
  if (!/^[0-9a-f]{64}$/.test(space)) return res.status(400).json({ error: "bad space" });

  try {
    if (req.method === "GET") {
      const since = Math.max(0, Number(req.query.since) || 0);
      // 동시에 들어온 쓰기를 놓치지 않게 2초 겹쳐서 조회 (병합은 t 비교라 중복 수신해도 무해)
      const rows = await sql`SELECT k, t, v, (extract(epoch from updated_at) * 1000)::bigint AS u
        FROM note_state WHERE space = ${space} AND updated_at > to_timestamp(${Math.max(0, since - 2000) / 1000})`;
      const items = {};
      let now = since;
      for (const r of rows) { items[r.k] = { t: Number(r.t), v: r.v }; now = Math.max(now, Number(r.u)); }
      return res.status(200).json({ now, items });
    }
    if (req.method === "PUT" || req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") return res.status(400).json({ error: "bad body" });
      const clean = {};
      for (const [k, rec] of Object.entries(body)) {
        if (k.length <= 200 && rec && typeof rec === "object" && Number.isFinite(rec.t)) clean[k] = { t: Math.round(rec.t), v: rec.v === undefined ? null : rec.v };
      }
      const json = JSON.stringify(clean);
      if (json.length > MAX_BODY) return res.status(413).json({ error: "too large" });
      if (!Object.keys(clean).length) return res.status(200).json({ ok: true, n: 0 });
      await sql`INSERT INTO note_state (space, k, t, v, updated_at)
        SELECT ${space}, key, (value->>'t')::bigint, value->'v', now() FROM jsonb_each(${json}::jsonb)
        ON CONFLICT (space, k) DO UPDATE SET t = EXCLUDED.t, v = EXCLUDED.v, updated_at = now()
        WHERE EXCLUDED.t >= note_state.t`;
      return res.status(200).json({ ok: true, n: Object.keys(clean).length });
    }
    return res.status(405).json({ error: "method" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server" });
  }
};
