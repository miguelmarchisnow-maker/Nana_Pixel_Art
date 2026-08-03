# Pixel Painter

Editor de pixel art e sprites para celular, com o conjunto de recursos do LibreSprite.
Roda como **aplicativo Android** (APK) e também como **PWA** no navegador.

---

## Instalar no celular

O arquivo `Pixel Painter.apk` está na sua Área de Trabalho.

1. Passe o arquivo para o celular (cabo USB, WhatsApp para si mesmo, Google Drive…)
2. Abra o arquivo no celular
3. O Android vai avisar que a origem é desconhecida — toque em **Configurações** e
   permita a instalação para o app que está abrindo o arquivo (Arquivos, Chrome…)
4. Toque em **Instalar**

O app aparece na gaveta como **Pixel Painter** e funciona sem internet.

> O APK é assinado com a chave de depuração — normal para instalação direta.
> Só é preciso uma chave própria para publicar na Play Store.

### Gerar o APK de novo

```bash
npm run apk          # compila e copia para a Área de Trabalho
```

Precisa de JDK 17 e do Android SDK (`ANDROID_HOME`). Na primeira vez o Gradle baixa
as dependências; depois leva poucos segundos.

---

## Rodar no navegador

```bash
npm install
npm run dev      # mostra o endereço da rede local
```

Abra `http://192.168.x.x:5173` no celular (mesmo Wi-Fi) e use *Adicionar à tela inicial*.

Para publicar na web:

```bash
npm run build    # gera dist/ — estático, serve em qualquer hospedagem
npm run preview
```

---

## Gestos

| Gesto | Ação |
|---|---|
| Um dedo | Desenha com a ferramenta ativa |
| Dois dedos | Move e amplia a tela (cancela o traço em andamento) |
| Toque longo numa cor da paleta | Abre as opções daquela cor |
| Botão flutuante ✏ (canto inferior direito) | Troca de ferramenta |
| Botão Voltar do Android | Fecha o diálogo, depois o painel, depois sai |

---

## Onde os arquivos são salvos

No APK, as exportações vão para **Documentos/PixelPainter** no armazenamento do
aparelho, e o menu de compartilhar abre em seguida (para mandar direto pra galeria,
Drive, WhatsApp…). Se o Android bloquear essa pasta, o app grava em
`Android/data/com.pixelpainter.app/files` automaticamente.

No navegador, tudo cai na pasta de downloads.


---

## Recursos

**Ferramentas** — lápis, borracha, balde, conta-gotas, spray, desfoque, sombreamento,
gradiente, linha, retângulo, elipse, contorno, polígono, seleção retangular/elíptica,
laço, varinha mágica, mover, mão e zoom.

**Opções de traço** — tamanho e formato da ponta (círculo, quadrado, losango),
opacidade, tolerância, preenchimento e contorno, *pixel perfect*, simetria
(horizontal, vertical, ambas) e sete padrões de dithering.

**Camadas** — quantidade livre, opacidade, 19 modos de mesclagem, visibilidade,
bloqueio, reordenação, mesclar abaixo, achatar e camadas de referência
(visíveis no editor, ausentes na exportação).

**Animação** — frames com duração individual, onion skin colorido (antes/depois),
tags com direção (frente, trás, vai e volta), reprodução com o tempo real de cada frame.

**Seleção** — modos substituir, somar, subtrair e interseção; recortar, copiar, colar,
inverter; recortar a tela para a seleção.

**Transformações** — espelhar, girar 90/180/270°, redimensionar o sprite (vizinho mais
próximo), redimensionar a tela com ancoragem e aparar bordas vazias.

**Cores** — seletor HSV, controles RGB e alfa, entrada hexadecimal, cores recentes,
paleta editável, 8 paletas prontas (DawnBringer, PICO-8, NES, Game Boy, Endesga,
Sweetie 16…), importação `.gpl`/`.pal`/`.hex`, extração das cores do próprio sprite e
substituição de uma cor em todo o sprite.

**Arquivos** — projeto `.pxpaint` (com compressão RLE), exportação PNG (até 16×),
GIF animado (codificador próprio, sem dependências), spritesheet em linha/coluna/grade
com `.json` no formato do Aseprite, importação de imagem como sprite ou camada e
fatiamento de spritesheet em frames.

**Outros** — desfazer/refazer com histórico limitado por memória, salvamento automático
no aparelho, grade configurável, grade de pixels, modo lado a lado e atalhos de teclado.

---

## Estrutura

```
src/
  core/        engine puro, sem React nem DOM
    types.ts       modelo do documento
    color.ts       empacotamento RGBA, HSV, HSL, hex
    blend.ts       19 modos de mesclagem por pixel
    raster.ts      pincéis, linhas, formas, balde, gradiente, transformações
    selection.ts   máscaras e operações booleanas
    composite.ts   achatamento de camadas
    doc.ts         camadas, frames, cels, dimensões
    history.ts     desfazer/refazer com patches mínimos
    palettes.ts    paletas prontas, leitura/escrita, median cut
    io/            PNG, GIF, spritesheet, projeto, salvamento nativo
  store/       estado (zustand) e motor de traços
  ui/          componentes React
android/       projeto nativo gerado pelo Capacitor
scripts/
  make-icons.mjs   gera ícones do PWA e do Android (PNG escrito na mão)
  build-apk.mjs    compila o APK e copia para a Área de Trabalho
tests/
  core.test.ts   83 testes do engine (Node, sem DOM)
  ui.test.mjs    testes de interface num Chrome real emulando um celular
  apk.test.mjs   testes do APK rodando num emulador Android de verdade
```

O documento é mutável e o redesenho é disparado por um contador de revisão — evita
copiar buffers de pixels a cada traço. O histórico guarda apenas o retângulo alterado
de cada cel, e não a imagem inteira.

---

## Testes

```bash
npm run test:core   # engine
npm run test:ui     # navegador (precisa de `npm run preview` rodando)
npm run test:apk    # APK num emulador Android ligado
npm test            # core + ui
```

O teste do APK instala o pacote no emulador, conecta no WebView pelo DevTools,
desenha com toques reais via `adb input`, grava arquivos no armazenamento do
aparelho e confere se o desenho sobrevive ao app ser fechado.

