# KlassApp

Plataforma escolar para el piloto de una escuela brasileña. La interfaz inicial está en portugués brasileño y la estructura está preparada para separar los datos por escuela.

## Requisitos

- Node.js 24 o compatible
- npm
- Docker Desktop, para iniciar PostgreSQL localmente

## Inicio local

1. Crea tu archivo de configuración local. En PowerShell, desde `D:\proyectos\KlassApp`, ejecuta:

   ```powershell
   Copy-Item .env.example .env
   ```

   `.env.example` es una plantilla y `.env` es tu copia local, que no se sube al repositorio. Abre `.env` en VS Code, genera un secreto con el comando siguiente y reemplaza el valor de `AUTH_SECRET`:

   ```powershell
   node -p "require('node:crypto').randomBytes(32).toString('base64url')"
   ```

   Conserva los valores de PostgreSQL para desarrollo local. Son solo para tu computadora; no los uses en producción.
2. Instala las dependencias desde la raíz del proyecto:

   ```powershell
   npm.cmd install
   ```
3. Inicia PostgreSQL:

   ```powershell
   docker compose up -d db
   ```
4. Crea las tablas de acceso:

   ```powershell
   npm.cmd run db:migrate
   ```
5. Crea la escuela piloto y la primera cuenta administradora. El comando te pedirá el nombre de la escuela, el nombre de la persona administradora, su email y una contraseña de al menos 12 caracteres:

   ```powershell
   npm.cmd run bootstrap:admin
   ```

   Este paso se ejecuta una sola vez. No escribas la contraseña en el código ni la compartas.
6. En una terminal, inicia la interfaz:

   ```powershell
   npm.cmd run dev:web
   ```
7. En otra terminal, inicia la API:

   ```powershell
   npm.cmd run dev:api
   ```

Abre `http://localhost:3000` e inicia sesión con la cuenta administradora. La API estará en `http://localhost:4000`; su comprobación de salud está en `http://localhost:4000/health`.

## Estado actual

Ya están implementados el acceso de administración con email y contraseña, las sesiones protegidas y el registro de escuela piloto en PostgreSQL. Las contraseñas se guardan usando scrypt; las sesiones usan una cookie HttpOnly, SameSite Strict y expiran a los 15 minutos.

En la página inicial, las tarjetas muestran los conteos de alumnos, turmas, horarios, profesores e invitaciones (solo administración), eventos (solo administración), evaluaciones y observaciones. Para profesores, los conteos se limitan a sus turmas asignadas. **Primeiros passos** muestra el avance de cuatro elementos fundamentales: turmas, profesores activos vinculados a una turma, alumnos con responsable y horarios semanales. La sección se oculta cuando los cuatro están configurados.

Las pantallas de gestión, acceso e invitación comparten el lenguaje visual cálido del inicio: encabezados con ilustraciones vectoriales originales y específicas para alumnos, profesores, turmas, horarios, eventos, evaluaciones y comportamiento; paleta editorial, paneles suaves, estados interactivos consistentes y una escala tipográfica ampliada para mejorar la legibilidad. El diseño se adapta a pantallas móviles sin cambiar las acciones ni los permisos disponibles.

La administración puede crear y editar años escolares y grupos (turmas) desde la sección **Turmas**. Cada turma pertenece al año lectivo y a la escuela de la sesión activa; los profesores no pueden crear ni editar turmas. El año lectivo de una turma no se puede cambiar si ya tiene matrículas o evaluaciones, para conservar la integridad del historial.

La administración también puede registrar profesores desde **Professores** mediante el botón **Novo professor**, guardar su teléfono brasileño con DDD para la escuela, asociarlos con una o más turmas y generar un enlace de activación de un solo uso, válido por siete días. Como todavía no hay envío de correo ni notificaciones de WhatsApp, el enlace debe compartirse directamente con la persona invitada. El profesor define su contraseña al aceptar la invitación. El teléfono queda asociado a la escuela, no a la cuenta global.

La administración puede registrar alumnos desde **Alunos** con el botón **Novo aluno**, matricularlos en una turma y añadir hasta cinco responsables, con parentesco, teléfono brasileño e indicación de si la escuela ya registró autorización para notificaciones. Los contactos de cada escuela se guardan por separado y no se fusionan automáticamente por teléfono; el modelo permite vincular a una misma persona entre escuelas después de verificar su identidad. Todavía no se envían mensajes de WhatsApp. El registro del alumno, su matrícula y los cambios iniciales quedan asociados al usuario que los creó.

La administración puede organizar y editar horarios semanales por turma, disciplina, día y hora, con asociación opcional de un profesor activo asignado a esa turma. Las invitaciones pendientes aparecen como opción solo después de que el profesor active su cuenta. El formulario de creación se abre desde **Novo horário** en un panel flotante. Se bloquean los cruces de horario de una turma o de un mismo profesor; crear, editar y eliminar horarios queda en el registro de auditoría. Por ahora, solo administración puede consultar y modificar esta sección.

La administración puede registrar eventos desde **Novo evento** en un panel flotante, para toda la escuela, una turma o todas las turmas del mismo año escolar, incluyendo fecha, hora, local y detalles. El horario se guarda usando la zona horaria de la escuela. Cancelar un evento conserva su historial y queda auditado. Por ahora los eventos solo son visibles en el área de administración: todavía no hay un portal para responsables ni se envían notificaciones por WhatsApp.

En **Eventos**, el botón **Exibir no painel** abre una presentación de pantalla completa en el monitor actual, con tarjetas de distintos colores y animaciones sutiles de entrada y decoración. Muestra los eventos publicados cuya fecha aún no pasó, ordenados desde el más próximo, con público, hora y local. Se puede cerrar con **Sair do painel** o con Escape; respeta la preferencia del dispositivo por movimiento reducido y requiere un navegador compatible con Fullscreen API para ocultar sus controles.

La administración y los profesores pueden crear evaluaciones desde **Nova avaliação** en un panel flotante para las turmas a las que tienen acceso y registrar la puntuación de cada alumno con una escala configurable. Un profesor solo puede ver y editar resultados de turmas que tiene asignadas. Los datos se guardan por escuela y turma; los cambios quedan auditados. Los resultados aún no se comparten con responsables.

La administración y los profesores pueden registrar observaciones fechadas sobre estudiantes con matrícula activa desde **Nova observação** en un panel flotante. El historial se filtra según las turmas asignadas al profesor; las observaciones son append-only y quedan auditadas. Son notas internas: todavía no se comparten con responsables ni con el agente. Se recomienda registrar hechos concretos y evitar diagnósticos o etiquetas.

Desde **Alunos**, la administración puede abrir el perfil de cada estudiante para consultar matrículas anteriores y actuales, responsables, evaluaciones y resultados, comportamiento, horarios y eventos vinculados. Los profesores pueden abrir el perfil del estudiante desde su historial de comportamento, limitado a sus turmas activas y en modo de consulta. En **Professores**, la administración puede abrir los perfiles de docentes activos e inactivos. Las tarjetas muestran la foto del docente si existe; el perfil incluye su cuenta, turmas, horarios, evaluaciones, cantidad de alumnos con matrícula activa en sus turmas y eventos creados o relacionados con sus grupos, sin listar las observaciones de esos alumnos.

Las listas de alumnos y profesores permiten buscar por nombre y datos relacionados, y presentan tarjetas compactas que no se extienden por todo el ancho de la pantalla. La administración puede editar desde cada perfil el nombre y los responsables del alumno, así como el nombre, email, teléfono escolar y turmas asignadas al profesor. Los cambios de nombre/email del profesor afectan su cuenta global y, por tanto, pueden reflejarse en otras escuelas; el teléfono queda limitado a la escuela activa. Para retirar una turma con horarios vinculados al profesor, primero hay que reasignar o eliminar esos horarios. Los cambios se registran en auditoría; editar el teléfono de un responsable requiere volver a confirmar la autorización documentada para notificaciones.

Los perfiles permiten ver y actualizar fotos mediante webcam o archivos JPEG, PNG y WebP de hasta 5 MB. Las imágenes se ajustan y convierten antes de guardarse para eliminar metadatos de la foto original. El acceso a las fotos requiere una sesión y queda limitado por escuela; solo la administración puede modificarlas. Para guardar una foto de un estudiante, la persona administradora debe confirmar que la escuela tiene autorización documentada del responsable; la confirmación queda registrada. La webcam requiere permiso del navegador y un contexto seguro (HTTPS o `localhost`).

Todavía no está implementado el agente. Antes de usar datos reales de menores, revisa los permisos, respaldos y protección de datos de producción, además de conservar la autorización correspondiente para las imágenes.
