// Wspólne elementy laboratorium: narzędzia, ustawienia dostawcy AI, edytor i runner zadań, „skorupa” labów.
var LAB = (globalThis.LAB = (function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  };
  const usd = v => { const c = globalThis.AI ? AI.get() : {}; if (v == null || c.priceIn == null || c.priceOut == null) return "—"; return v < 0.01 ? "$" + v.toFixed(5) : "$" + v.toFixed(4); };
  const tpl = (s, vars) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  const strip = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function pool(items, n, fn) {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
    }));
    return out;
  }

  // ---------- wyszukiwanie leksykalne (BM25) i wektorowe ----------
  const tokenize = (s, stem = 0) => strip(s).split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1).map(t => (stem ? t.slice(0, stem) : t));
  // stem > 0: prosty „stemming przez obcięcie” — zostawia pierwsze N znaków słowa (tani trik dla języków fleksyjnych)
  function bm25Index(texts, { k1 = 1.2, b = 0.75, stem = 0 } = {}) {
    const tok = s => tokenize(s, stem);
    const toks = texts.map(tok), N = texts.length;
    const avgdl = toks.reduce((s, t) => s + t.length, 0) / Math.max(N, 1);
    const df = new Map();
    toks.forEach(t => new Set(t).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
    return function search(q) {
      const qt = [...new Set(tok(q))];
      return toks.map((t, i) => {
        let s = 0;
        for (const w of qt) {
          const n = df.get(w); if (!n) continue;
          let tf = 0; for (const x of t) if (x === w) tf++;
          if (!tf) continue;
          s += Math.log((N - n + 0.5) / (n + 0.5) + 1) * tf * (k1 + 1) / (tf + k1 * (1 - b + b * t.length / avgdl));
        }
        return { i, score: s };
      }).sort((a, b) => b.score - a.score);
    };
  }
  function cosine(a, b) { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; }
  function vecSearch(qv, vecs) { return vecs.map((v, i) => ({ i, score: cosine(qv, v) })).sort((a, b) => b.score - a.score); }
  function rrf(lists, k = 60) {
    const s = new Map();
    lists.forEach(l => l.forEach((r, pos) => s.set(r.i, (s.get(r.i) || 0) + 1 / (k + pos + 1))));
    return [...s.entries()].map(([i, score]) => ({ i, score })).sort((a, b) => b.score - a.score);
  }

  // ---------- embeddingi w przeglądarce (transformers.js) albo przez API ----------
  const EMB = {
    model: null, loading: null, backend: "browser", listeners: [],
    MODEL_ID: "Xenova/multilingual-e5-small", CDN: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1",
    ready() { return this.backend === "api" ? AI.ready() && AI.get().provider !== "anthropic" : !!this.model; },
    async load(onProgress) {
      if (this.model) return this.model;
      if (!this.loading) {
        this.loading = (async () => {
          const tf = await import(this.CDN);
          const files = {};
          this.model = await tf.pipeline("feature-extraction", this.MODEL_ID, {
            dtype: "q8",
            progress_callback: p => {
              if (p.status === "progress" && p.total) { files[p.file] = [p.loaded, p.total]; }
              const vals = Object.values(files), loaded = vals.reduce((s, v) => s + v[0], 0), total = vals.reduce((s, v) => s + v[1], 0);
              if (onProgress) onProgress(total ? loaded / total : 0, loaded, total);
            },
          });
          this.listeners.forEach(f => f());
          return this.model;
        })().catch(e => { this.loading = null; throw e; });
      }
      return this.loading;
    },
    // kind: 'query' | 'passage' — modele E5 wymagają prefiksów
    async embed(texts, kind, { prefixes = true } = {}) {
      if (this.backend === "api") return AI.embed(texts);
      const m = await this.load();
      const input = prefixes ? texts.map(t => kind + ": " + t) : texts;
      const out = [];
      for (let i = 0; i < input.length; i += 16) {
        const t = await m(input.slice(i, i + 16), { pooling: "mean", normalize: true });
        out.push(...t.tolist());
      }
      return out;
    },
  };

  // ---------- ustawienia dostawcy AI ----------
  function settingsDialog() {
    let dlg = $("#aiSettings");
    if (dlg) return dlg;
    dlg = document.createElement("div");
    dlg.id = "aiSettings"; dlg.className = "modal"; dlg.hidden = true;
    dlg.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="aiSetTitle">' +
      '<div class="modal-head"><b id="aiSetTitle">Dostawca AI dla laboratoriów</b><button class="btn secondary sm" data-close>✕</button></div>' +
      '<label>Dostawca</label><select name="provider">' + Object.entries(AI.PRESETS).map(([k, p]) => '<option value="' + k + '">' + esc(p.label) + "</option>").join("") + "</select>" +
      '<div class="row"><div><label>Model</label><input type="text" name="model"></div><div class="f-base"><label>Adres API</label><input type="text" name="baseUrl"></div></div>' +
      '<div class="f-key"><label>Klucz API</label><input type="password" name="key" autocomplete="off" placeholder="wklej klucz"></div>' +
      '<label class="inline"><input type="checkbox" name="remember"> Zapamiętaj klucz w tej przeglądarce (bez zaznaczenia: tylko do zamknięcia karty)</label>' +
      '<div class="row"><div><label>Cena input ($ / MTok)</label><input type="number" step="0.001" name="priceIn" placeholder="z cennika"></div><div><label>Cena output ($ / MTok)</label><input type="number" step="0.001" name="priceOut" placeholder="z cennika"></div><div class="f-emb"><label>Model embeddingów</label><input type="text" name="embedModel"></div></div>' +
      '<div class="controls"><button class="btn" data-save>Zapisz</button><button class="btn secondary" data-test>Test połączenia</button><button class="btn secondary" data-forget>Usuń klucz</button></div>' +
      '<div class="out" data-out></div>' +
      '<details><summary>Bezpieczeństwo klucza — przeczytaj</summary><ul style="font-size:.88rem">' +
      "<li>Klucz trafia wyłącznie do wybranego dostawcy, bezpośrednio z Twojej przeglądarki. Ta strona nie ma serwera, który mógłby go zobaczyć.</li>" +
      "<li>Klucz w przeglądarce może odczytać każdy skrypt działający na tej samej domenie. To akceptowalne na Twojej prywatnej stronie do nauki, <b>nie</b> w aplikacji dla klientów (moduł 04: klucz zawsze na backendzie).</li>" +
      "<li>Utwórz osobny klucz tylko do nauki i ustaw w panelu dostawcy niski limit wydatków. Po nauce możesz go unieważnić.</li>" +
      "<li>Ollama działa lokalnie i nie wymaga klucza — to darmowa alternatywa (instrukcja w sekcji „Laboratorium: jak zacząć”).</li></ul></details>" +
      "</div>";
    document.body.appendChild(dlg);
    const f = n => $('[name="' + n + '"]', dlg);
    function fill() {
      const c = AI.get();
      f("provider").value = c.provider; f("model").value = c.model; f("baseUrl").value = c.baseUrl;
      f("remember").checked = c.remember; f("priceIn").value = c.priceIn == null ? "" : c.priceIn; f("priceOut").value = c.priceOut == null ? "" : c.priceOut;
      f("embedModel").value = c.embedModel; f("key").value = ""; f("key").placeholder = c.hasKey ? "•••••• (zapisany — wpisz, by zmienić)" : "wklej klucz";
      $(".f-key", dlg).style.display = AI.PRESETS[c.provider].needsKey ? "" : "none";
    }
    f("provider").addEventListener("change", () => {
      const p = AI.PRESETS[f("provider").value];
      f("model").value = p.model; f("baseUrl").value = p.baseUrl; f("embedModel").value = p.embedModel;
      $(".f-key", dlg).style.display = p.needsKey ? "" : "none";
    });
    function save() {
      const p = AI.PRESETS[f("provider").value];
      AI.set({
        provider: f("provider").value,
        model: f("model").value.trim() === p.model ? "" : f("model").value.trim(),
        baseUrl: f("baseUrl").value.trim() === p.baseUrl ? "" : f("baseUrl").value.trim(),
        embedModel: f("embedModel").value.trim() === p.embedModel ? "" : f("embedModel").value.trim(),
        remember: f("remember").checked, priceIn: f("priceIn").value, priceOut: f("priceOut").value,
      }, f("key").value ? f("key").value : undefined);
      fill();
    }
    $("[data-save]", dlg).addEventListener("click", () => { save(); $("[data-out]", dlg).innerHTML = '<span class="pill ok">Zapisano</span>'; });
    $("[data-forget]", dlg).addEventListener("click", () => { AI.forgetKey(); fill(); $("[data-out]", dlg).innerHTML = '<span class="pill">Klucz usunięty</span>'; });
    $("[data-test]", dlg).addEventListener("click", async () => {
      save();
      const out = $("[data-out]", dlg);
      out.innerHTML = '<span class="pill">Łączę…</span>';
      try {
        const r = await AI.chat({ messages: [{ role: "user", content: "Odpowiedz jednym słowem: działa" }], maxTokens: 20 });
        out.innerHTML = '<span class="pill ok">✓ Połączono</span> <span class="stat">odpowiedź: <b>' + esc(r.text.slice(0, 60)) + '</b></span><span class="stat">' + r.ms + " ms</span>" + (r.note ? '<div class="muted-s">' + esc(r.note) + "</div>" : "");
      } catch (e) { out.innerHTML = '<span class="pill bad">✗ ' + esc(e.message) + "</span>"; }
    });
    $("[data-close]", dlg).addEventListener("click", () => (dlg.hidden = true));
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.hidden = true; });
    document.addEventListener("keydown", e => { if (e.key === "Escape") dlg.hidden = true; });
    dlg.__fill = fill;
    return dlg;
  }
  function openSettings() { const d = settingsDialog(); d.__fill(); d.hidden = false; setTimeout(() => $("select", d).focus(), 30); }

  function providerPill() {
    const span = document.createElement("span");
    span.className = "prov-pill";
    const upd = () => {
      const c = AI.get();
      span.innerHTML = AI.ready()
        ? '<span class="dot ok"></span>' + esc(c.label.split(" (")[0]) + " · <code>" + esc(c.model) + "</code>"
        : '<span class="dot"></span>Brak dostawcy AI — <a href="#" data-open-settings>skonfiguruj</a>';
    };
    upd(); AI.onChange(upd);
    span.addEventListener("click", e => { if (e.target.matches("[data-open-settings]")) { e.preventDefault(); openSettings(); } });
    return span;
  }

  // ---------- edytor kodu z podświetlaniem ----------
  function editor(initial, { onRun, onChange, readOnly } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "editor";
    wrap.innerHTML = '<pre aria-hidden="true"><code class="language-javascript"></code></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off"></textarea>';
    const ta = $("textarea", wrap), code = $("code", wrap), pre = $("pre", wrap);
    if (readOnly) ta.readOnly = true;
    function paint() {
      const v = ta.value + (ta.value.endsWith("\n") ? " " : "");
      if (globalThis.hljs) code.innerHTML = hljs.highlight(v, { language: "javascript" }).value; else code.textContent = v;
      const lines = ta.value.split("\n").length;
      ta.style.height = Math.max(6, Math.min(lines, 40)) * 1.55 + 1.6 + "em";
    }
    ta.addEventListener("input", () => { paint(); if (onChange) onChange(ta.value); });
    ta.addEventListener("scroll", () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
    ta.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); if (onRun) onRun(); return; }
      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        if (e.shiftKey) {
          const ls = ta.value.lastIndexOf("\n", s - 1) + 1;
          if (ta.value.slice(ls, ls + 2) === "  ") { ta.setRangeText("", ls, ls + 2); ta.selectionStart = ta.selectionEnd = Math.max(ls, s - 2); }
        } else { ta.setRangeText("  ", s, en, "end"); }
        paint(); if (onChange) onChange(ta.value);
      } else if (e.key === "Enter") {
        const s = ta.selectionStart, ls = ta.value.lastIndexOf("\n", s - 1) + 1;
        const indent = (/^\s*/.exec(ta.value.slice(ls, s)) || [""])[0];
        const extra = /[{([]\s*$/.test(ta.value.slice(ls, s)) ? "  " : "";
        e.preventDefault();
        ta.setRangeText("\n" + indent + extra, s, ta.selectionEnd, "end");
        paint(); if (onChange) onChange(ta.value);
      }
    });
    ta.value = initial; paint();
    return { el: wrap, get value() { return ta.value; }, set value(v) { ta.value = v; paint(); if (onChange) onChange(v); }, focus() { ta.focus(); }, repaint: paint };
  }

  // ---------- runner zadań (Web Worker z limitem czasu) ----------
  function runInWorker(code, tests, timeoutMs = 4000) {
    return new Promise(resolve => {
      let w;
      try {
        const src = globalThis.__KATA_RUNTIME_SRC + "\nself.onmessage = async e => { const r = await runKata(e.data.code, e.data.tests); self.postMessage(r); };";
        w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      } catch (e) {
        // awaryjnie w głównym wątku (bez ochrony przed nieskończoną pętlą)
        return runKata(code, tests).then(resolve);
      }
      const t = setTimeout(() => { w.terminate(); resolve({ fatal: "Przekroczono limit czasu " + timeoutMs / 1000 + " s — sprawdź, czy nie masz nieskończonej pętli.", results: [], logs: [] }); }, timeoutMs);
      w.onmessage = e => { clearTimeout(t); w.terminate(); resolve(e.data); };
      w.onerror = e => { clearTimeout(t); w.terminate(); resolve({ fatal: e.message || "Błąd wykonania", results: [], logs: [] }); };
      w.postMessage({ code, tests });
    });
  }

  const kataDone = () => store.get("aieng-kata-done", {});
  const listeners = [];
  function markKata(id) { const d = kataDone(); d[id] = true; store.set("aieng-kata-done", d); listeners.forEach(f => f()); }

  function renderKata(el) {
    const id = el.dataset.kata, k = globalThis.KATAS[id];
    if (!k) { el.textContent = "Brak zadania " + id; return; }
    const saveKey = "aieng-kata-" + id;
    el.classList.add("kata");
    el.id = el.id || "kata-" + id;
    el.innerHTML =
      '<div class="kata-head"><span class="kata-badge">Zadanie z kodem</span><span class="lvl" title="poziom trudności">' + "●".repeat(k.level) + "○".repeat(3 - k.level) + '</span><b class="kata-title">' + esc(k.title) + '</b><span class="kata-done" hidden>✓ zaliczone</span></div>' +
      '<p class="kata-scenario"><b>Sytuacja:</b> ' + k.scenario + "</p>" +
      '<div class="kata-task">' + k.task + "</div>" +
      '<div class="kata-ed"></div>' +
      '<div class="controls"><button class="btn" data-run>▶ Uruchom testy</button><button class="btn secondary" data-hint>💡 Podpowiedź</button><button class="btn secondary" data-sol>Pokaż rozwiązanie</button><button class="btn secondary" data-reset>↺ Reset</button><span class="muted-s">Ctrl/⌘ + Enter uruchamia</span></div>' +
      '<div class="kata-out" aria-live="polite"></div><div class="kata-hints"></div><div class="kata-sol"></div>';
    const ed = editor(store.get(saveKey, k.starter), { onRun: run, onChange: v => store.set(saveKey, v) });
    $(".kata-ed", el).appendChild(ed.el);
    const out = $(".kata-out", el), doneBadge = $(".kata-done", el);
    const refresh = () => { doneBadge.hidden = !kataDone()[id]; };
    refresh(); listeners.push(refresh);

    async function run() {
      const btn = $("[data-run]", el);
      btn.disabled = true; out.innerHTML = '<span class="pill">Uruchamiam…</span>';
      const r = await runInWorker(ed.value, k.tests);
      btn.disabled = false;
      let html = "";
      if (r.fatal) html += '<div class="res bad"><b>Błąd:</b> ' + esc(r.fatal) + "</div>";
      const passed = r.results.filter(x => x.ok).length;
      if (r.results.length) {
        html += '<div class="res-sum ' + (passed === r.results.length ? "ok" : "") + '">' + (passed === r.results.length ? "✓ Wszystkie testy przechodzą" : "Testy: " + passed + " / " + r.results.length) + "</div>";
        html += r.results.map(x => '<div class="res ' + (x.ok ? "ok" : "bad") + '">' + (x.ok ? "✓" : "✗") + " " + esc(x.name) + (x.ok ? "" : '<div class="res-msg">' + esc(x.msg) + "</div>") + "</div>").join("");
      }
      if (r.logs && r.logs.length) html += '<details open><summary>console.log (' + r.logs.length + ")</summary><pre class=\"logs\">" + esc(r.logs.slice(0, 50).join("\n")) + "</pre></details>";
      out.innerHTML = html;
      if (!r.fatal && r.results.length && passed === r.results.length) {
        markKata(id);
        if (!$(".kata-sol .code", el)) $("[data-sol]", el).textContent = "Porównaj z rozwiązaniem wzorcowym";
      }
    }
    let hintN = 0;
    $("[data-run]", el).addEventListener("click", run);
    $("[data-hint]", el).addEventListener("click", function () {
      if (hintN >= k.hints.length) return;
      $(".kata-hints", el).insertAdjacentHTML("beforeend", '<div class="callout tip"><span class="t">Podpowiedź ' + (hintN + 1) + "/" + k.hints.length + "</span>" + esc(k.hints[hintN]) + "</div>");
      hintN++;
      this.textContent = hintN >= k.hints.length ? "💡 Brak kolejnych podpowiedzi" : "💡 Kolejna podpowiedź";
      if (hintN >= k.hints.length) this.disabled = true;
    });
    let solArmed = false;
    $("[data-sol]", el).addEventListener("click", function () {
      if (!kataDone()[id] && !solArmed) { solArmed = true; this.textContent = "Na pewno? Kliknij ponownie"; return; }
      const box = $(".kata-sol", el);
      if (box.innerHTML) { box.innerHTML = ""; this.textContent = "Pokaż rozwiązanie"; return; }
      box.innerHTML = '<div class="code"><div class="code-head"><span>rozwiązanie wzorcowe</span><button class="copy" data-ins>wstaw do edytora</button></div><pre><code class="language-javascript"></code></pre></div>';
      const c = $("code", box); c.textContent = k.solution; if (globalThis.hljs) hljs.highlightElement(c);
      $("[data-ins]", box).addEventListener("click", () => { ed.value = k.solution; });
      this.textContent = "Ukryj rozwiązanie";
    });
    $("[data-reset]", el).addEventListener("click", function () {
      if (this.dataset.armed) { ed.value = k.starter; delete this.dataset.armed; this.textContent = "↺ Reset"; out.innerHTML = ""; return; }
      this.dataset.armed = 1; this.textContent = "Na pewno? (kasuje Twój kod)";
      setTimeout(() => { delete this.dataset.armed; this.textContent = "↺ Reset"; }, 3000);
    });
  }

  // ---------- skorupa laboratorium ----------
  function shell(el, { title, scenario, tasks, needsAI = true, key }) {
    el.classList.add("lab");
    el.id = el.id || "lab-" + key;
    el.innerHTML =
      '<div class="lab-head"><span class="lab-badge">Laboratorium' + (needsAI ? " · LLM" : "") + '</span><b class="lab-title">' + esc(title) + "</b></div>" +
      '<p class="kata-scenario"><b>Sytuacja:</b> ' + scenario + "</p>" +
      (tasks && tasks.length ? '<details class="lab-tasks" open><summary>Twoje zadania (' + tasks.length + ')</summary><ul class="checklist">' + tasks.map((t, i) => '<li><input type="checkbox" data-id="lab-' + key + "-" + i + '"><span>' + t + "</span></li>").join("") + "</ul></details>" : "") +
      '<div class="lab-prov"></div><div class="lab-body"></div>';
    if (needsAI) $(".lab-prov", el).appendChild(providerPill());
    return $(".lab-body", el);
  }
  function needAI() {
    if (AI.ready()) return true;
    openSettings();
    return false;
  }
  function errBox(e) { return '<div class="res bad"><b>Błąd:</b> ' + esc(e.message || e) + "</div>"; }

  function approve(title, details) {
    return new Promise(resolve => {
      const m = document.createElement("div");
      m.className = "modal";
      m.innerHTML = '<div class="modal-card" role="alertdialog" aria-modal="true"><div class="modal-head"><b>⚠ ' + esc(title) + "</b></div>" + details +
        '<div class="controls"><button class="btn" data-y>Zatwierdź</button><button class="btn secondary" data-n>Odrzuć</button></div></div>';
      document.body.appendChild(m);
      const done = v => { m.remove(); resolve(v); };
      $("[data-y]", m).addEventListener("click", () => done(true));
      $("[data-n]", m).addEventListener("click", () => done(false));
      setTimeout(() => $("[data-n]", m).focus(), 20);
    });
  }

  const LABS = {};
  function init() {
    const btn = document.createElement("button");
    btn.id = "aiBtn"; btn.textContent = "🔑 AI"; btn.title = "Dostawca AI dla laboratoriów";
    btn.addEventListener("click", openSettings);
    const theme = $("#themeBtn");
    if (theme) theme.parentNode.insertBefore(btn, theme);
    $$("[data-kata]").forEach(el => { try { renderKata(el); } catch (e) { el.innerHTML = errBox(e); console.error(e); } });
    $$("[data-lab]").forEach(el => {
      const f = LABS[el.dataset.lab];
      if (f) { try { f(el); } catch (e) { el.innerHTML = errBox(e); console.error(e); } }
    });
    $$("[data-open-settings]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); openSettings(); }));
  }

  return { $, $$, esc, store, usd, tpl, strip, sleep, pool, tokenize, bm25Index, cosine, vecSearch, rrf, EMB, openSettings, providerPill, editor, runInWorker, renderKata, shell, needAI, errBox, approve, LABS, init, kataDone, onKataDone: f => listeners.push(f) };
})());
