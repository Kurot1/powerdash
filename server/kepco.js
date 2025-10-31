// server/kepco.js
const axios = require("axios");

const BASE = "https://bigdata.kepco.co.kr/openapi/v1";
const UA = "powerdash/1.0 (+node axios)";

const z2 = v => String(v ?? "").padStart(2, "0");

// 문자열일 수도, 이미 객체일 수도 있는 응답을 안전하게 JSON으로 변환
function normalizeJson(data) {
  if (data == null) return null;
  if (typeof data === "object") return data; // 이미 파싱됨

  let s = String(data).replace(/^\uFEFF/, "").trim();

  // 1차 시도
  try { return JSON.parse(s); } catch {}

  // 본문에 여분 문자가 섞이는 경우: 최외곽 {} 또는 []만 추출
  const trySlice = (open, close) => {
    const i = s.indexOf(open), j = s.lastIndexOf(close);
    if (i !== -1 && j !== -1 && j > i) {
      const t = s.slice(i, j + 1);
      try { return JSON.parse(t); } catch {}
    }
    return null;
  };

  return trySlice("{", "}") || trySlice("[", "]") || null;
}

/**
 * endpoint 예) "powerUsage/contractType"
 * params: { year, month, ... }
 * 반환: 배열 (data/totData 흡수, 숫자형 정규화)
 */
async function call(endpoint, params = {}) {
  const query = {
    ...params,
    year: String(params.year ?? "").trim(),
    month: z2(params.month ?? ""),
    apiKey: process.env.KEPCO_API_KEY,
    returnType: "json",
  };
  Object.keys(query).forEach(k => {
    if (query[k] == null || query[k] === "") delete query[k];
  });

  const url = `${BASE}/${endpoint}.do`;

  try {
    // axios가 보통 JSON으로 파싱해줌. 혹시 텍스트가 오면 normalizeJson에서 처리.
    const resp = await axios.get(url, {
      params: query,
      timeout: 20000,
      headers: { "User-Agent": UA, "Accept": "application/json,text/plain,*/*" },
      // transformResponse 기본값 유지(=JSON이면 객체, 아니면 문자열)
    });

    const body = normalizeJson(resp.data);
    if (!body) {
      console.error("KEPCO raw sample(head 300):", String(resp.data).slice(0, 300));
      throw new Error("KEPCO JSON parse failed");
    }

    const list = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.totData)
      ? body.totData
      : [];

    const rows = list.map(r => {
      const powerUsage = r.powerUsage ?? r.powerUseage; // 철자 혼용 흡수
      const bill = r.bill ?? r.BILL;
      const cntrPwr = r.cntrPwr ?? r.cntr_power;

      return {
        ...r,
        powerUsage: powerUsage != null ? Number(powerUsage) : 0,
        bill: bill != null ? Number(bill) : 0,
        custCnt: r.custCnt != null ? Number(r.custCnt) : 0,
        unitCost: (r.unitCost !== undefined && r.unitCost !== "") ? Number(r.unitCost) : null,
        cntrPwr: cntrPwr != null ? Number(cntrPwr) : 0,
      };
    });

    return rows;
  } catch (e) {
    console.error("KEPCO error:", e?.response?.data || e.message);
    throw e;
  }
}

module.exports = { call };
