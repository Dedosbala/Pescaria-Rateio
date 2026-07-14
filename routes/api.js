const express = require('express');
const ExcelJS = require('exceljs');
const supabase = require('../db/supabaseClient');

const router = express.Router();

function asyncRoute(fn) {
  return (req, res) => fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro interno' });
  });
}

async function getEventoAtivo() {
  const { data, error } = await supabase.from('eventos').select('*').order('id').limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Dashboard (leitura agregada) ----------
async function buildDashboardData() {
  const evento = await getEventoAtivo();
  if (!evento) return { evento: null, equipes: [], resumo: null };

  const { data: equipes, error: equipesErr } = await supabase
    .from('equipes').select('*').eq('evento_id', evento.id).order('id');
  if (equipesErr) throw equipesErr;

  const equipeIds = equipes.map((e) => e.id);

  const { data: pescadores, error: pescadoresErr } = await supabase
    .from('pescadores').select('*').in('equipe_id', equipeIds.length ? equipeIds : [0]).order('id');
  if (pescadoresErr) throw pescadoresErr;

  const pescadorIds = pescadores.map((p) => p.id);

  const [{ data: custos, error: custosErr }, { data: adiantamentos, error: adiantErr }, { data: rateadas, error: rateadasErr }] = await Promise.all([
    supabase.from('custos_fixos').select('*').in('pescador_id', pescadorIds.length ? pescadorIds : [0]).order('id'),
    supabase.from('adiantamentos').select('*').in('pescador_id', pescadorIds.length ? pescadorIds : [0]).order('id'),
    supabase.from('despesas_rateadas').select('*').in('equipe_id', equipeIds.length ? equipeIds : [0]).order('id'),
  ]);
  if (custosErr) throw custosErr;
  if (adiantErr) throw adiantErr;
  if (rateadasErr) throw rateadasErr;

  const rateadaIds = rateadas.map((d) => d.id);
  const { data: participantes, error: participantesErr } = await supabase
    .from('despesa_rateada_participantes')
    .select('*, pescadores(nome)')
    .in('despesa_rateada_id', rateadaIds.length ? rateadaIds : [0]);
  if (participantesErr) throw participantesErr;

  const custosByPescador = groupBy(custos, 'pescador_id');
  const adiantamentosByPescador = groupBy(adiantamentos, 'pescador_id');
  const pescadoresByEquipe = groupBy(pescadores, 'equipe_id');
  const rateadasByEquipe = groupBy(rateadas, 'equipe_id');
  const participantesByRateada = groupBy(participantes, 'despesa_rateada_id');

  let totalFixoGeral = 0;
  let totalAdiantGeral = 0;
  let totalRateadoGeral = 0;
  const categorias = {};

  const equipesOut = equipes.map((equipe) => {
    const despesasRateadas = (rateadasByEquipe[equipe.id] || []).map((d) => {
      const parts = (participantesByRateada[d.id] || []).map((pp) => ({
        id: pp.id, pescador_id: pp.pescador_id, pescador_nome: pp.pescadores ? pp.pescadores.nome : null,
      }));
      const n = parts.length || 1;
      const cota = Number(d.valor_total) / n;
      totalRateadoGeral += Number(d.valor_total);
      return { ...d, participantes: parts, cota_por_participante: cota };
    });

    const rateioPorPescador = {};
    despesasRateadas.forEach((d) => {
      d.participantes.forEach((part) => {
        rateioPorPescador[part.pescador_id] = (rateioPorPescador[part.pescador_id] || 0) + d.cota_por_participante;
      });
    });

    const pescadoresOut = (pescadoresByEquipe[equipe.id] || []).map((p) => {
      const custosP = custosByPescador[p.id] || [];
      const subtotalFixo = custosP.reduce((s, c) => s + Number(c.valor), 0);
      custosP.forEach((c) => { categorias[c.tipo] = (categorias[c.tipo] || 0) + Number(c.valor); });

      const adiantamentosP = adiantamentosByPescador[p.id] || [];
      const totalAdiantado = adiantamentosP.reduce((s, a) => s + Number(a.valor), 0);

      totalFixoGeral += subtotalFixo;
      totalAdiantGeral += totalAdiantado;

      const rateioCota = rateioPorPescador[p.id] || 0;
      const saldo = subtotalFixo + rateioCota - totalAdiantado;

      return {
        ...p,
        custos_fixos: custosP,
        subtotal_fixo: subtotalFixo,
        adiantamentos: adiantamentosP,
        total_adiantado: totalAdiantado,
        rateio_cota: rateioCota,
        saldo_a_pagar: saldo,
      };
    });

    return { ...equipe, pescadores: pescadoresOut, despesas_rateadas: despesasRateadas };
  });

  const totalGeral = totalFixoGeral + totalRateadoGeral;
  const saldoGeral = totalGeral - totalAdiantGeral;

  return {
    evento,
    equipes: equipesOut,
    resumo: {
      categorias,
      subtotal_fixo_geral: totalFixoGeral,
      total_rateado_geral: totalRateadoGeral,
      total_geral: totalGeral,
      adiantamentos_geral: totalAdiantGeral,
      saldo_geral: saldoGeral,
      num_equipes: equipes.length,
      num_pescadores: pescadores.length,
    },
  };
}

router.get('/dashboard', asyncRoute(async (req, res) => {
  const data = await buildDashboardData();
  res.json(data);
}));

// ---------- Exportação ----------
const TIPO_LABELS = { hospedagem: 'Hospedagem', piloto_embarcacao: 'Piloto / Embarcação', camisas: 'Camisas' };

router.get('/export/xlsx', asyncRoute(async (req, res) => {
  const data = await buildDashboardData();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Controle de Pescaria';
  workbook.created = new Date();

  const resumoSheet = workbook.addWorksheet('Resumo');
  resumoSheet.columns = [{ width: 32 }, { width: 18 }];
  resumoSheet.addRow([data.evento ? data.evento.nome : 'Pescaria', '']);
  resumoSheet.addRow([data.evento ? `${data.evento.local} · ${data.evento.ano}` : '', '']);
  resumoSheet.addRow([]);
  const r = data.resumo || {};
  Object.entries(r.categorias || {}).forEach(([tipo, valor]) => {
    resumoSheet.addRow([TIPO_LABELS[tipo] || tipo, valor]);
  });
  resumoSheet.addRow(['Subtotal fixo geral', r.subtotal_fixo_geral || 0]);
  resumoSheet.addRow(['Total rateado (combustível/iscas)', r.total_rateado_geral || 0]);
  resumoSheet.addRow(['Custo total geral', r.total_geral || 0]);
  resumoSheet.addRow(['Adiantamentos já recebidos', r.adiantamentos_geral || 0]);
  resumoSheet.addRow(['Saldo total a receber', r.saldo_geral || 0]);
  resumoSheet.getColumn(2).numFmt = 'R$ #,##0.00';
  resumoSheet.getRow(1).font = { bold: true, size: 14 };

  const pescadoresSheet = workbook.addWorksheet('Pescadores');
  pescadoresSheet.columns = [
    { header: 'Equipe', key: 'equipe', width: 14 },
    { header: 'Piloto', key: 'piloto', width: 16 },
    { header: 'Pescador', key: 'nome', width: 20 },
    { header: 'Hospedagem', key: 'hospedagem', width: 14 },
    { header: 'Piloto/Embarcação', key: 'piloto_embarcacao', width: 16 },
    { header: 'Camisas', key: 'camisas', width: 12 },
    { header: 'Outras despesas', key: 'outras', width: 16 },
    { header: 'Subtotal fixo', key: 'subtotal_fixo', width: 14 },
    { header: 'Rateio equipe', key: 'rateio_cota', width: 14 },
    { header: 'Adiantado', key: 'total_adiantado', width: 14 },
    { header: 'Saldo a pagar', key: 'saldo_a_pagar', width: 14 },
  ];
  pescadoresSheet.getRow(1).font = { bold: true };

  (data.equipes || []).forEach((equipe) => {
    equipe.pescadores.forEach((p) => {
      const porTipo = {};
      let outras = 0;
      p.custos_fixos.forEach((c) => {
        if (['hospedagem', 'piloto_embarcacao', 'camisas'].includes(c.tipo)) {
          porTipo[c.tipo] = (porTipo[c.tipo] || 0) + Number(c.valor);
        } else {
          outras += Number(c.valor);
        }
      });
      pescadoresSheet.addRow({
        equipe: equipe.nome,
        piloto: equipe.piloto_nome || '',
        nome: p.nome,
        hospedagem: porTipo.hospedagem || 0,
        piloto_embarcacao: porTipo.piloto_embarcacao || 0,
        camisas: porTipo.camisas || 0,
        outras,
        subtotal_fixo: p.subtotal_fixo,
        rateio_cota: p.rateio_cota,
        total_adiantado: p.total_adiantado,
        saldo_a_pagar: p.saldo_a_pagar,
      });
    });
  });
  ['hospedagem', 'piloto_embarcacao', 'camisas', 'outras', 'subtotal_fixo', 'rateio_cota', 'total_adiantado', 'saldo_a_pagar'].forEach((key) => {
    pescadoresSheet.getColumn(key).numFmt = 'R$ #,##0.00';
  });

  const rateioSheet = workbook.addWorksheet('Despesas rateadas');
  rateioSheet.columns = [
    { header: 'Equipe', key: 'equipe', width: 14 },
    { header: 'Descrição', key: 'descricao', width: 24 },
    { header: 'Valor total', key: 'valor_total', width: 14 },
    { header: 'Participantes', key: 'participantes', width: 40 },
    { header: 'Cota por participante', key: 'cota', width: 18 },
  ];
  rateioSheet.getRow(1).font = { bold: true };
  (data.equipes || []).forEach((equipe) => {
    equipe.despesas_rateadas.forEach((d) => {
      rateioSheet.addRow({
        equipe: equipe.nome,
        descricao: d.descricao,
        valor_total: Number(d.valor_total),
        participantes: d.participantes.map((p) => p.pescador_nome).join(', '),
        cota: d.cota_por_participante,
      });
    });
  });
  rateioSheet.getColumn('valor_total').numFmt = 'R$ #,##0.00';
  rateioSheet.getColumn('cota').numFmt = 'R$ #,##0.00';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="pescaria-rateio.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}));

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key];
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

// ---------- Equipes ----------
router.post('/equipes', asyncRoute(async (req, res) => {
  const evento = await getEventoAtivo();
  const { nome, piloto_nome, piloto_contato } = req.body;
  if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });

  const { data, error } = await supabase.from('equipes').insert({
    evento_id: evento.id, nome, piloto_nome: piloto_nome || null, piloto_contato: piloto_contato || null,
  }).select().single();
  if (error) throw error;
  res.status(201).json({ id: data.id });
}));

router.put('/equipes/:id', asyncRoute(async (req, res) => {
  const { nome, piloto_nome, piloto_contato } = req.body;
  const { error } = await supabase.from('equipes').update({
    nome, piloto_nome: piloto_nome || null, piloto_contato: piloto_contato || null,
  }).eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

router.delete('/equipes/:id', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('equipes').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

// ---------- Pescadores ----------
router.post('/pescadores', asyncRoute(async (req, res) => {
  const { equipe_id, nome, a_confirmar } = req.body;
  if (!equipe_id || !nome) return res.status(400).json({ error: 'equipe_id e nome são obrigatórios' });

  const { data, error } = await supabase.from('pescadores').insert({
    equipe_id, nome, a_confirmar: !!a_confirmar,
  }).select().single();
  if (error) throw error;
  res.status(201).json({ id: data.id });
}));

router.put('/pescadores/:id', asyncRoute(async (req, res) => {
  const { nome, a_confirmar } = req.body;
  const { error } = await supabase.from('pescadores').update({ nome, a_confirmar: !!a_confirmar }).eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

router.delete('/pescadores/:id', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('pescadores').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

// ---------- Custos fixos (despesas individuais) ----------
router.post('/custos-fixos', asyncRoute(async (req, res) => {
  const { pescador_id, tipo, descricao, valor } = req.body;
  if (!pescador_id || !tipo || valor == null) return res.status(400).json({ error: 'pescador_id, tipo e valor são obrigatórios' });

  const { data, error } = await supabase.from('custos_fixos').insert({
    pescador_id, tipo, descricao: descricao || null, valor,
  }).select().single();
  if (error) throw error;
  res.status(201).json({ id: data.id });
}));

router.put('/custos-fixos/:id', asyncRoute(async (req, res) => {
  const { data: existing, error: findErr } = await supabase.from('custos_fixos').select('*').eq('id', req.params.id).maybeSingle();
  if (findErr) throw findErr;
  if (!existing) return res.status(404).json({ error: 'Custo fixo não encontrado' });

  const tipo = req.body.tipo !== undefined ? req.body.tipo : existing.tipo;
  const descricao = req.body.descricao !== undefined ? req.body.descricao : existing.descricao;
  const valor = req.body.valor !== undefined ? req.body.valor : existing.valor;

  const { error } = await supabase.from('custos_fixos').update({ tipo, descricao: descricao || null, valor }).eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

router.delete('/custos-fixos/:id', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('custos_fixos').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

// ---------- Adiantamentos ----------
router.post('/adiantamentos', asyncRoute(async (req, res) => {
  const { pescador_id, valor, data, observacao } = req.body;
  if (!pescador_id || valor == null) return res.status(400).json({ error: 'pescador_id e valor são obrigatórios' });

  const { data: row, error } = await supabase.from('adiantamentos').insert({
    pescador_id, valor, data: data || null, observacao: observacao || null,
  }).select().single();
  if (error) throw error;
  res.status(201).json({ id: row.id });
}));

router.put('/adiantamentos/:id', asyncRoute(async (req, res) => {
  const { valor, data, observacao } = req.body;
  const { error } = await supabase.from('adiantamentos').update({
    valor, data: data || null, observacao: observacao || null,
  }).eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

router.delete('/adiantamentos/:id', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('adiantamentos').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

// ---------- Despesas rateadas (combustível, iscas, etc.) ----------
router.post('/despesas-rateadas', asyncRoute(async (req, res) => {
  const { equipe_id, descricao, valor_total, data, participante_ids } = req.body;
  if (!equipe_id || !descricao || valor_total == null) {
    return res.status(400).json({ error: 'equipe_id, descricao e valor_total são obrigatórios' });
  }

  const { data: despesa, error: despesaErr } = await supabase.from('despesas_rateadas').insert({
    equipe_id, descricao, valor_total, data: data || null,
  }).select().single();
  if (despesaErr) throw despesaErr;

  let ids = participante_ids;
  if (!ids || ids.length === 0) {
    const { data: membros, error: membrosErr } = await supabase.from('pescadores').select('id').eq('equipe_id', equipe_id);
    if (membrosErr) throw membrosErr;
    ids = membros.map((m) => m.id);
  }

  const rows = ids.map((pid) => ({ despesa_rateada_id: despesa.id, pescador_id: pid }));
  const { error: partErr } = await supabase.from('despesa_rateada_participantes').insert(rows);
  if (partErr) throw partErr;

  res.status(201).json({ id: despesa.id });
}));

router.delete('/despesas-rateadas/:id', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('despesas_rateadas').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

module.exports = router;
