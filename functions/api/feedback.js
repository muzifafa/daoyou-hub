import {
  endpoint,
  json,
  bodyJson,
  requireSameOrigin,
  required,
  text,
} from "../../lib/http.js";
import { createRecord, rateLimit } from "../../lib/storage.js";
import { currentUser } from "../../lib/auth.js";
export const onRequestPost = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  await rateLimit(env, request, "feedback", 5, 3600);
  const b = await bodyJson(request);
  const user = await currentUser(request, env);
  const id = await createRecord(
    env,
    "feedback",
    {
      type: required(b.type, 30, "反馈类型"),
      spot: text(b.spot, 60),
      content: required(b.content, 1000, "反馈内容"),
      contact: text(b.contact, 60),
      handled: false,
    },
    user?.uid,
  );
  return json({ ok: true, id });
});
