<template>
  <v-container class="d-flex flex-column align-center py-8">
    <div class="text-body-large text-medium-emphasis mb-1">{{ eta }}</div>

    <v-progress-linear
      v-model="progress"
      class="mb-8"
      color="primary"
      style="width: 400px"
    />

    <v-footer app class="d-flex justify-center" height="48">
      <span class="text-medium-emphasis mr-3">Y-axis</span>

      <v-btn-toggle
        v-model="useGlobalMax"
        density="compact"
        mandatory
        variant="outlined"
      >
        <v-btn :value="true">Global</v-btn>
        <v-btn :value="false">Local</v-btn>
      </v-btn-toggle>

      <span class="text-medium-emphasis mr-3 ml-16">Granularity</span>

      <v-btn-toggle
        v-model="granularity"
        density="compact"
        mandatory
        variant="outlined"
      >
        <v-btn value="daily">Daily</v-btn>
        <v-btn value="weekly">Weekly</v-btn>
      </v-btn-toggle>

      <span class="text-medium-emphasis mr-3 ml-16">Metric</span>

      <v-btn-toggle
        v-model="metric"
        density="compact"
        mandatory
        variant="outlined"
      >
        <v-btn value="count">Count</v-btn>
        <v-btn value="added">Added</v-btn>
        <v-btn value="closed">Closed</v-btn>
      </v-btn-toggle>
    </v-footer>

    <div v-for="year in years" :key="year.label" class="mb-4">
      <div class="text-display-large mb-1">{{ year.label }}</div>

      <div class="d-flex align-stretch">
        <v-sheet
          :class="['d-flex', { 'justify-end': !year.isCurrent }]"
          :height="200"
          :width="366 * 3"
        >
          <v-sparkline
            auto-line-width
            color="primary"
            height="200"
            :line-width="granularity === 'weekly' ? 18 : 2"
            :max="useGlobalMax ? globalMax : year.max"
            :min="0"
            :model-value="year.counts"
            :style="{ width: `${year.counts.length * barScale}px` }"
            type="bar"
            :width="year.counts.length * barScale"
          />
        </v-sheet>

        <div
          class="d-flex flex-column justify-space-between ml-2 my-n2 text-label-small text-medium-emphasis"
          style="width: 40px"
        >
          <small>{{ useGlobalMax ? globalMax : year.max }}</small>
          <small v-for="tick in (useGlobalMax ? globalTicks : year.ticks)" :key="tick">{{ tick % (metricBase * 3) === 0 ? tick : '-' }}</small>
          <small>0</small>
        </div>
      </div>
    </div>

    <v-snackbar-queue v-model="snackbars" location="bottom end" total-visible="5" variant="tonal" />
  </v-container>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import { useDate } from 'vuetify'

  interface DayEntry {
    date: string
    count: number
    added: number
    closed: number
  }

  const adapter = useDate()

  const progress = ref(0)
  const openIssues = ref<DayEntry[]>([])
  const snackbars = ref<any[]>([])
  const useGlobalMax = ref(false)
  const granularity = ref<'daily' | 'weekly'>('daily')
  const metric = ref<'count' | 'added' | 'closed'>('count')
  const seenLogs = new Set<string>()

  const START_DATE = '2016-12-14'
  const SECS_PER_DAY = 4 // 30 queries/min, 2 per day = 15 days/min

  function formatEta (secs: number) {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = Math.floor(secs % 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const eta = computed(() => {
    const entries = openIssues.value
    const today = adapter.date()!
    const start = adapter.date(START_DATE)!
    const totalDays = adapter.getDiff(today, start, 'days')
    if (entries.length === 0) {
      return formatEta(totalDays * SECS_PER_DAY)
    }
    const daysRemaining = totalDays - entries.length
    if (daysRemaining <= 0) return '00:00:00'
    return formatEta(daysRemaining * SECS_PER_DAY)
  })

  let checkTimer: number | undefined
  let runTimer: number | undefined
  let logsTimer: number | undefined

  function weekKey (dateStr: string): string {
    const d = adapter.date(dateStr)!
    const year = adapter.getYear(d)
    const week = adapter.getWeek(d)
    return `${year}-W${String(week).padStart(2, '0')}`
  }

  const aggregatedEntries = computed(() => {
    if (granularity.value === 'daily') return openIssues.value
    const byWeek = new Map<string, DayEntry[]>()
    for (const entry of openIssues.value) {
      const key = weekKey(entry.date)
      if (!byWeek.has(key)) byWeek.set(key, [])
      byWeek.get(key)!.push(entry)
    }
    return [...byWeek.values()].map(days => ({
      date: days.at(-1)!.date,
      count: Math.round(days.reduce((s, d) => s + d.count, 0) / days.length),
      added: days.reduce((s, d) => s + d.added, 0),
      closed: days.reduce((s, d) => s + d.closed, 0),
    }))
  })

  const metricBase = computed(() => metric.value === 'count' ? 100 : 10)

  function makeTicks (max: number) {
    const base = metricBase.value
    const ticks: number[] = []
    for (let v = max - base; v > 0; v -= base) {
      ticks.push(v)
    }
    return ticks
  }

  const globalMax = computed(() => {
    const base = metricBase.value
    if (aggregatedEntries.value.length === 0) return base
    return Math.ceil(Math.max(...aggregatedEntries.value.map(e => e[metric.value])) / base) * base
  })

  const globalTicks = computed(() => makeTicks(globalMax.value))

  const barScale = computed(() => granularity.value === 'weekly' ? 21 : 3)

  const currentYear = adapter.getYear(adapter.date()!)

  const years = computed(() => {
    const grouped = new Map<number, number[]>()
    for (const entry of aggregatedEntries.value) {
      const year = adapter.getYear(adapter.date(entry.date)!)
      if (!grouped.has(year)) grouped.set(year, [])
      grouped.get(year)!.push(entry[metric.value])
    }
    const base = metricBase.value
    return Array.from(grouped.entries())
      .toSorted(([a]: [number, number[]], [b]: [number, number[]]) => a - b)
      .map(([y, counts]: [number, number[]]) => {
        const max = Math.ceil(Math.max(...counts) / base) * base || base
        return {
          isCurrent: y === currentYear,
          label: String(y),
          counts,
          max,
          ticks: makeTicks(max),
        }
      })
  })

  function formatDay (iso: string) {
    const d = adapter.date(iso)!
    return `${adapter.getDate(d)} ${adapter.format(d, 'monthShort')} '${String(adapter.getYear(d)).slice(2)}`
  }

  async function loadCheck () {
    const res = await fetch('/check')
    const data = await res.json()
    progress.value = data.progress
    openIssues.value = data.openIssues
    if (data.progress >= 100) stopPolling()
  }

  async function loadLogs () {
    const res = await fetch('/logs')
    const data = await res.json()
    for (const line of data.lines as string[]) {
      if (seenLogs.has(line)) continue
      seenLogs.add(line)
      const match = line.match(/^(.+?) \[(INFO|ERROR)] (.+)$/)
      if (match) {
        const msg = match[3]!
        const dayMatch = msg.match(/^(\d{4}-\d{2}-\d{2}): \+(\d+) -(\d+)/)
        const text = dayMatch
          ? `${formatDay(dayMatch[1]!)}: ${dayMatch[2]} issues added, ${dayMatch[3]} issues removed`
          : msg
        snackbars.value.push({
          title: adapter.format(adapter.date(match[1]!)!, 'keyboardDateTime'),
          text,
          color: match[2] === 'ERROR' ? 'error' : 'info',
        })
      }
    }
  }

  function startPolling () {
    checkTimer = window.setInterval(loadCheck, 1000)
    logsTimer = window.setInterval(loadLogs, 1000)
    runTimer = window.setInterval(async () => {
      if (progress.value >= 100) return
      await fetch('/run', { method: 'POST' })
    }, 2000)
  }

  function stopPolling () {
    clearInterval(checkTimer)
    clearInterval(runTimer)
    clearInterval(logsTimer)
  }

  onMounted(() => {
    loadCheck()
    loadLogs()
    startPolling()
  })

  onUnmounted(stopPolling)
</script>
