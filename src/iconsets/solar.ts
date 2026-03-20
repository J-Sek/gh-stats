// @unocss-include

// Local Solar iconset aliases based on vuetifyjs/vuetify#22706
// Once that PR is merged, replace this file with: import { aliases, solar } from 'vuetify/iconsets/solar'

import type { IconAliases, IconSet } from 'vuetify'
import { h } from 'vue'

const aliases: IconAliases = {
  collapse: 'i-solar:alt-arrow-up-linear',
  complete: 'i-solar:check-circle-linear',
  cancel: 'i-solar:close-circle-linear',
  close: 'i-solar:close-circle-linear',
  delete: 'i-solar:close-circle-linear',
  clear: 'i-solar:close-circle-linear',
  success: 'i-solar:check-circle-linear',
  info: 'i-solar:info-square-linear',
  warning: 'i-solar:danger-triangle-linear',
  error: 'i-solar:danger-circle-linear',
  prev: 'i-solar:alt-arrow-left-linear',
  next: 'i-solar:alt-arrow-right-linear',
  checkboxOn: 'i-solar:check-square-bold',
  checkboxOff: 'i-solar:stop-linear',
  checkboxIndeterminate: 'i-solar:minus-square-bold',
  delimiter: 'i-solar:record-bold',
  sortAsc: 'i-solar:arrow-up-linear',
  sortDesc: 'i-solar:arrow-down-linear',
  expand: 'i-solar:alt-arrow-down-linear',
  menu: 'i-solar:hamburger-menu-linear',
  subgroup: 'i-solar:alt-arrow-down-linear',
  dropdown: 'i-solar:alt-arrow-down-linear',
  radioOn: 'i-solar:record-bold',
  radioOff: 'i-solar:record-linear',
  edit: 'i-solar:pen-linear',
  ratingEmpty: 'i-solar:star-linear',
  ratingFull: 'i-solar:star-bold',
  ratingHalf: 'svg:M12 2C11.053 2 10.42 3.136 9.153 5.408l-.328.588c-.36.646-.54.969-.82 1.182s-.63.292-1.33.45l-.636.144C3.58 8.328 2.349 8.607 2.057 9.548c-.293.94.546 1.921 2.223 3.882l.434.508c.476.556.715.835.821 1.18c.108.344.072.716 0 1.46l-.066.676c-.253 2.617-.38 3.925.387 4.507c.765.58 1.917.05 4.22-1.01l.596-.274c.654-.301.981-.452 1.328-.452V2Z',
  loading: 'i-solar:refresh-linear',
  first: 'i-solar:double-alt-arrow-left-bold',
  last: 'i-solar:double-alt-arrow-right-bold',
  unfold: 'i-solar:round-alt-arrow-down-linear',
  file: 'i-solar:paperclip-linear',
  plus: 'i-solar:add-circle-linear',
  minus: 'i-solar:minus-circle-linear',
  calendar: 'i-solar:calendar-linear',
  treeviewCollapse: 'i-solar:round-alt-arrow-down-linear',
  treeviewExpand: 'i-solar:round-alt-arrow-right-linear',
  tableGroupExpand: 'i-solar:round-alt-arrow-right-linear',
  tableGroupCollapse: 'i-solar:round-alt-arrow-down-linear',
  eyeDropper: 'i-solar:pipette-linear',
  upload: 'i-solar:upload-linear',
  color: 'i-solar:palette-linear',
  arrowup: 'i-solar:arrow-up-linear',
  arrowdown: 'i-solar:arrow-down-linear',
  arrowleft: 'i-solar:arrow-left-linear',
  arrowright: 'i-solar:arrow-right-linear',
  backspace: 'i-solar:backspace-linear',
  play: 'i-solar:play-linear',
  pause: 'i-solar:pause-linear',
  fullscreen: 'i-solar:maximize-square-minimalistic-linear',
  fullscreenExit: 'i-solar:minimize-square-minimalistic-linear',
  volumeHigh: 'i-solar:volume-loud-linear',
  volumeMedium: 'i-solar:volume-small-linear',
  volumeLow: 'i-solar:volume-linear',
  volumeOff: 'i-solar:volume-cross-linear',
  search: 'i-solar:magnifer-linear',
  command: 'i-solar:command-linear',
  ctrl: 'i-solar:text-bold-linear',
  space: 'i-solar:keyboard-linear',
  shift: 'i-solar:arrow-up-linear',
  alt: 'i-solar:text-italic-linear',
  enter: 'i-solar:arrow-right-linear',
}

const VClassIcon = (props: any) => h('i', { class: [props.icon, 'v-icon__svg'] })

const solar: IconSet = {
  component: (props: any) => h(VClassIcon, { ...props, class: 'solar' }),
}

export { aliases, solar }
