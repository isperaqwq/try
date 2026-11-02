<template>
  <div class="mneme-tab-body">
    <div class="mneme-row" style="justify-content: space-between">
      <label class="mneme-inline-toggle" title="关闭后不再向 AI 注入道具，也不要求 AI 输出 items 字段">
        <input
          type="checkbox"
          :checked="settingsStore.enableItems !== false"
          @change="toggleModule(($event.target as HTMLInputElement).checked)"
        />
        <span>启用道具注入与读取</span>
      </label>
      <button class="mneme-btn mneme-btn-sm" type="button" @click="showAddForm = !showAddForm">
        {{ showAddForm ? '收起' : '+ 收录道具' }}
      </button>
    </div>

    <form v-if="showAddForm" class="mneme-card" @submit.prevent="addItem">
      <div class="mneme-row">
        <input v-model="draft.name" class="mneme-input" placeholder="道具/物品名称" required />
        <select v-model="draft.status" class="mneme-input" style="max-width: 108px" aria-label="归属状态">
          <option value="held">持有中</option>
          <option value="gifted">已赠出</option>
          <option value="lost">已遗失</option>
          <option value="consumed">已消耗</option>
        </select>
        <input
          v-model="draft.condition"
          class="mneme-input"
          style="max-width: 132px"
          placeholder="当前状态（如：完好）"
        />
      </div>
      <div class="mneme-row">
        <input
          v-model="draft.holder"
          class="mneme-input"
          placeholder="当前持有者（如：user 或 接收礼物的角色名）"
        />
        <input
          v-model="draft.source"
          class="mneme-input"
          placeholder="来源或去向（如：沈栖迟赠送 / user送给沈栖迟）"
        />
      </div>
      <textarea
        v-model="draft.effect"
        class="mneme-textarea"
        rows="3"
        placeholder="详细记录物品的外观、来历、特殊意义与具体用途（几百楼后依然清晰可查）"
      ></textarea>
      <div class="mneme-row">
        <button class="mneme-btn mneme-btn-sm" type="submit">保存道具</button>
        <button class="mneme-btn mneme-btn-sm" type="button" @click="showAddForm = false">取消</button>
      </div>
    </form>

    <div v-if="!state" class="mneme-empty">当前没有打开的聊天。</div>
    <div v-else-if="state.items.length === 0" class="mneme-empty">
      还没有道具记录。获得的道具或 user 赠送给他人的礼物都会在此详细记录。
    </div>

    <article v-for="item in state?.items ?? []" :key="item.id" class="mneme-card">
      <header class="mneme-entry-head">
        <strong>{{ item.name }}</strong>
        <span class="mneme-chip" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
        <span v-if="item.condition" class="mneme-chip">{{ item.condition }}</span>
        <span v-if="item.holder" class="mneme-muted">持有：{{ item.holder }}</span>
        <span v-if="item.source" class="mneme-muted">· {{ item.source }}</span>
        <span class="mneme-entry-actions">
          <button class="mneme-link" type="button" @click="startEdit(item)">
            {{ editingId === item.id ? '收起' : '编辑' }}
          </button>
          <button class="mneme-link danger" type="button" @click="remove(item.id)">删除</button>
        </span>
      </header>

      <div v-if="editingId === item.id" class="mneme-entry-edit" style="padding: 4px 0 0">
        <div class="mneme-row">
          <input v-model="editDraft.name" class="mneme-input" placeholder="物品名称" />
          <select v-model="editDraft.status" class="mneme-input" style="max-width: 108px">
            <option value="held">持有中</option>
            <option value="gifted">已赠出</option>
            <option value="lost">已遗失</option>
            <option value="consumed">已消耗</option>
          </select>
          <input
            v-model="editDraft.condition"
            class="mneme-input"
            style="max-width: 132px"
            placeholder="当前状态（如：完好/剩半瓶）"
          />
        </div>
        <div class="mneme-row">
          <input v-model="editDraft.holder" class="mneme-input" placeholder="当前持有者" />
          <input v-model="editDraft.source" class="mneme-input" placeholder="来源或赠送去向" />
        </div>
        <textarea
          v-model="editDraft.effect"
          class="mneme-textarea"
          rows="3"
          placeholder="物品详细描述、来历与作用"
        ></textarea>
        <div class="mneme-row">
          <button class="mneme-btn mneme-btn-sm" type="button" @click="saveEdit(item.id)">保存</button>
          <button class="mneme-btn mneme-btn-sm" type="button" @click="editingId = ''">取消</button>
        </div>
      </div>

      <template v-else>
        <p class="mneme-entry-body">{{ item.effect || '暂无详细描述' }}</p>
      </template>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { Item, ItemStatus } from '../../core/types.ts';
import { cloneData } from '../../core/clone.ts';
import { store, commitState, flushState } from '../../store/chat-state.ts';
import { settingsStore, updateSettings } from '../../store/ui-settings.ts';
import { refreshInjection } from '../../host/events.ts';

const state = computed(() => store.state);
const showAddForm = ref(false);
const draft = reactive({
  name: '',
  holder: '',
  condition: '完好',
  source: '',
  effect: '',
  status: 'held' as ItemStatus,
});

const editingId = ref('');
const editDraft = reactive({
  name: '',
  holder: '',
  condition: '',
  source: '',
  effect: '',
  status: 'held' as ItemStatus,
});

function toggleModule(val: boolean): void {
  updateSettings({ enableItems: val });
  refreshInjection();
}

function statusLabel(status: ItemStatus): string {
  if (status === 'gifted') return '已赠出';
  if (status === 'lost') return '已遗失';
  if (status === 'consumed') return '已消耗';
  return '持有中';
}

function statusClass(status: ItemStatus): string {
  if (status === 'gifted') return 'mneme-imp-major';
  if (status === 'held') return 'mneme-imp-normal';
  return '';
}

function addItem(): void {
  if (!state.value) return;
  const name = draft.name.trim();
  if (!name) return;

  const next = cloneData(state.value);
  const existing = next.items.find((item) => item.name === name);
  if (existing) {
    existing.holder = draft.holder.trim() || existing.holder;
    existing.condition = draft.condition.trim() || existing.condition || '完好';
    existing.source = draft.source.trim() || existing.source;
    existing.effect = draft.effect.trim() || existing.effect;
    existing.status = draft.status;
  } else {
    next.items.push({
      id: `manual-${Date.now()}`,
      name,
      holder: draft.holder.trim() || (draft.status === 'gifted' ? '' : 'user'),
      condition: draft.condition.trim() || '完好',
      source: draft.source.trim(),
      effect: draft.effect.trim(),
      status: draft.status,
      acquiredAt: Date.now(),
      entryId: null,
      messageId: null,
    });
  }

  draft.name = '';
  draft.holder = '';
  draft.condition = '完好';
  draft.source = '';
  draft.effect = '';
  draft.status = 'held';
  showAddForm.value = false;
  commitState(next);
  refreshInjection();
  void flushState();
}

function startEdit(item: Item): void {
  if (editingId.value === item.id) {
    editingId.value = '';
    return;
  }
  editingId.value = item.id;
  editDraft.name = item.name;
  editDraft.holder = item.holder ?? '';
  editDraft.condition = item.condition ?? '';
  editDraft.source = item.source;
  editDraft.effect = item.effect;
  editDraft.status = item.status;
}

function saveEdit(id: string): void {
  if (!state.value) return;
  const next = cloneData(state.value);
  const item = next.items.find((candidate) => candidate.id === id);
  if (!item) return;
  item.name = editDraft.name.trim() || item.name;
  item.holder = editDraft.holder.trim();
  item.condition = editDraft.condition.trim();
  item.source = editDraft.source.trim();
  item.effect = editDraft.effect.trim();
  item.status = editDraft.status;
  editingId.value = '';
  commitState(next);
  refreshInjection();
  void flushState();
}

function remove(id: string): void {
  if (!state.value) return;
  const next = cloneData(state.value);
  next.items = next.items.filter((item) => item.id !== id);
  commitState(next);
  refreshInjection();
  void flushState();
}
</script>
