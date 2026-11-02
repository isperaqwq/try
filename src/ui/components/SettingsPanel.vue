<template>
  <div class="mneme-tab-body">
    <div class="mneme-section-title">核心与模块独立开关</div>

    <label class="mneme-field">
      <span>启用插件总开关</span>
      <input
        type="checkbox"
        :checked="settingsStore.enabled"
        @change="patch('enabled', checked($event))"
      />
    </label>

    <div class="mneme-card">
      <div class="mneme-section-title" style="margin-top: 0">按需注入与读取模块（可任意单选或组合）</div>
      <p class="mneme-muted">
        未勾选的模块既不会注入上下文，也不会在提示词中要求 AI 输出对应 JSON 字段；且各模块解析相互独立，某一项未输出不会影响其它模块记录。
      </p>
      <label class="mneme-field">
        <span>1. 记忆与卷宗（summary / seal）</span>
        <input
          type="checkbox"
          :checked="settingsStore.enableMemory !== false"
          @change="patch('enableMemory', checked($event))"
        />
      </label>
      <label class="mneme-field">
        <span>2. 羁绊与好感（bonds）</span>
        <input
          type="checkbox"
          :checked="settingsStore.enableBonds !== false"
          @change="patch('enableBonds', checked($event))"
        />
      </label>
      <label class="mneme-field">
        <span>3. 道具与礼物（items）</span>
        <input
          type="checkbox"
          :checked="settingsStore.enableItems !== false"
          @change="patch('enableItems', checked($event))"
        />
      </label>
      <label class="mneme-field">
        <span>4. 重要事件与誓言（events）</span>
        <input
          type="checkbox"
          :checked="settingsStore.enableEvents !== false"
          @change="patch('enableEvents', checked($event))"
        />
      </label>
    </div>

    <label class="mneme-field">
      <span>每卷记忆条数（满条自动封存为卷宗）</span>
      <input
        class="mneme-input"
        type="number"
        min="5"
        max="30"
        :value="settingsStore.volumeSize"
        @change="patchNumber('volumeSize', $event)"
      />
    </label>

    <label class="mneme-field">
      <span>每部总卷包含卷宗数（满卷自动合并为总卷）</span>
      <input
        class="mneme-input"
        type="number"
        min="2"
        max="30"
        :value="settingsStore.epochSize ?? 10"
        @change="patchNumber('epochSize', $event)"
      />
    </label>

    <label class="mneme-field">
      <span>自动隐藏回复末尾的 MNEME 记忆块</span>
      <input
        type="checkbox"
        :checked="settingsStore.autoStripBlock !== false"
        @change="patch('autoStripBlock', checked($event))"
      />
    </label>
    <p class="mneme-muted">
      开启后仅剥离以 &lt;!--MNEME ... MNEME--&gt; 包裹的尾部注释块，绝不触碰正文。
    </p>

    <label class="mneme-field">
      <span>提示词注入预算上限（token）</span>
      <input
        class="mneme-input"
        type="number"
        min="200"
        step="100"
        :value="settingsStore.tokenBudget"
        @change="patchNumber('tokenBudget', $event)"
      />
    </label>
    <p class="mneme-muted">
      说明：当几百楼后累积账本超出此 Token 上限时，<strong>不会删除你的任何存档数据</strong>，仅在组装当轮发送给 AI 的注入文本时，优先保证「当前卷近期记忆、重要事件、永久记忆、输出格式要求」完整发送，并按优先级暂时省去低优内容（先省去较早的已封卷宗 ➔ 再省道具 ➔ 跨卷重要记忆 ➔ 羁绊）。
    </p>

    <label class="mneme-field">
      <span>重要记忆跨卷保留卷数</span>
      <input
        class="mneme-input"
        type="number"
        min="0"
        max="10"
        :value="settingsStore.majorRetentionVolumes"
        @change="patchNumber('majorRetentionVolumes', $event)"
      />
    </label>

    <label class="mneme-field">
      <span>模型未输出记忆块时亮起绿点提示</span>
      <input
        type="checkbox"
        :checked="settingsStore.showMissingBadge"
        @change="patch('showMissingBadge', checked($event))"
      />
    </label>

    <label class="mneme-field">
      <span>调试模式（显示底层 JSON 数据）</span>
      <input
        type="checkbox"
        :checked="settingsStore.debug"
        @change="patch('debug', checked($event))"
      />
    </label>

    <div class="mneme-section-title">外观</div>

    <label class="mneme-field">
      <span>主题</span>
      <select
        class="mneme-input"
        :value="settingsStore.ui.theme"
        @change="patchUi('theme', ($event.target as HTMLSelectElement).value)"
      >
        <option value="auto">跟随酒馆</option>
        <option value="light">日间</option>
        <option value="dark">夜间</option>
      </select>
    </label>

    <label class="mneme-field">
      <span>强调色</span>
      <input
        class="mneme-input"
        type="color"
        :value="settingsStore.ui.accent"
        @change="patchUi('accent', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="mneme-field">
      <span>字号</span>
      <input
        class="mneme-input"
        type="number"
        min="11"
        max="20"
        :value="settingsStore.ui.fontSize"
        @change="patchUiNumber('fontSize', $event)"
      />
    </label>

    <div class="mneme-row">
      <button class="mneme-btn" @click="resetPosition">重置面板位置与尺寸</button>
    </div>

    <div class="mneme-section-title">悬浮球</div>

    <label class="mneme-field">
      <span>中心内容（文字 / emoji）</span>
      <input
        class="mneme-input"
        data-mneme="ballText"
        maxlength="4"
        placeholder="M"
        :value="settingsStore.ui.ballText"
        @change="patchUiText('ballText', $event)"
      />
    </label>

    <label class="mneme-field">
      <span>图标图片 URL（可选）</span>
      <input
        class="mneme-input"
        data-mneme="ballImage"
        placeholder="留空则显示文字"
        :value="settingsStore.ui.ballImage"
        @change="patchUiText('ballImage', $event)"
      />
    </label>

    <label class="mneme-field">
      <span>尺寸（px）</span>
      <input
        class="mneme-input"
        data-mneme="ballSize"
        type="number"
        min="32"
        max="72"
        :value="settingsStore.ui.ballSize"
        @change="patchUiNumber('ballSize', $event, 44)"
      />
    </label>

    <label class="mneme-field">
      <span>不透明度</span>
      <input
        class="mneme-input"
        data-mneme="ballOpacity"
        type="number"
        min="0.2"
        max="1"
        step="0.05"
        :value="settingsStore.ui.ballOpacity"
        @change="patchUiNumber('ballOpacity', $event, 1)"
      />
    </label>

    <label class="mneme-field">
      <span>透明背景</span>
      <input
        data-mneme="ballBgTransparent"
        type="checkbox"
        :checked="settingsStore.ui.ballBgTransparent"
        @change="patchUi('ballBgTransparent', checked($event))"
      />
    </label>

    <label v-if="!settingsStore.ui.ballBgTransparent" class="mneme-field">
      <span>背景色</span>
      <input
        class="mneme-input"
        data-mneme="ballBg"
        type="color"
        :value="settingsStore.ui.ballBg"
        @change="patchUi('ballBg', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="mneme-field">
      <span>显示边框</span>
      <input
        data-mneme="ballBorder"
        type="checkbox"
        :checked="settingsStore.ui.ballBorder"
        @change="patchUi('ballBorder', checked($event))"
      />
    </label>

    <label v-if="settingsStore.ui.ballBorder" class="mneme-field">
      <span>边框颜色</span>
      <input
        class="mneme-input"
        data-mneme="ballBorderColor"
        type="color"
        :value="settingsStore.ui.ballBorderColor"
        @change="patchUi('ballBorderColor', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="mneme-field">
      <span>文字 / 图案颜色</span>
      <input
        class="mneme-input"
        data-mneme="ballColor"
        type="color"
        :value="settingsStore.ui.ballColor"
        @change="patchUi('ballColor', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="mneme-field">
      <span>贴边时只露一半</span>
      <input
        data-mneme="ballHalfHide"
        type="checkbox"
        :checked="settingsStore.ui.ballHalfHide"
        @change="patchUi('ballHalfHide', checked($event))"
      />
    </label>

    <div class="mneme-row">
      <button class="mneme-btn" @click="resetBallStyle">恢复悬浮球默认样式</button>
    </div>

    <div class="mneme-section-title">数据（当前聊天独立绑定）</div>
    <div class="mneme-row">
      <button class="mneme-btn" @click="exportJson">导出当前聊天记忆</button>
      <label class="mneme-btn">
        导入
        <input type="file" accept="application/json" style="display: none" @change="importJson" />
      </label>
      <button class="mneme-btn mneme-btn-danger" @click="confirmClear = !confirmClear">
        {{ confirmClear ? '取消清空' : '清空当前聊天记忆' }}
      </button>
      <button v-if="confirmClear" class="mneme-btn mneme-btn-danger" @click="clearState">
        确认清空
      </button>
    </div>
    <p v-if="importNotice" class="mneme-warn">{{ importNotice }}</p>
    <p class="mneme-muted">记忆保存在当前聊天的 chat_metadata.mneme 中，切换聊天自动隔离，导出聊天时一并带走。</p>

    <div v-if="settingsStore.debug && store.state" class="mneme-section-title">调试数据</div>
    <pre v-if="settingsStore.debug && store.state" class="mneme-debug">{{
      JSON.stringify(store.state, null, 2)
    }}</pre>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { centerPanel, settingsStore, updateSettings } from '../../store/ui-settings.ts';
import { store, commitState, flushState } from '../../store/chat-state.ts';
import { createEmptyState } from '../../core/schema.ts';
import { migrateState } from '../../core/migrate.ts';
import { refreshInjection } from '../../host/events.ts';
import type { MnemeUi } from '../../core/types.ts';

const confirmClear = ref(false);
const importNotice = ref('');

function checked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}

function patch<K extends keyof typeof settingsStore>(key: K, value: unknown): void {
  updateSettings({ [key]: value } as any);
  refreshInjection();
}

function patchNumber(
  key: 'volumeSize' | 'epochSize' | 'tokenBudget' | 'majorRetentionVolumes',
  event: Event,
): void {
  const value = Number((event.target as HTMLInputElement).value) || 0;
  updateSettings({ [key]: value } as any);
  refreshInjection();
}

function patchUi(key: keyof MnemeUi, value: unknown): void {
  updateSettings({ ui: { ...settingsStore.ui, [key]: value } });
}

function patchUiNumber(key: keyof MnemeUi, event: Event, fallback = 14): void {
  const value = Number((event.target as HTMLInputElement).value);
  patchUi(key, Number.isFinite(value) ? value : fallback);
}

function patchUiText(key: 'ballText' | 'ballImage', event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  patchUi(key, key === 'ballText' ? value.slice(0, 8) : value.trim());
}

function resetBallStyle(): void {
  updateSettings({
    ui: {
      ...settingsStore.ui,
      ballText: 'M',
      ballImage: '',
      ballSize: 44,
      ballOpacity: 1,
      ballBgTransparent: true,
      ballBg: '#1a1a1e',
      ballBorder: false,
      ballBorderColor: '#b08d57',
      ballColor: '#b08d57',
      ballHalfHide: true,
    },
  });
}

function resetPosition(): void {
  if (settingsStore.ui.minimized) {
    updateSettings({ ui: { ...settingsStore.ui, minimized: false } });
  }
  centerPanel();
}

function exportJson(): void {
  if (!store.state) return;
  const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mneme-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importJson(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(String(reader.result ?? ''));
      const result = migrateState(raw);
      if (result.status === 'failed') {
        importNotice.value = '文件格式不正确，未导入。';
        return;
      }
      importNotice.value = '导入成功！';
      commitState(result.state);
      refreshInjection();
      void flushState();
    } catch {
      importNotice.value = '文件不是有效的 JSON。';
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function clearState(): void {
  confirmClear.value = false;
  commitState(createEmptyState());
  refreshInjection();
  void flushState();
}
</script>
