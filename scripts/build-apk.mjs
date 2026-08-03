/* Compila o APK e copia para a Área de Trabalho. */
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SDK = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
  ?? join(homedir(), 'AppData', 'Local', 'Android', 'Sdk')

if (!existsSync(SDK)) {
  console.error(`Android SDK não encontrado em ${SDK}`)
  console.error('Defina ANDROID_HOME apontando para o SDK, ou instale-o.')
  process.exit(1)
}

/* JAVA_HOME só é repassado se existir de fato; senão o Gradle usa o java do PATH. */
const env = { ...process.env, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK }
if (!env.JAVA_HOME || !existsSync(env.JAVA_HOME)) delete env.JAVA_HOME

/* Caminho entre aspas: o projeto pode estar numa pasta com espaços. */
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, env, stdio: 'inherit' })

const release = process.argv.includes('--release')

console.log('\n[1/4] Compilando a interface…')
run('npm run build')

console.log('\n[2/4] Sincronizando com o projeto Android…')
run('npx cap sync android')

console.log(`\n[3/4] Gerando o APK (${release ? 'release' : 'debug'})…`)
const gradlew = join(ROOT, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
run(`"${gradlew}" ${release ? 'assembleRelease' : 'assembleDebug'} --no-daemon`, join(ROOT, 'android'))

console.log('\n[4/4] Copiando para a Área de Trabalho…')
const built = join(
  ROOT, 'android', 'app', 'build', 'outputs', 'apk',
  release ? 'release' : 'debug',
  release ? 'app-release-unsigned.apk' : 'app-debug.apk',
)
if (!existsSync(built)) {
  console.error(`APK não encontrado em ${built}`)
  process.exit(1)
}

const desktop = join(homedir(), 'Desktop')
const target = join(desktop, 'Pixel Painter.apk')
copyFileSync(built, target)

const mb = (statSync(target).size / (1024 * 1024)).toFixed(1)
console.log(`\n✓ ${target}  (${mb} MB)`)
console.log('  Passe para o celular e abra o arquivo para instalar.')
