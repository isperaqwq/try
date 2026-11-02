<template>
  <div class="mneme-tab-body">
    <div class="mneme-row" style="justify-content: space-between">
      <label class="mneme-inline-toggle" title="关闭后不再向 AI 注入重要事件，也不要求 AI 输出 events 字段">
        <input
          type="checkbox"
          :checked="settingsStore.enableEvents !== false"
          @change="toggleModule(($event.target as HTMLInputElement).checked)"
        />
        <span>启用重要事件注入与读取</span>
      </label>
      <button class="mneme-btn mneme-btn-sm" type="button" @click="showForm = !showForm">
        {{ showForm ? '收起' : '+ 新增记录' }}
      </button>
    </div>

    <datalist id="mneme-event-categories">
      <option value="约定"></option>
      <option value="誓言"></option>
      <option value="束缚"></option>
      <option value="重大事件"></option>
      <option value="转折"></option>
      <option value="秘密"></option>
    </datalist>

    <div class="mneme-row">
      <select v-model="filterCategory" class="mneme-input" style="max-width: 120px" aria-label="按类型筛选">
        <option value="">全部类型</option>
        <option v-for="cat in availableCategories" :key="cat" :value="cat">{{ cat }}</option>
      </select>
      <input v-model="query" class="mneme-input" placeholder="搜索约定、誓言或事件…" />
    </div>

    <form v-if="showForm" class="mneme-card" @submit.prevent="addEvent">
      <div class="mneme-row">
        <input
          v-model="draft.category"
          list="mneme-event-categories"
          class="mneme-input"
          style="max-width: 136px"
          placeholder="类型（可自定义）"
        />
        <input
          v-model="draft.title"
          class="mneme-input"
          placeholder="简短标题（如：钟楼守夜之约 / 救下守夜人）"
          required
        />
      </div>
      <textarea
        v-model="draft.content"
        class="mneme-textarea"
        rows="3"
        placeholder="详细记录约定、誓言、束缚的具体条款，或重大事件的前因后果（将永久保留在提示词中）"
        required
      ></textarea>
      <div class="mneme-row">
        <button class="mneme-btn mneme-btn-sm" type="submit">保存为永久记录</button>
        <button class="mneme-btn mneme-btn-sm" type="button" @click="showForm = false">取消</button>
      </div>
    </form>

    <div v-if="!state" class="mneme-empty">当前没有打开的聊天。</div>
    <div v-else-if="filteredEvents.length === 0" class="mneme-empty">
      还没有记录重要事件或誓言约定。可点击右上角「+ 新增记录」添加，或由 AI 在对话中自动收录。
    </div>

    <article v-for="ev in filteredEvents" :key="ev.id" class="mneme-card">
      <header class="mneme-entry-head">
        <span class="mneme-chip mneme-imp-permanent">{{ ev.category || '重大事件' }}</span>
        <strong>{{ ev.title }}</strong>
        <span class="mneme-entry-actions">
          <button class="mneme-link" type="button" @click="startEdit(ev)">
            {{ editingId === ev.id ? '收起' : '编辑' }}
          </button>
          <button class="mneme-link danger" type="button" @click="remove(ev.id)">删除</button>
        </span>
      </header>

      <div v-if="editingId === ev.id" class="mneme-entry-edit" style="padding: 4px 0 0">
        <div class="mneme-row">
          <input
            v-model="editDraft.category"
            list="mneme-event-categories"
            class="mneme-input"
            style="max-width: 136px"
            placeholder="类型（可自定义）"
          />
          <input v-model="editDraft.title" class="mneme-input" placeholder="标题" />
        </div>
        <textarea v-model="editDraft.content" class="mneme-textarea" rows="3"></textarea>
        <div class="mneme-row">
          <button class="mneme-btn mneme-btn-sm" type="button" @click="saveEdit(ev.id)">保存</button>
          <button class="mneme-btn mneme-btn-sm" type="button" @click="editingId = ''">取消</button>
        </div>
      </div>

      <p v-else class="mneme-entry-body">{{ ev.content }}</p>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { ImportantEvent } from '../../core/types.ts';
import { cloneData } from '../../core/clone.ts';
import { store, commitState, flushState } from '../../store/chat-state.ts';
import { settingsStore, updateSettings } from '../../store/ui-settings.ts';
import { refreshInjection } from '../../host/events.ts';

const state = computed(() => store.state);
const query = ref('');
const filterCategory = ref('');
const showForm = ref(false);

const draft = reactive({
  category: '约定',
  title: '',
  content: '',
});

const editingId = ref('');
const editDraft = reactive({
  category: '约定',
  title: '',
  content: '',
});

const availableCategories = computed(() => {
  const base = new Set(['约定', '誓言', '束缚', '重大事件', '转折', '秘密']);
  for (const ev of state.value?.importantEvents ?? []) {
    if (ev.category) base.add(String(ev.category));
  }
  return [...base];
});

const filteredEvents = computed(() => {
  const list = state.value?.importantEvents ?? [];
  const kw = query.value.trim();
  const cat = filterCategory.value;
  return list.filter((ev) => {
    if (cat && ev.category !== cat) return false;
    if (kw && !`${ev.title}${ev.content}${ev.category}`.includes(kw)) return false;
    return true;
  });
});

function toggleModule(val: boolean): void {
  updateSettings({ enableEvents: val });
  refreshInjection();
}

function addEvent(): void {
  if (!state.value) return;
  const title = draft.title.trim();
  const content = draft.content.trim();
  if (!title || !content) return;

  const next = cloneData(state.value);
  if (!Array.isArray(next.importantEvents)) next.importantEvents = [];
  next.importantEvents.push({
    id: `manual-ev-${Date.now()}`,
    title,
    category: draft.category.trim() || '重大事件',
    content,
    characters: [],
    at: Date.now(),
    entryId: null,
    messageId: null,
  });

  draft.title = '';
  draft.content = '';
  showForm.value = false;
  commitState(next);
  refreshInjection();
  void flushState();
}

function startEdit(ev: ImportantEvent): void {
  if (editingId.value === ev.id) {
    editingId.value = '';
    return;
  }
  editingId.value = ev.id;
  editDraft.category = String(ev.category || '重大事件');
  editDraft.title = ev.title;
  editDraft.content = ev.content;
}

function saveEdit(id: string): void {
  if (!state.value) return;
  const next = cloneData(state.value);
  const target = (next.importantEvents ?? []).find((ev) => ev.id === id);
  if (!target) return;
  target.category = editDraft.category.trim() || '重大事件';
  target.title = editDraft.title.trim() || target.title;
  target.content = editDraft.content.trim() || target.content;
  editingId.value = '';
  commitState(next);
  refreshInjection();
  void flushState();
}

function remove(id: string): void {
  if (!state.value) return;
  const next = cloneData(state.value);
  next.importantEvents = (next.importantEvents ?? []).filter((ev) => ev.id !== id);
  commitState(next);
  refreshInjection();
  void flushState();
}
</script>
