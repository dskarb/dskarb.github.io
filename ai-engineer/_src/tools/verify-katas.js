const { runKata } = require("../src/labs/kata-runtime.js");
for (const f of ["katas-a", "katas-b", "katas-c"]) require("../src/labs/" + f + ".js");
const K = globalThis.KATAS;
(async () => {
  let bad = 0;
  for (const [id, k] of Object.entries(K)) {
    const sol = await runKata(k.solution, k.tests);
    const st = await runKata(k.starter, k.tests);
    const solOk = !sol.fatal && sol.results.length > 0 && sol.results.every(r => r.ok);
    const stFails = st.fatal || st.results.some(r => !r.ok);
    for (const field of ["solution", "starter", "tests"]) if (/`|\$\{/.test(k[field])) { console.log("BACKTICK in", id, field); bad++; }
    if (!solOk || !stFails) {
      bad++;
      console.log("✗", id, "solution ok:", solOk, "starter fails:", !!stFails);
      if (sol.fatal) console.log("   fatal:", sol.fatal);
      sol.results.filter(r => !r.ok).forEach(r => console.log("   -", r.name, ":", r.msg));
    } else console.log("✓", id, "(" + sol.results.length + " testów, starter: " + st.results.filter(r=>!r.ok).length + " failuje)");
  }
  console.log(Object.keys(K).length, "zadań,", bad, "problemów");
})();
