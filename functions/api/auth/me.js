import { endpoint, json } from "../../../lib/http.js";
import { currentUser, safeUser } from "../../../lib/auth.js";
export const onRequestGet = endpoint(async ({ request, env }) => {
  const user = await currentUser(request, env);
  return json(
    user ? { loggedIn: true, ...safeUser(user, env) } : { loggedIn: false },
  );
});
