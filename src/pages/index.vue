<template>
  <v-container class="fill-height d-flex justify-center align-center">
    <v-progress-linear
      v-model="progress"
      color="primary"
      style="width: 400px"
    />
  </v-container>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted, ref } from 'vue'

  const progress = ref(0)
  let checkTimer: number | undefined
  let runTimer: number | undefined

  async function loadCheck () {
    const res = await fetch('/check')
    const data = await res.json()
    progress.value = data.v
    if (data.v >= 100) stopPolling()
  }

  function startPolling () {
    checkTimer = window.setInterval(loadCheck, 1000)

    runTimer = window.setInterval(async () => {
      if (progress.value >= 100) return
      await fetch('/run', { method: 'POST' })
    }, 2000)
  }

  function stopPolling () {
    clearInterval(checkTimer)
    clearInterval(runTimer)
  }

  onMounted(() => {
    loadCheck()
    startPolling()
  })

  onUnmounted(stopPolling)
</script>
