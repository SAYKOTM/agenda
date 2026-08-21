import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const initialState = {
  loading: true,
  error: null,
  tenant: null,
  categories: [], // [{ id, name, services: [...] }]
  professionals: [],
  paymentMethods: [], // [{ method, gateway }]
  bankAccount: null,
  redirectSlug: null, // el salón cambió de slug (ver Ajustes del panel): slug nuevo a donde navegar
};

// Trae todo lo que el flujo público necesita para un tenant, en un solo hook. No hay estado
// de servidor compartido más allá de esto: cada página que lo necesita lo vuelve a pedir (los
// datos de catálogo cambian poco y esto evita tener que introducir una capa de cache global
// para la fase 2).
export function useTenantData(slug) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let cancelled = false;
    setState(initialState);

    async function load() {
      try {
        await loadImpl();
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: e.message || 'error_desconocido' }));
      }
    }

    async function loadImpl() {
      const { data: tenant, error: tenantError } = await supabase.from('tenants').select('*').eq('slug', slug).maybeSingle();
      if (cancelled) return;
      if (tenantError) return setState((s) => ({ ...s, loading: false, error: tenantError.message }));
      if (!tenant) {
        // el salón puede haber cambiado de slug en Ajustes (fase 4): antes de dar por perdido el
        // link, revisa si el slug pedido es uno anterior y redirige al actual.
        const { data: renamed } = await supabase.from('tenants').select('slug').contains('previous_slugs', [slug]).maybeSingle();
        if (cancelled) return;
        if (renamed) return setState((s) => ({ ...s, loading: false, redirectSlug: renamed.slug }));
        return setState((s) => ({ ...s, loading: false, error: 'not_found' }));
      }

      const [categoriesRes, professionalsRes, proServicesRes, paymentMethodsRes, bankRes] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name, sort_order, services(id, name, description, duration_min, price_clp, buffer_before_min, buffer_after_min, deposit_required, deposit_amount_clp, active, sort_order)')
          .eq('tenant_id', tenant.id)
          .order('sort_order'),
        supabase.from('professionals').select('id, name, role_title, initials, avatar_url').eq('tenant_id', tenant.id).eq('active', true),
        supabase.from('professional_services').select('professional_id, service_id'),
        supabase.from('tenant_payment_methods').select('method, gateway').eq('tenant_id', tenant.id).eq('enabled', true),
        supabase.from('tenant_bank_accounts').select('holder, bank, account_type, account_number, rut, notice_email').eq('tenant_id', tenant.id).maybeSingle(),
      ]);
      if (cancelled) return;

      const firstError = [categoriesRes, professionalsRes, proServicesRes, paymentMethodsRes].find((r) => r.error)?.error;
      if (firstError) return setState((s) => ({ ...s, loading: false, error: firstError.message }));

      const categories = (categoriesRes.data || [])
        .map((c) => ({
          ...c,
          services: (c.services || []).filter((s) => s.active).sort((a, b) => a.sort_order - b.sort_order),
        }))
        .filter((c) => c.services.length > 0);

      const proServiceMap = new Map();
      for (const row of proServicesRes.data || []) {
        if (!proServiceMap.has(row.professional_id)) proServiceMap.set(row.professional_id, new Set());
        proServiceMap.get(row.professional_id).add(row.service_id);
      }
      const professionals = (professionalsRes.data || []).map((p) => ({ ...p, serviceIds: proServiceMap.get(p.id) || new Set() }));

      setState({
        loading: false,
        error: null,
        tenant,
        categories,
        professionals,
        paymentMethods: paymentMethodsRes.data || [],
        bankAccount: bankRes.data || null,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
