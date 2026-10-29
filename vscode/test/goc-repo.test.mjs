// Repo đã cài bằng scripts/cai-vscode.sh: extension đọc ~/.config/gen-stage/root. Chạy: pnpm -C vscode test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fileGocDaCai, docGocDaCai } = require('../out/thuan/goc-repo.js');

test('fileGocDaCai: XDG_CONFIG_HOME tuyệt đối thì dùng, tương đối / vắng thì về ~/.config', () => {
  assert.equal(fileGocDaCai({ XDG_CONFIG_HOME: '/x/cfg' }, '/home/r'), '/x/cfg/gen-stage/root');
  assert.equal(fileGocDaCai({ XDG_CONFIG_HOME: 'cfg' }, '/home/r'), '/home/r/.config/gen-stage/root');
  assert.equal(fileGocDaCai({}, '/home/r'), '/home/r/.config/gen-stage/root');
});

test('docGocDaCai: đường tuyệt đối của repo thật (có khoảng trắng) → trả về; dòng thừa / xuống dòng bị bỏ', () => {
  const repo = '/home/r/Games 3d/Gen-3D-Harness';
  const doc = () => `${repo}\n`;
  assert.equal(docGocDaCai('/f', doc, (p) => p === repo), repo);
  assert.equal(docGocDaCai('/f', () => `  ${repo}  \nrác\n`, (p) => p === repo), repo);
});

test('docGocDaCai: không file / rỗng / tương đối / ký tự điều khiển / không phải repo → ""', () => {
  const laRepo = () => true;
  assert.equal(docGocDaCai('/f', () => null, laRepo), '');
  assert.equal(docGocDaCai('/f', () => '   \n', laRepo), '');
  assert.equal(docGocDaCai('/f', () => 'Gen-3D-Harness', laRepo), '');
  assert.equal(docGocDaCai('/f', () => '/a/b\u0007c', laRepo), '');
  assert.equal(docGocDaCai('/f', () => '/khong/phai/repo', () => false), '');
});
