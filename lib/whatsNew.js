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
    version: '2026-06-15',
    date: '15 Junio 2026',
    title: 'Unidad de medida en materia prima',
    pages: [
      {
        icon: '📏',
        title: 'Nuevo: editar la unidad de medida',
        roles: ['*'],
        body: 'En Config → Productos, cuando edites una materia prima vas a ver un nuevo bloque amber con la unidad (u / g / kg / ml / L) y el tamaño base. Antes la unidad estaba escondida en la base de datos y solo el owner podía cambiarla.',
      },
      {
        icon: '🚨',
        title: '¿Por qué se agregó?',
        roles: ['*'],
        body: 'Encontramos que varios costos estaban cargados como "por gramo" cuando en realidad eran "por kg":',
        items: [
          'Pollo Parrilla: marcaba $1,746/kg (real ~$5-8/kg)',
          'Papa Congelada: $840/kg (real ~$2-4/kg)',
          'Café en Granos: $146/kg (real ~$8-20/kg)',
          'Toddy: $22.40/kg',
        ],
        cta: 'Esos costos inflados rompen el margen calculado de las recetas (Hamburguesa, Nuggets, etc.) y los reportes del Negocio.',
      },
      {
        icon: '✅',
        title: 'Cómo se ve',
        roles: ['*'],
        body: 'En la tabla de Productos hay columna nueva "Unidad". Si una materia prima tiene costo sospechoso (más de REF 50 por kg) aparece 🚨 en rojo para que lo notes a la vista.',
        items: [
          'Click en "Editar" del producto',
          'Bloque amber con dropdown de unidad (u/g/kg/ml/L)',
          'Helper en vivo: si tipeás "0.84" con unidad "g" te avisa "🚨 REF 840/kg — ¿es por gramo?"',
          'Cambiá la unidad o reajustá el costo y guardá',
        ],
      },
      {
        icon: '🎯',
        title: 'Qué hacer ahora',
        roles: ['admin', 'gerente', 'owner'],
        body: 'Yusmelly / Jose Gregorio: revisen los productos marcados con 🚨 (rojo) en Config → Productos. Búsqueda por categoría "Materia Prima" los junta.',
        cta: 'Si no estás seguro de un costo, dejalo y avisamos al owner. NO toques productos sin 🚨 — esos están OK.',
      },
    ],
  },
  {
    version: '2026-06-09',
    date: '9 Junio 2026',
    title: 'Gastos rediseñado',
    pages: [
      {
        icon: '📊',
        title: 'Nuevo tab "Gastos"',
        roles: ['admin', 'gerente', 'owner'],
        body: 'Lo que antes era "Costos" ahora es "Gastos" y tiene mismo layout que el de Futuros Complex. Entrás y ves dos secciones adentro:',
        items: [
          'Resumen: dashboard de gastos + form para agregar',
          'Costos: lo que estaba antes (márgenes y rentabilidad por producto)',
        ],
      },
      {
        icon: '➕',
        title: 'Registrar un gasto manual',
        roles: ['admin', 'gerente', 'owner'],
        body: 'Ya podés cargar nómina, servicios (luz, agua, internet, gas), mantenimiento, activos y demás. Botón "Nuevo Gasto" arriba a la derecha. Completás tipo (Fijo/Variable), categoría, descripción, monto, método de pago y fecha.',
        cta: 'El monto va en REF y abajo te muestra la conversión a Bs con la tasa del día.',
      },
      {
        icon: '🏷️',
        title: '5 categorías oficiales',
        roles: ['admin', 'gerente', 'owner'],
        body: 'Las categorías quedaron unificadas en 5:',
        items: [
          'Materia Prima / Insumos (auto desde cada restock o pago a proveedor)',
          'Nómina / Sueldos',
          'Servicios (Luz / Agua / Internet / Gas)',
          'Mantenimiento / Equipos / Otros',
          'Activos (equipos nuevos: freezer, vitrina, tablet, etc.)',
        ],
      },
      {
        icon: '📅',
        title: 'Filtros y comparativas',
        roles: ['admin', 'gerente', 'owner'],
        body: 'Filtrá por periodo (Hoy / Semana / Mes / Año / Personalizado) con flechas ◀▶ para navegar entre meses. También por tipo (Fijo/Variable) y categoría.',
        items: [
          '4 KPI cards arriba: Total / Promedio Diario / Fijos / Variables',
          'Comparativas vs mes anterior + vs mismo mes año pasado',
          'Desglose por categoría y por método de pago',
          'Top gastos por categoría con detalle',
          'Toggle Dashboard ↔ Lista (la lista permite editar y eliminar)',
        ],
      },
      {
        icon: '📜',
        title: 'Histórico migrado',
        roles: ['admin', 'gerente', 'owner'],
        body: 'Cargué ~886 gastos desde marzo 2025 (~REF 43.5K) para que veas todo el historial. En la lista cada fila tiene un badge "Origen":',
        items: [
          'Auto: lo genera el sistema con cada restock o pago a proveedor',
          'Manual: lo cargás vos desde el form',
          'Histórico: importado de antes (legacy)',
        ],
        cta: 'Botón "Exportar CSV" arriba si necesitás bajar el detalle filtrado.',
      },
    ],
  },
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
