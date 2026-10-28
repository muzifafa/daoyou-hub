import {
  endpoint,
  json,
  bodyJson,
  requireSameOrigin,
  required,
  text,
  recordId,
  HttpError,
} from "../../lib/http.js";
import {
  db,
  listRecords,
  createRecord,
  deleteOwned,
  rateLimit,
} from "../../lib/storage.js";
import { currentUser, requireUser } from "../../lib/auth.js";
function mask(value) {
  const v = String(value || "");
  return v.length > 6 ? v.slice(0, 2) + "****" + v.slice(-2) : "***";
}
export function endDate(j) {
  if (j.endDate) return j.endDate;
  const m = String(j.dateRange || "").match(
    /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s*至\s*(?:(\d{4})[-\/])?(\d{1,2})[-\/](\d{1,2})/,
  );
  return m
    ? `${m[4] || m[1]}-${m[5].padStart(2, "0")}-${m[6].padStart(2, "0")}`
    : "";
}
export const onRequestGet = endpoint(async ({ request, env }) => {
  await rateLimit(env, request, "read-jobs", 60, 60);
  const user = await currentUser(request, env);
  const rows = await listRecords(env, "jobs");
  const countRows = await db(env)
    .prepare(
      "SELECT a.job_id,COUNT(*) AS n FROM applications a JOIN records r ON r.kind='jobs' AND r.id=a.job_id GROUP BY a.job_id",
    )
    .all();
  const counts = new Map(countRows.results.map((row) => [row.job_id, row.n]));
  const applicationsByJob = new Map();
  if (user) {
    const applications = await db(env)
      .prepare(
        "SELECT a.job_id,a.name FROM applications a JOIN records r ON r.kind='jobs' AND r.id=a.job_id WHERE r.owner_uid=? ORDER BY a.created_at",
      )
      .bind(user.uid)
      .all();
    for (const entry of applications.results) {
      if (!applicationsByJob.has(entry.job_id))
        applicationsByJob.set(entry.job_id, []);
      applicationsByJob.get(entry.job_id).push({ name: entry.name });
    }
  }
  const list = [];
  for (const j of rows) {
    const mine = !!user && j.ownerUid === user.uid;
    const apps = mine ? applicationsByJob.get(j.id) || [] : [];
    list.push({
      id: j.id,
      mine,
      title: j.title,
      city: j.city,
      dateRange: j.dateRange,
      tourists: j.tourists,
      endDate: endDate(j),
      language: j.language,
      budget: j.budget,
      contact: user ? j.contact : mask(j.contact),
      contactMasked: !user,
      applicants: apps,
      applicantsCount: counts.get(j.id) || 0,
      note: j.note,
      createdAt: j.createdAt,
    });
  }
  return json({ list, loggedIn: !!user });
});
export const onRequestPost = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  const user = await requireUser(request, env);
  await rateLimit(env, request, "create-job", 10, 3600, user.uid);
  const b = await bodyJson(request);
  const title = required(b.title, 60, "标题"),
    city = required(b.city, 30, "目的地"),
    contact = required(b.contact, 60, "联系方式");
  const startDate = text(b.startDate, 10),
    end = text(b.endDate, 10);
  for (const value of [startDate, end])
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new HttpError(400, "日期格式不正确");
  if (startDate && end && end < startDate)
    throw new HttpError(400, "结束日期不能早于开始日期");
  const id = await createRecord(
    env,
    "jobs",
    {
      title,
      city,
      contact,
      dateRange: startDate
        ? startDate + (end ? " 至 " + end : "")
        : text(b.dateRange, 40),
      startDate,
      endDate: end,
      tourists: text(b.tourists, 30),
      language: text(b.language, 30),
      budget: text(b.budget, 30),
      note: text(b.note, 300),
    },
    user.uid,
  );
  return json({ ok: true, id });
});
export const onRequestDelete = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  const user = await requireUser(request, env);
  await deleteOwned(env, "jobs", recordId(request), user.uid);
  return json({ ok: true });
});
