# Verificador Sajulbra no eproc

Extensão local e determinística. Não usa ChatGPT, IA ou tokens.

1. Configure `EPROC_AUTOMATION_KEY` em `.dev.vars` com pelo menos 32 caracteres.
2. Abra `brave://extensions`, ative o modo do desenvolvedor e use **Carregar sem compactação**.
3. Selecione esta pasta `automation/eproc-sajulbra`.
4. Abra as opções da extensão, informe a mesma chave e salve.
5. Mantenha uma aba autenticada do eproc aberta e o Sistema Jansen rodando na porta 8787.

A extensão percorre a fila, abre cada processo, lê `Partes e Representantes` e somente classifica como Sajulbra quando encontra simultaneamente Francisco (`RS103774`) e Adamo (`RS076712`).
