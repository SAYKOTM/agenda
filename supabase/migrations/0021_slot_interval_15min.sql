-- Baja la granularidad de la grilla de horarios de 30 a 15 minutos.
--
-- El motor de slots (supabase/functions/_shared/slotEngine.ts) siempre calculó la disponibilidad
-- real contra el instante exacto de fin de cada reserva (Temporal.Instant, sin redondear), pero
-- solo ofrecía candidatos alineados a `slot_interval_min`. Con la grilla en 30 min, un servicio de
-- duración irregular (p. ej. 75 min) que termina a las 11:15 dejaba un hueco muerto de 15 min: el
-- próximo candidato en la grilla era 11:30, no el instante real en que el profesional queda libre.
-- Bajar la grilla a 15 min (el mínimo común múltiplo práctico de las duraciones de servicio)
-- permite que el motor ofrezca 11:15 tal cual, sin cambios en la lógica de cómputo.
alter table tenants alter column slot_interval_min set default 15;

update tenants set slot_interval_min = 15 where slot_interval_min = 30;
