const api = document.querySelector("#api");
const key = document.querySelector("#key");
const enabled = document.querySelector("#enabled");
const status = document.querySelector("#status");

chrome.storage.local.get(["jansenApi", "automationKey", "automationEnabled"], (saved) => {
  api.value = saved.jansenApi || "http://127.0.0.1:8787";
  key.value = saved.automationKey || "";
  enabled.checked = saved.automationEnabled === true;
});

document.querySelector("#save").addEventListener("click", () => {
  chrome.storage.local.set({
    jansenApi: api.value.replace(/\/$/, ""),
    automationKey: key.value.trim(),
    automationEnabled: enabled.checked,
  }, () => {
    status.textContent = enabled.checked
      ? "Automação contínua ativada. Qualquer erro interromperá a execução."
      : "Configuração salva. Automação desativada.";
  });
});
