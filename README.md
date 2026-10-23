# Plano de desenvolvimento — Montagem de vídeo no navegador

Oct 23, 2026 · @Daniel

## Objetivo e escopo

Entregar em 11 a 14 semanas, com um desenvolvedor, um app web que grava takes guiados por roteiro, encaixa esses takes num template e exporta um MP4 inteiramente no navegador, sem render no servidor.

**O que o sistema faz**

- Mostra o roteiro de cada trecho num teleprompter e grava um take por slot do template.
- Permite revisar e regravar cada take antes de montar.
- Monta o vídeo com abertura, encerramento, textos, logo e trilha definidos no template.
- Mostra um preview idêntico ao resultado final.
- Exporta MP4 (H.264 + AAC) e entrega por download ou compartilhamento nativo.

**Fora do escopo do MVP**

- Editor livre de timeline, cortes manuais e efeitos customizados pelo usuário.
- Editor visual de templates: os templates são escritos em JSON pela equipe.
- Armazenamento dos vídeos na nuvem e contas com histórico.
- Render no servidor (fica como fallback opcional, decidido após o piloto).

**Premissas**

- Vídeos finais de até 3 minutos, 720p ou 1080p, 30 fps.
- Público grava majoritariamente no celular.
- Navegadores-alvo: Chrome/Edge recentes, Safari 26+ (iOS e macOS), Firefox desktop.
- Os vídeos brutos nunca saem do aparelho.

## Arquitetura e stack

Todo o processamento roda no navegador com WebCodecs e Mediabunny dentro de Web Workers; o servidor só entrega arquivos estáticos e os templates.

**Pipeline de exportação**

1. **Captura:** `getUserMedia` + `MediaRecorder` com `timeslice`, gravando em pedaços direto no OPFS.
2. **Leitura:** Mediabunny faz o demux; `VideoDecoder` decodifica. Frames são amostrados por timestamp (`t = n / fps`), o que corrige o frame rate variável.
3. **Composição:** função única `renderFrame(template, t, fontes)` num Worker com `OffscreenCanvas` (Canvas2D no MVP). A mesma função alimenta preview e exportação.
4. **Áudio:** mixagem em `OfflineAudioContext` com ducking da trilha, fades e normalização de volume por segmento.
5. **Codificação:** `VideoEncoder` H.264 com aceleração de hardware e controle de fila (`encodeQueueSize`); `AudioEncoder` AAC, com Opus como fallback.
6. **Empacotamento:** Mediabunny gera um MP4 por segmento no OPFS; no fim, os segmentos são unidos sem recodificar.
7. **Entrega:** Web Share API no celular, download ou `showSaveFilePicker` no desktop.

**Stack**

| Camada | Escolha |
| --- | --- |
| Front | Vue 3 (Composition API, `<script setup lang="ts">`) + TypeScript strict + Vite |
| Estado | Pinia |
| Rotas | Vue Router |
| PWA | vite-plugin-pwa |
| Mux/demux | Mediabunny |
| Composição | Canvas2D próprio; PixiJS se precisar de efeitos |
| Schema do template | Zod (tipos TypeScript gerados do schema) |
| Comunicação com Workers | Comlink, com tipos compartilhados |
| Armazenamento local | OPFS |
| Hospedagem | Cloudflare Pages |
| Testes | Vitest + Vue Test Utils + Playwright + aparelhos reais |

**Estrutura do repositório (`takeslot`)**

```
takeslot/
  apps/web/            # PWA: captura, teleprompter, preview, export
  packages/schema/     # schema Zod do template
  packages/engine/     # renderFrame, mix de áudio, pipeline de export
  packages/templates/  # templates JSON + assets
  tools/bench/         # página de benchmark por dispositivo
```

## Front-end em Vue 3 + TypeScript

O Vue cuida só da interface e do estado; todo o processamento de vídeo fica em TypeScript puro no `packages/engine` e no Worker, sem depender do framework.

**Estrutura de `apps/web/src`**

```
src/
  main.ts
  App.vue
  router/index.ts           # /, /gravar/:slot, /revisar, /exportar
  views/
    HomeView.vue            # escolha do template e checagem de capacidades
    RecordView.vue          # câmera + teleprompter de um slot
    ReviewView.vue          # lista de slots, assistir e regravar takes
    ExportView.vue          # preview final, exportação e compartilhamento
  components/
    CameraView.vue
    Teleprompter.vue
    SlotList.vue
    TakeReview.vue
    PreviewPlayer.vue       # canvas + renderFrame na thread principal
    ExportProgress.vue
    UnsupportedNotice.vue
  composables/
    useCapabilities.ts      # WebCodecs, OPFS, Wake Lock, Web Share
    useCamera.ts            # getUserMedia, troca de câmera, permissões
    useRecorder.ts          # MediaRecorder com escrita em pedaços no OPFS
    useTeleprompter.ts      # rolagem do roteiro por velocidade
    useWakeLock.ts
    useExport.ts            # ponte tipada com o Worker via Comlink
  stores/
    project.ts              # template ativo, takes por slot, status de cada slot
    export.ts               # progresso, segmentos prontos, resolução escolhida
  workers/
    export.worker.ts        # decode → renderFrame → encode → mux
  lib/
    opfs.ts                 # leitura, escrita e limpeza de arquivos locais
```

**Decisões que evitam os problemas mais comuns**

- **Objetos de mídia fora da reatividade.** `MediaStream`, `VideoFrame`, `AudioBuffer` e canvases ficam em `shallowRef` ou `markRaw`. Proxies reativos do Vue sobre esses objetos causam lentidão e vazamento de memória.
- **Stores guardam só metadados.** O Pinia guarda ids, durações e status dos takes; os arquivos de vídeo ficam no OPFS e são lidos sob demanda.
- **Worker tipado.** `export.worker.ts` é importado com `new Worker(new URL(..., import.meta.url), { type: 'module' })` e exposto com Comlink; os tipos da API do Worker são compartilhados com o `useExport`.
- **Template tipado de ponta a ponta.** O tipo `Template` vem de `z.infer<typeof TemplateSchema>` no `packages/schema`, usado pela interface, pelo preview e pelo Worker.
- **Preview e exportação com o mesmo código.** `PreviewPlayer.vue` chama a mesma `renderFrame` do `packages/engine` que o Worker usa; o componente só controla o tempo e o canvas.
- **Limpeza explícita.** Cada composable que abre câmera, gravador ou Wake Lock libera o recurso em `onScopeDispose`.
- **TypeScript estrito.** `strict: true`, `noUncheckedIndexedAccess: true` e `vue-tsc --noEmit` no CI.

**Fluxo de telas**

1. **Início:** escolhe o template; `useCapabilities` bloqueia aparelhos sem suporte antes de qualquer gravação.
2. **Gravação:** um slot por vez, com teleprompter e contagem regressiva; o take é salvo no OPFS ao parar.
3. **Revisão:** lista de slots com miniaturas; qualquer take pode ser regravado.
4. **Exportação:** preview completo, benchmark curto, exportação por segmento com barra de progresso e botão de compartilhar.

## Fases e cronograma

O trabalho segue em seis fases de 2 a 3 semanas, e cada uma só começa quando o gate da anterior passa nos quatro aparelhos de referência.

&#91;embedded content: roadmap · 6 fases, 14 semanas, 1 gate por fase\]

A fase 0 é a mais importante: se o Android de entrada não exportar 60 s em até 2 minutos, o plano muda para render no servidor antes de investir nas fases seguintes. A fase 3 concentra o maior risco técnico e tem uma semana a mais de folga.

## Matriz de compatibilidade e testes

O projeto só avança de fase quando os quatro aparelhos de referência passam nos critérios; emulador não conta, porque não reproduz aquecimento nem limite de memória.

| Aparelho de referência | Navegador | Resolução alvo | Expectativa |
| --- | --- | --- | --- |
| iPhone recente | Safari 26+ | 1080p | Exporta; risco de aba descartada em segundo plano |
| Android de entrada (2–4 GB RAM) | Chrome | 720p | Exporta mais devagar; é o pior caso realista |
| Notebook Windows ou macOS | Chrome/Edge | 1080p | Mais rápido que tempo real |
| Notebook | Firefox | 1080p | Exporta; áudio em Opus por falta de AAC |
| Android | Firefox | — | Sem WebCodecs: bloquear com mensagem antes de gravar |

**Métricas medidas em cada aparelho**

- Velocidade de exportação (segundos de vídeo por segundo de processamento).
- Pico de memória e taxa de travamentos em 10 exportações seguidas.
- Defasagem entre áudio e vídeo no final de um vídeo de 3 minutos (meta: < 40 ms).
- Diferença visual entre preview e vídeo exportado (comparação de quadros).
- Taxa de exportações concluídas sem retomada.

## Riscos e mitigações

O maior risco é o celular descartar ou travar a exportação; por isso o checkpoint por segmento entra já na fase 3, não como melhoria posterior.

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| iOS descarta a aba durante a exportação | Alto | Checkpoint por segmento no OPFS, Wake Lock, aviso para não sair da tela, retomada automática |
| Celular de entrada lento ou aquecendo | Alto | Benchmark nos 2 primeiros segundos, queda automática para 720p, tempo estimado visível |
| Vazamento de memória com `VideoFrame` | Alto | `close()` imediato, controle de fila do encoder, teste de 10 exportações seguidas |
| Dessincronia de áudio por frame rate variável | Médio | Amostragem por timestamp e áudio mixado por tempo absoluto |
| Preview diferente do vídeo exportado | Médio | Uma única função `renderFrame` para os dois; teste de comparação de quadros |
| Sem AAC no Firefox e no Linux | Médio | Opus como fallback e aviso de compatibilidade; render no servidor só se o piloto mostrar necessidade |
| Firefox para Android sem WebCodecs | Baixo | Detecção na entrada e mensagem antes de gravar |
| Mudança de API ou bug em navegador | Médio | Detecção de capacidades em tempo de execução e telemetria de erros anônima |

**Gatilho para render no servidor:** se mais de 10% das exportações no piloto falharem ou exigirem retomada, ativar um fallback no servidor para os aparelhos afetados. O template em JSON já permite isso sem reescrever o motor.

## Custos e próximos passos

O custo de infraestrutura fica perto de zero em qualquer volume; o custo real é o tempo de desenvolvimento, estimado em 11 a 14 semanas de um desenvolvedor.

| Item | Custo mensal estimado |
| --- | --- |
| Hospedagem estática (Cloudflare Pages) | US$ 0 no plano gratuito |
| Domínio | cerca de US$ 1–2 (rateio anual) |
| Backend de templates (opcional, Supabase ou Neon) | US$ 0 no plano gratuito |
| Telemetria de erros (Sentry ou similar) | US$ 0 no plano gratuito |
| Fallback de render no servidor, se ativado | dezenas de dólares por mês a cada 10 mil vídeos |

Os valores são aproximados e devem ser conferidos nas páginas de preço antes de contratar.

**Próximos passos**

- [x] Criar o repositório `takeslot` com a estrutura do monorepo
- [ ] Escrever a prova de conceito da fase 0
- [ ] Separar os quatro aparelhos de referência para teste
- [ ] Definir o primeiro template real (slots, textos e trilha)
- [ ] Rodar o benchmark e decidir, no gate da fase 0, se o plano segue no cliente

## Como rodar

Requer Node 20+. O monorepo usa npm workspaces (`apps/web`, `packages/*`, `tools/bench`).

```bash
npm install
npm run dev          # app em http://localhost:5173
npm run bench        # página de benchmark (fase 0), exposta na rede local para testar no celular
npm test             # testes unitários (Vitest + Vue Test Utils)
npm run typecheck    # tsc / vue-tsc em todos os pacotes
npm run build        # build de produção do app (PWA) em apps/web/dist
```

Para o teste ponta a ponta (grava com câmera falsa, exporta e testa a retomada), use o Chrome instalado, que tem AAC:

```bash
PW_CHANNEL=chrome npm run test:e2e
```

Sem `PW_CHANNEL`, o Playwright usa o próprio Chromium (`npx playwright install chromium`), e o áudio sai em Opus.

A câmera e o OPFS exigem contexto seguro: no celular, abra o app por HTTPS (ou pelo deploy de preview do Cloudflare Pages). O deploy é feito com `npm run deploy -w @takeslot/web` (veja "Admin de templates"); `_headers` está em `apps/web/public`, e o Pages já serve a SPA sem regra de redirecionamento.

**Onde está cada parte do pipeline**

| Etapa | Arquivo |
| --- | --- |
| Schema e tipos do template | `packages/schema/src/index.ts` |
| Linha do tempo e `renderFrame` (preview e exportação) | `packages/engine/src/timeline.ts`, `packages/engine/src/render.ts` |
| Mixagem (ducking, fades, normalização) | `packages/engine/src/audio-plan.ts`, `packages/engine/src/audio-mix.ts` |
| Amostragem por timestamp, encode, checkpoint e união dos pedaços | `packages/engine/src/sampler.ts`, `packages/engine/src/export.ts` |
| Worker de exportação (OPFS + Comlink) | `apps/web/src/workers/export.worker.ts` |
| Gravação em pedaços no OPFS | `apps/web/src/composables/useRecorder.ts` |
| Templates e assets embutidos (usados quando não há backend) | `packages/templates/templates/*.json`, `packages/templates/assets/` |
| API de templates e arquivos (Cloudflare Pages Functions + D1 + R2) | `apps/web/functions/`, `apps/web/migrations/`, `apps/web/wrangler.toml` |
| Admin de templates | `apps/web/src/admin/` (rota `/admin`) |

**Vídeos fixos no meio do template**

Um template pode ter clipes fixos (vinheta, trecho institucional) entre os trechos gravados, em `clips`. Cada clipe diz depois de qual trecho entra (`after`: `"intro"` ou o id de um slot) e quanto dele é usado:

```json
"clips": [
  { "id": "vinheta", "label": "Vinheta", "asset": "vinheta-marca.mp4", "after": "desafio", "duration": 4, "volume": 0.8, "duckMusic": true }
]
```

Opcionais: `trimStart` (segundos), `fit` (`cover` ou `contain`), `background` e `layers` (textos e imagens por cima, como nos slots). O arquivo vai em `packages/templates/assets/` e deve ser MP4 H.264/AAC, na proporção do template e com pelo menos a duração declarada. O app baixa o clipe na primeira exportação e o guarda em cache para uso offline; ele fica fora do precache para não baixar os vídeos de todos os templates na instalação.

A trilha de exemplo (`trilha-leve.wav`) é gerada por `npm run gen:music`, e a vinheta de exemplo (`vinheta-marca.mp4`) por `npm run gen:clip` (usa o Chrome instalado). A telemetria de erros só envia algo se `VITE_TELEMETRY_URL` estiver definido.

## Admin de templates

Em `/admin`, a equipe cria e edita templates sem mexer em JSON. Na **Sequência do vídeo**, os trechos gravados pelo usuário e os vídeos pré-gravados ficam numa lista única, que pode ser reordenada arrastando os itens ou pelas setas. A abertura e o encerramento são opcionais e ficam fixos nas pontas. O preview ao lado usa a mesma `renderFrame` da exportação, com marcadores no lugar das gravações. Também dá para editar roteiro, limites de duração, textos e imagens por cima, logo, trilha, formato e transição. Para o que o formulário não cobre, há um editor de JSON validado.

- **Rascunho e publicação:** salvar guarda o rascunho; publicar cria uma versão imutável. O app sempre recebe a versão publicada mais recente, e quem já começou a gravar continua na versão em que começou (o app guarda uma cópia do template).
- **Arquivos:** logos, trilhas e vídeos ficam no R2, com chave derivada do conteúdo e cache permanente. Vídeos que não estejam em MP4 H.264/AAC são convertidos no navegador do admin antes do envio. Um arquivo em uso por algum template não pode ser apagado.
- **Ordem no app:** a ordem da lista de templates no admin é a ordem que o usuário vê. Arquivar um template tira ele do app sem apagar nada.
- **Sem backend:** se a API não responder (desenvolvimento só com `npm run dev`, ou nada publicado ainda), o app usa os templates embutidos em `packages/templates`. Offline, usa a última lista recebida.
- **Acesso:** todas as rotas `/api/admin/*` exigem o token `ADMIN_TOKEN`, que fica só na aba do navegador. Para ter login por e-mail, coloque o Cloudflare Access na frente de `/admin*` e `/api/admin/*`.

**Desenvolvimento local** (D1 e R2 simulados pelo wrangler, sem conta na Cloudflare):

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars   # defina ADMIN_TOKEN (mínimo de 16 caracteres)
npm run dev:api      # build + migrações locais + API em http://localhost:8788 (app e admin servidos por ele)
npm run dev          # opcional: Vite com hot reload em :5173, repassando /api para :8788
```

Em `/admin`, entre com o token e use **Importar exemplos** para copiar os templates embutidos para o backend.

**Produção (Cloudflare Pages)**, uma vez:

```bash
cd apps/web
npx wrangler d1 create takeslot                      # copie o database_id para o wrangler.toml
npx wrangler r2 bucket create takeslot-assets
npx wrangler d1 migrations apply takeslot --remote
npx wrangler pages secret put ADMIN_TOKEN
npm run deploy
```

**Custos:** D1 e R2 cabem no plano gratuito no começo (5 GB e 10 GB). O R2 não cobra pela transferência de saída, e isso pesa aqui, porque cada usuário baixa os vídeos pré-gravados.

Testes ponta a ponta do admin contra o backend local (login, importação, reordenação, publicação e gravação/exportação com a nova ordem):

```bash
PW_CHANNEL=chrome npm run test:e2e:admin
```

