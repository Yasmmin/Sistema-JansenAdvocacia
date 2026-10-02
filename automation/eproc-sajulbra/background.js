chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "JANSEN_API") return false;
  chrome.storage.local.get(["jansenApi", "automationKey"], async (saved) => {
    try {
      if (!saved.automationKey) throw new Error("Configure a chave nas opções da extensão.");
      const response = await fetch(`${saved.jansenApi || "http://127.0.0.1:8787"}${message.path}`, {
        method: message.method || "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-eproc-extension": "jansen-local-v1", ...(saved.automationKey ? { "x-eproc-automation-key": saved.automationKey } : {}) },
        body: message.body || undefined,
      });
      sendResponse({ ok: response.ok, status: response.status, text: await response.text() });
    } catch (error) {
      sendResponse({ ok: false, status: 0, error: error.message || "Falha de comunicação." });
    }
  });
  return true;
});
