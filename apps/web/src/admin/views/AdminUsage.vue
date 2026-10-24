<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api, type DimRow, type UsageRow } from '../api'
import { byDim, daily, DEVICE_LABELS, DIM_LABELS, EVENT_LABELS, groupBy, rate, totals } from '../usage'
import AdminNav from '../components/AdminNav.vue'

const days = ref(7)
const rows = ref<UsageRow[]>([])
const dims = ref<DimRow[]>([])
const dim = ref('region')
const since = ref('')
const today = ref('')
const names = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const [usage, templates] = await Promise.all([api.usage(days.value), api.listTemplates()])
    rows.value = usage.rows
    dims.value = usage.dims ?? []
    since.value = usage.since
    today.value = usage.today
    names.value = Object.fromEntries(templates.map((t) => [t.id, t.name]))
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

const sum = computed(() => totals(rows.value))
const series = computed(() => daily(rows.value, 'export_done', since.value, today.value))
const visitsSeries = computed(() => daily(rows.value, 'visit', since.value, today.value))
const peak = computed(() => Math.max(1, ...series.value.map((d) => d.count), ...visitsSeries.value.map((d) => d.count)))
const byTemplate = computed(() =>
  [...groupBy(rows.value, 'templateId').entries()]
    .map(([id, c]) => ({ id, name: names.value[id] ?? id, ...c }))
    .sort((a, b) => (b.export_done ?? 0) - (a.export_done ?? 0) || (b.template_selected ?? 0) - (a.template_selected ?? 0)),
)
const byDevice = computed(() => [...groupBy(rows.value, 'device').entries()].map(([id, c]) => ({ id, name: DEVICE_LABELS[id] ?? id, ...c })))

const dimRows = computed(() => byDim(dims.value, dim.value))
const dimPeak = computed(() => Math.max(1, ...dimRows.value.map((r) => r.counts.visit ?? 0)))
const showAllDim = ref(false)
watch(dim, () => (showAllDim.value = false))

const cards = ['visit', 'template_selected', 'take_recorded', 'export_started', 'export_done', 'shared'] as const
const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

watch(days, load)
onMounted(load)
</script>

<template>
  <main class="page wide">
    <AdminNav />
    <section class="row head">
      <h1>Uso</h1>
      <label class="field period">
        <span>Período</span>
        <select v-model.number="days">
          <option :value="1">Hoje</option>
          <option :value="7">Últimos 7 dias</option>
          <option :value="30">Últimos 30 dias</option>
        </select>
      </label>
    </section>
    <p class="muted small">
      Contagem anônima, somada por dia (horário de Brasília): etapa, modelo, aparelho e detalhes gerais do público (localização aproximada pelo
      IP, que não é guardado, origem, navegador...). Cada detalhe é contado separado, sem montar o perfil de ninguém. Sem cookies e sem nada dos vídeos.
      Bloqueadores de anúncio podem impedir parte da contagem.
    </p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Carregando…</p>
    <template v-else>
      <div class="cards" data-testid="usage-cards">
        <div v-for="event in cards" :key="event" class="card stat" :data-testid="`usage-${event}`">
          <span class="muted">{{ EVENT_LABELS[event] }}</span>
          <strong>{{ (sum[event] ?? 0).toLocaleString('pt-BR') }}</strong>
        </div>
      </div>

      <section class="card">
        <h2>Funil</h2>
        <ul class="funnel">
          <li>Visitas que escolheram um modelo: <strong>{{ rate(sum.template_selected, sum.visit) }}</strong></li>
          <li>Exportações que terminaram: <strong>{{ rate(sum.export_done, sum.export_started) }}</strong>
            <span v-if="sum.export_failed" class="warn"> · {{ sum.export_failed }} com falha</span></li>
          <li>Vídeos prontos que foram compartilhados ou baixados: <strong>{{ rate(sum.shared, sum.export_done) }}</strong></li>
        </ul>
      </section>

      <section class="card">
        <h2>Por dia</h2>
        <p class="muted small legend"><span class="dot visits" /> Visitas <span class="dot done" /> Vídeos prontos</p>
        <div class="chart" role="img" :aria-label="`Vídeos prontos por dia: ${series.map((d) => `${shortDay(d.day)} ${d.count}`).join(', ')}`">
          <div v-for="(d, i) in series" :key="d.day" class="col" :title="`${shortDay(d.day)}: ${visitsSeries[i]?.count ?? 0} visitas, ${d.count} vídeos`">
            <div class="bars">
              <div class="bar visits" :style="{ height: `${((visitsSeries[i]?.count ?? 0) / peak) * 100}%` }" />
              <div class="bar done" :style="{ height: `${(d.count / peak) * 100}%` }" />
            </div>
            <span class="label">{{ shortDay(d.day) }}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Por modelo</h2>
        <p v-if="byTemplate.length === 0" class="muted">Nenhum uso registrado no período.</p>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr><th>Modelo</th><th>Escolhido</th><th>Vídeos prontos</th><th>Falhas</th><th>Compartilhados</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in byTemplate" :key="t.id">
                <td>{{ t.name }}</td>
                <td>{{ t.template_selected ?? 0 }}</td>
                <td>{{ t.export_done ?? 0 }}</td>
                <td :class="{ warn: (t.export_failed ?? 0) > 0 }">{{ t.export_failed ?? 0 }}</td>
                <td>{{ t.shared ?? 0 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card" data-testid="usage-dims">
        <h2>Público</h2>
        <div class="chips" role="tablist">
          <button
            v-for="(label, key) in DIM_LABELS"
            :key="key"
            type="button"
            role="tab"
            class="chip"
            :aria-selected="dim === key"
            :class="{ active: dim === key }"
            @click="dim = key"
          >
            {{ label }}
          </button>
        </div>
        <p v-if="dimRows.length === 0" class="muted">Nada registrado para {{ DIM_LABELS[dim]?.toLowerCase() }} no período.</p>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr><th>{{ DIM_LABELS[dim] }}</th><th>Visitas</th><th>Escolheram modelo</th><th>Vídeos prontos</th><th>Conversão</th><th>Falhas</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in showAllDim ? dimRows : dimRows.slice(0, 15)" :key="r.value">
                <td class="dim-name">
                  <span class="meter" :style="{ width: `${((r.counts.visit ?? 0) / dimPeak) * 100}%` }" />
                  <span>{{ r.label }}</span>
                </td>
                <td>{{ r.counts.visit ?? 0 }}</td>
                <td>{{ r.counts.template_selected ?? 0 }}</td>
                <td>{{ r.counts.export_done ?? 0 }}</td>
                <td>{{ rate(r.counts.export_done, r.counts.visit) }}</td>
                <td :class="{ warn: (r.counts.export_failed ?? 0) > 0 }">{{ r.counts.export_failed ?? 0 }}</td>
              </tr>
            </tbody>
          </table>
          <button v-if="dimRows.length > 15" type="button" class="link" @click="showAllDim = !showAllDim">
            {{ showAllDim ? 'Mostrar menos' : `Mostrar todos (${dimRows.length})` }}
          </button>
        </div>
        <p class="muted small">
          Localização vem do IP (boa para país e estado, aproximada para cidade). Para saber de onde as pessoas vêm, use links com
          <code>?utm_source=instagram&amp;utm_campaign=nome</code>: o WhatsApp e alguns apps não informam a origem.
        </p>
      </section>

      <section class="card">
        <h2>Por aparelho</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Aparelho</th><th>Visitas</th><th>Exportações</th><th>Prontos</th><th>Taxa de falha</th></tr>
            </thead>
            <tbody>
              <tr v-for="d in byDevice" :key="d.id">
                <td>{{ d.name }}</td>
                <td>{{ d.visit ?? 0 }}</td>
                <td>{{ d.export_started ?? 0 }}</td>
                <td>{{ d.export_done ?? 0 }}</td>
                <td :class="{ warn: (d.export_failed ?? 0) > 0 }">{{ rate(d.export_failed, d.export_started) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.wide {
  width: min(960px, 100%);
}
.head {
  justify-content: space-between;
  align-items: end;
}
h1,
h2 {
  margin: 0;
}
h2 {
  font-size: 1.05rem;
  margin-bottom: 0.75rem;
}
.small {
  font-size: 0.85rem;
  margin: 0;
}
.period {
  width: 12rem;
}
.cards {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}
.stat {
  display: grid;
  gap: 0.25rem;
}
.stat span {
  font-size: 0.8rem;
}
.stat strong {
  font-size: 1.6rem;
  font-variant-numeric: tabular-nums;
}
.funnel {
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.35rem;
}
.legend {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}
.dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 2px;
  display: inline-block;
}
.chart {
  display: flex;
  align-items: stretch;
  gap: 4px;
  height: 160px;
  overflow-x: auto;
}
.col {
  flex: 1;
  min-width: 18px;
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 4px;
}
.bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
}
.bar {
  flex: 1;
  min-height: 1px;
  border-radius: 3px 3px 0 0;
}
.visits {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--border);
}
.done {
  background: var(--accent);
}
.label {
  font-size: 0.65rem;
  color: var(--muted);
  text-align: center;
  white-space: nowrap;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}
th,
td {
  text-align: left;
  padding: 0.45rem 0.5rem;
  border-bottom: 1px solid var(--border);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}
.chip {
  border: 1px solid var(--border);
  background: transparent;
  color: inherit;
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}
.dim-name {
  position: relative;
  min-width: 10rem;
}
.dim-name span:last-child {
  position: relative;
}
.meter {
  position: absolute;
  inset: 0.2rem auto 0.2rem 0;
  background: var(--surface-2);
  border-radius: 3px;
}
.link {
  margin-top: 0.5rem;
  background: none;
  border: 0;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
}
code {
  font-size: 0.8rem;
}
th {
  color: var(--muted);
  font-weight: 600;
}
</style>
