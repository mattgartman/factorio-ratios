import type { Settings } from './solver'

const ALWAYS = ['oil-refinery', 'chemical-plant', 'centrifuge', 'rocket-silo']

export interface Preset {
  id: string
  label: string
  blurb: string
  apply: Partial<Settings>
}

export const PRESETS: Preset[] = [
  {
    id: 'early',
    label: 'Early game',
    blurb: 'Assembler 1, stone furnace, yellow belt',
    apply: {
      machines: ['assembling-machine-1', 'stone-furnace', ...ALWAYS],
      drill: 'electric-mining-drill',
      belt: 'transport-belt',
      module: 'none',
      drillModule: 'none',
      beacons: 0,
    },
  },
  {
    id: 'mid',
    label: 'Mid game',
    blurb: 'Assembler 2, steel furnace, red belt',
    apply: {
      machines: ['assembling-machine-2', 'steel-furnace', ...ALWAYS],
      drill: 'electric-mining-drill',
      belt: 'fast-transport-belt',
      module: 'none',
      drillModule: 'none',
      beacons: 0,
    },
  },
  {
    id: 'late',
    label: 'Late game',
    blurb: 'Assembler 3, electric furnace, blue belt',
    apply: {
      machines: ['assembling-machine-3', 'electric-furnace', ...ALWAYS],
      drill: 'electric-mining-drill',
      belt: 'express-transport-belt',
      module: 'none',
      drillModule: 'none',
    },
  },
  {
    id: 'space',
    label: 'Space Age',
    blurb: 'Foundry, EM plant, biochamber, cryo plant, big drill, green belt',
    apply: {
      machines: [
        'assembling-machine-3',
        'electric-furnace',
        'foundry',
        'electromagnetic-plant',
        'biochamber',
        'cryogenic-plant',
        'crusher',
        'captive-biter-spawner',
        ...ALWAYS,
      ],
      drill: 'big-mining-drill',
      belt: 'turbo-transport-belt',
    },
  },
]

export const DEFAULT_SETTINGS: Settings = {
  planet: 'nauvis',
  unit: 'min',
  belt: 'fast-transport-belt',
  beltStack: 1,
  machines: PRESETS[1].apply.machines!,
  drill: 'electric-mining-drill',
  module: 'none',
  drillModule: 'none',
  beacons: 0,
  beaconModule: 'speed-module-3',
  miningProd: 0,
  recipeFor: {},
  rows: {},
  targets: [{ item: 'electronic-circuit', rate: 600 }],
}
