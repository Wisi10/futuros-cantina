// Releases del POS cantina. La PRIMERA del array es la que se le muestra al
// staff que aún no la haya visto. Persistencia en localStorage (cantina usa
// anon, no Supabase Auth) con la key `cantina_lastSeenWhatsNew`.
//
// Estructura:
//   - version: identificador único (YYYY-MM-DD-X). Si cambia, se reabre el modal.
//   - title:   título del release
//   - date:    fecha visible
//   - pages:   array de páginas a swipeable. Cada página:
//       icon:  emoji
//       title: titulo de la página
//       roles: ['*'] = todos. ['admin','owner'] = solo gerentes. ['staff'] solo staff.
//              Si el rol del usuario no está, la página se omite.
//       body:  string corto (puede tener \n)
//       items: bullets opcionales
//       cta:   "💡 Probalo en X" opcional

export const WHATS_NEW = [
  {
    version: '2026-05-19',
    date: '19 Mayo 2026',
    title: 'Mejoras de mayo',
    pages: [
      {
        icon: '🔍',
        title: 'Buscar clientes con espacio',
        roles: ['*'],
        body: 'Ya podés escribir "Mauro Lun" (nombre + apellido) y el buscador lo encuentra. Antes solo aceptaba un nombre y rompía al poner espacio.',
      },
      {
        icon: '🛒',
        title: 'Buscador global de productos',
        roles: ['*'],
        body: 'Buscar dentro de una categoría (ej. Bebida) ahora busca en TODAS. Si está en Snacks, aparece igual. La categoría se ve como subtítulo chiquito.',
      },
      {
        icon: '📊',
        title: 'Dashboard en vivo no tapa los productos',
        roles: ['*'],
        body: 'En tablet, al desplegar el dashboard ya no se come el grid de productos. Tope 40% de la pantalla con scroll interno; el botón queda fijo arriba.',
      },
      {
        icon: '💳',
        title: 'Tarjeta sin referencia',
        roles: ['*'],
        body: 'El método "Datafono" pasó a llamarse "Tarjeta" y ya no pide número de referencia (el comprobante físico del POS basta).',
      },
      {
        icon: '💰',
        title: 'Crédito por cliente con tope configurable',
        roles: ['*'],
        body: 'Al elegir "Crédito" en una venta:',
        items: [
          'Si el cliente ya está asociado, no te pide buscarlo de nuevo',
          'Te muestra "Disponible $X" (= límite − deuda) en vivo',
          'Si excede, el botón Confirmar se bloquea con la razón',
          'El owner puede subir el límite por cliente desde el perfil (default $50)',
        ],
        cta: 'En el perfil del cliente: sección "Límite de crédito" → Cambiar.',
      },
      {
        icon: '✏️',
        title: 'Staff puede asignar descuento y agregar recetas',
        roles: ['staff', 'gerente', 'admin', 'owner'],
        body: 'Antes solo el gerente podía editar el descuento del cliente o tocar recetas. Ahora staff también puede. (El límite de crédito sigue siendo del owner).',
      },
      {
        icon: '🪙',
        title: 'Puntos solo al pagar la deuda',
        roles: ['*'],
        body: 'Antes el cliente acumulaba puntos al abrirle un crédito (sin pagar). Ahora los puntos se acreditan cuando paga el crédito (proporcional al monto pagado).',
      },
      {
        icon: '🧾',
        title: 'Pago custom de deudas (FIFO)',
        roles: ['*'],
        body: 'En el perfil del cliente: botón "💰 Ingresar pago" en el bloque amarillo de créditos. Entrás un monto y el sistema lo distribuye al crédito más viejo primero. Atajos 50% / Todo.',
        cta: 'Útil cuando un cliente paga "lo que pueda" sin elegir qué crédito.',
      },
      {
        icon: '📦',
        title: 'Materia prima con peso/volumen',
        roles: ['staff', 'gerente', 'admin', 'owner'],
        body: 'Carne molida, leche, harina ahora pueden tener tamaño físico (1 kg, 500 g, etc.).',
        items: [
          'Inventario → Materia Prima → columna "Tamaño" editable inline',
          'Registrar entrada: si el producto tiene tamaño, podés entrar peso/vol total y el sistema calcula las unidades',
          'Si no tiene tamaño, lo setteás ahí mismo y queda guardado',
        ],
      },
      {
        icon: '🏷️',
        title: 'Registrar entrada — costo TOTAL',
        roles: ['staff', 'gerente', 'admin', 'owner'],
        body: 'Antes entrabas costo por unidad. Ahora entrás el costo total del lote y el sistema lo divide. Más natural cuando comprás "una caja por $X".',
      },
      {
        icon: '🚚',
        title: 'Proveedores: dropdown de existentes',
        roles: ['staff', 'gerente', 'admin', 'owner'],
        body: 'Al registrar entrada, el campo Proveedor ahora es un dropdown con los proveedores que ya usaste. Sin opción "+ Nuevo" si necesitas agregar uno fresco.',
      },
      {
        icon: '🧮',
        title: 'Recetas inline en inventario',
        roles: ['staff', 'gerente', 'admin', 'owner'],
        body: 'Productos con receta (ej. Hamburguesa) muestran sus ingredientes debajo del nombre en la tabla. Ej. "125g carne, 1 pan, 30g cebolla". Ya no necesitás abrir cada uno.',
      },
      {
        icon: '⚠️',
        title: 'Razones de stock separadas por entrada/salida',
        roles: ['*'],
        body: 'Cuando ajustás stock, las razones ahora se separan según el signo:',
        items: [
          'Entrada (+): Devolución, Donación recibida, Corrección encontré más',
          'Salida (−): Merma, Pérdida, Robo, Vencimiento, Corrección encontré menos',
        ],
      },
      {
        icon: '📅',
        title: 'Calendario con duración visual',
        roles: ['*'],
        body: 'En el calendario, cada reserva se ve más alta si dura más. Barra de color al borde izquierdo por tipo (alquiler azul, cumple rosa, academia verde, torneo púrpura, evento ámbar).',
      },
      {
        icon: '💵',
        title: 'Caja flujo de dinero abierto a staff',
        roles: ['staff'],
        body: 'En Caja, ahora ves "Entró / Vuelto / Neto" + Cash en gaveta por moneda (antes era admin-only). Te ayuda a cuadrar el turno.',
      },
      {
        icon: '🎯',
        title: 'Umbral de stock bajo a 10',
        roles: ['*'],
        body: 'El default para "stock bajo" pasó de 5 a 10 unidades. Más margen para reordenar antes de quedarse sin nada.',
      },
    ],
  },
];

export const LATEST = WHATS_NEW[0];
