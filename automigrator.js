/* eslint-disable func-style,unicorn/consistent-function-scoping */
const { getTemplateInfo } = require('@onflow/flow-cadut');
const { join } = require('node:path');
const { readFile } = require('node:fs/promises');
const { glob, globSync, globStream, globStreamSync, Glob } = require('glob');
const { replaceSubstitutedEscaped, extractSigners } = require('./util');
const { copy, outputFile } = require('fs-extra');
const { isString } = require('node:util');
const { parseCadence, filterVarsWithScope } = require('./parser');

/**
 @typedef {import('./parser').ParserContext} ParserContext
 */

const debug = false;

const BASE_PATH = join(__dirname, '../../');
const BASE_PATH_RELA = '../../';

// prepare(acct: AuthAccount) {
const _m = 'gium';
function escapeRegExp(string) {
  return string.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&'); // $& means the whole matched string
}
function mkGrp(parts, capture = false) {
  return `(${capture ? '' : ':?'}${parts.map(escapeRegExp).join('|')})`;
}
function mkArray(parts) {
  if (isString(parts)) return [parts];
  return parts;
}

const txSignersRx = /(?:prepare\s*\(\s*)([^)]*)(?:\))/gimu;

const restrictionRx = /(\s*&?)(\s*[^{>]+?\s*)(\s*\{\s*[^}>]+\})/gimu;
const restrictionTypeRx =
  /<(?![-=>])(\s*&?)(\s*[^{>&]+?\s*)(\s*\{\s*[^}>]+\})(\s*)>/gimu;
function cleanRestriction(str) {
  if (RegExp.test(restrictionRx)) return str.replace(restrictionRx, '&$2');
  return str;
}

const accountStorageEntMap = {
  borrow: 'BorrowValue',
  load: 'LoadValue',
  copy: 'CopyValue',
};
const accountStorageGenRx = (signers) =>
  new RegExp(
    `${mkGrp(
      signers,
    )}\\.\\s*(borrow|load|copy|type|check)\\s*(:?<\\s*([^>]+)\\s*>)?\\s*\\(\\s*from\\s*:\\s*([^)]+)\\)`,
    _m,
  );
const accountStorageSaveRx = (signers) =>
  new RegExp(
    `${mkGrp(
      signers,
    )}\\.\\s*save\\s*(:?<\\s*([^>]+)\\s*>)?\\s*\\(\\s*[^,]*,\\s*to\\s*:\\s*([^)]+)\\)`,
    _m,
  );

const accountCapsEntMap = {
  unlink: 'UnpublishCapability',
};
const accountCapsReplaceMap = {
  getCapability: 'get',
};
const accountCapsGenRx = (signers) =>
  new RegExp(
    `${mkGrp(
      signers,
    )}\\s*\\.\\s*(unlink|getCapability)\\s*\\([^)]+\\)\\s*?([!?]?)(:?\\s*\\.\\s*borrow\\s*(:?<\\s*([^>]+)\\s*>)?\\s*\\(\\s*(:?path\\s*:)?\\s*([^)]*)\\s*\\))?`,
    _m,
  );
const accountCapsSaveRx = (signers) =>
  new RegExp(
    `([ \\t]*)${mkGrp(
      signers,
    )}\\s*\\.\\s*link\\s*(:?<\\s*([^>]+)\\s*>)?\\s*\\(\\s*(:?path\\s*:)?\\s*([^,]+?),\\s*target\\s*:\\s*([^)]+)\\)`,
    _m,
  );
const accountCapsSimplifyBorrow =
  /capabilities\s*\.\s*get\s*\(\s*([^)\s]+)\s*\)\s*([!?]?)\s*\.\s*borrow\s*<\s*([^>]+?)\s*>\s*\(\s*\)/gimu;

const accountContractsEntMap = {
  add: 'AddContract',
  update__experimental: 'UpdateContract',
  update: 'UpdateContract',
  remove: 'RemoveContract',
};
const accountContractsGenRx = (signers) =>
  new RegExp(
    `([a-zA-Z_][a-zA-Z\\-_0-9]*)\\.contracts\\.\\s*(add|update__experimental|update|remove)\\s*(:?<\\s*(\\S+)\\s*>)?\\s*\\(\\s*name\\s*:\\s*([^)]+)\\)`,
    _m,
  );

/**
 * @param {string} data
 * @param {Context} context
 * @param {string[]} [limit]
 * @returns {string[]}
 */
function getAccountNames(data, context, limit) {
  return limit === undefined
    ? [
        ...context.signerNames,
        // 'signer',
        // 'owner',
        // 'admin',
        // 'operator',
        // 'acct',
        // 'accnt',
      ]
    : limit;
}

/**
 * @param {string} data
 * @param {Context} context
 * @param {string[]} [limit]
 * @returns {string}
 */
function accountStorageGen(data, context, limit) {
  const { signerEntitlements } = context;
  const accNames = getAccountNames(data, context, limit);
  data = replaceSubstitutedEscaped(
    data,
    accountStorageGenRx(accNames),
    (match) => {
      const ent = accountStorageEntMap[match[2]];
      if (ent && signerEntitlements[match[1]])
        signerEntitlements[match[1]].add(ent);
      return match[0].splice(match[1].length, 0, '.storage');
    },
  );
  return replaceSubstitutedEscaped(
    data,
    accountStorageSaveRx(accNames),
    (match) => {
      if (signerEntitlements[match[1]])
        signerEntitlements[match[1]].add('SaveValue');
      return match[0].splice(match[1].length, 0, '.storage');
    },
  );
}
/**
 * @param {string} data
 * @param {Context} context
 * @param {string[]} [limit]
 * @returns {string}
 */
function accountCapsGen(data, context, limit) {
  const { signerEntitlements } = context;
  const accNames = getAccountNames(data, context, limit);
  data = replaceSubstitutedEscaped(
    data,
    accountCapsGenRx(accNames),
    (match) => {
      const ent = accountCapsEntMap[match[2]];
      if (ent && signerEntitlements[match[1]])
        signerEntitlements[match[1]].add(ent);
      const replaced = accountCapsReplaceMap[match[2]] ?? match[2];
      return match[0].splice(
        match[0].indexOf('.') + 1,
        match[2].length,
        `capabilities.${replaced}`,
      );
    },
  );
  return replaceSubstitutedEscaped(
    data,
    accountCapsSaveRx(accNames),
    (match) => {
      if (signerEntitlements[match[2]]) {
        signerEntitlements[match[2]].add('IssueStorageCapabilityController');
        signerEntitlements[match[2]].add('PublishCapability');
      }
      return `${match[1]}${match[2]}.capabilities.publish(
                ${match[2]}.capabilities.storage.issue<${match[4]}>(${match[7]}),
                at: ${match[6]}
            )`;
    },
  );
}
/**
 * @param {string} data
 * @param {Context} context
 * @param {string[]} [limit]
 * @returns {string}
 */
function accountContractsGen(data, context, limit) {
  const { signerEntitlements } = context;
  const accNames = getAccountNames(data, context, limit);
  return replaceSubstitutedEscaped(
    data,
    accountContractsGenRx(accNames),
    (match) => {
      const ent = accountContractsEntMap[match[2]];
      if (ent && signerEntitlements[match[1]])
        signerEntitlements[match[1]].add(ent);
      return match[0].splice(
        match[0].indexOf('.', match[0].indexOf('.') + 1) + 7,
        match[2] === 'update__experimental' ? 14 : 0,
      );
    },
  );
}
/**
 * Context
 * @typedef {object} Context
 * @property {ParserContext} parsed
 * @property {string} dir
 * @property {string[]} signerNames
 * @property {string[]} signersRaw
 * @property {Object.<string, string>} signers
 * @property {Object.<string, Set<string>>} signerEntitlements
 */
/**
 * @param {Optional<Context>} input
 * @param {ParserContext} parsed
 * @returns {Context}
 */
function createContext(input, parsed) {
  return {
    // arguments: [],
    parsed,
    signersRaw: [],
    signerNames: [],
    signers: {},
    signerEntitlements: {},
    ...input,
  };
}

async function saveFile(file, data) {
  try {
    // const fromData = await readFile(from, 'utf8');
    // const toData = await readFileIgnore(to, 'utf8');
    // if (fromData.trim() === toData?.trim()) {
    //   logger.info(' .  skip unchanged', fromShort);
    //   return;
    // }
    await outputFile(file, data);
    // console.log(' i  copy', fromShort, '->', toShort);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // hadError = true;
      console.error('[\u26A0] File does not exist', file);
    }
  }
}

function fixCreateCollection(data) {
  // Simple fix for createEmptyCollection
  data = replaceSubstitutedEscaped(
    data,
    /([ \t]*[a-zA-Z_][^.(){}<>\-=]+\s*)\.\s*createEmptyCollection(\s*)\(\s*\)/gimu,
    (match) =>
      match[1].trim() === 'self'
        ? match[0]
        : `${
            match[1]
          }.createEmptyCollection(nftType: Type<@${match[1].trim()}.NFT>())`,
  );
  return data;
}

function fixRestrictions(data) {
  // Replace restriction typing in generics TODO other places -.-
  data = replaceSubstitutedEscaped(
    data,
    restrictionTypeRx,
    (match) => `<${match[1]}${match[3]}${match[4]}>`,
  );
  return data;
}

function simplifyBorrowCap(data) {
  data = replaceSubstitutedEscaped(
    data,
    accountCapsSimplifyBorrow,
    (match) =>
      `capabilities.borrow<${match[3]}>(${match[1]})${
        match[2] === '!' ? '' : '' // TODO hmm
      }`,
  );
  return data;
}

/**
 * @param {string} res
 * @param {Context} context
 * @param {string[]} [limit]
 * @returns {string}
 */
function runAccountFixes(res, context, limit) {
  res = accountStorageGen(res, context, limit);
  res = accountCapsGen(res, context, limit);
  res = accountContractsGen(res, context, limit);
  if (!limit) {
    for (const block of context.parsed.blocks) {
      const varsHere = filterVarsWithScope(
        block.blockOffset + 1,
        context.parsed.accDecls,
      );
      if (varsHere.length === 0) continue;
      const blockData = res.slice(
        block.blockOffset,
        block.blockOffset + block.blockLength,
      );
      const fixedBlock = runAccountFixes(
        blockData,
        context,
        varsHere.map((v) => v.identifier),
      );
      res = res.splice(block.blockOffset, block.blockLength, fixedBlock);
    }
  }
  return res;
}

async function processTransaction(data, template) {
  let res = data;
  const signersRaw = extractSigners(data).map((sl) =>
    sl.split(':').map((s) => s.trim()),
  );
  const signers = Object.fromEntries(signersRaw);
  const signerNames = Object.keys(signers);
  const signerEntitlements = Object.fromEntries(
    signersRaw.map(([name]) => [name, new Set()]),
  );
  const parsed = await parseCadence(res);
  const context = createContext(
    {
      signersRaw,
      signerNames,
      signers,
      signerEntitlements,
    },
    parsed,
  );
  console.log(template, context);

  res = fixCreateCollection(res);
  res = fixRestrictions(res);
  res = runAccountFixes(res, context);
  res = simplifyBorrowCap(res);

  // Apply required entitlements
  res = replaceSubstitutedEscaped(
    res,
    txSignersRx,
    `prepare(${signersRaw.map(([name, type]) =>
      type.trim() === 'AuthAccount'
        ? `${name}:${
            signerEntitlements[name].size > 0
              ? ` auth(${[...signerEntitlements[name]].join(', ')})`
              : ''
          } &Account`
        : `${name}: ${type}`,
    )})`,
  );
  console.log(res);
  if (!debug) await saveFile(template.path, res);
}

async function processScript(data, template) {
  let res = data;
  const parsed = await parseCadence(res);
  const context = createContext({}, parsed);
  // console.log(template, context, parsed);

  res = await fixCreateCollection(res);
  res = fixRestrictions(res);
  res = runAccountFixes(res, context);
  res = simplifyBorrowCap(res);

  console.log(res);
  if (!debug) await saveFile(template.path, res);
}

async function processContract(data, template) {
  let res = data;
  const parsed = await parseCadence(res);
  const context = createContext({}, parsed);
  // console.log(template, context, parsed);

  res = await fixCreateCollection(res);
  res = fixRestrictions(res);
  res = runAccountFixes(res, context);
  res = simplifyBorrowCap(res);

  // console.log(res);
  if (!debug) await saveFile(template.path, res);
}
async function processFile(filePath) {
  const data = await readFile(filePath, 'utf8'); // FCLCrypto
  console.log(filePath);
  const template = await getTemplateInfo(data);
  template.path = filePath;
  if (template.type === 'transaction') {
    return processTransaction(data, template);
  }
  if (template.type === 'script') {
    return processScript(data, template);
  }
  if (template.type === 'contract') {
    return processContract(data, template);
  }
  console.log('Unknown template type', template.type);
}

async function run(path, ignore = []) {
  const files = await glob(path, {
    cwd: BASE_PATH_RELA,
    ignore,
  });
  console.log(files, join(BASE_PATH_RELA, path).replace(/\\/g, '/'));
  for (const file of files) {
    await processFile(join(BASE_PATH_RELA, file));
  }
}
run('scripts/*.cdc');
