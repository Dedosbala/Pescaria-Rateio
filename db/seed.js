const supabase = require('./supabaseClient');

const EVENTO = { nome: 'Pescaria TOTVS Brasil Central', local: 'Aruanã - GO', ano: 2026 };

// Dados extraídos de Pescaria_2026_Rateio.pdf (atualizado em 14/07/2026)
const EQUIPES = [
  {
    nome: 'Equipe 1', piloto_nome: 'Nena', piloto_contato: null,
    pescadores: [
      { nome: 'Ademar', hospedagem: 300, piloto: 600, camisas: 200, adiantamento: 483 },
      { nome: 'Ademar Filho', hospedagem: 300, piloto: 600, camisas: 200, adiantamento: 483 },
      { nome: 'Lucas Eduardo', hospedagem: 300, piloto: 600, camisas: 200, adiantamento: 484 },
    ],
  },
  {
    nome: 'Equipe 2', piloto_nome: 'Elsinho', piloto_contato: '62 99329-1094',
    pescadores: [
      { nome: 'Gustavo', hospedagem: 450, piloto: 600, camisas: 200, adiantamento: 483 },
      { nome: 'Jozias', hospedagem: 450, piloto: 600, camisas: 200, adiantamento: 500 },
      { nome: 'Hallam', hospedagem: 450, piloto: 600, camisas: 200, adiantamento: 483 },
    ],
  },
  {
    nome: 'Equipe 3', piloto_nome: 'Diley', piloto_contato: '62 99475-4217',
    pescadores: [
      { nome: 'Ramon', hospedagem: 450, piloto: 600, camisas: 200, adiantamento: 483 },
      { nome: 'Tanaka', hospedagem: 450, piloto: 600, camisas: 200, adiantamento: 483 },
      { nome: 'Kenzo', hospedagem: 450, piloto: 600, camisas: 200, adiantamento: 483 },
    ],
  },
  {
    nome: 'Equipe 4', piloto_nome: 'Wiliam', piloto_contato: '62 99844-7751',
    pescadores: [
      { nome: 'Nélio', hospedagem: 300, piloto: 600, camisas: 200, adiantamento: 483 },
      { nome: 'Euripédes', hospedagem: 300, piloto: 600, camisas: 200, adiantamento: 483 },
      { nome: 'Mateus', hospedagem: 300, piloto: 600, camisas: 200, adiantamento: 484 },
    ],
  },
  {
    nome: 'Equipe 5', piloto_nome: 'Antônio', piloto_contato: '+44 7846 413414 (ZAP)',
    pescadores: [
      { nome: 'Gyovanny', hospedagem: 450, piloto: 800, camisas: 200, adiantamento: 0 },
      { nome: 'Diogo', hospedagem: 450, piloto: 800, camisas: 200, adiantamento: 0 },
      { nome: 'Carlos Mendes', hospedagem: 900, piloto: 800, camisas: 200, adiantamento: 0 },
    ],
  },
  {
    nome: 'Equipe 6', piloto_nome: 'Lé', piloto_contato: null,
    pescadores: [
      { nome: 'Renato', hospedagem: 450, piloto: 800, camisas: 200, adiantamento: 483 },
      { nome: 'Leandro', hospedagem: 450, piloto: 800, camisas: 200, adiantamento: 484 },
      { nome: 'Daniel', hospedagem: 900, piloto: 800, camisas: 200, adiantamento: 0 },
    ],
  },
  {
    nome: 'Equipe 7', piloto_nome: 'Sadrak', piloto_contato: '62 98441-4033',
    pescadores: [
      { nome: 'Luciano', hospedagem: 900, piloto: 1000, camisas: 200, adiantamento: 0 },
      { nome: 'Lemos', hospedagem: 450, piloto: 1000, camisas: 200, adiantamento: 0, a_confirmar: true },
      { nome: 'A confirmar', hospedagem: 450, piloto: 1000, camisas: 200, adiantamento: 0, a_confirmar: true },
    ],
  },
];

async function reset() {
  // apaga na ordem inversa das dependências
  await supabase.from('despesa_rateada_participantes').delete().not('id', 'is', null);
  await supabase.from('despesas_rateadas').delete().not('id', 'is', null);
  await supabase.from('adiantamentos').delete().not('id', 'is', null);
  await supabase.from('custos_fixos').delete().not('id', 'is', null);
  await supabase.from('pescadores').delete().not('id', 'is', null);
  await supabase.from('equipes').delete().not('id', 'is', null);
  await supabase.from('eventos').delete().not('id', 'is', null);
}

const DESPESAS_GERAIS_FECHADAS = [
  { descricao: 'Cozinheira e ajudante (café da manhã + jantar)', valor_total: 1400 },
  { descricao: 'Taxa de limpeza (saída)', valor_total: 400 },
];

async function seed() {
  await reset();

  const { data: evento, error: eventoErr } = await supabase.from('eventos').insert(EVENTO).select().single();
  if (eventoErr) throw eventoErr;

  const todosPescadorIds = [];

  for (const equipe of EQUIPES) {
    const { data: equipeRow, error: equipeErr } = await supabase.from('equipes').insert({
      evento_id: evento.id,
      nome: equipe.nome,
      piloto_nome: equipe.piloto_nome,
      piloto_contato: equipe.piloto_contato,
    }).select().single();
    if (equipeErr) throw equipeErr;

    for (const p of equipe.pescadores) {
      const { data: pescadorRow, error: pescadorErr } = await supabase.from('pescadores').insert({
        equipe_id: equipeRow.id,
        nome: p.nome,
        a_confirmar: !!p.a_confirmar,
      }).select().single();
      if (pescadorErr) throw pescadorErr;
      todosPescadorIds.push(pescadorRow.id);

      const custos = [
        { pescador_id: pescadorRow.id, tipo: 'hospedagem', descricao: 'Hospedagem (3 noites)', valor: p.hospedagem },
        { pescador_id: pescadorRow.id, tipo: 'piloto_embarcacao', descricao: 'Piloto / Embarcação', valor: p.piloto },
        { pescador_id: pescadorRow.id, tipo: 'camisas', descricao: 'Camisas (2un)', valor: p.camisas },
      ];
      const { error: custosErr } = await supabase.from('custos_fixos').insert(custos);
      if (custosErr) throw custosErr;

      if (p.adiantamento > 0) {
        const { error: adiantErr } = await supabase.from('adiantamentos').insert({
          pescador_id: pescadorRow.id,
          valor: p.adiantamento,
          observacao: 'Adiantamento inicial',
        });
        if (adiantErr) throw adiantErr;
      }
    }
  }

  for (const despesa of DESPESAS_GERAIS_FECHADAS) {
    const { data: despesaRow, error: despesaErr } = await supabase.from('despesas_rateadas').insert({
      equipe_id: null,
      descricao: despesa.descricao,
      valor_total: despesa.valor_total,
    }).select().single();
    if (despesaErr) throw despesaErr;

    const participantes = todosPescadorIds.map((pid) => ({ despesa_rateada_id: despesaRow.id, pescador_id: pid }));
    const { error: partErr } = await supabase.from('despesa_rateada_participantes').insert(participantes);
    if (partErr) throw partErr;
  }

  console.log('Banco populado com sucesso: 1 evento, 7 equipes, 21 pescadores, 2 despesas gerais.');
}

seed().catch((err) => {
  console.error('Erro ao popular banco:', err.message || err);
  process.exit(1);
});
