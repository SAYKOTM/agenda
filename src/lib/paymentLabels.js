export function paymentMethodLabel(method, gateway) {
  if (method === 'efectivo') return 'Efectivo en el local';
  if (method === 'transferencia') return 'Transferencia bancaria';
  if (method === 'online') return `Pago online con ${gateway || 'pasarela'}`;
  return method;
}
