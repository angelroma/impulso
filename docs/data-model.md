# Definición de datos y permisos de Impulso

La primera versión de **Impulso** usará una base de datos compartida con separación por dominio, espacio, persona y recurso. Esta especificación define columnas, relaciones, permisos, operaciones y criterios de aceptación. Es una definición lista para preparar migraciones; todavía no se ha aplicado a Supabase.

Cada usuario se identificará con Google. **@Impulso** seleccionará una operación autorizada, conservando por separado la cuenta que la ejecuta y la persona a la que corresponde la información.

## Implementation language

All code and implementation artifacts created for Impulso must be written in English. This includes source code, identifiers, schemas, tables, columns, views, functions, procedures, triggers, policies, constraints, indexes, migrations, storage buckets, API endpoints, tool names, roles, enum and state values, configuration, file and folder names, comments, docstrings, tests, logs, error codes, technical documentation, interface text and system-generated messages.

Use English snake_case for PostgreSQL identifiers and enum/state values. Follow the framework's naming conventions for code while keeping all names in English. Keep the brand names Impulso and @Impulso unchanged.

User-provided names, aliases, descriptions, notes and documents must retain their original language and content. This rule does not require translating user data. System-generated defaults must be in English, including the initial self alias "me".

## Decisiones de la primera versión

### Implementation boundary

Application operations, authorization and business rules belong in TypeScript Supabase Edge Functions. Custom PostgreSQL functions, procedures and application triggers are not part of the current model. All three local migrations are applied: the original remains historical, the second removed its eight custom functions and 93 triggers, and the third adds the limited backend role. Tables, native constraints, indexes, RLS and privileges remain. Google sign-in, the Edge Function foundation, the local MCP endpoint and transactional onboarding are implemented locally. OAuth-capable MCP clients initiate sign-in and consent; they collect confirmed onboarding values in conversation and call the same TypeScript service. The authorization screen is served by the `impulso-auth` Edge Function, with no separate web server. Finance/Health operations, sharing, files and purge execution remain pending. Ordinary direct client access remains denied. The logical operation names below are application contracts, not SQL RPCs.

| Decisión | Regla |
| --- | --- |
| Identidad | Supabase Auth administra las cuentas; el inicio de sesión permitido será Google. |
| Personas | Un perfil pertenece a un espacio y puede existir sin cuenta. Una misma persona real puede tener fichas separadas en distintos espacios; no se fusionan automáticamente. |
| Espacios | El onboarding crea un espacio personal por cuenta. La cuenta puede participar en otros espacios mediante una invitación aceptada. |
| Permisos | La ficha básica, cada libro de Finanzas y los datos de Salud de cada persona tienen permisos independientes. |
| Propiedad | Cada espacio y cada recurso con ACL conserva exactamente un propietario activo. La transferencia se ofrece, se acepta con la sesión del destinatario y se confirma atómicamente. |
| Compartir | Se comparte con cuentas ya registradas y verificadas. La invitación aparece en Impulso; esta versión no envía correos. |
| Dinero | Cada libro tiene una moneda explícita. No se realizan conversiones entre monedas. |
| Conservación | Archivar conserva el historial. Anular un movimiento financiero cambia su efecto en el saldo. La purga definitiva requiere un procedimiento administrativo separado y confirmación. |
| Extensión | El módulo future queda como reserva conceptual; se crea cuando exista un módulo concreto. |

Estas decisiones son el alcance elegido para empezar. Las ampliaciones posteriores deberán conservar la separación de permisos.

## Organización y relaciones

| Esquema | Tablas o contenido |
| --- | --- |
| auth | Cuentas y sesiones administradas por Supabase; no se modifica su estructura. |
| core | workspaces, workspace_members, people, person_user_links, person_access, person_aliases, identity_link_requests, ownership_transfer_requests |
| finance | books, accounts, transactions, budgets, book_access, files |
| health | records, medications, appointments, lab_results, person_access, files |
| api | Operaciones específicas para @Impulso; no contiene tablas de negocio. |
| audit | events |
| private | operation_receipts and purge_requests; no custom database functions |

Una cuenta puede pertenecer a varios espacios y tener acceso a varias personas. Una persona pertenece a un solo espacio. Un libro contiene cuentas, movimientos y presupuestos. Salud agrupa sus registros por persona. Los adjuntos pertenecen a un recurso concreto.

Todas las relaciones entre recursos de negocio incluyen el espacio. Las de Salud incluyen también la persona; las de Finanzas incluyen el libro cuando corresponda. Se impide asociar una fila con una persona, cuenta o recurso de otro espacio.

## Tipos y columnas comunes

Los identificadores serán **uuid**; los instantes, **timestamptz**; las fechas sin hora, **date**; el dinero, **numeric(20,4)**. Los importes viajan como cadenas decimales para evitar redondeo por números flotantes. Antes de convertir a numeric y calcular el hash del recibo, el servidor valida la cadena original: formato decimal inequívoco, sin exponentes, NaN o infinitos, hasta 16 dígitos enteros y como máximo los decimales admitidos por la moneda (nunca más de cuatro). Se rechaza el exceso de precisión; no se redondea silenciosamente. La base impide valores no finitos y exige precisión compatible con el libro. Los roles y estados serán text con CHECK de valores admitidos.

La zona horaria se selecciona durante el onboarding, se valida como zona IANA y se guarda en el espacio. Los instantes se almacenan en UTC. Una fecha médica desconocida permanece vacía; la fecha de creación no se presenta como fecha del evento.

El conjunto común **C** se aplica a people, books, accounts, budgets y las cuatro tablas de registros de Salud:

| Columna | Tipo y regla |
| --- | --- |
| id | uuid, PK, generado por el servidor |
| workspace_id | uuid obligatorio, FK a core.workspaces.id, inmutable |
| created_at | timestamptz obligatorio, fecha del servidor |
| updated_at | timestamptz obligatorio, fecha del servidor |
| created_by_user_id | uuid, FK Auth; obligatorio al crear, nullable únicamente tras baja de la cuenta |
| updated_by_user_id | uuid, FK Auth; cuenta de la última escritura, nullable tras baja o mantenimiento autorizado |
| version | integer obligatorio, inicial 1, mayor que cero; aumenta con cada modificación |
| archived_at | timestamptz nullable; vacío mientras está activo |
| archived_by_user_id | uuid nullable; actor del archivado; vacío si archived_at está vacío |

workspaces usa C sin workspace_id. Cada tabla de C tendrá UNIQUE(workspace_id,id), salvo workspaces. Los actores se obtienen de la sesión y nunca de parámetros del modelo.

Las FK de recursos y destinatarios usan ON DELETE RESTRICT. Las FK de actores históricos usan ON DELETE SET NULL para conservar el registro durante una baja controlada. Las comprobaciones de estados permiten que un actor histórico quede nulo tras esa baja; no exigen que desaparezcan también las fechas de archivo, revocación o anulación. Las PK, UNIQUE y CHECK protegen las filas; los invariantes que abarcan varias filas requieren transacción y bloqueo.

Los textos obligatorios rechazan valores vacíos tras recortar espacios. Los nombres admiten hasta 200 caracteres. No se utiliza un JSON libre como sustituto de las columnas o reglas de acceso.

## Tablas de Core

### core.workspaces

Columnas de C sin workspace_id, más:

| Columna | Definición |
| --- | --- |
| name | text obligatorio, 1 a 200 caracteres |
| timezone | text obligatorio, zona IANA validada |

UNIQUE(created_by_user_id) establece un espacio inicial por cuenta creadora; el historial del creador no concede permisos. El propietario efectivo está en workspace_members. Crear el espacio, su membresía propietaria y la persona propia constituye una sola transacción. Dos llamadas concurrentes al onboarding devuelven el mismo espacio inicial.

Un espacio archivado permite lectura del historial con permisos vigentes y bloquea escrituras de negocio. Archivar todo el espacio exige que los recursos activos hayan sido archivados por sus propietarios; el propietario del espacio no puede hacerlo sobre módulos ajenos.

### core.workspace_members

| Columna | Definición |
| --- | --- |
| workspace_id, user_id | uuid obligatorios; PK conjunta; FK al espacio y a Auth |
| role | text obligatorio: owner o member |
| status | text obligatorio: invited, active o revoked |
| invited_by_user_id | uuid nullable, FK Auth |
| invited_at, invite_expires_at | timestamptz nullable |
| accepted_at | timestamptz nullable |
| revoked_at | timestamptz nullable |
| revoked_by_user_id | uuid nullable, FK Auth |
| updated_at | timestamptz obligatorio |
| version | integer obligatorio, inicial 1 |

Una invitación apunta al user_id de una cuenta existente. invited exige invitador, fecha y vencimiento posterior, y no tiene accepted_at. active exige accepted_at. revoked exige revoked_at. La membresía inicial se crea activa y propietaria, sin invitación. Las invitaciones vencen a los siete días; solo el destinatario autenticado puede aceptarlas antes de vencer. Un usuario invitado todavía no accede a datos de negocio.

UNIQUE parcial(workspace_id) para role=owner y status=active impide dos propietarios. Una validación diferida impide que el espacio quede sin ninguno. Invitar y revocar miembros requiere propiedad del espacio; transferirla exige aceptación del nuevo propietario y una transacción. Un miembro puede salir si no deja recursos sin propietario.

### core.people

C más display_name text obligatorio, 1 a 200 caracteres. Los nombres no son únicos. La ficha contiene únicamente identificación básica; los datos clínicos pertenecen a Salud.

Crear una persona exige membresía activa y crea su primer core.person_access de propietario en la misma transacción. No crea una cuenta de Google. El perfil propio y los perfiles administrados tienen UUID distintos.

La ficha puede leerse con vínculo propio verificado, ACL básica vigente, ACL de Salud vigente o acceso a un libro que ya referencia esa persona. Esta lectura derivada muestra únicamente la identificación básica necesaria; no concede edición ni otro módulo.

Archivar una persona exige propiedad de su ficha y que no queden registros de Salud activos ni cuentas o presupuestos activos asignados a ella. Cada propietario de módulo debe resolver sus dependencias. Los movimientos financieros históricos no se anulan para archivar una persona: conservan su referencia y su efecto.

### core.person_user_links

| Columna | Definición |
| --- | --- |
| workspace_id, person_id | uuid obligatorios; PK conjunta; FK compuesta a people |
| user_id | uuid obligatorio; FK compuesta a workspace_members |
| verified_at | timestamptz obligatorio |
| verification_method | text: self_registration o dual_acceptance |

UNIQUE(workspace_id,user_id): una cuenta representa una persona por espacio. Una persona se vincula con una cuenta por espacio. Solo onboarding o aceptación de un identity_link_request crean estas filas; no hay edición libre.

El vínculo identifica la persona propia dentro del espacio. No otorga permisos de Finanzas o Salud.

### core.person_access

PK(workspace_id,person_id,user_id), con FK compuesta a people y a workspace_members. Se agregan role text (owner/editor/viewer), granted_at timestamptz, granted_by_user_id uuid nullable, revoked_at timestamptz nullable, revoked_by_user_id uuid nullable y version integer obligatorio, inicial 1. La versión aumenta al conceder, cambiar rol, revocar o transferir.

El owner administra la ficha y sus accesos; editor puede editar su nombre; viewer puede consultarla. Se exige membresía activa y permiso no revocado. Una ACL básica no permite leer o modificar datos clínicos o financieros.

UNIQUE parcial(workspace_id,person_id) para propietario no revocado, más validación transaccional de al menos un propietario activo. Los permisos se conservan como filas revocadas hasta un procedimiento de purga.

### core.person_aliases

| Columna | Definición |
| --- | --- |
| workspace_id, user_id | uuid obligatorios; FK compuesta a workspace_members |
| person_id | uuid obligatorio; FK compuesta a people |
| alias | text obligatorio, 1 a 80 caracteres |
| alias_normalized | text generado mediante recorte de espacios exteriores y minúsculas |
| created_at, updated_at | timestamptz obligatorios |
| version | integer obligatorio, inicial 1; aumenta al modificar |

PK(workspace_id,user_id,alias_normalized). Una cuenta puede tener varios alias para una persona. Solo esa cuenta, con membresía activa, consulta o modifica sus alias, y solo puede asignarlos a perfiles que pueda identificar legítimamente antes de crear la asociación. Si pierde la lectura básica del perfil, no se muestra el alias como una vía para descubrirlo. Cambiar la clave normalizada equivale a retirar el alias anterior y crear el nuevo dentro de una transacción.

«Mamá» es un alias de esa cuenta, no una relación universal ni un permiso. La operación solicitada vuelve a comprobar su autorización sobre la persona o recurso resuelto. Si el nombre o contexto no identifica un perfil autorizado de forma inequívoca, Impulso pregunta.

### core.identity_link_requests

| Columna | Definición |
| --- | --- |
| id | uuid PK |
| workspace_id, person_id | uuid obligatorios; FK compuesta a people |
| target_user_id | uuid obligatorio; FK compuesta a miembro destinatario |
| requested_by_user_id | uuid obligatorio; FK compuesta a miembro solicitante |
| status | text: pending, accepted, rejected, cancelled o expired |
| created_at, expires_at | timestamptz obligatorios; vence siete días después |
| completed_at | timestamptz nullable; obligatorio en estados finales |
| completed_by_user_id | uuid nullable, FK Auth; vacío en vencimiento automático |

Como máximo una solicitud pending por persona y por destinatario dentro del espacio, mediante dos UNIQUE parciales. Antes de crear otra, se cierran las pendientes vencidas.

Solicitar exige propiedad de la ficha y destinatario miembro activo. Aceptar exige la sesión exacta del destinatario; el solicitante debe conservar la propiedad. Se comprueba que la persona y la cuenta estén libres de otros vínculos en ese espacio. El vínculo y la aceptación se guardan atómicamente. La vinculación no fusiona historiales ni otorga permisos de módulos. Las respuestas reciben identity_request_id; request_id se reserva para idempotencia de la mutación. La transición exige status=pending y bloqueo de la solicitud; no depende de una version inexistente.

### core.ownership_transfer_requests

| Columna | Definición |
| --- | --- |
| id | uuid PK |
| workspace_id | uuid obligatorio; FK al espacio |
| scope | text: workspace, person, book o health_person |
| person_id, book_id | uuid nullable; solo la referencia que corresponda al scope |
| offered_by_user_id, target_user_id | uuid obligatorios; FK compuesta a miembros del espacio; cuentas distintas |
| status | text: pending, accepted, rejected, cancelled o expired |
| created_at, expires_at | timestamptz obligatorios; vence siete días después |
| completed_at | timestamptz nullable; obligatorio en estados finales |
| completed_by_user_id | uuid histórico nullable; vacío en vencimiento automático |

CHECK de alcance: workspace no usa person_id ni book_id; person y health_person exigen solo person_id; book exige solo book_id. Las FK de persona y libro incluyen workspace_id. health_person exige que exista el ámbito de Salud. Los UNIQUE parciales permiten una sola solicitud pending por recurso; las vencidas se cierran antes de ofrecer otra.

Solo el owner actual ofrece la transferencia. La aceptación usa ownership_request_id y la sesión del destinatario. Bajo bloqueo se comprueba que ambos sigan activos, que el solicitante siga siendo owner, que la solicitud no haya vencido y que el recurso no esté en purga. Una transición desde pending crea el nuevo owner y cambia al anterior a viewer; para el espacio, a member. La solicitud y ambos roles se confirman juntos, aumentando las versiones de ACL/membresía. El antiguo propietario conserva solo esos permisos mínimos, que después pueden revocarse.

Bootstrap y aceptación son las únicas vías para asignar owner. Conceder o cambiar un acceso ordinario admite editor o viewer. La transferencia no equivale a vincular una cuenta con una persona.

## Tablas de Finanzas

### finance.books

C más name text obligatorio, currency text obligatorio y minor_unit smallint obligatorio (0 a 4), fijado por el servidor según esa moneda al crear el libro. currency es un código ISO 4217 admitido por el servidor, de tres letras mayúsculas, sin moneda predeterminada.

UNIQUE(workspace_id,id,currency). Crear un libro exige membresía activa y crea su book_access propietario en la misma transacción. La moneda y su precisión minor_unit quedan fijas desde la creación; cambiarlas exige otro libro. Un libro archivado conserva lectura y bloquea movimientos nuevos.

### finance.book_access

PK(workspace_id,book_id,user_id), con FK compuesta a books y a workspace_members. Columnas role (owner/editor/viewer), granted_at, granted_by_user_id, revoked_at, revoked_by_user_id y version, con los tipos y reglas de las ACL de Core.

UNIQUE parcial(workspace_id,book_id) para un propietario no revocado, más validación de que exista uno activo. La transferencia bloquea el libro y actualiza ambos permisos atómicamente.

Este permiso cubre todas las cuentas, movimientos, presupuestos y adjuntos del libro. Quien deba tener separación financiera necesita libros distintos; no se ofrece compartir solo una fila de un libro.

### finance.accounts

C más:

| Columna | Definición |
| --- | --- |
| book_id | uuid obligatorio |
| currency | text obligatorio; debe coincidir con la moneda del libro |
| name | text obligatorio |
| person_id | uuid nullable; persona asociada o vacío para cuenta compartida |
| opening_balance | numeric(20,4) obligatorio, elección explícita, incluido cero; admite negativos |

FK(workspace_id,book_id,currency) a books; FK(workspace_id,person_id) a people. UNIQUE(workspace_id,book_id,id,currency). El saldo inicial solo se corrige antes del primer movimiento, incluso si después fue anulado; ambas operaciones bloquean la misma cuenta antes de comprobar esa condición. Se calcula el saldo actual; no hay columna de saldo acumulado.

Una cuenta archivada conserva su historial y saldo. Sus movimientos existentes pueden anularse o corregirse con permisos del libro; no admite nuevos movimientos normales. La excepción de corrección se limita a referencias originales sin cambiar, como se define en transactions.

### finance.transactions

Usa id, workspace_id, created_at, updated_at, actores y version de C, **sin archived_at ni archived_by_user_id**. Una anulación se representa explícitamente con voided_at.

| Columna | Definición |
| --- | --- |
| book_id, currency | uuid y text obligatorios; libro y moneda de la operación |
| kind | text obligatorio: income, expense o transfer |
| amount | numeric(20,4) obligatorio, mayor que cero; precisión válida para la moneda |
| source_account_id | uuid nullable |
| destination_account_id | uuid nullable |
| beneficiary_person_id | uuid nullable; destinatario explícito o gasto/ingreso compartido |
| occurred_on | date obligatorio |
| description | text obligatorio, 1 a 2000 caracteres |
| request_id | uuid obligatorio; clave estable de creación |
| replaces_transaction_id | uuid nullable; movimiento corregido |
| voided_at | timestamptz nullable |
| voided_by_user_id | uuid nullable, FK Auth |
| void_reason | text nullable, 1 a 2000 caracteres; obligatorio al anular |

Ingreso: solo cuenta de destino. Gasto: solo cuenta de origen. Transferencia: ambas cuentas, distintas. Las cuentas deben pertenecer al mismo libro, espacio y moneda. Antes de asociar un person_id o beneficiary_person_id, se exige que el actor ya pueda identificar esa persona sin usar la autorización derivada de la asociación que está creando. Se utiliza una FK compuesta (workspace_id,book_id,cuenta_id,currency) por cada cuenta; el beneficiario usa FK(workspace_id,beneficiary_person_id) a people.

UNIQUE(workspace_id,book_id,id); UNIQUE(workspace_id,book_id,request_id); UNIQUE parcial(workspace_id,book_id,replaces_transaction_id) cuando hay reemplazo. La FK del reemplazo apunta a una transacción del mismo libro; no puede apuntarse a sí misma.

Son inmutables id, workspace_id, book_id, currency, kind, amount, cuentas, beneficiario, occurred_on, description, request_id, replaces_transaction_id y campos de creación. Mientras voided_at esté vacío, voided_by_user_id y void_reason están vacíos; al anular se exige motivo y actor de sesión (el actor puede quedar nulo tras baja de Auth). Corregir un movimiento lo anula y crea su reemplazo en una transacción; conserva ambos registros. Anular o corregir exige transaction_id, expected_version del original, espacio y libro activos, y ACL actual owner/editor. Una corrección puede conservar una cuenta o beneficiario archivado únicamente si es una referencia idéntica en la misma columna del original; toda nueva asociación exige un padre activo y una persona identificable previamente. Se bloquean las cuentas afectadas. Un movimiento ya anulado no se corrige ni vuelve a activarse. Anular exige intención expresa y no elimina adjuntos ni historial. Los archivos anteriores permanecen ligados al movimiento original; no se copian silenciosamente al nuevo.

Una transferencia es una sola fila y aplica ambos efectos a la vez. El saldo de una cuenta es: saldo inicial + ingresos y transferencias recibidos − gastos y transferencias enviados. Solo cuentan movimientos no anulados. Los saldos negativos son válidos.

La fecha omitida se propone como la del mensaje en la zona del espacio y se informa al usuario; una referencia temporal dudosa se aclara. Se pregunta si no hay libro, cuenta, importe, moneda o destinatario claramente resuelto. Nunca se interpreta registrar un gasto como ejecutar un pago bancario.

### finance.budgets

C más:

| Columna | Definición |
| --- | --- |
| book_id, currency | uuid y text obligatorios |
| name | text obligatorio |
| person_id | uuid nullable; vacío para todo el libro |
| starts_on, ends_on | date obligatorios; inicio incluido y fin excluido |
| amount | numeric(20,4) obligatorio, mayor que cero; precisión válida para la moneda |

Toda asociación nueva de cuenta, beneficiario o presupuesto exige una persona activa e identificable por el actor antes de guardar la referencia. CHECK(ends_on > starts_on). FK compuesta al libro y moneda; FK compuesta de persona. UNIQUE NULLS NOT DISTINCT(workspace_id,book_id,person_id,starts_on,ends_on) establece un presupuesto por alcance e intervalo.

El consumo es la suma de gastos no anulados del intervalo, filtrada por beneficiario cuando hay persona. Ingresos y transferencias no consumen presupuesto. Los intervalos pueden superponerse; cada presupuesto se consulta por separado y no se suman como si fueran un único límite. V1 no incluye categorías, conversión de monedas ni alertas.

## Tablas de Salud

records, medications, appointments y lab_results usan C, agregan person_id uuid obligatorio y FK(workspace_id,person_id) a people. Cada una agrega UNIQUE(workspace_id,person_id,id).

El sujeto es inmutable. Si se registró información para la persona equivocada, se archiva ese registro y se crea uno para el sujeto correcto con autorización independiente. No se cambia un person_id para mover el historial.

### health.person_access

PK(workspace_id,person_id,user_id), con FK compuesta a people y a workspace_members. role (owner/editor/viewer), granted_at, granted_by_user_id, revoked_at, revoked_by_user_id y version siguen las reglas de las ACL de Core, incluido incremento de versión en cada cambio.

UNIQUE parcial(workspace_id,person_id) para propietario no revocado y comprobación de al menos un propietario activo. El permiso cubre los registros y adjuntos de Salud de esa persona dentro del espacio.

Habilitar Salud exige propiedad de la ficha básica, ausencia de ACL e historial previo de Salud y creación atómica del primer owner. Una vez habilitada, solo su owner administra esa ACL. Vincular la persona a una cuenta no habilita ni transfiere Salud.

### health.records

| Columna | Definición |
| --- | --- |
| kind | text: note, symptom, diagnosis, history o medication_intake |
| occurred_on | date nullable |
| occurred_at | timestamptz nullable |
| title | text obligatorio, 1 a 200 caracteres |
| body | text obligatorio, 1 a 20000 caracteres |

Se admite fecha sin hora o instante exacto, nunca ambos. Ambos vacíos significan fecha desconocida. Un diagnosis registra una afirmación proporcionada por el usuario o documento; no es un diagnóstico emitido por Impulso.

Una toma de medicamento se registra expresamente como medication_intake y describe lo reportado. No se deduce una toma a partir de una pauta.

### health.medications

| Columna | Definición |
| --- | --- |
| name | text obligatorio, 1 a 200 caracteres |
| instructions | text nullable, hasta 4000 caracteres |
| starts_on, ends_on | date nullable |
| status | text: reported, active o stopped; inicial reported |

Si ambas fechas existen, ends_on >= starts_on. Las instrucciones describen la pauta declarada; no prueban consumo. reported permite guardar un nombre sin inventar dosis, pauta o tratamiento activo. No hay cálculos de adherencia, seguimiento estructurado de dosis ni recordatorios en v1.

### health.appointments

| Columna | Definición |
| --- | --- |
| starts_at | timestamptz obligatorio |
| ends_at | timestamptz nullable; si existe, es posterior al inicio |
| timezone | text obligatorio, zona IANA; conserva la zona con la que se programó |
| provider | text nullable, hasta 200 caracteres |
| location | text nullable, hasta 500 caracteres |
| reason | text nullable, hasta 4000 caracteres |
| status | text: scheduled, completed, cancelled o missed; inicial scheduled |

La zona puede proponerse desde el espacio. Si la hora o zona es ambigua, se aclara antes de guardar. No se inventa duración para llenar ends_at.

### health.lab_results

| Columna | Definición |
| --- | --- |
| test_name | text obligatorio, 1 a 200 caracteres |
| collected_on | date nullable |
| collected_at | timestamptz nullable |
| result_text | text obligatorio, 1 a 4000 caracteres |
| unit | text nullable, hasta 100 caracteres |
| reference_range | text nullable, hasta 500 caracteres |
| laboratory | text nullable, hasta 200 caracteres |

Se admite fecha de toma sin hora o instante exacto, nunca ambos; puede desconocerse. Se conserva el resultado declarado y su unidad, sin deducir normalidad ni recomendaciones. Un PDF sin extracción confiable se guarda como adjunto de una nota en records; se crean resultados estructurados únicamente con valores resueltos.

## Archivos y Storage

Los buckets finance-files y health-files serán privados. V1 admite PDF, JPEG y PNG de 1 byte a 20 MiB. El servidor verifica contenido real, MIME y tamaño antes de ofrecer descarga; un archivo pendiente no se presenta como resultado validado.

### finance.files

id uuid PK; workspace_id, book_id y transaction_id uuid obligatorios. FK(workspace_id,book_id,transaction_id) a transactions. UNIQUE(workspace_id,book_id,id).

### health.files

id uuid PK; workspace_id y person_id uuid obligatorios. record_id, medication_id, appointment_id y lab_result_id uuid nullable; CHECK exactamente uno presente. Cada referencia usa FK(workspace_id,person_id,recurso_id) hacia su tabla. UNIQUE(workspace_id,person_id,id).

Ambas tablas agregan:

| Columna | Definición |
| --- | --- |
| bucket_id | text obligatorio; finance-files o health-files según tabla |
| object_path | text obligatorio y único; generado por el servidor |
| original_name | text obligatorio, 1 a 255 caracteres |
| mime_type | text: application/pdf, image/jpeg o image/png |
| size_bytes | bigint obligatorio, de 1 a 20971520 |
| state | text: pending, ready o deleting; inicial pending |
| created_at, updated_at | timestamptz obligatorios |
| created_by_user_id, updated_by_user_id | uuid FK Auth, con las reglas de actores históricos |
| version | integer obligatorio, inicial 1 |
| archived_at, archived_by_user_id | mismos tipos y reglas de archivado de C |

Las rutas son workspace_id/book_id/file_id en Finanzas y workspace_id/person_id/file_id en Salud. No contienen nombres, correos ni texto clínico. Bucket, ruta y recurso son inmutables. Reemplazar un documento crea otro file_id; no hay upsert silencioso.

Flujo: crear metadata pending con permiso de edición → subir al objeto exacto → verificar bytes → bloquear el espacio, membresía y padres → volver a comprobar permiso, estado pending con archived_at vacío, expected_version, padres admisibles y ausencia de purga → marcar ready. Si entre la subida y esa transacción hubo revocación o archivado, no se marca ready y el pendiente queda sujeto a limpieza. No se permite subir a rutas sin metadata autorizada. Los pendientes abandonados de más de 24 horas se limpian mediante Storage; no se borran archivos listos como si fueran huérfanos.

Para descargar se exige state=ready, ACL vigente y membresía activa. Archivado permite descarga solo al consultar historial autorizado. Padres archivados, cuentas archivadas o movimientos anulados bloquean nuevos adjuntos, pero conservan los existentes.

V1 usa descargas autenticadas que revisan la autorización en cada solicitud. Si una integración requiere URL firmada, su vigencia máxima será de 60 segundos y se emitirá después de verificar acceso. Una URL ya emitida puede funcionar hasta expirar; un archivo ya descargado no se recupera al revocar permisos. [Descargas privadas](https://supabase.com/docs/guides/storage/serving/downloads).

Las políticas sobre storage.objects comprueban bucket, objeto exacto, metadata y ACL. INSERT admite únicamente la ruta de una metadata pending autorizada, sin archivar, con padres admisibles y sin purga activa. SELECT exige metadata ready y autorización actual. El cliente no tiene UPDATE, upsert, copy ni move: los bytes de un archivo ready son inmutables. DELETE queda reservado al servicio de mantenimiento. Para borrar físicamente se marca deleting, se bloquean descargas nuevas, se elimina el objeto mediante la API de Storage y después su metadata. Si falla, se conserva deleting y se reintenta; un objeto ya ausente se considera eliminado. PostgreSQL y Storage no comparten una transacción. [Control de Storage](https://supabase.com/docs/guides/storage/security/access-control).

## Matriz de acceso

Todos los accesos exigen cuenta y sesión válidas, membresía active en el espacio y ACL no revocada. El permiso de un módulo no concede el otro. El propietario del espacio tampoco obtiene acceso implícito a fichas o módulos.

| Operación | Owner del recurso | Editor | Viewer |
| --- | --- | --- | --- |
| Leer recurso e historial autorizado | Sí | Sí | Sí |
| Crear y editar registros activos | Sí | Sí | No |
| Corregir o anular movimientos del libro | Sí | Sí | No |
| Archivar registros o adjuntos | Sí | Sí | No |
| Restaurar registros archivados de negocio | Sí | No | No |
| Compartir, revocar o cambiar roles | Sí | No | No |
| Transferir propiedad | Sí, con aceptación | No | No |
| Consultar auditoría del recurso | Sí | No | No |
| Solicitar purga definitiva del recurso | Sí | No | No |

La matriz aplica al recurso del permiso: ficha básica, libro o Salud de la persona. Archivar/restaurar una ficha básica o el propio libro corresponde solo a su owner; no al editor de sus registros. Una transacción financiera anulada no se restaura: se registra una nueva operación explícita.

ACL: cada destinatario debe ser miembro active del mismo espacio. Solo el owner actual puede conceder, modificar, revocar o transferir. No se elimina ni revoca al último propietario sin transferir o purgar su recurso. La aceptación de una transferencia proviene de la sesión del destinatario y queda auditada.

Compartir la ficha básica no comparte Salud. Compartir un libro sí comparte su contenido completo. V1 no tiene permisos por columna o por registro clínico individual.

## Contrato de seguridad y RLS

Only `api` is listed as an exposed Data API schema, and it remains empty. `core`, `finance`, `health`, `audit` and `private` are not exposed through that API. Business operations will be TypeScript Edge Function handlers exposed through MCP, with no custom SQL RPCs or privileged database functions. Ordinary client roles have no direct access to business tables. Server database privileges must be granted explicitly and limited to the operations the Edge Functions require. [Data API security](https://supabase.com/docs/guides/api/securing-your-api).

RLS remains enabled on every business and ACL table. Each protected Edge Function or MCP tool must validate the token signature, issuer, audience, expiry, account existence and active session. Resolve the actor from verified request credentials, never a model-supplied user identifier. An unexpired token from a revoked session is insufficient. Authorization checks query current ACLs rather than conversation history, supplied email addresses or editable user metadata. The following table describes the required server-side access checks.

| Familia de filas | Predicado de lectura y escritura |
| --- | --- |
| workspaces y workspace_members | Lectura propia o de estructura administrada; invitados solo ven su invitación. Gestión estructural por owner activo. |
| people | Lectura básica propia o permitida explícita/derivada; edición por ACL básica owner/editor. |
| person_user_links y solicitudes | Solo operaciones verificadas; solicitante/destinatario ven lo necesario para su propia solicitud. |
| person_aliases | Solo su cuenta con membresía activa y lectura básica vigente del perfil. |
| finance.books y sus hijos | Lectura por ACL activa del libro; escrituras por owner/editor y padres activos, salvo la excepción precisa de corrección de movimientos. |
| health y sus archivos | Lectura por ACL activa de Salud de la persona; escrituras por owner/editor y padres activos. |
| ACL | Destinatario ve su permiso; owner gestiona editor/viewer. Sin autoascenso ni degradación/revocación del owner fuera de transferencia. |
| audit.events y tablas private | Sin escritura directa del usuario; lectura solo mediante operaciones filtradas. |

Reads must filter authorized rows and active purge scopes. Writes validate the actor, resource scope, previous and resulting state, expected version and immutable fields in Edge Functions. Related changes and audit records share a SQL transaction with consistent row locks. Native constraints retain relational integrity, uniqueness and basic value checks; they do not replace the removed cross-row business rules. Ordinary clients receive no direct write or delete privileges on business, ACL or audit tables.

Implement a closed set of TypeScript services inside the Edge Functions:

- Lock the workspace and validate the authenticated actor's resource scope, including acceptance of the actor's own current invitation.
- Accept an invitation only with the recipient's verified session, without changing its role or recipient or creating module ACLs.
- Check sessions, ACLs and dependencies, including rows the actor cannot read. Return only an allowed or blocked result, without disclosing hidden content or counts.
- Atomically create onboarding resources and initial ownership, or enable a first health scope or financial book.
- Accept identity links and offered ownership transfers, updating owners under the same transaction locks.
- Revoke membership and its ACLs after verifying that the member retains no ownership.
- Write events and operation receipts for validated operations.

Each service verifies session, scope, current states and authority before changing data and again under the relevant locks. Use a server-only database role with limited privileges and parameterized, fully qualified SQL. Do not offer arbitrary SQL tools or trust a parameter claiming that authorization already happened. Keep `private` outside the Data API. These are backend responsibilities, not database helper functions.

Administrative services are limited to Auth recipient resolution, file validation, failure logging, maintenance and purge. Never expose server credentials to the classifier or MCP caller. A server role that bypasses RLS must still perform explicit identity and resource authorization checks for every operation. [RLS policies](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Onboarding y operaciones autorizadas

El onboarding es idempotente: Google crea o reconoce la cuenta; Impulso verifica su sesión y, en una transacción, crea espacio, membresía owner, perfil propio, vínculo self_registration, permiso básico owner y alias «me». El nombre y zona horaria se confirman. Salud se habilita de forma explícita; Finanzas requiere crear un libro con moneda elegida.

Agregar un familiar crea people y su permiso básico owner. Su alias es privado de quien lo configura. Habilitar Salud o crear libros concede permisos explícitos del módulo correspondiente.

Para compartir, el owner del espacio solicita una invitación a una cuenta ya registrada mediante su correo confirmado de Auth. El servidor resuelve su user_id, sin directorio público global ni exposición de cuentas ajenas. El destinatario acepta con su propia sesión. Después, cada owner de recurso concede su ACL. No se guardan correos como autorización ni se asignan permisos por parentesco.

| Operación lógica | Parámetros de negocio y autorización |
| --- | --- |
| onboard | display_name text, workspace_name text, timezone text; sesión Google verificada |
| resolve_context | workspace_id uuid, referencia text y módulo; devuelve solo perfiles/recursos autorizados y datos básicos necesarios |
| create_person, set_alias | display_name o alias y person_id; miembro active; alias solo de su cuenta |
| update_person, archive_person, restore_person | person_id; editor/owner para nombre; owner y dependencias resueltas para ciclo de vida |
| invite_member, accept_invitation, revoke_member | destinatario verificado; owner del espacio para invitar/revocar, sesión del receptor para aceptar |
| request_identity_link, answer_identity_link | person_id y target_user_id al solicitar; identity_request_id y decisión al responder; propietario y aceptación del destinatario |
| offer_ownership_transfer, answer_ownership_transfer | scope, recurso y target_user_id; ownership_request_id y decisión al responder; owner ofrece, destinatario acepta |
| create_book, update_book, archive_book, restore_book | nombre, moneda en creación; miembro activo para crear, owner para administrar |
| create_account, update_account, archive_account, restore_account | book_id y campos definidos; owner/editor para editar/archivar, owner para restaurar |
| create_transaction, correct_transaction, void_transaction | libro/campos definidos al crear; transaction_id y expected_version del original al corregir/anular; owner/editor |
| create_budget, update_budget, archive_budget, restore_budget | book_id, alcance, intervalo e importe; owner/editor para editar/archivar, owner para restaurar |
| enable_health | person_id; owner de ficha y sin historial/ACL de Salud previo |
| create_health_record, update_health_record, archive_health_record | tipo de recurso cerrado y sus campos definidos; ACL de Salud owner/editor |
| restore_health_record | recurso archivado; owner de Salud |
| grant_access, revoke_access | ámbito cerrado de ficha/libro/Salud, recurso y destinatario; owner actual; concesión solo editor/viewer |
| begin_upload, finalize_upload, download_file, archive_file, restore_file | recurso y file_id; permiso sobre el padre; restauración por owner, archivo ready y objeto existente |
| list_records, get_record, get_balance, get_budget_usage | alcance explícito y permiso de lectura; listas paginadas |
| get_audit | ámbito explícito y propiedad del recurso |
| get_purge_status | purge_request_id propio; estado y errores saneados, sin contenido eliminado |

Cada herramienta tendrá un esquema cerrado de parámetros; no ejecutará nombres de tablas, filtros o SQL proporcionados por el modelo. Los importes se reciben como **text decimal**, para validar su precisión antes de convertirlos. Las mutaciones reciben request_id uuid, distinto del ID de cualquier solicitud. Actualizaciones, archivados, restauraciones, finalización de subida y cambios de ACL reciben expected_version del registro que modifican. Crear no exige una versión; respuestas a solicitudes usan transición pending bajo bloqueo. Los actores y fechas administrativas los fija el servidor.

Cada llamada tiene un workspace_id explícito, salvo onboarding. Los IDs de recurso, campos y acciones admitidos corresponden a las tablas de esta definición. Las listas usan 50 filas por defecto, máximo 100, con cursor estable de fecha e id: transactions por occurred_on; appointments por starts_at; registros/notas, resultados de laboratorio y demás listas por created_at. En Salud, created_at se etiqueta como fecha de registro, nunca como fecha clínica.

Resolver una persona o elegir un módulo no concede acceso. Impulso solicita precisión si faltan datos necesarios, hay varios perfiles posibles o el contexto contradice el sujeto o recurso. Una operación en ambos módulos se descompone en acciones explícitas con permisos independientes.

## Auditoría e idempotencia

### audit.events

| Columna | Definición |
| --- | --- |
| id | uuid PK |
| occurred_at | timestamptz obligatorio |
| request_id | uuid obligatorio; generado por el servicio si no hay una mutación de usuario |
| actor_user_id | uuid histórico nullable para sistema, fallo de autenticación o baja de cuenta |
| workspace_id | uuid histórico nullable para Auth/sistema o un alcance no resuelto |
| module | text: core, finance, health o auth |
| resource_type | text obligatorio, catálogo cerrado por módulo |
| resource_id | uuid histórico nullable |
| subject_person_id, book_id | uuid históricos nullable |
| action | text: create, update, correct, void, archive, restore, invite, accept, reject, grant, revoke, transfer, upload, download, purge_request, purge_complete, login o logout |
| outcome | text: success, denied o failed |
| changed_fields | text[] obligatorio; vacío por defecto, nombres de columnas del catálogo |

Salud exige subject_person_id y Finanzas exige book_id en eventos **exitosos de negocio con alcance resuelto**. Subidas y descargas pertenecen al módulo de su archivo. En un intento rechazado o un fallo con alcance no resuelto, los identificadores quedan vacíos: no se copian IDs no verificados de la solicitud. Los IDs históricos no tienen FK para conservar trazabilidad tras una purga.

No se guardan correos, nombres, textos clínicos, importes anteriores/nuevos, archivos, tokens, URLs ni respuestas completas del modelo. La mutación de base y su evento exitoso se confirman en la misma transacción. Los eventos de denegación/fallo se registran por un servicio interno aparte, sin contenido de la solicitud. El cliente no inserta, modifica ni borra eventos. Solo el owner del ámbito consulta su auditoría filtrada mientras conserve acceso; después de purgar el ámbito, ese historial queda reservado al servicio administrativo. El historial económico está en transactions y sus reemplazos.

### private.operation_receipts

| Columna | Definición |
| --- | --- |
| request_id | uuid PK, estable para el reintento de la misma acción |
| actor_user_id | uuid histórico obligatorio, sin FK Auth |
| workspace_id | uuid histórico nullable durante onboarding |
| operation | text obligatorio, catálogo de operaciones permitido |
| payload_hash | bytea de 32 bytes; nullable solo en estado purged |
| resource_ids | uuid[] obligatorio, solo identificadores de resultados |
| status | text: completed o purged |
| created_at, completed_at | timestamptz obligatorios |

El hash se calcula en servidor sobre parámetros validados y normalizados, después de rechazar cantidades con precisión inválida. El recibo y la mutación se guardan en la misma transacción. Una operación fallida no deja un recibo completed. La reserva transaccional de request_id serializa sus reintentos antes de comprobar el recurso.

Orden obligatorio: comprobar sesión → bloquear la clave de solicitud → buscar recibo y comprobar su actor → si está purged, devolver únicamente «acción retirada» al mismo actor, sin comparar un hash eliminado ni exigir ACL de un recurso borrado, y sin ejecutar → si está completed, comparar operación/hash, comprobar autorización actual y devolver «ya procesado» sin repetir → si no existe, comprobar expected_version y estados y efectuar la mutación con su recibo. Así, repetir una anulación o finalización no falla simplemente porque su primera ejecución cambió la versión/estado.

Misma clave con otro actor, operación o parámetros: conflicto sin exponer datos anteriores. Revocar acceso impide recuperar resultados antiguos. Un recibo no conserva cuerpos ni respuestas de Salud. Al purgar un recurso se conserva la marca purged para impedir recrearlo por un reintento; se elimina el hash y se vacían los IDs eliminados. Esa marca informa únicamente a su actor que la acción ya fue retirada; no revive recursos. Las claves de creación de transacciones siguen siendo únicas aunque se anulen.

## Compartir revocar archivar y borrar

Conceder acceso exige destinatario miembro active y owner del ámbito. Una concesión solo asigna editor/viewer y no cambia al owner. Transferir usa ownership_transfer_requests, aceptación del destinatario y actualización atómica de ambos roles. Rechazar o cancelar deja la propiedad intacta.

Revocar una membresía cambia su estado a revoked y revoca todas sus ACL de ficha y módulos en el mismo commit. Se rechaza si conserva propiedad de algún recurso, hasta transferirlo o purgarlo. Una nueva invitación no reactiva ACL anteriores. Concesiones, transferencias y revocaciones bloquean la misma membresía y revalidan su estado; un permiso concurrente no puede quedar activo después de la revocación. El acceso se bloquea en solicitudes nuevas; los archivos ya descargados y URLs firmadas conservan la limitación descrita en Storage.

Editar exige expected_version igual a la versión actual. Si cambió, se devuelve conflict y se recarga antes de proponer otra escritura. La API nunca sobrescribe silenciosamente cambios de otra cuenta.

Archivar oculta de listas activas, preserva filas, referencias y lectura del historial autorizado, y bloquea nuevas escrituras o adjuntos del recurso. Restaurar requiere owner y padres activos; un archivo debe estar ready y su objeto debe existir. Los movimientos anulados no se restauran. La gestión de ACL y transferencia de propiedad siguen disponibles sobre recursos archivados para administrar el acceso al historial; exigen las mismas autorizaciones y quedan bloqueadas por purga. Para archivar una persona o espacio se comprueban dependencias de todos los módulos mediante una respuesta booleana interna que no revela datos ajenos. La anulación de movimientos no se exige para archivar una ficha.

### private.purge_requests

| Columna | Definición |
| --- | --- |
| id | uuid PK |
| workspace_id | uuid histórico obligatorio, sin FK |
| scope | text: book, health_person, person o workspace |
| person_id, book_id | uuid históricos nullable; solo el ID exigido por scope |
| requested_by_user_id | uuid histórico obligatorio, sin FK |
| state | text: prepared, approved, deleting_files, deleting_rows, completed, cancelled o failed |
| manifest | jsonb obligatorio; plan generado exclusivamente por servidor, con claves de tabla de catálogo cerrado, UUID, versiones y bucket/rutas generados |
| manifest_hash | bytea de 32 bytes obligatorio |
| created_at, expires_at, updated_at | timestamptz obligatorios; la preparación vence a los cinco minutos |
| confirmed_at | timestamptz nullable; obligatorio desde approved |
| failure_code | text nullable, código saneado del catálogo; sin contenido de archivos ni mensajes de proveedor |

CHECK de alcance: book exige solo book_id; health_person/person exige solo person_id; workspace no usa ninguno. El manifiesto no admite texto clínico, importes, nombres ni JSON aportado por el modelo. Este JSON representa un plan administrativo de borrado, no datos de negocio. Preparaciones pueden quedar obsoletas; solo una purga aprobada/en ejecución/fallida confirmada por espacio puede estar en curso.

**Borrado definitivo:** v1 no expone una herramienta de purga automática al modelo. Un procedimiento administrativo prepara el ámbito exacto, las filas dependientes y los archivos. Antes de aprobar, bloquea el espacio, revalida que el responsable sea propietario de todos los recursos incluidos y compara el conjunto completo y las versiones con el plan. Si hay cambios, exige un plan y confirmación nuevos. La confirmación debe provenir de la sesión del responsable y estar ligada a id, manifest_hash y ámbito exacto; una afirmación del clasificador no la sustituye.

La aprobación y el plan se guardan **antes** de borrar. approved, deleting_files, deleting_rows y failed con confirmed_at bloquean creación, edición, restauración, subidas/finalización, concesiones, transferencias y descargas nuevas del ámbito afectado. Todas esas rutas comprueban el plan persistente bajo el mismo bloqueo del espacio. La protección sobrevive a reinicios; no depende de mantener una transacción abierta mientras se llama a Storage.

El servicio elimina objetos mediante la API de Storage y después filas en orden explícito, actualizando el plan. Objeto ya ausente significa paso completado. La metadata no desaparece antes de eliminar su objeto. Un fallo conserva el plan y los bloqueos y permite reanudar; solo se informa completed después de verificar ausencia de todas las filas y objetos previstos. Cancelar sin pérdida solo se permite antes de iniciar eliminaciones físicas. Tras un fallo parcial, la salida es completar o una resolución administrativa que explique y reconozca la pérdida; nunca restaurar silenciosamente el ámbito.

Purgar un libro no borra personas ni Salud. Purgar Salud de una persona no borra Finanzas ni Auth. Purgar una ficha básica se bloquea mientras existan referencias de negocio, incluso históricas: sus propietarios deben resolverlas mediante procedimientos explícitos. Purgar un espacio exige propiedad de cada recurso incluido. No hay cascadas de borrado entre dominios.

audit.events, las marcas purged de recibos y el plan administrativo se conservan fuera del conjunto borrado, sin contenido de negocio. La consulta del estado del plan permanece disponible al solicitante aunque sus ACL hayan desaparecido; no devuelve filas eliminadas. La limpieza de una subida pending abandonada también retira sus IDs de recibos y evita que un reintento la recree.

Antes de borrar una cuenta se revocan sus sesiones, se resuelven sus propiedades mediante transferencia o purga y se revocan sus membresías. Se retiran de forma explícita ACL, alias, vínculos y solicitudes de identidad/propiedad que la referencien; los actores de registros sobrevivientes quedan nulos. Los UUID históricos de auditoría, recibos y planes quedan sin una cuenta de Auth asociada, sin conservar correo o nombre.

La purga trata base activa y objetos de Storage. Las copias de respaldo del proveedor siguen su retención configurada; no se promete borrado instantáneo de respaldos ni de copias descargadas. La retención de respaldos se verificará antes de habilitar una purga en producción.

## Índices y restricciones de consistencia

Cada PK y UNIQUE genera su índice. Cada FK tiene un índice que empiece por sus columnas de referencia, salvo cuando lo cubre una PK/UNIQUE existente. También se crean:

| Tabla | Índices de consulta |
| --- | --- |
| workspace_members | user_id, status, workspace_id |
| people | workspace_id, display_name, id; workspace_id, created_at, id para listas |
| person_access y health.person_access | user_id, workspace_id, person_id |
| person_aliases | workspace_id, user_id, person_id |
| identity_link_requests | target_user_id, status, expires_at |
| ownership_transfer_requests | target_user_id, status, expires_at; unicidad pending por ámbito/recurso |
| book_access | user_id, workspace_id, book_id |
| books y accounts | alcance, created_at, id; persona cuando existe |
| transactions | workspace_id, book_id, occurred_on, id; cada cuenta, beneficiario y reemplazo |
| budgets | workspace_id, book_id, created_at, id; starts_on, ends_on y persona por alcance |
| health.records y health.lab_results | workspace_id, person_id, created_at, id |
| health.medications | workspace_id, person_id, created_at, id; status cuando sea necesario |
| health.appointments | workspace_id, person_id, starts_at, id |
| finance.files y health.files | alcance, state, created_at, id; cada FK de recurso; object_path único |
| audit.events | workspace_id, module, occurred_at, id; actor y recurso |
| operation_receipts | actor_user_id, completed_at |
| purge_requests | workspace_id, state; requested_by_user_id, created_at; unicidad de plan confirmado activo por espacio |

No se duplican índices cubiertos por otros. No se añade particionado, índices vectoriales ni búsqueda clínica global en esta versión.

**Orden común de bloqueos:** reserva transaccional de request_id → cuenta durante onboarding cuando no existe espacio → fila del espacio → membresías implicadas ordenadas por UUID → padres de recursos ordenados por UUID → hijos/ACL/solicitudes. Los reintentos consultan el recibo después de reservar su clave y antes de los controles de versión de primera ejecución.

V1 serializa las mutaciones de cada espacio bajo su fila, incluida la aprobación de purga, para que no compitan concesiones, revocaciones, cambios de propietarios, archivados, correcciones o finalización de archivos. Luego verifica nuevamente sesión, membresía, ACL, planes activos y estados de padres. El onboarding usa bloqueo de la cuenta antes de crear el primer espacio.

Las validaciones diferidas comprueban que cada espacio y ámbito con ACL conserve exactamente un owner activo al final de la transacción, salvo el ámbito que se elimina por un plan aprobado. No basta con la unicidad parcial, que solo impide dos propietarios. Actualizar el saldo inicial y crear/corregir movimientos bloquean las mismas cuentas. Cambiar alcance o campos de creación de una fila está prohibido.

Esta serialización sencilla es suficiente para la primera versión. Antes de permitir escrituras simultáneas de alto volumen en un mismo espacio se evaluará una estrategia de bloqueos más granular conservando estos invariantes.

## Criterios de aceptación antes de publicar

| Caso | Resultado obligatorio |
| --- | --- |
| Cuenta sin sesión, sesión expirada o cuenta eliminada | Sin lectura ni escritura de negocio |
| Dos cuentas con espacios distintos | Una no obtiene registros ni adjuntos de la otra |
| Propietario del espacio sin ACL de Salud | No lee Salud |
| Owner de Finanzas sin ACL de Salud | No lee ni comparte Salud |
| Miembro invited o revoked | No accede a recursos del espacio |
| Perfil «mamá» sin cuenta | Se puede administrar con permisos explícitos |
| Dos personas con el mismo nombre | Se pide desambiguación entre las autorizadas |
| Vínculo de identidad aceptado | No abre módulos ni fusiona historiales |
| Persona o cuenta de otro espacio en una FK | La base rechaza la referencia |
| Viewer intenta escribir o editar su rol | Denegado |
| Revocación de miembro seguida de reingreso | Las ACL anteriores siguen revocadas |
| Transferencia o revocación concurrente del owner | Queda exactamente un propietario activo |
| Mismo request_id repetido o concurrente | Una sola mutación |
| Misma clave con otros parámetros | Conflicto, sin sobrescritura |
| Dos ediciones con la misma version | Solo una se confirma |
| Transferencia entre dos cuentas del mismo libro | Baja y sube el mismo importe sin consumir presupuesto |
| Cuenta o moneda de otro libro en transferencia | Denegado |
| Corrección de gasto | Original anulado y reemplazo conservado; saldo exacto |
| Fecha médica desconocida | No se inventa fecha/hora de ocurrencia |
| Registro clínico con sujeto cambiado en UPDATE | Denegado |
| Subida a ruta sin metadata o sin permiso | Denegado |
| Subida pending o documento con MIME/tamaño inválido | Sin descarga lista |
| Revocación antes de finalize_upload | No se marca ready sin permiso vigente |
| Recurso archivado | Historial autorizado disponible; sin escrituras nuevas |
| Purga parcial de Storage | Se informa pendiente y no se elimina metadata como si hubiera terminado |
| Auditoría de una operación de Salud | Sin cuerpo clínico, tokens o URLs |

Estas son pruebas de la futura implementación. La revisión de esta especificación comprueba consistencia documental; todavía no demuestra que las políticas funcionen en una base real.

| Caso adicional | Resultado obligatorio |
| --- | --- |
| Direct Edge Function or MCP call with a revoked-session JWT | Denied even when the JWT has not expired |
| grant_access intenta asignar owner o degradar al actual | Denegado; solo transferencia aceptada cambia propiedad |
| UUID de persona no identificable en una referencia financiera nueva | Denegado; la referencia no crea su propia autorización |
| Aceptación de propiedad tras revocar miembro o cambiar owner | Denegada; la propiedad actual permanece |
| Conceder permiso y revocar miembro al mismo tiempo | No queda ACL activa para el miembro revocado |
| Repetir void/finalize con la misma clave después de cambiar la versión | Ya procesado; no se repite ni produce falso conflicto |
| Importe con decimales extra, exponente o valor no finito | Rechazado antes de convertir a numeric |
| Cambio de saldo inicial concurrente al primer movimiento | Solo el orden válido se confirma; el saldo inicial no cambia después |
| Corregir movimiento de cuenta archivada | Solo conserva referencias originales; referencias nuevas deben ser activas |
| Sobrescribir bytes de archivo ready | Denegado; el reemplazo necesita otro file_id |
| Dependencia ajena al archivar una persona | Se bloquea sin exponer su contenido |
| Cambios entre preparación y aprobación de purga | El plan queda obsoleto; exige nueva confirmación |
| Reinicio o fallo parcial durante purga | Plan persistente y ámbito bloqueado hasta resolución |
| Archivo/restauración/grant concurrente con purga aprobada | Denegado en el ámbito afectado |
| Salud con fecha clínica desconocida | Paginación estable por fecha de registro sin inventar fecha clínica |
| Reintento de una acción cuyo recibo está purged | Acción retirada para su actor; sin consultar recurso eliminado ni recrearlo |

## Estado y orden de implementación

- [x] Definidas tablas, columnas, relaciones, tipos y restricciones de v1.
- [x] Definidas reglas de identidad, permisos, compartición y conservación.
- [x] Definidos contratos de operaciones y pruebas de aceptación.
- [ ] Crear migraciones y políticas RLS.
- [ ] Configurar Google y el vínculo autenticado de cada petición de @Impulso.
- [ ] Implementar onboarding, operaciones, Storage y auditoría.
- [ ] Ejecutar las pruebas de aislamiento con varias cuentas antes de publicar.

Orden: Core e identidad → ACL de módulos → Finanzas y Salud → Storage y auditoría → integración @Impulso → pruebas. No se aplicaron migraciones ni se cambiaron permisos del proyecto Supabase durante esta definición.

