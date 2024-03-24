/* eslint-disable func-style,unicorn/consistent-function-scoping,no-fallthrough,no-use-before-define,default-case-last,max-depth,no-lone-blocks,unicorn/prefer-string-slice,no-negated-condition */
// noinspection FallThroughInSwitchStatementJS

const { CadenceParser } = require('./parser/cadence.parser');
const { CadenceParser: CadenceParserOld } = require('@onflow/cadence-parser');
const { inspect } = require('node:util');
const { isObject } = require('node:util');
const { isPlainObject } = require('lodash');
const { isPrimitive } = require('node:util');
const { join, dirname, basename } = require('node:path');
const { readFile } = require('node:fs/promises');
const { isArray } = require('node:util');
const { readFileSync, writeFileSync } = require('node:fs');
const { fileExistsSync } = require('tsconfig-paths/lib/filesystem');
const log4js = require('log4js');
const util = require('node:util');
const JSON5 = require('json5');
const omitDeep = require('omit-deep');

const debugParser = true;
const replacePub = false;

const resolvedParser = require.resolve('@onflow/cadence-parser');
const wasmPathOld = join(
  resolvedParser,
  '../../cadence-parser.wasm',
).replaceAll(/\\/g, '/');
const wasmPath = join('./parser/cadence-parser.wasm').replaceAll(/\\/g, '/');

let parser;
let lastLoadedOld = null;
let loading = false;
async function loadParser(old = false) {
  loading = true;
  if (old) {
    if (lastLoadedOld) return parser;
    lastLoadedOld = true;
    const _parser = readFile(wasmPathOld).then((loaded) =>
      CadenceParserOld.create(loaded),
    );
    parser = _parser;
    return _parser;
  }
  if (lastLoadedOld === false) return parser;
  lastLoadedOld = false;
  if (!fileExistsSync(wasmPath))
    throw new Error(
      'New parser not found, please run `npm run build:new:parser`',
    );
  const _parser = readFile(wasmPath).then((loaded) =>
    CadenceParser.create(loaded),
  );
  parser = _parser;
  return _parser;
}

function log(...args) {
  if (!debugParser) return;
  console.log(...args);
}
function err(...args) {
  if (!debugParser) return;
  console.error(...args);
}

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
      filename: 'dump.log',
    },
  },
  categories: { default: { appenders: ['console', 'file'], level: 'debug' } },
});
const logger = log4js.getLogger();

const declarationRegex =
  /(contract|resource|struct|event|enum|case|entitlement|view|fun|var|let)/gimu;
const accessRegex = /((pub|priv)\s|access\([^)]+\))/gimu;

/**
 * @returns {string}
 */
function extractNodeString(data, node) {
  return data.substring(node.StartPos.Offset, node.EndPos.Offset + 1);
}

let allowLanguageDefs = false;
/**
 * @typedef {Object} ProposedChange
 * @property {number} offset
 * @property {number} [priority]
 * @property {number} length
 * @property {string} replace
 * @property {boolean} [manual]
 */

/**
 * @typedef {Object} Block
 * @property {number} offset
 * @property {number} length
 * @property {string} file the file it was declared in
 * @property {string} path
 */

/**
 * @typedef VarWithScope
 * @property {string} identifier The name of the variable.
 * @property {number} selfOffset The offset of the variable.
 * @property {number} blockOffset The parent-block offset of the variable.
 * @property {number} blockLength The parent-block length of the variable.
 * @property {string} [type] The type of the variable.
 * @property {string[]} [refTypes] "Referenced" types..
 * @property {boolean} isAuthAccount
 * @property {boolean} [isProp]
 * @property {string} file the file it was declared in
 * @property {string} blockPath the block it was declared in
 * @property {boolean} legacyAuthorized
 * @property {boolean} entitlementsPiped
 * @property {string[]} accessEntitlements Access entitlements used
 * @property {string[]} accessEntitlementsActual Access entitlements used (analysis)
 * @property {string[]} entitlementsAdded Access entitlements added during analysis
 * @property {VarWithScope[]} parents
 */

/**
 * @typedef {Object} MemberWithScope
 * @property {string} identifier The name of the type.
 * @property {string} fqdn Fully qualified name of the type.
 * @property {number} selfOffset The offset of the type.
 * @property {number} blockOffset The parent-block offset of the type.
 * @property {number} blockLength The parent-block length of the type.
 * @property {string} file the file it was declared in
 * @property {MemberWithScope[]} [conformances]
 * @property {string} [declaredAccess]
 * @property {string} [declaredPurity]
 * @property {string} [declaredEntitlements]
 * @property {string[]} [possibleEntitlements]
 * @property {string[]} [minimalEntitlements]
 * @property {MemberWithScope[]} [members]
 */
/**
 * @typedef {Object} FuncArg
 * @property {string} name
 * @property {string} type - TODO
 * @property {boolean} isAuthAccount
 */

/**
 * @typedef {Object} _FuncWithScope
 * @property {VarWithScope[]} parameters
 * @property {VarWithScope[]} calledOn
 *
 * @typedef {MemberWithScope & _FuncWithScope} FuncWithScope
 */
/**
 * @param {MemberWithScope} member
 * @return string
 */
function formatAccess(member) {
  switch (member.declaredAccess ?? 'AccessAll') {
    case 'AccessSelf':
      return 'access(self)';
    case 'AccessAll':
      return 'access(all)';
    case 'AccessAccount':
      return 'access(account)';
    case 'AccessContract':
      return 'access(contract)';
    case 'EntitlementAccess':
      return `access(${member.declaredEntitlements})`;
    default:
      return 'access(unknown)';
  }
}

/**
 * @param {number} pos
 *  @param {VarWithScope[]} vars
 *  @returns {VarWithScope[]}
 */
function filterVarsWithScope(pos, vars) {
  return vars.filter(
    (v) => v.selfOffset <= pos && pos <= v.blockOffset + v.blockLength,
  );
}

/**
 * @typedef {Object} BlockDecl
 * @property {number} blockOffset
 * @property {number} blockLength
 */
/**
 * @typedef {Object} AccDecl
 * @property {number} blockOffset
 * @property {number} blockLength
 * @property {string} identifier
 */
/**
 * @typedef {Object} RestrictedDef
 *  @property {string} def,
 *  @property {string} parentDef
 *  @property {number} outerOffset
 *  @property {number} outerLength
 *  @property {number} nominalOffset
 *  @property {number} nominalLength
 */

/**
 * ParserContext
 * @global
 * @typedef {Object} ParserContext
 * @property {string} path
 * @property {string} name
 * @property {string} selfDir
 * @property {string} baseDir
 * @property {number} blockOffset
 * @property {number} blockLength
 * @property {number} importEndOffset
 * @property {string} typeParentDef
 * @property {string[]} typeDeclPath
 * @property {MemberWithScope} [currTypeDecl]
 * @property {FuncWithScope} [currFuncDecl]
 * @property {boolean} root
 * @property {BlockDecl[]} blocks
 * @property {VarWithScope[]} varDecls
 * @property {MemberWithScope[]} typeDecls
 * @property {FuncWithScope[]} funcDecls
 * @property {RestrictedDef[]} restricted
 * @property {ProposedChange[]} proposedChanges
 * @property {Object.<string, Promise<ParserContext|null>>} imported
 */

/**
 * @type {Object.<string, Promise<ParserContext|null>>}
 */
const parsedCache = {};

/**
 * @property {Partial<ParserContext>} [override]
 * @return {Object<ParserContext>}
 */
const mkDefContext = (override = {}) => ({
  path: '',
  name: '',
  selfDir: '',
  baseDir: '',
  blockOffset: 0,
  blockLength: 0,
  blocks: [],
  varDecls: [],
  typeDecls: [],
  funcDecls: [],
  restricted: [],
  typeDeclPath: [],
  root: true,
  proposedChanges: [],
  imported: {},
  ...override,
});
const langContext = mkDefContext();

async function tryParse(data) {
  let ast = (await loadParser(true)).parse(data);
  const oldErr = ast.error;
  if (ast.error) ast = (await loadParser(false)).parse(data);
  if (ast.error)
    throw new Error(
      `Unable to parse Cadence\n${inspect(
        ast.error.Errors,
        true,
        4,
      )}\n${inspect(oldErr.Errors, true, 4)}`,
    );
  return ast;
}

/**
 * @type {Object.<string, {name: string, [addImport]: string}>}
 */
const remappedTypes = {
  'MetadataViews.Resolver': {
    name: 'ViewResolver.Resolver',
    addImport: 'ViewResolver',
  },
  'MetadataViews.ResolverCollection': {
    name: 'ViewResolver.ResolverCollection',
    addImport: 'ViewResolver',
  },
};

/**
 * @param {Object} node
 * @param {ParserContext} context
 * @returns {Promise<Object<string, ParserContext|null>>}
 */
// TODO includes
async function resolveImport(node, context) {
  let whatToFind = node.Identifiers?.map((ident) => ident.Identifier) ?? null;
  let whereToFind = null;
  if (!whatToFind && node.Location.Type === 'AddressLocation') {
    console.log('Could not load import from address without identifiers.'); // TODO logging
    return {};
  }
  if (!whatToFind && node.Location.Type !== 'StringLocation') {
    console.log(
      'Could not load import - unknown location type',
      node.Location.Type,
    ); // TODO logging
    return {};
  }
  if (node.Location.Type === 'StringLocation') {
    if (whatToFind) {
      whereToFind = node.Location.String;
    } else {
      whatToFind = [node.Location.String];
    }
  }
  const located = whatToFind.map((what) => {
    let file = join(context.selfDir, whereToFind ?? '', what);
    if (fileExistsSync(file)) return [what, file];
    if (fileExistsSync(`${file}.cdc`)) return [what, `${file}.cdc`];
    file = join(context.selfDir, whereToFind ?? '');
    if (fileExistsSync(file)) return [what, file];
    if (fileExistsSync(`${file}.cdc`)) return [what, `${file}.cdc`];
    file = join(context.baseDir, 'contracts/', whereToFind ?? '', what);
    if (fileExistsSync(file)) return [what, file];
    if (fileExistsSync(`${file}.cdc`)) return [what, `${file}.cdc`];
    file = join(context.baseDir, 'contracts/', whereToFind ?? '');
    if (fileExistsSync(file)) return [what, file];
    if (fileExistsSync(`${file}.cdc`)) return [what, `${file}.cdc`];
    console.log('Could not find', whatToFind, 'in', whereToFind); // TODO logging
    return [what, null];
  });
  const loaded = {};
  async function loader(file) {
    if (!file) return null;
    if (parsedCache[file]) return parsedCache[file];
    const name = file.startsWith(context.baseDir)
      ? file.slice(context.baseDir.length)
      : file;
    const data = parseCadence(
      readFileSync(file, 'utf8'),
      mkDefContext({
        name,
        baseDir: context.baseDir,
        selfDir: dirname(file),
      }),
    ).catch((err) => {
      console.log('Could not parse includefile', file, err); // TODO logging
      return null;
    });
    parsedCache[file] = data;
    return data;
  }
  for (const [what, file] of located) {
    loaded[what] = await loader(file);
  }
  return loaded;
}

function extractType(data, context, node) {
  if (node.TypeAnnotation)
    return (
      (node.TypeAnnotation.IsResource ? '@' : '') +
      extractType(data, context, node.TypeAnnotation)
    );
  if (node.AnnotatedType) return extractType(data, context, node.AnnotatedType);
  if (node.ReferencedType)
    return `&${extractType(data, context, node.ReferencedType)}`;
  return (node.IsResource ? '@' : '') + extractNodeString(data, node);
}

/**
 *
 * @param {string} data
 * @param {ParserContext} context
 * @param {Object} node
 * @returns {string[]}
 */
function extractTypes(data, context, node) {
  if (node.TypeAnnotation)
    return extractTypes(data, context, node.TypeAnnotation);
  if (node.AnnotatedType)
    // TODO IsResource?
    return extractTypes(data, context, node.AnnotatedType);
  if (node.ReferencedType)
    return extractTypes(data, context, node.ReferencedType);
  /** @type string[] */
  const types = [];

  switch (node.Type) {
    case 'RestrictedType':
      if (node.RestrictedType) {
        types.push(...extractTypes(data, context, node.RestrictedType));
      }
      types.push(
        ...(node.Restrictions ?? []).map((r) => extractType(data, context, r)),
      );
      break;
    case 'IntersectionType':
      types.push(
        ...(node.Types ?? []).map((r) => extractType(data, context, r)),
      );
      break;
    case 'NominalType':
      return [extractNodeString(data, node)];
    default:
      logger.debug('Unknown type Type', node.Type);
  }
  logger.debug('Extracting types', node, types);
  return types;
}

/**
 * @param {ParserContext} context
 * @param {string} name
 * @returns {MemberWithScope | null}
 */
function findType(context, name) {
  const typeDecls = [...langContext.typeDecls, ...context.typeDecls];
  const found = typeDecls.find((d) => d.fqdn === name);
  if (found) return found;
  let accu = '';
  for (const d of context.typeDeclPath) {
    accu = accu ? `${accu}.${d}` : d;
    // eslint-disable-next-line no-loop-func
    const found = typeDecls.find((d) => d.fqdn === `${accu}.${name}`);
    if (found) return found;
  }
  return null;
}
/**
 * @param {ParserContext} context
 * @param {string} name
 * @returns {FuncWithScope | null}
 */
function findFunc(context, name) {
  const funcDecls = [...langContext.funcDecls, ...context.funcDecls];
  if (name.startsWith('self.')) {
    const selfName = context.typeDeclPath.join('.') + name.slice(4);
    const found = funcDecls.find((d) => d.fqdn === selfName);
    if (found) return found;
    return null;
  }
  const found = funcDecls.find((d) => d.fqdn === name);
  if (found) return found;
  let accu = '';
  for (const d of context.typeDeclPath) {
    accu = accu ? `${accu}.${d}` : d;
    // eslint-disable-next-line no-loop-func
    const found = funcDecls.find((d) => d.fqdn === `${accu}.${name}`);
    if (found) return found;
  }
  return null;
}

function parseParam(data, param, context) {
  /** @type string */
  const name = param.Identifier?.Identifier ?? '??';
  const paramType = extractType(data, context, param);
  /** @type VarWithScope */
  const parsedParam = {
    identifier: name,
    type: paramType,
    label: param.Label,
    types: extractTypes(data, context, param),
    resolvedTypes: extractTypes(data, context, param)
      .map((t) => findType(context, t))
      .filter(Boolean), // TODO log unresolved?
    blockOffset: context.blockOffset,
    blockLength: context.blockLength,
    selfOffset: param.StartPos.Offset,
    legacyAuthorized: false,
    // declaredPurity: param.Purity,
    // declaredAccess: param.Access,
    node: param,
    accessEntitlementsActual: [],
    entitlementsAdded: [],
  };
  const annotatedType = param.TypeAnnotation?.AnnotatedType;
  if (annotatedType) {
    if (annotatedType.Authorized === true) {
      delete annotatedType.Authorized;
      annotatedType.LegacyAuthorized = true;
    }
    if (annotatedType.LegacyAuthorized) {
      parsedParam.legacyAuthorized = true;
    }
    if (annotatedType.Authorization) {
      let element;
      if (annotatedType.Authorization.ConjunctiveElements) {
        element = 'ConjunctiveElements';
        parsedParam.accessEntitlements =
          annotatedType.Authorization.ConjunctiveElements.map(
            (e) => e.Identifier.Identifier,
          );
      } else if (annotatedType.Authorization.DisjunctiveElements) {
        element = 'DisjunctiveElements';
        parsedParam.entitlementsPiped = true;
        parsedParam.accessEntitlements =
          annotatedType.Authorization.DisjunctiveElements[
            annotatedType.Authorization.DisjunctiveElements.length - 1
          ].Identifier.Identifier;
      } else if (annotatedType.Authorization.EntitlementMap) {
        element = 'EntitlementMap';
        parsedParam.accessEntitlements =
          annotatedType.Authorization.EntitlementMap.Identifier.Identifier;
      }

      if (!element) {
        logger.debug('Unknown authorization', annotatedType.Authorization);
      } else {
        //   parsedParam.type = parsedParam.type
        //     .substring(
        //       annotatedType.Authorization.EndPos.Offset -
        //         annotatedType.Authorization.StartPos.Offset,
        //     )
        //     .trim();
      }
    }
    //
  }
  return parsedParam;
}

/**
 * @param {string} data
 * @param {ParserContext} defContext
 * @returns {Promise<ParserContext>}
 */
async function parseCadence(data, defContext) {
  const ast = await tryParse(data);
  // log(inspect(ast, true, 4));

  function checkType(data, node, context) {
    const interest = ['AnnotatedType', 'ReferencedType', 'RestrictedType'];
    const ftype = interest.find((type) => node.Type === type || node[type]);
    const def = data.substring(node.StartPos.Offset, node.EndPos.Offset + 1);
    if (ftype && node[ftype])
      checkType(data, node[ftype], {
        ...context,
        typeDeclPath: [...context.typeDeclPath, ftype],
        typeParentDef: def,
      });
    if (node.Type === 'RestrictedType' && node.RestrictedType) {
      context.restricted.push({
        def,
        parentDef: context.typeParentDef,
        outerOffset: node.StartPos.Offset,
        outerLength: node.EndPos.Offset - node.StartPos.Offset,
        nominalOffset: node.RestrictedType.StartPos.Offset,
        nominalLength:
          node.RestrictedType.EndPos.Offset -
          node.RestrictedType.StartPos.Offset,
      });
    }
    // TODO other types?
  }

  /**
   * @param data
   * @param node
   * @param {ParserContext} context
   * @returns {Promise<*>}
   */
  async function visit(data, node, context) {
    // Block scope
    if (context.blockLength === 0) context.blockLength = data.length;
    let { blockOffset: newBlockOffset, blockLength: newBlockLength } = context;
    let offset = 0;
    let length = 0;
    if (node.StartPos && node.EndPos) {
      offset = node.StartPos.Offset;
      length = node.EndPos.Offset + 1;
      if (node.Type === 'Block') {
        newBlockOffset = offset;
        newBlockLength = length;
        context.blocks.push({
          blockOffset: offset,
          blockLength: length,
        });
      }
    }

    /**
     * @param {Object<string, ParserContext|null>} imported
     */
    function pushImportedTypeDefs(imported, context) {
      for (const type of Object.keys(imported)) {
        if (context.imported[type] === undefined) {
          context.imported[type] = imported[type];
          context.typeDecls.push(
            ...(imported[type]?.typeDecls?.filter(
              (d) => d.fqdn === type || d.fqdn.startsWith(`${type}.`),
            ) ?? []),
          );
        }
      }
    }

    async function syntheticImport(name, context) {
      if (context.imported[name] !== undefined) return;
      const resolved = await resolveImport(
        { Location: { Type: 'StringLocation', String: name } },
        context,
      );
      pushImportedTypeDefs(resolved, context);
      context.proposedChanges.push({
        offset: context.importEndOffset,
        length: 0,
        replace: `\nimport "${name}"`,
      });
    }
    /** @type {ParserContext} */
    const newCtx = {
      ...context,
      path: `${context.path}/${node.Type ?? ''}`,
      blockOffset: newBlockOffset,
      blockLength: newBlockLength,
      root: false,
    };
    if (node.TypeArguments) {
      for (const typeArgument of node.TypeArguments) {
        checkType(data, typeArgument, context);
      }
    }
    if (node.Conformances) {
      const fqdnConf = await Promise.all(
        node.Conformances?.map(async (cNode) => {
          const c = extractNodeString(data, cNode).replaceAll(/\s+/gimu, '');
          if (remappedTypes[c]) {
            // logger.debug('Remapping type', c, 'to', remappedTypes[c]);
            if (remappedTypes[c].addImport) {
              await syntheticImport(remappedTypes[c].addImport, context);
            }
            context.proposedChanges.push({
              offset: cNode.StartPos.Offset,
              length: cNode.EndPos.Offset + 1 - cNode.StartPos.Offset,
              replace: remappedTypes[c].name,
            });
            return remappedTypes[c].name;
          }
          return c;
        }),
      );
      const conformances = fqdnConf.map((fq) => findType(context, fq));
      const missing = conformances.flatMap((c, i) => (c ? [] : fqdnConf[i]));
      if (missing.length > 0)
        logger.log(
          'Could not find conformances:',
          missing,
          'on line',
          node.StartPos.Line,
        );
      if (conformances.length > 0)
        // eslint-disable-next-line require-atomic-updates
        context.currTypeDecl.conformances = conformances.filter(Boolean);
      // logger.log(
      //   declaration,
      //   fqdnConf,
      //   fqdnConf.map((fq) =>
      //     context.typeDecls.find((d) => d.fqdn === fq),
      //   ),
      // );
    }

    async function processDeclarations(declarations, context) {
      const defer = [];
      if (context.currTypeDecl && !context.currTypeDecl.members)
        context.currTypeDecl.members = [];
      for (let declaration of declarations) {
        if (declaration.Type === 'SpecialFunctionDeclaration') {
          declaration = declaration.FunctionDeclaration;
        }
        if (!declaration.Purity) declaration.Purity = 'Unspecified';
        {
          if (declaration.Access === 'AccessPublic') {
            declaration.Access = 'AccessAll';
            if (replacePub)
              context.proposedChanges.push({
                length: 3,
                offset: declaration.StartPos.Offset,
                replace: 'access(all)',
              });
          }
          if (declaration.Access === 'AccessPrivate') {
            declaration.Access = 'AccessSelf';
            if (replacePub)
              context.proposedChanges.push({
                length: 4,
                offset: declaration.StartPos.Offset,
                replace: 'access(self)',
              });
          }
        }
        const ident = declaration.Identifier?.Identifier ?? '??';
        // TODO move this
        const ignoreNoIdent = ['ImportDeclaration', 'TransactionDeclaration'];
        if (ident === '??' && !ignoreNoIdent.includes(declaration.Type))
          logger.debug('Identifier not found', declaration);
        const isLangDef =
          allowLanguageDefs && ident === '___LanguageDefinition';
        const declPath = [...context.typeDeclPath, ident];
        const typeDecl = {
          blockOffset: context.blockOffset,
          blockLength: context.blockLength,
          identifier: ident,
          file: '', // TODO
          fqdn: declPath.join('.'),
          selfOffset: declaration.StartPos.Offset,
          declaredPurity: declaration.Purity,
          declaredAccess: declaration.Access,
          node: declaration,
          parent: context.currTypeDecl,
        };
        if (declaration.Access?.EntitlementMap) {
          // TODO i really don't want to implement any of this.
          const mask = extractNodeString(
            data,
            declaration.Access.EntitlementMap,
          );
          declaration.Access = `EntitlementAccess ${mask}`;
        }
        if (declaration.Access?.startsWith('EntitlementAccess')) {
          typeDecl.declaredAccess = declaration.Access.slice(0, 17);
          const entitle = declaration.Access.slice(18).replace(/\s/g, '');
          typeDecl.declaredEntitlements = entitle;
          typeDecl.possibleEntitlements = entitle
            .split(/\||,/)
            .map((e) => e.trim());
          typeDecl.minimalEntitlements = entitle.includes('|')
            ? [entitle.substring(entitle.lastIndexOf('|') + 1).trim()]
            : entitle.split(',').map((e) => e.trim());
        }
        if (context.currTypeDecl) {
          // old code didn't have entitlements, and names may clash with events (as is the case with NFT) -.-'
          if (declaration.Type !== 'EntitlementDeclaration')
            context.currTypeDecl.members.push(typeDecl);
          // TODO extract fixer functions
          if (context.currTypeDecl.conformances)
            for (const conf of context.currTypeDecl.conformances) {
              const found = conf.members?.find((m) =>
                m.fqdn.endsWith(typeDecl.identifier),
              );
              if (!found) continue;
              let touched = false;
              logger.debug(
                `Checking conformance of ${typeDecl.fqdn} against ${found.fqdn}`,
              );
              if (typeDecl.declaredPurity !== found.declaredPurity) {
                const foundDeclStart = extractNodeString(
                  data,
                  declaration,
                ).search(declarationRegex);
                if (
                  typeDecl.declaredPurity === 'Unspecified' &&
                  found.declaredPurity === 'View'
                ) {
                  touched = true;
                  typeDecl.declaredPurity = 'View';
                  context.proposedChanges.push({
                    offset: declaration.StartPos.Offset + foundDeclStart,
                    length: 0,
                    replace: 'view ',
                  });
                  // } else if (
                  //   found.declaredPurity === 'Unspecified' &&
                  //   typeDecl.declaredPurity === 'View'
                  // ) {
                  //   //
                } else {
                  logger.debug(
                    'Purity mismatch - unknown combination',
                    typeDecl.declaredPurity,
                    found.declaredPurity,
                  );
                }
              }
              if (typeDecl.declaredAccess !== found.declaredAccess) {
                let foundAccess = '';
                let foundOffset = 0;
                if (typeDecl.declaredAccess !== 'AccessNotSpecified') {
                  const foundRx = accessRegex.exec(
                    extractNodeString(data, declaration),
                  );
                  foundAccess = foundRx[0].trim();
                  foundOffset = foundRx.index;
                }
                const targetAccess = formatAccess(found);

                touched = true;
                context.proposedChanges.push({
                  offset: declaration.StartPos.Offset + foundOffset,
                  length: foundAccess.length,
                  replace: targetAccess,
                });
                logger.debug(
                  'Access mismatch',
                  typeDecl.declaredAccess,
                  found.declaredAccess,
                  { foundAccess, foundOffset, targetAccess },
                );
                typeDecl.declaredAccess = found.declaredAccess;
                typeDecl.declaredEntitlements = found.declaredEntitlements;
                typeDecl.possibleEntitlements = found.possibleEntitlements;
                typeDecl.minimalEntitlements = found.minimalEntitlements;
              }
            }
        }
        switch (declaration.Type) {
          case 'ImportDeclaration': {
            if (!declaration.Location?.String?.startsWith('!')) {
              context.importEndOffset = declaration.EndPos.Offset + 1;
              newCtx.importEndOffset = declaration.EndPos.Offset + 1;
            }
            const resolved = await resolveImport(declaration, context);
            pushImportedTypeDefs(resolved, context);
            break;
          }
          case 'InterfaceDeclaration':
          case 'CompositeDeclaration': {
            if (!isLangDef) context.typeDecls.push(typeDecl);
            defer.push([
              data,
              declaration,
              isLangDef
                ? context
                : {
                    ...newCtx,
                    typeDeclPath: declPath,
                    path: `${context.path}/Composite(${ident})`,
                    currTypeDecl: typeDecl,
                  },
            ]);
            break;
          }
          case 'FunctionDeclaration': {
            /** @type FuncWithScope */
            const funcDecl = typeDecl;
            typeDecl.parameters = [];
            typeDecl.calledOn = [];
            logger.debug(
              `Function ${funcDecl.fqdn}`,
              declaration,
              // findFunc(context, funcDecl.fqdn),
            );
            const params = declaration?.ParameterList?.Parameters ?? [];
            // logger.debug(`Params`, declaration.ParameterList.Parameters);
            funcDecl.parameters = params.map((param) =>
              parseParam(data, param, context),
            );
            funcDecl.returnType = declaration.ReturnTypeAnnotation
              ? extractType(data, context, declaration.ReturnTypeAnnotation)
              : null;
            context.funcDecls.push(funcDecl);
            // Checking conformances (headache..)
            if ((context.currTypeDecl?.conformances?.length ?? 0) > 0) {
              const fixed = false;
              for (const conformanceDef of context.currTypeDecl.conformances) {
                const conformance = conformanceDef.members?.find(
                  (m) => m.name === funcDecl.name,
                );
                if (
                  (conformance.returnType ?? 'Void') !==
                  (funcDecl.returnType ?? 'Void')
                ) {
                  if (funcDecl.returnType) {
                    context.proposedChanges.push({
                      length:
                        declaration.ReturnTypeAnnotation.EndPos.Offset -
                        declaration.ReturnTypeAnnotation.StartPos.Offset,
                      offset: declaration.ReturnTypeAnnotation.StartPos.Offset,
                      replace: conformance.returnType ?? '',
                    });
                  } else {
                    context.proposedChanges.push({
                      length: 0,
                      offset: declaration.ParameterList.EndPos.Offset + 1,
                      replace: `: ${conformance.returnType ?? ''}${
                        declaration.FunctionBlock ? ' ' : ''
                      }`,
                    });
                    // declaration.ReturnTypeAnnotation
                  }
                  funcDecl.returnType = conformance.returnType;
                }
                const argsConf = extractNodeString(
                  data,
                  conformance.node.ParameterList,
                ).replaceAll(/\s*/gimu, '');
                const argsMe = extractNodeString(
                  data,
                  declaration.ParameterList,
                ).replaceAll(/\s*/gimu, '');
                // deepClone();
                if (argsConf !== argsMe) {
                  context.proposedChanges.push({
                    length:
                      declaration.ParameterList.EndPos.Offset -
                      declaration.ParameterList.StartPos.Offset +
                      1,
                    offset: declaration.ParameterList.StartPos.Offset,
                    replace: extractNodeString(
                      data,
                      conformance.node.ParameterList,
                    ).replaceAll(/\s+/gimu, ' '),
                  });
                  funcDecl.parameters = conformance.parameters.map((param) => ({
                    identifier: param.identifier,
                    type: param.type,
                    label: param.label,
                    blockOffset: context.blockOffset,
                    blockLength: context.blockLength,
                    selfOffset: null, // param.StartPos.Offset, TODO calc..
                    legacyAuthorized: param.legacyAuthorized || false,
                    entitlementsPiped: param.entitlementsPiped || false,
                    accessEntitlements: param.accessEntitlements && [
                      ...param.accessEntitlements,
                    ],
                    accessEntitlementsActual: param.accessEntitlementsActual
                      ? [...param.accessEntitlementsActual]
                      : param.accessEntitlementsActual,
                    entitlementsAdded: param.entitlementsAdded
                      ? [...param.entitlementsAdded]
                      : param.entitlementsAdded,
                    // node: param.node,
                  }));
                }
                //
              }
            }
            if (declaration.FunctionBlock?.Block) {
              defer.push([
                data,
                declaration.FunctionBlock.Block,
                {
                  ...newCtx,
                  currFuncDecl: funcDecl,
                  // typeDeclPath: declPath,
                  path: `${context.path}/func(${ident})`,
                  // currTypeDecl: typeDecl,
                },
              ]);
            }
            break;
          }
          default:
            logger.debug(
              'Unknown declaration:',
              declaration.Type,
              inspect(declaration, true, 2),
            );
          case 'FieldDeclaration':
          case 'EntitlementDeclaration':
          case 'EntitlementMappingDeclaration':
          case 'EnumCaseDeclaration':
          case 'SpecialFunctionDeclaration':
            break;
        }
        // console.log(declaration);
      }
      for (const params of defer) {
        await visit.call(null, ...params);
      }
    }

    if (node.Members?.Declarations)
      await processDeclarations(node.Members.Declarations, context);
    if (node.Declarations)
      await processDeclarations(node.Declarations, context);

    switch (node.Type) {
      default:
        logger.debug('Unknown node:', node.Type, inspect(node, true, 2));
      case 'Program':
      case 'Block':
      case 'CompositeDeclaration':
      case 'InterfaceDeclaration':
        break;
    }

    return context;
  }
  return visit(data, ast.program, defContext);
}

/**
 * @param {string} data
 * @param {ProposedChange[]} changes
 */
function applyChanges(data, changes) {
  changes = changes.sort((a, b) =>
    a.offset - b.offset === 0
      ? a.priority ?? 0 - b.priority ?? 0
      : a.offset - b.offset,
  );
  let pad = 0;
  console.log(changes);
  for (const change of changes) {
    if (change.manual) continue;
    data =
      data.slice(0, change.offset + pad) +
      change.replace +
      data.slice(change.offset + pad + change.length);
    pad += change.replace.length - change.length;
  }
  return data;
}

async function loadBaseLanguageDefs() {
  const nLang = readFileSync('./BaseLanguageDefs.cdc', 'utf8');
  const res = await parseCadence(nLang, langContext);
  writeFileSync('./NBaseLangDef.ctx.json5', JSON5.stringify(res, null, 1));
}

async function loadLanguageDefs() {
  const nLang = readFileSync('./LanguageDefs.cdc', 'utf8');
  const res = await parseCadence(nLang, langContext);
  writeFileSync('./NLangDef.ctx.json5', JSON5.stringify(res, null, 1));
}

let _builtInLoader;
async function _loadBuiltins() {
  allowLanguageDefs = true;
  await loadBaseLanguageDefs();
  await loadLanguageDefs();
  allowLanguageDefs = false;
}
async function loadBuiltins() {
  if (_builtInLoader) return _builtInLoader;
  _builtInLoader = _loadBuiltins();
  return _builtInLoader;
}

const basePath = join(__dirname, '../../');

const defaults = { selfDir: basePath, baseDir: basePath };

// parseCadence(
//   readFileSync('../../contracts/NonFungibleToken.cdc', 'utf8'),
//   mkDefContext({ ...defaults }),
// ).then(console.log);
loadBuiltins().then(() => {
  tryParse(readFileSync('../../contracts/NonFungibleToken.cdc', 'utf8')).then(
    (data) =>
      writeFileSync(
        './NonFungibleToken.dump.json5',
        JSON5.stringify(data, null, 1),
      ),
  );
  const nLang = readFileSync('./LanguageDefs.cdc', 'utf8');
  tryParse(nLang).then(async (data) => {
    writeFileSync('./NLangDef.dump.json5', JSON5.stringify(data, null, 1));
  });
  const data = readFileSync('../../contracts/ExampleNFT.cdc', 'utf8');
  tryParse(data).then(async (data) => {
    writeFileSync('./Nparsed.dump.json5', JSON5.stringify(data, null, 1));
  });
  parseCadence(data, mkDefContext({ ...defaults })).then((res) => {
    console.log(inspect(res, true, 3));
    writeFileSync('./Nparsed.ctx.json5', JSON5.stringify(res, null, 1));
    writeFileSync(
      './Nparsed.fixed.cdc',
      applyChanges(data, res.proposedChanges),
    );
    // console.log(parsedCache);
  });
});
