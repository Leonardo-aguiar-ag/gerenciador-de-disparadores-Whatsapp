document.addEventListener('DOMContentLoaded', async () => {
  // Tabs & Theme
  document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.tab-btn, .aba-content').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
  });
  const themeBtn = document.getElementById('themeBtn');
  chrome.storage.local.get('isDark', (res) => { if(res.isDark) document.body.classList.add('dark'); });
  themeBtn.onclick = () => { const dark = document.body.classList.toggle('dark'); chrome.storage.local.set({ isDark: dark }); };

  // Load Data
  const grid = document.getElementById('gridScripts');
  const d = await chrome.storage.local.get(['scripts', 'checks', 'nums', 'min', 'max', 'loteAtivo', 'loteQtd', 'lotePausa', 'anexoNome']);
  for(let i=0; i<20; i++) grid.innerHTML += `<div class="script-row"><input type="checkbox" class="chk" ${d.checks?.[i] !== false ? 'checked' : ''}><textarea class="txt" placeholder="Msg ${i+1}">${d.scripts?.[i] || ''}</textarea></div>`;
  
  document.getElementById('numeros').value = d.nums || "";
  document.getElementById('min').value = d.min || 15;
  document.getElementById('max').value = d.max || 30;
  document.getElementById('chkLote').checked = d.loteAtivo !== false;
  document.getElementById('loteQtd').value = d.loteQtd || 50;
  document.getElementById('lotePausa').value = d.lotePausa || 30;
  if (d.anexoNome) document.getElementById('anexoNome').innerText = "Ficheiro: " + d.anexoNome;

  // ==== LÓGICA DO MENU DE IMPORTAÇÃO ====
  const modalImport = document.getElementById('modalImport');
  const inputPlanilha = document.getElementById('inputPlanilha');

  // Abre o modal
  document.getElementById('btnAbrirModal').onclick = () => { modalImport.style.display = 'flex'; };
  // Fecha o modal
  document.getElementById('btnCancelaImport').onclick = () => { modalImport.style.display = 'none'; };

  // Confirma a opção e abre a seleção de arquivo
  document.getElementById('btnConfirmaImport').onclick = () => {
      const tipo = document.querySelector('input[name="tipoImport"]:checked').value;
      if (tipo === 'coluna') {
          const letra = document.getElementById('letraColuna').value.trim().toUpperCase();
          // Valida se digitou uma letra de A até Z
          if (!letra || !/^[A-Z]$/.test(letra)) {
              return alert("Por favor, digite uma letra válida para a coluna (Ex: A, B, C).");
          }
      }
      inputPlanilha.click();
  };

  // Quando o usuário seleciona o arquivo CSV
  inputPlanilha.onchange = (e) => {
    modalImport.style.display = 'none'; // Fecha o modal
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        alert("⚠️ ATENÇÃO!\n\nSalve a sua planilha como CSV no Excel para poder ler os números.");
        e.target.value = ''; return;
    }

    const tipo = document.querySelector('input[name="tipoImport"]:checked').value;
    const letra = document.getElementById('letraColuna').value.trim().toUpperCase();
    
    // Converte a Letra (A, B, C...) em Índice (0, 1, 2...)
    // Na tabela ASCII, a letra 'A' é o código 65.
    const indexColuna = tipo === 'coluna' ? (letra.charCodeAt(0) - 65) : -1;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const conteudo = ev.target.result;
      const linhas = conteudo.split(/\r?\n/);
      let numerosFiltrados = [];

      linhas.forEach(linha => {
          // O Excel salva CSV dividindo colunas por Ponto e Vírgula (;) ou Vírgula (,)
          const colunas = linha.split(/[,;]/);
          
          if (tipo === 'coluna') {
              // LER APENAS DA COLUNA ESCOLHIDA
              if (colunas[indexColuna]) {
                  const numLimpo = colunas[indexColuna].replace(/\D/g, ''); // Tira espaços/traços
                  if (numLimpo.length >= 10 && numLimpo.length <= 14) {
                      numerosFiltrados.push(numLimpo);
                  }
              }
          } else {
              // BUSCA AUTOMÁTICA EM TODAS AS COLUNAS
              for (let col of colunas) {
                  const numLimpo = col.replace(/\D/g, '');
                  if (numLimpo.length >= 10 && numLimpo.length <= 14) {
                      numerosFiltrados.push(numLimpo);
                      break; 
                  }
              }
          }
      });

      if (numerosFiltrados.length > 0) {
          document.getElementById('numeros').value = numerosFiltrados.join('\n');
          salvar();
          alert(`${numerosFiltrados.length} números importados com sucesso!`);
      } else {
          alert("Não encontramos nenhum número válido na configuração escolhida.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reseta para poder importar o mesmo arquivo de novo
  };

  // ==== RESTO DO CÓDIGO (ANEXOS, BOTÕES, STATUS) ====
  document.getElementById('arquivoAnexo').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let type = file.type;
    if (file.name.endsWith('.xlsx')) type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const reader = new FileReader();
    reader.onload = (ev) => {
      chrome.storage.local.set({ anexoB64: ev.target.result, anexoNome: file.name, anexoType: type });
      document.getElementById('anexoNome').innerText = "Anexo: " + file.name;
    };
    reader.readAsDataURL(file);
  };

  document.getElementById('delAnexo').onclick = () => { document.getElementById('anexoNome').innerText = ""; chrome.storage.local.remove(['anexoB64', 'anexoNome', 'anexoType']); };
  document.getElementById('delNums').onclick = () => { document.getElementById('numeros').value = ""; salvar(); };
  document.getElementById('delScripts').onclick = () => { document.querySelectorAll('.txt').forEach(t => t.value = ""); salvar(); };
  
  function salvar() {
    const scripts = Array.from(document.querySelectorAll('.txt')).map(t => t.value);
    const checks = Array.from(document.querySelectorAll('.chk')).map(c => c.checked);
    chrome.storage.local.set({ scripts, checks, nums: document.getElementById('numeros').value, min: document.getElementById('min').value, max: document.getElementById('max').value, loteAtivo: document.getElementById('chkLote').checked, loteQtd: document.getElementById('loteQtd').value, lotePausa: document.getElementById('lotePausa').value });
  }
  document.addEventListener('input', salvar);

  document.getElementById('start').onclick = () => {
    const raw = document.getElementById('numeros').value.split('\n').map(n => n.trim()).filter(n => n.length > 8);
    const listaUnica = [...new Set(raw)];
    const duplicados = raw.length - listaUnica.length;
    const ativos = Array.from(document.querySelectorAll('.script-row')).filter(it => it.querySelector('.chk').checked).map(it => it.querySelector('.txt').value.trim()).filter(t => t.length > 0);
    if(ativos.length === 0) return alert("Selecione um script!");
    chrome.storage.local.set({ totalRaw: raw.length, numDuplicados: raw.length - listaUnica.length, totalUnique: listaUnica.length });
    chrome.runtime.sendMessage({ acao: "iniciar", lista: listaUnica, scripts: ativos });
  };
  document.getElementById('pause').onclick = () => chrome.runtime.sendMessage({ acao: "pausar" });
  document.getElementById('stop').onclick = () => chrome.runtime.sendMessage({ acao: "parar" });

  setInterval(async () => {
    const s = await chrome.storage.local.get(['index', 'total', 'rodando', 'pausado', 'min', 'max', 'logs', 'totalRaw', 'numDuplicados', 'totalUnique']);
    if(s.total) {
      document.getElementById('prog').innerText = `${s.index}/${s.total}`;
      document.getElementById('bar').style.width = (s.index/s.total*100) + "%";
      const rest = s.total - s.index;
      const totalSeg = rest * (((parseInt(s.min)+parseInt(s.max))/2) + 10);
      document.getElementById('tempo').innerText = s.rodando ? `${Math.floor(totalSeg/60)}m ${Math.floor(totalSeg%60)}s` : "--:--";
    }
    const logs = s.logs || [];
    const enviei = logs.filter(l => l.status === 'OK').length;
    const falhas = logs.filter(l => l.status !== 'OK').length;
    document.getElementById('stPendente').innerText = Math.max(0, (s.totalUnique || 0) - (enviei + falhas));
    document.getElementById('stFracassada').innerText = falhas;
    document.getElementById('stEnviei').innerText = enviei;
    document.getElementById('stDuplicar').innerText = s.numDuplicados || 0;
    document.getElementById('stTotal').innerText = s.totalRaw || 0;
    document.getElementById('logTbody').innerHTML = logs.map(l => `<tr><td>${l.hora}</td><td>${l.num}</td><td style="color:${l.status==='OK'?'#25d366':'#ef4444'}">${l.status}</td></tr>`).reverse().join('');
  }, 1000);

  document.getElementById('exportExcel').onclick = async () => {
    const s = await chrome.storage.local.get(['logs', 'totalRaw', 'numDuplicados', 'totalUnique']);
    const logs = s.logs || [];
    if(logs.length === 0) return;
    let csv = "\uFEFFRESUMO\nPendente;Falhas;Enviados;Duplicados;Total\n" + `${document.getElementById('stPendente').innerText};${document.getElementById('stFracassada').innerText};${document.getElementById('stEnviei').innerText};${s.numDuplicados};${s.totalRaw}\n\nDETALHES\nHora;Número;Status\n`;
    logs.forEach(l => { csv += `${l.hora};${l.num};${l.status}\n`; });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Relatorio_Adsumus.csv`; a.click();
  };
});