import { executeAdmittedRun } from "@/modules/execution/execute-run.service";

const runIds = process.argv.slice(2).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
if (runIds.length === 0) throw new Error("Pass at least one run id.");

for (const runId of runIds) {
  const result = await executeAdmittedRun(runId);
  console.log(JSON.stringify({ runId: result.runId, status: result.status }));
}
