# WhatsApp CRM Backend con Baileys y Supabase

Backend en Node.js y Express para un panel web multiusuario conectado a WhatsApp mediante Baileys, usando Supabase Postgres para datos y Supabase Storage para archivos.

Baileys funciona como cliente de WhatsApp Web. No usa la WhatsApp Business Cloud API ni webhook de Meta; se vincula escaneando un QR desde WhatsApp > Dispositivos vinculados.

## Funciones Incluidas

- Conexion WhatsApp Web con Baileys y sesion persistente local.
- QR de vinculacion disponible por API para mostrarlo en el frontend.
- Recepcion de mensajes mediante eventos de Baileys.
- Historial de mensajes inmutable con triggers que bloquean borrado de mensajes, eventos y auditoria.
- Guardado de texto, fecha, contacto, conversacion, usuario asignado, estatus y archivos.
- Archivos en Supabase Storage; la base guarda la URL/ruta, no el binario pesado.
- Envio de texto, imagen, video y documento.
- Envio masivo a varios contactos con bitacora.
- Login con JWT y bcryptjs.
- Roles: admin, supervisor, agent.
- Perfiles de usuario con nombre visible, telefono, puesto, departamento, bio y avatar.
- Bandeja de conversaciones y asignacion de chats.
- Archivado solo para administrador.
- Auditoria de acciones.
- Backup automatico con `pg_dump`.

## Configuracion Supabase

1. Crea un proyecto en Supabase.
2. Copia `DATABASE_URL` desde Project Settings > Database.
3. Copia `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` desde Project Settings > API.
4. Usa un bucket como `whatsapp-media`. El script lo crea si no existe.

Para enviar media por WhatsApp, el bucket debe ser publico o debes entregar URLs firmadas con duracion suficiente. Este proyecto usa `SUPABASE_STORAGE_PUBLIC=true` por defecto.

## Instalacion

```powershell
cd C:\Users\Jcmal\Documents\Codex\2026-06-04\haz-un-backend-de-una-aplicacion\outputs\whatsapp-backend
Copy-Item .env.example .env
npm install
npm run db:migrate
npm start
```

## Variables Principales

```env
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
DB_SSL=true
DB_CONNECTION_TIMEOUT_MS=10000
DB_QUERY_TIMEOUT_MS=15000

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_STORAGE_BUCKET=whatsapp-media
SUPABASE_STORAGE_PUBLIC=true

JWT_SECRET=change_this_super_secret_value
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:5173,https://whatsapp-frontend-rosy-psi.vercel.app

BAILEYS_ENABLED=true
BAILEYS_AUTH_DIR=auth_info_baileys
BAILEYS_BROWSER_NAME=WhatsApp CRM
BAILEYS_RECONNECT_MS=5000
```

`BAILEYS_AUTH_DIR` guarda la sesion vinculada. No borres esa carpeta si no quieres volver a escanear QR.

## Vincular WhatsApp

1. Inicia el backend con `npm start`.
2. Inicia el frontend.
3. Entra con un usuario admin o supervisor.
4. Abre la pestaña **Conexion**.
5. Presiona **Iniciar** si no aparece QR.
6. Escanea el QR desde WhatsApp > Dispositivos vinculados.

Si necesitas forzar una nueva sesion, un admin puede presionar **Reiniciar**. Si borras la carpeta `auth_info_baileys`, WhatsApp pedira escanear de nuevo.

## Diagnostico Rapido

Comprueba que el servidor responde:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Comprueba que Supabase/Postgres responde:

```powershell
Invoke-RestMethod http://localhost:3000/health/db
```

Si `/health` responde pero `/health/db` tarda o falla, el login tambien fallara porque depende de la tabla `users`.

Si el frontend esta desplegado en Vercel, agrega su dominio a `CORS_ORIGIN`:

```env
CORS_ORIGIN=http://localhost:5173,https://whatsapp-frontend-rosy-psi.vercel.app
```

## Crear Usuario Administrador

Genera hash:

```powershell
node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('Admin123!',12).then(console.log)"
```

Inserta en Supabase SQL Editor:

```sql
INSERT INTO users (name, email, password_hash, role, status)
VALUES ('Admin', 'admin@example.com', '$2a$12$REPLACE_HASH', 'admin', 'active');
```

Tambien puedes crear su perfil:

```sql
INSERT INTO user_profiles (user_id, display_name, job_title, department)
SELECT id, name, 'Administrador', 'Operaciones'
FROM users
WHERE email = 'admin@example.com'
ON CONFLICT (user_id) DO NOTHING;
```

## Endpoints Principales

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/baileys/status`
- `POST /api/baileys/start`
- `POST /api/baileys/restart`
- `GET /api/profile`
- `PUT /api/profile`
- `POST /api/profile/avatar`
- `GET /api/profile/users`
- `GET /api/conversations`
- `GET /api/conversations/:id/messages`
- `PATCH /api/conversations/:id/assign`
- `PATCH /api/conversations/:id/archive`
- `POST /api/messages/text`
- `POST /api/messages/media`
- `POST /api/broadcasts`
- `GET /api/audit-logs`

## Nota Operativa

Baileys no es la API oficial de Meta. Conviene usarlo en entornos controlados, con una cuenta dedicada, buen manejo de sesiones y monitoreo. Para produccion regulada o con alto volumen, la WhatsApp Business Cloud API sigue siendo la opcion oficial.
