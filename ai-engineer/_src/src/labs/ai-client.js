// Minimalny klient LLM działający w przeglądarce: Anthropic Messages API + API zgodne z OpenAI (OpenAI, Ollama, OpenRouter…).
// Format wiadomości wewnętrznie: jak w Anthropic — { role, content: string | bloki[] }
// bloki: {type:'text',text} {type:'image',mediaType,data} {type:'tool_use',id,name,input} {type:'tool_result',tool_use_id,content,is_error}
var AI = (globalThis.AI = (function () {
  const PRESETS = {
    anthropic: { label: "Anthropic (Claude)", model: "claude-haiku-5-5", baseUrl: "https://api.anthropic.com", needsKey: true, embedModel: "" },
    openai: { label: "OpenAI", model: "gpt-5.4-mini", baseUrl: "https://api.openai.com/v1", needsKey: true, embedModel: "text-embedding-3-small" },
    ollama: { label: "Ollama (lokalnie, za darmo)", model: "qwen3:8b", baseUrl: "http://localhost:11434/v1", needsKey: false, embedModel: "bge-m3" },
    custom: { label: "Inne API zgodne z OpenAI (OpenRouter, Groq…)", model: "", baseUrl: "https://openrouter.ai/api/v1", needsKey: true, embedModel: "" },
  };
  const LS = "aieng-ai-config", LSK = "aieng-ai-key";
  const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };
  let cfg = Object.assign({ provider: "anthropic", model: "", baseUrl: "", priceIn: "", priceOut: "", remember: false, embedModel: "" },
    safe(() => JSON.parse(localStorage.getItem(LS) || "{}"), {}));
  let key = safe(() => localStorage.getItem(LSK) || sessionStorage.getItem(LSK) || "", "");
  const listeners = [];

  function get() {
    const p = PRESETS[cfg.provider] || PRESETS.anthropic;
    return {
      provider: cfg.provider, label: p.label,
      model: cfg.model || p.model, baseUrl: (cfg.baseUrl || p.baseUrl).replace(/\/$/, ""),
      embedModel: cfg.embedModel || p.embedModel,
      priceIn: cfg.priceIn === "" ? null : Number(cfg.priceIn), priceOut: cfg.priceOut === "" ? null : Number(cfg.priceOut),
      remember: !!cfg.remember, hasKey: !!key, needsKey: p.needsKey,
    };
  }
  function set(next, newKey) {
    cfg = Object.assign(cfg, next);
    safe(() => localStorage.setItem(LS, JSON.stringify(cfg)));
    if (newKey !== undefined) key = newKey.trim();
    safe(() => { localStorage.removeItem(LSK); sessionStorage.removeItem(LSK); });
    if (key) safe(() => (cfg.remember ? localStorage : sessionStorage).setItem(LSK, key));
    listeners.forEach(f => safe(f));
  }
  function forgetKey() { set({}, ""); }
  function ready() { const c = get(); return !!c.model && (!c.needsKey || c.hasKey); }
  function onChange(f) { listeners.push(f); }
  function cost(usage) {
    const c = get();
    if (!usage || c.priceIn == null || c.priceOut == null) return null;
    return ((usage.input || 0) * c.priceIn + (usage.output || 0) * c.priceOut) / 1e6;
  }

  // ---------- konwersje ----------
  function toAnthropicMessages(messages) {
    return messages.map(m => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content.map(b => {
        if (b.type === "image") return { type: "image", source: { type: "base64", media_type: b.mediaType, data: b.data } };
        if (b.type === "tool_result") return { type: "tool_result", tool_use_id: b.tool_use_id, content: String(b.content), ...(b.is_error ? { is_error: true } : {}) };
        if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
        return { type: "text", text: b.text };
      }),
    }));
  }
  function toOpenAIMessages(system, messages) {
    const out = [];
    if (system) out.push({ role: "system", content: system });
    for (const m of messages) {
      if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue; }
      if (m.role === "assistant") {
        const text = m.content.filter(b => b.type === "text").map(b => b.text).join("");
        const calls = m.content.filter(b => b.type === "tool_use");
        const msg = { role: "assistant", content: text || null };
        if (calls.length) msg.tool_calls = calls.map(c => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input || {}) } }));
        out.push(msg);
        continue;
      }
      const results = m.content.filter(b => b.type === "tool_result");
      results.forEach(r => out.push({ role: "tool", tool_call_id: r.tool_use_id, content: (r.is_error ? "BŁĄD: " : "") + String(r.content) }));
      const parts = m.content.filter(b => b.type !== "tool_result").map(b =>
        b.type === "image" ? { type: "image_url", image_url: { url: "data:" + b.mediaType + ";base64," + b.data } } : { type: "text", text: b.text });
      if (parts.length) out.push({ role: "user", content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts });
    }
    return out;
  }

  async function readError(res) {
    let msg = res.status + " " + res.statusText;
    try {
      const j = await res.json();
      msg = (j.error && (j.error.message || j.error)) || j.message || JSON.stringify(j);
    } catch (e) { }
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    return err;
  }
  function explain(err, c) {
    if (err.name === "AbortError") return err;
    if (err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(err.message)) {
      const e = new Error(c.provider === "ollama"
        ? "Nie udało się połączyć z Ollamą. Sprawdź, czy działa (ollama serve) i czy uruchomiłeś ją ze zmienną OLLAMA_ORIGINS obejmującą adres tej strony (instrukcja w „Laboratorium: jak zacząć”)."
        : "Błąd sieci lub CORS. Sprawdź adres API i połączenie z internetem.");
      e.status = 0;
      return e;
    }
    if (err.status === 401 || err.status === 403) err.message = "Klucz API odrzucony (" + err.status + "): " + err.message;
    if (err.status === 429) err.message = "Limit zapytań (429) — odczekaj chwilę. " + err.message;
    return err;
  }

  // ---------- chat ----------
  async function chat(o) {
    const c = get();
    if (!ready()) throw new Error("Najpierw skonfiguruj dostawcę AI (przycisk 🔑 AI u góry strony).");
    const t0 = performance.now();
    let note = "";
    let opts = Object.assign({ maxTokens: 1024 }, o);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = c.provider === "anthropic" ? await anthropicChat(c, opts) : await openaiChat(c, opts);
        r.ms = Math.round(performance.now() - t0);
        r.note = note;
        r.costUsd = cost(r.usage);
        return r;
      } catch (err) {
        const m = String(err.message || "");
        if (err.status === 400 && opts.temperature != null && /temperature/i.test(m)) {
          note = "Ten model nie przyjmuje parametru temperature — wysłano zapytanie bez niego.";
          opts = Object.assign({}, opts, { temperature: undefined });
          continue;
        }
        if (err.status === 400 && /max_completion_tokens/.test(m) && !opts.__useCompletion) {
          opts = Object.assign({}, opts, { __useCompletion: true });
          continue;
        }
        if (err.status === 400 && opts.jsonSchema && c.provider !== "anthropic" && /response_format|json_schema/i.test(m) && !opts.__noSchema) {
          note = "Ten model/dostawca nie obsługuje response_format json_schema — użyto zwykłego trybu JSON z instrukcją w prompcie.";
          opts = Object.assign({}, opts, { __noSchema: true });
          continue;
        }
        throw explain(err, c);
      }
    }
  }

  async function anthropicChat(c, o) {
    const body = { model: c.model, max_tokens: o.maxTokens, messages: toAnthropicMessages(o.messages) };
    if (o.system) body.system = o.system;
    if (o.temperature != null) body.temperature = o.temperature;
    let tools = (o.tools || []).map(t => ({ name: t.name, description: t.description, input_schema: t.schema }));
    if (o.jsonSchema) {
      tools = [{ name: o.jsonSchema.name, description: o.jsonSchema.description || "Zwraca wynik w ustalonym formacie.", input_schema: o.jsonSchema.schema }];
      body.tool_choice = { type: "tool", name: o.jsonSchema.name };
    } else if (o.toolChoice === "any") body.tool_choice = { type: "any" };
    if (tools.length) body.tools = tools;
    if (o.stream) body.stream = true;
    const res = await fetch(c.baseUrl + "/v1/messages", {
      method: "POST", signal: o.signal,
      headers: {
        "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await readError(res);
    if (o.stream) return anthropicStream(res, o);
    const j = await res.json();
    return normAnthropic(j, o);
  }
  function normAnthropic(j, o) {
    const text = j.content.filter(b => b.type === "text").map(b => b.text).join("");
    const toolCalls = j.content.filter(b => b.type === "tool_use").map(b => ({ id: b.id, name: b.name, input: b.input }));
    const r = { text, toolCalls, content: j.content.filter(b => b.type === "text" || b.type === "tool_use"), stopReason: j.stop_reason, usage: { input: j.usage.input_tokens + (j.usage.cache_read_input_tokens || 0) + (j.usage.cache_creation_input_tokens || 0), output: j.usage.output_tokens }, raw: j };
    if (o.jsonSchema) { r.json = toolCalls.length ? toolCalls[0].input : null; r.toolCalls = []; r.stopReason = "end_turn"; }
    return r;
  }
  async function anthropicStream(res, o) {
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", text = "", stopReason = null, ttft = null;
    const usage = { input: 0, output: 0 };
    const t0 = performance.now();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, i); buf = buf.slice(i + 2);
        if (o.onRaw) o.onRaw(raw);
        const data = raw.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("\n");
        if (!data) continue;
        const ev = JSON.parse(data);
        if (ev.type === "message_start") { usage.input = ev.message.usage.input_tokens; usage.output = ev.message.usage.output_tokens || 0; }
        else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          if (ttft == null) ttft = Math.round(performance.now() - t0);
          text += ev.delta.text; if (o.onText) o.onText(ev.delta.text);
        } else if (ev.type === "message_delta") {
          if (ev.delta && ev.delta.stop_reason) stopReason = ev.delta.stop_reason;
          if (ev.usage && ev.usage.output_tokens != null) usage.output = ev.usage.output_tokens;
        } else if (ev.type === "error") { const e = new Error(ev.error.message); e.status = 529; throw e; }
      }
    }
    return { text, toolCalls: [], content: [{ type: "text", text }], stopReason, usage, ttft };
  }

  async function openaiChat(c, o) {
    const body = { model: c.model, messages: toOpenAIMessages(o.system, o.messages) };
    const useCompletion = c.provider === "openai" || o.__useCompletion;
    body[useCompletion ? "max_completion_tokens" : "max_tokens"] = o.maxTokens;
    if (o.temperature != null) body.temperature = o.temperature;
    if (o.tools && o.tools.length) {
      body.tools = o.tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } }));
      if (o.toolChoice === "any") body.tool_choice = "required";
    }
    if (o.jsonSchema) {
      if (o.__noSchema) {
        body.response_format = { type: "json_object" };
        body.messages.push({ role: "system", content: "Zwróć wyłącznie obiekt JSON zgodny z tym schematem: " + JSON.stringify(o.jsonSchema.schema) });
      } else body.response_format = { type: "json_schema", json_schema: { name: o.jsonSchema.name, schema: o.jsonSchema.schema, strict: true } };
    }
    if (o.stream) { body.stream = true; if (c.provider !== "ollama") body.stream_options = { include_usage: true }; }
    const headers = { "content-type": "application/json" };
    if (key) headers.authorization = "Bearer " + key;
    const res = await fetch(c.baseUrl + "/chat/completions", { method: "POST", headers, body: JSON.stringify(body), signal: o.signal });
    if (!res.ok) throw await readError(res);
    if (o.stream) return openaiStream(res, o);
    const j = await res.json();
    const ch = j.choices[0], msg = ch.message;
    const toolCalls = (msg.tool_calls || []).map(tc => ({ id: tc.id, name: tc.function.name, input: safe(() => JSON.parse(tc.function.arguments || "{}"), { __invalid_json: tc.function.arguments }) }));
    const text = msg.content || "";
    const map = { stop: "end_turn", length: "max_tokens", tool_calls: "tool_use", content_filter: "refusal" };
    const r = {
      text, toolCalls,
      content: [...(text ? [{ type: "text", text }] : []), ...toolCalls.map(t => ({ type: "tool_use", ...t }))],
      stopReason: toolCalls.length ? "tool_use" : (map[ch.finish_reason] || ch.finish_reason),
      usage: { input: (j.usage && j.usage.prompt_tokens) || 0, output: (j.usage && j.usage.completion_tokens) || 0 }, raw: j,
    };
    if (o.jsonSchema) r.json = safe(() => JSON.parse(text.replace(/^[^{]*/, "").replace(/[^}]*$/, "")), null);
    return r;
  }
  async function openaiStream(res, o) {
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", text = "", stopReason = null, ttft = null;
    const usage = { input: 0, output: 0 };
    const t0 = performance.now();
    const map = { stop: "end_turn", length: "max_tokens" };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        if (o.onRaw) o.onRaw(line);
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        const ev = JSON.parse(data);
        const ch = ev.choices && ev.choices[0];
        if (ch && ch.delta && ch.delta.content) {
          if (ttft == null) ttft = Math.round(performance.now() - t0);
          text += ch.delta.content; if (o.onText) o.onText(ch.delta.content);
        }
        if (ch && ch.finish_reason) stopReason = map[ch.finish_reason] || ch.finish_reason;
        if (ev.usage) { usage.input = ev.usage.prompt_tokens; usage.output = ev.usage.completion_tokens; }
      }
    }
    return { text, toolCalls: [], content: [{ type: "text", text }], stopReason, usage, ttft };
  }

  async function embed(texts) {
    const c = get();
    if (c.provider === "anthropic") throw new Error("Anthropic nie udostępnia modeli embeddingów — użyj modelu w przeglądarce albo dostawcy OpenAI/Ollama.");
    const headers = { "content-type": "application/json" };
    if (key) headers.authorization = "Bearer " + key;
    const out = [];
    for (let i = 0; i < texts.length; i += 64) {
      const res = await fetch(c.baseUrl + "/embeddings", { method: "POST", headers, body: JSON.stringify({ model: c.embedModel, input: texts.slice(i, i + 64) }) }).catch(e => { throw explain(e, c); });
      if (!res.ok) throw explain(await readError(res), c);
      const j = await res.json();
      out.push(...j.data.sort((a, b) => a.index - b.index).map(d => d.embedding));
    }
    return out;
  }

  return { PRESETS, get, set, forgetKey, ready, onChange, chat, embed, cost };
})());
