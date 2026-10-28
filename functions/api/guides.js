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
  listRecords,
  createRecord,
  deleteOwned,
  rateLimit,
} from "../../lib/storage.js";
import { currentUser, requireUser } from "../../lib/auth.js";
function mask(value) {
  const v = String(value || "");
  if (!v) return "";
  if (v.includes("@")) return v[0] + "***@" + v.split("@")[1];
  return v.length > 6 ? v.slice(0, 2) + "****" + v.slice(-2) : "***";
}
export const onRequestGet = endpoint(async ({ request, env }) => {
  await rateLimit(env, request, "read-guides", 60, 60);
  const user = await currentUser(request, env);
  const list = await listRecords(env, "guides");
  return json({
    loggedIn: !!user,
    list: list.map((g) => ({
      id: g.id,
      mine: !!user && g.ownerUid === user.uid,
      name: g.name || "",
      licenseNo: mask(g.licenseNo),
      city: g.city,
      languages: g.languages,
      agency: g.agency,
      expiry: g.expiry,
      specialty: g.specialty,
      phone: user ? g.phone : mask(g.phone),
      phoneMasked: !user,
      note: g.note,
      createdAt: g.createdAt,
    })),
  });
});
export const onRequestPost = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  const user = await requireUser(request, env);
  await rateLimit(env, request, "create-guide", 10, 3600, user.uid);
  const b = await bodyJson(request);
  const name = required(b.name, 30, "称呼"),
    city = required(b.city, 20, "常驻城市"),
    licenseNo = required(b.licenseNo, 20, "导游证号").toUpperCase(),
    phone = required(b.phone, 60, "联系方式");
  if (!/^[A-Z0-9]{8,20}$/.test(licenseNo))
    throw new HttpError(400, "请填写8至20位字母或数字的导游证号");
  const expiry = text(b.expiry, 10);
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry))
    throw new HttpError(400, "有效期日期格式不正确");
  const id = await createRecord(
    env,
    "guides",
    {
      name,
      city,
      licenseNo,
      phone,
      expiry,
      languages: text(b.languages, 60),
      agency: text(b.agency, 60),
      specialty: text(b.specialty, 100),
      note: text(b.note, 200),
    },
    user.uid,
  );
  return json({ ok: true, id });
});
export const onRequestDelete = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  const user = await requireUser(request, env);
  await deleteOwned(env, "guides", recordId(request), user.uid);
  return json({ ok: true });
});
