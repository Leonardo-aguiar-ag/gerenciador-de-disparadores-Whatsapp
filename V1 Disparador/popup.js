document.addEventListener('DOMContentLoaded', async () => {
    // Sistema de Abas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn, .aba-content').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-target')).classList.add('active');
        };
    });

    // Carregar dados salvos
    const d = await chrome.storage.local.get(['scripts', 'checks', 'nums', 'min', 'max']);
    document.getElementById('numeros').value = d.nums || "";
    document.getElementById('min').value = d.min || 15;
    document.getElementById('max').value = d.max || 30;

    // Gerar campos de Scripts (Corrigido)
    const container = document.getElementById('scripts-container');
    for(let i=0; i<8; i++) {
        container.innerHTML += `
            <div class="script-row">
                <input type="checkbox" class="chk" ${d.checks?.[i] ? 'checked' : ''}>
                <textarea class="txt" placeholder="Mensagem ${i+1}">${d.scripts?.[i] || ''}</textarea>
            </div>`;
    }

    // Monitor de Progresso e Tempo Real
    setInterval(async () => {
        const s = await chrome.storage.local.get(['index', 'total', 'rodando', 'pausado']);
        if(s.total) {
            document.getElementById('prog').innerText = `${s.index}/${s.total}`;
            document.getElementById('bar').style.width = (s.index / s.total * 100) + "%";
            
            // Cálculo Tempo Estimado
            const falta = s.total - s.index;
            const min = parseInt(document.getElementById('min').value);
            const max = parseInt(document.getElementById('max').value);
            const seg = falta * (((min + max) / 2) + 6);
            
            const m = Math.floor(seg / 60);
            const segRest = seg % 60;
            document.getElementById('tempo').innerText = m > 0 ? `${m}m ${segRest}s` : `${segRest}s`;
            
            // Texto do botão de pausa
            document.getElementById('btnPause').innerText = s.pausado ? "RETOMAR" : "PAUSAR";
        }
    }, 1000);

    // Salvar ao digitar
    document.addEventListener('input', () => {
        const scripts = Array.from(document.querySelectorAll('.txt')).map(t => t.value);
        const checks = Array.from(document.querySelectorAll('.chk')).map(c => c.checked);
        chrome.storage.local.set({ 
            scripts, checks, 
            nums: document.getElementById('numeros').value, 
            min: document.getElementById('min').value, 
            max: document.getElementById('max').value 
        });
    });

    // Ações dos Botões
    document.getElementById('btnStart').onclick = () => {
        const lista = document.getElementById('numeros').value.split('\n').filter(n => n.trim().length > 8);
        const scripts = Array.from(document.querySelectorAll('.chk:checked')).map(c => c.parentElement.querySelector('.txt').value).filter(t => t.trim() !== "");
        if(scripts.length === 0) return alert("Selecione os scripts ativos!");
        chrome.runtime.sendMessage({ acao: "iniciar", lista, scripts });
    };

    document.getElementById('btnPause').onclick = async () => {
        const s = await chrome.storage.local.get('pausado');
        if (s.pausado) {
            const lista = document.getElementById('numeros').value.split('\n').filter(n => n.trim().length > 8);
            const scripts = Array.from(document.querySelectorAll('.chk:checked')).map(c => c.parentElement.querySelector('.txt').value).filter(t => t.trim() !== "");
            chrome.runtime.sendMessage({ acao: "iniciar", lista, scripts });
        } else {
            chrome.runtime.sendMessage({ acao: "pausar" });
        }
    };

    document.getElementById('btnStop').onclick = () => chrome.runtime.sendMessage({ acao: "parar" });
});