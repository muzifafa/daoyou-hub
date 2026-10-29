const authModal = document.getElementById("auth-modal");
let returnFocus = null;
let savedOverflow = "";
const backgroundState = new Map();
const visible = (element) => element && element.getClientRects().length > 0;

function updateAuthMode() {
  const registering = currentAuthMode === "register";
  for (const mode of ["login", "register"]) {
    const tab = document.getElementById("tab-" + mode);
    tab.setAttribute("aria-selected", String(mode === currentAuthMode));
    tab.tabIndex = mode === currentAuthMode ? 0 : -1;
  }
  document.getElementById("auth-fields").setAttribute("aria-labelledby", "tab-" + currentAuthMode);
  document.getElementById("auth-name").required = registering;
  document.getElementById("auth-password").minLength = registering ? 12 : 1;
  document.getElementById("auth-password").autocomplete = registering ? "new-password" : "current-password";
  document.getElementById("auth-password-label").textContent = registering ? "密码 *（12 至 128 位）" : "密码 *";
  document.getElementById("auth-title").textContent = registering ? "注册账号" : "登录账号";
}
document.addEventListener("auth:mode", updateAuthMode);
document.addEventListener("auth:open", () => {
  if (!backgroundState.size) {
    returnFocus = document.activeElement;
    savedOverflow = document.body.style.overflow;
    for (const element of document.querySelectorAll("body>main,body>nav,body>footer,body>.fab")) {
      backgroundState.set(element, element.inert);
      element.inert = true;
    }
  }
  document.body.style.overflow = "hidden";
  document.getElementById(currentAuthMode === "register" ? "auth-name" : "auth-email").focus();
});
document.addEventListener("auth:close", () => {
  for (const [element, inert] of backgroundState) element.inert = inert;
  backgroundState.clear();
  document.body.style.overflow = savedOverflow;
  const password = document.getElementById("auth-password");
  password.value = "";
  password.type = "password";
  const toggle = authModal.querySelector("[data-password-toggle]");
  toggle.setAttribute("aria-pressed", "false");
  toggle.textContent = "显示密码";
  const fallback = document.querySelector(".hamburger");
  const target = visible(returnFocus) ? returnFocus : visible(fallback) ? fallback : document.querySelector(".brand");
  target?.focus();
});
document.addEventListener("keydown", (event) => {
  if (authModal.classList.contains("open") && event.key === "Tab") {
    const fields = [...authModal.querySelectorAll("button,input,a[href],[tabindex='0']")].filter(element => !element.disabled && element.tabIndex >= 0 && visible(element));
    const first = fields[0], last = fields.at(-1);
    if (event.shiftKey && (document.activeElement === first || !authModal.contains(document.activeElement))) {
      event.preventDefault();last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !authModal.contains(document.activeElement))) {
      event.preventDefault();first?.focus();
    }
  } else if (event.key === "Escape" && document.getElementById("navlinks").classList.contains("open")) {
    closeMenu();document.querySelector(".hamburger").focus();
  }
});
document.querySelector(".auth-tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const mode = event.key === "Home" ? "login" : event.key === "End" ? "register" : currentAuthMode === "login" ? "register" : "login";
  setAuthMode(mode);document.getElementById("tab-" + mode).focus();
});
document.getElementById("auth-form").addEventListener("submit", event => {
  event.preventDefault();doAuth(currentAuthMode);
});
document.addEventListener("click", event => {
  if (document.getElementById("navlinks").classList.contains("open") && !event.target.closest("nav.top")) closeMenu();
});
for (const button of document.querySelectorAll("[data-password-toggle]")) {
  button.addEventListener("click", () => {
    const field = document.getElementById(button.dataset.passwordToggle);
    const reveal = field.type === "password";
    field.type = reveal ? "text" : "password";
    button.setAttribute("aria-pressed", String(reveal));
    button.textContent = reveal ? "隐藏密码" : "显示密码";
  });
}
const passwordForm = document.getElementById("password-form");
passwordForm.addEventListener("submit", async event => {
  event.preventDefault();
  const current = document.getElementById("change-current");
  const next = document.getElementById("change-new");
  const confirmation = document.getElementById("change-confirm");
  const message = document.getElementById("password-message");
  message.className = "msg err";
  if (next.value !== confirmation.value) {
    message.textContent = "两次输入的新密码不一致。";confirmation.focus();return;
  }
  if (next.value === current.value) {
    message.textContent = "新密码不能与当前密码相同。";next.focus();return;
  }
  const button = document.getElementById("password-submit");
  button.disabled = true;button.textContent = "正在更新…";message.textContent = "";
  try {
    const response = await fetch("/api/auth/change-password", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: current.value, password: next.value }) });
    const body = await response.json();
    if (response.status === 401) {
      passwordForm.reset();await checkAuth();toast("登录已过期，请重新登录后修改密码");openAuth();return;
    }
    if (!response.ok) throw new Error(body.error || "修改失败，请稍后重试");
    passwordForm.reset();next.type = "password";
    const toggle = passwordForm.querySelector("[data-password-toggle]");
    toggle.setAttribute("aria-pressed", "false");toggle.textContent = "显示密码";
    message.className = "msg ok";message.textContent = "密码已更新，其他设备已退出登录。";
    await checkAuth();
  } catch (error) {
    message.textContent = error.message || "网络连接失败，请重试。";
  } finally {
    button.disabled = false;button.textContent = "更新密码";
  }
});
updateAuthMode();
