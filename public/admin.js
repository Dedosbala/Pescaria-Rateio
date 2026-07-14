const EQUIPE_COLORS = ['#1b4f72', '#117a65', '#b9770e', '#6c3483', '#943126', '#1e8449', '#34495e'];

let state = null;

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

async function loadDashboard() {
  state = await api('/dashboard');
  render();
}

function render() {
  if (!state.evento) {
    document.getElementById('evento-nome').textContent = 'Nenhum evento cadastrado';
    return;
  }
  document.getElementById('evento-nome').textContent = state.evento.nome;
  document.getElementById('evento-sub').textContent = `${state.evento.local} · ${state.evento.ano}`;

  renderStats();
  renderResumo();
  renderEquipes();
}

function renderStats() {
  const r = state.resumo;
  const el = document.getElementById('stats');
  el.innerHTML = `
    <div class="stat-box"><div class="value">${r.num_equipes}</div><div class="label">equipes</div></div>
    <div class="stat-box"><div class="value">${r.num_pescadores}</div><div class="label">pescadores</div></div>
    <div class="stat-box"><div class="value">${fmt(r.total_geral)}</div><div class="label">custo total (fixo + rateado)</div></div>
    <div class="stat-box"><div class="value">${fmt(r.saldo_geral)}</div><div class="label">saldo a receber</div></div>
  `;
}

function renderResumo() {
  const r = state.resumo;
  const labels = { hospedagem: 'Hospedagem', piloto_embarcacao: 'Piloto / Embarcação', camisas: 'Camisas' };
  const rows = Object.entries(r.categorias)
    .map(([tipo, valor]) => `<tr><td>${labels[tipo] || tipo}</td><td class="text-right">${fmt(valor)}</td></tr>`)
    .join('');

  document.getElementById('resumo-tabela').innerHTML = `
    <table>
      <tbody>
        ${rows}
        <tr><td><strong>Subtotal fixo geral</strong></td><td class="text-right"><strong>${fmt(r.subtotal_fixo_geral)}</strong></td></tr>
        <tr><td>Total rateado (combustível/iscas)</td><td class="text-right">${fmt(r.total_rateado_geral)}</td></tr>
        <tr><td><strong>Custo total geral</strong></td><td class="text-right"><strong>${fmt(r.total_geral)}</strong></td></tr>
        <tr><td>Adiantamentos já recebidos</td><td class="text-right">${fmt(r.adiantamentos_geral)}</td></tr>
        <tr><td><strong>Saldo total a receber</strong></td><td class="text-right saldo-positivo">${fmt(r.saldo_geral)}</td></tr>
      </tbody>
    </table>
  `;
}

function renderEquipes() {
  const container = document.getElementById('equipes-container');
  container.innerHTML = '';
  state.equipes.forEach((equipe, idx) => {
    container.appendChild(renderEquipeCard(equipe, idx));
  });
}

function renderEquipeCard(equipe, idx) {
  const color = EQUIPE_COLORS[idx % EQUIPE_COLORS.length];
  const card = document.createElement('div');
  card.className = 'card equipe-card';

  const pilotoLine = [equipe.piloto_nome, equipe.piloto_contato].filter(Boolean).join(' | ');

  const rows = equipe.pescadores.map((p) => {
    const custoByTipo = {};
    p.custos_fixos.forEach((c) => { custoByTipo[c.tipo] = c; });
    const hosp = custoByTipo.hospedagem;
    const pil = custoByTipo.piloto_embarcacao;
    const cam = custoByTipo.camisas;
    const saldoClass = p.saldo_a_pagar > 0.005 ? 'saldo-positivo' : 'saldo-zero';

    return `
      <tr data-pescador-id="${p.id}">
        <td>${p.nome}${p.a_confirmar ? '<span class="badge">a confirmar</span>' : ''}</td>
        <td>${editableCusto(hosp)}</td>
        <td>${editableCusto(pil)}</td>
        <td>${editableCusto(cam)}</td>
        <td>${fmt(p.subtotal_fixo)}</td>
        <td>${fmt(p.rateio_cota)}</td>
        <td>
          ${fmt(p.total_adiantado)}
          <button class="btn btn-sm" data-action="add-adiantamento" data-pescador-id="${p.id}" data-pescador-nome="${p.nome}">+</button>
        </td>
        <td class="${saldoClass}">${fmt(p.saldo_a_pagar)}</td>
        <td><button class="btn btn-sm btn-danger" data-action="del-pescador" data-id="${p.id}">Excluir</button></td>
      </tr>
    `;
  }).join('');

  const rateioItems = equipe.despesas_rateadas.map((d) => `
    <div class="rateio-item">
      <span>${d.descricao} — ${fmt(d.valor_total)} (÷ ${d.participantes.length} = ${fmt(d.cota_por_participante)} cada)</span>
      <button class="btn btn-sm btn-danger" data-action="del-rateio" data-id="${d.id}">Excluir</button>
    </div>
  `).join('') || '<p class="muted">Nenhuma despesa rateada lançada ainda (combustível, iscas...).</p>';

  card.innerHTML = `
    <div class="equipe-header" style="background:${color}">
      <div>
        <h3>${equipe.nome}${pilotoLine ? ' — Piloto ' + pilotoLine : ''}</h3>
      </div>
      <div class="row-actions">
        <button class="btn btn-sm" data-action="add-pescador" data-equipe-id="${equipe.id}">+ Pescador</button>
        <button class="btn btn-sm" data-action="edit-equipe" data-id="${equipe.id}">Editar equipe</button>
        <button class="btn btn-sm btn-danger" data-action="del-equipe" data-id="${equipe.id}">Excluir equipe</button>
      </div>
    </div>
    <div class="equipe-body">
      <table>
        <thead>
          <tr>
            <th>Pescador</th><th>Hospedagem</th><th>Piloto/Embarc.</th><th>Camisas</th>
            <th>Subtotal fixo</th><th>Rateio</th><th>Adiantamento</th><th>Saldo a pagar</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="rateio-list">
        <strong>Despesas rateadas da equipe (combustível, iscas...)</strong>
        ${rateioItems}
        <button class="btn btn-sm" data-action="add-rateio" data-equipe-id="${equipe.id}">+ Despesa rateada</button>
      </div>
    </div>
  `;

  return card;
}

function editableCusto(custo) {
  if (!custo) return '<span class="muted">—</span>';
  return `<span class="editable" contenteditable="true" data-action="edit-custo" data-id="${custo.id}">${custo.valor}</span>`;
}

// ---------- Ações inline (delegação de eventos) ----------
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  try {
    if (action === 'del-pescador') {
      if (confirm('Excluir este pescador?')) { await api(`/pescadores/${btn.dataset.id}`, { method: 'DELETE' }); await loadDashboard(); }
    } else if (action === 'del-equipe') {
      if (confirm('Excluir esta equipe e todos os pescadores dela?')) { await api(`/equipes/${btn.dataset.id}`, { method: 'DELETE' }); await loadDashboard(); }
    } else if (action === 'del-rateio') {
      if (confirm('Excluir esta despesa rateada?')) { await api(`/despesas-rateadas/${btn.dataset.id}`, { method: 'DELETE' }); await loadDashboard(); }
    } else if (action === 'add-adiantamento') {
      openAdiantamentoModal(btn.dataset.pescadorId, btn.dataset.pescadorNome);
    } else if (action === 'add-pescador') {
      openPescadorModal(btn.dataset.equipeId);
    } else if (action === 'edit-equipe') {
      openEquipeModal(btn.dataset.id);
    } else if (action === 'add-rateio') {
      openRateioModal(btn.dataset.equipeId);
    }
  } catch (err) {
    alert(err.message);
  }
});

document.addEventListener('blur', async (e) => {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  if (el.dataset && el.dataset.action === 'edit-custo') {
    const valor = parseFloat(el.textContent.replace(',', '.'));
    if (isNaN(valor)) { alert('Valor inválido'); await loadDashboard(); return; }
    try {
      await api(`/custos-fixos/${el.dataset.id}`, {
        method: 'PUT',
        body: JSON.stringify({ tipo: undefined, descricao: undefined, valor }),
      });
      await loadDashboard();
    } catch (err) {
      alert(err.message);
    }
  }
}, true);

document.getElementById('btn-add-equipe').addEventListener('click', () => openEquipeModal(null));
document.getElementById('btn-export-pdf').addEventListener('click', () => window.print());
document.getElementById('btn-export-xlsx').addEventListener('click', () => { window.location.href = '/api/export/xlsx'; });

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

function openAdiantamentoModal(pescadorId, pescadorNome) {
  openModalRaw(`Adiantamento — ${pescadorNome}`, `
    <label>Valor (R$)<input name="valor" type="number" step="0.01" min="0" required /></label>
    <label>Data<input name="data" type="date" /></label>
    <label>Observação<input name="observacao" type="text" placeholder="opcional" /></label>
  `, async (fd) => {
    await api('/adiantamentos', {
      method: 'POST',
      body: JSON.stringify({
        pescador_id: Number(pescadorId),
        valor: parseFloat(fd.get('valor')),
        data: fd.get('data') || null,
        observacao: fd.get('observacao') || null,
      }),
    });
  });
}

function openPescadorModal(equipeId) {
  openModalRaw('Novo pescador', `
    <label>Nome<input name="nome" type="text" required /></label>
    <label>Hospedagem (R$)<input name="hospedagem" type="number" step="0.01" value="0" /></label>
    <label>Piloto/Embarcação (R$)<input name="piloto" type="number" step="0.01" value="0" /></label>
    <label>Camisas (R$)<input name="camisas" type="number" step="0.01" value="0" /></label>
    <label class="checkbox-row"><input name="a_confirmar" type="checkbox" /> A confirmar</label>
  `, async (fd) => {
    const pescador = await api('/pescadores', {
      method: 'POST',
      body: JSON.stringify({
        equipe_id: Number(equipeId),
        nome: fd.get('nome'),
        a_confirmar: fd.get('a_confirmar') === 'on',
      }),
    });
    const custos = [
      ['hospedagem', 'Hospedagem', fd.get('hospedagem')],
      ['piloto_embarcacao', 'Piloto / Embarcação', fd.get('piloto')],
      ['camisas', 'Camisas', fd.get('camisas')],
    ];
    for (const [tipo, descricao, valor] of custos) {
      await api('/custos-fixos', {
        method: 'POST',
        body: JSON.stringify({ pescador_id: pescador.id, tipo, descricao, valor: parseFloat(valor) || 0 }),
      });
    }
  });
}

function openEquipeModal(equipeId) {
  const equipe = equipeId ? state.equipes.find((e) => String(e.id) === String(equipeId)) : null;
  openModalRaw(equipe ? 'Editar equipe' : 'Nova equipe', `
    <label>Nome<input name="nome" type="text" required value="${equipe ? equipe.nome : ''}" /></label>
    <label>Piloto<input name="piloto_nome" type="text" value="${equipe ? (equipe.piloto_nome || '') : ''}" /></label>
    <label>Contato do piloto<input name="piloto_contato" type="text" value="${equipe ? (equipe.piloto_contato || '') : ''}" /></label>
  `, async (fd) => {
    const payload = {
      nome: fd.get('nome'),
      piloto_nome: fd.get('piloto_nome') || null,
      piloto_contato: fd.get('piloto_contato') || null,
    };
    if (equipe) {
      await api(`/equipes/${equipe.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/equipes', { method: 'POST', body: JSON.stringify(payload) });
    }
  });
}

function openRateioModal(equipeId) {
  const equipe = state.equipes.find((e) => String(e.id) === String(equipeId));
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
        equipe_id: Number(equipeId),
        descricao: fd.get('descricao'),
        valor_total: parseFloat(fd.get('valor_total')),
        data: fd.get('data') || null,
        participante_ids,
      }),
    });
  });
}

loadDashboard();
