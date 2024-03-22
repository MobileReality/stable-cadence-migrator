/**
 @typedef {import('./updater.js').RepoConfig} RepoConfig
 @typedef {import('./updater.js').ChainConfig} ChainConfig
 @typedef {import('./updater.js').Config} Config
 @typedef {import('./updater.js').GlobSpec} GlobSpec
 */
/**
 * @type {GlobSpec}
 */
const defaultSpec = {
  dir: 'contracts/',
  target: 'contracts/',
};
/**
 * @type {GlobSpec}
 */
const defaultGlobSpec = {
  dir: 'contracts/',
  glob: '*.cdc',
  target: 'contracts/',
};
/** @type Config[]  */
const CORE_CONFIGS = [
  {
    repo_name: 'flow-core-contracts',
    repo: 'https://github.com/onflow/flow-core-contracts.git',
    branch: 'stable-cadence',
    specs: [
      {
        ...defaultSpec,
        include: [
          'FlowToken.cdc',
          // 'FlowFees.cdc',
          // 'FlowStorageFees.cdc',
          // 'FlowServiceAccount.cdc',
          // 'RandomBeaconHistory.cdc',
        ],
      },
      {
        dir: 'transactions/accounts/',
        target: 'transactions/account/',
        targetResult: true,
        include: ['add_key.cdc', 'create_new_account.cdc', 'revoke_key.cdc'],
      },
    ],
  },
  {
    repo_name: 'fcl-contracts',
    repo: 'https://github.com/onflow/fcl-contracts.git',
    branch: 'cadence-1.0',
    specs: [
      {
        dir: 'cadence/contracts/',
        target: 'contracts/',
        include: ['FCLCrypto.cdc'],
      },
    ],
  },
  {
    repo_name: 'flow-ft',
    repo: 'https://github.com/onflow/flow-ft.git',
    branch: 'v2-standard',
    specs: [
      {
        ...defaultGlobSpec,
        exclude: ['ExampleToken.cdc'],
      },
      {
        ...defaultSpec,
        targetResult: true,
        include: ['ExampleToken.cdc'],
      },
      {
        dir: 'contracts/utility/',
        target: 'contracts/',
        include: ['TokenForwarding.cdc', 'PrivateReceiverForwarder.cdc'],
      },
      {
        dir: 'transactions/scripts/',
        target: 'scripts/flowToken',
        include: ['get_balance.cdc', 'get_supply.cdc'],
      },
      {
        dir: 'transactions/',
        target: 'transactions/flowToken',
        include: ['mint_tokens.cdc', 'transfer_tokens.cdc'],
      },
    ],
  },
  {
    repo_name: 'flow-nft',
    repo: 'https://github.com/onflow/flow-nft.git',
    branch: 'standard-v2',
    specs: [
      {
        ...defaultGlobSpec,
        exclude: ['ExampleNFT.cdc'],
      },
      {
        ...defaultSpec,
        targetResult: true,
        include: ['ExampleNFT.cdc'],
      },
      {
        dir: 'transactions/',
        target: 'transactions/nft',
        targetResult: true,
        include: [
          'mint_nft.cdc',
          'transfer_nft.cdc',
          'setup_account.cdc',
          'destroy_nft.cdc',
          'setup_account_to_receive_royalty.cdc',
        ],
      },
    ],
  },
  {
    repo: 'https://github.com/onflow/nft-storefront.git',
    repo_name: 'nft-storefront',
    branch: 'stable-cadence-standard-updates',
    specs: [
      {
        ...defaultGlobSpec,
        exclude: ['ExampleToken.cdc'],
      },
      {
        dir: 'transactions-v1/',
        target: 'transactions/nftStorefront/',
        targetResult: true,
        include: [
          'buy_item.cdc',
          'sell_item.cdc',
          'remove_item.cdc',
          'setup_account.cdc',
        ],
      },
      {
        dir: 'transactions/',
        target: 'transactions/nftStorefront/v2/',
        targetResult: true,
        include: [
          'buy_item.cdc',
          'sell_item.cdc',
          'remove_item.cdc',
          'setup_account.cdc',
        ],
      },
    ],
  },
  {
    repo: 'https://github.com/onflow/nft-catalog.git',
    repo_name: 'nft-catalog',
    branch: 'feature/cadence-1.0',
    specs: [
      {
        dir: 'cadence/contracts/',
        target: 'contracts/',
        include: ['NFTCatalog.cdc'],
      },
      // ? https://github.com/onflow/nft-catalog/blob/feature/cadence-1.0/cadence/transactions/add_to_nft_catalog.cdc
    ],
  },
];

module.exports = { defaultGlobSpec, defaultSpec, CORE_CONFIGS };
