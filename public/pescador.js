const STORAGE_KEY = 'pescaria_meu_id';
const TIPOS_FIXOS = ['hospedagem', 'piloto_embarcacao', 'camisas'];
const TIPO_LABELS = { hospedagem: 'Hospedagem', piloto_embarcacao: 'Piloto / Embarcação', camisas: 'Camisas' };

let state = null;
let meuId = localStorage.getItem(STORAGE_KEY);

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error || 'Erro na requisição');
  }
  return res.status === 204 ? null : res.json();
}

function findPescador(id) {
  for (const equipe of state.equipes) {
    const p = equipe.pescadores.find((x) => String(x.id) === String(id));
    if (p) return { pescador: p, equipe };
  }
  return null;
}

async function loadDashboard() {
  state = await api('/dashboard');
  render();
}

function render() {
  document.getElementById('evento-nome').textContent = state.evento ? state.evento.nome : 'Pescaria';
  document.getElementById('evento-sub').textContent = state.evento ? `${state.evento.local} · ${state.evento.ano}` : '';

  const found = meuId ? findPescador(meuId) : null;

  if (!found) {
    meuId = null;
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById('seletor-nome').style.display = '';
    document.getElementById('area-pessoal').style.display = 'none';
    document.getElementById('trocar-link').style.display = 'none';
    renderSeletor();
  } else {
    document.getElementById('seletor-nome').style.display = 'none';
    document.getElementById('area-pessoal').style.display = '';
    document.getElementById('trocar-link').style.display = '';
    renderAreaPessoal(found.pescador, found.equipe);
  }

  renderResumoGeral();
}

function renderSeletor() {
  const container = document.getElementById('name-grid-container');
  container.innerHTML = '';
  state.equipes.forEach((equipe) => {
    const title = document.createElement('div');
    title.className = 'equipe-group-title';
    title.textContent = equipe.nome + (equipe.piloto_nome ? ' — Piloto ' + equipe.piloto_nome : '');
    container.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'name-grid';
    equipe.pescadores.forEach((p) => {
      const btn = document.createElement('button');
      btn.className = 'name-btn';
      btn.innerHTML = `${p.nome}<span class="equipe-tag">${equipe.nome}</span>`;
      btn.addEventListener('click', () => {
        meuId = String(p.id);
        localStorage.setItem(STORAGE_KEY, meuId);
        render();
      });
      grid.appendChild(btn);
    });
    container.appendChild(grid);
  });
}

document.getElementById('trocar-link').addEventListener('click', (e) => {
  e.preventDefault();
  meuId = null;
  localStorage.removeItem(STORAGE_KEY);
  render();
});

function renderAreaPessoal(p, equipe) {
  document.getElementById('pescador-nome').textContent = p.nome;
  document.getElementById('pescador-equipe').textContent = `${equipe.nome}${equipe.piloto_nome ? ' — Piloto ' + equipe.piloto_nome : ''}`;

  document.getElementById('p-subtotal-fixo').textContent = fmt(p.subtotal_fixo);
  document.getElementById('p-rateio').textContent = fmt(p.rateio_cota);
  document.getElementById('p-adiantado').textContent = fmt(p.total_adiantado);
  document.getElementById('p-saldo').textContent = fmt(p.saldo_a_pagar);

  const lista = document.getElementById('lista-despesas');
  lista.innerHTML = p.custos_fixos.map((c) => {
    const isFixo = TIPOS_FIXOS.includes(c.tipo);
    const label = isFixo ? TIPO_LABELS[c.tipo] : (c.descricao || 'Despesa avulsa');
    const delBtn = isFixo ? '' : `<button class="btn btn-sm btn-danger" data-action="del-despesa" data-id="${c.id}">Excluir</button>`;
    return `<div class="list-item"><span class="desc">${label}</span><span>${fmt(c.valor)}</span>${delBtn}</div>`;
  }).join('') || '<p class="muted">Nenhuma despesa lançada.</p>';

  const rateioList = document.getElementById('lista-rateio');
  rateioList.innerHTML = equipe.despesas_rateadas.map((d) => `
    <div class="list-item">
      <span class="desc">${d.descricao} (÷ ${d.participantes.length} = ${fmt(d.cota_por_participante)} cada)</span>
      <span>${fmt(d.valor_total)}</span>
      <button class="btn btn-sm btn-danger" data-action="del-rateio" data-id="${d.id}">Excluir</button>
    </div>
  `).join('') || '<p class="muted">Nenhuma despesa rateada lançada ainda.</p>';

  document.getElementById('btn-add-despesa').onclick = () => openDespesaModal(p.id);
  document.getElementById('btn-add-rateio').onclick = () => openRateioModal(equipe);
}

function renderResumoGeral() {
  const r = state.resumo;
  if (!r) return;
  const container = document.getElementById('resumo-geral-container');

  const equipesRows = state.equipes.map((equipe) => {
    const rows = equipe.pescadores.map((p) => `
      <tr><td>${p.nome}</td><td class="text-right">${fmt(p.subtotal_fixo + p.rateio_cota)}</td><td class="text-right">${fmt(p.total_adiantado)}</td><td class="text-right">${fmt(p.saldo_a_pagar)}</td></tr>
    `).join('');
    return `
      <p><strong>${equipe.nome}</strong>${equipe.piloto_nome ? ' — Piloto ' + equipe.piloto_nome : ''}</p>
      <table class="equipe-mini-table">
        <thead><tr><th>Pescador</th><th class="text-right">Custo total</th><th class="text-right">Adiantado</th><th class="text-right">Saldo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }).join('');

  container.innerHTML = `
    <div class="summary-row"><span>Equipes / Pescadores</span><span>${r.num_equipes} / ${r.num_pescadores}</span></div>
    <div class="summary-row"><span>Subtotal fixo geral</span><span>${fmt(r.subtotal_fixo_geral)}</span></div>
    <div class="summary-row"><span>Total rateado (combustível/iscas)</span><span>${fmt(r.total_rateado_geral)}</span></div>
    <div class="summary-row"><span>Adiantamentos já recebidos</span><span>${fmt(r.adiantamentos_geral)}</span></div>
    <div class="summary-row total"><span>Saldo total a receber</span><span>${fmt(r.saldo_geral)}</span></div>
    <div style="margin-top:16px;">${equipesRows}</div>
  `;
}

document.getElementById('btn-toggle-resumo').addEventListener('click', (e) => {
  const el = document.getElementById('resumo-geral-container');
  const showing = el.style.display !== 'none';
  el.style.display = showing ? 'none' : '';
  e.target.textContent = showing ? 'Ver resumo geral do grupo ▾' : 'Ocultar resumo geral do grupo ▴';
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  try {
    if (action === 'del-despesa') {
      if (confirm('Excluir esta despesa?')) { await api(`/custos-fixos/${btn.dataset.id}`, { method: 'DELETE' }); await loadDashboard(); }
    } else if (action === 'del-rateio') {
      if (confirm('Excluir esta despesa rateada?')) { await api(`/despesas-rateadas/${btn.dataset.id}`, { method: 'DELETE' }); await loadDashboard(); }
    }
  } catch (err) {
    alert(err.message);
  }
});

// ---------- Modal genérico ----------
const overlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalForm = document.getElementById('modal-form');
document.getElementById('modal-close').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

function closeModal() {
  overlay.classList.add('hidden');
  modalForm.innerHTML = '';
}

function openModalRaw(title, bodyHtml, onSubmit) {
  modalTitle.textContent = title;
  modalForm.innerHTML = bodyHtml + `
    <div class="modal-footer">
      <button type="button" class="btn" id="modal-cancel">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </div>
  `;
  overlay.classList.remove('hidden');
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit(new FormData(modalForm));
      closeModal();
      await loadDashboard();
    } catch (err) {
      alert(err.message);
    }
  };
}

function openDespesaModal(pescadorId) {
  openModalRaw('Nova despesa individual', `
    <label>Descrição<input name="descricao" type="text" placeholder="Ex: aluguel de vara" required /></label>
    <label>Valor (R$)<input name="valor" type="number" step="0.01" min="0" required /></label>
  `, async (fd) => {
    await api('/custos-fixos', {
      method: 'POST',
      body: JSON.stringify({
        pescador_id: Number(pescadorId),
        tipo: 'outro',
        descricao: fd.get('descricao'),
        valor: parseFloat(fd.get('valor')),
      }),
    });
  });
}

function openRateioModal(equipe) {
  const checkboxes = equipe.pescadores.map((p) => `
    <label class="checkbox-row"><input type="checkbox" name="participante" value="${p.id}" checked /> ${p.nome}</label>
  `).join('');

  openModalRaw(`Despesa rateada — ${equipe.nome}`, `
    <label>Descrição<input name="descricao" type="text" placeholder="Combustível, iscas..." required /></label>
    <label>Valor total (R$)<input name="valor_total" type="number" step="0.01" min="0" required /></label>
    <label>Data<input name="data" type="date" /></label>
    <div><strong>Dividir entre:</strong></div>
    ${checkboxes}
  `, async (fd) => {
    const participante_ids = fd.getAll('participante').map(Number);
    await api('/despesas-rateadas', {
      method: 'POST',
      body: JSON.stringify({
        equipe_id: equipe.id,
        descricao: fd.get('descricao'),
        valor_total: parseFloat(fd.get('valor_total')),
        data: fd.get('data') || null,
        participante_ids,
      }),
    });
  });
}

loadDashboard();
