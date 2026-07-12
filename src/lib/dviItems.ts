// Checklist padrao de inspecao (DVI) — 40 itens tipicos de linha pesada.
export const DVI_ITEMS: { key: string; label: string; category: string }[] = [
  // Freios
  { key: 'lona_freio_diant', label: 'Lona/pastilha dianteira', category: 'freios' },
  { key: 'lona_freio_tras', label: 'Lona/pastilha traseira', category: 'freios' },
  { key: 'tambor_disco', label: 'Tambor/disco de freio', category: 'freios' },
  { key: 'sistema_ar_freio', label: 'Sistema de ar do freio', category: 'freios' },
  { key: 'valvula_freio', label: 'Válvulas de freio', category: 'freios' },
  { key: 'freio_estacionamento', label: 'Freio de estacionamento', category: 'freios' },
  // Suspensao
  { key: 'molas', label: 'Molas / feixes', category: 'suspensao' },
  { key: 'amortecedores', label: 'Amortecedores', category: 'suspensao' },
  { key: 'bolsas_ar', label: 'Bolsas de ar (suspensão a ar)', category: 'suspensao' },
  { key: 'bucha_suspensao', label: 'Buchas da suspensão', category: 'suspensao' },
  { key: 'barra_estabilizadora', label: 'Barra estabilizadora', category: 'suspensao' },
  // Pneus
  { key: 'sulco_pneus', label: 'Profundidade de sulco (todos)', category: 'pneus' },
  { key: 'calibragem', label: 'Calibragem', category: 'pneus' },
  { key: 'desgaste_irregular', label: 'Desgaste irregular', category: 'pneus' },
  { key: 'estepe', label: 'Estepe', category: 'pneus' },
  // Motor
  { key: 'nivel_oleo', label: 'Nível de óleo do motor', category: 'motor' },
  { key: 'vazamento_oleo', label: 'Vazamento de óleo', category: 'motor' },
  { key: 'correias', label: 'Correias', category: 'motor' },
  { key: 'filtro_ar', label: 'Filtro de ar', category: 'motor' },
  { key: 'arrefecimento', label: 'Sistema de arrefecimento', category: 'motor' },
  { key: 'turbina', label: 'Turbina / intercooler', category: 'motor' },
  { key: 'escapamento', label: 'Escapamento / Arla32', category: 'motor' },
  // Embreagem/Transmissao
  { key: 'embreagem', label: 'Embreagem (acionamento)', category: 'embreagem' },
  { key: 'cambio_ruido', label: 'Ruído/folga no câmbio', category: 'transmissao' },
  { key: 'cardan', label: 'Cardã / cruzetas', category: 'transmissao' },
  { key: 'diferencial', label: 'Diferencial (vazamento/ruído)', category: 'transmissao' },
  // Direcao
  { key: 'alinhamento', label: 'Alinhamento / folga direção', category: 'direcao' },
  { key: 'bomba_direcao', label: 'Bomba de direção hidráulica', category: 'direcao' },
  { key: 'terminais', label: 'Terminais e barras de direção', category: 'direcao' },
  // Eletrica
  { key: 'bateria', label: 'Bateria (carga/terminais)', category: 'eletrica' },
  { key: 'alternador', label: 'Alternador', category: 'eletrica' },
  { key: 'iluminacao', label: 'Iluminação (faróis/setas/freio)', category: 'eletrica' },
  { key: 'painel_luzes', label: 'Luzes de painel / falhas', category: 'eletrica' },
  { key: 'chicote', label: 'Chicote elétrico visível', category: 'eletrica' },
  // 5a roda
  { key: 'quinta_roda', label: 'Lubrificação e trava da 5ª roda', category: '5a_roda' },
  { key: 'pino_rei', label: 'Pino rei (desgaste)', category: '5a_roda' },
  // Carroceria
  { key: 'chassi', label: 'Chassi / longarina (trincas)', category: 'carroceria' },
  { key: 'cabine_estrutura', label: 'Estrutura da cabine', category: 'carroceria' },
  { key: 'parabrisa', label: 'Para-brisa / vidros', category: 'carroceria' },
  { key: 'retrovisores', label: 'Retrovisores', category: 'carroceria' },
  { key: 'tacografo', label: 'Tacógrafo / cronotacógrafo', category: 'carroceria' },
];
