// Środowisko uruchomieniowe zadań z kodem. Działa w Web Workerze (przeglądarka) i w Node (weryfikacja rozwiązań).
// Nie używa DOM. Eksportuje funkcję runKata(code, tests) -> Promise<{fatal?, results, logs}>
function __fmt(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "undefined") return "undefined";
  if (typeof v === "function") return "[funkcja]";
  if (Number.isNaN(v)) return "NaN";
  try {
    const s = JSON.stringify(v, (k, x) => (x instanceof Set ? [...x] : x instanceof Map ? Object.fromEntries(x) : x));
    return s === undefined ? String(v) : s.length > 400 ? s.slice(0, 400) + "…" : s;
  } catch (e) { return String(v); }
}
function __deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => __deepEqual(x, b[i]));
  const ka = Object.keys(a).filter(k => a[k] !== undefined).sort(), kb = Object.keys(b).filter(k => b[k] !== undefined).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && __deepEqual(a[k], b[k]));
}
function __deepClose(a, b, eps) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= eps;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => __deepClose(x, b[i], eps));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && __deepClose(a[k], b[k], eps));
  }
  return Object.is(a, b);
}
async function runKata(code, tests) {
  const logs = [];
  const fakeConsole = {
    log: (...a) => logs.push(a.map(x => (typeof x === "string" ? x : __fmt(x))).join(" ")),
  };
  fakeConsole.info = fakeConsole.warn = fakeConsole.error = fakeConsole.log;
  const T = [];
  const test = (name, fn) => T.push({ name, fn });
  const fail = msg => { const e = new Error(msg); e.__assert = true; throw e; };
  const assert = (cond, msg) => { if (!cond) fail(msg || "Warunek niespełniony"); };
  const assertEqual = (actual, expected, msg) => {
    if (!__deepEqual(actual, expected)) fail((msg ? msg + ": " : "") + "oczekiwano " + __fmt(expected) + ", otrzymano " + __fmt(actual));
  };
  const assertClose = (actual, expected, eps = 1e-6, msg) => {
    if (!__deepClose(actual, expected, eps)) fail((msg ? msg + ": " : "") + "oczekiwano ≈ " + __fmt(expected) + " (±" + eps + "), otrzymano " + __fmt(actual));
  };
  const assertThrows = async (fn, msg) => {
    let threw = false;
    try { await fn(); } catch (e) { threw = true; }
    if (!threw) fail(msg || "Oczekiwano wyjątku, a funkcja zakończyła się poprawnie");
  };
  try {
    const f = new Function("test", "assert", "assertEqual", "assertClose", "assertThrows", "console",
      '"use strict";\n' + code + "\n;\n" + tests);
    f(test, assert, assertEqual, assertClose, assertThrows, fakeConsole);
  } catch (e) {
    return { fatal: (e && e.name ? e.name + ": " : "") + (e && e.message ? e.message : String(e)), results: [], logs };
  }
  const results = [];
  for (const t of T) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (e) {
      results.push({ name: t.name, ok: false, msg: e && e.__assert ? e.message : (e && e.name ? e.name + ": " : "") + (e && e.message ? e.message : String(e)) });
    }
  }
  return { results, logs };
}
if (typeof module !== "undefined") module.exports = { runKata };
