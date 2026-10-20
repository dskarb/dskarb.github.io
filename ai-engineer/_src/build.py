import re, html, glob, textwrap, pathlib

ROOT = pathlib.Path(__file__).parent
css = (ROOT / "src/style.css").read_text(encoding="utf-8")
js = (ROOT / "src/app.js").read_text(encoding="utf-8")
hljs = (ROOT / "src/vendor/highlight.min.js").read_text(encoding="utf-8")
hlcss = (ROOT / "src/vendor/atom-one-dark.min.css").read_text(encoding="utf-8")
import json
LAB_FILES = ["kata-runtime", "katas-a", "katas-b", "katas-c", "lab-data", "ai-client", "labs-core", "labs-a", "labs-b"]
runtime_src = (ROOT / "src/labs/kata-runtime.js").read_text(encoding="utf-8")
labjs = "globalThis.__KATA_RUNTIME_SRC = " + json.dumps(runtime_src) + ";\n"
labjs += "\n".join((ROOT / f"src/labs/{n}.js").read_text(encoding="utf-8") for n in LAB_FILES)
labjs += "\nLAB.init();\n"
def safe_js(s):
    s = s.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")
    assert "<!--" not in s, "HTML comment opener inside inline script"
    return s
labjs = safe_js(labjs)
js = safe_js(js)

def code_block(m):
    attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
    body = textwrap.dedent(m.group(2).strip("\n")).rstrip()
    lang = attrs.get("lang", "plaintext")
    lang = {"tsx": "typescript", "ts": "typescript", "py": "python", "sh": "bash"}.get(lang, lang)
    f = attrs.get("file", lang)
    return (f'<div class="code" data-lang="{lang}" data-file="{html.escape(f)}">'
            f'<pre><code class="language-{lang}">{html.escape(body)}</code></pre></div>')

parts = []
for p in sorted(glob.glob(str(ROOT / "src/modules/*.html"))):
    s = pathlib.Path(p).read_text(encoding="utf-8")
    s = re.sub(r"<code-block([^>]*)>(.*?)</code-block>", code_block, s, flags=re.S)
    parts.append(s)

page = f"""<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kompendium AI Engineer</title>
<style>{hlcss}</style>
<style>{css}</style>
</head>
<body>
<header class="topbar">
  <button id="menuBtn" aria-label="Spis treści">☰</button>
  <span class="brand">Kompendium AI Engineer</span>
  <button id="themeBtn" aria-label="Motyw">🌓</button>
  <div class="progressbar" id="pbar"></div>
</header>
<div class="scrim" id="scrim"></div>
<div class="layout">
  <nav class="sidebar" id="sidebar">
    <div class="nav-head">Spis treści · ukończone <span id="doneCount"></span></div>
    <div id="navList"></div>
  </nav>
  <main>
{''.join(parts)}
  </main>
</div>
<script>{hljs}</script>
<script>{labjs}</script>
<script>{js}</script>
</body>
</html>"""
out = ROOT / "kompendium-ai-engineer.html"
out.write_text(page, encoding="utf-8")
print("OK", out, round(len(page) / 1024), "KB", len(parts), "modules")
