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

function assertOutboxMetrics(data) {
  if (!data.outbox) {
    throw new Error("Campo outbox ausente em /api/ops/status");
  }
  for (const key of ["pending", "failed", "dead"]) {
    if (typeof data.outbox[key] !== "number") {
      throw new Error(`Campo outbox.${key} inválido`);
    }
  }
}

function assertStagnationPayload(data) {
  if (!data.ok) {
    throw new Error("Campo ok ausente em /api/ops/pipeline/stagnation");
  }
  for (const key of ["activeCases", "stalledCases", "cases"]) {
    if (data[key] === undefined) {
      throw new Error(`Campo ${key} ausente em stagnation`);
    }
  }
  if (!data.outbox || typeof data.outbox.pending !== "number") {
    throw new Error("Campo outbox inválido em stagnation");
  }
}

async function run() {
  const paths = [
    "/api/ops/health",
    "/api/ops/readiness",
    "/api/ops/status",
    "/api/ops/pipeline/stagnation",
  ];
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

  const statusPayload = results.find((item) => item.path === "/api/ops/status")?.data;
  try {
    assertOutboxMetrics(statusPayload);
    console.log("Outbox metrics OK:", JSON.stringify(statusPayload.outbox));
  } catch (error) {
    console.error("Validação outbox falhou:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const stagnationPayload = results.find(
    (item) => item.path === "/api/ops/pipeline/stagnation",
  )?.data;
  try {
    assertStagnationPayload(stagnationPayload);
    console.log(
      "Pipeline stagnation OK:",
      JSON.stringify({
        activeCases: stagnationPayload.activeCases,
        stalledCases: stagnationPayload.stalledCases,
      }),
    );
  } catch (error) {
    console.error("Validação stagnation falhou:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const devRoute = await hit("/api/dev/cases/UNKNOWN/full-process");
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_ROUTES !== "true") {
    if (devRoute.status !== 404) {
      console.error("Rota dev deveria retornar 404 em produção sem ALLOW_DEV_ROUTES");
      process.exitCode = 1;
      return;
    }
    console.log("Dev route guard OK (404 em produção)");
  } else {
    console.log(`Dev route probe -> ${devRoute.status} (ambiente não-prod ou ALLOW_DEV_ROUTES)`);
  }

  console.log("\nSmoke operacional concluído com sucesso.");
}

run().catch((error) => {
  console.error("Erro ao executar smoke operacional:", error);
  process.exitCode = 1;
});
