-- =====================================================================
-- TruckOS — Seed DEMO completo
-- Roda DEPOIS do SETUP-COMPLETO.sql
-- Cria: 2 clientes, 4 veiculos, 5 pecas, 5 OS em fases diferentes,
-- 1 orcamento pendente, 1 plano de PM, conversas de WhatsApp demo
-- =====================================================================

-- Limpa dados demo anteriores (cuidado em prod!)
truncate table public.nps_responses cascade;
truncate table public.wa_messages cascade;
truncate table public.wa_conversations cascade;
truncate table public.quote_items cascade;
truncate table public.quotes cascade;
truncate table public.wo_parts cascade;
truncate table public.wo_sections cascade;
truncate table public.wo_labor_logs cascade;
truncate table public.wo_status_history cascade;
truncate table public.work_orders cascade;
truncate table public.part_requests cascade;
truncate table public.stock_moves cascade;
truncate table public.stock_balances cascade;
truncate table public.parts cascade;
truncate table public.pm_plans cascade;
truncate table public.contracts cascade;
truncate table public.vehicles cascade;
truncate table public.customer_contacts cascade;
truncate table public.customers cascade;

-- ===== CLIENTES =====
insert into public.customers (tenant_id, type, name, trade_name, document, email, payment_terms, tags)
select id, 'pj', 'Transportadora Modelo Ltda', 'Modelo', '12.345.678/0001-90', 'contato@modelo.com.br', 30,
       array['frota','vip']
from public.tenants order by created_at asc limit 1;

insert into public.customers (tenant_id, type, name, document, email, payment_terms, tags)
select id, 'pf', 'Joao da Silva Caminhoneiro', '123.456.789-00', 'joao.caminhoneiro@gmail.com', 0,
       array['autonomo']
from public.tenants order by created_at asc limit 1;

-- ===== CONTATOS =====
insert into public.customer_contacts (tenant_id, customer_id, name, role, phone_e164, whatsapp, can_approve)
select c.tenant_id, c.id, 'Carlos Silva', 'gestor_frota', '+5511999990000', true, true
from public.customers c where c.name like 'Transportadora%';

insert into public.customer_contacts (tenant_id, customer_id, name, role, phone_e164, whatsapp, can_approve)
select c.tenant_id, c.id, 'Joao da Silva', 'dono', '+5511988887777', true, true
from public.customers c where c.name like 'Joao da Silva%';

-- ===== VEICULOS =====
insert into public.vehicles (tenant_id, customer_id, plate, brand, model, year, vehicle_type, axles, odometer_km)
select c.tenant_id, c.id, 'ABC1D34', 'Scania', 'R450', 2022, 'cavalo', 3, 185000
from public.customers c where c.name like 'Transportadora%';

insert into public.vehicles (tenant_id, customer_id, plate, brand, model, year, vehicle_type, axles, odometer_km)
select c.tenant_id, c.id, 'XYZ5E67', 'Volvo', 'FH 540', 2023, 'cavalo', 3, 92000
from public.customers c where c.name like 'Transportadora%';

insert into public.vehicles (tenant_id, customer_id, plate, brand, model, year, vehicle_type, axles, odometer_km)
select c.tenant_id, c.id, 'DEF8G90', 'Mercedes', 'Actros 2651', 2021, 'cavalo', 3, 250000
from public.customers c where c.name like 'Transportadora%';

insert into public.vehicles (tenant_id, customer_id, plate, brand, model, year, vehicle_type, axles, odometer_km)
select c.tenant_id, c.id, 'JKL2M34', 'Volkswagen', 'Constellation 25.360', 2020, 'truck', 2, 320000
from public.customers c where c.name like 'Joao da Silva%';

-- ===== PECAS =====
insert into public.parts (tenant_id, sku, barcode, description, brand, category, unit, min_qty, max_qty, sale_price, location)
select id, 'DISCO-FREIO-001', '7891234500011', 'Disco de freio dianteiro Scania R450', 'TRW', 'freios', 'UN', 2, 10, 850.00, 'A-12'
from public.tenants order by created_at asc limit 1;

insert into public.parts (tenant_id, sku, barcode, description, brand, category, unit, min_qty, max_qty, sale_price, location)
select id, 'PASTILHA-001', '7891234500028', 'Pastilha de freio Scania R450 (jogo)', 'Bosch', 'freios', 'JG', 4, 20, 320.00, 'A-13'
from public.tenants order by created_at asc limit 1;

insert into public.parts (tenant_id, sku, description, brand, category, unit, min_qty, max_qty, sale_price, location)
select id, 'OLEO-MOTOR-15W40', 'Oleo motor diesel 15W40 sintetico 5L', 'Shell Rimula', 'lubrificantes', 'LT', 20, 100, 145.00, 'B-05'
from public.tenants order by created_at asc limit 1;

insert into public.parts (tenant_id, sku, description, brand, category, unit, min_qty, max_qty, sale_price, location)
select id, 'FILTRO-AR-001', 'Filtro de ar Scania R450', 'Mann', 'filtros', 'UN', 3, 15, 95.00, 'C-01'
from public.tenants order by created_at asc limit 1;

insert into public.parts (tenant_id, sku, description, brand, category, unit, min_qty, max_qty, sale_price, location)
select id, 'FILTRO-OLEO-001', 'Filtro de oleo Scania R450', 'Fram', 'filtros', 'UN', 5, 25, 55.00, 'C-02'
from public.tenants order by created_at asc limit 1;

-- ===== ESTOQUE INICIAL =====
insert into public.stock_balances (tenant_id, warehouse_id, part_id, qty)
select p.tenant_id, w.id, p.id,
       case p.sku
         when 'DISCO-FREIO-001' then 1   -- abaixo do minimo (alerta!)
         when 'PASTILHA-001' then 8
         when 'OLEO-MOTOR-15W40' then 45
         when 'FILTRO-AR-001' then 12
         when 'FILTRO-OLEO-001' then 20
       end
from public.parts p
cross join lateral (select id from public.warehouses where tenant_id = p.tenant_id limit 1) w;

-- ===== FORNECEDOR =====
insert into public.suppliers (tenant_id, name, cnpj, payment_terms, rating, notes)
select id, 'TruckParts Distribuidora', '98.765.432/0001-10', 30, 5, 'Entrega em 24h na regiao metropolitana'
from public.tenants order by created_at asc limit 1;

-- ===== ORDENS DE SERVICO =====
-- 1) Em recepcao (recem-chegou)
insert into public.work_orders (tenant_id, number, customer_id, vehicle_id, status, phase_entered_at, odometer_km, reported_issue, priority, promised_at)
select 1, 1,
       (select id from public.customers where name like 'Transportadora%'),
       (select id from public.vehicles where plate = 'ABC1D34'),
       'recepcao', now() - interval '15 minutes', 185320,
       'Motorista relata trepidação ao freiar em alta velocidade. Luz de ABS acesa no painel.',
       'alta', now() + interval '3 days'
from public.tenants order by created_at asc limit 1;

-- 2) Em diagnostico
insert into public.work_orders (tenant_id, number, customer_id, vehicle_id, status, phase_entered_at, odometer_km, reported_issue, priority)
select 2, 2,
       (select id from public.customers where name like 'Transportadora%'),
       (select id from public.vehicles where plate = 'XYZ5E67'),
       'diagnostico', now() - interval '4 hours', 92450,
       'Revisao periodica de 100.000 km. Trocar todos os filtros e oleo.',
       'normal'
from public.tenants order by created_at asc limit 1;

-- 3) Em execucao
insert into public.work_orders (tenant_id, number, customer_id, vehicle_id, status, phase_entered_at, odometer_km, reported_issue, priority, promised_at)
select 3, 3,
       (select id from public.customers where name like 'Joao da Silva%'),
       (select id from public.vehicles where plate = 'JKL2M34'),
       'em_execucao', now() - interval '6 hours', 320150,
       'Troca de embreagem e revisao do sistema de freios.',
       'normal', now() + interval '2 days'
from public.tenants order by created_at asc limit 1;

-- 4) Pronto
insert into public.work_orders (tenant_id, number, customer_id, vehicle_id, status, phase_entered_at, odometer_km, reported_issue, priority)
select 4, 4,
       (select id from public.customers where name like 'Transportadora%'),
       (select id from public.vehicles where plate = 'DEF8G90'),
       'pronto', now() - interval '1 hour', 250000,
       'Troca de oleo e filtros preventivos.',
       'normal'
from public.tenants order by created_at asc limit 1;

-- 5) Aguardando peca
insert into public.work_orders (tenant_id, number, customer_id, vehicle_id, status, phase_entered_at, odometer_km, reported_issue, priority, promised_at)
select 5, 5,
       (select id from public.customers where name like 'Joao da Silva%'),
       (select id from public.vehicles where plate = 'JKL2M34'),
       'aguardando_peca', now() - interval '2 days', 321000,
       'Mancal da roda traseira esquerda com folga. Necessita substituicao.',
       'alta', now() + interval '5 days'
from public.tenants order by created_at asc limit 1;

-- ===== HISTORICO DAS OS =====
insert into public.wo_status_history (tenant_id, work_order_id, from_status, to_status, at, note)
select wo.tenant_id, wo.id, null, wo.status, wo.phase_entered_at, 'OS criada via seed demo'
from public.work_orders wo;

-- Para OS 3 (em_execucao), adiciona historico de fases anteriores
insert into public.wo_status_history (tenant_id, work_order_id, from_status, to_status, at, note)
select wo.tenant_id, wo.id, 'recepcao', 'diagnostico', now() - interval '2 days', 'Iniciado diagnostico'
from public.work_orders wo where wo.number = 3;

insert into public.wo_status_history (tenant_id, work_order_id, from_status, to_status, at, note)
select wo.tenant_id, wo.id, 'diagnostico', 'orcamento', now() - interval '2 days' + interval '4 hours', 'Identificado embreagem queimada'
from public.work_orders wo where wo.number = 3;

insert into public.wo_status_history (tenant_id, work_order_id, from_status, to_status, at, note)
select wo.tenant_id, wo.id, 'orcamento', 'aguardando_aprovacao', now() - interval '2 days' + interval '5 hours', 'Orcamento enviado ao cliente'
from public.work_orders wo where wo.number = 3;

insert into public.wo_status_history (tenant_id, work_order_id, from_status, to_status, at, note)
select wo.tenant_id, wo.id, 'aguardando_aprovacao', 'aguardando_peca', now() - interval '1 day' + interval '2 hours', 'Aprovado pelo cliente'
from public.work_orders wo where wo.number = 3;

insert into public.wo_status_history (tenant_id, work_order_id, from_status, to_status, at, note)
select wo.tenant_id, wo.id, 'aguardando_peca', 'em_execucao', now() - interval '6 hours', 'Pecas chegaram, execucao iniciada'
from public.work_orders wo where wo.number = 3;

-- ===== ORCAMENTO para OS #3 (em_execucao, ja aprovado) =====
insert into public.quotes (tenant_id, work_order_id, version, status, subtotal, discount, total, sent_at, approved_at, valid_until)
select wo.tenant_id, wo.id, 1, 'approved', 2850.00, 0, 2850.00,
       now() - interval '2 days' + interval '5 hours',
       now() - interval '1 day' + interval '2 hours',
       (now() - interval '2 days' + interval '5 hours')::date + 7
from public.work_orders wo where wo.number = 3;

insert into public.quote_items (tenant_id, quote_id, kind, description, qty, unit_price, option_group, status)
select q.tenant_id, q.id, 'part', 'Kit embreagem Scania R450', 1, 1850.00, 'completo', 'approved'
from public.quotes q where q.work_order_id = (select id from public.work_orders where number = 3);

insert into public.quote_items (tenant_id, quote_id, kind, description, qty, unit_price, option_group, status)
select q.tenant_id, q.id, 'labor', 'Mao de obra troca embreagem (8h)', 8, 120.00, 'completo', 'approved'
from public.quotes q where q.work_order_id = (select id from public.work_orders where number = 3);

insert into public.quote_items (tenant_id, quote_id, kind, description, qty, unit_price, option_group, status)
select q.tenant_id, q.id, 'part', 'Revisao sistema de freios', 1, 80.00, 'completo', 'approved'
from public.quotes q where q.work_order_id = (select id from public.work_orders where number = 3);

-- ===== ORCAMENTO pendente para OS #2 (diagnostico) =====
insert into public.quotes (tenant_id, work_order_id, version, status, subtotal, discount, total, valid_until)
select wo.tenant_id, wo.id, 1, 'sent', 565.00, 50.00, 515.00, (now() + interval '5 days')::date
from public.work_orders wo where wo.number = 2;

insert into public.quote_items (tenant_id, quote_id, kind, description, qty, unit_price, option_group, status)
select q.tenant_id, q.id, 'part', 'Oleo motor Shell Rimula 15W40 5L', 3, 145.00, 'completo', 'pending'
from public.quotes q where q.work_order_id = (select id from public.work_orders where number = 2);

insert into public.quote_items (tenant_id, quote_id, kind, description, qty, unit_price, option_group, status)
select q.tenant_id, q.id, 'part', 'Filtro de ar Scania R450', 1, 95.00, 'completo', 'pending'
from public.quotes q where q.work_order_id = (select id from public.work_orders where number = 2);

insert into public.quote_items (tenant_id, quote_id, kind, description, qty, unit_price, option_group, status)
select q.tenant_id, q.id, 'part', 'Filtro de oleo Scania R450', 1, 55.00, 'completo', 'pending'
from public.quotes q where q.work_order_id = (select id from public.work_orders where number = 2);

insert into public.quote_items (tenant_id, quote_id, kind, description, qty, unit_price, option_group, status)
select q.tenant_id, q.id, 'labor', 'Mao de obra revisao completa', 2, 120.00, 'completo', 'pending'
from public.quotes q where q.work_order_id = (select id from public.work_orders where number = 2);

-- ===== PLANO DE PM =====
insert into public.pm_plans (tenant_id, vehicle_id, name, interval_km, next_due_km, next_due_at, status)
select v.tenant_id, v.id, 'Revisao 200.000 km', 10000, 195000, current_date + 7, 'proximo'
from public.vehicles v where v.plate = 'ABC1D34';

insert into public.pm_plans (tenant_id, vehicle_id, name, interval_km, next_due_km, next_due_at, status)
select v.tenant_id, v.id, 'Revisao 100.000 km', 10000, 100000, current_date - 3, 'vencido'
from public.vehicles v where v.plate = 'XYZ5E67';

insert into public.pm_plans (tenant_id, vehicle_id, name, interval_km, next_due_km, next_due_at, status)
select v.tenant_id, v.id, 'Revisao 330.000 km', 10000, 330000, current_date + 60, 'ok'
from public.vehicles v where v.plate = 'JKL2M34';

-- ===== CONVERSA WHATSAPP DEMO =====
insert into public.wa_conversations (tenant_id, contact_phone, contact_name, customer_id, contact_id, status, last_message_at)
select c.tenant_id, '+5511999990000', 'Carlos Silva',
       c.id, (select id from public.customer_contacts where phone_e164 = '+5511999990000' limit 1),
       'aberta', now() - interval '20 minutes'
from public.customers c where c.name like 'Transportadora%';

insert into public.wa_messages (tenant_id, conversation_id, direction, kind, body, status, created_at)
select c.tenant_id, (select id from public.wa_conversations where contact_phone = '+5511999990000' limit 1),
       'in', 'text', 'Ola, voces conseguiram ver o orcamento da OS do Volvo?',
       'read', now() - interval '1 hour';

insert into public.wa_messages (tenant_id, conversation_id, direction, kind, body, status, is_automated, created_at)
select c.tenant_id, (select id from public.wa_conversations where contact_phone = '+5511999990000' limit 1),
       'out', 'text', 'Ola Carlos! Ja enviamos. O valor total ficou R$ 515 com vencimento em 5 dias.',
       'delivered', true, now() - interval '55 minutes';

insert into public.wa_messages (tenant_id, conversation_id, direction, kind, body, status, created_at)
select c.tenant_id, (select id from public.wa_conversations where contact_phone = '+5511999990000' limit 1),
       'in', 'text', 'Perfeito! Vou aprovar agora pelo link.',
       'read', now() - interval '20 minutes';

-- ===== FATURAS DEMO =====
insert into public.invoices (tenant_id, customer_id, kind, work_order_ids, amount, due_date, status, payment_method, paid_at, paid_amount)
select c.tenant_id, c.id, 'os_avulsa', array[(select id from public.work_orders where number = 4)],
       180.00, current_date - 5, 'paga', 'pix', now() - interval '4 days', 180.00
from public.customers c where c.name like 'Transportadora%';

insert into public.invoices (tenant_id, customer_id, kind, work_order_ids, amount, due_date, status)
select c.tenant_id, c.id, 'os_avulsa', array[(select id from public.work_orders where number = 5)],
       1850.00, current_date + 15, 'aberta'
from public.customers c where c.name like 'Joao da Silva%';

insert into public.invoices (tenant_id, customer_id, kind, work_order_ids, amount, due_date, status)
select c.tenant_id, c.id, 'os_avulsa', array[(select id from public.work_orders where number = 1)],
       1200.00, current_date - 2, 'vencida'
from public.customers c where c.name like 'Transportadora%';

-- ===== CONTAS A PAGAR =====
insert into public.payables (tenant_id, supplier_id, category, description, amount, due_date, status)
select t.id, (select id from public.suppliers limit 1), 'pecas',
       'Reposicao de estoque - discos de freio', 4250.00, current_date + 10, 'aberta'
from public.tenants t order by created_at asc limit 1;

insert into public.payables (tenant_id, category, description, amount, due_date, status)
select id, 'fixo', 'Aluguel do galpao', 3500.00, current_date + 5, 'aberta'
from public.tenants order by created_at asc limit 1;

insert into public.payables (tenant_id, category, description, amount, due_date, status)
select id, 'energia', 'Conta de energia', 850.00, current_date - 7, 'vencida'
from public.tenants order by created_at asc limit 1;

-- ===== NPS =====
insert into public.nps_responses (tenant_id, work_order_id, customer_id, score, comment, responded_at)
select wo.tenant_id, wo.id, wo.customer_id, 10, 'Atendimento excelente, servico rapido!',
       now() - interval '15 days'
from public.work_orders wo where wo.number = 4;

insert into public.nps_responses (tenant_id, work_order_id, customer_id, score, comment, responded_at)
select wo.tenant_id, wo.id, wo.customer_id, 9, 'Bom, mas demorou um pouco', now() - interval '30 days'
from public.work_orders wo where wo.number = 3;

insert into public.nps_responses (tenant_id, work_order_id, customer_id, score, comment, responded_at)
select wo.tenant_id, wo.id, wo.customer_id, 6, 'Esperava mais agilidade', now() - interval '45 days'
from public.work_orders wo limit 1;

-- Resumo final
select
  (select count(*) from public.customers) as clientes,
  (select count(*) from public.vehicles) as veiculos,
  (select count(*) from public.parts) as pecas,
  (select count(*) from public.work_orders) as os,
  (select count(*) from public.quotes) as orcamentos,
  (select count(*) from public.invoices) as faturas,
  (select count(*) from public.nps_responses) as nps;