document.addEventListener('DOMContentLoaded', () => {
    const numeros = document.getElementById('numeros');
    const contScripts = document.getElementById('contScripts');
    const selCampanha = document.getElementById('selCampanha');
    const nomeNovaCampanha = document.getElementById('nomeNovaCampanha');
    const btnValidar = document.getElementById('btnValidarLista'); // novo botão
    
    let lastLogCount = -1;
    let isSearching = false;
    let listaCampanhas = {};

    // Adiciona botão "Validar Lista" se não existir
    if (!btnValidar && document.querySelector('#disparo .box')) {
        const btn = document.createElement('button');
        btn.id = 'btnValidarLista';
        btn.className = 'btn btn-primary';
        btn.innerText = '🔍 VALIDAR LISTA';
        btn.style.marginTop = '8px';
        document.querySelector('#disparo .box').after(btn);
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.acao === "wa_status") {
            const bar = document.getElementById('wa-status-bar');
            const icon = document.getElementById('wa-icon');
            const text = document.getElementById('wa-text');
            const chip = document.getElementById('wa-chip');
            const btnStart = document.getElementById('btnStart');
            
            if (msg.info.conectado) {
                if(bar) bar.className = 'wa-status-bar online';
                if(icon) icon.innerText = '🟢';
                if(text) text.innerText = `WhatsApp de: ${msg.info.nome}`;
                if(chip) { chip.style.display = 'block'; chip.innerText = `+${msg.info.numero}`; }
                
                chrome.storage.local.get(['timerData'], d => {
                    if(!d.timerData || d.timerData.status !== 'rodando') { if(btnStart) btnStart.disabled = false; }
                });
            } else {
                if(bar) bar.className = 'wa-status-bar offline';
                if(icon) icon.innerText = '🔴';
                if(text) text.innerText = 'Esperando conectar o WhatsApp...';
                if(chip) chip.style.display = 'none';
                if(btnStart) btnStart.disabled = true;
            }
        }
    });

    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
        if(tabs.length === 0) {
            if(document.getElementById('wa-status-bar')) document.getElementById('wa-status-bar').className = 'wa-status-bar offline';
            if(document.getElementById('wa-icon')) document.getElementById('wa-icon').innerText = '🔴';
            if(document.getElementById('wa-text')) document.getElementById('wa-text').innerText = 'Esperando conectar o WhatsApp...';
            if(document.getElementById('btnStart')) document.getElementById('btnStart').disabled = true;
        }
    });

    const padraoCampanhas = {
        "Hapvida Nacional - Oferta Direta": [
            {texto: "{Olá|Oi|Tudo bem}, [NOME]! Sou o Leonardo Aguiar, consultor Hapvida. Temos condições exclusivas para todo o Brasil hoje. Para eu enviar sua tabela, me confirme: Idades e Cidade.", ativo: true}
        ]
    };
    
    chrome.storage.local.get(['theme', 'numerosSalvos', 'scriptsSalvos', 'appData', 'bancoCampanhas', 'campanhaSelecionada', 'abaAtiva'], (d) => {
        if (d.theme === 'light') { document.body.classList.add('light-mode'); document.getElementById('themeToggle').innerText = '☀️'; }
        if (d.numerosSalvos) numeros.value = d.numerosSalvos;
        
        if (d.appData) {
            if(document.getElementById('minDelay')) document.getElementById('minDelay').value = d.appData.min || 15;
            if(document.getElementById('maxDelay')) document.getElementById('maxDelay').value = d.appData.max || 30;
            if(document.getElementById('chkPausaLote')) document.getElementById('chkPausaLote').checked = d.appData.chkPausaLote || false;
            if(document.getElementById('qtdLote')) document.getElementById('qtdLote').value = d.appData.qtdLote || 20;
            if(document.getElementById('tempoLote')) document.getElementById('tempoLote').value = d.appData.tempoLote || 5;
        }

        listaCampanhas = d.bancoCampanhas || padraoCampanhas;
        atualizarMenuDropdown(d.campanhaSelecionada || "");

        if(contScripts) {
            let htmlBuffer = "";
            const scriptsCarregar = d.scriptsSalvos || [];
            for(let i = 0; i < 20; i++) {
                const s = scriptsCarregar[i] || { texto: '', ativo: true };
                htmlBuffer += `
                <div style="display:flex; gap:10px; margin-bottom:10px; align-items:center;">
                    <input type="checkbox" class="chkScript" id="chk_${i}" ${s.ativo ? 'checked' : ''} style="width:20px; height:20px;">
                    <textarea class="txtScript" id="txt_${i}" placeholder="Mensagem Variação ${i+1}" style="flex:1; padding:8px; border-radius:5px; background:var(--input); color:var(--text); border:1px solid var(--border); height:45px; margin:0;">${escapeHtml(s.texto)}</textarea>
                </div>`;
            }
            contScripts.innerHTML = htmlBuffer;
            document.querySelectorAll('.chkScript').forEach(chk => {
                chk.addEventListener('change', () => salvarFilaAtualScripts());
            });
        }

        if (d.abaAtiva) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.aba').forEach(a => a.classList.remove('active'));
            const btn = document.querySelector(`.tab-btn[data-target="${d.abaAtiva}"]`);
            const aba = document.getElementById(d.abaAtiva);
            if(btn && aba) { btn.classList.add('active'); aba.classList.add('active'); if(d.abaAtiva === 'crm') renderCRM(); }
        }
    });

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function salvarFilaAtualScripts() {
        let arr = [];
        document.querySelectorAll('.txtScript').forEach((t, i) => {
            const chk = document.getElementById(`chk_${i}`);
            arr.push({ 
                texto: t.value, 
                ativo: chk ? chk.checked : false 
            });
        });
        chrome.storage.local.set({ scriptsSalvos: arr });

        const nomeCampanha = selCampanha.value;
        if (nomeCampanha && listaCampanhas[nomeCampanha]) {
            listaCampanhas[nomeCampanha] = arr;
            chrome.storage.local.set({ bancoCampanhas: listaCampanhas });
        }
    }

    function salvarConfiguracoesAuto() {
        chrome.storage.local.set({ 
            appData: { 
                min: document.getElementById('minDelay').value, 
                max: document.getElementById('maxDelay').value,
                chkPausaLote: document.getElementById('chkPausaLote').checked,
                qtdLote: document.getElementById('qtdLote').value,
                tempoLote: document.getElementById('tempoLote').value
            }
        });
    }

    if(numeros) numeros.addEventListener('input', () => chrome.storage.local.set({ numerosSalvos: numeros.value }));
    if(contScripts) { contScripts.addEventListener('input', salvarFilaAtualScripts); contScripts.addEventListener('change', salvarFilaAtualScripts); }
    
    document.getElementById('minDelay').addEventListener('input', salvarConfiguracoesAuto);
    document.getElementById('maxDelay').addEventListener('input', salvarConfiguracoesAuto);
    document.getElementById('chkPausaLote').addEventListener('change', salvarConfiguracoesAuto);
    document.getElementById('qtdLote').addEventListener('input', salvarConfiguracoesAuto);
    document.getElementById('tempoLote').addEventListener('input', salvarConfiguracoesAuto);

    if(document.getElementById('themeToggle')) {
        document.getElementById('themeToggle').onclick = () => {
            const isLight = document.body.classList.toggle('light-mode');
            document.getElementById('themeToggle').innerText = isLight ? '☀️' : '🌙';
            chrome.storage.local.set({ theme: isLight ? 'light' : 'dark' });
        };
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.aba').forEach(a => a.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
            chrome.storage.local.set({ abaAtiva: btn.dataset.target });
            if(btn.dataset.target === 'crm') renderCRM();
            if(btn.dataset.target === 'scripts') {
                chrome.storage.local.get(['scriptsSalvos'], (res) => {
                    const saved = res.scriptsSalvos || [];
                    document.querySelectorAll('.txtScript').forEach((t, i) => {
                        if(saved[i]) {
                            t.value = saved[i].texto;
                            const chk = document.getElementById(`chk_${i}`);
                            if(chk) chk.checked = saved[i].ativo;
                        }
                    });
                });
            }
        };
    });

    function atualizarMenuDropdown(selecionarNome = "") {
        selCampanha.innerHTML = '<option value="">-- Scripts Atuais em Edição --</option>';
        Object.keys(listaCampanhas).forEach(nome => {
            const opt = document.createElement('option');
            opt.value = nome; opt.innerText = nome;
            if(nome === selecionarNome) opt.selected = true;
            selCampanha.appendChild(opt);
        });
        nomeNovaCampanha.value = selecionarNome === "" ? "" : selecionarNome;
    }

    selCampanha.addEventListener('change', (e) => {
        const nomeCampanha = e.target.value;
        chrome.storage.local.set({ campanhaSelecionada: nomeCampanha });
        
        if (nomeCampanha && listaCampanhas[nomeCampanha]) {
            const dadosCampanha = listaCampanhas[nomeCampanha];
            document.querySelectorAll('.txtScript').forEach((t, i) => {
                if(dadosCampanha[i]) {
                    t.value = dadosCampanha[i].texto;
                    document.getElementById(`chk_${i}`).checked = dadosCampanha[i].ativo;
                } else {
                    t.value = ""; document.getElementById(`chk_${i}`).checked = false;
                }
            });
            nomeNovaCampanha.value = nomeCampanha;
            salvarFilaAtualScripts();
        } else { nomeNovaCampanha.value = ""; }
    });

    document.getElementById('btnSalvarCampanha').onclick = () => {
        const nome = nomeNovaCampanha.value.trim();
        if(!nome) return alert("Por favor, digite um nome para a campanha!");
        let arr = [];
        document.querySelectorAll('.txtScript').forEach((t, i) => { arr.push({ texto: t.value, ativo: document.getElementById(`chk_${i}`).checked }); });
        listaCampanhas[nome] = arr;
        chrome.storage.local.set({ bancoCampanhas: listaCampanhas, campanhaSelecionada: nome }, () => {
            atualizarMenuDropdown(nome); salvarFilaAtualScripts(); alert(`Campanha "${nome}" salva com sucesso!`);
        });
    };

    document.getElementById('btnDeletarCampanha').onclick = () => {
        const selecionada = selCampanha.value;
        if(!selecionada) return alert("Selecione uma campanha salva no menu para poder excluir.");
        if(confirm(`Tem certeza que deseja excluir permanentemente a campanha "${selecionada}"?`)) {
            delete listaCampanhas[selecionada];
            chrome.storage.local.set({ bancoCampanhas: listaCampanhas, campanhaSelecionada: "" }, () => {
                atualizarMenuDropdown(""); alert("Campanha removida.");
            });
        }
    };

    if(document.getElementById('btnLimparNumeros')) document.getElementById('btnLimparNumeros').onclick = () => { if(confirm("Deseja apagar toda a lista de contatos colada?")) { numeros.value = ''; chrome.storage.local.set({ numerosSalvos: '' }); } };
    if(document.getElementById('btnLimparScripts')) document.getElementById('btnLimparScripts').onclick = () => { if(confirm("Apagar todos os campos de texto da tela atual?")) { document.querySelectorAll('.txtScript').forEach(t => t.value = ''); salvarFilaAtualScripts(); } };
    if(document.getElementById('btnLimparCRM')) document.getElementById('btnLimparCRM').onclick = () => { if(confirm("ATENÇÃO: Isso vai apagar todo o histórico de disparos e zerar o painel. Tem certeza?")) { chrome.storage.local.set({ logs: [], progresso: { total: 0, enviados: 0 }, crmDuplicados: 0 }, () => { renderCRM(); alert("CRM Limpo com sucesso!"); }); } };

    function formatarTempo(segundos) {
        if (!segundos || isNaN(segundos) || segundos < 0) return "00:00:00";
        let h = Math.floor(segundos / 3600).toString().padStart(2, '0');
        let m = Math.floor((segundos % 3600) / 60).toString().padStart(2, '0');
        let s = Math.floor(segundos % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    // ==================== FUNÇÕES SIMPLIFICADAS E ROBUSTAS ====================
    
    // Extrai número e nome de qualquer linha, ignorando caracteres estranhos
    function extrairNumeroNomeLinha(linha) {
        // Remove qualquer caractere não imprimível e espaços estranhos
        let limpa = linha.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
        if (limpa === '') return null;
        
        let numeroRaw = '';
        let nome = 'Cliente';
        
        // Tenta separadores ; ou : ou espaço
        if (limpa.includes(';')) {
            const partes = limpa.split(';');
            numeroRaw = partes[0].trim();
            if (partes[1]) nome = partes[1].trim();
        } else if (limpa.includes(':')) {
            const partes = limpa.split(':');
            const esq = partes[0].trim();
            const dir = partes[1].trim();
            // Verifica qual lado parece número (apenas dígitos e +)
            if (/^[\d\+]+$/.test(dir)) {
                numeroRaw = dir;
                nome = esq;
            } else if (/^[\d\+]+$/.test(esq)) {
                numeroRaw = esq;
                nome = dir;
            } else {
                // Tenta extrair número de qualquer lugar
                const nums = limpa.match(/\d+/g);
                if (nums) {
                    numeroRaw = nums.join('');
                    nome = limpa.replace(/\d+/g, '').replace(/[:;]/g, '').trim() || 'Cliente';
                }
            }
        } else if (limpa.includes(' ')) {
            const palavras = limpa.split(/\s+/);
            let candidatoNumero = null;
            let candidatoNome = [];
            for (let p of palavras) {
                if (/^[\d\+]+$/.test(p)) {
                    candidatoNumero = p;
                } else {
                    candidatoNome.push(p);
                }
            }
            if (candidatoNumero) {
                numeroRaw = candidatoNumero;
                nome = candidatoNome.join(' ') || 'Cliente';
            } else {
                numeroRaw = limpa;
            }
        } else {
            numeroRaw = limpa;
        }
        
        // Limpa o número: remove tudo que não é dígito
        let somenteDigitos = numeroRaw.replace(/\D/g, '');
        if (somenteDigitos.length === 0) return null;
        
        return { numero: somenteDigitos, nome: nome };
    }
    
    // Formata número para padrão internacional 55DDD9XXXXXXXX
    function formatarNumeroFinal(numDigitos) {
        // Remove o que não é dígito (já veio limpo)
        let num = numDigitos;
        if (num.length < 10) return null; // mínimo 10 dígitos (DDD + 8)
        
        // Garante 55 na frente
        if (!num.startsWith('55')) {
            num = '55' + num;
        }
        
        // Se tiver mais de 13 dígitos, corta o excesso (pode acontecer se já tinha 55)
        if (num.length > 13) {
            num = num.slice(0, 13);
        }
        
        // Agora num tem entre 12 e 13 dígitos (55+10 ou 55+11)
        if (num.length < 12) return null;
        
        let ddd = num.slice(2, 4);
        let resto = num.slice(4);
        
        // Força 9 dígitos após DDD (padrão celular Brasil)
        if (resto.length === 8) resto = '9' + resto;
        if (resto.length === 9) return '55' + ddd + resto;
        
        return null;
    }
    
    // Função de validação que será chamada pelo botão e pelo iniciar
    function validarLista() {
        const texto = numeros.value;
        const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
        let validos = [];
        let invalidos = 0;
        
        for (let linha of linhas) {
            const extraido = extrairNumeroNomeLinha(linha);
            if (!extraido) {
                invalidos++;
                continue;
            }
            const numFormatado = formatarNumeroFinal(extraido.numero);
            if (numFormatado) {
                validos.push({ num: numFormatado, nome: extraido.nome });
            } else {
                invalidos++;
            }
        }
        
        return { total: linhas.length, validos: validos.length, invalidos, lista: validos };
    }
    
    // Botão validar (se existir)
    const btnValidarExistente = document.getElementById('btnValidarLista');
    if (btnValidarExistente) {
        btnValidarExistente.onclick = () => {
            const resultado = validarLista();
            alert(`Validação concluída:\nTotal de linhas: ${resultado.total}\nVálidos: ${resultado.validos}\nInválidos: ${resultado.invalidos}\n\n${resultado.validos > 0 ? 'Pronto para iniciar!' : 'Nenhum número válido. Verifique os formatos.'}`);
        };
    }
    
    if(document.getElementById('btnStart')) {
        document.getElementById('btnStart').onclick = () => {
            const resultado = validarLista();
            
            if (resultado.lista.length === 0) {
                alert(`Nenhum número válido encontrado!\nTotal de linhas: ${resultado.total}\nLinhas inválidas: ${resultado.invalidos}\n\nPossíveis causas:\n- Caracteres invisíveis (copie para o Bloco de Notas e cole de novo)\n- Números com menos de 10 dígitos\n\nFormato esperado:\n5511999999999;Nome\nou Nome: 5511999999999\nou apenas 5511999999999`);
                return;
            }
            
            const scriptsAtivos = [];
            document.querySelectorAll('.txtScript').forEach((t, i) => {
                const chk = document.getElementById(`chk_${i}`);
                const isChecked = chk ? chk.checked : false;
                const texto = t.value.trim();
                if (isChecked && texto !== "") {
                    scriptsAtivos.push(texto);
                }
            });
            
            if (scriptsAtivos.length === 0) {
                let marcados = 0;
                document.querySelectorAll('.chkScript').forEach(chk => { if(chk.checked) marcados++; });
                alert(`Nenhum script ativo encontrado!\nCheckboxes marcados: ${marcados}\nCertifique-se de que pelo menos um script tenha texto e esteja marcado.`);
                return;
            }
            
            if (!confirm(`Deseja iniciar o disparo para ${resultado.lista.length} contatos únicos?`)) return;
            
            const min = parseInt(document.getElementById('minDelay').value) || 15;
            const max = parseInt(document.getElementById('maxDelay').value) || 30;
            const estimativaSegundos = Math.round(resultado.lista.length * (((min + max) / 2) + 4));
            
            document.getElementById('btnStart').disabled = true;
            
            chrome.storage.local.set({
                progresso: { total: resultado.lista.length, enviados: 0 },
                crmDuplicados: 0,
                timerData: { inicio: Date.now(), estimativa: estimativaSegundos, totalPausado: 0, ultimoPause: 0, status: 'rodando' }
            }, () => {
                lastLogCount = -1; 
                chrome.runtime.sendMessage({ acao: "iniciar", lista: resultado.lista, scripts: scriptsAtivos });
            });
        };
    }
    
    if(document.getElementById('btnPause')) {
        document.getElementById('btnPause').onclick = () => {
            chrome.runtime.sendMessage({ acao: "pausar" });
        };
    }
    
    if(document.getElementById('btnStop')) {
        document.getElementById('btnStop').onclick = () => {
            chrome.runtime.sendMessage({ acao: "parar" });
            chrome.storage.local.get(['timerData'], d => {
                if(d.timerData) { d.timerData.status = 'parado'; d.timerData.ultimoPause = Date.now(); chrome.storage.local.set({ timerData: d.timerData }); }
            });
            const bar = document.getElementById('wa-status-bar');
            if(bar && bar.classList.contains('online')) document.getElementById('btnStart').disabled = false;
        };
    }
    
    document.getElementById('forcarConexao')?.addEventListener('click', () => {
        chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { acao: "ping" });
                alert("Solicitação enviada. Verifique o status do WhatsApp em alguns segundos.");
            } else {
                alert("Abra o WhatsApp Web primeiro!");
            }
        });
    });
    
    if(document.getElementById('crmBusca')) document.getElementById('crmBusca').addEventListener('input', (e) => { isSearching = e.target.value.trim() !== ''; buscarCRM(); });
    
    function renderCRM(logsData = null) {
        chrome.storage.local.get({logs: [], crmDuplicados: 0}, d => {
            const dataToRender = logsData || d.logs;
            document.getElementById('crmTotal').innerText = dataToRender.length;
            document.getElementById('crmOk').innerText = dataToRender.filter(l => l.status === 'OK').length;
            document.getElementById('crmErro').innerText = dataToRender.filter(l => l.status !== 'OK').length;
            document.getElementById('crmDupl').innerText = d.crmDuplicados || 0;
            desenharTabelaCRM(dataToRender);
        });
    }
    
    function desenharTabelaCRM(listaLogs) {
        const body = document.getElementById('crmBody');
        if(!body) return;
        body.innerHTML = listaLogs.map((l, index) => {
            return `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 8px; color: var(--sub); font-weight: bold;">${index + 1}</td>
                <td style="padding: 8px; font-weight: 500;">${escapeHtml(l.nome) || 'Cliente'}</td>
                <td style="padding: 8px;">${l.numero}</td>
                <td style="padding: 8px; font-weight: 600; color: ${l.status==='OK'?'#10b981':'#ef4444'}">${l.status}</td>
                <td style="padding: 8px; color: var(--sub); font-family: monospace;">${l.hora || '-'}</td>
                <td style="padding: 8px; text-align: right;"><a href="https://web.whatsapp.com/send?phone=${l.numero.replace(/\D/g,'')}" target="_blank" style="text-decoration:none;">💬</a></td>
             </tr>`;
        }).join('');
    }
    
    function buscarCRM() {
        const termo = document.getElementById('crmBusca').value.toLowerCase().trim();
        chrome.storage.local.get({logs: []}, d => {
            const filtrado = d.logs.filter(l => 
                l.numero.includes(termo) || 
                (l.nome && l.nome.toLowerCase().includes(termo))
            );
            desenharTabelaCRM(filtrado);
        });
    }
    
    if(document.getElementById('btnExportar')) document.getElementById('btnExportar').onclick = () => {
        chrome.storage.local.get({logs: []}, d => {
            if(!d.logs || d.logs.length === 0) return alert("Nenhum dado no CRM para exportar.");
            const ws = XLSX.utils.json_to_sheet(d.logs); const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Relatorio"); XLSX.writeFile(wb, "Relatorio_Disparos.xlsx");
        });
    };
    
    setInterval(() => {
        chrome.storage.local.get(['progresso', 'timerData', 'logs'], d => {
            if(d.progresso && d.progresso.total > 0) {
                let p = Math.round((d.progresso.enviados / d.progresso.total) * 100);
                if(document.getElementById('bar')) document.getElementById('bar').style.width = p + "%";
                if(document.getElementById('percent')) document.getElementById('percent').innerText = p + "%";
                if(document.getElementById('txtEnvios')) document.getElementById('txtEnvios').innerText = `${d.progresso.enviados} / ${d.progresso.total} enviados`;
                
                let btnPause = document.getElementById('btnPause');
                let st = document.getElementById('statusCampanha');
                
                if(p === 100) {
                    if(st) st.innerText = "CAMPANHA CONCLUÍDA! ✅";
                    if(btnPause) { btnPause.innerText = "⏸ Pausar"; btnPause.style.background = "#f59e0b"; }
                    if(document.getElementById('btnStart')) document.getElementById('btnStart').disabled = false;
                    if(d.timerData && d.timerData.status === 'rodando') { d.timerData.status = 'concluido'; d.timerData.ultimoPause = Date.now(); chrome.storage.local.set({ timerData: d.timerData }); }
                } else if(d.timerData && d.timerData.status === 'pausado') {
                    if(st) st.innerText = "DISPARO PAUSADO ⏸";
                    if(btnPause) { btnPause.innerText = "▶ Retomar"; btnPause.style.background = "#3b82f6"; }
                } else if(d.timerData && d.timerData.status === 'parado') {
                    if(st) st.innerText = "DISPARO PARADO ⏹";
                    if(btnPause) { btnPause.innerText = "⏸ Pausar"; btnPause.style.background = "#f59e0b"; }
                } else {
                    if(st) st.innerText = `INJETANDO SCRIPT NO CONTATO ${Math.min(d.progresso.enviados + 1, d.progresso.total)}... ⏳`;
                    if(btnPause) { btnPause.innerText = "⏸ Pausar"; btnPause.style.background = "#f59e0b"; }
                }
            }
            if (d.timerData) {
                if(document.getElementById('valEstimado')) document.getElementById('valEstimado').innerText = formatarTempo(d.timerData.estimativa);
                let decorrido = 0;
                if (d.timerData.status === 'rodando') decorrido = Math.floor((Date.now() - d.timerData.inicio - d.timerData.totalPausado) / 1000);
                else { let fim = d.timerData.ultimoPause || Date.now(); decorrido = Math.floor((fim - d.timerData.inicio - d.timerData.totalPausado) / 1000); }
                if(document.getElementById('valDecorrido') && decorrido >= 0) document.getElementById('valDecorrido').innerText = formatarTempo(decorrido);
            }
            if (d.logs && d.logs.length !== lastLogCount && !isSearching) {
                lastLogCount = d.logs.length; 
                if(document.getElementById('crm').classList.contains('active')) renderCRM(d.logs);
            }
        });
    }, 1000);

    // ========== IMPORTAR / EXPORTAR SCRIPTS ==========
    const inputScripts = document.getElementById('inputScripts');
    const btnImportar = document.getElementById('btnImportarScripts');
    const btnExportar = document.getElementById('btnExportarScripts');

    // Importar arquivo
    btnImportar.addEventListener('click', () => {
        inputScripts.click();
    });

    inputScripts.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const conteudo = ev.target.result;
            let scripts = [];

            if (file.name.endsWith('.json')) {
                try {
                    const json = JSON.parse(conteudo);
                    scripts = Array.isArray(json) ? json : (json.scripts || []);
                } catch (err) {
                    alert('Arquivo JSON inválido. Verifique o formato.');
                    return;
                }
            } else {
                // Formato TXT: separado por "---"
                scripts = conteudo.split(/\r?\n---\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
            }

            // Limpa os campos atuais
            document.querySelectorAll('.txtScript').forEach((t, i) => {
                t.value = '';
                const chk = document.getElementById(`chk_${i}`);
                if (chk) chk.checked = false;
            });

            // Preenche os campos
            scripts.slice(0, 20).forEach((texto, idx) => {
                const campo = document.getElementById(`txt_${idx}`);
                const chk = document.getElementById(`chk_${idx}`);
                if (campo) campo.value = texto;
                if (chk) chk.checked = true;
            });

            // Nome da campanha = nome do arquivo sem extensão
            const nomeCampanha = file.name.replace(/\.[^.]+$/, '');
            document.getElementById('nomeNovaCampanha').value = nomeCampanha;

            // Salva automaticamente a campanha
            if (nomeCampanha) {
                let arr = [];
                document.querySelectorAll('.txtScript').forEach((t, i) => {
                    arr.push({ texto: t.value, ativo: document.getElementById(`chk_${i}`).checked });
                });
                listaCampanhas[nomeCampanha] = arr;
                chrome.storage.local.set({ bancoCampanhas: listaCampanhas, campanhaSelecionada: nomeCampanha }, () => {
                    atualizarMenuDropdown(nomeCampanha);
                    salvarFilaAtualScripts();
                    alert(`Campanha "${nomeCampanha}" importada com sucesso!`);
                });
            } else {
                salvarFilaAtualScripts();
            }
        };
        reader.readAsText(file, 'UTF-8');
        // limpa o input para permitir reimportar o mesmo arquivo
        inputScripts.value = '';
    });

    // Exportar scripts
    btnExportar.addEventListener('click', () => {
        const scripts = [];
        document.querySelectorAll('.txtScript').forEach((t, i) => {
            const chk = document.getElementById(`chk_${i}`);
            if (chk && chk.checked && t.value.trim() !== '') {
                scripts.push(t.value.trim());
            }
        });

        if (scripts.length === 0) {
            alert('Nenhum script ativo para exportar.');
            return;
        }

        const conteudo = scripts.join('\n---\n');
        const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'scripts_exportados.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
});