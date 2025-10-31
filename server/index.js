// server/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { call } = require("./kepco"); // server/kepco.js 사용

const app = express();
app.use(cors());
app.use(express.json());

// 정적 페이지 서빙
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// 헬스체크
app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * 시군구 목록(이름) 조회
 * GET /api/cities?year=YYYY&month=MM&metroCd=##  (예: metroCd=30 대전)
 * 반환: ["중구","서구",...]
 */
app.get("/api/cities", async (req, res) => {
  try {
    const { year, month, metroCd } = req.query;
    if (!year || !month || !metroCd) {
      return res.status(400).json({ error: "year, month, metroCd 필수" });
    }
    const rows = await call("powerUsage/industryType", { year, month, metroCd });
    const cities = Array.from(new Set(rows.map(r => (r.city || "").trim()).filter(Boolean))).sort();
    res.json(cities);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "server error" });
  }
});

/**
 * 산업분류 Top-N (이름 기반 city 필터 지원)
 * GET /api/industry/top?year=YYYY&month=MM[&metroCd=##][&city=이름][&limit=10]
 * 반환: [{biz, kwh, bill, custCnt, kwhPerCust}, ...]
 */
app.get("/api/industry/top", async (req, res) => {
  try {
    const { year, month, metroCd, city, limit = 10 } = req.query;
    if (!year || !month) return res.status(400).json({ error: "year, month 필수" });

    const rows = await call("powerUsage/industryType", {
      year,
      month,
      ...(metroCd && { metroCd }),
      // cityCd는 쓰지 않음. 이름 기반 필터는 아래에서 처리.
    });

    const filtered = city ? rows.filter(r => (r.city || "").trim() === String(city).trim()) : rows;

    // biz별 합산
    const agg = {};
    for (const r of filtered) {
      const key = r.biz || "(미분류)";
      if (!agg[key]) agg[key] = { biz: key, kwh: 0, bill: 0, custCnt: 0 };
      agg[key].kwh += Number(r.powerUsage ?? r.powerUseage ?? 0);
      agg[key].bill += Number(r.bill ?? 0);
      agg[key].custCnt += Number(r.custCnt ?? 0);
    }

    const out = Object.values(agg)
      .map(x => ({ ...x, kwhPerCust: x.custCnt ? x.kwh / x.custCnt : null }))
      .sort((a, b) => b.kwh - a.kwh)
      .slice(0, Number(limit));

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "server error" });
  }
});

/**
 * 업종별(시군구) 상세
 * GET /api/biztype?year=YYYY&month=MM&metro=시도명&city=시군구명[&bizType=업종명]
 * 반환: KEPCO 원본 행 배열 (프론트에서 bizType별 합산)
 */
app.get("/api/biztype", async (req, res) => {
  try {
    const { year, month, metro, city, bizType } = req.query;
    if (!year || !month) return res.status(400).json({ error: "year, month 필수" });
    if (!metro || !city) return res.status(400).json({ error: "metro, city 필수(이름)" });

    const rows = await call("powerUsage/businessType", {
      year,
      month,
      metro,
      city,
      ...(bizType && { bizType }),
    });

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "server error" });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`✅ Server running → http://localhost:${port}`);
});
