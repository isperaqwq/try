<template>
  <div class="mneme-tab-body">
    <div class="mneme-row" style="justify-content: space-between">
      <label class="mneme-inline-toggle" title="关闭后不再向 AI 注入记忆与卷宗，也不要求 AI 输出 summary/importance 字段">
        <input
          type="checkbox"
          :checked="settingsStore.enableMemory !== false"
          @change="toggleModule('enableMemory', ($event.target as HTMLInputElement).checked)"
        />
        <span>启用记忆注入与读取</span>
      </label>
      <div class="mneme-row" style="gap: 6px">
        <button class="mneme-btn mneme-btn-sm" type="button" @click="toggleFullPreview">
          {{ showFullPreview ? '收起注入预览' : '完整注入预览' }}
        </button>
        <button class="mneme-btn mneme-btn-sm" type="button" @click="togglePrompt">
          {{ showPrompt ? '收起提示词' : '提示词设置' }}
        </button>
      </div>
    </div>

    <div v-if="showFullPreview" class="mneme-card">
      <div class="mneme-row" style="justify-content: space-between">
        <span class="mneme-muted">
          当前实际注入内容（位置：聊天内 IN_CHAT · 深度 depth=1 最新消息上方 · 身份 system · 约 {{ previewTokens }} tokens / {{ fullInjectionText.length }} 字）
        </span>
        <button class="mneme-btn mneme-btn-sm" type="button" @click="copyInjection">
          {{ copied ? '已复制' : '复制全文' }}
        </button>
      </div>
      <pre class="mneme-debug" style="max-height: 260px">{{
        fullInjectionText || '（当前未启用插件或无注入内容）'
      }}</pre>
    </div>

    <div v-if="showPrompt" class="mneme-card">
      <div class="mneme-section-title" style="margin-top: 0">1. 每轮记录提示词模板</div>
      <p class="mneme-muted">
        留空则根据你勾选启用的模块自动生成模板（包含 summary 具体到年月日、importance 分级，以及明确规定无内容填 "" 或 []）。
      </p>
      <textarea v-model="promptDraft" class="mneme-textarea" rows="9"></textarea>

      <div class="mneme-section-title">2. 封卷总结提示词（满 {{ volumeSize }} 条归档为卷宗时触发）</div>
      <p class="mneme-muted">
        整理为「【xx年xx月xx日-xx年xx月xx日】这些日子里发生了什么事」的连贯叙事总结。
      </p>
      <textarea v-model="sealPromptDraft" class="mneme-textarea" rows="4"></textarea>

      <div class="mneme-section-title">3. 总卷合并提示词（满 {{ epochSize }} 卷合并为典籍总卷时触发）</div>
      <p class="mneme-muted">
        当已封存卷宗满 {{ epochSize }} 卷时，将其合并提炼为一部更高层级的「典籍总卷」。
      </p>
      <textarea v-model="epochPromptDraft" class="mneme-textarea" rows="4"></textarea>

      <div class="mneme-row">
        <button class="mneme-btn mneme-btn-sm" type="button" @click="savePrompt">保存提示词</button>
        <button class="mneme-btn mneme-btn-sm" type="button" @click="resetPrompt">恢复默认模板</button>
      </div>
    </div>

    <div class="mneme-row">
      <input v-model="query" class="mneme-input" placeholder="搜索记忆内容…" />
      <button class="mneme-btn mneme-btn-sm" type="button" @click="showForm = !showForm">
        {{ showForm ? '收起' : '+ 新增记忆' }}
      </button>
    </div>

    <form v-if="showForm" class="mneme-card" @submit.prevent="addEntry">
      <textarea
        v-model="draft.summary"
        class="mneme-textarea"
        rows="3"
        placeholder="按「【xx年xx月xx日（具体时间）·xx地点】发生了xx事」填写一段完整记忆"
        required
      ></textarea>
      <div class="mneme-row">
        <select v-model="draft.importance" class="mneme-input" aria-label="记忆重要程度">
          <option value="normal">普通记忆 (normal)</option>
          <option value="major">重要记忆 (major)</option>
          <option value="permanent">永久记忆 (permanent)</option>
        </select>
        <button class="mneme-btn mneme-btn-sm" type="submit">保存记忆</button>
      </div>
    </form>

    <div v-if="!state" class="mneme-empty">当前没有打开的聊天。</div>

    <template v-else>
      <!-- 第一级：当前卷（近期记忆） -->
      <div class="mneme-row" style="justify-content: space-between">
        <div class="mneme-section-title" style="margin-top: 0">
          一、当前卷（近期记忆） · {{ state.entries.length }}/{{ volumeSize }}
        </div>
        <button
          v-if="state.entries.length > 0"
          class="mneme-btn mneme-btn-sm"
          type="button"
          :disabled="summarizingVolume !== null"
          @click="manualSealCurrent"
        >
          封存当前卷
        </button>
      </div>

      <div v-if="entries.length === 0" class="mneme-empty">
        还没有记录。开始对话后会自动生成，也可点击上方「+ 新增记忆」手动添加。
      </div>

      <details
        v-for="item in entries"
        :key="item.entry.id"
        class="mneme-entry"
        :open="item.entry.id === latestId || item.entry.id === editingId"
      >
        <summary class="mneme-entry-summary">
          <div class="mneme-entry-headline">
            <span class="mneme-entry-number">#{{ item.number }}</span>
            <span class="mneme-chip" :class="`mneme-imp-${item.entry.importance}`">{{
              importanceLabel(item.entry.importance)
            }}</span>
            <span class="mneme-entry-preview">{{ previewText(item.entry) }}</span>
            <span class="mneme-entry-actions">
              <button
                class="mneme-link"
                title="编辑这条记忆"
                @click.prevent.stop="startEdit(item.entry)"
              >
                编辑
              </button>
              <button
                class="mneme-link danger"
                title="删除这条记忆"
                @click.prevent.stop="remove(item.entry.id)"
              >
                删除
              </button>
            </span>
          </div>
        </summary>

        <div v-if="editingId === item.entry.id" class="mneme-entry-edit">
          <textarea
            v-model="draftEdit.summary"
            class="mneme-textarea"
            rows="4"
            placeholder="【xx年xx月xx日（时间）·xx地点】发生了xx事"
          ></textarea>
          <div class="mneme-row">
            <select v-model="draftEdit.importance" class="mneme-input">
              <option value="normal">普通记忆 (normal)</option>
              <option value="major">重要记忆 (major)</option>
              <option value="permanent">永久记忆 (permanent)</option>
            </select>
            <button class="mneme-btn mneme-btn-sm" @click.prevent.stop="saveEdit(item.entry.id)">
              保存
            </button>
            <button class="mneme-btn mneme-btn-sm" @click.prevent.stop="cancelEdit">
              取消
            </button>
          </div>
        </div>

        <div v-else class="mneme-entry-content">
          <p class="mneme-entry-body">{{ displayBody(item.entry) }}</p>
          <p v-if="item.entry.source === 'raw'" class="mneme-warn">
            格式未解析，已按原文保存。
          </p>
          <p v-if="item.entry.stale" class="mneme-warn">
            原消息已被编辑，摘要可能不再对应。
          </p>
        </div>
      </details>

      <!-- 第二级：已封卷宗 -->
      <div class="mneme-row" style="justify-content: space-between; margin-top: 8px">
        <div class="mneme-section-title" style="margin-top: 0">
          二、已封卷宗 · {{ state.volumes.length }}/{{ epochSize }}
        </div>
        <div class="mneme-row" style="gap: 6px">
          <button
            v-if="state.volumes.length > 0"
            class="mneme-btn mneme-btn-sm"
            type="button"
            title="将当前所有已封卷宗合并浓缩录入下方的「典籍总卷」中"
            @click="manualSealEpoch"
          >
            合并为总卷
          </button>
          <button class="mneme-btn mneme-btn-sm" type="button" @click="showVolumeForm = !showVolumeForm">
            {{ showVolumeForm ? '收起' : '+ 新增卷宗' }}
          </button>
        </div>
      </div>

      <form v-if="showVolumeForm" class="mneme-card" @submit.prevent="addVolume">
        <div class="mneme-row">
          <input
            v-model="volumeDraft.title"
            class="mneme-input"
            placeholder="卷宗标题（如：旧书店逢雨）"
            required
          />
          <input
            v-model="volumeDraft.timeRange"
            class="mneme-input"
            placeholder="起止日期（如：1924年10月1日-1924年10月5日）"
          />
        </div>
        <textarea
          v-model="volumeDraft.recap"
          class="mneme-textarea"
          rows="4"
          placeholder="按「【xx年xx月xx日-xx年xx月xx日】这些日子里发生了什么事…」填写本卷剧情总结"
          required
        ></textarea>
        <div class="mneme-row">
          <button class="mneme-btn mneme-btn-sm" type="submit">保存卷宗</button>
          <button class="mneme-btn mneme-btn-sm" type="button" @click="showVolumeForm = false">
            取消
          </button>
        </div>
      </form>

      <div v-if="state.volumes.length === 0 && !showVolumeForm" class="mneme-empty">
        暂无待合并的已封卷宗。当前卷满 {{ volumeSize }} 条自动封存为一卷；满 {{ epochSize }} 卷自动合并进下方「典籍总卷」。
      </div>

      <details
        v-for="volume in state.volumes.slice().reverse()"
        :key="volume.index"
        class="mneme-volume"
        :open="editingVolumeIndex === volume.index"
      >
        <summary class="mneme-volume-summary">
          <span>
            第{{ volume.index }}卷 · 《{{ volume.title }}》<span v-if="volume.timeRange"
              >【{{ volume.timeRange }}】</span
            ><span v-if="volume.auto" class="mneme-warn">（兜底归档）</span>
          </span>
          <span class="mneme-entry-actions">
            <button
              v-if="volume.entries.length > 0"
              class="mneme-link"
              title="调用当前模型将本卷记录重新整理为【起止年月日】连贯总结"
              :disabled="summarizingVolume === volume.index"
              @click.prevent.stop="aiSummarizeVolume(volume)"
            >
              {{ summarizingVolume === volume.index ? '总结中…' : 'AI总结' }}
            </button>
            <button
              class="mneme-link"
              title="编辑该卷宗"
              @click.prevent.stop="startEditVolume(volume)"
            >
              编辑
            </button>
            <button
              class="mneme-link danger"
              title="删除该卷宗"
              @click.prevent.stop="removeVolume(volume.index)"
            >
              删除
            </button>
          </span>
        </summary>

        <div v-if="editingVolumeIndex === volume.index" class="mneme-card" style="margin-top: 8px">
          <div class="mneme-row">
            <input
              v-model="volumeEditDraft.title"
              class="mneme-input"
              placeholder="卷宗标题"
            />
            <input
              v-model="volumeEditDraft.timeRange"
              class="mneme-input"
              placeholder="起止日期（如：xx年xx月xx日-xx年xx月xx日）"
            />
          </div>
          <textarea
            v-model="volumeEditDraft.recap"
            class="mneme-textarea"
            rows="4"
            placeholder="【xx年xx月xx日-xx年xx月xx日】这些日子里发生了什么事…"
          ></textarea>
          <div class="mneme-row">
            <button
              class="mneme-btn mneme-btn-sm"
              @click.prevent.stop="saveEditVolume(volume.index)"
            >
              保存卷宗
            </button>
            <button class="mneme-btn mneme-btn-sm" @click.prevent.stop="cancelEditVolume">
              取消
            </button>
          </div>
        </div>

        <template v-else>
          <p class="mneme-entry-body" style="margin-top: 6px">
            {{ formatVolumeRecap(volume.timeRange, volume.recap) }}
          </p>
          <details v-if="volume.entries.length" class="mneme-volume-entries">
            <summary>查看本卷原始记录（{{ volume.entries.length }} 条）</summary>
            <div
              v-for="entry in volume.entries"
              :key="entry.id"
              class="mneme-row"
              style="justify-content: space-between; margin-top: 4px"
            >
              <p class="mneme-muted" style="flex: 1">· {{ displayBody(entry) }}</p>
              <button
                class="mneme-link danger"
                title="从卷宗移除此条"
                @click.prevent.stop="remove(entry.id)"
              >
                ×
              </button>
            </div>
          </details>
        </template>
      </details>

      <!-- 第三级：典籍总卷（多卷合并合集） -->
      <div class="mneme-row" style="justify-content: space-between; margin-top: 10px">
        <div class="mneme-section-title" style="margin-top: 0">
          三、典籍总卷（多卷合集） · {{ (state.epochs ?? []).length }}
        </div>
        <button class="mneme-btn mneme-btn-sm" type="button" @click="showEpochForm = !showEpochForm">
          {{ showEpochForm ? '收起' : '+ 新增总卷' }}
        </button>
      </div>

      <form v-if="showEpochForm" class="mneme-card" @submit.prevent="addEpoch">
        <div class="mneme-row">
          <input
            v-model="epochDraft.title"
            class="mneme-input"
            placeholder="总卷标题（如：旧城迷雾篇·第一部）"
            required
          />
          <input
            v-model="epochDraft.timeRange"
            class="mneme-input"
            placeholder="起止日期（如：1924年10月1日-1924年12月30日）"
          />
        </div>
        <textarea
          v-model="epochDraft.recap"
          class="mneme-textarea"
          rows="4"
          placeholder="按「【xx年xx月xx日-xx年xx月xx日】这些日子里…」填写跨越多卷的阶段性总结"
          required
        ></textarea>
        <div class="mneme-row">
          <button class="mneme-btn mneme-btn-sm" type="submit">保存总卷</button>
          <button class="mneme-btn mneme-btn-sm" type="button" @click="showEpochForm = false">
            取消
          </button>
        </div>
      </form>

      <div v-if="(state.epochs ?? []).length === 0 && !showEpochForm" class="mneme-empty">
        暂无典籍总卷。当「已封卷宗」满 {{ epochSize }} 卷时会自动合并为一部总卷，也可点击上方「合并为总卷」或「+ 新增总卷」手动归档。
      </div>

      <details
        v-for="ep in (state.epochs ?? []).slice().reverse()"
        :key="ep.index"
        class="mneme-volume"
        :open="editingEpochIndex === ep.index"
      >
        <summary class="mneme-volume-summary">
          <span>
            第{{ ep.index }}部总卷 · 《{{ ep.title }}》<span v-if="ep.timeRange"
              >【{{ ep.timeRange }}】</span
            ><span v-if="ep.auto" class="mneme-warn">（自动合并）</span>
          </span>
          <span class="mneme-entry-actions">
            <button
              v-if="ep.volumes.length > 0"
              class="mneme-link"
              title="调用当前模型将本总卷下的各卷重新提炼为【起止年月日】总览"
              :disabled="summarizingEpoch === ep.index"
              @click.prevent.stop="aiSummarizeEpoch(ep)"
            >
              {{ summarizingEpoch === ep.index ? '总结中…' : 'AI总结' }}
            </button>
            <button
              class="mneme-link"
              title="编辑该总卷"
              @click.prevent.stop="startEditEpoch(ep)"
            >
              编辑
            </button>
            <button
              class="mneme-link danger"
              title="删除该总卷"
              @click.prevent.stop="removeEpoch(ep.index)"
            >
              删除
            </button>
          </span>
        </summary>

        <div v-if="editingEpochIndex === ep.index" class="mneme-card" style="margin-top: 8px">
          <div class="mneme-row">
            <input
              v-model="epochEditDraft.title"
              class="mneme-input"
              placeholder="总卷标题"
            />
            <input
              v-model="epochEditDraft.timeRange"
              class="mneme-input"
              placeholder="起止日期（如：xx年xx月xx日-xx年xx月xx日）"
            />
          </div>
          <textarea
            v-model="epochEditDraft.recap"
            class="mneme-textarea"
            rows="4"
            placeholder="【xx年xx月xx日-xx年xx月xx日】这些日子里发生了什么事…"
          ></textarea>
          <div class="mneme-row">
            <button
              class="mneme-btn mneme-btn-sm"
              @click.prevent.stop="saveEditEpoch(ep.index)"
            >
              保存总卷
            </button>
            <button class="mneme-btn mneme-btn-sm" @click.prevent.stop="editingEpochIndex = null">
              取消
            </button>
          </div>
        </div>

        <template v-else>
          <p class="mneme-entry-body" style="margin-top: 6px">
            {{ formatVolumeRecap(ep.timeRange, ep.recap) }}
          </p>
          <details v-if="ep.volumes.length" class="mneme-volume-entries">
            <summary>本总卷合并了 {{ ep.volumes.length }} 卷分卷宗</summary>
            <div
              v-for="subVol in ep.volumes"
              :key="subVol.index"
              class="mneme-card"
              style="margin-top: 6px; padding: 6px 10px"
            >
              <strong>第{{ subVol.index }}卷 · 《{{ subVol.title }}》</strong>
              <p class="mneme-muted">{{ formatVolumeRecap(subVol.timeRange, subVol.recap) }}</p>
            </div>
          </details>
        </template>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { EpochVolume, Importance, MemoryEntry, Volume } from '../../core/types.ts';
import { removeEntry } from '../../core/reduce.ts';
import { formatEntryUnified, formatVolumeRecap, sealEpoch, sealVolume } from '../../core/seal.ts';
import { cloneData } from '../../core/clone.ts';
import { store, commitState, flushState } from '../../store/chat-state.ts';
import { settingsStore, updateSettings } from '../../store/ui-settings.ts';
import { getCurrentInjectionText, refreshInjection } from '../../host/events.ts';
import {
  defaultEpochPrompt,
  defaultSealPrompt,
  defaultSummaryPrompt,
  estimateTokens,
} from '../../core/inject.ts';
import { getCtx } from '../../host/context.ts';

const state = computed(() => store.state);
const volumeSize = computed(() => settingsStore.volumeSize);
const epochSize = computed(() => settingsStore.epochSize ?? 10);
const query = ref('');
const showForm = ref(false);
const showPrompt = ref(false);
const showFullPreview = ref(false);
const showVolumeForm = ref(false);
const showEpochForm = ref(false);
const copied = ref(false);
const summarizingVolume = ref<number | null>(null);
const summarizingEpoch = ref<number | null>(null);
const promptDraft = ref('');
const sealPromptDraft = ref('');
const epochPromptDraft = ref('');

const fullInjectionText = computed(() => {
  void store.state;
  void settingsStore.enabled;
  void settingsStore.enableMemory;
  void settingsStore.enableBonds;
  void settingsStore.enableItems;
  void settingsStore.enableEvents;
  void settingsStore.summaryPrompt;
  void settingsStore.sealPrompt;
  void settingsStore.epochPrompt;
  void settingsStore.tokenBudget;
  void settingsStore.volumeSize;
  void settingsStore.epochSize;
  return getCurrentInjectionText();
});

const previewTokens = computed(() => estimateTokens(fullInjectionText.value));

const draft = reactive({
  summary: '',
  importance: 'normal' as Importance,
});

const editingId = ref('');
const draftEdit = reactive({
  summary: '',
  importance: 'normal' as Importance,
});

const volumeDraft = reactive({
  title: '',
  timeRange: '',
  recap: '',
});

const editingVolumeIndex = ref<number | null>(null);
const volumeEditDraft = reactive({
  title: '',
  timeRange: '',
  recap: '',
});

const epochDraft = reactive({
  title: '',
  timeRange: '',
  recap: '',
});

const editingEpochIndex = ref<number | null>(null);
const epochEditDraft = reactive({
  title: '',
  timeRange: '',
  recap: '',
});

const numberedEntries = computed(() => {
  const list = state.value?.entries ?? [];
  return list.map((entry, index) => ({ entry, number: index + 1 }));
});

const entries = computed(() => {
  const keyword = query.value.trim();
  if (!keyword) return numberedEntries.value;
  return numberedEntries.value.filter(({ entry }) =>
    displayBody(entry).includes(keyword),
  );
});

const latestId = computed(() => {
  const list = state.value?.entries ?? [];
  return list[list.length - 1]?.id ?? '';
});

function toggleModule(key: 'enableMemory', val: boolean): void {
  updateSettings({ [key]: val });
  refreshInjection();
}

function toggleFullPreview(): void {
  showFullPreview.value = !showFullPreview.value;
}

async function copyInjection(): Promise<void> {
  try {
    await navigator.clipboard?.writeText(fullInjectionText.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    copied.value = false;
  }
}

function displayBody(entry: MemoryEntry): string {
  return formatEntryUnified(entry);
}

function previewText(entry: MemoryEntry): string {
  const full = displayBody(entry);
  return full.length > 26 ? `${full.slice(0, 26)}…` : full;
}

function importanceLabel(importance: Importance): string {
  return importance === 'permanent' ? '永久' : importance === 'major' ? '重要' : '普通';
}

function startEdit(entry: MemoryEntry): void {
  editingId.value = entry.id;
  draftEdit.summary = displayBody(entry);
  draftEdit.importance = entry.importance;
}

function saveEdit(entryId: string): void {
  if (!state.value) return;
  const summary = draftEdit.summary.trim();
  if (!summary) return;

  const next = cloneData(state.value);
  const entry = next.entries.find((item) => item.id === entryId);
  if (!entry) return;

  entry.summary = summary;
  entry.storyTime = '';
  entry.location = '';
  entry.importance = draftEdit.importance;

  commitState(next);
  refreshInjection();
  void flushState();
  editingId.value = '';
}

function cancelEdit(): void {
  editingId.value = '';
}

function addEntry(): void {
  if (!state.value) return;
  const summary = draft.summary.trim();
  if (!summary) return;

  const now = Date.now();
  const entry: MemoryEntry = {
    id: `manual-${now}`,
    messageId: -1,
    swipeId: 0,
    mesHash: '',
    at: now,
    storyTime: '',
    location: '',
    summary,
    characters: [],
    result: '',
    importance: draft.importance,
    volume: state.value.stats.sealedVolumes + 1,
    source: 'manual',
  };

  const next = cloneData(state.value);
  next.entries.push(entry);
  next.stats.totalEntries += 1;

  commitState(next);
  refreshInjection();
  void flushState();

  draft.summary = '';
  draft.importance = 'normal';
  showForm.value = false;
}

function remove(entryId: string): void {
  if (!state.value) return;
  commitState(removeEntry(state.value, entryId));
  refreshInjection();
  void flushState();
}

function manualSealCurrent(): void {
  if (!state.value || state.value.entries.length === 0) return;
  const next = cloneData(state.value);
  const sealed = sealVolume(next, undefined, settingsStore.volumeSize);
  commitState(next);
  refreshInjection();
  void flushState();
  startEditVolume(sealed);
}

function manualSealEpoch(): void {
  if (!state.value || state.value.volumes.length === 0) return;
  const next = cloneData(state.value);
  const sealedEp = sealEpoch(next, undefined, epochSize.value);
  commitState(next);
  refreshInjection();
  void flushState();
  startEditEpoch(sealedEp);
}

async function aiSummarizeVolume(volume: Volume): Promise<void> {
  if (!state.value || volume.entries.length === 0) return;
  const ctx = getCtx();
  summarizingVolume.value = volume.index;
  try {
    const lines = volume.entries.map((e, i) => `${i + 1}. ${displayBody(e)}`).join('\n');
    const customSeal = (settingsStore.sealPrompt ?? '').trim() || defaultSealPrompt();
    const prompt = [
      '请根据以下本卷的记忆条目，整理出一份连贯的卷宗总结，只输出一个 JSON 对象：',
      customSeal,
      '',
      '本卷记忆条目：',
      lines,
    ].join('\n');

    if (typeof ctx?.generateRaw === 'function') {
      const raw = await ctx.generateRaw({ prompt, quietToLoud: false });
      const text = String(raw ?? '');
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(text.slice(start, end + 1));
        const sealObj = parsed.seal ?? parsed;
        const next = cloneData(state.value);
        const target = next.volumes.find((v) => v.index === volume.index);
        if (target) {
          if (sealObj.title) target.title = String(sealObj.title).trim();
          if (sealObj.timeRange || sealObj.time_range) {
            target.timeRange = String(sealObj.timeRange ?? sealObj.time_range).trim();
          }
          if (sealObj.recap) {
            target.recap = formatVolumeRecap(target.timeRange, String(sealObj.recap).trim());
            target.auto = false;
          }
          if (editingVolumeIndex.value === volume.index) {
            volumeEditDraft.title = target.title;
            volumeEditDraft.timeRange = target.timeRange;
            volumeEditDraft.recap = target.recap;
            editingVolumeIndex.value = null;
          }
          commitState(next);
          refreshInjection();
          await flushState();
        }
      }
    }
  } catch (err) {
    console.warn('[Mneme] AI volume summarize failed', err);
  } finally {
    summarizingVolume.value = null;
  }
}

async function aiSummarizeEpoch(ep: EpochVolume): Promise<void> {
  if (!state.value || ep.volumes.length === 0) return;
  const ctx = getCtx();
  summarizingEpoch.value = ep.index;
  try {
    const lines = ep.volumes
      .map((v) => `第${v.index}卷《${v.title}》：${formatVolumeRecap(v.timeRange, v.recap)}`)
      .join('\n');
    const customEpoch = (settingsStore.epochPrompt ?? '').trim() || defaultEpochPrompt();
    const prompt = [
      '请根据以下各分卷宗的总结，合并提炼出一部典籍总卷总结，只输出一个 JSON 对象：',
      customEpoch,
      '',
      '各分卷宗内容：',
      lines,
    ].join('\n');

    if (typeof ctx?.generateRaw === 'function') {
      const raw = await ctx.generateRaw({ prompt, quietToLoud: false });
      const text = String(raw ?? '');
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(text.slice(start, end + 1));
        const epochObj = parsed.epoch ?? parsed.seal ?? parsed;
        const next = cloneData(state.value);
        const target = (next.epochs ?? []).find((item) => item.index === ep.index);
        if (target) {
          if (epochObj.title) target.title = String(epochObj.title).trim();
          if (epochObj.timeRange || epochObj.time_range) {
            target.timeRange = String(epochObj.timeRange ?? epochObj.time_range).trim();
          }
          if (epochObj.recap) {
            target.recap = formatVolumeRecap(target.timeRange, String(epochObj.recap).trim());
            target.auto = false;
          }
          if (editingEpochIndex.value === ep.index) {
            epochEditDraft.title = target.title;
            epochEditDraft.timeRange = target.timeRange;
            epochEditDraft.recap = target.recap;
            editingEpochIndex.value = null;
          }
          commitState(next);
          refreshInjection();
          await flushState();
        }
      }
    }
  } catch (err) {
    console.warn('[Mneme] AI epoch summarize failed', err);
  } finally {
    summarizingEpoch.value = null;
  }
}

function addVolume(): void {
  if (!state.value) return;
  const title = volumeDraft.title.trim();
  const timeRange = volumeDraft.timeRange.trim();
  const recap = formatVolumeRecap(timeRange, volumeDraft.recap.trim());
  if (!title || !recap) return;

  const next = cloneData(state.value);
  const index = next.stats.sealedVolumes + 1;
  next.volumes.push({
    index,
    title,
    timeRange,
    recap,
    entries: [],
    sealedAt: Date.now(),
    auto: false,
  });
  next.stats.sealedVolumes = index;

  commitState(next);
  refreshInjection();
  void flushState();

  volumeDraft.title = '';
  volumeDraft.timeRange = '';
  volumeDraft.recap = '';
  showVolumeForm.value = false;
}

function startEditVolume(volume: Volume): void {
  editingVolumeIndex.value = volume.index;
  volumeEditDraft.title = volume.title;
  volumeEditDraft.timeRange = volume.timeRange;
  volumeEditDraft.recap = volume.recap;
}

function saveEditVolume(index: number): void {
  if (!state.value) return;
  const next = cloneData(state.value);
  const target = next.volumes.find((v) => v.index === index);
  if (!target) return;

  target.title = volumeEditDraft.title.trim() || `第 ${index} 卷`;
  target.timeRange = volumeEditDraft.timeRange.trim();
  target.recap = formatVolumeRecap(target.timeRange, volumeEditDraft.recap.trim());
  target.auto = false;

  commitState(next);
  refreshInjection();
  void flushState();
  editingVolumeIndex.value = null;
}

function cancelEditVolume(): void {
  editingVolumeIndex.value = null;
}

function removeVolume(index: number): void {
  if (!state.value) return;
  const next = cloneData(state.value);
  next.volumes = next.volumes.filter((v) => v.index !== index);
  next.volumes.forEach((v, idx) => {
    v.index = idx + 1;
  });
  next.stats.sealedVolumes = next.volumes.length;
  if (editingVolumeIndex.value === index) editingVolumeIndex.value = null;
  commitState(next);
  refreshInjection();
  void flushState();
}

function addEpoch(): void {
  if (!state.value) return;
  const title = epochDraft.title.trim();
  const timeRange = epochDraft.timeRange.trim();
  const recap = formatVolumeRecap(timeRange, epochDraft.recap.trim());
  if (!title || !recap) return;

  const next = cloneData(state.value);
  if (!Array.isArray(next.epochs)) next.epochs = [];
  const index = (next.stats.sealedEpochs ?? next.epochs.length) + 1;
  next.epochs.push({
    index,
    title,
    timeRange,
    recap,
    volumes: [],
    sealedAt: Date.now(),
    auto: false,
  });
  next.stats.sealedEpochs = index;

  commitState(next);
  refreshInjection();
  void flushState();

  epochDraft.title = '';
  epochDraft.timeRange = '';
  epochDraft.recap = '';
  showEpochForm.value = false;
}

function startEditEpoch(ep: EpochVolume): void {
  editingEpochIndex.value = ep.index;
  epochEditDraft.title = ep.title;
  epochEditDraft.timeRange = ep.timeRange;
  epochEditDraft.recap = ep.recap;
}

function saveEditEpoch(index: number): void {
  if (!state.value) return;
  const next = cloneData(state.value);
  const target = (next.epochs ?? []).find((ep) => ep.index === index);
  if (!target) return;

  target.title = epochEditDraft.title.trim() || `第 ${index} 部总卷`;
  target.timeRange = epochEditDraft.timeRange.trim();
  target.recap = formatVolumeRecap(target.timeRange, epochEditDraft.recap.trim());
  target.auto = false;

  commitState(next);
  refreshInjection();
  void flushState();
  editingEpochIndex.value = null;
}

function removeEpoch(index: number): void {
  if (!state.value) return;
  const next = cloneData(state.value);
  next.epochs = (next.epochs ?? []).filter((ep) => ep.index !== index);
  next.epochs.forEach((ep, idx) => {
    ep.index = idx + 1;
  });
  next.stats.sealedEpochs = next.epochs.length;
  if (editingEpochIndex.value === index) editingEpochIndex.value = null;
  commitState(next);
  refreshInjection();
  void flushState();
}

function togglePrompt(): void {
  showPrompt.value = !showPrompt.value;
  if (showPrompt.value) {
    promptDraft.value =
      settingsStore.summaryPrompt ||
      defaultSummaryPrompt({
        enableMemory: settingsStore.enableMemory,
        enableBonds: settingsStore.enableBonds,
        enableItems: settingsStore.enableItems,
        enableEvents: settingsStore.enableEvents,
      });
    sealPromptDraft.value = settingsStore.sealPrompt || defaultSealPrompt();
    epochPromptDraft.value = settingsStore.epochPrompt || defaultEpochPrompt();
  }
}

function savePrompt(): void {
  updateSettings({
    summaryPrompt: promptDraft.value.trim(),
    sealPrompt: sealPromptDraft.value.trim(),
    epochPrompt: epochPromptDraft.value.trim(),
  });
  refreshInjection();
  showPrompt.value = false;
}

function resetPrompt(): void {
  promptDraft.value = defaultSummaryPrompt({
    enableMemory: settingsStore.enableMemory,
    enableBonds: settingsStore.enableBonds,
    enableItems: settingsStore.enableItems,
    enableEvents: settingsStore.enableEvents,
  });
  sealPromptDraft.value = defaultSealPrompt();
  epochPromptDraft.value = defaultEpochPrompt();
  updateSettings({ summaryPrompt: '', sealPrompt: '', epochPrompt: '' });
  refreshInjection();
}
</script>
