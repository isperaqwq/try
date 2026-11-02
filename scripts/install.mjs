import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const source = resolve(process.cwd());
const target = 'D:/sl/SillyTavern/data/default-user/extensions/Suiji';

if (!existsSync(resolve(source, 'index.js')) && !existsSync(resolve(source, 'dist/index.js'))) {
  console.error('缺少编译文件，请先运行 npm run build');
  process.exit(1);
}

// 本机环境下 fs.cpSync 会被沙箱静默终止，改用递归读写
function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const fromPath = join(from, name);
    const toPath = join(to, name);
    if (statSync(fromPath).isDirectory()) copyDir(fromPath, toPath);
    else writeFileSync(toPath, readFileSync(fromPath));
  }
}

mkdirSync(target, { recursive: true });
if (existsSync(resolve(source, 'dist'))) {
  rmSync(resolve(target, 'dist'), { recursive: true, force: true });
  copyDir(resolve(source, 'dist'), resolve(target, 'dist'));
}
if (existsSync(resolve(source, 'index.js'))) {
  writeFileSync(resolve(target, 'index.js'), readFileSync(resolve(source, 'index.js')));
} else if (existsSync(resolve(source, 'dist/index.js'))) {
  writeFileSync(resolve(target, 'index.js'), readFileSync(resolve(source, 'dist/index.js')));
}
if (existsSync(resolve(source, 'style.css'))) {
  writeFileSync(resolve(target, 'style.css'), readFileSync(resolve(source, 'style.css')));
} else if (existsSync(resolve(source, 'dist/index.css'))) {
  writeFileSync(resolve(target, 'style.css'), readFileSync(resolve(source, 'dist/index.css')));
}
mkdirSync(dirname(resolve(target, 'manifest.json')), { recursive: true });
writeFileSync(resolve(target, 'manifest.json'), readFileSync(resolve(source, 'manifest.json')));

console.log(`已安装到 ${target}，刷新酒馆页面即可生效。`);
