<script setup lang="ts">
// app-bar の Window preset ボタン。
//
// 以前は左サイドバーに CT / MR / PT の 3 ブロックを縦に並べていたが、
//   - 読影中に最もよく触るのに、シリーズ一覧の下に押し出されて到達できない (16 series で 1136px 下)
//   - 3 ブロックのうち 2 つは常に無関係 (見ている box は 1 modality)
// という 2 点があったので、**選択中 box の modality に応じて出し分ける 1 ボタン**に畳んだ。
import { computed, ref } from 'vue';
import { useSegmentationStore } from '../stores/segmentation';

const prop = defineProps<{
  // 選択中 box の modality ('CT' | 'PT' | 'PET' | 'MR' | その他/未定は '')。
  // これで出すプリセット群を決める。
  modality?: string;
}>();

const emit = defineEmits<{
  (e: 'presetSelected', id: string): void;
  (e: 'redraw'): void;
}>();

const activePreset = ref<string | null>(null);

const presetClicked = (id: string) => {
  activePreset.value = (id === 'Reset') ? null : id;
  emit('presetSelected', id);
};

// CT 用 (HU window)。実際の WC/WW は DicomView の presetSelected と一致させること。
const wPresets = [
  { id: 'Lung',  label: '肺',    hint: '肺ウィンドウ — 中心値 WC -700 / 幅 WW 1800' },
  { id: 'Med',   label: '縦隔',  hint: '縦隔ウィンドウ — 中心値 WC 0 / 幅 WW 320' },
  { id: 'Abd',   label: '腹部',  hint: '腹部ウィンドウ — 中心値 WC 30 / 幅 WW 200' },
  { id: 'Bone',  label: '骨',    hint: '骨ウィンドウ — 中心値 WC 200 / 幅 WW 2000' },
  { id: 'Brain', label: '脳',    hint: '脳ウィンドウ — 中心値 WC 30 / 幅 WW 80' },
  { id: 'Fat',   label: '脂肪',  hint: '脂肪ウィンドウ — 中心値 WC 10 / 幅 WW 275' },
];

// MR は信号強度が任意単位なので固定 window を作れない。volume の分位点から算出する。
const wPresetsMr = [
  { id: 'MR-AUTO',       label: '自動',  hint: 'この MR ボリュームの 1–99 パーセンタイルからウィンドウを計算します' },
  { id: 'MR-AUTO-TIGHT', label: 'タイト', hint: '5–95 パーセンタイルから算出 — コントラスト高め、端値を切る可能性あり' },
  { id: 'MR-AUTO-WIDE',  label: '広め',  hint: '0.1–99.9 パーセンタイルから算出 — 極端値を可視化します' },
];

const wPresetsPet = [
  { id: 'SUV-0-3',  label: '0-3',  hint: '表示範囲 SUV 0–3（低集積・高コントラスト）' },
  { id: 'SUV-0-6',  label: '0-6',  hint: '表示範囲 SUV 0–6（全身 FDG の標準的な範囲）' },
  { id: 'SUV-0-10', label: '0-10', hint: '表示範囲 SUV 0–10' },
  { id: 'SUV-0-15', label: '0-15', hint: '表示範囲 SUV 0–15（高集積）' },
];

const wPresetsPetOther = [
  { id: 'SUV-0-100',   label: '0-100'   },
  { id: 'SUV-0-1000',  label: '0-1000'  },
  { id: 'SUV-0-10000', label: '0-10000' },
];

const mod = computed(() => (prop.modality ?? '').toUpperCase());
const isPt = computed(() => mod.value === 'PT' || mod.value === 'PET');
const isMr = computed(() => mod.value === 'MR');
// CT / 不明はどちらも CT プリセットを出す (DICOM の大半は CT なので既定として妥当)
const isCt = computed(() => !isPt.value && !isMr.value);

const groupLabel = computed(() => isPt.value ? 'PT' : isMr.value ? 'MR' : 'CT');

// ボタン表面: 現在のプリセット名。未選択なら modality だけ出す。
const buttonLabel = computed(() => {
  if (!activePreset.value) return groupLabel.value;
  const all = [...wPresets, ...wPresetsMr, ...wPresetsPet, ...wPresetsPetOther];
  const hit = all.find(p => p.id === activePreset.value);
  return hit ? hit.label : groupLabel.value;
});

// PT 表示単位 (legend / 4-corner / 入力換算に影響。voxel と内部 WC/WW は SUV のまま)。
const segStore = useSegmentationStore();
// NAC PT (非減衰補正) は SUV 換算不可なので Bq/ml 固定。
const isNacPt = computed<boolean>(() => segStore.petVolumeRef?.metadata?.suvOk === false);
const petUnit = computed<'SUV' | 'BqMl'>(() => isNacPt.value ? 'BqMl' : segStore.petDisplayUnit);
const onPetUnitChange = (v: 'SUV' | 'BqMl' | null | undefined) => {
  if (isNacPt.value) return;
  if (v === 'SUV' || v === 'BqMl') {
    segStore.petDisplayUnit = v;
    emit('redraw');
  }
};
</script>

<template>
  <v-menu location="bottom" :close-on-content-click="false">
    <template v-slot:activator="{ props: act }">
      <v-btn v-bind="act" class="mv-tool-btn mv-tool-btn--wide" variant="text" size="small">
        <v-icon icon="mdi-contrast-circle" size="small" />
        <span class="mv-tool-label">{{ buttonLabel }}</span>
        <v-tooltip activator="parent" location="bottom">
            選択中のボックス用ウィンドウプリセット（{{ groupLabel }}）
        </v-tooltip>
      </v-btn>
    </template>

    <v-card class="mv-wpreset-card" density="compact">
      <!-- CT -->
      <template v-if="isCt">
        <div class="mv-wpreset-title">CT ウィンドウ（HU）</div>
        <div class="mv-wpreset-row">
          <v-btn v-for="p in wPresets" :key="p.id" size="x-small"
                 :variant="activePreset === p.id ? 'tonal' : 'outlined'"
                 :active="activePreset === p.id"
                 @click="presetClicked(p.id)">
            {{ p.label }}
            <v-tooltip activator="parent" location="bottom">{{ p.hint }}</v-tooltip>
          </v-btn>
        </div>
      </template>

      <!-- MR -->
      <template v-else-if="isMr">
        <div class="mv-wpreset-title">MR ウィンドウ（自動）</div>
        <div class="mv-wpreset-row">
          <v-btn v-for="p in wPresetsMr" :key="p.id" size="x-small"
                 :variant="activePreset === p.id ? 'tonal' : 'outlined'"
                 :active="activePreset === p.id"
                 @click="presetClicked(p.id)">
            {{ p.label }}
            <v-tooltip activator="parent" location="bottom" max-width="260">{{ p.hint }}</v-tooltip>
          </v-btn>
        </div>
      </template>

      <!-- PT -->
      <template v-else>
        <div class="mv-wpreset-title">
          <span>PT ウィンドウ</span>
          <v-btn-toggle :model-value="petUnit" @update:model-value="onPetUnitChange"
                        density="compact" variant="outlined" divided mandatory class="mv-unit-toggle">
            <!-- disabled な v-btn では v-tooltip が発火しないため native title を使う -->
                 <v-btn value="SUV" size="x-small" :disabled="isNacPt"
                   :title="isNacPt ? '非減衰補正の PT では SUV は利用できません'
                    : 'PT の値を body-weight 正規化した SUVbw で表示します'">SUV</v-btn>
            <v-btn value="BqMl" size="x-small">
              Bq/ml
              <v-tooltip activator="parent" location="bottom">PT の値を SUV の代わりに生の活動率（Bq/ml）で表示します</v-tooltip>
            </v-btn>
          </v-btn-toggle>
        </div>
        <div class="mv-wpreset-row">
          <v-btn v-for="p in wPresetsPet" :key="p.id" size="x-small"
                 :variant="activePreset === p.id ? 'tonal' : 'outlined'"
                 :active="activePreset === p.id"
                 @click="presetClicked(p.id)">
            {{ p.label }}
            <v-tooltip activator="parent" location="bottom">{{ p.hint }}</v-tooltip>
          </v-btn>
          <v-btn v-for="p in wPresetsPetOther" :key="p.id" size="x-small"
                 :variant="activePreset === p.id ? 'tonal' : 'outlined'"
                 :active="activePreset === p.id"
                 @click="presetClicked(p.id)">{{ p.label }}</v-btn>
        </div>
      </template>

      <v-divider class="my-1" />
      <div class="mv-wpreset-row">
        <v-btn size="x-small" variant="text" @click="presetClicked('Reset')">
          <v-icon icon="mdi-restart" size="x-small" class="mr-1" />DICOM タグにリセット
          <v-tooltip activator="parent" location="bottom">DICOM ヘッダに保存されているウィンドウ中心/幅を復元します</v-tooltip>
        </v-btn>
      </div>
    </v-card>
  </v-menu>
</template>

<style scoped>
.mv-wpreset-card {
  padding: 8px 10px;
  min-width: 240px;
  background: var(--mv-surface, #1a2028);
}
.mv-wpreset-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mv-text-muted, #5a6877);
  margin-bottom: 6px;
}
.mv-wpreset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.mv-wpreset-row .v-btn {
  text-transform: none;
  letter-spacing: 0;
  min-width: 0;
}
.mv-unit-toggle {
  margin-left: auto;
  height: 20px;
}
</style>
