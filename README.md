MIT License

## Simple, very badly written, automated migrator for Cadence scripts and transactions.
###### Yeah it's a bunch of overly complex RegExs and a hailmary AST visitor.

Also includes a tool to pull in updated contracts from various repos or from the blockchain into your workspace.\
Provided as is. Care recommended. Always review all changes and .cdc files, even if your tests pass!



# Features:

- Refactorer ignores comments (line or block) and strings inside quotes.
- Change pub to access(all) // heh
- Refactor AuthAccount authorizers to &Account
- Refactor account storage access
- Refactor capability borrowing/publishing
- Auto-fix restricted types // I think this one is broken
- Detect storage/capability entitlement usage and apply it to &Account // see limitations
- Limited block-scope awareness

# Planned (but unlikely)

- Refactor getAuthAccount() usage
- Apply entitlement to getAuthAccount() usage in scripts
- Refactoring related to NFT contract updates (examples:)
  - MetadataViews to ViewResolver fixups // simple
  - add 'view' to functions as defined in contract // trivial
 - Remove private storage interactions
 - Prevent it from messing up already migrated code // hardish

# Limitations
 - AST Visitor is very badly implemented
 - block-scope awareness could track more interesting things
 - entitlement usage works only for main body (no tracking across function calls / imports)

## Probably won't happen:
- Entitlement tracking across function calls // hard
- Apply entitlement requirements to function params