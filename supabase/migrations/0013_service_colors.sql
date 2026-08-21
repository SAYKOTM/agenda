-- Fase de personalización visual: color por servicio, usado en la Agenda para pintar cada
-- bloque de cita con el color del servicio correspondiente (ver componente PanelAgenda).

alter table services add column color text not null default '#4F46E5' check (color ~ '^#[0-9a-fA-F]{6}$');
