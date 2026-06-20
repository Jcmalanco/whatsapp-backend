# WhatsApp Business Backend con Supabase

Backend en Node.js y Express para un panel web multiusuario conectado a WhatsApp Business Cloud API, usando Supabase Postgres para datos y Supabase Storage para archivos.

## Funciones incluidas

- Webhook de WhatsApp Cloud API para recibir mensajes y estados.
- Historial de mensajes inmutable con triggers que bloquean borrado de mensajes, eventos y auditoria.
- Guardado de texto, fecha, contacto, conversacion, usuario asignado, estatus y archivos.
- Archivos en Supabase Storage; la base guarda la URL/ruta, no el binario pesado.
- Envio de texto, imagen, video y documento.
- Envio masivo a varios contactos con bitacora.
- Login con JWT y bcryptjs.
- Roles: admin, supervisor, agent.
- Bandeja de conversaciones y asignacion de chats.
- Archivado solo para administrador.
- Auditoria de acciones: quien, cuando, que hizo, IP y user-agent.
- Backup automatico con `pg_dump`.

## Configuracion Supabase

1. Crea un proyecto en Supabase.
2. Copia `DATABASE_URL` desde Project Settings > Database.
3. Copia `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` desde Project Settings > API.
4. Usa un bucket como `whatsapp-media`. El script lo crea si no existe.

Para que WhatsApp pueda enviar media por URL, el bucket debe ser publico o debes entregar URLs firmadas con duracion suficiente. Este proyecto usa `SUPABASE_STORAGE_PUBLIC=true` por defecto.

## Instalacion

```powershell
npm install
Copy-Item .env.example .env
npm run db:migrate
npm start
```

## Variables principales

```env
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_STORAGE_BUCKET=whatsapp-media
SUPABASE_STORAGE_PUBLIC=true

WHATSAPP_VERIFY_TOKEN=change_this_webhook_verify_token
WHATSAPP_ACCESS_TOKEN=EAAB_your_cloud_api_token
WHATSAPP_PHONE_NUMBER_ID=123456789
```

## Crear usuario administrador

Genera hash:

```powershell
node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('Admin123!',12).then(console.log)"
```

Inserta en Supabase SQL Editor:

```sql
INSERT INTO users (name, email, password_hash, role, status)
VALUES ('Admin', 'admin@example.com', '$2a$12$REPLACE_HASH', 'admin', 'active');
```

## Webhook WhatsApp

Configura en Meta:

- Callback URL: `https://tu-dominio.com/api/webhooks/whatsapp`
- Verify token: el valor de `WHATSAPP_VERIFY_TOKEN`
- Suscripcion: `messages`

## Endpoints principales

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/conversations`
- `GET /api/conversations/:id/messages`
- `PATCH /api/conversations/:id/assign`
- `PATCH /api/conversations/:id/archive`
- `POST /api/messages/text`
- `POST /api/messages/media`
- `POST /api/broadcasts`
- `GET /api/audit-logs`
- `GET /api/webhooks/whatsapp`
- `POST /api/webhooks/whatsapp`
