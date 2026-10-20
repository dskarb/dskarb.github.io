# Kompendium AI Engineer — źródła

Strona `../index.html` jest generowana z tych plików.

- `src/modules/*.html` — treść modułów (kolejność wg nazw plików)
- `src/labs/` — zadania z kodem (`katas-*.js`), dane i logika laboratoriów, klient API
- `src/style.css`, `src/app.js` — wygląd i interakcje
- `build.py` — skleja wszystko w jeden plik HTML

```bash
python3 build.py                 # buduje kompendium-ai-engineer.html
node tools/verify-katas.js       # sprawdza, że rozwiązania wzorcowe przechodzą testy, a kod startowy nie
cp kompendium-ai-engineer.html ../index.html
```
