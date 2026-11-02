<template>
  <div class="mneme-tab-body">
    <div class="mneme-section-title">使用说明</div>

    <h3 class="mneme-help-title">岁记 是什么</h3>
    <p class="mneme-entry-body">
      一个分聊天独立绑定的 SillyTavern 三级卷宗式记忆插件（<code>Suiji</code>）。每轮对话结束后，模型会在回复末尾附带一个
      <code>&lt;!--SUIJI ... SUIJI--&gt;</code>
      结构化记忆块，插件解析后将其收入账本；下一次生成前再自动把账本注入到提示词中。
    </p>

    <h3 class="mneme-help-title">四个核心模块</h3>
    <p class="mneme-entry-body">
      <b>记忆（三级卷宗）</b>：按「【xx年xx月xx日（具体时间）·xx地点】发生了xx事」合一记录；当前卷满 N 条自动封存进「已封卷宗」，已封卷宗满 M 卷自动合并进「典籍总卷」，各级卷宗均支持手动新增、AI 总结与编辑修改。<br />
      <b>羁绊</b>：好感度支持小数点后一位并按角色卡规则自由加减；支持自定义关系描述；对 user 的印象独立成行展示；事件仅记录重大好感转折。<br />
      <b>道具</b>：支持「持有中」「已赠出（送给他人）」「已遗失」「已消耗」状态及物品当前状况，详细记录物品来历、持有者与具体作用。<br />
      <b>重要事件</b>：永久保留 user 与他人立下的约定、誓言、束缚，以及救人、杀敌等重大命运事件，绝不被预算裁切。
    </p>

    <h3 class="mneme-help-title">提示词注入位置与回退原理</h3>
    <p class="mneme-entry-body">
      <b>注入到哪里？</b><br />
      通过酒馆原生接口 <code>setExtensionPrompt('suiji', text, 1, 1, false, 0)</code> 注入：位于聊天历史内部（IN_CHAT）、深度 <code>depth = 1</code>（即最新一轮对话的正上方）、角色为 <code>system</code>。<br /><br />
      <b>删除最新楼层 / 重说最新楼层会怎样？</b><br />
      每轮生成前会自动保存上一轮的羁绊、道具与事件快照。当你删除或重说最新楼层时，只会精准回退被删楼层，当前卷其它记忆完好无损，且羁绊好感、印象、关系与道具会自动恢复到上一轮状态。<br /><br />
      <b>为什么以前会裁切对话？</b><br />
      旧版默认开启了早期对话裁切；现已在「设置」中完全移除自动裁切历史对话，绝不会再擅自删减你的聊天上下文或误伤正文。
    </p>
  </div>
</template>

<script setup lang="ts"></script>
