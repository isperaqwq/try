import type { ImportantEvent, MemoryEntry, MnemeSettings, MnemeState } from './types.ts';
import { bondRelation, bondScore } from './bonds.ts';
import { formatEntryUnified, formatVolumeRecap } from './seal.ts';

export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (/[㐀-鿿豈-﫿　-〿＀-￯]/.test(char)) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return Math.ceil(cjk + other / 4);
}

function renderEntryLine(entry: MemoryEntry): string {
  const mark = entry.importance === 'permanent' ? '★' : entry.importance === 'major' ? '◆' : '';
  const body = formatEntryUnified(entry);
  const anchor = entry.anchor ? `（锚点：${entry.anchor}）` : '';
  return `${mark}${body}${anchor}`;
}

function renderEntries(entries: MemoryEntry[], title: string): string {
  if (entries.length === 0) return '';
  return `<岁记·${title}>\n${entries.map(renderEntryLine).join('\n')}\n</岁记·${title}>`;
}

function renderImportantEvents(events: ImportantEvent[]): string {
  if (!Array.isArray(events) || events.length === 0) return '';
  const lines = events.map((ev) => {
    const cat = ev.category ? `【${ev.category}】` : '【重大事件】';
    const title = ev.title ? `${ev.title}：` : '';
    return `★${cat}${title}${ev.content}`;
  });
  return `<岁记·重要事件与誓言>\n${lines.join('\n')}\n</岁记·重要事件与誓言>`;
}

export function defaultSealPrompt(): string {
  return [
    '当前卷记忆已满，请在本次 JSON 中额外附带 "seal" 字段对本卷进行归档总结：',
    '"seal": {',
    '  "title": "四到八字卷名",',
    '  "timeRange": "xx年xx月xx日-xx年xx月xx日",',
    '  "recap": "【xx年xx月xx日-xx年xx月xx日】用连贯流畅的叙事总结这些日子里发生了什么事、关键转折与最终结果（150-300字，切勿逐条罗列流水账）"',
    '}',
  ].join('\n');
}

export function defaultEpochPrompt(): string {
  return [
    '已封存卷宗已达到合并阈值，请在本次 JSON 中额外附带 "epoch" 字段，将近期各卷合并总结为一部总卷：',
    '"epoch": {',
    '  "title": "四到八字总卷名",',
    '  "timeRange": "xx年xx月xx日-xx年xx月xx日",',
    '  "recap": "【xx年xx月xx日-xx年xx月xx日】用连贯宏大的叙事总结这一阶段（多卷跨度）内发生的核心主线脉络、人物命运转折与最终格局（200-400字）"',
    '}',
  ].join('\n');
}

export function defaultSummaryPrompt(
  modules: {
    enableMemory?: boolean;
    enableBonds?: boolean;
    enableItems?: boolean;
    enableEvents?: boolean;
  } = {},
): string {
  const mem = modules.enableMemory !== false;
  const bonds = modules.enableBonds !== false;
  const items = modules.enableItems !== false;
  const events = modules.enableEvents !== false;

  const jsonFields: string[] = [];
  const rules: string[] = [];
  let step = 1;

  if (mem) {
    jsonFields.push(
      [
        '  "summary": "【xx年xx月xx日（具体时间）·xx地点】用紧凑流畅的一段话记录本轮发生的事件与结果（30-80字）",',
        '  "importance": "normal"',
      ].join('\n'),
    );
    rules.push(
      `${step++}. summary 与 importance：summary 必须包含具体年月日，按「【xx年xx月xx日（时间）·xx地点】发生了什么事」一段话写清；importance 填 "normal"（普通日常）、"major"（重要剧情转折）或 "permanent"（永久关键记忆）。`,
    );
  }

  if (bonds) {
    jsonFields.push(
      [
        '  "bonds": [',
        '    {',
        '      "name": "角色名",',
        '      "delta": 0.5,',
        '      "relation": "当前与user的关系（无变化填 \\"\\"）",',
        '      "impression": "当前对user的印象（无变化填 \\"\\"）",',
        '      "majorEvent": "仅在发生重大好感转折事件时填写简述，日常小幅加减分统一填 \\"\\""',
        '    }',
        '  ]',
      ].join('\n'),
    );
    rules.push(
      `${step++}. bonds：遵循角色卡好感规则，delta 支持小数（如 0.5、-1.2）。若某项字符串（如 majorEvent、relation、impression）本轮未发生或无变化，请保留字段并填 ""（空字符串）；若本轮没有任何角色好感或关系变化，"bonds" 填 []（空数组）。`,
    );
  }

  if (items) {
    jsonFields.push(
      [
        '  "items": [',
        '    {',
        '      "action": "gain|give|update|consume|lose",',
        '      "name": "物品名",',
        '      "holder": "当前持有者",',
        '      "state": "当前状态（如：完好/已开启）",',
        '      "source": "来源或赠送去向",',
        '      "description": "物品外观、来历与具体作用详情"',
        '    }',
        '  ]',
      ].join('\n'),
    );
    rules.push(
      `${step++}. items：获得填 "gain"，user 送给他人填 "give"，状态变化填 "update"，消耗填 "consume"，遗失填 "lose"；若本轮无任何物品变动，"items" 统一填 []（空数组）。`,
    );
  }

  if (events) {
    jsonFields.push(
      [
        '  "events": [',
        '    {',
        '      "category": "约定|誓言|束缚|重大事件",',
        '      "title": "简短标题",',
        '      "content": "具体条款或事件前因后果"',
        '    }',
        '  ]',
      ].join('\n'),
    );
    rules.push(
      `${step++}. events：仅在立下约定/誓言/束缚，或发生救人、杀敌、改变命运等重大事件时填写；若本轮无此类事件，"events" 统一填 []（空数组）。`,
    );
  }

  if (jsonFields.length === 0) return '';

  return [
    '请在正文完全结束后，在末尾另起一行附上且仅附上一个 HTML 注释块（严格使用标准双引号 JSON；未发生的字符串字段填 ""，无变动的数组字段填 []）：',
    '<!--SUIJI',
    '{',
    jsonFields.join(',\n'),
    '}',
    'SUIJI-->',
    '填写说明：',
    ...rules,
  ].join('\n');
}

function buildInstruction(state: MnemeState, settings: MnemeSettings): string {
  const enableMemory = settings.enableMemory !== false;
  const enableBonds = settings.enableBonds !== false;
  const enableItems = settings.enableItems !== false;
  const enableEvents = settings.enableEvents !== false;

  if (!enableMemory && !enableBonds && !enableItems && !enableEvents) {
    return '';
  }

  const size = settings.volumeSize;
  const epSize = settings.epochSize ?? 10;
  const count = state.entries.length + 1;
  const needSeal = enableMemory && count >= size;
  const needEpoch = needSeal && state.volumes.length + 1 >= epSize;

  const custom = (settings.summaryPrompt ?? '').trim();
  const staticPart =
    custom ||
    defaultSummaryPrompt({
      enableMemory,
      enableBonds,
      enableItems,
      enableEvents,
    });

  const sealInstruction = (settings.sealPrompt ?? '').trim() || defaultSealPrompt();
  const epochInstruction = (settings.epochPrompt ?? '').trim() || defaultEpochPrompt();

  const dynamic = [
    enableMemory
      ? needSeal
        ? `- 本条是当前卷第 ${size} 条（已满卷）：\n${sealInstruction}`
        : `- 当前卷进度：${count - 1}/${size} 条（已封卷宗：${state.volumes.length}/${epSize} 卷）。`
      : '',
    needEpoch ? `- 本卷封存后已满 ${epSize} 卷：\n${epochInstruction}` : '',
    '不要在正文中复述上述记录要求。',
  ]
    .filter(Boolean)
    .join('\n');

  return ['<岁记·记录要求>', staticPart, dynamic, '</岁记·记录要求>'].join('\n');
}

interface Section {
  key: string;
  text: string;
  priority: number;
  required: boolean;
}

export function buildInjection(
  state: MnemeState | null,
  settings: MnemeSettings,
  _deps: { userName: string; charName: string },
): string {
  if (!state) return '';

  const enableMemory = settings.enableMemory !== false;
  const enableBonds = settings.enableBonds !== false;
  const enableItems = settings.enableItems !== false;
  const enableEvents = settings.enableEvents !== false;

  const permanent: MemoryEntry[] = [];
  const recent: MemoryEntry[] = [];
  for (const entry of state.entries) {
    if (entry.importance === 'permanent') permanent.push(entry);
    else recent.push(entry);
  }

  const archivedPermanent: MemoryEntry[] = [];
  const archivedMajor: MemoryEntry[] = [];
  const allVolumes = [
    ...(state.epochs ?? []).flatMap((ep) => ep.volumes),
    ...state.volumes,
  ];
  const firstMajorVolume = state.stats.sealedVolumes - settings.majorRetentionVolumes + 1;
  for (const volume of allVolumes) {
    for (const entry of volume.entries) {
      if (entry.importance === 'permanent') archivedPermanent.push(entry);
      else if (entry.importance === 'major' && volume.index >= firstMajorVolume) {
        archivedMajor.push(entry);
      }
    }
  }

  const sections: Section[] = [];

  if (enableEvents) {
    sections.push({
      key: 'importantEvents',
      text: renderImportantEvents(state.importantEvents ?? []),
      priority: 98,
      required: true,
    });
  }

  if (enableMemory) {
    sections.push({
      key: 'permanent',
      text: renderEntries([...permanent, ...archivedPermanent], '永久记忆'),
      priority: 95,
      required: true,
    });

    recent.forEach((entry, index) => {
      sections.push({
        key: `recent-${entry.id}`,
        text: renderEntryLine(entry),
        priority: 50 + index,
        required: true,
      });
    });

    sections.push({
      key: 'major',
      text: renderEntries(archivedMajor, '重要记忆'),
      priority: 70,
      required: false,
    });

    const epochRecaps = (state.epochs ?? [])
      .slice(-3)
      .map((ep) => {
        const formattedRecap = formatVolumeRecap(ep.timeRange, ep.recap);
        return `第${ep.index}部总卷·《${ep.title}》：${formattedRecap}`;
      })
      .join('\n');
    sections.push({
      key: 'epochs',
      text: epochRecaps ? `<岁记·总卷>\n${epochRecaps}\n</岁记·总卷>` : '',
      priority: 42,
      required: false,
    });

    const recaps = state.volumes
      .slice(-5)
      .map((volume) => {
        const formattedRecap = formatVolumeRecap(volume.timeRange, volume.recap);
        return `第${volume.index}卷·《${volume.title}》：${formattedRecap}`;
      })
      .join('\n');
    sections.push({
      key: 'volumes',
      text: recaps ? `<岁记·卷宗>\n${recaps}\n</岁记·卷宗>` : '',
      priority: 40,
      required: false,
    });
  }

  if (enableBonds) {
    const bondLines = Object.values(state.bonds).map((bond) => {
      const score = bondScore(bond);
      const relation = bondRelation(bond);
      const impression = bond.impressionOverride ?? bond.impression;
      const majorEvents = bond.events
        .slice(-3)
        .map((e) => `${e.text}（${e.delta >= 0 ? '+' : ''}${e.delta}）`)
        .join('；');
      return [
        `${bond.name}｜好感 ${score}`,
        relation ? `关系：${relation}` : '',
        `印象：${impression || '暂无'}`,
        majorEvents ? `重大事件：${majorEvents}` : '',
      ]
        .filter(Boolean)
        .join('｜');
    });
    sections.push({
      key: 'bonds',
      text: bondLines.length ? `<岁记·羁绊>\n${bondLines.join('\n')}\n</岁记·羁绊>` : '',
      priority: 80,
      required: false,
    });
  }

  if (enableItems) {
    const itemLines = state.items
      .filter((item) => item.status === 'held' || item.status === 'gifted')
      .map((item) => {
        const statusText = item.status === 'gifted' ? '已赠出' : '持有中';
        const condText = item.condition ? `；状态：${item.condition}` : '';
        const holderText = item.holder ? `；持有者：${item.holder}` : '';
        return `${item.name}［${statusText}${condText}${holderText}；来源/去向：${item.source || '未知'}；详情：${item.effect || '未知'}］`;
      });
    sections.push({
      key: 'items',
      text: itemLines.length ? `<岁记·道具>\n${itemLines.join('\n')}\n</岁记·道具>` : '',
      priority: 45,
      required: false,
    });
  }

  const instructionText = buildInstruction(state, settings);
  if (instructionText) {
    sections.push({
      key: 'instruction',
      text: instructionText,
      priority: 999,
      required: true,
    });
  }

  const active = sections.filter((section) => section.text);
  const dropOrder = active
    .filter((section) => !section.required)
    .sort((a, b) => a.priority - b.priority);

  const total = () =>
    estimateTokens(
      active
        .filter((section) => section.text)
        .map((section) => section.text)
        .join('\n'),
    );

  let used = total();
  for (const section of dropOrder) {
    if (used <= settings.tokenBudget) break;
    section.text = '';
    used = total();
  }

  const byKey = new Map(active.map((section) => [section.key, section]));
  const recentText = active
    .filter((section) => section.key.startsWith('recent-') && section.text)
    .map((section) => section.text)
    .join('\n');

  return [
    byKey.get('importantEvents')?.text,
    byKey.get('permanent')?.text,
    recentText ? `<岁记·近期记忆>\n${recentText}\n</岁记·近期记忆>` : '',
    byKey.get('major')?.text,
    byKey.get('epochs')?.text,
    byKey.get('volumes')?.text,
    byKey.get('bonds')?.text,
    byKey.get('items')?.text,
    byKey.get('instruction')?.text,
  ]
    .filter(Boolean)
    .join('\n');
}
