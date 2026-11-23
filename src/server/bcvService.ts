interface DolarApiResponse {
  moneda: string;
  fuente: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fechaActualizacion: string;
}

/**
 * Consulta la tasa oficial del Banco Central de Venezuela (BCV)
 * desde el servicio público de DolarApi Venezuela (sin dependencia SQL).
 */
export async function fetchOfficialBcvRate(): Promise<{ rate: number; date: string; source: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Distribuidora-ROECA-POS/1.0',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as DolarApiResponse;
      if (data && typeof data.promedio === 'number' && data.promedio > 0) {
        let dateStr = new Date().toISOString().split('T')[0];
        if (data.fechaActualizacion) {
          try {
            dateStr = new Date(data.fechaActualizacion).toISOString().split('T')[0];
          } catch {
            // keep today
          }
        }

        return {
          rate: Math.round(data.promedio * 10000) / 10000,
          date: dateStr,
          source: 'Banco Central de Venezuela (BCV Oficial)',
        };
      }
    }
  } catch (err) {
    console.warn('Advertencia al consultar API oficial BCV:', err);
  }

  return null;
}
