// ============================================================
// Configuración del servidor — lee variables de entorno
// ============================================================

export const config = {
  /** Puerto del servidor HTTP */
  PORT: parseInt(process.env.PORT ?? '3000', 10),

  /** URL base del catálogo DummyJSON */
  CATALOG_URL: process.env.CATALOG_URL ?? 'https://dummyjson.com',

  /**
   * Tiempo máximo de espera para cada consulta al catálogo (ms).
   * 5 000 ms (5 s): equilibrio entre tolerancia a latencia normal
   * del servicio externo (~200-500 ms) y no hacer esperar al usuario.
   */
  CATALOG_TIMEOUT_MS: parseInt(process.env.CATALOG_TIMEOUT_MS ?? '5000', 10),

  /**
   * Delay artificial para simular catálogo lento (ms).
   * Se agrega como query param `?delay=` a las peticiones.
   * 0 = sin delay.
   */
  CATALOG_DELAY_MS: parseInt(process.env.CATALOG_DELAY_MS ?? '0', 10),

  /** Máximo de productos por propuesta */
  MAX_PRODUCTS_PER_PROPOSE: 10,

  /** Largo máximo del nombre de participante */
  MAX_NAME_LENGTH: 30,

  /** Largo mínimo del nombre de participante */
  MIN_NAME_LENGTH: 1,
};
