/* ============================================================
   BACKGROUND — v10.1 (com Lote de listas sequenciais)
   - Backup automático semanal
   - Sistema de Undo (desfazer)
   - Detecção de "digitando..." (recebe do content)
   - Drip condicional
   - Multi-perfil
   - NOVO: Lote (envio sequencial de várias listas)
   ============================================================ */

const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxm7Nty_BROdsNh1SM17Npm9LIiVMSHfISXPRaav6obSsUvwIcgz8-veOjVPbNur6FF/exec";

let contasAbertas = {};
let pausadoManual = false;
let ultimaNotificacaoDesconexao = 0;

function normalizarNumero(numero) {
    return String(numero || '').replace(/\D/g, '');
}

async function numeroEmOptOut(numero) {
    const d = await chrome.storage.local.get(['optOut']);
    return !!(d.optOut || {})[normalizarNumero(numero)];
}

async function atualizarContato(numero, dados = {}) {
    const chave = normalizarNumero(numero);
    if (!chave) return;
    const d = await chrome.storage.local.get(['contatos']);
    const contatos = d.contatos || {};
    contatos[chave] = {
        id: contatos[chave]?.id || 'contato_' + chave,
        numero: chave,
        nome: dados.nome || contatos[chave]?.nome || 'Cliente',
        criadoEm: contatos[chave]?.criadoEm || Date.now(),
        atualizadoEm: Date.now(),
        ultimaCampanha: dados.campanhaId || contatos[chave]?.ultimaCampanha || null,
        ultimoStatus: dados.status || contatos[chave]?.ultimoStatus || null,
        ultimaMensagem: dados.mensagem || contatos[chave]?.ultimaMensagem || '',
        ultimaResposta: dados.resposta || contatos[chave]?.ultimaResposta || '',
        tags: contatos[chave]?.tags || [],
        notas: contatos[chave]?.notas || []
    };
    await chrome.storage.local.set({ contatos });
}

/* ---------- Setup inicial ---------- */
chrome.runtime.onInstalled.addListener((details) => {
    chrome.alarms.create('tickMinuto', { periodInMinutes: 1 });
    chrome.alarms.create('tickHora', { periodInMinutes: 60 });
    chrome.alarms.create('backupSemanal', { periodInMinutes: 10080, delayInMinutes: 5 });
    if (details.reason === 'install') {
        chrome.storage.local.set({ needsOnboarding: true });
    }
});
chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create('tickMinuto', { periodInMinutes: 1 });
    chrome.alarms.create('tickHora', { periodInMinutes: 60 });
    chrome.alarms.create('backupSemanal', { periodInMinutes: 10080, delayInMinutes: 5 });
});
chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === 'tickMinuto') tickMinuto();
    if (a.name === 'tickHora') tickHora();
    if (a.name === 'backupSemanal') fazerBackupAutomatico();
});

/* ---------- Backup automático ---------- */
async function fazerBackupAutomatico() {
    try {
        const d = await chrome.storage.local.get(null);
        delete d.undoState;
        const json = JSON.stringify(d, null, 2);
        const blob = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
        const data = new Date().toISOString().slice(0, 10);
        chrome.downloads.download({
            url: blob,
            filename: `private_bot_backups/backup_${data}.json`,
            saveAs: false
        });
        console.log("[BG] Backup automático salvo");
    } catch (e) {
        console.log("[BG] Erro no backup automático:", e);
    }
}

/* ---------- Ticks ---------- */
async function tickMinuto() {
    const d = await chrome.storage.local.get(['filaAtual', 'config', 'agendamento']);
    const fila = d.filaAtual;
    const cfg = d.config || {};
    if (fila && fila.status === 'aguardando_agendamento') {
        const quando = d.agendamento && d.agendamento.dataInicio
            ? new Date(d.agendamento.dataInicio).getTime() : Date.now();
        if (Date.now() >= quando && dentroDoHorario(cfg)) {
            fila.status = 'pendente';
            await chrome.storage.local.set({ filaAtual: fila });
            tentarIniciarFila();
        }
        return;
    }
    if (fila && fila.status === 'pausado_horario') {
        if (dentroDoHorario(cfg)) {
            fila.status = 'pendente';
            await chrome.storage.local.set({ filaAtual: fila });
            tentarIniciarFila();
        }
        return;
    }
    if (fila && fila.status === 'rodando' && !dentroDoHorario(cfg)) {
        fila.status = 'pausado_horario';
        await chrome.storage.local.set({ filaAtual: fila });
        broadcastToWhatsApp({ acao: 'pausar_auto' });
    }
}
async function tickHora() {
    await processarDripDiario();
    await limparDuplicatasAntigas();
}

function dentroDoHorario(cfg) {
    if (!cfg.horarioAtivo) return true;
    const agora = new Date();
    const dia = agora.getDay();
    const dias = cfg.diasSemana || [1,2,3,4,5,6];
    if (!dias.includes(dia)) return false;
    const [hi, mi] = (cfg.horarioInicio || '08:00').split(':').map(Number);
    const [hf, mf] = (cfg.horarioFim || '20:00').split(':').map(Number);
    const min = agora.getHours() * 60 + agora.getMinutes();
    const inicio = hi * 60 + mi;
    const fim = hf * 60 + mf;
    // Suporta janelas normais (08:00–20:00) e noturnas (22:00–06:00).
    if (inicio === fim) return true;
    return inicio < fim ? min >= inicio && min < fim : min >= inicio || min < fim;
}
async function broadcastToWhatsApp(msg) {
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    for (const t of tabs) chrome.tabs.sendMessage(t.id, msg).catch(() => {});
}

/* ---------- Warm-up ---------- */
function calcularLimiteWarmUp(cfg) {
    if (!cfg.warmUpAtivo) return null;
    const inicio = cfg.warmUpInicio ? new Date(cfg.warmUpInicio).getTime() : Date.now();
    const dias = Math.max(0, Math.floor((Date.now() - inicio) / 86400000));
    const tabela = cfg.warmUpTabela || [10,20,40,80,150,250,400,700,1000];
    const limiteDia = tabela[Math.min(dias, tabela.length - 1)];
    const hoje = new Date().toISOString().slice(0, 10);
    const enviadosHoje = (cfg.enviosPorDia && cfg.enviosPorDia[hoje]) || 0;
    return Math.max(0, limiteDia - enviadosHoje);
}
async function registrarEnvioWarmUp() {
    const d = await chrome.storage.local.get(['config']);
    const cfg = d.config || {};
    const hoje = new Date().toISOString().slice(0, 10);
    cfg.enviosPorDia = cfg.enviosPorDia || {};
    cfg.enviosPorDia[hoje] = (cfg.enviosPorDia[hoje] || 0) + 1;
    const limite = Date.now() - 30 * 86400000;
    for (const k in cfg.enviosPorDia) if (new Date(k).getTime() < limite) delete cfg.enviosPorDia[k];
    await chrome.storage.local.set({ config: cfg });
}

/* ---------- Duplicatas ---------- */
async function carregarDuplicatasAtivas(dias) {
    const d = await chrome.storage.local.get(['duplicatas']);
    const dup = d.duplicatas || {};
    const limite = Date.now() - dias * 86400000;
    const out = {};
    for (const n in dup) if (dup[n].ultimoEnvio >= limite) out[n] = dup[n];
    return out;
}
async function registrarDuplicata(numero) {
    const d = await chrome.storage.local.get(['duplicatas']);
    const dup = d.duplicatas || {};
    dup[numero] = { ultimoEnvio: Date.now(), vezes: (dup[numero]?.vezes || 0) + 1 };
    await chrome.storage.local.set({ duplicatas: dup });
}
async function limparDuplicatasAntigas() {
    const d = await chrome.storage.local.get(['duplicatas', 'config']);
    const dup = d.duplicatas || {};
    const dias = (d.config && d.config.diasDuplicata) || 60;
    const limite = Date.now() - dias * 86400000;
    let mudou = false;
    for (const n in dup) if (dup[n].ultimoEnvio < limite) { delete dup[n]; mudou = true; }
    if (mudou) await chrome.storage.local.set({ duplicatas: dup });
}

/* ---------- Fila ---------- */
async function tentarIniciarFila() {
    const d = await chrome.storage.local.get(['filaAtual', 'config']);
    const fila = d.filaAtual;
    const cfg = d.config || {};
    if (!fila || fila.status !== 'pendente') return;
    if (!Array.isArray(fila.lista) || !fila.lista.length || !Array.isArray(fila.scripts) || !fila.scripts.filter(s => String(s || '').trim()).length) {
        fila.status = 'erro_configuracao';
        await chrome.storage.local.set({ filaAtual: fila });
        return;
    }
    if (!dentroDoHorario(cfg)) {
        fila.status = 'pausado_horario';
        await chrome.storage.local.set({ filaAtual: fila });
        return;
    }
    const tabId = await encontrarAbaDaConta(fila.conta);
    if (!tabId) return;
    const limiteWarmUp = calcularLimiteWarmUp(cfg);
    const duplicatas = await carregarDuplicatasAtivas(cfg.diasDuplicata || 30);
    const optOut = (await chrome.storage.local.get(['optOut'])).optOut || {};
    fila.status = 'rodando';
    await chrome.storage.local.set({ filaAtual: fila });
    chrome.tabs.sendMessage(tabId, {
        acao: 'iniciar_disparo',
        fila: fila,
        duplicatas: duplicatas,
        optOut: optOut,
        warmUpLimite: limiteWarmUp,
        ignoraDuplicatas: !!cfg.ignoraDuplicatas
    }).catch(() => {});
}
async function encontrarAbaDaConta(numeroConta) {
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    for (const t of tabs) {
        const info = contasAbertas[t.id];
        if (!info || !info.conectado) continue;
        if (!numeroConta) return t.id;
        if (info.numero === numeroConta) return t.id;
    }
    return null;
}

/* ---------- LOTE (envio sequencial de listas) ---------- */
async function iniciarLote(payload) {
    const cfg = (await chrome.storage.local.get(['config'])).config || {};
    const filas = payload.filas.map((f, i) => ({
        indice: i,
        nome: f.nome || ('Lista ' + (i + 1)),
        lista: f.lista,
        scripts: f.scripts,
        config: {
            min: parseInt(f.config?.min || cfg.min) || 15,
            max: parseInt(f.config?.max || cfg.max) || 30,
            pausaLoteAtiva: f.config?.pausaLoteAtiva ?? cfg.chkPausaLote ?? false,
            qtdLote: parseInt(f.config?.qtdLote || cfg.qtdLote) || 20,
            tempoLoteMin: parseInt(f.config?.tempoLoteMin || cfg.tempoLote) || 5
        },
        conta: f.conta || cfg.contaAtual || null,
        status: 'pendente',
        enviados: 0
    }));

    const lote = {
        id: 'lote_' + Date.now(),
        campanhaId: payload.campanhaId || ('campanha_' + Date.now()),
        criadoEm: Date.now(),
        status: 'rodando',
        filas,
        indiceAtual: 0,
        progressoGlobal: {
            total: filas.reduce((s, f) => s + f.lista.length, 0),
            enviados: 0
        }
    };

    await chrome.storage.local.set({ loteAtual: lote });
    await iniciarProximaFilaDoLote();
}

async function iniciarProximaFilaDoLote() {
    const d = await chrome.storage.local.get(['loteAtual', 'config', 'filaAtual']);
    const lote = d.loteAtual;
    if (!lote || lote.status !== 'rodando') return;

    // Se já existe uma fila ativa, não inicia outra
    if (d.filaAtual && ['pendente', 'rodando', 'aguardando_agendamento', 'pausado_horario'].includes(d.filaAtual.status)) {
        return;
    }

    let proximo = -1;
    for (let i = 0; i < lote.filas.length; i++) {
        if (lote.filas[i].status === 'pendente') { proximo = i; break; }
    }

    if (proximo === -1) {
        lote.status = 'concluido';
        await chrome.storage.local.set({ loteAtual: lote });
        try {
            chrome.notifications.create('lote_fim_' + Date.now(), {
                type: 'basic',
                iconUrl: 'foto perfil.jpeg',
                title: '✅ Lote concluído!',
                message: `${lote.progressoGlobal.enviados} de ${lote.progressoGlobal.total} mensagens enviadas`,
                priority: 2,
                requireInteraction: true
            });
        } catch (e) {}
        return;
    }

    const def = lote.filas[proximo];
    const fila = {
        id: 'fila_' + Date.now() + '_l' + proximo,
        criadaEm: Date.now(),
        status: 'pendente',
        tipo: 'normal',
        loteId: lote.id,
        filaIndexNoLote: proximo,
        lista: def.lista,
        indice: 0,
        scripts: def.scripts,
        config: def.config,
        conta: def.conta,
        campanhaId: lote.campanhaId
    };

    lote.indiceAtual = proximo;
    lote.filas[proximo].status = 'rodando';

    await chrome.storage.local.set({
        loteAtual: lote,
        filaAtual: fila,
        progresso: { total: def.lista.length, enviados: 0 },
        timerData: { inicio: Date.now(), estimativa: 0, totalPausado: 0, ultimoPause: 0, status: 'rodando' }
    });

    tentarIniciarFila();
}

/* ---------- Drip condicional ---------- */
async function processarDripDiario() {
    const d = await chrome.storage.local.get(['drips']);
    const drips = d.drips || [];
    const respostas = (await chrome.storage.local.get(['respostas'])).respostas || {};
    for (const drip of drips) {
        if (!drip.ativo) continue;
        drip.passos = Array.isArray(drip.passos) ? drip.passos : [];
        drip.passosExecutados = Array.isArray(drip.passosExecutados) ? drip.passosExecutados : [];
        drip.contatos = Array.isArray(drip.contatos) ? drip.contatos : [];
        const diasPassados = Math.floor((Date.now() - drip.iniciadoEm) / 86400000);
        for (let i = 1; i < drip.passos.length; i++) {
            const passo = drip.passos[i];
            if (drip.passosExecutados.includes(i)) continue;
            if (diasPassados < passo.dia) continue;
            const filtro = passo.ignoraResposta
                ? drip.contatos.filter(c => !c._feito?.[i])
                : drip.contatos.filter(c => !respostas[c.num] && !c._feito?.[i]);
            if (filtro.length === 0) { drip.passosExecutados.push(i); break; }
            const novaFila = {
                id: 'drip_' + drip.id + '_p' + i,
                criadaEm: Date.now(), status: 'pendente', tipo: 'drip',
                dripId: drip.id, passoAtual: i,
                lista: filtro.map(c => ({ num: c.num, nome: c.nome })),
                indice: 0, scripts: passo.scripts, config: drip.config, conta: drip.conta
            };
            await chrome.storage.local.set({ filaAtual: novaFila });
            await chrome.storage.local.set({ drips });
            tentarIniciarFila();
            return;
        }
    }
}

/* ---------- Resposta + Digitação ---------- */
async function registrarResposta(numero, texto) {
    const d = await chrome.storage.local.get(['respostas']);
    const respostas = d.respostas || {};
    const agora = Date.now();
    if (respostas[numero]) {
        respostas[numero].ultima = agora;
        respostas[numero].vezes++;
        if (texto) respostas[numero].preview = texto;
    } else {
        respostas[numero] = { primeira: agora, ultima: agora, vezes: 1, preview: texto || '' };
    }
    await chrome.storage.local.set({ respostas });
}

async function registrarDigitando(numero) {
    const d = await chrome.storage.local.get(['digitando']);
    const digitando = d.digitando || {};
    digitando[numero] = { quando: Date.now() };
    await chrome.storage.local.set({ digitando });
}

/* ---------- Undo ---------- */
async function salvarUndo(tipo) {
    const d = await chrome.storage.local.get(null);
    const snapshot = {
        tipo,
        quando: Date.now(),
        dados: {
            logs: d.logs || [],
            respostas: d.respostas || {},
            duplicatas: d.duplicatas || {},
            progresso: d.progresso || { total: 0, enviados: 0 }
        }
    };
    await chrome.storage.local.set({ undoState: snapshot });
}

/* ---------- Log e webhook ---------- */
async function registrarLog(msg) {
    const d = await chrome.storage.local.get(['logs', 'progresso']);
    let logs = d.logs || [];
    const eventoId = msg.eventoId || `${msg.campanhaId || 'sem-campanha'}:${normalizarNumero(msg.numero)}:${msg.status}:${msg.timestamp || ''}`;
    if (logs.some(l => l.eventoId === eventoId)) return;
    let prog = d.progresso || { total: msg.total || 0, enviados: 0 };
    logs.push({
        numero: msg.numero,
        nome: msg.nome,
        status: msg.status,
        data: new Date().toLocaleDateString('pt-BR'),
        dataISO: new Date().toISOString().slice(0, 10),
        hora: new Date().toLocaleTimeString('pt-BR'),
        timestamp: Date.now(),
        eventoId,
        campanhaId: msg.campanhaId || null,
        mensagem: msg.mensagem,
        variante: msg.variante || null,
        passo: msg.passo != null ? msg.passo : null,
        nota: ''
    });
    if (Number.isFinite(Number(msg.enviados))) prog.enviados = Math.max(0, Number(msg.enviados));
    if (Number.isFinite(Number(msg.total)) && Number(msg.total) > 0) prog.total = Number(msg.total);
    prog.enviados = Math.min(prog.enviados, prog.total || prog.enviados);
    await chrome.storage.local.set({ logs, progresso: prog });
    await atualizarContato(msg.numero, { nome: msg.nome, status: msg.status, mensagem: msg.mensagem, campanhaId: msg.campanhaId });

    // Atualiza progresso global do lote (se aplicável)
    const ld = await chrome.storage.local.get(['loteAtual', 'filaAtual']);
    if (ld.loteAtual && ld.filaAtual && ld.filaAtual.loteId === ld.loteAtual.id) {
        const lote = ld.loteAtual;
        const idx = ld.filaAtual.filaIndexNoLote;
        if (lote.filas[idx]) {
            lote.filas[idx].enviados = msg.enviados;
            lote.progressoGlobal.enviados = lote.filas.reduce((s, f) => s + (f.enviados || 0), 0);
            await chrome.storage.local.set({ loteAtual: lote });
        }
    }

    await registrarEnvioWarmUp();
    if (msg.status === 'OK') await registrarDuplicata(msg.numero);
    try {
        fetch(WEBHOOK_URL, {
            method: 'POST', mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                numero: msg.numero, nomeCliente: msg.nome, status: msg.status,
                data: new Date().toISOString(), mensagem: msg.mensagem,
                variante: msg.variante || null
            })
        }).catch(() => {});
    } catch (e) { console.log("[BG] Webhook falhou:", e); }
}

function atualizarTimerStorage(status) {
    chrome.storage.local.get(['timerData'], d => {
        let timer = d.timerData || { inicio: Date.now(), estimativa: 0, totalPausado: 0, ultimoPause: 0, status: 'rodando' };
        timer.status = status;
        if (status === 'pausado' && timer.ultimoPause === 0) timer.ultimoPause = Date.now();
        if (status === 'rodando' && timer.ultimoPause > 0) {
            timer.totalPausado += (Date.now() - timer.ultimoPause);
            timer.ultimoPause = 0;
        }
        if (status === 'parado' || status === 'concluido') timer.ultimoPause = Date.now();
        chrome.storage.local.set({ timerData: timer });
    });
}

chrome.tabs.onRemoved.addListener((tabId) => { delete contasAbertas[tabId]; });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url && tab.url.includes("web.whatsapp.com")) delete contasAbertas[tabId];
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        if (msg.acao === "wa_status") {
            const tabId = sender.tab && sender.tab.id;
            if (tabId) contasAbertas[tabId] = { numero: msg.info.numero, nome: msg.info.nome, conectado: msg.info.conectado };
            const d = await chrome.storage.local.get(['filaAtual', 'loteAtual']);
            if (!msg.info.conectado && d.filaAtual && ['pendente', 'rodando', 'aguardando_agendamento'].includes(d.filaAtual.status) && Date.now() - ultimaNotificacaoDesconexao > 300000) {
                ultimaNotificacaoDesconexao = Date.now();
                try {
                    chrome.notifications.create('wa_offline_' + Date.now(), {
                        type: 'basic', iconUrl: 'foto perfil.jpeg',
                        title: 'WhatsApp desconectado',
                        message: 'A fila foi preservada e será retomada quando a sessão voltar.',
                        priority: 2, requireInteraction: true
                    });
                } catch (e) {}
            }
            if (d.filaAtual && d.filaAtual.status === 'pendente') tentarIniciarFila();
        }
        if (msg.acao === "content_ready") {
            const tabId = sender.tab && sender.tab.id;
            if (tabId) contasAbertas[tabId] = { numero: msg.numero, nome: msg.nome, conectado: true };
            const d = await chrome.storage.local.get(['filaAtual']);
            const fila = d.filaAtual;
            if (fila && (fila.status === 'rodando' || fila.status === 'pendente') && (!fila.conta || fila.conta === msg.numero)) tentarIniciarFila();
        }
        if (msg.acao === "log_resultado") await registrarLog(msg);
        if (msg.acao === "resposta_cliente") {
            const numero = normalizarNumero(msg.numero);
            if (numero) {
                await registrarResposta(numero, msg.texto);
                await atualizarContato(numero, { resposta: msg.texto });
                const texto = String(msg.texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (/\b(sair|pare|parar|cancelar|remover|nao enviar|nao quero)\b/.test(texto)) {
                    const d = await chrome.storage.local.get(['optOut']);
                    const optOut = d.optOut || {};
                    optOut[numero] = { numero, motivo: 'solicitacao_do_contato', quando: Date.now() };
                    await chrome.storage.local.set({ optOut });
                }
            }
        }
        if (msg.acao === "digitando_cliente") await registrarDigitando(msg.numero);
        if (msg.acao === "progresso_fila") {
            const d = await chrome.storage.local.get(['filaAtual']);
            if (d.filaAtual) { d.filaAtual.indice = msg.indice; await chrome.storage.local.set({ filaAtual: d.filaAtual }); }
        }
        if (msg.acao === "dispatch_concluido") {
            const d = await chrome.storage.local.get(['filaAtual', 'logs', 'loteAtual']);

            if (d.filaAtual) {
                d.filaAtual.status = 'concluido';
                d.filaAtual.concluidaEm = Date.now();

                if (d.filaAtual.tipo === 'drip' && d.filaAtual.dripId) {
                    const dr = await chrome.storage.local.get(['drips']);
                    const drips = dr.drips || [];
                    const drip = drips.find(x => x.id === d.filaAtual.dripId);
                    if (drip) {
                        drip.passosExecutados = drip.passosExecutados || [];
                        if (!drip.passosExecutados.includes(d.filaAtual.passoAtual)) drip.passosExecutados.push(d.filaAtual.passoAtual);
                        await chrome.storage.local.set({ drips });
                    }
                }

                await chrome.storage.local.set({ filaAtual: d.filaAtual });

                // === Avanço do lote ===
                const ld = await chrome.storage.local.get(['loteAtual']);
                if (ld.loteAtual && ld.loteAtual.status === 'rodando') {
                    const lote = ld.loteAtual;
                    if (d.filaAtual.loteId === lote.id) {
                        const idx = d.filaAtual.filaIndexNoLote;
                        if (lote.filas[idx]) lote.filas[idx].status = 'concluido';
                        await chrome.storage.local.set({ loteAtual: lote });
                    }
                    setTimeout(() => iniciarProximaFilaDoLote(), 1500);
                }
            }

            atualizarTimerStorage('concluido');

            try {
                const total = d.logs ? d.logs.length : 0;
                const hoje = new Date().toISOString().slice(0, 10);
                const enviadosHoje = d.logs ? d.logs.filter(l => l.dataISO === hoje && l.status === 'OK').length : 0;
                chrome.notifications.create('fim_' + Date.now(), {
                    type: 'basic',
                    iconUrl: 'foto perfil.jpeg',
                    title: '✅ Disparo concluído!',
                    message: `${enviadosHoje} enviados hoje • ${total} no total`,
                    priority: 2,
                    requireInteraction: true,
                    silent: false
                });
            } catch (e) {}
        }
        if (msg.acao === "dispatch_status") atualizarTimerStorage(msg.pausado ? 'pausado' : 'rodando');
        if (msg.acao === "iniciar") {
            const cfg = (await chrome.storage.local.get(['config'])).config || {};
            const tipo = msg.tipo || 'normal';
            const fila = {
                id: 'fila_' + Date.now(),
                criadaEm: Date.now(),
                status: 'pendente',
                tipo,
                campanhaId: msg.campanhaId || ('campanha_' + Date.now()),
                lista: msg.lista,
                indice: 0,
                scripts: msg.scripts,
                config: {
                    min: parseInt(cfg.min) || 15,
                    max: parseInt(cfg.max) || 30,
                    pausaLoteAtiva: cfg.chkPausaLote || false,
                    qtdLote: parseInt(cfg.qtdLote) || 20,
                    tempoLoteMin: parseInt(cfg.tempoLote) || 5
                },
                conta: msg.conta || cfg.contaAtual || null,
                agendadoPara: msg.agendadoPara || null
            };
            if (tipo === 'ab' && msg.variantes) {
                fila.variantes = msg.variantes;
                fila.atribuicoes = {};
                fila.abStats = {};
                fila.variantes.forEach(v => fila.abStats[v.id] = { enviados: 0, respostas: 0 });
                msg.lista.forEach((c, i) => {
                    const v = msg.variantes[i % msg.variantes.length];
                    fila.atribuicoes[c.num] = v.id;
                });
            }
            if (msg.agendadoPara && msg.agendadoPara > Date.now()) {
                fila.status = 'aguardando_agendamento';
                await chrome.storage.local.set({ agendamento: { ativo: true, dataInicio: new Date(msg.agendadoPara).toISOString() } });
            }
            await chrome.storage.local.set({ filaAtual: fila, progresso: { total: msg.lista.length, enviados: 0 } });
            if (fila.status === 'pendente') tentarIniciarFila();
        }
        if (msg.acao === "iniciar_drip") {
            const dr = await chrome.storage.local.get(['drips']);
            const drips = dr.drips || [];
            const id = 'drip_' + Date.now();
            drips.push({
                id, campanhaId: msg.campanhaId || ('campanha_' + Date.now()), criadoEm: Date.now(), iniciadoEm: Date.now(), ativo: true,
                contatos: msg.contatos, passos: msg.passos, passosExecutados: [],
                conta: msg.conta || null, config: msg.config
            });
            await chrome.storage.local.set({ drips });
            const fila = {
                id: 'fila_' + id + '_p0', criadaEm: Date.now(), status: 'pendente',
                tipo: 'drip', dripId: id, passoAtual: 0,
                lista: msg.contatos.map(c => ({ num: c.num, nome: c.nome })),
                campanhaId: msg.campanhaId || id,
                indice: 0, scripts: msg.passos[0].scripts, config: msg.config,
                conta: msg.conta || null
            };
            await chrome.storage.local.set({ filaAtual: fila, progresso: { total: fila.lista.length, enviados: 0 } });
            tentarIniciarFila();
        }
        if (msg.acao === "pausar") {
            pausadoManual = !pausadoManual;
            broadcastToWhatsApp({ acao: 'pausar' });
            atualizarTimerStorage(pausadoManual ? 'pausado' : 'rodando');
        }
        if (msg.acao === "parar") {
            pausadoManual = false;
            const d = await chrome.storage.local.get(['filaAtual', 'loteAtual']);
            if (d.filaAtual) { d.filaAtual.status = 'parado'; await chrome.storage.local.set({ filaAtual: d.filaAtual }); }
            if (d.loteAtual) { d.loteAtual.status = 'parado'; await chrome.storage.local.set({ loteAtual: d.loteAtual }); }
            broadcastToWhatsApp({ acao: 'parar' });
            atualizarTimerStorage('parado');
        }
        if (msg.acao === "retomar_fila_pausada") {
            const d = await chrome.storage.local.get(['filaAtual']);
            if (d.filaAtual && (d.filaAtual.status === 'parado' || d.filaAtual.status === 'pausado_horario')) {
                d.filaAtual.status = 'pendente';
                await chrome.storage.local.set({ filaAtual: d.filaAtual });
                tentarIniciarFila();
            }
        }
        if (msg.acao === "limpar_fila") await chrome.storage.local.set({ filaAtual: null, progresso: { total: 0, enviados: 0 }, loteAtual: null });
        if (msg.acao === "salvar_nota") {
            const d = await chrome.storage.local.get(['logs']);
            const logs = d.logs || [];
            if (logs[msg.index]) {
                logs[msg.index].nota = msg.nota || '';
                await chrome.storage.local.set({ logs });
            }
        }
        if (msg.acao === "backup_dados") { const d = await chrome.storage.local.get(null); sendResponse({ ok: true, dados: d }); return; }
        if (msg.acao === "restaurar_dados") { await chrome.storage.local.clear(); await chrome.storage.local.set(msg.dados); sendResponse({ ok: true }); return; }
        if (msg.acao === "zerar_crm") {
            await salvarUndo('zerar_crm');
            await chrome.storage.local.set({ logs: [], progresso: { total: 0, enviados: 0 }, respostas: {}, duplicatas: {}, digitando: {} });
            sendResponse({ ok: true }); return;
        }
        if (msg.acao === "adicionar_optout") {
            const numero = normalizarNumero(msg.numero);
            if (numero) {
                const d = await chrome.storage.local.get(['optOut']);
                const optOut = d.optOut || {};
                optOut[numero] = { numero, motivo: msg.motivo || 'manual', quando: Date.now() };
                await chrome.storage.local.set({ optOut });
            }
            sendResponse({ ok: true }); return;
        }
        if (msg.acao === "remover_optout") {
            const numero = normalizarNumero(msg.numero);
            const d = await chrome.storage.local.get(['optOut']);
            const optOut = d.optOut || {};
            delete optOut[numero];
            await chrome.storage.local.set({ optOut });
            sendResponse({ ok: true }); return;
        }
        if (msg.acao === "listar_optout") {
            const d = await chrome.storage.local.get(['optOut']);
            sendResponse({ ok: true, optOut: d.optOut || {} }); return;
        }
        if (msg.acao === "undo") {
            const d = await chrome.storage.local.get(['undoState']);
            if (d.undoState && Date.now() - d.undoState.quando < 120000) {
                await chrome.storage.local.set(d.undoState.dados);
                await chrome.storage.local.remove('undoState');
                sendResponse({ ok: true });
            } else {
                sendResponse({ ok: false, erro: 'Nada para desfazer' });
            }
            return;
        }

        /* ====== LOTE ====== */
        if (msg.acao === "iniciar_lote") {
            pausadoManual = false;
            await iniciarLote(msg);
            sendResponse({ ok: true });
            return;
        }
        if (msg.acao === "parar_lote") {
            const d = await chrome.storage.local.get(['loteAtual']);
            if (d.loteAtual) {
                d.loteAtual.status = 'parado';
                await chrome.storage.local.set({ loteAtual: d.loteAtual });
            }
            sendResponse({ ok: true });
            return;
        }
        if (msg.acao === "retomar_lote") {
            const d = await chrome.storage.local.get(['loteAtual', 'filaAtual']);
            if (d.loteAtual && d.loteAtual.status === 'parado') {
                d.loteAtual.status = 'rodando';
                await chrome.storage.local.set({ loteAtual: d.loteAtual });
                if (d.filaAtual && d.filaAtual.loteId === d.loteAtual.id &&
                    (d.filaAtual.status === 'parado' || d.filaAtual.status === 'pausado_horario')) {
                    d.filaAtual.status = 'pendente';
                    await chrome.storage.local.set({ filaAtual: d.filaAtual });
                    tentarIniciarFila();
                } else {
                    await iniciarProximaFilaDoLote();
                }
            }
            sendResponse({ ok: true });
            return;
        }
        if (msg.acao === "cancelar_lote") {
            await chrome.storage.local.remove('loteAtual');
            sendResponse({ ok: true });
            return;
        }

        // Multi-perfil
        if (msg.acao === "salvar_perfil") {
            const d = await chrome.storage.local.get(['profiles']);
            const profiles = d.profiles || {};
            profiles[msg.nome] = {
                config: (await chrome.storage.local.get(['config'])).config || {},
                scriptsSalvos: (await chrome.storage.local.get(['scriptsSalvos'])).scriptsSalvos || [],
                bancoCampanhas: (await chrome.storage.local.get(['bancoCampanhas'])).bancoCampanhas || {},
                numerosSalvos: (await chrome.storage.local.get(['numerosSalvos'])).numerosSalvos || '',
                criadoEm: Date.now()
            };
            await chrome.storage.local.set({ profiles, activeProfile: msg.nome });
            sendResponse({ ok: true });
            return;
        }
        if (msg.acao === "carregar_perfil") {
            const d = await chrome.storage.local.get(['profiles']);
            const profiles = d.profiles || {};
            const p = profiles[msg.nome];
            if (!p) { sendResponse({ ok: false }); return; }
            await chrome.storage.local.set({
                config: p.config || {},
                scriptsSalvos: p.scriptsSalvos || [],
                bancoCampanhas: p.bancoCampanhas || {},
                numerosSalvos: p.numerosSalvos || '',
                activeProfile: msg.nome
            });
            sendResponse({ ok: true });
            return;
        }
        if (msg.acao === "deletar_perfil") {
            const d = await chrome.storage.local.get(['profiles', 'activeProfile']);
            const profiles = d.profiles || {};
            delete profiles[msg.nome];
            await chrome.storage.local.set({ profiles });
            if (d.activeProfile === msg.nome) await chrome.storage.local.remove('activeProfile');
            sendResponse({ ok: true });
            return;
        }
        if (msg.acao === "listar_perfis") {
            const d = await chrome.storage.local.get(['profiles', 'activeProfile']);
            sendResponse({ ok: true, profiles: Object.keys(d.profiles || {}), ativo: d.activeProfile || '' });
            return;
        }
        sendResponse({ ok: true });
    })();
    return true;
});
