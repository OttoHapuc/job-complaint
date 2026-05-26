const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

async function hit(path) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`);
  const elapsedMs = Date.now() - started;
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = { parseError: true };
  }
  return { path, status: response.status, elapsedMs, data };
}

function printResult(result) {
  const mark = result.status >= 200 && result.status < 300 ? "OK" : "FAIL";
  console.log(`${mark} ${result.path} -> ${result.status} (${result.elapsedMs}ms)`);
}

async function run() {
  const paths = ["/api/ops/health", "/api/ops/readiness", "/api/ops/status"];
  const results = [];

  for (const path of paths) {
    results.push(await hit(path));
  }

  results.forEach(printResult);

  const failed = results.filter((r) => r.status < 200 || r.status >= 300);
  if (failed.length > 0) {
    console.error("\nFalhas no smoke operacional:");
    for (const item of failed) {
      console.error(`- ${item.path}:`, JSON.stringify(item.data));
    }
    process.exitCode = 1;
    return;
  }

  console.log("\nSmoke operacional concluído com sucesso.");
}

run().catch((error) => {
  console.error("Erro ao executar smoke operacional:", error);
  process.exitCode = 1;
});
