import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const pagePath = fileURLToPath(new URL('../index.html', import.meta.url));
const html = readFileSync(pagePath, 'utf8');

test('自我介绍页存在且是完整的中文 HTML 文档', () => {
  assert.match(html, /^<!DOCTYPE html>/i);
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<\/html>\s*$/);
});

test('包含全部主要章节，且导航锚点都能对应到实际节点', () => {
  const ids = ['top', 'skills', 'tools', 'flow', 'boundaries', 'demo'];
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `缺少 id="${id}" 的章节`);
  }
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(anchors.length > 0, '页面应包含站内锚点导航');
  for (const anchor of anchors) {
    assert.ok(ids.includes(anchor), `锚点 #${anchor} 没有对应的章节`);
  }
});

test('介绍内容覆盖核心能力与工作方式', () => {
  for (const keyword of ['读懂代码库', '安全地改代码', '运行命令', '诚实汇报验证', '我的工作方式', '我不会做的事']) {
    assert.ok(html.includes(keyword), `缺少内容：${keyword}`);
  }
});

test('页面自包含：不引用任何外部资源，可离线直接用 file:// 打开', () => {
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']https?:\/\//i, '不应引用外部资源');
  assert.doesNotMatch(html, /<link\b[^>]*rel=["']stylesheet["']/i, '不应引用外部样式表');
  assert.match(html, /<style>/, '样式应内联在页面中');
  assert.match(html, /<script>/, '脚本应内联在页面中');
});

test('内联脚本语法有效，且 greet 逻辑与 src/hello.js 保持一致', async () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, '未找到内联脚本');
  // 编译一次即可验证语法，不会执行任何 DOM 代码
  assert.doesNotThrow(() => new Script(script));

  const { greet } = await import('../src/hello.js');
  assert.equal(greet('Ada'), 'Hello, Ada!');
  assert.equal(greet(), 'Hello, developer!');
  assert.ok(script.includes("'Hello, ' +"), '页面内应使用相同的问候逻辑');
});
