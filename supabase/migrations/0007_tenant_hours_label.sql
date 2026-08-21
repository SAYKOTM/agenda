-- Texto libre de "horario de atención" para mostrar en el storefront público (p.ej. "Lun a Vie
-- 10:00–20:00 · Sáb 10:00–16:00"). Es solo un resumen editable a mano en fase 4 (Ajustes); el
-- horario real que usa el motor de slots sigue siendo availability_blocks por profesional.
alter table tenants add column hours_label text;

update tenants set hours_label = 'Lun a Vie 10:00–20:00 · Sáb 10:00–16:00' where slug = 'roble-barberia';
update tenants set hours_label = 'Mar a Sáb 09:30–19:30' where slug = 'lumiere-salon';
