-- =====================================================================
-- TruckOS — 008_seed.sql
-- Templates globais e dados minimos
-- =====================================================================

insert into public.message_templates (tenant_id, event, body, delay_minutes) values
(null, 'wo_created', 'Ola {{cliente}}, recebemos seu veiculo {{placa}} na {{oficina}}. OS #{{numero}}. Acompanhe ao vivo: {{link_acompanhamento}}', 0),
(null, 'quote_sent', '{{cliente}}, segue o orcamento da OS #{{numero}}. Valor: R$ {{total}}. Aprove pelo link: {{link_aprovacao}}', 0),
(null, 'quote_reminder', '{{cliente}}, seu orcamento da OS #{{numero}} ainda espera aprovacao. Link: {{link_aprovacao}}', 0),
(null, 'approved', 'Orcamento aprovado! Servico da OS #{{numero}} iniciara em breve. Previsao: {{previsao}}.', 0),
(null, 'part_arrived', 'Pecas chegaram para a OS #{{numero}}. Servico iniciando.', 0),
(null, 'wo_ready', '{{cliente}}, seu {{veiculo}} (placa {{placa}}) esta pronto! Total: R$ {{total}}. Pagar: {{link_pgto}}', 0),
(null, 'wo_delivered', 'Obrigado pela confianca! NF e certificado de garantia em anexo.', 0),
(null, 'nps', 'De 0 a 10, quanto recomenda a {{oficina}}? Sua opniao e importante.', 1440),
(null, 'pm_due', 'A revisao dos {{km}} km do veiculo {{placa}} esta proxima. Quer agendar?', 0),
(null, 'billing_due', '{{cliente}}, fatura {{numero}} vence em {{dias}} dias. Pagar: {{link_pgto}}', 0),
(null, 'billing_overdue', '{{cliente}}, fatura {{numero}} em atraso ({{dias}} dias). Regularize: {{link_pgto}}', 0);

-- Catalogo semente de servicos padrao (F2: mover para tabela service_catalog)
-- Mantido em JSON nas settings do tenant; exemplo abaixo.