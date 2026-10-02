(() => {
  if (window.top !== window || window.__jansenEprocAutomation) return;
  window.__jansenEprocAutomation = true;

  const JOB_KEY = "jansen:eproc-current-job";
  const NAVIGATION_KEY = "jansen:eproc-navigation";
  const RETRY_DELAY_MS = 60_000;
  const NAVIGATION_LOCK_MS = 30_000;

  function badge(text, error = false) {
    let element = document.querySelector("#jansen-eproc-automation-status");
    if (!element) {
      element = document.createElement("div");
      element.id = "jansen-eproc-automation-status";
      Object.assign(element.style, {
        position: "fixed",
        right: "14px",
        bottom: "14px",
        zIndex: "2147483647",
        padding: "9px 12px",
        borderRadius: "8px",
        color: "white",
        font: "600 12px Arial",
        boxShadow: "0 2px 10px #0004",
      });
      document.body.appendChild(element);
    }
    element.style.background = error ? "#b42318" : "#0b5d45";
    element.textContent = text;
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isSecondDegree(processNumber) {
    return String(processNumber || "").replace(/\D/g, "").endsWith("7000");
  }

  function parsePage(job) {
    const table = document.querySelector("#tblPartesERepresentantes");
    const pageProcess = clean(document.querySelector("#fldCapa")?.textContent)
      .match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0];

    if (!table || !pageProcess) throw new Error("A página não exibiu Partes e Representantes.");
    if (pageProcess.replace(/\D/g, "") !== String(job.processNumber).replace(/\D/g, "")) {
      throw new Error("O processo aberto não corresponde ao item da fila.");
    }

    const parties = new Set();
    const representedParties = new Set();
    const lawyers = new Map();
    for (const row of table.querySelectorAll("tr")) {
      for (const cell of row.querySelectorAll("td")) {
        const cellText = clean(cell.textContent);
        const party = [...cell.querySelectorAll("a")]
          .map((link) => clean(link.textContent))
          .find((name) => name && !/histórico/i.test(name));
        if (party) parties.add(party);

        const matches = [...cellText.matchAll(/([A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇa-záàâãéêíóôõúüç.' -]{2,}?)\s+RS\s*0*(\d{5,6})\b/g)];
        for (const match of matches) {
          lawyers.set(match[2], { name: clean(match[1]), oab: `RS${match[2].padStart(6, "0")}` });
        }
        const oabNumbers = new Set(matches.map((match) => match[2].replace(/^0+/, "")));
        if (party && oabNumbers.has("103774") && oabNumbers.has("76712")) representedParties.add(party);
      }
    }
    return {
      id: job.id,
      processNumber: pageProcess,
      parties: [...parties],
      representedParties: [...representedParties],
      lawyers: [...lawyers.values()],
    };
  }

  async function apiCall(path, options = {}) {
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "JANSEN_API",
        path,
        method: options.method || "GET",
        body: options.body,
      }, resolve);
    });
    if (!result || result.status === 0) {
      throw new Error(result?.error || "Falha ao conectar ao Sistema Jansen.");
    }
    return {
      ok: result.ok,
      status: result.status,
      json: async () => JSON.parse(result.text || "{}"),
    };
  }

  function signedSearchForm() {
    const form = document.querySelector("form#formPesquisaRapida");
    const search = form?.querySelector("#txtNumProcessoPesquisaRapida");
    const submitter = form?.querySelector('button[type="submit"][name="btnPesquisaRapidaSubmit"]');
    const action = form?.getAttribute("action") || "";
    const hasSignedAction = /(?:^|[?&])acao=processo_pesquisa_rapida(?:&|$)/.test(action)
      && /(?:^|[?&])hash=[a-z0-9]+(?:&|$)/i.test(action);
    if (!form || !search || !submitter || !hasSignedAction) return null;
    return { form, search, submitter };
  }

  function submitSignedSearch(job) {
    const controls = signedSearchForm();
    if (!controls) throw new Error("Busca assinada indisponível. Abra o Painel do Advogado e aguarde.");

    const previousNavigation = JSON.parse(sessionStorage.getItem(NAVIGATION_KEY) || "null");
    if (previousNavigation?.id === job.id && Date.now() - previousNavigation.at < NAVIGATION_LOCK_MS) {
      badge(`Aguardando o eproc abrir ${job.processNumber}…`);
      return false;
    }

    controls.search.value = String(job.processNumber).replace(/\D/g, "");
    controls.search.dispatchEvent(new Event("input", { bubbles: true }));
    controls.search.dispatchEvent(new Event("change", { bubbles: true }));
    sessionStorage.setItem(NAVIGATION_KEY, JSON.stringify({ id: job.id, at: Date.now() }));
    badge(`Abrindo ${job.processNumber} pela busca assinada…`);
    controls.form.requestSubmit(controls.submitter);
    return true;
  }

  async function isEnabled() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["automationEnabled"], (saved) => resolve(saved.automationEnabled === true));
    });
  }

  async function disableAutomation() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ automationEnabled: false }, resolve);
    });
  }

  async function cycle() {
    try {
      if (!await isEnabled()) {
        badge("Automação do eproc desativada.");
        return setTimeout(cycle, RETRY_DELAY_MS);
      }

      const statusResponse = await apiCall("/api/eproc/verification?status=1");
      if (!statusResponse.ok) throw new Error(`Fila indisponível (${statusResponse.status}).`);
      const automationStatus = await statusResponse.json();
      if (automationStatus.paused) {
        badge("Automação do eproc pausada com segurança.");
        return setTimeout(cycle, RETRY_DELAY_MS);
      }

      const stored = sessionStorage.getItem(JOB_KEY);
      if (stored) {
        const job = JSON.parse(stored);
        if (isSecondDegree(job.processNumber)) {
          const response = await apiCall("/api/eproc/verification", {
            method: "POST",
            body: JSON.stringify({ id: job.id, processNumber: job.processNumber, skipReason: "SECOND_DEGREE" }),
          });
          if (!response.ok) throw new Error(`Sistema Jansen respondeu ${response.status}.`);
          sessionStorage.removeItem(JOB_KEY);
          sessionStorage.removeItem(NAVIGATION_KEY);
          badge(`Processo ${job.processNumber} ignorado: segundo grau.`);
          return setTimeout(cycle, 2_000);
        }
        if (location.href.includes("processo_selecionar")) {
          badge(`Verificando ${job.processNumber}…`);
          let result;
          try {
            result = parsePage(job);
          } catch (error) {
            result = { id: job.id, processNumber: job.processNumber, error: error.message };
          }
          const response = await apiCall("/api/eproc/verification", {
            method: "POST",
            body: JSON.stringify(result),
          });
          if (!response.ok) throw new Error(`Sistema Jansen respondeu ${response.status}.`);
          const savedResult = await response.json();
          sessionStorage.removeItem(JOB_KEY);
          sessionStorage.removeItem(NAVIGATION_KEY);
          if (savedResult.status === "ERROR") {
            await disableAutomation();
            badge(`Leitura de ${job.processNumber} falhou. Automação interrompida.`, true);
            return;
          }
          badge(`Processo ${job.processNumber} conferido.`);
          return setTimeout(cycle, 5_000);
        }

        submitSignedSearch(job);
        return setTimeout(cycle, NAVIGATION_LOCK_MS);
      }

      if (!signedSearchForm()) {
        badge("Abra o Painel do Advogado para iniciar a automação.", true);
        return setTimeout(cycle, RETRY_DELAY_MS);
      }

      const response = await apiCall("/api/eproc/verification");
      if (!response.ok) throw new Error(`Fila indisponível (${response.status}).`);
      const data = await response.json();
      if (data.paused) {
        badge("Automação do eproc pausada com segurança.");
        return setTimeout(cycle, RETRY_DELAY_MS);
      }
      if (data.done) {
        badge("Fila do Sajulbra concluída.");
        return setTimeout(cycle, RETRY_DELAY_MS);
      }

      if (isSecondDegree(data.item.processNumber)) {
        const skipped = await apiCall("/api/eproc/verification", {
          method: "POST",
          body: JSON.stringify({ id: data.item.id, processNumber: data.item.processNumber, skipReason: "SECOND_DEGREE" }),
        });
        if (!skipped.ok) throw new Error(`Sistema Jansen respondeu ${skipped.status}.`);
        badge(`Processo ${data.item.processNumber} ignorado: segundo grau.`);
        return setTimeout(cycle, 2_000);
      }

      sessionStorage.setItem(JOB_KEY, JSON.stringify(data.item));
      submitSignedSearch(data.item);
      return setTimeout(cycle, NAVIGATION_LOCK_MS);
    } catch (error) {
      await disableAutomation();
      badge(error.message || "Falha na automação.", true);
      return;
    }
  }

  setTimeout(cycle, 2_500);
})();
