document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const numeros = $('numeros');
    const contScripts = $('contScripts');
    const selCampanha = $('selCampanha');
    const nomeNovaCampanha = $('nomeNovaCampanha');

    let lastLogCount = -1;
    let lastRespCount = -1;
    let lastDigitCount = -1;
    let listaCampanhas = {};

    // Filtros do CRM
    let filtroDias = 0;   // 0 = hoje, 1 = ontem, 7, 30, -1 = tudo
    let filtroBusca = '';

    /* ===============================
       STATUS WHATSAPP (via runtime)
       =============================== */
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.acao === "wa_status") {
            const bar = $('wa-status-bar'), icon = $('wa-icon'), text = $('wa-text'), chip = $('wa-chip');
            if (msg.info.conectado) {
                bar.className = 'wa-status-bar online';
                icon.innerText = '🟢';
                text.innerText = `Conectado: ${msg.info.nome}`;
                chip.style.display = 'block';
                chip.innerText = `+${msg.info.numero}`;
                $('btnStart').disabled = false;
            } else {
                bar.className = 'wa-status-bar offline';
                icon.innerText = '🔴';
                text.innerText = 'Aguardando WhatsApp...';
                chip.style.display = 'none';
                $('btnStart').disabled = true;
            }
        }
        if (msg.acao === "dispatch_concluido") $('btnStart').disabled = false;
    });

    /* ===============================
       CARGA INICIAL
       =============================== */
    chrome.storage.local.get(null, (d) => {
        if (d.theme === 'light') { document.body.classList.add('light-mode'); $('themeToggle').innerText = '☀️'; }
        if (d.numerosSalvos) numeros.value = d.numerosSalvos;

        const cfg = d.config || {};
        $('minDelay').value = cfg.min || 15;
        $('maxDelay').value = cfg.max || 30;
        $('chkPausaLote').checked = cfg.chkPausaLote || false;
        $('qtdLote').value = cfg.qtdLote || 20;
        $('tempoLote').value = cfg.tempoLote || 5;
        $('horarioAtivo').checked = cfg.horarioAtivo || false;
        $('horarioInicio').value = cfg.horarioInicio || '08:00';
        $('horarioFim').value = cfg.horarioFim || '20:00';
        (cfg.diasSemana || [1,2,3,4,5,6]).forEach(dia => {
            const el = document.querySelector(`.diaSemana[value="${dia}"]`);
            if (el) el.checked = true;
        });
        $('ignoraDuplicatas').checked = cfg.ignoraDuplicatas || false;
        $('diasDuplicata').value = cfg.diasDuplicata || 30;
        $('warmUpAtivo').checked = cfg.warmUpAtivo || false;
        $('warmUpInicio').value = cfg.warmUpInicio || '';

        const contas = d.contasDisponiveis || [];
        const sel = $('contaAtual');
        sel.innerHTML = '<option value="">(qualquer aba aberta)</option>';
        contas.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.numero;
            opt.innerText = `+${c.numero} (${c.nome})`;
            sel.appendChild(opt);
        });
        sel.value = cfg.contaAtual || '';

        if (d.filaAtual && (d.filaAtual.status === 'pendente' || d.filaAtual.status === 'rodando' || d.filaAtual.status === 'parado' || d.filaAtual.status === 'pausado_horario')) {
            $('bannerRetomar').classList.add('show');
        }

        listaCampanhas = d.bancoCampanhas || {
            "Campanha Padrão": [
                { texto: "{Olá|Oi|Tudo bem}, [NOME]! Sou o Leonardo Aguiar, consultor Hapvida. Temos condições exclusivas. Me confirme: Idades e Cidade.", ativo: true }
            ]
        };
        atualizarMenuDropdown(d.campanhaSelecionada || "");

        const saved = d.scriptsSalvos || [];
        let html = "";
        for (let i = 0; i < 20; i++) {
            const s = saved[i] || { texto: '', ativo: true };
            html += `<div style="display:flex;gap:10px;margin-bottom:8px;align-items:center;">
                <input type="checkbox" class="chkScript" id="chk_${i}" ${s.ativo ? 'checked' : ''} style="width:18px;height:18px;">
                <textarea class="txtScript" id="txt_${i}" placeholder="Variação ${i+1}" style="flex:1;padding:8px;border-radius:5px;background:var(--input);color:var(--text);border:1px solid var(--border);height:45px;margin:0;font-family:inherit;">${escapeHtml(s.texto)}</textarea>
            </div>`;
        }
        contScripts.innerHTML = html;
        document.querySelectorAll('.chkScript').forEach(chk => chk.addEventListener('change', salvarFilaAtualScripts));

        // LOTE: persistência de listas
        const loteSalvas = d.loteListasSalvas;
        if (loteSalvas && loteSalvas.length) {
            loteSalvas.forEach(l => criarCardLista(l.nome, l.numeros));
        } else {
            criarCardLista();
        }

        atualizarInfoScriptsLote();

        if (d.abaAtiva) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.aba').forEach(a => a.classList.remove('active'));
            const btn = document.querySelector(`.tab-btn[data-target="${d.abaAtiva}"]`);
            const aba = $(d.abaAtiva);
            if (btn && aba) { btn.classList.add('active'); aba.classList.add('active'); if (d.abaAtiva === 'crm') renderCRM(); }
        }

        // Onboarding (apenas na primeira instalação)
        if (d.needsOnboarding) {
            iniciarOnboarding();
        }
    });

    function escapeHtml(s) { return !s ? '' : String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

    /* ===============================
       SCRIPTS
       =============================== */
    function salvarFilaAtualScripts() {
        const arr = [];
        document.querySelectorAll('.txtScript').forEach((t, i) => {
            const chk = document.getElementById(`chk_${i}`);
            arr.push({ texto: t.value, ativo: chk ? chk.checked : false });
        });
        chrome.storage.local.set({ scriptsSalvos: arr });
        const nome = selCampanha.value;
        if (nome && listaCampanhas[nome]) {
            listaCampanhas[nome] = arr;
            chrome.storage.local.set({ bancoCampanhas: listaCampanhas });
        }
        atualizarInfoScriptsLote();
    }

    function pegarScriptsAtivos() {
        const out = [];
        document.querySelectorAll('.txtScript').forEach((t, i) => {
            const chk = document.getElementById(`chk_${i}`);
            if (chk && chk.checked && t.value.trim()) out.push(t.value.trim());
        });
        return out;
    }

    function atualizarInfoScriptsLote() {
        const box = $('loteScriptsInfo');
        const txt = $('loteScriptsInfoTxt');
        if (!box || !txt) return;
        const n = pegarScriptsAtivos().length;
        if (n > 0) {
            box.classList.remove('warn');
            txt.innerText = `✍️ Scripts ativos: ${n} — o lote vai usar esses scripts`;
        } else {
            box.classList.add('warn');
            txt.innerText = `⚠️ Nenhum script ativo. Ative pelo menos 1 na aba SCRIPTS.`;
        }
    }

    function atualizarMenuDropdown(nome = "") {
        selCampanha.innerHTML = '<option value="">-- Scripts em Edição --</option>';
        Object.keys(listaCampanhas).forEach(n => {
            const opt = document.createElement('option');
            opt.value = n; opt.innerText = n;
            if (n === nome) opt.selected = true;
            selCampanha.appendChild(opt);
        });
        nomeNovaCampanha.value = nome || "";
    }

    selCampanha.addEventListener('change', (e) => {
        const nome = e.target.value;
        chrome.storage.local.set({ campanhaSelecionada: nome });
        if (nome && listaCampanhas[nome]) {
            const dados = listaCampanhas[nome];
            document.querySelectorAll('.txtScript').forEach((t, i) => {
                if (dados[i]) { t.value = dados[i].texto; document.getElementById(`chk_${i}`).checked = dados[i].ativo; }
                else { t.value = ""; document.getElementById(`chk_${i}`).checked = false; }
            });
            nomeNovaCampanha.value = nome;
            salvarFilaAtualScripts();
        } else nomeNovaCampanha.value = "";
    });

    $('btnSalvarCampanha').onclick = () => {
        const nome = nomeNovaCampanha.value.trim();
        if (!nome) return alert("Digite um nome!");
        const arr = [];
        document.querySelectorAll('.txtScript').forEach((t, i) => {
            arr.push({ texto: t.value, ativo: document.getElementById(`chk_${i}`).checked });
        });
        listaCampanhas[nome] = arr;
        chrome.storage.local.set({ bancoCampanhas: listaCampanhas, campanhaSelecionada: nome }, () => {
            atualizarMenuDropdown(nome);
            alert(`Campanha "${nome}" salva!`);
        });
    };

    $('btnDeletarCampanha').onclick = () => {
        const n = selCampanha.value;
        if (!n) return alert("Selecione uma campanha.");
        if (confirm(`Excluir "${n}"?`)) {
            delete listaCampanhas[n];
            chrome.storage.local.set({ bancoCampanhas: listaCampanhas, campanhaSelecionada: "" }, () => atualizarMenuDropdown(""));
        }
    };

    numeros.addEventListener('input', () => chrome.storage.local.set({ numerosSalvos: numeros.value }));
    contScripts.addEventListener('input', salvarFilaAtualScripts);
    contScripts.addEventListener('change', salvarFilaAtualScripts);

    $('btnImportarScripts').onclick = () => $('inputScripts').click();
    $('inputScripts').addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const conteudo = ev.target.result;
            let scripts = [];
            if (file.name.endsWith('.json')) {
                try { const j = JSON.parse(conteudo); scripts = Array.isArray(j) ? j : (j.scripts || []); } catch { alert('JSON inválido'); return; }
            } else scripts = conteudo.split(/\r?\n---\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
            document.querySelectorAll('.txtScript').forEach((t, i) => { t.value = ''; document.getElementById(`chk_${i}`).checked = false; });
            scripts.slice(0, 20).forEach((texto, idx) => {
                document.getElementById(`txt_${idx}`).value = texto;
                document.getElementById(`chk_${idx}`).checked = true;
            });
            const nome = file.name.replace(/\.[^.]+$/, '');
            $('nomeNovaCampanha').value = nome;
            const arr = [];
            document.querySelectorAll('.txtScript').forEach((t, i) => arr.push({ texto: t.value, ativo: document.getElementById(`chk_${i}`).checked }));
            listaCampanhas[nome] = arr;
            chrome.storage.local.set({ bancoCampanhas: listaCampanhas, campanhaSelecionada: nome }, () => atualizarMenuDropdown(nome));
            alert(`Importado: "${nome}"`);
        };
        reader.readAsText(file, 'UTF-8');
        $('inputScripts').value = '';
    });

    $('btnExportarScripts').onclick = () => {
        const scripts = pegarScriptsAtivos();
        if (!scripts.length) return alert('Nenhum script ativo.');
        const blob = new Blob([scripts.join('\n---\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'scripts_exportados.txt';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    $('btnLimparScripts').onclick = () => {
        if (confirm('Limpar todos os campos?')) {
            document.querySelectorAll('.txtScript').forEach(t => t.value = '');
            salvarFilaAtualScripts();
        }
    };

    /* ===============================
       HELPERS (linhas / números)
       =============================== */
    function extrairNumeroNomeLinha(linha) {
        let limpa = linha.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
        if (!limpa) return null;
        let numeroRaw = '', nome = 'Cliente';
        if (limpa.includes(';')) {
            const p = limpa.split(';');
            numeroRaw = p[0].trim();
            if (p[1]) nome = p[1].trim();
        } else if (limpa.includes(':')) {
            const p = limpa.split(':');
            const esq = p[0].trim(), dir = p[1].trim();
            if (/^[\d\+]+$/.test(dir)) { numeroRaw = dir; nome = esq; }
            else if (/^[\d\+]+$/.test(esq)) { numeroRaw = esq; nome = dir; }
            else { const nums = limpa.match(/\d+/g); if (nums) { numeroRaw = nums.join(''); nome = limpa.replace(/\d+/g, '').replace(/[:;]/g, '').trim() || 'Cliente'; } }
        } else if (limpa.includes(' ')) {
            const palavras = limpa.split(/\s+/);
            let cNum = null, cNome = [];
            for (const p of palavras) if (/^[\d\+]+$/.test(p)) cNum = p; else cNome.push(p);
            if (cNum) { numeroRaw = cNum; nome = cNome.join(' ') || 'Cliente'; } else numeroRaw = limpa;
        } else numeroRaw = limpa;
        const so = numeroRaw.replace(/\D/g, '');
        if (!so) return null;
        return { numero: so, nome };
    }

    function formatarNumeroFinal(n) {
        if (n.length < 10) return null;
        if (!n.startsWith('55')) n = '55' + n;
        if (n.length > 13) n = n.slice(0, 13);
        if (n.length < 12) return null;
        const ddd = n.slice(2, 4);
        let resto = n.slice(4);
        if (resto.length === 8) resto = '9' + resto;
        if (resto.length === 9) return '55' + ddd + resto;
        return null;
    }

    function validarLista() {
        const linhas = numeros.value.split(/\r?\n/).filter(l => l.trim());
        const validos = []; let invalidos = 0;
        for (const l of linhas) {
            const ex = extrairNumeroNomeLinha(l);
            if (!ex) { invalidos++; continue; }
            const nf = formatarNumeroFinal(ex.numero);
            if (nf) validos.push({ num: nf, nome: ex.nome }); else invalidos++;
        }
        return { total: linhas.length, validos: validos.length, invalidos, lista: validos };
    }

    /* ===============================
       DISPARO: IMPORTAR EXCEL/CSV
       =============================== */
    $('btnImportarLista').onclick = () => $('inputLista').click();
    $('inputLista').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        const isExcel = /\.(xlsx|xls)$/i.test(file.name);
        reader.onload = (ev) => {
            try {
                let linhas = [];
                if (isExcel) {
                    const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
                    linhas = rows.map(r => {
                        if (!r || r.length === 0) return '';
                        const num = String(r[0] || '').trim();
                        const nome = String(r[1] || '').trim();
                        if (!num) return '';
                        return nome ? `${num};${nome}` : num;
                    }).filter(Boolean);
                } else {
                    linhas = String(ev.target.result).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                }
                if (!linhas.length) { alert('Arquivo vazio ou formato não reconhecido.'); return; }
                numeros.value = linhas.join('\n');
                chrome.storage.local.set({ numerosSalvos: numeros.value });
                alert(`Importados ${linhas.length} registros de "${file.name}".`);
            } catch (err) {
                alert('Erro ao ler arquivo: ' + (err.message || err));
            }
        };
        if (isExcel) reader.readAsArrayBuffer(file);
        else reader.readAsText(file, 'UTF-8');
        $('inputLista').value = '';
    });

    /* ===============================
       DISPARO: PREVIEW
       =============================== */
    $('btnPreview').onclick = () => {
        const res = validarLista();
        if (!res.lista.length) return alert('Nenhum número válido!');
        const scripts = pegarScriptsAtivos();
        if (!scripts.length) return alert('Nenhum script ativo!');
        const amostra = res.lista.slice(0, 3);
        let out = "==== PREVIEW ====\n\n";
        amostra.forEach(c => {
            const s = scripts[Math.floor(Math.random() * scripts.length)];
            let texto = s;
            const regex = /{([^{}]*)}/g; let m;
            while ((m = regex.exec(texto)) !== null) {
                const ops = m[1].split('|');
                texto = texto.replace(m[0], ops[Math.floor(Math.random() * ops.length)]);
                regex.lastIndex = 0;
            }
            const nomeF = c.nome.charAt(0).toUpperCase() + c.nome.slice(1).toLowerCase();
            texto = texto.replace(/\[NOME\]/g, nomeF);
            out += `📞 +${c.num} (${c.nome})\n${texto}\n\n`;
        });
        alert(out);
    };

    /* ===============================
       DISPARO: START
       =============================== */
    $('btnStart').onclick = () => {
        const res = validarLista();
        if (!res.lista.length) return alert(`Nenhum número válido (${res.invalidos} inválidos)`);

        const modo = $('modoCampanha').value;
        const agendamento = $('agendamentoData').value ? new Date($('agendamentoData').value).getTime() : null;

        if (modo === 'drip') {
            alert('Para Drip, use o botão "▶ INICIAR SEQUÊNCIA" na aba CAMPANHAS.');
            return;
        }

        if (modo === 'ab') {
            // Coletar variantes
            const variantes = [];
            document.querySelectorAll('#variantesContainer .varScript').forEach((t, i) => {
                const linhas = t.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                if (linhas.length) {
                    variantes.push({ id: String.fromCharCode(65 + i), scripts: linhas });
                }
            });
            if (variantes.length < 2) return alert('A/B precisa de pelo menos 2 variantes preenchidas.');

            if (!confirm(`Iniciar A/B com ${res.lista.length} contatos e ${variantes.length} variantes?`)) return;

            const min = parseInt($('minDelay').value) || 15;
            const max = parseInt($('maxDelay').value) || 30;
            const estimativa = Math.round(res.lista.length * (((min + max) / 2) + 4));

            $('btnStart').disabled = true;
            chrome.storage.local.set({
                progresso: { total: res.lista.length, enviados: 0 },
                timerData: { inicio: Date.now(), estimativa, totalPausado: 0, ultimoPause: 0, status: 'rodando' }
            }, () => {
                lastLogCount = -1;
                chrome.runtime.sendMessage({
                    acao: "iniciar",
                    lista: res.lista,
                    scripts: variantes[0].scripts,
                    tipo: 'ab',
                    variantes,
                    agendadoPara: agendamento,
                    conta: $('contaAtual').value || null
                });
            });
            return;
        }

        // Normal
        const scripts = pegarScriptsAtivos();
        if (!scripts.length) return alert('Nenhum script ativo!');

        if (!confirm(`Iniciar disparo para ${res.lista.length} contatos?`)) return;

        const min = parseInt($('minDelay').value) || 15;
        const max = parseInt($('maxDelay').value) || 30;
        const estimativa = Math.round(res.lista.length * (((min + max) / 2) + 4));

        $('btnStart').disabled = true;
        chrome.storage.local.set({
            progresso: { total: res.lista.length, enviados: 0 },
            timerData: { inicio: Date.now(), estimativa, totalPausado: 0, ultimoPause: 0, status: 'rodando' }
        }, () => {
            lastLogCount = -1;
            chrome.runtime.sendMessage({
                acao: "iniciar",
                lista: res.lista,
                scripts,
                tipo: modo,
                agendadoPara: agendamento,
                conta: $('contaAtual').value || null
            });
        });
    };

    $('btnPause').onclick = () => chrome.runtime.sendMessage({ acao: "pausar" });
    $('btnStop').onclick = () => {
        chrome.runtime.sendMessage({ acao: "parar" });
        $('btnStart').disabled = false;
    };

    $('btnRetomar').onclick = () => {
        chrome.runtime.sendMessage({ acao: "retomar_fila_pausada" });
        $('bannerRetomar').classList.remove('show');
    };
    $('btnDescartar').onclick = () => {
        if (confirm('Descartar a fila pendente?')) {
            chrome.runtime.sendMessage({ acao: "limpar_fila" });
            $('bannerRetomar').classList.remove('show');
        }
    };

    $('forcarConexao').onclick = () => {
        chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { acao: "ping" });
            else alert("Abra o WhatsApp Web!");
        });
    };

    /* ===============================
       CONFIG
       =============================== */
    function salvarConfig() {
        const cfg = {
            min: $('minDelay').value,
            max: $('maxDelay').value,
            chkPausaLote: $('chkPausaLote').checked,
            qtdLote: $('qtdLote').value,
            tempoLote: $('tempoLote').value,
            horarioAtivo: $('horarioAtivo').checked,
            horarioInicio: $('horarioInicio').value,
            horarioFim: $('horarioFim').value,
            diasSemana: Array.from(document.querySelectorAll('.diaSemana:checked')).map(e => parseInt(e.value)),
            ignoraDuplicatas: $('ignoraDuplicatas').checked,
            diasDuplicata: parseInt($('diasDuplicata').value) || 30,
            warmUpAtivo: $('warmUpAtivo').checked,
            warmUpInicio: $('warmUpInicio').value,
            contaAtual: $('contaAtual').value
        };
        chrome.storage.local.get(['config'], d => {
            const merged = Object.assign({}, d.config || {}, cfg);
            chrome.storage.local.set({ config: merged });
        });
    }
    ['minDelay','maxDelay','chkPausaLote','qtdLote','tempoLote','horarioAtivo','horarioInicio','horarioFim','ignoraDuplicatas','diasDuplicata','warmUpAtivo','warmUpInicio','contaAtual'].forEach(id => {
        const el = $(id); if (el) el.addEventListener('change', salvarConfig);
    });
    document.querySelectorAll('.diaSemana').forEach(e => e.addEventListener('change', salvarConfig));

    $('salvarConfig').onclick = () => { salvarConfig(); alert("Configurações salvas!"); };

    /* ===============================
       PERFIS (Config)
       =============================== */
    function carregarPerfis() {
        chrome.runtime.sendMessage({ acao: 'listar_perfis' }, (res) => {
            if (!res || !res.ok) return;
            const sel = $('selPerfil');
            sel.innerHTML = '<option value="">(nenhum)</option>';
            res.profiles.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                if (p === res.ativo) opt.selected = true;
                sel.appendChild(opt);
            });
            $('perfilAtivoLabel').textContent = res.ativo || 'Leonardo Aguiar';
        });
    }
    carregarPerfis();

    $('btnSalvarPerfil').onclick = () => {
        const nome = $('nomeNovoPerfil').value.trim();
        if (!nome) return alert('Digite um nome para o perfil.');
        chrome.runtime.sendMessage({ acao: 'salvar_perfil', nome }, (res) => {
            if (res && res.ok) {
                carregarPerfis();
                $('perfilAtivoLabel').textContent = nome;
                alert(`Perfil "${nome}" salvo!`);
            } else alert('Erro ao salvar perfil.');
        });
    };

    $('btnDeletarPerfil').onclick = () => {
        const nome = $('selPerfil').value;
        if (!nome) return alert('Selecione um perfil.');
        if (!confirm(`Excluir o perfil "${nome}"?`)) return;
        chrome.runtime.sendMessage({ acao: 'deletar_perfil', nome }, (res) => {
            if (res && res.ok) { carregarPerfis(); $('perfilAtivoLabel').textContent = 'Leonardo Aguiar'; }
        });
    };

    $('selPerfil').addEventListener('change', (e) => {
        const nome = e.target.value;
        if (!nome) { $('perfilAtivoLabel').textContent = 'Leonardo Aguiar'; return; }
        if (!confirm(`Carregar o perfil "${nome}"? Isso substituirá a configuração atual.`)) {
            carregarPerfis(); // reseta seleção
            return;
        }
        chrome.runtime.sendMessage({ acao: 'carregar_perfil', nome }, (res) => {
            if (res && res.ok) {
                $('perfilAtivoLabel').textContent = nome;
                location.reload();
            } else alert('Erro ao carregar perfil.');
        });
    });

    /* ===============================
       CAMPANHAS: A/B e Drip
       =============================== */
    $('modoCampanha').addEventListener('change', (e) => {
        $('painelAB').style.display = e.target.value === 'ab' ? 'block' : 'none';
        $('painelDrip').style.display = e.target.value === 'drip' ? 'block' : 'none';
        if (e.target.value === 'ab' && !$('variantesContainer').children.length) { addVariante(); addVariante(); }
        if (e.target.value === 'drip' && !$('passosContainer').children.length) { addPasso(0); addPasso(2); }
    });

    function addVariante() {
        const cont = $('variantesContainer');
        const idx = cont.children.length;
        const div = document.createElement('div');
        div.style = 'margin-bottom:8px;padding:8px;background:var(--bg);border-radius:6px;';
        div.innerHTML = `<label>Variante ${String.fromCharCode(65+idx)}</label>
            <textarea class="varScript" placeholder="Um script por linha" style="height:60px;font-family:inherit;"></textarea>`;
        cont.appendChild(div);
    }
    $('btnAddVariante').onclick = addVariante;

    function addPasso(dia = 0) {
        const cont = $('passosContainer');
        const idx = cont.children.length;
        const div = document.createElement('div');
        div.style = 'margin-bottom:8px;padding:8px;background:var(--bg);border-radius:6px;';
        div.innerHTML = `<label>Passo ${idx} — após <input type="number" class="passoDia" value="${dia}" style="width:60px;display:inline-block;padding:2px;"> dias</label>
            <textarea class="passoScript" style="height:60px;font-family:inherit;" placeholder="Mensagem do passo ${idx}"></textarea>`;
        cont.appendChild(div);
    }
    $('btnAddPasso').onclick = () => addPasso(0);

    $('btnIniciarDrip').onclick = () => {
        const res = validarLista();
        if (!res.lista.length) return alert('Lista vazia ou sem números válidos.');
        const passos = [];
        Array.from($('passosContainer').children).forEach((el, i) => {
            const dia = parseInt(el.querySelector('.passoDia').value) || 0;
            const script = el.querySelector('.passoScript').value.trim();
            if (script) passos.push({ dia, scripts: [script] });
        });
        if (!passos.length) return alert('Adicione pelo menos 1 passo!');
        const min = parseInt($('minDelay').value) || 15;
        const max = parseInt($('maxDelay').value) || 30;
        chrome.runtime.sendMessage({
            acao: "iniciar_drip",
            contatos: res.lista,
            passos,
            conta: $('contaAtual').value || null,
            config: {
                min, max,
                pausaLoteAtiva: $('chkPausaLote').checked,
                qtdLote: parseInt($('qtdLote').value) || 20,
                tempoLoteMin: parseInt($('tempoLote').value) || 5
            }
        });
        alert('Sequência criada! Passo 0 vai iniciar.');
    };

    /* ===============================
       LOTE DE LISTAS
       =============================== */
    function salvarLoteListas() {
        const cards = Array.from($('loteListas').children);
        const data = cards.map(c => ({
            nome: c.querySelector('.lote-nome').value,
            numeros: c.querySelector('.lote-numeros').value
        }));
        chrome.storage.local.set({ loteListasSalvas: data });
    }

    function criarCardLista(nome = '', numsText = '') {
        const container = $('loteListas');
        if (!container) return;
        const idx = container.children.length;
        const div = document.createElement('div');
        div.className = 'lote-card';
        div.innerHTML = `
            <div class="lote-card-head">
                <input type="text" class="lote-nome" value="${escapeHtml(nome || ('Lista ' + (idx + 1)))}">
                <button class="btn btn-danger btn-sm btn-remove" title="Remover">🗑</button>
            </div>
            <textarea class="lote-numeros" placeholder="Números (um por linha). Ex: 85999999999;João" style="height:110px;">${escapeHtml(numsText)}</textarea>
        `;
        div.querySelector('.btn-remove').onclick = () => {
            div.remove();
            salvarLoteListas();
        };
        div.querySelectorAll('input, textarea').forEach(el => el.addEventListener('input', salvarLoteListas));
        container.appendChild(div);
    }

    $('btnAddListaLote').onclick = () => criarCardLista();

    $('btnIrParaScripts').onclick = () => {
        const btn = document.querySelector('.tab-btn[data-target="scripts"]');
        if (btn) btn.click();
    };

    $('btnIniciarLote').onclick = () => {
        const scriptsGlobais = pegarScriptsAtivos();
        if (!scriptsGlobais.length) {
            alert('Nenhum script ativo. Vá na aba SCRIPTS e marque pelo menos 1 script.');
            return;
        }
        const cards = Array.from($('loteListas').children);
        if (!cards.length) return alert('Adicione pelo menos uma lista.');

        const filas = [];
        for (const card of cards) {
            const nome = card.querySelector('.lote-nome').value.trim() || 'Lista';
            const numsText = card.querySelector('.lote-numeros').value.trim();
            if (!numsText) return alert(`Lista "${nome}" está vazia.`);
            const linhas = numsText.split(/\r?\n/).filter(l => l.trim());
            const lista = [];
            for (const l of linhas) {
                const ex = extrairNumeroNomeLinha(l);
                if (!ex) continue;
                const nf = formatarNumeroFinal(ex.numero);
                if (nf) lista.push({ num: nf, nome: ex.nome });
            }
            if (!lista.length) return alert(`Lista "${nome}" não tem números válidos.`);
            filas.push({ nome, lista, scripts: scriptsGlobais });
        }

        const total = filas.reduce((s, f) => s + f.lista.length, 0);
        if (!confirm(`Iniciar lote com ${filas.length} lista(s), ${total} contato(s) e ${scriptsGlobais.length} script(s) ativo(s)?`)) return;

        chrome.runtime.sendMessage({ acao: 'iniciar_lote', filas });
        $('loteTxtEnvios').innerText = `0 / ${total}`;
        $('lotePercent').innerText = '0%';
        $('loteBar').style.width = '0%';
        $('loteStatus').innerText = 'Lote em andamento...';
    };

    $('btnPararLote').onclick = () => {
        chrome.runtime.sendMessage({ acao: 'parar' });
        chrome.runtime.sendMessage({ acao: 'parar_lote' });
        $('loteStatus').innerText = 'Lote parado.';
    };

    $('btnRetomarLote').onclick = () => {
        chrome.runtime.sendMessage({ acao: 'retomar_lote' });
        $('loteStatus').innerText = 'Retomando lote...';
    };

    /* ===============================
       UNDO
       =============================== */
    function verificarUndo() {
        chrome.storage.local.get(['undoState'], d => {
            const btn = $('btnUndo');
            if (d.undoState && Date.now() - d.undoState.quando < 120000) btn.classList.add('show');
            else btn.classList.remove('show');
        });
    }
    verificarUndo();
    setInterval(verificarUndo, 5000);

    $('btnUndo').onclick = () => {
        chrome.runtime.sendMessage({ acao: 'undo' }, (res) => {
            if (res && res.ok) {
                $('btnUndo').classList.remove('show');
                alert('Ação desfeita!');
                renderCRM();
            } else alert('Nada para desfazer (limite de 2 minutos).');
        });
    };

    /* ===============================
       CRM (dashboard + tabela + filtros)
       =============================== */
    function renderCRM() {
        chrome.storage.local.get({ logs: [], respostas: {}, digitando: {} }, d => {
            // Dashboard (sempre mostra totais, independente do filtro)
            $('crmTotal').innerText = d.logs.length;
            $('crmOk').innerText = d.logs.filter(l => l.status === 'OK').length;
            $('crmErro').innerText = d.logs.filter(l => l.status !== 'OK' && l.status !== 'DUPLICADO').length;
            $('crmResp').innerText = Object.keys(d.respostas || {}).length;
            $('crmDigit').innerText = Object.keys(d.digitando || {}).length;

            // Aplica filtros
            let data = d.logs;
            if (filtroDias >= 0) {
                const hoje = new Date(); hoje.setHours(0,0,0,0);
                if (filtroDias === 0) {
                    data = data.filter(l => new Date(l.dataISO).toDateString() === hoje.toDateString());
                } else if (filtroDias === 1) {
                    const ontem = new Date(hoje.getTime() - 86400000);
                    data = data.filter(l => new Date(l.dataISO).toDateString() === ontem.toDateString());
                } else {
                    const corte = new Date(hoje.getTime() - filtroDias * 86400000);
                    data = data.filter(l => new Date(l.dataISO) >= corte);
                }
            }
            if (filtroBusca) {
                const t = filtroBusca.toLowerCase();
                data = data.filter(l => l.numero.includes(t) || (l.nome && l.nome.toLowerCase().includes(t)));
            }

            desenharTabela(data);
            desenharCharts(d.logs);
        });
    }

    function desenharTabela(logs) {
        const slice = logs.slice(-200);
        $('crmBody').innerHTML = slice.map((l, i) => {
            const corStatus = l.status === 'OK' ? '#10b981' : l.status === 'DUPLICADO' ? '#f59e0b' : '#ef4444';
            const notaBtnClass = l.nota ? 'btn-note tem-nota' : 'btn-note';
            const notaIcon = l.nota ? '📝' : '✏️';
            return `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:6px;color:var(--sub);">${i+1}</td>
                <td style="padding:6px;">${escapeHtml(l.nome) || 'Cliente'}</td>
                <td style="padding:6px;font-family:monospace;font-size:10px;">${l.numero || ''}</td>
                <td style="padding:6px;color:${corStatus};font-weight:600;">${l.status || ''}</td>
                <td style="padding:6px;">${l.variante || '-'}</td>
                <td style="padding:6px;color:var(--sub);font-family:monospace;">${l.hora || '-'}</td>
                <td style="padding:6px;"><button class="${notaBtnClass}" data-ts="${l.timestamp}" title="${escapeHtml(l.nota || 'Adicionar nota')}">${notaIcon}</button></td>
            </tr>`;
        }).join('');
    }

    function desenharCharts(logs) {
        // Barra de conversão (OK / Erro / Duplicado)
        const convBar = $('convBar');
        if (convBar) {
            const total = logs.length;
            if (total === 0) {
                convBar.innerHTML = '<div style="flex:1;background:var(--border);color:var(--sub);">Sem dados</div>';
            } else {
                const ok = logs.filter(l => l.status === 'OK').length;
                const err = logs.filter(l => l.status !== 'OK' && l.status !== 'DUPLICADO').length;
                const dup = total - ok - err;
                const pOk = Math.round(ok / total * 100);
                const pErr = Math.round(err / total * 100);
                const pDup = 100 - pOk - pErr;
                convBar.innerHTML = `
                    ${pOk > 0 ? `<div class="conv-enviados" style="flex:${pOk};">${pOk}% OK</div>` : ''}
                    ${pErr > 0 ? `<div class="conv-erros" style="flex:${pErr};">${pErr}% Err</div>` : ''}
                    ${pDup > 0 ? `<div style="flex:${pDup};background:#64748b;color:#fff;">${pDup}% Dup</div>` : ''}
                `;
            }
        }

        // Gráfico últimos 7 dias
        const bars = $('chartBars'), labels = $('chartLabels');
        if (bars && labels) {
            const dias = [];
            const hoje = new Date();
            for (let i = 6; i >= 0; i--) {
                const dt = new Date(hoje.getTime() - i * 86400000);
                const iso = dt.toISOString().slice(0, 10);
                const cnt = logs.filter(l => l.dataISO === iso && l.status === 'OK').length;
                dias.push({ cnt, label: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) });
            }
            const max = Math.max(1, ...dias.map(d => d.cnt));
            bars.innerHTML = dias.map(d => `<div class="bar" style="height:${Math.max(3, d.cnt/max*100)}%;" title="${d.cnt} envios"><span>${d.cnt || ''}</span></div>`).join('');
            labels.innerHTML = dias.map(d => `<span>${d.label}</span>`).join('');
        }
    }

    // Filtros de data
    document.querySelectorAll('.date-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroDias = parseInt(btn.dataset.dias);
            renderCRM();
        };
    });

    // Busca
    $('crmBusca').addEventListener('input', (e) => {
        filtroBusca = e.target.value.trim();
        renderCRM();
    });

    // Notas (delegação de evento na tabela)
    $('crmBody').addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-note');
        if (!btn) return;
        const ts = parseInt(btn.dataset.ts);
        chrome.storage.local.get({ logs: [] }, d => {
            const idx = d.logs.findIndex(l => l.timestamp === ts);
            if (idx === -1) return;
            const atual = d.logs[idx].nota || '';
            const nova = prompt('Nota para este contato:', atual);
            if (nova === null) return;
            chrome.runtime.sendMessage({ acao: 'salvar_nota', index: idx, nota: nova }, () => {
                setTimeout(() => renderCRM(), 200);
            });
        });
    });

    // Exportar tudo
    $('btnExportar').onclick = () => {
        chrome.storage.local.get({ logs: [] }, d => {
            if (!d.logs.length) return alert('Nada para exportar.');
            const ws = XLSX.utils.json_to_sheet(d.logs);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
            XLSX.writeFile(wb, "Relatorio_Disparos.xlsx");
        });
    };

    // Exportar apenas respondidos
    $('btnExportarRespondidos').onclick = () => {
        chrome.storage.local.get({ logs: [], respostas: {} }, d => {
            const respondidos = new Set(Object.keys(d.respostas || {}));
            const filtered = d.logs.filter(l => respondidos.has(l.numero));
            if (!filtered.length) return alert('Nenhum contato respondido encontrado.');
            const dados = filtered.map(l => ({
                ...l,
                resposta_preview: (d.respostas[l.numero] || {}).preview || '',
                resposta_vezes: (d.respostas[l.numero] || {}).vezes || 0
            }));
            const ws = XLSX.utils.json_to_sheet(dados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Respondidos");
            XLSX.writeFile(wb, "Relatorio_Respondidos.xlsx");
        });
    };

    // Backup
    $('btnBackup').onclick = () => {
        chrome.runtime.sendMessage({ acao: "backup_dados" }, (res) => {
            if (!res || !res.ok) return alert('Erro no backup');
            const blob = new Blob([JSON.stringify(res.dados, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url;
            a.download = `private_bot_backup_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    };

    // Restaurar
    $('btnRestaurar').onclick = () => $('inputRestore').click();
    $('inputRestore').addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const dados = JSON.parse(ev.target.result);
                if (!confirm('Substituir TODOS os dados atuais pelo backup?')) return;
                chrome.runtime.sendMessage({ acao: "restaurar_dados", dados }, () => {
                    alert('Restaurado! Recarregue o popup.');
                    location.reload();
                });
            } catch { alert('Arquivo inválido.'); }
        };
        reader.readAsText(file);
        $('inputRestore').value = '';
    });

    // Limpar CRM
    $('btnLimparCRM').onclick = () => {
        if (confirm('Apagar TODOS os logs, respostas e duplicatas?')) {
            chrome.runtime.sendMessage({ acao: "zerar_crm" }, () => {
                renderCRM();
                setTimeout(verificarUndo, 100);
            });
        }
    };

    /* ===============================
       TABS
       =============================== */
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.aba').forEach(a => a.classList.remove('active'));
            btn.classList.add('active');
            $(btn.dataset.target).classList.add('active');
            chrome.storage.local.set({ abaAtiva: btn.dataset.target });
            if (btn.dataset.target === 'crm') renderCRM();
            if (btn.dataset.target === 'lote') atualizarInfoScriptsLote();
        };
    });

    /* ===============================
       TEMA
       =============================== */
    $('themeToggle').onclick = () => {
        const light = document.body.classList.toggle('light-mode');
        $('themeToggle').innerText = light ? '☀️' : '🌙';
        chrome.storage.local.set({ theme: light ? 'light' : 'dark' });
    };

    /* ===============================
       ONBOARDING
       =============================== */
    const onbSteps = [
        { title: 'Bem-vindo ao Private Bot!', text: 'Este robô envia mensagens automáticas pelo WhatsApp Web. Feito por Leonardo Aguiar.' },
        { title: 'Abra o WhatsApp Web', text: 'Faça login no WhatsApp Web em uma aba. O bot detecta a conexão automaticamente.' },
        { title: 'Escreva seus scripts', text: 'Na aba SCRIPTS, escreva as mensagens. Use [NOME] para personalizar e {Oi|Olá} para variar.' },
        { title: 'Pronto para disparar!', text: 'Cole a lista em DISPARO ou use LOTE para várias listas em sequência. Bom disparo!' }
    ];
    let onbIdx = 0;

    function iniciarOnboarding() {
        onbIdx = 0;
        renderOnb();
        $('onboarding').classList.add('show');
    }
    function renderOnb() {
        $('onbStep').innerText = `Passo ${onbIdx + 1} de ${onbSteps.length}`;
        $('onbTitle').innerText = onbSteps[onbIdx].title;
        $('onbText').innerText = onbSteps[onbIdx].text;
        $('onbNext').innerText = onbIdx === onbSteps.length - 1 ? 'COMEÇAR' : 'PRÓXIMO';
    }
    $('onbNext').onclick = () => {
        if (onbIdx < onbSteps.length - 1) { onbIdx++; renderOnb(); }
        else finalizarOnb();
    };
    $('onbSkip').onclick = finalizarOnb;
    function finalizarOnb() {
        $('onboarding').classList.remove('show');
        chrome.storage.local.remove('needsOnboarding');
    }

    /* ===============================
       LOOP DE PROGRESSO (1s)
       =============================== */
    setInterval(() => {
        chrome.storage.local.get(['progresso', 'timerData', 'logs', 'loteAtual', 'filaAtual', 'respostas', 'digitando'], d => {
            // Progresso da fila atual
            if (d.progresso && d.progresso.total > 0) {
                const p = Math.round((d.progresso.enviados / d.progresso.total) * 100);
                $('bar').style.width = p + "%";
                $('percent').innerText = p + "%";
                $('txtEnvios').innerText = `${d.progresso.enviados} / ${d.progresso.total} enviados`;

                if (p === 100) $('statusCampanha').innerText = "✅ CAMPANHA CONCLUÍDA!";
                else if (d.timerData && d.timerData.status === 'pausado') $('statusCampanha').innerText = "⏸ DISPARO PAUSADO";
                else if (d.timerData && d.timerData.status === 'parado') $('statusCampanha').innerText = "⏹ DISPARO PARADO";
                else $('statusCampanha').innerText = `Enviando ${Math.min(d.progresso.enviados+1, d.progresso.total)} de ${d.progresso.total}...`;
            }
            if (d.timerData) {
                $('valEstimado').innerText = formatarTempo(d.timerData.estimativa);
                let dec = 0;
                if (d.timerData.status === 'rodando') dec = Math.floor((Date.now() - d.timerData.inicio - d.timerData.totalPausado) / 1000);
                else { const fim = d.timerData.ultimoPause || Date.now(); dec = Math.floor((fim - d.timerData.inicio - d.timerData.totalPausado) / 1000); }
                if (dec >= 0) $('valDecorrido').innerText = formatarTempo(dec);
            }

            // Atualização do CRM (só quando aba ativa e houver mudança)
            if ($('crm').classList.contains('active')) {
                const ll = (d.logs || []).length;
                const lr = Object.keys(d.respostas || {}).length;
                const ld = Object.keys(d.digitando || {}).length;
                if (ll !== lastLogCount || lr !== lastRespCount || ld !== lastDigitCount) {
                    lastLogCount = ll; lastRespCount = lr; lastDigitCount = ld;
                    renderCRM();
                }
            }

            // Progresso do LOTE
            const loteBar = $('loteBar');
            if (loteBar) {
                if (d.loteAtual) {
                    const lote = d.loteAtual;
                    const total = lote.progressoGlobal.total;
                    const enviados = lote.progressoGlobal.enviados;
                    const p = total > 0 ? Math.round((enviados / total) * 100) : 0;
                    loteBar.style.width = p + '%';
                    $('lotePercent').innerText = p + '%';
                    $('loteTxtEnvios').innerText = `${enviados} / ${total} enviados`;

                    if (lote.status === 'concluido') $('loteStatus').innerText = '✅ Lote concluído!';
                    else if (lote.status === 'parado') $('loteStatus').innerText = '⏹ Lote parado.';
                    else {
                        const filaAtual = d.filaAtual;
                        if (filaAtual && filaAtual.loteId === lote.id) {
                            const idx = filaAtual.filaIndexNoLote;
                            const def = lote.filas[idx];
                            $('loteStatus').innerText = `Enviando "${def.nome}" (${idx + 1}/${lote.filas.length})...`;
                        } else {
                            $('loteStatus').innerText = 'Aguardando próxima lista...';
                        }
                    }

                    const est = $('loteEstado');
                    if (est) {
                        est.innerHTML = lote.filas.map(f => {
                            const icone = f.status === 'concluido' ? '✅' : f.status === 'rodando' ? '▶️' : '⏳';
                            const env = f.enviados || 0;
                            return `${icone} <b>${escapeHtml(f.nome)}</b> — ${env}/${f.lista.length}`;
                        }).join('<br>') || '—';
                    }
                } else {
                    loteBar.style.width = '0%';
                    $('lotePercent').innerText = '0%';
                    $('loteTxtEnvios').innerText = '0 / 0';
                    $('loteStatus').innerText = 'Nenhum lote em andamento.';
                    const est = $('loteEstado');
                    if (est) est.innerText = '—';
                }
            }
        });
    }, 1000);

    function formatarTempo(s) {
        if (!s || isNaN(s) || s < 0) return "00:00:00";
        const h = Math.floor(s/3600).toString().padStart(2,'0');
        const m = Math.floor((s%3600)/60).toString().padStart(2,'0');
        const sec = Math.floor(s%60).toString().padStart(2,'0');
        return `${h}:${m}:${sec}`;
    }
});