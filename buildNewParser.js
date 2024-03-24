/* eslint-disable unicorn/no-abusive-eslint-disable, unicorn/filename-case*/
/* eslint-disable */
const {existsSync, readFileSync, writeFileSync, rmSync} = require("fs");
const path = require("path");
const { join } = require('node:path');
const { copySync } = require('fs-extra');
const { execSync } = require('node:child_process');

const cadenceBranch = 'v1.0.0-preview.16';

let goPath = process.env.GOPATH;
if(!goPath){
  // attempt to locate go in PATH
  const envPath = process.env.PATH || "";
  const pathDirs = envPath
    .replace(/["']+/g, "")
    .split(path.delimiter)
    .filter(Boolean);
  pathDirs.push(...['C:\\Program Files\\Go\\'])
  for(const pathDir of pathDirs){
    const mpath = path.join(pathDir, "/bin/go").replace(/\\/g, '/');
    if(existsSync(mpath) || existsSync(`${mpath}.exe`)){
      goPath = pathDir.replace(/\\/g, '/');
      break;
    }
  }
}
if(!goPath){
  console.error("Could not locate go. Install go or set GOPATH environment variable properly");
  process.exit(1);
}
const goBin = goPath.indexOf(' ') === -1 ? `${goPath}/bin/go`:`"${goPath}/bin/go"`;

function execCmd(command, path, env = {}) {
  execSync(command, {
    stdio: [0, 1, 2],
    cwd: path,
    env: {...process.env, ...env },
  });
}

if(!existsSync('./parser/go.js')) {
  copySync(`${goPath}/misc/wasm/wasm_exec.js`, './parser/go.js', {});
}
if(!existsSync('./parser/cadence.parser.js')) {
  const resolvedParser = require.resolve('@onflow/cadence-parser');
  const pathOld = join(
    resolvedParser,
    '../../cjs/index.js',
  ).replaceAll(/\\/g, '/');
  const oldSrc = readFileSync(pathOld, 'utf8');
  const newSrc = oldSrc.replace(/const go_1 = require\("\.\/go"\);/gimu,
    'require("./go");\nconst go_1 = {go:new Go()};').replace(/CADENCE_PARSER/gimu, 'CADENCE_PARSER_OLD');
  writeFileSync('./parser/cadence.parser.js', newSrc, 'utf8');
}
if(!existsSync('./parser/cadence-parser.wasm')) {
  if(existsSync('./parser/cadence/')) rmSync('./parser/cadence/', { recursive: true, force: true });
  execCmd(`git clone --depth 1 --branch ${cadenceBranch} https://github.com/onflow/cadence.git`, './parser/');
  const goWasmPath = './parser/cadence/runtime/cmd/parse/main_wasm.go';
  const oldSrc = readFileSync(goWasmPath, 'utf8');
  const newSrc = oldSrc.replace(/CADENCE_PARSER/gimu, 'CADENCE_PARSER_OLD')
    .replace(/parser\.Config\{\}/gimu, 'parser.Config{TypeParametersEnabled: _system, NativeModifierEnabled: _system }')
    .replace(/parse\(code\s+string\)/gimu, 'parse(code string, _system bool)')
    .replace(/^(\s+)return\s+parse\(code\)/gimu, '$1_system := false\n$1if len(args)>1 { _system = args[1].Truthy() }\n$1return parse(code, _system)');
  writeFileSync(goWasmPath, newSrc, 'utf8');

  execCmd(`${goBin} build -o ../cadence-parser.wasm ./runtime/cmd/parse`, './parser/cadence', {GOARCH: 'wasm', GOOS: 'js'});
  rmSync('./parser/cadence/', { recursive: true, force: true });
}
