let token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
// The secret never travels in a URL request or referrer and is removed from
// the address bar before interaction. Keep it only in this module's memory.
history.replaceState(null, "", location.pathname);
const form = document.getElementById("reset-form");
const status = document.getElementById("status");
const button = document.getElementById("submit");
if (/^[a-f0-9]{64}$/.test(token)) {
  form.hidden = false;
  status.textContent = "请输入并确认你的新密码。";
} else {
  status.textContent = "请使用维护者为你签发的一次性重置链接。邮件找回服务尚未开通；普通访客请通过首页反馈联系维护者，核对账号归属后处理。";
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.getElementById("password");
  const confirmation = document.getElementById("confirm-password");
  if (password.value !== confirmation.value) {
    status.className = "error";
    status.textContent = "两次输入的密码不一致。";
    confirmation.focus();
    return;
  }
  button.disabled = true;
  status.className = "";
  status.textContent = "正在更新密码…";
  try {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: password.value }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "更新失败，请稍后重试");
    token = "";
    form.reset();
    form.hidden = true;
    status.textContent = "密码已更新。请返回首页，使用新密码登录。";
    document.getElementById("sign-in").hidden = false;
  } catch (error) {
    status.className = "error";
    status.textContent = error.message || "网络连接失败，请重试。";
    button.disabled = false;
  }
});
