<template>
  <div class="mneme-tab-body">
    <div class="mneme-row" style="justify-content: space-between">
      <label class="mneme-inline-toggle" title="关闭后不再向 AI 注入羁绊，也不要求 AI 输出 bonds 字段">
        <input
          type="checkbox"
          :checked="settingsStore.enableBonds !== false"
          @change="toggleModule(($event.target as HTMLInputElement).checked)"
        />
        <span>启用羁绊注入与读取</span>
      </label>
      <button class="mneme-btn mneme-btn-sm" type="button" @click="showAddForm = !showAddForm">
        {{ showAddForm ? '收起' : '+ 添加角色' }}
      </button>
    </div>

    <form v-if="showAddForm" class="mneme-card" @submit.prevent="addBond">
      <div class="mneme-row">
        <input v-model="newName" class="mneme-input" placeholder="新增角色名" required />
        <input
          v-model="newScore"
          class="mneme-input"
          style="max-width: 96px"
          type="number"
          step="0.1"
          placeholder="初始好感"
        />
      </div>
      <input
        v-model="newRelation"
        class="mneme-input"
        placeholder="与 user 的关系（选填，如：恋人、朋友、亲人，或十几字的具体关系）"
      />
      <textarea
        v-model="newImpression"
        class="mneme-textarea"
        rows="2"
        placeholder="对 user 的初始印象（选填）"
      ></textarea>
      <div class="mneme-row">
        <button class="mneme-btn mneme-btn-sm" type="submit">保存角色</button>
        <button class="mneme-btn mneme-btn-sm" type="button" @click="showAddForm = false">取消</button>
      </div>
    </form>

    <div v-if="!state" class="mneme-empty">当前没有打开的聊天。</div>
    <div v-else-if="bonds.length === 0" class="mneme-empty">
      还没有羁绊记录。对话中出现角色好感或印象变化时会自动收录，也可点击右上角「+ 添加角色」手动添加。
    </div>

    <article v-for="bond in bonds" :key="bond.name" class="mneme-bond">
      <div class="mneme-bond-line">
        <strong class="mneme-bond-name">{{ bond.name }}</strong>
        <span v-if="bond.relation" class="mneme-chip mneme-bond-tier">{{ bond.relation }}</span>
        <span class="mneme-chip mneme-imp-major">好感 {{ score(bond) }}</span>
        <span class="mneme-entry-actions">
          <button class="mneme-link" type="button" @click="startEdit(bond)">
            {{ editingName === bond.name ? '收起' : '编辑' }}
          </button>
          <button
            class="mneme-link danger"
            type="button"
            title="移除角色"
            @click="removeBond(bond.name)"
          >
            删除
          </button>
        </span>
      </div>

      <div v-if="editingName === bond.name" class="mneme-card" style="margin-top: 4px">
        <div class="mneme-row">
          <span class="mneme-bond-label" style="min-width: 60px">当前好感</span>
          <input
            v-model="editDraft.score"
            class="mneme-input"
            style="max-width: 110px"
            type="number"
            step="0.1"
          />
        </div>
        <div class="mneme-bond-block">
          <span class="mneme-bond-label">当前关系</span>
          <input
            v-model="editDraft.relation"
            class="mneme-input"
            placeholder="如：恋人、朋友、亲人、互相试探的搭档…"
          />
        </div>
        <div class="mneme-bond-block">
          <span class="mneme-bond-label">对 user 的印象</span>
          <textarea
            v-model="editDraft.impression"
            class="mneme-textarea"
            rows="3"
            placeholder="角色当前对 user 的整体印象与态度"
          ></textarea>
        </div>
        <div class="mneme-row">
          <button class="mneme-btn mneme-btn-sm" type="button" @click="saveEdit(bond.name)">
            保存修改
          </button>
          <button class="mneme-btn mneme-btn-sm" type="button" @click="editingName = ''">
            取消
          </button>
        </div>
      </div>

      <template v-else>
        <div class="mneme-bond-block">
          <span class="mneme-bond-label">对 user 的印象</span>
          <p class="mneme-entry-body">{{ impression(bond) || '暂无印象记录' }}</p>
        </div>
      </template>

      <details class="mneme-bond-events" :open="addingEventFor === bond.name">
        <summary class="mneme-bond-events-head">
          <span>重大好感变动事件（{{ bond.events.length }}）</span>
          <button
            type="button"
            class="mneme-link"
            @click.prevent.stop="toggleEventForm(bond.name)"
          >
            {{ addingEventFor === bond.name ? '收起' : '+ 记录重大事件' }}
          </button>
        </summary>

        <form
          v-if="addingEventFor === bond.name"
          class="mneme-row"
          style="margin-top: 6px"
          @submit.prevent="addMajorEvent(bond.name)"
        >
          <input
            v-model="eventDraft.delta"
            class="mneme-input"
            style="max-width: 78px"
            type="number"
            step="0.1"
            placeholder="变动值"
          />
          <input
            v-model="eventDraft.text"
            class="mneme-input"
            placeholder="重大好感事件简述（无需每轮都记）"
            required
          />
          <button class="mneme-btn mneme-btn-sm" type="submit">保存</button>
        </form>

        <p v-if="bond.events.length === 0" class="mneme-muted" style="margin-top: 4px">
          暂无重大好感事件（日常好感加减直接计入总好感，不在此刷屏）。
        </p>

        <div
          v-for="event in bond.events"
          :key="event.id"
          class="mneme-row"
          style="justify-content: space-between; margin-top: 4px"
        >
          <p class="mneme-muted" style="flex: 1">
            <span :class="`mneme-imp-${event.delta >= 0 ? 'major' : 'permanent'}`">
              {{ event.delta >= 0 ? '+' : '' }}{{ roundDecimal(event.delta, 1) }}
            </span>
            {{ event.text }}
          </p>
          <button
            class="mneme-link danger"
            title="删除该事件并回退对应好感变动"
            @click="removeEvent(bond.name, event.id)"
          >
            ×
          </button>
        </div>
      </details>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { Bond } from '../../core/types.ts';
import { bondScore, roundDecimal } from '../../core/bonds.ts';
import { cloneData } from '../../core/clone.ts';
import { store, commitState, flushState } from '../../store/chat-state.ts';
import { settingsStore, updateSettings } from '../../store/ui-settings.ts';
import { refreshInjection } from '../../host/events.ts';

const state = computed(() => store.state);
const showAddForm = ref(false);
const newName = ref('');
const newScore = ref<string>('');
const newRelation = ref('');
const newImpression = ref('');

const editingName = ref('');
const editDraft = reactive({
  score: '0',
  relation: '',
  impression: '',
});

const addingEventFor = ref('');
const eventDraft = reactive({ delta: '1.0', text: '' });

const bonds = computed(() =>
  Object.values(state.value?.bonds ?? {}).sort((a, b) => bondScore(b) - bondScore(a)),
);

function toggleModule(val: boolean): void {
  updateSettings({ enableBonds: val });
  refreshInjection();
}

function score(bond: Bond): number {
  return bondScore(bond);
}

function impression(bond: Bond): string {
  return bond.impressionOverride ?? bond.impression;
}

function addBond(): void {
  const name = newName.value.trim();
  if (!state.value || !name) return;
  const initVal = roundDecimal(Number(newScore.value) || 0, 1);
  const next = cloneData(state.value);
  const imp = newImpression.value.trim();
  if (!next.bonds[name]) {
    next.bonds[name] = {
      name,
      initialScore: initVal,
      manualDelta: 0,
      relation: newRelation.value.trim(),
      impression: imp,
      impressionOverride: imp || undefined,
      events: [],
      updatedAt: Date.now(),
    };
  }
  newName.value = '';
  newScore.value = '';
  newRelation.value = '';
  newImpression.value = '';
  showAddForm.value = false;
  commitState(next);
  refreshInjection();
  void flushState();
}

function startEdit(bond: Bond): void {
  if (editingName.value === bond.name) {
    editingName.value = '';
    return;
  }
  editingName.value = bond.name;
  editDraft.score = String(score(bond));
  editDraft.relation = bond.relation ?? '';
  editDraft.impression = impression(bond);
}

function saveEdit(name: string): void {
  if (!state.value) return;
  const next = cloneData(state.value);
  const bond = next.bonds[name];
  if (!bond) return;

  const rawScore = Number(editDraft.score);
  const desired = roundDecimal(Number.isFinite(rawScore) ? rawScore : 0, 1);
  const eventTotal = bond.events.reduce((sum, item) => sum + (Number(item.delta) || 0), 0);
  bond.manualDelta = roundDecimal(desired - (Number(bond.initialScore) || 0) - eventTotal, 1);

  bond.relation = editDraft.relation.trim();
  const cleanImp = editDraft.impression.trim();
  bond.impression = cleanImp;
  bond.impressionOverride = cleanImp || undefined;
  bond.updatedAt = Date.now();

  editingName.value = '';
  commitState(next);
  refreshInjection();
  void flushState();
}

function toggleEventForm(name: string): void {
  if (addingEventFor.value === name) {
    addingEventFor.value = '';
  } else {
    addingEventFor.value = name;
    eventDraft.delta = '1.0';
    eventDraft.text = '';
  }
}

function addMajorEvent(name: string): void {
  if (!state.value) return;
  const text = eventDraft.text.trim();
  if (!text) return;
  const delta = roundDecimal(Number(eventDraft.delta) || 0, 1);
  const next = cloneData(state.value);
  const bond = next.bonds[name];
  if (!bond) return;
  bond.events.push({
    id: `manual-ev-${Date.now()}`,
    text,
    delta,
    importance: 'major',
    at: Date.now(),
    entryId: null,
    messageId: null,
    major: true,
  });
  bond.updatedAt = Date.now();
  commitState(next);
  refreshInjection();
  void flushState();
  eventDraft.text = '';
  addingEventFor.value = '';
}

function removeEvent(name: string, eventId: string): void {
  if (!state.value) return;
  const next = cloneData(state.value);
  const bond = next.bonds[name];
  if (!bond) return;
  bond.events = bond.events.filter((event) => event.id !== eventId);
  commitState(next);
  refreshInjection();
  void flushState();
}

function removeBond(name: string): void {
  if (!state.value) return;
  const next = cloneData(state.value);
  delete next.bonds[name];
  commitState(next);
  refreshInjection();
  void flushState();
}
</script>
