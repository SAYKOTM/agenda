// Respaldo lógico de la base de producción.
//
//   node scripts/backup.mjs [carpeta]      (por defecto: ./backups, ignorada por git)
//
// Existe porque el respaldo que hace Supabase en este plan NO es autoservicio: `supabase backups
// list` responde pitr_enabled:false y una lista vacía, así que ante un borrado accidental no hay
// un botón de "restaurar" -- habría que abrir un ticket y esperar. Este dump es el único respaldo
// que está bajo tu control.
//
// Lo que SÍ trae: todo el esquema public (tablas, funciones, políticas RLS, triggers, cron) y los
// datos de negocio. Lo que NO trae: auth.users. Ver docs/respaldos-y-restauracion.md antes de
// necesitarlo en serio.
//
// El archivo resultante contiene nombres, teléfonos y correos de clientes reales de cada salón:
// es un dato personal bajo la Ley 21.719. Guardalo cifrado y no lo dejes en Descargas.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outDir = resolve(process.argv[2] || 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

mkdirSync(outDir, { recursive: true });

function dump(label, file, extraArgs) {
  const target = join(outDir, file);
  const started = Date.now();
  process.stdout.write(`${label}… `);
  execFileSync('npx', ['supabase', 'db', 'dump', '--linked', '-f', target, ...extraArgs], {
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: process.platform === 'win32', // npx en Windows es un .cmd
  });
  const kb = (statSync(target).size / 1024).toFixed(0);
  console.log(`${kb} kB en ${((Date.now() - started) / 1000).toFixed(0)} s`);
  return target;
}

console.log(`Respaldando en ${outDir}\n`);
dump('Esquema', `${stamp}-schema.sql`, []);
dump('Datos', `${stamp}-data.sql`, ['--data-only']);

console.log(`
Listo. Dos recordatorios que importan:

  1. Este respaldo NO incluye las cuentas de acceso (auth.users). Al restaurarlo, los datos del
     salón vuelven completos pero nadie puede iniciar sesión hasta recrear los usuarios por email
     -- el enlace se rehace solo, ver docs/respaldos-y-restauracion.md.
  2. El archivo de datos tiene información personal de clientes. Cifralo antes de subirlo a
     cualquier nube y no lo dejes en el escritorio.
`);
