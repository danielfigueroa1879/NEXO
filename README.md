# NEXO

Sitio estático (Netlify) con base de datos en **Supabase**.

## 🚀 Configurar la base de datos (una sola vez)

### 1. Crear proyecto en Supabase
1. Entra a https://supabase.com y crea una cuenta (gratis).
2. **New project** → nombre `nexo`, elige región (ej. `sa-east-1 São Paulo`) y una contraseña de base de datos (guárdala).
3. Espera ~2 min a que se aprovisione.

### 2. Ejecutar el esquema SQL
1. En el panel de Supabase → **SQL Editor** → **New query**.
2. Copia y pega TODO el contenido de [`supabase-schema.sql`](supabase-schema.sql).
3. Click **RUN**. Debería decir "Success. No rows returned".

Esto crea:
- Tabla `cuentas` (datos del usuario)
- Tabla `documentos` (metadata de archivos subidos)
- Bucket `documentos` (Storage para PDFs / imágenes)
- Row Level Security para que cada usuario solo vea lo suyo

### 3. Conectar el frontend
1. En Supabase → **Settings** → **API**.
2. Copia:
   - **Project URL** → algo como `https://abcxyz.supabase.co`
   - **anon public key** → clave larga que empieza con `eyJ...`
3. Abre [`supabase-client.js`](supabase-client.js) y reemplaza las dos constantes:
   ```js
   const SUPABASE_URL      = 'https://abcxyz.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ...';
   ```
4. Sube los cambios a Netlify (`git push` o drag&drop). Listo.

### 4. Marcarte como administrador (opcional)
Para que `admin.html` te muestre TODAS las cuentas:
1. Crea tu cuenta normal desde `login.html` (registro).
2. En Supabase → **Table Editor** → `cuentas` → busca tu fila → cambia `es_admin` a `true`.

## 📁 Estructura

- `index.html` — landing
- `login.html` — login + registro (Supabase Auth con RUT)
- `solicitar.html` — formulario de solicitud NFC (guarda en `cuentas`)
- `subir-documentos.html` — sube archivos a Storage
- `verificar.html` — muestra la tarjeta al escanear NFC
- `admin.html` — panel del usuario + tabla admin (si `es_admin=true`)
- `supabase-client.js` — cliente compartido (config + helpers)
- `supabase-schema.sql` — esquema de la DB (correr en SQL Editor)
