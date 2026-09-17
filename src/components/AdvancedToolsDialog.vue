<script setup lang="ts">
// Advanced tools (demo phantoms / experiments / series priority rules)。
//
// 以前は左サイドバーの折り畳みセクションだったが、シリーズを全件表示するようにした結果
// 一覧の下に押し出されて到達できなくなった (16 series で y=2106px、ペインは 700px)。
// 使用頻度は極めて低い一方、series priority rules は表形式の編集 UI でメニュー項目には
// 収まらないので、ハンバーガーから開くダイアログに移した。
import { ref } from 'vue';
import { loadPriorityRules, savePriorityRules, resetPriorityRules, DEFAULT_RULES, type PriorityRule } from './seriesPriorityRules';

const open = defineModel<boolean>({ default: false });

const emit = defineEmits([
  'phantomNema',
  'phantomWholeBody',
  'phantomWholeBodyPetCt',
  'scrambleSlices',
  'recoverSlices',
]);

// PET Standard 候補スコアリングの編集可能ルール (localStorage 永続化)
const priorityRules = ref<PriorityRule[]>(loadPriorityRules());
const onRulesChanged = () => savePriorityRules(priorityRules.value);
const addRule = () => {
  priorityRules.value.push({ pattern: '', modality: 'ANY', weight: 1 });
  onRulesChanged();
};
const removeRule = (i: number) => {
  priorityRules.value.splice(i, 1);
  onRulesChanged();
};
const resetRules = () => {
  resetPriorityRules();
  priorityRules.value = [...DEFAULT_RULES];
};

// phantom / experiment は実行したらダイアログを閉じる (結果は画像側に出る)
const run = (ev: 'phantomNema' | 'phantomWholeBody' | 'phantomWholeBodyPetCt' | 'scrambleSlices' | 'recoverSlices') => {
  emit(ev);
  open.value = false;
};
</script>

<template>
  <v-dialog v-model="open" max-width="520" scrollable>
    <v-card class="mv-adv-card">
      <v-card-title class="mv-adv-title">
        <v-icon icon="mdi-flask-outline" size="small" class="mr-2" />
        高度なツール
      </v-card-title>
      <v-card-text class="mv-adv-body">
        <div class="mv-section-title">デモファントム</div>
        <div class="mv-btn-row">
            <v-btn size="x-small" variant="tonal" @click="run('phantomNema')">
            NEMA IEC
            <v-tooltip activator="parent" location="bottom" max-width="260">
              NEMA IEC ボディファントムを生成（6 個の球、QC 用）— 患者データ不要
            </v-tooltip>
          </v-btn>
            <v-btn size="x-small" variant="tonal" @click="run('phantomWholeBody')">
            全身 PET
            <v-tooltip activator="parent" location="bottom" max-width="260">
              合成全身 FDG-PET を生成（脳/心/肝/腎/膀胱 + 転移 8 個）
            </v-tooltip>
          </v-btn>
            <v-btn size="x-small" variant="tonal" @click="run('phantomWholeBodyPetCt')">
            全身 PET/CT
            <v-tooltip activator="parent" location="bottom" max-width="260">
              合成 CT と PET のペアを生成（同一ワールド空間なので Fusion が合います）
            </v-tooltip>
          </v-btn>
        </div>
        <div class="text-caption text-disabled mt-1">
          NEMA IEC: 温かい体内に 6 個の高集積球と冷たい肺インサート。<br />
          全身 PET: 脳、心臓、肝臓、腎臓、膀胱、8 個の転移を含む合成 FDG-PET。<br />
          全身 PET/CT: 幾何形状から作った合成 CT + PET（子宮頸がんに似た形状）。
          PET 標準ビューで開きます。
        </div>

        <div class="mv-section-title mt-4">実験</div>
        <div class="mv-btn-row">
          <v-btn size="x-small" variant="tonal" @click="run('scrambleSlices')">
            Z をシャッフル
            <v-tooltip activator="parent" location="bottom" max-width="260">
              研究用ツール: 選択ボリュームの z スライスをランダムにシャッフルします（先に対象ボックスを選択）
            </v-tooltip>
          </v-btn>
          <v-btn size="x-small" variant="tonal" @click="run('recoverSlices')">
            Z を復元
            <v-tooltip activator="parent" location="bottom" max-width="260">
              研究用ツール: スライス間類似度のみでスライス順を再構築し、復元精度を報告します
            </v-tooltip>
          </v-btn>
        </div>
        <div class="text-caption text-disabled mt-1">
          Scramble Z: randomly shuffles the selected volume's z-slices (view coronal/MIP to see it).<br />
          Recover Z: reorders slices by slice-to-slice similarity (SSD) and reports how well the
          original order was recovered.
        </div>

        <!-- PET Standard 候補スコアリングルール (ATTN > NAC、WB > Lung 等) -->
        <div class="mv-section-title mt-4">シリーズ優先ルール</div>
          <div class="mv-rules-help text-caption text-disabled mb-1">
          スコアが高いほどデフォルトの PT/CT 選択で優先されます。+ は増強、− は回避を意味します。
        </div>
        <div class="mv-rules-table">
          <div v-for="(r, i) in priorityRules" :key="i" class="mv-rule-row">
            <input class="mv-rule-pat" type="text" v-model="r.pattern"
                   placeholder="部分文字列" @change="onRulesChanged" />
            <select class="mv-rule-mod" v-model="r.modality" @change="onRulesChanged">
              <option value="ANY">ANY</option>
              <option value="PT">PT</option>
              <option value="CT">CT</option>
              <option value="MR">MR</option>
            </select>
            <input class="mv-rule-w" type="number" v-model.number="r.weight"
                   step="1" @change="onRulesChanged" />
            <button class="mv-rule-del" @click="removeRule(i)" title="ルールを削除">×</button>
          </div>
        </div>
        <div class="mv-btn-row mt-1">
          <v-btn size="x-small" variant="tonal" @click="addRule">
            + 追加
            <v-tooltip activator="parent" location="bottom">シリーズ優先ルールを追加（パターン + モダリティ + 重み）</v-tooltip>
          </v-btn>
          <v-btn size="x-small" variant="text" @click="resetRules">
            デフォルトにリセット
            <v-tooltip activator="parent" location="bottom">ルールを破棄して組み込みのデフォルトに戻します</v-tooltip>
          </v-btn>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn size="small" variant="text" @click="open = false">閉じる</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.mv-adv-card { background: var(--mv-surface, #1a2028); }
.mv-adv-title { font-size: 14px; font-weight: 700; }
.mv-adv-body { max-height: 60vh; }

.mv-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mv-text-muted, #5a6877);
  margin-bottom: 6px;
}
.mv-btn-row { display: flex; gap: 4px; flex-wrap: wrap; }
.mv-btn-row .v-btn { text-transform: none; letter-spacing: 0; }

.mv-rules-table { display: flex; flex-direction: column; gap: 2px; }
.mv-rule-row { display: flex; gap: 3px; align-items: center; }
.mv-rule-pat { flex: 1 1 auto; min-width: 0; }
.mv-rule-pat, .mv-rule-mod, .mv-rule-w {
  background: var(--mv-surface-2, #222b36);
  border: 1px solid var(--mv-border, #2a3441);
  border-radius: 3px;
  color: var(--mv-text, #e8eef2);
  font-size: 11px;
  padding: 2px 4px;
}
.mv-rule-mod { width: 62px; }
.mv-rule-w { width: 52px; }
.mv-rule-del {
  width: 20px;
  border: 1px solid var(--mv-border, #2a3441);
  border-radius: 3px;
  background: transparent;
  color: var(--mv-text-dim, #8fa0b0);
  cursor: pointer;
}
.mv-rule-del:hover { color: var(--mv-error, #ff5c7a); border-color: var(--mv-error, #ff5c7a); }
</style>
