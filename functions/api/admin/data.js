import { endpoint, json } from "../../../lib/http.js";
import { listRecords } from "../../../lib/storage.js";
import { requireAdmin, safeUser } from "../../../lib/auth.js";
export const onRequestGet = endpoint(async ({ request, env }) => {
  const user = await requireAdmin(request, env);
  const [guides, jobs, feedback] = await Promise.all(
    ["guides", "jobs", "feedback"].map((kind) => listRecords(env, kind)),
  );
  const today = new Date().toISOString().slice(0, 10);
  return json({
    user: safeUser(user, env),
    guides,
    jobs,
    feedback,
    stats: {
      guides: guides.length,
      jobs: jobs.length,
      feedback: feedback.length,
      guidesToday: guides.filter((g) => g.createdAt.startsWith(today)).length,
      jobsToday: jobs.filter((j) => j.createdAt.startsWith(today)).length,
    },
  });
});
