// 把普通脚本（IIFE 挂全局）加载进 vm 沙箱，供 node --test 使用；
// 沙箱可注入假 chrome / document 等全局
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadScripts(files, sandbox = {}) {
  // vm 沙箱没有 Node 定时器；注入宿主实现，t.mock.timers 可替换
  const context = vm.createContext({ setTimeout, clearTimeout, ...sandbox });
  for (const file of files) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  return context;
}

function getGlobal(context, name) {
  return vm.runInContext(name, context);
}

module.exports = { loadScripts, getGlobal };
