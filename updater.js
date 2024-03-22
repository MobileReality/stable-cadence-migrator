/* eslint-disable func-style */
/** Kinda works, lot's of room for improvement */
const path = require('node:path');
const { execSync } = require('node:child_process');
const { join } = require('node:path');
const { mkdirSync, rmSync } = require('node:fs');
const { copy } = require('fs-extra');
const { glob, globSync, globStream, globStreamSync, Glob } = require('glob');
const { writeFile } = require('node:fs/promises');
const fcl = require('@onflow/fcl');
const t = require('@onflow/types');

const debug = true;
const mkBranch = true;
let hadError = false;

const IDENTITY = Math.floor(Date.now() / 1000).toString();

const ROOT_PATH = join(__dirname, '../../../');
const BASE_PATH = join(__dirname, '../../');
const STAGE_PATH = join(__dirname, 'stage/', 'work');
const STAGE_PATH_RELA = join('./stage/', 'work');
const RESULT_PATH = join(__dirname, 'result/');

const log4js = require('log4js');
const { inspect } = require('node:util');
const util = require('node:util');
const { readFile } = require('node:fs/promises');
const { CORE_CONFIGS, defaultGlobSpec, defaultSpec } = require('./config');
log4js.addLayout('stripped', function (config) {
  return function (logEvent) {
    const dump = util.format(...logEvent.data);
    return dump.replace(
      // eslint-disable-next-line no-control-regex
      /[\u001B\u009B][#();?[]*(?:\d{1,4}(?:;\d{0,4})*)?[\d<=>A-ORZcf-nqry]/g,
      '',
    );
  };
});
log4js.configure({
  appenders: {
    console: { type: 'stdout', layout: { type: 'messagePassThrough' } },
    file: {
      type: 'file',
      layout: { type: 'stripped' },
      filename: join(RESULT_PATH, `/${IDENTITY}.log`),
    },
  },
  categories: { default: { appenders: ['console', 'file'], level: 'debug' } },
});
const logger = log4js.getLogger();

/**
 * Glob spec
 * @typedef {object} GlobSpec
 * @property {string} dir
 * @property {string} target
 * @property {string} [glob]
 * @property {string[]} [exclude]
 * @property {string[]} [include]
 * @property {true} [targetResult]
 */

const accessNodeMap = {
  mainnet: 'https://rest-mainnet.onflow.org',
  testnet: 'https://rest-testnet.onflow.org',
};

const extractContractScript = `
pub fun main(account: Address, contract: String): String {
    return String.fromUTF8(getAccount(account).contracts.get(name: contract))
}`;

async function extractContract(network, account, contractName) {
  await fcl
    .config()
    .put('flow.network', network)
    .put('accessNode.api', accessNodeMap[network]);

  const result = await fcl.query({
    cadence: extractContractScript,
    args: [fcl.arg(account, t.Address), fcl.arg(contractName, t.String)],
  });
  console.log(result); // 13
}

/**
 * Config for repo extraction
 * @typedef {object} RepoConfig
 * @property {string} repo
 * @property {string} repo_name
 * @property {GlobSpec[]} specs
 * @property {string} [branch]
 */
/**
 * Config for blockchain extraction
 * @typedef {object} ChainConfig
 * @property {'mainnet'|'testnet'} network
 * @property {string} address
 * @property {string[]} contracts
 * @property {string} target
 * @property {true} [targetResult]
 */
/**
 * Config
 * @typedef {ChainConfig|RepoConfig} Config
 */
/** @type Config[]  */
const CONFIG = [
  // {
  //   network: 'mainnet',
  //   address: '0000',
  //   contracts: [],
  // },
  ...CORE_CONFIGS,
  {
    repo: 'https://github.com/dapperlabs/studio-platform-smart-contracts',
    repo_name: 'dapper-pds',
    branch: 'loic/update-pds-packnft-contracts-v1',
    specs: [
      {
        dir: 'pds/contracts/',
        target: 'contracts/',
        targetResult: true,
        include: [
          'PackNFT.cdc',
          'PackNFT_AllDay.cdc',
          'IPackNFT.cdc',
          'PDS.cdc',
        ],
      },
      {
        dir: 'pds/transactions/packNFT/',
        target: 'transactions/packNFT/',
        targetResult: true,
        include: [
          'open_request.cdc',
          'reveal_request.cdc',
          'public_reveal_packNFT.cdc',
        ],
      },
    ],
  },
  {
    repo: 'https://github.com/findonflow/find.git',
    repo_name: 'find',
    branch: 'feat/stable-cadence',
    specs: [
      {
        dir: 'contracts/standard/',
        target: 'contracts/',
        include: [
          // 'DapperStorageRent.cdc', // TODO broken
          'DapperUtilityCoin.cdc',
          'FlowUtilityToken.cdc',
        ],
      },
    ],
  },
  // TODO do we even need these contracts in our cadence folder?
  // TODO these are not cadence-1.0 ready anyway
  {
    repo: 'https://github.com/blocto/bloctoswap-contracts',
    repo_name: 'bloctoswap-contracts',
    branch: 'master',
    specs: [
      {
        dir: 'contracts/exchange/',
        target: 'contracts/',
        include: ['FlowSwapPair.cdc', 'FusdUsdtSwapPair.cdc'],
      },
      {
        dir: 'contracts/token/',
        target: 'contracts/',
        include: ['FUSD.cdc'],
      },
      // this one is newer? idk
      {
        dir: 'contracts/teleport/flow/',
        target: 'contracts/',
        include: ['TeleportedTetherToken.cdc'],
      },
    ],
  },
];

async function readFileIgnore(path, encoding) {
  try {
    return await readFile(path, { encoding });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return null;
}

const copiedFiles = [];
/**
 @param {Config} config
 * @param {GlobSpec} spec
 * @param {string} file
 */
async function copyFile(config, spec, file) {
  const target = spec.targetResult ? RESULT_PATH : BASE_PATH;
  const fromShort = join(config.repo_name, spec.dir, file);
  const from = join(STAGE_PATH_RELA, fromShort);
  const to = join(target, spec.target, file);
  const toShort = to.slice(ROOT_PATH.length);
  try {
    const fromData = await readFile(from, 'utf8');
    const toData = await readFileIgnore(to, 'utf8');
    if (fromData.trim() === toData?.trim()) {
      logger.info(' .  skip unchanged', fromShort);
      return;
    }
    await copy(from, to);
    copiedFiles.push(to);
    logger.info(' i  copy', fromShort, '->', toShort);
  } catch (err) {
    if (err.code === 'ENOENT') {
      hadError = true;
      logger.error('[\u26A0] File does not exist', from);
    }
  }
}

/**
 * @param {string} path
 * @returns {string}
 */
function slash(path) {
  return path.replace(/\\/g, '/');
}

function execCmd(command, path) {
  execSync(command, {
    stdio: [0, 1, 2],
    cwd: path ?? STAGE_PATH,
  });
}
/**
 * @param {RepoConfig} config
 *
 * */
async function runRepoConfig(config) {
  logger.debug(`[+] Processing ${config.repo}`);
  const branchPart = config.branch ? `--branch ${config.branch}` : '';
  execCmd(
    `git -C ${config.repo_name} pull || git clone ${branchPart} ${config.repo} ${config.repo_name}`,
  );
  for (const spec of config.specs) {
    if (spec.glob) {
      logger.debug(
        '[-] Processing glob',
        join(STAGE_PATH_RELA, config.repo_name, spec.dir, spec.glob),
      );
      const files = await glob(spec.glob, {
        cwd: slash(join(STAGE_PATH_RELA, config.repo_name, spec.dir)),
        ignore: spec.exclude,
      });
      await Promise.all(
        files.map(async (file) => copyFile(config, spec, file)),
      );
    }
    if (spec.include) {
      logger.debug(
        '[-] Processing include list',
        spec.include.length < 5
          ? inspect(
              spec.include.map((path) => slash(join(spec.dir, path))),
              { colors: true },
            )
          : `of ${spec.include.length} entries`,
      );
      await Promise.all(
        spec.include.map(async (file) => copyFile(config, spec, file)),
      );
    }
  }
}
/**
 * @param {ChainConfig} config
 *
 * */
async function runChainConfig(config) {
  // TODO not done yet
  for (const contractName of config.contracts) {
    console.log(await extractContract(config.network, config.address));
  }
}

async function makeBranchCommit() {
  if (mkBranch)
    execCmd(`git checkout -b cadence/autopull-${IDENTITY}`, BASE_PATH);
  execCmd(`git add ${copiedFiles.join(' ')}`, BASE_PATH);
  execCmd(`git add ${join(RESULT_PATH, '/**')}`, BASE_PATH);
  execCmd(
    `git commit -m "chore(cdc): Auto-pull cadence @ ${IDENTITY}"`,
    BASE_PATH,
  );
}

async function run() {
  try {
    mkdirSync(STAGE_PATH);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  for (const config of CONFIG) {
    if (config.repo) {
      await runRepoConfig(config);
    }
    if (config.contracts) {
      await runChainConfig(config);
    }
  }
  if (!debug) {
    if (hadError) {
      logger.error('[\u26A0] There were errors.');
    } else if (copiedFiles.length > 0) {
      await log4js.shutdown(() => {
        makeBranchCommit();
      });
    } else {
      logger.info('[-] No changes to commit');
    }
  }
}

run().catch((err) => logger.fatal(err));
