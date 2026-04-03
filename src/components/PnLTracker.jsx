import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { storage } from "../lib/storage";
import { fetchDailyReturns, fetchHistoricalPrices, extractTickers, returnsToText } from "../lib/market";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ComposedChart, Area } from "recharts";

const TABS = ["Import","Daily","Dashboard","Attribution","Monthly","Sectors","Viz","Trades","Settings"];
const colF = v => v > 0.001 ? "#22c55e" : v < -0.001 ? "#ef4444" : "#71717a";
const fP = v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const fB = v => (v >= 0 ? "+" : "") + (v * 100).toFixed(0) + " bps";
const Sd = ({ d }) => <span style={{ color: d === "L" ? "#22c55e" : "#ef4444", fontSize: 11, fontWeight: 600 }}>{d === "L" ? "LONG" : "SHORT"}</span>;

const S = {
  bg: { background: "#0f1117", color: "#e4e4e7", minHeight: "100vh", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", padding: 20 },
  card: { background: "#1a1d27", borderRadius: 10, padding: 16, border: "1px solid #2a2d3a" },
  btn: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  btnG: { background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  btnSm: { background: "#2a2d3a", color: "#e4e4e7", border: "none", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 12 },
  btnD: { background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13 },
  inp: { background: "#0f1117", color: "#e4e4e7", border: "1px solid #2a2d3a", borderRadius: 6, padding: "8px 12px", fontSize: 13, width: "100%" },
  ta: { background: "#0f1117", color: "#e4e4e7", border: "1px solid #2a2d3a", borderRadius: 6, padding: 12, fontSize: 13, width: "100%", fontFamily: "monospace", resize: "vertical" },
  th: { textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #2a2d3a", color: "#71717a", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 },
  td: { padding: "8px 12px", borderBottom: "1px solid #1a1d27", fontSize: 13 },
};

function SortTh({ col, dir, setSort }) {
  const toggle = c => setSort(p => ({ col: c, dir: p.col === c && p.dir === "desc" ? "asc" : "desc" }));
  const arrow = c => col === c ? (dir === "desc" ? " ▼" : " ▲") : "";
  return { th: (label, c, right) => <th onClick={() => toggle(c)} style={{ ...S.th, ...(right ? { textAlign: "right" } : {}), cursor: "pointer", userSelect: "none" }}>{label}{arrow(c)}</th> };
}

export default function PnLTracker({ session }) {
  const [tab, setTab] = useState(0);
  const [hist, setHist] = useState([]);
  const [dec, setDec] = useState([]);
  const [bask, setBask] = useState({});
  const [sect, setSect] = useState({});
  const [known, setKnown] = useState([]);
  const [ld, setLd] = useState(true);
  const [paste, setPaste] = useState("");
  const [retPaste, setRetPaste] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [parsed, setParsed] = useState(null);
  const [newNm, setNewNm] = useState([]);
  const [bDef, setBDef] = useState(null);
  const [bInp, setBInp] = useState("");
  const [sEd, setSEd] = useState(null);
  const [sInp, setSInp] = useState("");
  const [msg, setMsg] = useState("");
  const [manRet, setManRet] = useState(null);
  const [failTk, setFailTk] = useState([]);
  const [editBask, setEditBask] = useState(null);
  const [editBaskInp, setEditBaskInp] = useState("");
  const [editDate, setEditDate] = useState(null);
  const [editDateVal, setEditDateVal] = useState("");
  const [editPosDate, setEditPosDate] = useState(null);
  const [editPosPaste, setEditPosPaste] = useState("");
  const [editRetDate, setEditRetDate] = useState(null);
  const [editRetPaste, setEditRetPaste] = useState("");
  const [hasBak, setHasBak] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportJson, setExportJson] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [dashDate, setDashDate] = useState(null);
  const [dailyDate, setDailyDate] = useState(null);
  const [dailyFilter, setDailyFilter] = useState({ ticker: "", side: "All", sector: "All" });
  const [dailySort, setDailySort] = useState({ col: "pnl", dir: "desc" });
  const [attrSort, setAttrSort] = useState({ col: "cumPnl", dir: "desc" });
  const [attrFilter, setAttrFilter] = useState({ ticker: "", side: "All", sector: "All" });
  const [monthFilter, setMonthFilter] = useState({ ticker: "", side: "All", sector: "All" });
  const [monthSort, setMonthSort] = useState({ col: null, dir: "desc" });
  const [secSort, setSecSort] = useState({ col: "cumPnl", dir: "desc" });
  const [vizMetrics, setVizMetrics] = useState(["cumTotal", "battingAvg", "sharpe"]);
  const [vizWindow, setVizWindow] = useState("cumulative");
  const [vizSector, setVizSector] = useState("All");
  const [fetching, setFetching] = useState(false);
  const [tradesTicker, setTradesTicker] = useState(null);
  const [tradesDir, setTradesDir] = useState(null);
  const [tradesData, setTradesData] = useState([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const keys = ["pnl-hist", "pnl-dec", "pnl-bask", "pnl-sect", "pnl-kn"];
        const results = await Promise.all(keys.map(k => storage.get(k).catch(() => null)));
        if (results[0]) setHist(JSON.parse(results[0].value));
        if (results[1]) setDec(JSON.parse(results[1].value));
        if (results[2]) setBask(JSON.parse(results[2].value));
        if (results[3]) setSect(JSON.parse(results[3].value));
        if (results[4]) setKnown(JSON.parse(results[4].value));
        const b = await storage.get("pnl-backup").catch(() => null);
        if (b) setHasBak(true);
      } catch (e) { console.error("Failed to load data:", e); }
      setLd(false);
    })();
  }, []);

  const sv = async (k, v) => { try { await storage.set(k, JSON.stringify(v)); } catch (e) { console.error(`Failed to save ${k}:`, e); } };

  const parsePos = t => {
    const entries = [];
    for (const line of t.trim().split("\n").filter(l => l.trim())) {
      const raw = line.replace(/\t+/g, " ").trim();
      const stripped = raw.replace(/^\d+\s+/, "");
      for (const c of [raw, stripped]) {
        if (!c || /^-+$/.test(c) || /^(LONGS|SHORTS|Ticker|Size)\b/i.test(c)) continue;
        let nm = null, dr = null, vl = null;
        let m = c.match(/^(.+?)\s+[-–]\s*(L|S)\s+.*?(\(?\d+\.?\d*\)?)\s*%?\s*$/i);
        if (m) { nm = m[1].trim().toUpperCase(); dr = m[2].toUpperCase(); vl = parseFloat(m[3].replace(/[()]/g, "")); }
        if (!nm) { m = c.match(/^(\S+)\s+\*\*Short Swap\*\*\s+.*?(\(?\d+\.?\d*\)?)\s*%?\s*$/i); if (m) { nm = m[1].trim().toUpperCase(); dr = "S"; vl = parseFloat(m[2].replace(/[()]/g, "")); } }
        if (!nm) { m = c.match(/^(\S+)\s+\*\*Long Swap\*\*\s+.*?(\(?\d+\.?\d*\)?)\s*%?\s*$/i); if (m) { nm = m[1].trim().toUpperCase(); dr = "L"; vl = parseFloat(m[2].replace(/[()]/g, "")); } }
        if (nm && dr && vl != null && !isNaN(vl)) { entries.push({ name: nm, dir: dr, size: vl }); break; }
      }
    }
    return entries;
  };
  const parseRet = t => {
    const r = {};
    if (!t.trim()) return r;
    for (const line of t.trim().split("\n").filter(l => l.trim())) {
      const c = line.replace(/\t+/g, " ").trim();
      let m = c.match(/^(\S+)\s+\((\d+\.?\d*)%?\)\s*$/);
      if (m) { r[m[1].toUpperCase()] = -parseFloat(m[2]) / 100; continue; }
      m = c.match(/^(\S+)\s+(-?\d+\.?\d*)\s*%?\s*$/);
      if (m) { r[m[1].toUpperCase()] = parseFloat(m[2]) / 100; }
    }
    return r;
  };
  const expand = entries => {
    const exp = [];
    for (const e of entries) {
      const key = e.name || e.ticker;
      if (bask[key]) for (const c of bask[key]) exp.push({ ticker: c.ticker, dir: e.dir, size: +(e.size * c.weight).toFixed(4) });
      else exp.push({ ticker: key, dir: e.dir, size: e.size });
    }
    const agg = {};
    for (const e of exp) { const k = `${e.ticker}-${e.dir}`; agg[k] = agg[k] || { ...e, size: 0 }; agg[k].size = +(agg[k].size + e.size).toFixed(4); }
    return Object.values(agg);
  };
  const decompCalc = (prior, cur, ret) => {
    const pm = {}, cm = {};
    prior.forEach(e => { pm[`${e.ticker}-${e.dir}`] = e.size; });
    cur.forEach(e => { cm[`${e.ticker}-${e.dir}`] = e.size; });
    for (const k of Object.keys(pm)) if (!(k in cm)) cm[k] = 0;
    const allK = [...new Set([...Object.keys(pm), ...Object.keys(cm)])];
    return allK.map(k => {
      const tk = k.replace(/-[LS]$/, ""), dir = k.endsWith("-L") ? "L" : "S";
      const ps = pm[k] || 0, cs = cm[k] || 0, r = ret[tk] ?? 0;
      const pnl = dir === "L" ? ps * r : ps * (-r);
      const org = dir === "L" ? ps * (1 + r) : ps * (1 - r);
      return { ticker: tk, dir, size: cs, priorSize: ps, dailyReturn: r, pnl: +pnl.toFixed(4), trading: +(cs - org).toFixed(4) };
    });
  };

  const doParse = () => {
    const e = parsePos(paste);
    if (!e.length) { setMsg("No valid entries found."); return; }
    const u = [...new Set(e.map(x => x.name).filter(n => !known.includes(n) && !bask[n]))];
    setParsed(e); setNewNm(u); setMsg(""); setManRet(null); setFailTk([]);
  };
  const markTk = n => { const nk = [...known, n]; setKnown(nk); sv("pnl-kn", nk); setNewNm(p => p.filter(x => x !== n)); };
  const skipBk = n => { const nk = [...known, n]; setKnown(nk); sv("pnl-kn", nk); setParsed(p => p.map(e => e.name === n ? { ...e, size: 0 } : e)); setNewNm(p => p.filter(x => x !== n)); };
  const startBk = n => { setBDef(n); setBInp(""); setNewNm(p => p.filter(x => x !== n)); };
  const saveBaskH = (name, text) => {
    const cs = [];
    for (const l of text.trim().split("\n").filter(l => l.trim())) { const m = l.trim().match(/^(\S+)\s+(\d+\.?\d*)%?\s*$/); if (m) cs.push({ ticker: m[1].toUpperCase(), weight: parseFloat(m[2]) / 100 }); }
    if (!cs.length) { setMsg("Enter: TICKER WEIGHT% per line"); return false; }
    const tot = cs.reduce((s, c) => s + c.weight, 0);
    if (Math.abs(tot - 1) > 0.02) { setMsg(`Weights ${(tot * 100).toFixed(1)}%, need ~100%`); return false; }
    const nb = { ...bask, [name]: cs }; setBask(nb); sv("pnl-bask", nb);
    const nk = [...new Set([...known, ...cs.map(c => c.ticker)])]; setKnown(nk); sv("pnl-kn", nk);
    return true;
  };
  const saveBk = () => { if (bDef && saveBaskH(bDef, bInp)) { setBDef(null); setMsg(""); } };
  const saveEditBask = () => { if (editBask && saveBaskH(editBask, editBaskInp)) { setEditBask(null); setEditBaskInp(""); setMsg(`Basket updated!`); } };

  const commit = async (override) => {
    if (!parsed || newNm.length > 0 || bDef) return;
    const entries = expand(parsed);
    const nh = [...hist.filter(h => h.date !== date), { date, entries }].sort((a, b) => a.date.localeCompare(b.date));
    setHist(nh); sv("pnl-hist", nh);
    const idx = nh.findIndex(h => h.date === date);
    if (idx === 0) { setPaste(""); setRetPaste(""); setParsed(null); setMsg("Baseline imported."); setTab(2); return; }
    const prior = nh[idx - 1];
    let ret = override || parseRet(retPaste);
    const curTk = new Set(entries.map(e => e.ticker));
    prior.entries.forEach(e => { if (!curTk.has(e.ticker) && ret[e.ticker] == null) ret[e.ticker] = 0; });
    const allT = [...new Set([...prior.entries.map(e => e.ticker), ...entries.map(e => e.ticker)])];
    const fail = allT.filter(t => ret[t] == null);
    if (fail.length > 0 && !override) { setFailTk(fail); const mr = {}; fail.forEach(t => { mr[t] = ""; }); setManRet(mr); setMsg(`${fail.length} ticker(s) missing returns.`); return; }
    const de = decompCalc(prior.entries, entries, ret);
    const nd = [...dec.filter(d => d.date !== date), { date, priorDate: prior.date, entries: de }].sort((a, b) => a.date.localeCompare(b.date));
    setDec(nd); sv("pnl-dec", nd);
    setPaste(""); setRetPaste(""); setParsed(null); setManRet(null); setFailTk([]); setMsg("Imported with P&L decomposition!"); setTab(2);
  };
  const submitMan = () => {
    if (!manRet) return;
    const merged = { ...parseRet(retPaste) };
    for (const [t, v] of Object.entries(manRet)) {
      const raw = v.trim(); let num;
      const pm = raw.match(/^\((\d+\.?\d*)%?\)$/);
      if (pm) num = -Math.abs(parseFloat(pm[1])); else num = parseFloat(raw);
      if (isNaN(num)) { setMsg(`Invalid return for ${t}`); return; }
      merged[t] = num / 100;
    }
    const allTk = [...new Set(expand(parsed).map(e => e.ticker))];
    allTk.forEach(t => { if (merged[t] == null) merged[t] = 0; });
    commit(merged);
  };

  const handleAutoFetch = async () => {
    setFetching(true);
    try {
      const priorH = hist[hist.length - 1];
      if (!priorH) { setMsg("No prior day to fetch returns for."); setFetching(false); return; }
      const tickers = extractTickers(priorH.entries);
      const returns = await fetchDailyReturns(tickers, date);
      const text = returnsToText(returns);
      setRetPaste(text);
      const count = Object.keys(returns).length;
      setMsg(`Fetched returns for ${count}/${tickers.length} tickers.`);
    } catch (e) {
      setMsg("Failed to fetch returns: " + e.message);
    }
    setFetching(false);
  };

  const fetchTradesData = async (ticker, dir) => {
    if (!ticker || !dir) return;
    setTradesLoading(true);
    try {
      const year = new Date().getFullYear();
      const from = `${year}-01-01`;
      const to = new Date().toISOString().split("T")[0];
      const prices = await fetchHistoricalPrices(ticker, from, to);
      const posMap = {};
      hist.forEach(h => {
        const entry = h.entries.find(e => e.ticker === ticker && e.dir === dir);
        posMap[h.date] = entry ? entry.size : 0;
      });
      const merged = prices.map(p => ({ date: p.date, price: p.price, size: posMap[p.date] ?? null }));
      const histDates = hist.map(h => h.date).sort();
      const firstHist = histDates.length > 0 ? histDates[0] : null;
      let lastKnown = null;
      for (let i = 0; i < merged.length; i++) {
        if (merged[i].size != null) { lastKnown = merged[i].size; }
        else if (firstHist && merged[i].date > firstHist && lastKnown != null) { merged[i].size = lastKnown; }
      }
      setTradesData(merged);
    } catch (e) {
      console.error("Failed to fetch trades data:", e);
      setTradesData([]);
    }
    setTradesLoading(false);
  };

  const saveEditDate = old => {
    if (!editDateVal || editDateVal === old) { setEditDate(null); return; }
    if (hist.find(h => h.date === editDateVal)) { setMsg(`${editDateVal} exists.`); return; }
    const nH = hist.map(h => h.date === old ? { ...h, date: editDateVal } : h).sort((a, b) => a.date.localeCompare(b.date));
    setHist(nH); sv("pnl-hist", nH);
    const nD = dec.map(d => ({ ...d, date: d.date === old ? editDateVal : d.date, priorDate: d.priorDate === old ? editDateVal : d.priorDate })).sort((a, b) => a.date.localeCompare(b.date));
    setDec(nD); sv("pnl-dec", nD);
    setEditDate(null); setMsg(`Date → ${editDateVal}`);
  };
  const saveEditPos = () => {
    if (!editPosDate) return;
    const entries = expand(parsePos(editPosPaste));
    if (!entries.length) { setMsg("No valid entries."); return; }
    const nH = hist.map(h => h.date === editPosDate ? { ...h, entries } : h); setHist(nH); sv("pnl-hist", nH);
    const dc = dec.find(d => d.date === editPosDate);
    if (dc) { const pr = nH.find(h => h.date === dc.priorDate); if (pr) { const rm = {}; dc.entries.forEach(e => { rm[e.ticker] = e.dailyReturn; }); const de = decompCalc(pr.entries, entries, rm); const nD = dec.map(d => d.date === editPosDate ? { ...d, entries: de } : d); setDec(nD); sv("pnl-dec", nD); } }
    const nx = dec.find(d => d.priorDate === editPosDate);
    if (nx) { const nxH = nH.find(h => h.date === nx.date); if (nxH) { const rm = {}; nx.entries.forEach(e => { rm[e.ticker] = e.dailyReturn; }); const de = decompCalc(entries, nxH.entries, rm); const nD = dec.map(d => d.date === nx.date ? { ...d, entries: de } : d); setDec(nD); sv("pnl-dec", nD); } }
    setEditPosDate(null); setEditPosPaste(""); setMsg(`Positions updated!`);
  };
  const saveEditRet = () => {
    if (!editRetDate) return;
    const dc = dec.find(d => d.date === editRetDate); if (!dc) return;
    const ret = parseRet(editRetPaste);
    const hT = hist.find(h => h.date === editRetDate), hP = hist.find(h => h.date === dc.priorDate);
    if (!hT || !hP) { setMsg("Missing data."); return; }
    const de = decompCalc(hP.entries, hT.entries, ret);
    const nD = dec.map(d => d.date === editRetDate ? { ...d, entries: de } : d); setDec(nD); sv("pnl-dec", nD);
    setEditRetDate(null); setEditRetPaste(""); setMsg(`Returns updated!`);
  };
  const clearAll = async () => {
    try { await storage.set("pnl-backup", JSON.stringify({ hist, dec, bask, sect, known })); setHasBak(true); } catch {}
    setHist([]); setDec([]); setBask({}); setSect({}); setKnown([]);
    await Promise.all(["pnl-hist","pnl-dec","pnl-bask","pnl-sect","pnl-kn"].map(k => storage.delete(k).catch(() => null)));
    setConfirmClear(false); setMsg("Cleared. Restore below.");
  };
  const restore = async () => {
    try { const b = await storage.get("pnl-backup"); if (!b) { setMsg("No backup."); return; }
      const d = JSON.parse(b.value);
      if (d.hist) { setHist(d.hist); sv("pnl-hist", d.hist); } if (d.dec) { setDec(d.dec); sv("pnl-dec", d.dec); }
      if (d.bask) { setBask(d.bask); sv("pnl-bask", d.bask); } if (d.sect) { setSect(d.sect); sv("pnl-sect", d.sect); }
      if (d.known) { setKnown(d.known); sv("pnl-kn", d.known); } setMsg("Restored!");
    } catch (e) { setMsg("Failed: " + e.message); }
  };
  const saveSec = t => { if (!sInp.trim()) return; const ns = { ...sect, [t]: sInp.trim() }; setSect(ns); sv("pnl-sect", ns); setSEd(null); setSInp(""); };

  const doExport = () => { const data = JSON.stringify({ hist, dec, bask, sect, known }, null, 2); setExportJson(data); setShowExport(true); };
  const doImport = async () => {
    try {
      const d = JSON.parse(importJson);
      if (!d.hist || !d.dec) { setImportMsg("Invalid format — missing hist or dec."); return; }
      if (d.hist) { setHist(d.hist); sv("pnl-hist", d.hist); } if (d.dec) { setDec(d.dec); sv("pnl-dec", d.dec); }
      if (d.bask) { setBask(d.bask); sv("pnl-bask", d.bask); } if (d.sect) { setSect(d.sect); sv("pnl-sect", d.sect); }
      if (d.known) { setKnown(d.known); sv("pnl-kn", d.known); }
      setImportJson(""); setImportMsg(""); setMsg("Data imported successfully!"); setTab(2);
    } catch (e) { setImportMsg("Parse error: " + e.message); }
  };

  const latH = hist.length > 0 ? hist[hist.length - 1] : null;
  const latD = dec.length > 0 ? dec[dec.length - 1] : null;

  const cumPnl = useMemo(() => {
    let ct = 0, cl = 0, cs = 0;
    return dec.map(d => {
      const dT = d.entries.reduce((s, e) => s + e.pnl, 0), dL = d.entries.filter(e => e.dir === "L").reduce((s, e) => s + e.pnl, 0), dS = d.entries.filter(e => e.dir === "S").reduce((s, e) => s + e.pnl, 0);
      ct += dT; cl += dL; cs += dS;
      return { date: d.date, cumTotal: +ct.toFixed(2), cumLong: +cl.toFixed(2), cumShort: +cs.toFixed(2), dTotal: +dT.toFixed(2) };
    });
  }, [dec]);

  const selDate = dashDate || (latH ? latH.date : null);
  const selH = useMemo(() => hist.find(h => h.date === selDate) || null, [hist, selDate]);
  const selD = useMemo(() => dec.find(d => d.date === selDate) || null, [dec, selDate]);
  const selExp = useMemo(() => { if (!selH) return null; const e = selH.entries, l = e.filter(x => x.dir === "L").reduce((s, x) => s + x.size, 0), sh = e.filter(x => x.dir === "S").reduce((s, x) => s + x.size, 0); return { long: l, short: sh, net: l - sh, gross: l + sh, count: e.length }; }, [selH]);
  const selLSt = useMemo(() => { if (!selD) return null; const e = selD.entries; return { pnl: e.reduce((s, x) => s + x.pnl, 0), lP: e.filter(x => x.dir === "L").reduce((s, x) => s + x.pnl, 0), sP: e.filter(x => x.dir === "S").reduce((s, x) => s + x.pnl, 0), tr: e.reduce((s, x) => s + x.trading, 0), best: e.reduce((b, x) => x.pnl > b.pnl ? x : b, { pnl: -Infinity, ticker: "-" }), worst: e.reduce((w, x) => x.pnl < w.pnl ? x : w, { pnl: Infinity, ticker: "-" }), date: selD.date }; }, [selD]);
  const selCum = useMemo(() => { if (!selDate || !dec.length) return null; const fd = dec.filter(d => d.date <= selDate); if (!fd.length) return null; let ct = 0, cl = 0, cs = 0, ctr = 0; const tm = {}; fd.forEach(d => d.entries.forEach(e => { ct += e.pnl; ctr += e.trading; if (e.dir === "L") cl += e.pnl; else cs += e.pnl; const k = e.ticker + "-" + e.dir; if (!tm[k]) tm[k] = { ticker: e.ticker, cum: 0 }; tm[k].cum += e.pnl; })); const tks = Object.values(tm); return { total: +ct.toFixed(4), long: +cl.toFixed(4), short: +cs.toFixed(4), trading: +ctr.toFixed(4), best: tks.reduce((b, x) => x.cum > b.cum ? x : b, { cum: -Infinity, ticker: "-" }), worst: tks.reduce((w, x) => x.cum < w.cum ? x : w, { cum: Infinity, ticker: "-" }), days: fd.length }; }, [dec, selDate]);
  const selCumPnl = useMemo(() => selDate ? cumPnl.filter(d => d.date <= selDate) : cumPnl, [cumPnl, selDate]);
  const selSecCum = useMemo(() => { if (!selDate || !dec.length) return []; const m = {}; dec.filter(d => d.date <= selDate).forEach(d => d.entries.forEach(e => { const s = sect[e.ticker] || "Unassigned"; if (!m[s]) m[s] = { sector: s, pnl: 0, tr: 0 }; m[s].pnl += e.pnl; m[s].tr += e.trading; })); return Object.values(m).sort((a, b) => b.pnl - a.pnl); }, [dec, selDate, sect]);

  const perf = useMemo(() => {
    if (!selDate || !dec.length) return null;
    const fd = dec.filter(d => d.date <= selDate); if (!fd.length) return null;
    const dp = fd.map(d => d.entries.reduce((s, e) => s + e.pnl, 0));
    const up = dp.filter(p => p > 0.0001).length, ba = dp.length > 0 ? up / dp.length : 0;
    const mn = dp.reduce((s, v) => s + v, 0) / dp.length;
    const vr = dp.reduce((s, v) => s + (v - mn) ** 2, 0) / dp.length, vol = Math.sqrt(vr);
    const sh = vol > 0.0001 ? (mn / vol) * Math.sqrt(252) : null;
    const ups = dp.filter(p => p > 0.0001), dns = dp.filter(p => p < -0.0001);
    const aw = ups.length > 0 ? ups.reduce((s, v) => s + v, 0) / ups.length : 0;
    const al = dns.length > 0 ? Math.abs(dns.reduce((s, v) => s + v, 0) / dns.length) : 0;
    const sl = al > 0.0001 ? aw / al : null;
    const tm = {}; fd.forEach(d => d.entries.forEach(e => { const k = e.ticker + "-" + e.dir; if (!tm[k]) tm[k] = { dir: e.dir, cum: 0 }; tm[k].cum += e.pnl; }));
    const ap = Object.values(tm), lp = ap.filter(t => t.dir === "L"), sp = ap.filter(t => t.dir === "S");
    return { ba, vol, sh, sl, up, td: dp.length, wrA: ap.length > 0 ? ap.filter(t => t.cum > 0.0001).length / ap.length : 0, wA: ap.filter(t => t.cum > 0.0001).length, tA: ap.length, wrL: lp.length > 0 ? lp.filter(t => t.cum > 0.0001).length / lp.length : 0, wL: lp.filter(t => t.cum > 0.0001).length, tL: lp.length, wrS: sp.length > 0 ? sp.filter(t => t.cum > 0.0001).length / sp.length : 0, wS: sp.filter(t => t.cum > 0.0001).length, tS: sp.length };
  }, [dec, selDate]);

  const cumTk = useMemo(() => {
    const m = {};
    dec.forEach(d => d.entries.forEach(e => { const k = `${e.ticker}-${e.dir}`; if (!m[k]) m[k] = { ticker: e.ticker, dir: e.dir, cumPnl: 0, cumTr: 0, lastPnl: 0, sizes: [] }; m[k].cumPnl = +(m[k].cumPnl + e.pnl).toFixed(4); m[k].cumTr = +(m[k].cumTr + e.trading).toFixed(4); m[k].sizes.push((e.priorSize + e.size) / 2); }));
    if (latD) latD.entries.forEach(e => { const k = `${e.ticker}-${e.dir}`; if (m[k]) m[k].lastPnl = e.pnl; });
    return Object.values(m).map(t => { const aw = t.sizes.length > 0 ? t.sizes.reduce((s, v) => s + v, 0) / t.sizes.length : 0; return { ...t, avgWt: +aw.toFixed(4), roic: aw > 0.001 ? t.cumPnl / aw : null }; }).sort((a, b) => b.cumPnl - a.cumPnl);
  }, [dec, latD]);

  const months = useMemo(() => [...new Set(dec.map(d => d.date.slice(0, 7)))].sort(), [dec]);
  const monthlyTk = useMemo(() => {
    const m = {};
    dec.forEach(d => { const mo = d.date.slice(0, 7); d.entries.forEach(e => { const k = `${e.ticker}-${e.dir}`; if (!m[k]) m[k] = { ticker: e.ticker, dir: e.dir, months: {} }; if (!m[k].months[mo]) m[k].months[mo] = 0; m[k].months[mo] = +(m[k].months[mo] + e.pnl).toFixed(4); }); });
    return Object.values(m);
  }, [dec]);

  const secAn = useMemo(() => {
    if (!dec.length) return [];
    const sd = {};
    dec.forEach(d => { const dbs = {}; d.entries.forEach(e => { const s = sect[e.ticker] || "Unassigned"; if (!sd[s]) sd[s] = { sector: s, cumPnl: 0, dailyPnls: [], sizes: [], positions: {}, longPnl: 0, shortPnl: 0 }; sd[s].cumPnl += e.pnl; if (e.dir === "L") sd[s].longPnl += e.pnl; else sd[s].shortPnl += e.pnl; const k = e.ticker + "-" + e.dir; if (!sd[s].positions[k]) sd[s].positions[k] = { ticker: e.ticker, dir: e.dir, cum: 0 }; sd[s].positions[k].cum += e.pnl; if (!dbs[s]) dbs[s] = 0; dbs[s] += e.pnl; }); Object.keys(dbs).forEach(s => sd[s].dailyPnls.push(dbs[s])); Object.keys(sd).forEach(s => { const ds = d.entries.filter(e => (sect[e.ticker] || "Unassigned") === s).reduce((x, e) => x + (e.priorSize + e.size) / 2, 0); if (d.entries.some(e => (sect[e.ticker] || "Unassigned") === s)) sd[s].sizes.push(ds); }); });
    return Object.values(sd).map(s => {
      const dp = s.dailyPnls, up = dp.filter(p => p > 0.0001).length, ba = dp.length > 0 ? up / dp.length : 0;
      const mn = dp.length > 0 ? dp.reduce((a, v) => a + v, 0) / dp.length : 0, vr = dp.length > 0 ? dp.reduce((a, v) => a + (v - mn) ** 2, 0) / dp.length : 0, vol = Math.sqrt(vr);
      const sh = vol > 0.0001 ? (mn / vol) * Math.sqrt(252) : null;
      const ups = dp.filter(p => p > 0.0001), dns = dp.filter(p => p < -0.0001);
      const aw2 = ups.length > 0 ? ups.reduce((a, v) => a + v, 0) / ups.length : 0, al2 = dns.length > 0 ? Math.abs(dns.reduce((a, v) => a + v, 0) / dns.length) : 0;
      const sl = al2 > 0.0001 ? aw2 / al2 : null;
      const aw = s.sizes.length > 0 ? s.sizes.reduce((a, v) => a + v, 0) / s.sizes.length : 0, roic = aw > 0.001 ? s.cumPnl / aw : null;
      const pos = Object.values(s.positions), wA = pos.filter(p => p.cum > 0.0001).length, wL = pos.filter(p => p.dir === "L" && p.cum > 0.0001).length, wS = pos.filter(p => p.dir === "S" && p.cum > 0.0001).length, tL = pos.filter(p => p.dir === "L").length, tS = pos.filter(p => p.dir === "S").length;
      return { sector: s.sector, cumPnl: +s.cumPnl.toFixed(4), longPnl: +s.longPnl.toFixed(4), shortPnl: +s.shortPnl.toFixed(4), avgWt: +aw.toFixed(4), roic, battingAvg: ba, vol, sharpe: sh, slugging: sl, days: dp.length, upDays: up, totalPos: pos.length, winAll: wA, winLong: wL, winShort: wS, totalLong: tL, totalShort: tS };
    }).sort((a, b) => b.cumPnl - a.cumPnl);
  }, [dec, sect]);

  const VIZ_METRICS = [
    { key: "cumTotal", label: "Cum P&L (%)", color: "#6366f1", group: "P&L" },
    { key: "cumLong", label: "Cum Long (%)", color: "#22c55e", group: "P&L" },
    { key: "cumShort", label: "Cum Short (%)", color: "#ef4444", group: "P&L" },
    { key: "dailyPnl", label: "Daily P&L (bps)", color: "#8b5cf6", group: "P&L" },
    { key: "battingAvg", label: "Batting (%)", color: "#f59e0b", group: "Perf" },
    { key: "sharpe", label: "Sharpe", color: "#06b6d4", group: "Perf" },
    { key: "slugging", label: "Slugging (x)", color: "#ec4899", group: "Perf" },
    { key: "vol", label: "Vol (bps)", color: "#f97316", group: "Risk" },
    { key: "maxDD", label: "Max DD (bps)", color: "#dc2626", group: "Risk" },
    { key: "wrAll", label: "Win All (%)", color: "#14b8a6", group: "Win" },
    { key: "wrLong", label: "Win Long (%)", color: "#22c55e", group: "Win" },
    { key: "wrShort", label: "Win Short (%)", color: "#ef4444", group: "Win" },
    { key: "netExp", label: "Net Exp (%)", color: "#a78bfa", group: "Exp" },
    { key: "grossExp", label: "Gross Exp (%)", color: "#fbbf24", group: "Exp" },
  ];
  const vizGroups = [...new Set(VIZ_METRICS.map(m => m.group))];
  const ROLLING_OPTIONS = [{ label: "Cumulative", value: "cumulative" }, { label: "5d", value: 5 }, { label: "10d", value: 10 }, { label: "20d", value: 20 }, { label: "60d", value: 60 }];

  const calcMetrics = (allDP, tkCumSnap) => {
    const dp = allDP, upD = dp.filter(p => p > 0.0001).length;
    const ba = dp.length > 0 ? +(upD / dp.length * 100).toFixed(1) : 0;
    const mn = dp.length > 0 ? dp.reduce((s, v) => s + v, 0) / dp.length : 0;
    const vr = dp.length > 0 ? dp.reduce((s, v) => s + (v - mn) ** 2, 0) / dp.length : 0;
    const vol = +(Math.sqrt(vr) * 100).toFixed(2);
    const sharpe = vr > 0.000001 ? +((mn / Math.sqrt(vr)) * Math.sqrt(252)).toFixed(2) : 0;
    const ups = dp.filter(p => p > 0.0001), dns = dp.filter(p => p < -0.0001);
    const avgW = ups.length > 0 ? ups.reduce((s, v) => s + v, 0) / ups.length : 0;
    const avgL = dns.length > 0 ? Math.abs(dns.reduce((s, v) => s + v, 0) / dns.length) : 0;
    const slugging = avgL > 0.0001 ? +(avgW / avgL).toFixed(2) : 0;
    const ap = Object.values(tkCumSnap), lp = ap.filter(t => t.dir === "L"), sp = ap.filter(t => t.dir === "S");
    const wrAll = ap.length > 0 ? +(ap.filter(t => t.cum > 0.0001).length / ap.length * 100).toFixed(1) : 0;
    const wrLong = lp.length > 0 ? +(lp.filter(t => t.cum > 0.0001).length / lp.length * 100).toFixed(1) : 0;
    const wrShort = sp.length > 0 ? +(sp.filter(t => t.cum > 0.0001).length / sp.length * 100).toFixed(1) : 0;
    return { battingAvg: ba, vol, sharpe, slugging, wrAll, wrLong, wrShort };
  };

  const kpiSeries = useMemo(() => {
    if (!dec.length) return [];
    const isRolling = vizWindow !== "cumulative"; const W = isRolling ? vizWindow : null;
    let ct = 0, cl = 0, cs = 0; const allDP = []; const tkCumAll = {};
    return dec.map((d, di) => {
      const filtE = e => vizSector === "All" || (sect[e.ticker] || "Unassigned") === vizSector;
      const dp = d.entries.filter(filtE).reduce((s, e) => s + e.pnl, 0);
      const dL = d.entries.filter(e => filtE(e) && e.dir === "L").reduce((s, e) => s + e.pnl, 0);
      const dS = d.entries.filter(e => filtE(e) && e.dir === "S").reduce((s, e) => s + e.pnl, 0);
      ct += dp; cl += dL; cs += dS; allDP.push(dp);
      d.entries.filter(filtE).forEach(e => { const k = e.ticker + "-" + e.dir; if (!tkCumAll[k]) tkCumAll[k] = { dir: e.dir, cum: 0 }; tkCumAll[k].cum += e.pnl; });
      const slice = isRolling ? allDP.slice(Math.max(0, di + 1 - W)) : allDP;
      let tkSnap = tkCumAll;
      if (isRolling) { const winDec = dec.slice(Math.max(0, di + 1 - W), di + 1); const snap = {}; winDec.forEach(wd => wd.entries.filter(filtE).forEach(e => { const k = e.ticker + "-" + e.dir; if (!snap[k]) snap[k] = { dir: e.dir, cum: 0 }; snap[k].cum += e.pnl; })); tkSnap = snap; }
      const metrics = calcMetrics(slice, tkSnap);
      const h = hist.find(x => x.date === d.date); let netExp = 0, grossExp = 0;
      if (h) { const lg = h.entries.filter(e => e.dir === "L").reduce((s, e) => s + e.size, 0); const sh2 = h.entries.filter(e => e.dir === "S").reduce((s, e) => s + e.size, 0); netExp = +(lg - sh2).toFixed(1); grossExp = +(lg + sh2).toFixed(1); }
      let peak = -Infinity, maxDD = 0, cum2 = 0;
      for (let i = 0; i <= di; i++) { cum2 += allDP[i]; if (cum2 > peak) peak = cum2; if (peak - cum2 > maxDD) maxDD = peak - cum2; }
      return { date: d.date, cumTotal: +ct.toFixed(2), cumLong: +cl.toFixed(2), cumShort: +cs.toFixed(2), dailyPnl: +(dp * 100).toFixed(1), netExp, grossExp, maxDD: +(maxDD * 100).toFixed(1), ...metrics };
    });
  }, [dec, hist, vizWindow, vizSector, sect]);

  const retCount = Object.keys(parseRet(retPaste)).length;
  const hasPrior = (() => { const nh = [...hist.filter(h => h.date !== date), ...(parsed ? [{ date }] : [])].sort((a, b) => a.date.localeCompare(b.date)); return nh.findIndex(h => h.date === date) > 0; })();

  if (ld) return <div style={{ ...S.bg, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>Loading...</div>;

  const SecCell = ({ ticker }) => sEd === ticker ? <div style={{ display: "flex", gap: 4, alignItems: "center" }}><input value={sInp} onChange={e => setSInp(e.target.value)} onKeyDown={e => e.key === "Enter" && saveSec(ticker)} placeholder="Sector" style={{ ...S.inp, width: 110, padding: "3px 8px", fontSize: 12 }} autoFocus /><button onClick={() => saveSec(ticker)} style={{ ...S.btnSm, background: "#22c55e", fontSize: 11 }}>OK</button><button onClick={() => setSEd(null)} style={{ ...S.btnSm, fontSize: 11 }}>×</button></div> : <span onClick={() => { setSEd(ticker); setSInp(sect[ticker] || ""); }} style={{ cursor: "pointer", color: sect[ticker] ? "#e4e4e7" : "#71717a", borderBottom: "1px dashed #2a2d3a" }}>{sect[ticker] || "Assign"}</span>;
  const SecTbl = ({ data, title }) => data.length > 0 && data.some(s => s.sector !== "Unassigned") ? <div style={{ ...S.card, marginBottom: 20 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{title}</h3><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={S.th}>Sector</th><th style={{ ...S.th, textAlign: "right" }}>P&L</th><th style={{ ...S.th, textAlign: "right" }}>Trading</th></tr></thead><tbody>{data.map((s, i) => <tr key={i}><td style={S.td}>{s.sector}</td><td style={{ ...S.td, textAlign: "right", color: colF(s.pnl), fontWeight: 600 }}>{fB(s.pnl)}</td><td style={{ ...S.td, textAlign: "right", color: colF(s.tr), fontWeight: 600 }}>{fB(s.tr)}</td></tr>)}<tr style={{ borderTop: "2px solid #2a2d3a" }}><td style={{ ...S.td, fontWeight: 700 }}>TOTAL</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: colF(data.reduce((s, x) => s + x.pnl, 0)) }}>{fB(data.reduce((s, x) => s + x.pnl, 0))}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: colF(data.reduce((s, x) => s + x.tr, 0)) }}>{fB(data.reduce((s, x) => s + x.tr, 0))}</td></tr></tbody></table></div> : null;
  const Cards = ({ items }) => <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>{items.map((c, i) => <div key={i} style={S.card}><div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>{c.l}</div><div style={{ fontSize: 18, fontWeight: 700, color: c.w ? "#e4e4e7" : c.n ? "#e4e4e7" : colF(c.v) }}>{c.n ? c.v : c.bps ? fB(c.v) : c.v.toFixed(1) + "%"}</div>{c.bps && <div style={{ fontSize: 11, color: "#71717a" }}>{fP(c.v)}</div>}</div>)}</div>;
  const ChartLine = ({ data, keys, h = 260, fmt }) => <ResponsiveContainer width="100%" height={h}><LineChart data={data}><CartesianGrid stroke="#2a2d3a" strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} /><YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={fmt || (v => v + "%")} /><Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 6, fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} />{keys.map(k => <Line key={k.key} type="monotone" dataKey={k.key} stroke={k.color} strokeWidth={k.w || 1.5} dot={false} name={k.label} />)}</LineChart></ResponsiveContainer>;

  return (
    <div style={S.bg}><div style={{ maxWidth: 1060, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>P&L Tracker</h1>
          <p style={{ color: "#71717a", fontSize: 13, marginBottom: 20 }}>Position sizing & P&L decomposition</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#71717a" }}>{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()} style={{ ...S.btnSm, fontSize: 12 }}>Sign Out</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: "1px solid #2a2d3a", flexWrap: "wrap" }}>{TABS.map((t, i) => <button key={t} onClick={() => setTab(i)} style={{ background: "none", border: "none", color: tab === i ? "#6366f1" : "#71717a", fontSize: 13, fontWeight: tab === i ? 600 : 400, padding: "8px 12px", cursor: "pointer", borderBottom: tab === i ? "2px solid #6366f1" : "2px solid transparent", marginBottom: -1 }}>{t}</button>)}</div>
      {msg && <div style={{ ...S.card, marginBottom: 16, borderColor: /success|Baseline|decomposition|Cleared|Restored|updated|imported|Fetched/i.test(msg) ? "#22c55e" : "#f59e0b", fontSize: 13 }}>{msg}</div>}

      {/* IMPORT */}
      {tab === 0 && <div>
        <div style={{ display: "grid", gridTemplateColumns: hasPrior ? "1fr 1fr" : "1fr", gap: 16, marginBottom: 16 }}>
          <div style={S.card}><div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}><label style={{ fontSize: 13, color: "#71717a" }}>Date:</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...S.inp, width: 180 }} /></div><label style={{ fontSize: 12, fontWeight: 600, color: "#a1a1aa", marginBottom: 6, display: "block" }}>Positions</label><textarea rows={12} placeholder={"Paste positions...\n\nWDC -L  6.96\nSMH -S  (3.99)\nDELL **Short Swap**  (2.50)\n7220.TYS **Long Swap**  0.57"} value={paste} onChange={e => setPaste(e.target.value)} style={S.ta} /></div>
          {hasPrior && <div style={S.card}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, marginTop: 40 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#a1a1aa" }}>Daily Returns</label>
              {hist.length > 0 && <button onClick={handleAutoFetch} disabled={fetching} style={{ ...S.btnSm, background: "#6366f1", fontSize: 11, opacity: fetching ? 0.5 : 1 }}>{fetching ? "Fetching..." : "Auto-Fetch Returns"}</button>}
            </div>
            <textarea rows={12} placeholder={"TICKER  RETURN%\n\nWDC  2.5\nNVDA  -1.3\nSMH  (1.2%)"} value={retPaste} onChange={e => setRetPaste(e.target.value)} style={S.ta} />
            {retPaste.trim() && <div style={{ marginTop: 8, fontSize: 12, color: retCount > 0 ? "#22c55e" : "#71717a" }}>{retCount} return(s)</div>}
          </div>}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}><button onClick={doParse} style={S.btn}>Parse</button>{parsed && newNm.length === 0 && !bDef && !manRet && <button onClick={() => commit()} style={S.btnG}>{hasPrior ? "Commit & Decompose" : "Import Baseline"}</button>}</div>
        {parsed && <div style={{ ...S.card, marginBottom: 16 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Parsed ({parsed.length})</h3><div style={{ maxHeight: 300, overflowY: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={S.th}>Name</th><th style={S.th}>Side</th><th style={{ ...S.th, textAlign: "right" }}>Size</th><th style={S.th}>Type</th></tr></thead><tbody>{parsed.map((e, i) => <tr key={i}><td style={S.td}>{e.name}</td><td style={S.td}><Sd d={e.dir} /></td><td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{e.size.toFixed(2)}%</td><td style={S.td}>{bask[e.name] ? "Basket" : "Ticker"}</td></tr>)}</tbody></table></div></div>}
        {newNm.length > 0 && <div style={{ ...S.card, marginBottom: 16, borderColor: "#f59e0b" }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>New Names</h3>{newNm.map(n => <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ fontWeight: 600, fontSize: 14, minWidth: 140 }}>{n}</span><button onClick={() => markTk(n)} style={S.btnSm}>Ticker</button><button onClick={() => startBk(n)} style={{ ...S.btnSm, background: "#6366f1" }}>Basket</button><button onClick={() => skipBk(n)} style={{ ...S.btnSm, background: "#71717a" }}>Skip</button></div>)}</div>}
        {bDef && <div style={{ ...S.card, marginBottom: 16, borderColor: "#6366f1" }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Basket: {bDef}</h3><textarea rows={6} placeholder="META 60\nGOOGL 40" value={bInp} onChange={e => setBInp(e.target.value)} style={S.ta} /><div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={saveBk} style={S.btn}>Save</button><button onClick={() => { setBDef(null); setNewNm(p => [...p, bDef]); }} style={S.btnSm}>Cancel</button></div></div>}
        {manRet && <div style={{ ...S.card, marginBottom: 16, borderColor: "#ef4444" }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Missing Returns</h3><p style={{ fontSize: 12, color: "#71717a", marginBottom: 12 }}>Enter %. Negatives: -1.3 or (1.3%)</p>{failTk.map(t => <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ fontWeight: 600, fontSize: 13, minWidth: 90 }}>{t}</span><input value={manRet[t] || ""} onChange={e => setManRet(p => ({ ...p, [t]: e.target.value }))} placeholder="0.0" style={{ ...S.inp, width: 100, padding: "4px 8px" }} /><span style={{ fontSize: 12, color: "#71717a" }}>%</span></div>)}<button onClick={submitMan} style={{ ...S.btn, marginTop: 8 }}>Submit</button></div>}
      </div>}

      {/* DAILY */}
      {tab === 1 && (() => {
        const latDec = dec.length > 0 ? dec[dec.length - 1].date : null;
        const dDate = dailyDate || latDec;
        const dD = dec.find(d => d.date === dDate) || null;
        const dE = dD ? dD.entries : [];
        const allSec = [...new Set(dE.map(e => sect[e.ticker] || "Unassigned"))].sort();
        const filt = dE.filter(e => { if (dailyFilter.ticker && !e.ticker.includes(dailyFilter.ticker.toUpperCase())) return false; if (dailyFilter.side !== "All" && e.dir !== dailyFilter.side) return false; if (dailyFilter.sector !== "All" && (sect[e.ticker] || "Unassigned") !== dailyFilter.sector) return false; return true; });
        const srt = [...filt].sort((a, b) => { const c = dailySort.col; if (c === "ticker") return dailySort.dir === "asc" ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker); if (c === "sector") { const va = sect[a.ticker] || "Z", vb = sect[b.ticker] || "Z"; return dailySort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va); } const va = a[c] || 0, vb = b[c] || 0; return dailySort.dir === "asc" ? va - vb : vb - va; });
        const st = SortTh({ col: dailySort.col, dir: dailySort.dir, setSort: setDailySort });
        const lo = srt.filter(e => e.dir === "L"), sh = srt.filter(e => e.dir === "S");
        const tP = srt.reduce((x, e) => x + e.pnl, 0), tT = srt.reduce((x, e) => x + e.trading, 0);
        return <div>{dec.length === 0 ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#71717a" }}>Import baseline + one day with returns.</div> : <div style={S.card}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><label style={{ fontSize: 11, color: "#71717a" }}>Date:</label><select value={dDate || ""} onChange={e => setDailyDate(e.target.value || null)} style={{ ...S.inp, width: 170, padding: "4px 8px", fontSize: 12 }}>{dec.map(d => <option key={d.date} value={d.date}>{d.date}{d.date === latDec ? " (latest)" : ""}</option>)}</select></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><label style={{ fontSize: 11, color: "#71717a" }}>Ticker:</label><input value={dailyFilter.ticker} onChange={e => setDailyFilter(p => ({ ...p, ticker: e.target.value }))} placeholder="Search" style={{ ...S.inp, width: 100, padding: "4px 8px", fontSize: 12 }} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><label style={{ fontSize: 11, color: "#71717a" }}>Side:</label><select value={dailyFilter.side} onChange={e => setDailyFilter(p => ({ ...p, side: e.target.value }))} style={{ ...S.inp, width: 70, padding: "4px 8px", fontSize: 12 }}><option value="All">All</option><option value="L">L</option><option value="S">S</option></select></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><label style={{ fontSize: 11, color: "#71717a" }}>Sector:</label><select value={dailyFilter.sector} onChange={e => setDailyFilter(p => ({ ...p, sector: e.target.value }))} style={{ ...S.inp, width: 130, padding: "4px 8px", fontSize: 12 }}><option value="All">All</option>{allSec.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
            <span style={{ fontSize: 11, color: "#71717a" }}>{srt.length}/{dE.length}</span>
          </div>
          {!dD ? <p style={{ color: "#71717a" }}>No decomposition.</p> : <div style={{ maxHeight: 500, overflowY: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#1a1d27" }}><tr>{st.th("Ticker","ticker")}{st.th("Side","dir")}{st.th("Sector","sector")}{st.th("Prior","priorSize",true)}{st.th("Size","size",true)}{st.th("Return","dailyReturn",true)}{st.th("P&L","pnl",true)}{st.th("Trading","trading",true)}</tr></thead><tbody>
            {srt.map((e, i) => <tr key={i}><td style={{ ...S.td, fontWeight: 600 }}>{e.ticker}</td><td style={S.td}><Sd d={e.dir} /></td><td style={{ ...S.td, color: sect[e.ticker] ? "#e4e4e7" : "#71717a", fontSize: 12 }}>{sect[e.ticker] || "—"}</td><td style={{ ...S.td, textAlign: "right" }}>{e.priorSize.toFixed(2)}%</td><td style={{ ...S.td, textAlign: "right" }}>{e.size.toFixed(2)}%</td><td style={{ ...S.td, textAlign: "right", color: colF(e.dailyReturn) }}>{(e.dailyReturn * 100).toFixed(2)}%</td><td style={{ ...S.td, textAlign: "right", color: colF(e.pnl), fontWeight: 600 }}>{fB(e.pnl)}</td><td style={{ ...S.td, textAlign: "right", color: colF(e.trading), fontWeight: 600 }}>{fB(e.trading)}</td></tr>)}
            <tr style={{ borderTop: "2px solid #2a2d3a" }}><td style={{ ...S.td, fontWeight: 700 }}>TOTAL</td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td><td style={{ ...S.td, textAlign: "right", color: colF(tP), fontWeight: 700 }}>{fB(tP)}</td><td style={{ ...S.td, textAlign: "right", color: colF(tT), fontWeight: 700 }}>{fB(tT)}</td></tr>
            {[{ l: "LONG", c: "#22c55e", items: lo }, { l: "SHORT", c: "#ef4444", items: sh }].map(r => <tr key={r.l}><td style={{ ...S.td, fontWeight: 600, color: r.c }}>{r.l}</td><td style={S.td}></td><td style={{ ...S.td, fontSize: 11, color: "#71717a" }}>{r.items.length}</td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td><td style={{ ...S.td, textAlign: "right", color: colF(r.items.reduce((x, e) => x + e.pnl, 0)), fontWeight: 600 }}>{fB(r.items.reduce((x, e) => x + e.pnl, 0))}</td><td style={{ ...S.td, textAlign: "right", color: colF(r.items.reduce((x, e) => x + e.trading, 0)), fontWeight: 600 }}>{fB(r.items.reduce((x, e) => x + e.trading, 0))}</td></tr>)}
          </tbody></table></div>}
        </div>}</div>;
      })()}

      {/* DASHBOARD */}
      {tab === 2 && <div>{!latH ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#71717a" }}>No data yet.</div> : <>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}><label style={{ fontSize: 13, color: "#71717a" }}>As of:</label><select value={selDate || ""} onChange={e => setDashDate(e.target.value || null)} style={{ ...S.inp, width: 180, padding: "6px 10px" }}>{hist.map(h => <option key={h.date} value={h.date}>{h.date}{h.date === latH.date ? " (latest)" : ""}</option>)}</select>{dashDate && dashDate !== latH.date && <button onClick={() => setDashDate(null)} style={S.btnSm}>Reset</button>}</div>
        {selExp && <div style={{ marginBottom: 20 }}><h3 style={{ fontSize: 13, color: "#71717a", marginBottom: 8 }}>EXPOSURE — {selDate}</h3><Cards items={[{ l: "Long", v: selExp.long, w: true }, { l: "Short", v: selExp.short, w: true }, { l: "Net", v: selExp.net, w: true }, { l: "Gross", v: selExp.gross, w: true }, { l: "Positions", v: selExp.count, n: true }]} /></div>}
        {selLSt && <div style={{ marginBottom: 20 }}><h3 style={{ fontSize: 13, color: "#71717a", marginBottom: 8 }}>P&L — {selLSt.date}</h3><Cards items={[{ l: "Total", v: selLSt.pnl, bps: true }, { l: "Long", v: selLSt.lP, bps: true }, { l: "Short", v: selLSt.sP, bps: true }, { l: "Trading", v: selLSt.tr, bps: true }, { l: `Best: ${selLSt.best.ticker}`, v: selLSt.best.pnl, bps: true }, { l: `Worst: ${selLSt.worst.ticker}`, v: selLSt.worst.pnl, bps: true }]} /></div>}
        {selCum && <div style={{ marginBottom: 20 }}><h3 style={{ fontSize: 13, color: "#71717a", marginBottom: 8 }}>CUMULATIVE — {selCum.days}d through {selDate}</h3><Cards items={[{ l: "Total", v: selCum.total, bps: true }, { l: "Long", v: selCum.long, bps: true }, { l: "Short", v: selCum.short, bps: true }, { l: "Trading", v: selCum.trading, bps: true }, { l: `Best: ${selCum.best.ticker}`, v: selCum.best.cum, bps: true }, { l: `Worst: ${selCum.worst.ticker}`, v: selCum.worst.cum, bps: true }]} /></div>}
        {perf && <div style={{ marginBottom: 20 }}><h3 style={{ fontSize: 13, color: "#71717a", marginBottom: 8 }}>PERFORMANCE — through {selDate}</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          {[{ l: "Batting", v: perf.ba, r: true, sub: `${perf.up}/${perf.td} days` }, { l: "Vol", v: perf.vol, vol: true }, { l: "Sharpe", v: perf.sh, sh: true }, { l: "Slugging", v: perf.sl, sl: true }, { l: "Win All", v: perf.wrA, r: true, sub: `${perf.wA}/${perf.tA}` }, { l: "Win Long", v: perf.wrL, r: true, sub: `${perf.wL}/${perf.tL}` }, { l: "Win Short", v: perf.wrS, r: true, sub: `${perf.wS}/${perf.tS}` }].map((c, i) => <div key={i} style={S.card}><div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>{c.l}</div><div style={{ fontSize: 18, fontWeight: 700, color: c.r ? (c.v >= 0.5 ? "#22c55e" : "#ef4444") : c.vol ? "#e4e4e7" : c.sh ? (c.v != null ? (c.v >= 1 ? "#22c55e" : c.v >= 0 ? "#f59e0b" : "#ef4444") : "#71717a") : c.sl ? (c.v != null ? (c.v >= 1.5 ? "#22c55e" : c.v >= 1 ? "#f59e0b" : "#ef4444") : "#71717a") : "#e4e4e7" }}>{c.r ? (c.v * 100).toFixed(0) + "%" : c.vol ? fB(c.v) : c.sh ? (c.v != null ? c.v.toFixed(2) : "—") : c.sl ? (c.v != null ? c.v.toFixed(2) + "x" : "—") : ""}</div>{c.sub && <div style={{ fontSize: 11, color: "#71717a" }}>{c.sub}</div>}{c.vol && <div style={{ fontSize: 11, color: "#71717a" }}>{fP(c.v)} / day</div>}{c.sh && <div style={{ fontSize: 11, color: "#71717a" }}>annualized</div>}{c.sl && <div style={{ fontSize: 11, color: "#71717a" }}>avg win/loss</div>}</div>)}
        </div></div>}
        {selCumPnl.length > 0 && <div style={{ ...S.card, marginBottom: 20 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Cumulative P&L</h3><ChartLine data={selCumPnl} keys={[{ key: "cumTotal", color: "#6366f1", label: "Total", w: 2 }, { key: "cumLong", color: "#22c55e", label: "Long" }, { key: "cumShort", color: "#ef4444", label: "Short" }]} /></div>}
        <SecTbl data={selSecCum} title={`Cumulative Sector P&L — through ${selDate}`} />
      </>}</div>}

      {/* ATTRIBUTION */}
      {tab === 3 && (() => {
        const allSec = [...new Set(cumTk.map(t => sect[t.ticker] || "Unassigned"))].sort();
        const filt = cumTk.filter(t => { if (attrFilter.ticker && !t.ticker.includes(attrFilter.ticker.toUpperCase())) return false; if (attrFilter.side !== "All" && t.dir !== attrFilter.side) return false; if (attrFilter.sector !== "All" && (sect[t.ticker] || "Unassigned") !== attrFilter.sector) return false; return true; });
        const srt = [...filt].sort((a, b) => { const c = attrSort.col; if (c === "ticker") return attrSort.dir === "asc" ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker); if (c === "sector") { const va = sect[a.ticker] || "Z", vb = sect[b.ticker] || "Z"; return attrSort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va); } if (c === "roic") { const va = a.roic ?? -Infinity, vb = b.roic ?? -Infinity; return attrSort.dir === "asc" ? va - vb : vb - va; } const va = a[c] || 0, vb = b[c] || 0; return attrSort.dir === "asc" ? va - vb : vb - va; });
        const st = SortTh({ col: attrSort.col, dir: attrSort.dir, setSort: setAttrSort });
        const lo = srt.filter(t => t.dir === "L"), sh = srt.filter(t => t.dir === "S");
        const mkS = items => { const lp = items.reduce((x, t) => x + t.lastPnl, 0), cp = items.reduce((x, t) => x + t.cumPnl, 0), ct = items.reduce((x, t) => x + t.cumTr, 0), aw = items.reduce((x, t) => x + t.avgWt, 0), ri = aw > 0.001 ? cp / aw : null; return { lp, cp, ct, aw, ri, n: items.length }; };
        const tot = mkS(srt), lr = mkS(lo), sr = mkS(sh);
        return <div style={S.card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Attribution</h3>
          <p style={{ fontSize: 12, color: "#71717a", marginBottom: 12 }}>Click headers to sort. Click sector to assign.</p>
          {cumTk.length > 0 && <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><label style={{ fontSize: 11, color: "#71717a" }}>Ticker:</label><input value={attrFilter.ticker} onChange={e => setAttrFilter(p => ({ ...p, ticker: e.target.value }))} placeholder="Search" style={{ ...S.inp, width: 100, padding: "4px 8px", fontSize: 12 }} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><label style={{ fontSize: 11, color: "#71717a" }}>Side:</label><select value={attrFilter.side} onChange={e => setAttrFilter(p => ({ ...p, side: e.target.value }))} style={{ ...S.inp, width: 70, padding: "4px 8px", fontSize: 12 }}><option value="All">All</option><option value="L">L</option><option value="S">S</option></select></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><label style={{ fontSize: 11, color: "#71717a" }}>Sector:</label><select value={attrFilter.sector} onChange={e => setAttrFilter(p => ({ ...p, sector: e.target.value }))} style={{ ...S.inp, width: 130, padding: "4px 8px", fontSize: 12 }}><option value="All">All</option>{allSec.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
            <span style={{ fontSize: 11, color: "#71717a" }}>{srt.length}/{cumTk.length}</span>
          </div>}
          {cumTk.length === 0 ? <p style={{ color: "#71717a" }}>No data.</p> : <div style={{ maxHeight: 500, overflowY: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#1a1d27" }}><tr>{st.th("Ticker","ticker")}{st.th("Side","dir")}{st.th("Sector","sector")}{st.th("Last P&L","lastPnl",true)}{st.th("Cum P&L","cumPnl",true)}{st.th("Cum Trd","cumTr",true)}{st.th("Avg Wt","avgWt",true)}{st.th("ROIC","roic",true)}</tr></thead><tbody>
            {srt.map((t, i) => <tr key={i}><td style={{ ...S.td, fontWeight: 600 }}>{t.ticker}</td><td style={S.td}><Sd d={t.dir} /></td><td style={S.td}><SecCell ticker={t.ticker} /></td><td style={{ ...S.td, textAlign: "right", color: colF(t.lastPnl), fontWeight: 600 }}>{fB(t.lastPnl)}</td><td style={{ ...S.td, textAlign: "right", color: colF(t.cumPnl), fontWeight: 600 }}>{fB(t.cumPnl)}</td><td style={{ ...S.td, textAlign: "right", color: colF(t.cumTr) }}>{fB(t.cumTr)}</td><td style={{ ...S.td, textAlign: "right" }}>{t.avgWt.toFixed(2)}%</td><td style={{ ...S.td, textAlign: "right", color: t.roic != null ? colF(t.roic) : "#71717a", fontWeight: 600 }}>{t.roic != null ? (t.roic * 100).toFixed(1) + "%" : "—"}</td></tr>)}
            {[{ l: "TOTAL", c: null, d: tot, w: 700 }, { l: "LONG", c: "#22c55e", d: lr, w: 600 }, { l: "SHORT", c: "#ef4444", d: sr, w: 600 }].map((r, i) => <tr key={"s" + i} style={i === 0 ? { borderTop: "2px solid #2a2d3a" } : {}}><td style={{ ...S.td, fontWeight: r.w, color: r.c || "#e4e4e7" }}>{r.l}</td><td style={S.td}></td><td style={{ ...S.td, fontSize: 11, color: "#71717a" }}>{i > 0 ? r.d.n + " pos" : ""}</td><td style={{ ...S.td, textAlign: "right", color: colF(r.d.lp), fontWeight: r.w }}>{fB(r.d.lp)}</td><td style={{ ...S.td, textAlign: "right", color: colF(r.d.cp), fontWeight: r.w }}>{fB(r.d.cp)}</td><td style={{ ...S.td, textAlign: "right", color: colF(r.d.ct), fontWeight: r.w }}>{fB(r.d.ct)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: r.w }}>{r.d.aw.toFixed(1)}%</td><td style={{ ...S.td, textAlign: "right", color: r.d.ri != null ? colF(r.d.ri) : "#71717a", fontWeight: r.w }}>{r.d.ri != null ? (r.d.ri * 100).toFixed(1) + "%" : "—"}</td></tr>)}
          </tbody></table></div>}
        </div>;
      })()}

      {/* MONTHLY */}
      {tab === 4 && (() => {
        const allSec = [...new Set(monthlyTk.map(t => sect[t.ticker] || "Unassigned"))].sort();
        const filt = monthlyTk.filter(t => { if (monthFilter.ticker && !t.ticker.includes(monthFilter.ticker.toUpperCase())) return false; if (monthFilter.side !== "All" && t.dir !== monthFilter.side) return false; if (monthFilter.sector !== "All" && (sect[t.ticker] || "Unassigned") !== monthFilter.sector) return false; return true; });
        const srt = [...filt].sort((a, b) => { const c = monthSort.col; if (!c || c === "ticker") return (monthSort.dir === "asc" ? 1 : -1) * a.ticker.localeCompare(b.ticker); if (c === "sector") { const va = sect[a.ticker] || "Z", vb = sect[b.ticker] || "Z"; return monthSort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va); } if (c === "ytd") { const va = months.reduce((s, mo) => s + (a.months[mo] || 0), 0), vb = months.reduce((s, mo) => s + (b.months[mo] || 0), 0); return monthSort.dir === "asc" ? va - vb : vb - va; } const va = a.months[c] || 0, vb = b.months[c] || 0; return monthSort.dir === "asc" ? va - vb : vb - va; });
        const toggle = c => setMonthSort(p => ({ col: c, dir: p.col === c && p.dir === "desc" ? "asc" : "desc" }));
        const arr = c => monthSort.col === c ? (monthSort.dir === "desc" ? " ▼" : " ▲") : "";
        const lo = srt.filter(t => t.dir === "L"), sh = srt.filter(t => t.dir === "S");
        const sumM = items => { const r = {}; months.forEach(mo => { r[mo] = items.reduce((s, t) => s + (t.months[mo] || 0), 0); }); return r; };
        const totM = sumM(srt), loM = sumM(lo), shM = sumM(sh);
        return <div style={S.card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Monthly P&L</h3>
          <p style={{ fontSize: 12, color: "#71717a", marginBottom: 12 }}>P&L by ticker by month (bps).</p>
          {monthlyTk.length > 0 && <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><label style={{ fontSize: 11, color: "#71717a" }}>Ticker:</label><input value={monthFilter.ticker} onChange={e => setMonthFilter(p => ({ ...p, ticker: e.target.value }))} placeholder="Search" style={{ ...S.inp, width: 100, padding: "4px 8px", fontSize: 12 }} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><label style={{ fontSize: 11, color: "#71717a" }}>Side:</label><select value={monthFilter.side} onChange={e => setMonthFilter(p => ({ ...p, side: e.target.value }))} style={{ ...S.inp, width: 70, padding: "4px 8px", fontSize: 12 }}><option value="All">All</option><option value="L">L</option><option value="S">S</option></select></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><label style={{ fontSize: 11, color: "#71717a" }}>Sector:</label><select value={monthFilter.sector} onChange={e => setMonthFilter(p => ({ ...p, sector: e.target.value }))} style={{ ...S.inp, width: 130, padding: "4px 8px", fontSize: 12 }}><option value="All">All</option>{allSec.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
            <span style={{ fontSize: 11, color: "#71717a" }}>{srt.length}/{monthlyTk.length}</span>
          </div>}
          {monthlyTk.length === 0 ? <p style={{ color: "#71717a" }}>No data.</p> : <div style={{ overflowX: "auto" }}><div style={{ maxHeight: 500, overflowY: "auto" }}><table style={{ minWidth: 500 + months.length * 100 }}><thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#1a1d27" }}><tr>
            <th onClick={() => toggle("ticker")} style={{ ...S.th, cursor: "pointer", userSelect: "none", position: "sticky", left: 0, background: "#1a1d27", zIndex: 2 }}>Ticker{arr("ticker")}</th>
            <th style={S.th}>Side</th><th onClick={() => toggle("sector")} style={{ ...S.th, cursor: "pointer", userSelect: "none" }}>Sector{arr("sector")}</th>
            {months.map(mo => <th key={mo} onClick={() => toggle(mo)} style={{ ...S.th, textAlign: "right", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>{mo}{arr(mo)}</th>)}
            <th onClick={() => toggle("ytd")} style={{ ...S.th, textAlign: "right", cursor: "pointer", userSelect: "none", borderLeft: "2px solid #2a2d3a" }}>YTD{arr("ytd")}</th>
          </tr></thead><tbody>
            {srt.map((t, i) => { const ytd = months.reduce((s, mo) => s + (t.months[mo] || 0), 0); return <tr key={i}><td style={{ ...S.td, fontWeight: 600, position: "sticky", left: 0, background: "#1a1d27", zIndex: 1 }}>{t.ticker}</td><td style={S.td}><Sd d={t.dir} /></td><td style={{ ...S.td, color: sect[t.ticker] ? "#e4e4e7" : "#71717a", fontSize: 12 }}>{sect[t.ticker] || "—"}</td>{months.map(mo => { const v = t.months[mo] || 0; return <td key={mo} style={{ ...S.td, textAlign: "right", color: colF(v), fontWeight: v !== 0 ? 600 : 400 }}>{v !== 0 ? fB(v) : "—"}</td>; })}<td style={{ ...S.td, textAlign: "right", color: colF(ytd), fontWeight: 700, borderLeft: "2px solid #2a2d3a" }}>{fB(ytd)}</td></tr>; })}
            {[{ l: "TOTAL", d: totM, c: null, w: 700 }, { l: "LONG", d: loM, c: "#22c55e", w: 600, n: lo.length }, { l: "SHORT", d: shM, c: "#ef4444", w: 600, n: sh.length }].map((r, i) => { const ytd = months.reduce((s, mo) => s + (r.d[mo] || 0), 0); return <tr key={"s" + i} style={i === 0 ? { borderTop: "2px solid #2a2d3a" } : {}}><td style={{ ...S.td, fontWeight: r.w, color: r.c || "#e4e4e7", position: "sticky", left: 0, background: "#1a1d27", zIndex: 1 }}>{r.l}</td><td style={S.td}></td><td style={{ ...S.td, fontSize: 11, color: "#71717a" }}>{r.n ? r.n + " pos" : ""}</td>{months.map(mo => { const v = r.d[mo] || 0; return <td key={mo} style={{ ...S.td, textAlign: "right", color: colF(v), fontWeight: r.w }}>{fB(v)}</td>; })}<td style={{ ...S.td, textAlign: "right", color: colF(ytd), fontWeight: r.w, borderLeft: "2px solid #2a2d3a" }}>{fB(ytd)}</td></tr>; })}
          </tbody></table></div></div>}
        </div>;
      })()}

      {/* SECTORS */}
      {tab === 5 && (() => {
        const st = SortTh({ col: secSort.col, dir: secSort.dir, setSort: setSecSort });
        const srt = [...secAn].sort((a, b) => { const c = secSort.col; if (c === "sector") return secSort.dir === "asc" ? a.sector.localeCompare(b.sector) : b.sector.localeCompare(a.sector); if (c === "wrAll") { const va = a.totalPos > 0 ? a.winAll / a.totalPos : 0, vb = b.totalPos > 0 ? b.winAll / b.totalPos : 0; return secSort.dir === "asc" ? va - vb : vb - va; } if (c === "wrLong") { const va = a.totalLong > 0 ? a.winLong / a.totalLong : 0, vb = b.totalLong > 0 ? b.winLong / b.totalLong : 0; return secSort.dir === "asc" ? va - vb : vb - va; } if (c === "wrShort") { const va = a.totalShort > 0 ? a.winShort / a.totalShort : 0, vb = b.totalShort > 0 ? b.winShort / b.totalShort : 0; return secSort.dir === "asc" ? va - vb : vb - va; } if (c === "roic" || c === "sharpe" || c === "slugging") { const va = a[c] ?? -Infinity, vb = b[c] ?? -Infinity; return secSort.dir === "asc" ? va - vb : vb - va; } const va = a[c] || 0, vb = b[c] || 0; return secSort.dir === "asc" ? va - vb : vb - va; });
        return <div>{secAn.length === 0 ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#71717a" }}>Assign sectors in Attribution.</div> : <div style={S.card}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Sector Analytics</h3><div style={{ overflowX: "auto" }}><table><thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#1a1d27" }}><tr>{st.th("Sector","sector")}{st.th("Cum P&L","cumPnl",true)}{st.th("Long","longPnl",true)}{st.th("Short","shortPnl",true)}{st.th("Avg Wt","avgWt",true)}{st.th("ROIC","roic",true)}{st.th("Batting","battingAvg",true)}{st.th("Vol","vol",true)}{st.th("Sharpe","sharpe",true)}{st.th("Slug","slugging",true)}{st.th("Win","wrAll",true)}{st.th("Win L","wrLong",true)}{st.th("Win S","wrShort",true)}</tr></thead><tbody>
          {srt.map((s, i) => <tr key={i}><td style={{ ...S.td, fontWeight: 600 }}>{s.sector}</td><td style={{ ...S.td, textAlign: "right", color: colF(s.cumPnl), fontWeight: 600 }}>{fB(s.cumPnl)}</td><td style={{ ...S.td, textAlign: "right", color: colF(s.longPnl), fontWeight: 600 }}>{fB(s.longPnl)}</td><td style={{ ...S.td, textAlign: "right", color: colF(s.shortPnl), fontWeight: 600 }}>{fB(s.shortPnl)}</td><td style={{ ...S.td, textAlign: "right" }}>{s.avgWt.toFixed(1)}%</td><td style={{ ...S.td, textAlign: "right", color: s.roic != null ? colF(s.roic) : "#71717a", fontWeight: 600 }}>{s.roic != null ? (s.roic * 100).toFixed(1) + "%" : "—"}</td><td style={{ ...S.td, textAlign: "right", color: s.battingAvg >= 0.5 ? "#22c55e" : "#ef4444" }}>{(s.battingAvg * 100).toFixed(0)}%<span style={{ fontSize: 10, color: "#71717a" }}> {s.upDays}/{s.days}</span></td><td style={{ ...S.td, textAlign: "right" }}>{fB(s.vol)}</td><td style={{ ...S.td, textAlign: "right", color: s.sharpe != null ? (s.sharpe >= 1 ? "#22c55e" : s.sharpe >= 0 ? "#f59e0b" : "#ef4444") : "#71717a" }}>{s.sharpe != null ? s.sharpe.toFixed(2) : "—"}</td><td style={{ ...S.td, textAlign: "right", color: s.slugging != null ? (s.slugging >= 1.5 ? "#22c55e" : s.slugging >= 1 ? "#f59e0b" : "#ef4444") : "#71717a", fontWeight: 600 }}>{s.slugging != null ? s.slugging.toFixed(2) + "x" : "—"}</td><td style={{ ...S.td, textAlign: "right", color: s.totalPos > 0 && s.winAll / s.totalPos >= 0.5 ? "#22c55e" : "#ef4444" }}>{s.totalPos > 0 ? (s.winAll / s.totalPos * 100).toFixed(0) + "%" : "—"}<span style={{ fontSize: 10, color: "#71717a" }}> {s.winAll}/{s.totalPos}</span></td><td style={{ ...S.td, textAlign: "right", color: s.totalLong > 0 && s.winLong / s.totalLong >= 0.5 ? "#22c55e" : "#ef4444" }}>{s.totalLong > 0 ? (s.winLong / s.totalLong * 100).toFixed(0) + "%" : "—"}<span style={{ fontSize: 10, color: "#71717a" }}> {s.winLong}/{s.totalLong}</span></td><td style={{ ...S.td, textAlign: "right", color: s.totalShort > 0 && s.winShort / s.totalShort >= 0.5 ? "#22c55e" : "#ef4444" }}>{s.totalShort > 0 ? (s.winShort / s.totalShort * 100).toFixed(0) + "%" : "—"}<span style={{ fontSize: 10, color: "#71717a" }}> {s.winShort}/{s.totalShort}</span></td></tr>)}
          <tr style={{ borderTop: "2px solid #2a2d3a" }}><td style={{ ...S.td, fontWeight: 700 }}>TOTAL</td><td style={{ ...S.td, textAlign: "right", color: colF(srt.reduce((x, s) => x + s.cumPnl, 0)), fontWeight: 700 }}>{fB(srt.reduce((x, s) => x + s.cumPnl, 0))}</td><td style={{ ...S.td, textAlign: "right", color: colF(srt.reduce((x, s) => x + s.longPnl, 0)), fontWeight: 700 }}>{fB(srt.reduce((x, s) => x + s.longPnl, 0))}</td><td style={{ ...S.td, textAlign: "right", color: colF(srt.reduce((x, s) => x + s.shortPnl, 0)), fontWeight: 700 }}>{fB(srt.reduce((x, s) => x + s.shortPnl, 0))}</td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td></tr>
        </tbody></table></div></div>}</div>;
      })()}

      {/* VIZ */}
      {tab === 6 && <div>
        {kpiSeries.length === 0 ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#71717a" }}>No data. Import baseline + one day with returns.</div> : <div>
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Select Metrics</h3>
                {vizGroups.map(g => <div key={g} style={{ marginBottom: 10 }}><div style={{ fontSize: 11, color: "#71717a", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{g}</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{VIZ_METRICS.filter(m => m.group === g).map(m => { const on = vizMetrics.includes(m.key); return <button key={m.key} onClick={() => setVizMetrics(p => on ? p.filter(x => x !== m.key) : [...p, m.key])} style={{ background: on ? m.color + "22" : "#0f1117", color: on ? m.color : "#71717a", border: `1px solid ${on ? m.color : "#2a2d3a"}`, borderRadius: 16, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontWeight: on ? 600 : 400 }}>{m.label}</button>; })}</div></div>)}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={() => setVizMetrics(VIZ_METRICS.map(m => m.key))} style={{ ...S.btnSm, fontSize: 11 }}>All</button><button onClick={() => setVizMetrics([])} style={{ ...S.btnSm, fontSize: 11 }}>Clear</button></div>
              </div>
              <div style={{ minWidth: 160 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Sector</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {["All", ...[...new Set(Object.values(sect))].sort()].map(s => { const active = vizSector === s; return <button key={s} onClick={() => setVizSector(s)} style={{ background: active ? "#6366f122" : "#0f1117", color: active ? "#6366f1" : "#71717a", border: `1px solid ${active ? "#6366f1" : "#2a2d3a"}`, borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: active ? 600 : 400, textAlign: "left" }}>{s}</button>; })}
                </div>
              </div>
              <div style={{ minWidth: 200 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Window</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {ROLLING_OPTIONS.map(o => { const active = vizWindow === o.value; return <button key={o.value} onClick={() => setVizWindow(o.value)} style={{ background: active ? "#6366f122" : "#0f1117", color: active ? "#6366f1" : "#71717a", border: `1px solid ${active ? "#6366f1" : "#2a2d3a"}`, borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: active ? 600 : 400, textAlign: "left" }}>{o.label}{o.value !== "cumulative" && <span style={{ fontSize: 10, color: "#71717a", marginLeft: 6 }}>rolling</span>}</button>; })}
                </div>
                <p style={{ fontSize: 11, color: "#71717a", marginTop: 8, lineHeight: 1.5 }}>{vizWindow === "cumulative" ? "All metrics use all days from start." : `Perf & win metrics use trailing ${vizWindow} days. P&L and exposure always cumulative.`}</p>
              </div>
            </div>
          </div>
          {vizMetrics.length === 0 && <div style={{ ...S.card, textAlign: "center", padding: 30, color: "#71717a" }}>Select metrics above.</div>}
          {["cumTotal","cumLong","cumShort"].some(k => vizMetrics.includes(k)) && <div style={{ ...S.card, marginBottom: 16 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Cumulative P&L</h3><ChartLine data={kpiSeries} keys={["cumTotal","cumLong","cumShort"].filter(k => vizMetrics.includes(k)).map(k => { const m = VIZ_METRICS.find(x => x.key === k); return { key: k, color: m.color, label: m.label, w: k === "cumTotal" ? 2 : 1.5 }; })} /></div>}
          {vizMetrics.includes("dailyPnl") && <div style={{ ...S.card, marginBottom: 16 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Daily P&L</h3><ResponsiveContainer width="100%" height={220}><BarChart data={kpiSeries}><CartesianGrid stroke="#2a2d3a" strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} /><YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={v => v + " bps"} /><Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 6, fontSize: 12 }} /><Bar dataKey="dailyPnl" name="Daily P&L (bps)" fill="#6366f1" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>}
          {["battingAvg","sharpe","slugging"].some(k => vizMetrics.includes(k)) && <div style={{ ...S.card, marginBottom: 16 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Performance {vizWindow !== "cumulative" ? <span style={{ fontSize: 11, color: "#71717a", fontWeight: 400 }}>({vizWindow}d rolling)</span> : <span style={{ fontSize: 11, color: "#71717a", fontWeight: 400 }}>(cumulative)</span>}</h3><div style={{ marginBottom: 12 }} /><ChartLine data={kpiSeries} keys={["battingAvg","sharpe","slugging"].filter(k => vizMetrics.includes(k)).map(k => { const m = VIZ_METRICS.find(x => x.key === k); return { key: k, color: m.color, label: m.label }; })} fmt={v => String(v)} /></div>}
          {["vol","maxDD"].some(k => vizMetrics.includes(k)) && <div style={{ ...S.card, marginBottom: 16 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Risk {vizWindow !== "cumulative" && vizMetrics.includes("vol") ? <span style={{ fontSize: 11, color: "#71717a", fontWeight: 400 }}>({vizWindow}d rolling)</span> : <span style={{ fontSize: 11, color: "#71717a", fontWeight: 400 }}>(cumulative)</span>}</h3><div style={{ marginBottom: 12 }} /><ChartLine data={kpiSeries} keys={["vol","maxDD"].filter(k => vizMetrics.includes(k)).map(k => { const m = VIZ_METRICS.find(x => x.key === k); return { key: k, color: m.color, label: m.label }; })} fmt={v => v + " bps"} /></div>}
          {["wrAll","wrLong","wrShort"].some(k => vizMetrics.includes(k)) && <div style={{ ...S.card, marginBottom: 16 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Win Rates {vizWindow !== "cumulative" ? <span style={{ fontSize: 11, color: "#71717a", fontWeight: 400 }}>({vizWindow}d rolling)</span> : <span style={{ fontSize: 11, color: "#71717a", fontWeight: 400 }}>(cumulative)</span>}</h3><div style={{ marginBottom: 12 }} /><ChartLine data={kpiSeries} keys={["wrAll","wrLong","wrShort"].filter(k => vizMetrics.includes(k)).map(k => { const m = VIZ_METRICS.find(x => x.key === k); return { key: k, color: m.color, label: m.label }; })} fmt={v => v + "%"} /></div>}
          {["netExp","grossExp"].some(k => vizMetrics.includes(k)) && <div style={{ ...S.card, marginBottom: 16 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Exposure</h3><ChartLine data={kpiSeries} keys={["netExp","grossExp"].filter(k => vizMetrics.includes(k)).map(k => { const m = VIZ_METRICS.find(x => x.key === k); return { key: k, color: m.color, label: m.label }; })} /></div>}
        </div>}
      </div>}

      {/* TRADES */}
      {tab === 7 && (() => {
        const allPositions = [];
        const seen = new Set();
        hist.forEach(h => h.entries.forEach(e => {
          const k = `${e.ticker}-${e.dir}`;
          if (!seen.has(k)) { seen.add(k); allPositions.push({ ticker: e.ticker, dir: e.dir }); }
        }));
        allPositions.sort((a, b) => a.ticker.localeCompare(b.ticker));

        const handleSelect = (ticker, dir) => {
          setTradesTicker(ticker); setTradesDir(dir); setTradesData([]); fetchTradesData(ticker, dir);
        };

        const priceRange = tradesData.length > 0 ? { min: Math.min(...tradesData.map(d => d.price)), max: Math.max(...tradesData.map(d => d.price)) } : null;
        const sizeRange = tradesData.length > 0 ? { min: 0, max: Math.max(...tradesData.filter(d => d.size != null).map(d => d.size), 1) } : null;
        const positionDays = tradesData.filter(d => d.size != null && d.size > 0);
        const avgSize = positionDays.length > 0 ? positionDays.reduce((s, d) => s + d.size, 0) / positionDays.length : 0;
        const maxSize = positionDays.length > 0 ? Math.max(...positionDays.map(d => d.size)) : 0;
        const minSize = positionDays.length > 0 ? Math.min(...positionDays.map(d => d.size)) : 0;
        const avgPrice = positionDays.length > 0 ? positionDays.reduce((s, d) => s + d.price, 0) / positionDays.length : 0;
        const lastPrice = tradesData.length > 0 ? tradesData[tradesData.length - 1].price : 0;
        const firstPrice = tradesData.length > 0 ? tradesData[0].price : 0;
        const ytdReturn = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;

        return <div>
          <div style={{ ...S.card, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Price vs Position Sizing</h3>
            <p style={{ fontSize: 12, color: "#71717a", marginBottom: 16 }}>Select a position to see YTD stock price overlaid with your sizing. Evaluate whether you traded it well.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {allPositions.map(p => {
                const active = tradesTicker === p.ticker && tradesDir === p.dir;
                return <button key={`${p.ticker}-${p.dir}`} onClick={() => handleSelect(p.ticker, p.dir)} style={{
                  background: active ? (p.dir === "L" ? "#22c55e22" : "#ef444422") : "#0f1117",
                  color: active ? (p.dir === "L" ? "#22c55e" : "#ef4444") : "#71717a",
                  border: `1px solid ${active ? (p.dir === "L" ? "#22c55e" : "#ef4444") : "#2a2d3a"}`,
                  borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: active ? 600 : 400,
                }}>{p.ticker} <span style={{ fontSize: 10, opacity: 0.7 }}>{p.dir === "L" ? "LONG" : "SHORT"}</span></button>;
              })}
            </div>
            {allPositions.length === 0 && <p style={{ color: "#71717a" }}>No positions yet. Import data first.</p>}
          </div>

          {tradesLoading && <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#71717a" }}>Fetching price data...</div>}

          {!tradesLoading && tradesTicker && tradesData.length > 0 && <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                {[
                  { l: "YTD Return", v: ytdReturn.toFixed(1) + "%", c: ytdReturn >= 0 ? "#22c55e" : "#ef4444" },
                  { l: "Last Price", v: "$" + lastPrice.toFixed(2), c: "#e4e4e7" },
                  { l: "Avg Size (held)", v: avgSize.toFixed(2) + "%", c: "#e4e4e7" },
                  { l: "Max Size", v: maxSize.toFixed(2) + "%", c: "#e4e4e7" },
                  { l: "Min Size", v: minSize.toFixed(2) + "%", c: "#e4e4e7" },
                  { l: "Avg Price (held)", v: "$" + avgPrice.toFixed(2), c: "#e4e4e7" },
                ].map((c, i) => <div key={i} style={S.card}><div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>{c.l}</div><div style={{ fontSize: 18, fontWeight: 700, color: c.c }}>{c.v}</div></div>)}
              </div>
            </div>

            <div style={{ ...S.card, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{tradesTicker} <Sd d={tradesDir} /> — YTD</h3>
              <p style={{ fontSize: 11, color: "#71717a", marginBottom: 16 }}>Blue line = stock price (left axis) · {tradesDir === "L" ? "Green" : "Red"} area = position weight (right axis)</p>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={tradesData}>
                  <CartesianGrid stroke="#2a2d3a" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} />
                  <YAxis yAxisId="price" orientation="left" tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={v => "$" + v.toFixed(0)} domain={priceRange ? [priceRange.min * 0.95, priceRange.max * 1.05] : ["auto", "auto"]} />
                  <YAxis yAxisId="size" orientation="right" tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={v => v.toFixed(1) + "%"} domain={sizeRange ? [0, sizeRange.max * 1.2] : [0, "auto"]} />
                  <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 6, fontSize: 12 }} formatter={(value, name) => { if (name === "Price") return ["$" + Number(value).toFixed(2), name]; if (name === "Size") return [Number(value).toFixed(2) + "%", name]; return [value, name]; }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="size" type="stepAfter" dataKey="size" name="Size" fill={tradesDir === "L" ? "#22c55e22" : "#ef444422"} stroke={tradesDir === "L" ? "#22c55e" : "#ef4444"} strokeWidth={1.5} connectNulls={false} />
                  <Line yAxisId="price" type="monotone" dataKey="price" name="Price" stroke="#6366f1" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>}

          {!tradesLoading && tradesTicker && tradesData.length === 0 && <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#71717a" }}>No price data found for {tradesTicker}. It may not be available on FMP.</div>}
        </div>;
      })()}

      {/* SETTINGS */}
      {tab === 8 && <div>
        <div style={{ ...S.card, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Export / Import Data</h3>
          <p style={{ fontSize: 12, color: "#71717a", marginBottom: 12 }}>Use this to migrate data or create backups.</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}><button onClick={doExport} style={S.btn}>Export JSON</button></div>
          {showExport && <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: "#22c55e", marginBottom: 6 }}>Copy the JSON below to save or migrate.</p>
            <textarea rows={6} readOnly value={exportJson} style={{ ...S.ta, fontSize: 11 }} onFocus={e => e.target.select()} />
            <button onClick={() => { navigator.clipboard.writeText(exportJson).catch(() => {}); }} style={{ ...S.btnSm, marginTop: 6, background: "#22c55e", color: "#fff" }}>Copy to Clipboard</button>
          </div>}
          <div style={{ borderTop: "1px solid #2a2d3a", paddingTop: 12, marginTop: 4 }}>
            <p style={{ fontSize: 12, color: "#71717a", marginBottom: 6 }}>Paste exported JSON here to import:</p>
            <textarea rows={6} placeholder='{"hist": [...], "dec": [...], ...}' value={importJson} onChange={e => setImportJson(e.target.value)} style={{ ...S.ta, fontSize: 11, marginBottom: 8 }} />
            {importMsg && <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>{importMsg}</p>}
            <button onClick={doImport} disabled={!importJson.trim()} style={{ ...S.btnG, opacity: importJson.trim() ? 1 : 0.4 }}>Import JSON</button>
          </div>
        </div>
        <div style={{ ...S.card, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Data</h3>
          <p style={{ fontSize: 12, color: "#71717a", marginBottom: 4 }}>{hist.length} day(s) positions · {dec.length} day(s) P&L · {[...new Set(hist.flatMap(h => h.entries.map(e => e.ticker)))].length} tickers · {Object.keys(bask).length} baskets</p>
          <div style={{ marginTop: 12 }}>{!confirmClear ? <div style={{ display: "flex", gap: 8 }}><button onClick={() => setConfirmClear(true)} style={S.btnD}>Clear All</button>{hasBak && <button onClick={restore} style={{ ...S.btn, background: "#f59e0b", color: "#0f1117" }}>Restore Backup</button>}</div> : <div><p style={{ fontSize: 13, color: "#ef4444", marginBottom: 8 }}>Sure? Backup saved automatically.</p><div style={{ display: "flex", gap: 8 }}><button onClick={clearAll} style={S.btnD}>Yes, Clear</button><button onClick={() => setConfirmClear(false)} style={S.btnSm}>Cancel</button></div></div>}</div>
        </div>
        {Object.keys(bask).length > 0 && <div style={{ ...S.card, marginBottom: 16 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Baskets</h3>{Object.entries(bask).map(([nm, cs]) => <div key={nm} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #2a2d3a" }}><div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{nm}</div>{editBask === nm ? <div><textarea rows={5} value={editBaskInp} onChange={e => setEditBaskInp(e.target.value)} style={{ ...S.ta, marginBottom: 8 }} /><div style={{ display: "flex", gap: 8 }}><button onClick={saveEditBask} style={{ ...S.btnSm, background: "#22c55e" }}>Save</button><button onClick={() => { setEditBask(null); setEditBaskInp(""); }} style={S.btnSm}>Cancel</button></div></div> : <div><div style={{ fontSize: 12, color: "#71717a", marginBottom: 8 }}>{cs.map(c => `${c.ticker} ${(c.weight * 100).toFixed(0)}%`).join(", ")}</div><div style={{ display: "flex", gap: 8 }}><button onClick={() => { setEditBask(nm); setEditBaskInp(cs.map(c => `${c.ticker} ${(c.weight * 100).toFixed(0)}`).join("\n")); }} style={{ ...S.btnSm, background: "#6366f1" }}>Edit</button><button onClick={() => { const nb = { ...bask }; delete nb[nm]; setBask(nb); sv("pnl-bask", nb); }} style={{ ...S.btnSm, background: "#dc2626" }}>Remove</button></div></div>}</div>)}</div>}
        {known.length > 0 && <div style={{ ...S.card, marginBottom: 16 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Known Tickers</h3><p style={{ fontSize: 12, color: "#71717a", marginBottom: 12 }}>Remove to re-prompt on import.</p><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{known.map(t => <div key={t} style={{ ...S.btnSm, display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}><span>{t}</span><span onClick={() => { const nk = known.filter(x => x !== t); setKnown(nk); sv("pnl-kn", nk); }} style={{ cursor: "pointer", color: "#ef4444", fontWeight: 700 }}>×</span></div>)}</div></div>}
        {hist.length > 0 && <div style={S.card}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Dates</h3><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{hist.map(h => <div key={h.date}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{editDate === h.date ? <><input type="date" value={editDateVal} onChange={e => setEditDateVal(e.target.value)} style={{ ...S.inp, width: 180, padding: "4px 8px" }} /><button onClick={() => saveEditDate(h.date)} style={{ ...S.btnSm, background: "#22c55e", fontSize: 12 }}>Save</button><button onClick={() => setEditDate(null)} style={{ ...S.btnSm, fontSize: 12 }}>Cancel</button></> : <><span style={{ fontSize: 13, minWidth: 100 }}>{h.date}</span><span style={{ fontSize: 11, color: "#71717a" }}>{h.entries.length} pos</span><button onClick={() => { setEditDate(h.date); setEditDateVal(h.date); }} style={{ ...S.btnSm, background: "#6366f1", fontSize: 11 }}>Date</button><button onClick={() => { setEditPosDate(h.date); setEditPosPaste(h.entries.map(e => `\t${e.ticker} -${e.dir}\t\t\t\t${e.dir === "S" ? "(" + e.size.toFixed(2) + ")" : e.size.toFixed(2)}`).join("\n")); }} style={{ ...S.btnSm, background: "#3b82f6", fontSize: 11 }}>Positions</button>{dec.find(d => d.date === h.date) && <button onClick={() => { const dc = dec.find(d => d.date === h.date); const rm = {}; dc.entries.forEach(e => { rm[e.ticker] = e.dailyReturn; }); setEditRetDate(h.date); setEditRetPaste(Object.entries(rm).map(([t, r]) => t + "\t" + (r * 100).toFixed(4)).join("\n")); }} style={{ ...S.btnSm, background: "#f59e0b", color: "#0f1117", fontSize: 11 }}>Returns</button>}<span onClick={() => { setHist(hist.filter(x => x.date !== h.date)); setDec(dec.filter(x => x.date !== h.date)); sv("pnl-hist", hist.filter(x => x.date !== h.date)); sv("pnl-dec", dec.filter(x => x.date !== h.date)); }} style={{ cursor: "pointer", color: "#ef4444", fontWeight: 700, fontSize: 14 }}>×</span></>}</div>
          {editPosDate === h.date && <div style={{ ...S.card, marginTop: 8, marginLeft: 16, borderColor: "#3b82f6" }}><h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Positions — {h.date}</h4><textarea rows={14} value={editPosPaste} onChange={e => setEditPosPaste(e.target.value)} style={S.ta} /><div style={{ display: "flex", gap: 8, marginTop: 10 }}><button onClick={saveEditPos} style={{ ...S.btnSm, background: "#22c55e" }}>Save</button><button onClick={() => { setEditPosDate(null); setEditPosPaste(""); }} style={S.btnSm}>Cancel</button></div></div>}
          {editRetDate === h.date && <div style={{ ...S.card, marginTop: 8, marginLeft: 16, borderColor: "#f59e0b" }}><h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Returns — {h.date}</h4><textarea rows={14} value={editRetPaste} onChange={e => setEditRetPaste(e.target.value)} style={S.ta} /><div style={{ display: "flex", gap: 8, marginTop: 10 }}><button onClick={saveEditRet} style={{ ...S.btnSm, background: "#22c55e" }}>Save</button><button onClick={() => { setEditRetDate(null); setEditRetPaste(""); }} style={S.btnSm}>Cancel</button></div></div>}
        </div>)}</div></div>}
      </div>}
    </div></div>
  );
}