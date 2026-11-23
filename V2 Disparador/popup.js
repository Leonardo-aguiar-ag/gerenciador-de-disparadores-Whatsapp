document.addEventListener('DOMContentLoaded', async () => {
  // 1. NAVEGAÇÃO ENTRE ABAS
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn, .aba-content').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');
      if (targetId === 'relatorio') carregarLogs();
    };
  });

  // 2. MODO ESCURO (DARK MODE)
  const themeBtn = document.getElementById('themeBtn');
  chrome.storage.local.get('isDark', (res) => {
    if (res.isDark) document.body.classList.add('dark');
  });
  themeBtn.onclick = () => {
    const dark = document.body.classList.toggle('dark');
    chrome.storage.local.set({ isDark: dark });
  };

  // 3. CARREGAR DADOS E GERAR OS 20 SCRIPTS
  const grid = document.getElementById('gridScripts');
  const d = await chrome.storage.local.get(['scripts', 'checks', 'nums', 'min', 'max']);
  
  // Limpa o grid antes de gerar para evitar duplicatas ao abrir/fechar
  grid.innerHTML = '';
  for (let i = 0; i < 20; i++) {
    grid.innerHTML += `
      <div class="script-row">
        <input type="checkbox" class="chk" ${d.checks?.[i] !== false ? 'checked' : ''}>
        <textarea class="txt" placeholder="Mensagem ${i+1}">${d.scripts?.[i] || ''}</textarea>
      </div>`;
  }

  document.getElementById('numeros').value = d.nums || "";
  document.getElementById('min').value = d.min || 15;
  document.getElementById('max').value = d.max || 30;

  // 4. LIXEIRAS E AUTO-SALVAMENTO
  document.getElementById('delNums').onclick = () => {
    document.getElementById('numeros').value = "";
    salvar();
  };
  document.getElementById('delScripts').onclick = () => {
    document.querySelectorAll('.txt').forEach(t => t.value = "");
    salvar();
  };

  function salvar() {
    const scripts = Array.from(document.querySelectorAll('.txt')).map(t => t.value);
    const checks = Array.from(document.querySelectorAll('.chk')).map(c => c.checked);
    chrome.storage.local.set({
      scripts, checks,
      nums: document.getElementById('numeros').value,
      min: document.getElementById('min').value,
      max: document.getElementById('max').value
    });
  }
  document.addEventListener('input', salvar);

  // 5. MONITORAMENTO DE PROGRESSO E TEMPO
  setInterval(async () => {
    const s = await chrome.storage.local.get(['index', 'total', 'rodando', 'pausado', 'min', 'max']);
    if (s.total) {
      document.getElementById('prog').innerText = `${s.index} / ${s.total}`;
      document.getElementById('bar').style.width = (s.index / s.total * 100) + "%";
      
      if (s.rodando && !s.pausado && s.index < s.total) {
        const rest = s.total - s.index;
        const delayMedia = (parseInt(s.min) + parseInt(s.max)) / 2;
        const totalSeg = rest * (delayMedia + 10); // 10s de margem para carregamento
        document.getElementById('tempo').innerText = `Restam: ${Math.floor(totalSeg / 60)}m ${totalSeg % 60}s`;
      }
    }
  }, 1000);

  // 6. BOTÕES DE CONTROLE
  document.getElementById('start').onclick = () => {
    const raw = document.getElementById('numeros').value.split('\n').map(n => n.trim()).filter(n => n.length > 8);
    const listaUnica = [...new Set(raw)]; // Remove duplicados
    const ativos = Array.from(document.querySelectorAll('.script-row'))
      .filter(it => it.querySelector('.chk').checked)
      .map(it => it.querySelector('.txt').value.trim())
      .filter(t => t.length > 0);
    
    if (ativos.length === 0) return alert("Selecione pelo menos um script!");
    chrome.runtime.sendMessage({ acao: "iniciar", lista: listaUnica, scripts: ativos });
  };

  document.getElementById('pause').onclick = () => chrome.runtime.sendMessage({ acao: "pausar" });
  document.getElementById('stop').onclick = () => chrome.runtime.sendMessage({ acao: "parar" });

  // 7. RELATÓRIO E EXPORTAÇÃO EXCEL (CORRIGIDO)
  async function carregarLogs() {
    const res = await chrome.storage.local.get({ logs: [] });
    document.getElementById('logTbody').innerHTML = res.logs.map(l => `
      <tr>
        <td>${l.hora}</td>
        <td>${l.num}</td>
        <td style="color:#25d366; font-weight:bold;">OK</td>
      </tr>`).reverse().join('');
  }

  document.getElementById('exportExcel').onclick = async () => {
    const res = await chrome.storage.local.get({ logs: [] });
    if (!res.logs || res.logs.length === 0) return alert("Não há dados para exportar.");

    try {
      const ws = XLSX.utils.json_to_sheet(res.logs);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
      
      // Gera o binário do arquivo
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
      
      function s2ab(s) {
        const buf = new ArrayBuffer(s.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
        return buf;
      }

      // Cria o download via Blob e clica num link oculto
      const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = 'none';
      a.href = url;
      a.download = `Relatorio_Adsumus_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      
      // Limpeza
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      alert("Erro ao exportar: " + err.message);
    }
  };
});