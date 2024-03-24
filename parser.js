/* eslint-disable func-style,unicorn/consistent-function-scoping */
const { CadenceParser } = require('@onflow/cadence-parser');
const { inspect } = require('node:util');
const { isObject } = require('node:util');
const { isPlainObject } = require('lodash');
const { isPrimitive } = require('node:util');
const { join } = require('node:path');
const { readFile } = require('node:fs/promises');
const { isArray } = require('node:util');
const resolvedParser = require.resolve('@onflow/cadence-parser');
const wasmPath = join(resolvedParser, '../../cadence-parser.wasm').replaceAll(
  /\\/g,
  '/',
);

const debugParser = false;
function log(...args) {
  if (!debugParser) return;
  console.log(...args);
}
function err(...args) {
  if (!debugParser) return;
  console.error(...args);
}

/**
 * @typedef {Object} VarWithScope
 * @property {string} identifier The name of the variable.
 * @property {number} blockOffset The offset of the variable.
 * @property {number} blockLength The length of the variable.
 * @property {string} [type] The type of the variable.
 */
/**
 * @param {number} pos
 *  @param {VarWithScope[]} vars
 *  @returns {VarWithScope[]}
 */
function filterVarsWithScope(pos, vars) {
  return vars.filter(
    (v) => v.blockOffset <= pos && pos <= v.blockOffset + v.blockLength,
  );
}

const parser = readFile(wasmPath).then((wasm) => CadenceParser.create(wasm));

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
 * @property {number} blockOffset
 * @property {number} blockLength
 * @property {string} typeParentDef
 * @property {string[]} typeDeclPath
 * @property {boolean} root
 * @property {BlockDecl[]} blocks
 * @property {VarWithScope[]} accDecls
 * @property {RestrictedDef[]} restricted
 */

/**
 * @param {string} data
 * @returns {Promise<ParserContext>}
 */
async function parseCadence(data) {
  const ast = (await parser).parse(data);
  log(inspect(ast, true, 4));
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
      log(
        '@@@@@@@@@!!!!!!@@@@@@@@@@',
        def,
        node,
        node.RestrictedType.Identifier,
        node.Restrictions,
      );
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
    log('@@@@@@@@@@@@@@@@', node);
  }

  function visit(
    data,
    node,
    context = {
      path: '',
      blockOffset: 0,
      blockLength: 0,
      blocks: [],
      accDecls: [],
      restricted: [],
      typeDeclPath: [],
      root: true,
    },
  ) {
    if (context.blockLength === 0) context.blockLength = data.length;
    let { blockOffset: newBlockOffset, blockLength: newBlockLength } = context;
    const interest = [
      // 'Prepare',
      // 'Contract',
      // 'FunctionDeclaration',
      // 'VariableDeclaration',
      // 'Block',
      // 'InvocationExpression',
      // 'InvokedExpression',
      // 'MemberExpression',
    ];
    let offset = context.offset || 0;
    let lenght = context.lenght || 0;
    if (node.StartPos && node.EndPos) {
      offset = node.StartPos.Offset;
      lenght = node.EndPos.Offset + 1;
      if (node.Type === 'Block') {
        newBlockOffset = offset;
        newBlockLength = lenght;
        context.blocks.push({
          blockOffset: offset,
          blockLength: lenght,
        });
      }
    }
    if (interest.includes(node.Type)) {
      log(node, context);
      log(context.path, node.Type);
      log(data.substring(offset, lenght));
    }
    if (node.TypeArguments) {
      for (const typeArgument of node.TypeArguments) {
        checkType(data, typeArgument, context);
      }
    }
    if (node.Type === 'VariableDeclaration') {
      let isAccDecl = false;
      if (node.Value && node.Value.InvokedExpression) {
        const expr = node.Value.InvokedExpression;
        if (expr.Identifier && expr.Identifier.Identifier === 'getAccount') {
          isAccDecl = true;
        }
        log('=========', node.Value.InvokedExpression);
      } else if (
        node.Transfer?.Operation === 'TransferOperationCopy' &&
        node.Value &&
        node.Value.Identifier?.Identifier
      ) {
        isAccDecl = true;
        log('=========', node.Value.InvokedExpression);
      }

      if (isAccDecl) {
        log('!!!!!!!!!!!!!!!!!', node.Identifier.Identifier);
        if (
          !context.accDecls.some(
            (acc) =>
              acc.identifier === node.Identifier.Identifier &&
              acc.blockOffset === context.blockOffset &&
              acc.blockLength === context.blockLength,
          )
        )
          context.accDecls.push({
            blockOffset: context.blockOffset,
            blockLength: context.blockLength,
            identifier: node.Identifier.Identifier,
          });
      }
    }
    function revisit(sub) {
      return visit(data, sub, {
        ...context,
        offset,
        lenght,
        path: `${context.path}/${node.Type ?? ''}`,
        blockOffset: newBlockOffset,
        blockLength: newBlockLength,
        root: false,
      });
    }
    const ignoreType = new Set(['NilExpression']);
    for (const check in node) {
      let checked = node[check];
      checked = isArray(checked) ? checked : [checked];
      for (const subChecked of checked) {
        if (!subChecked) continue;
        if (
          isPlainObject(subChecked) &&
          !isPrimitive(subChecked) &&
          subChecked.Type
        ) {
          if (ignoreType.has(subChecked.Type)) continue;
          revisit(subChecked);
        }
      }
    }
    // if (node.Statements) {
    //   for (const sub of node.Statements) data = revisit(sub);
    // }
    const declDeep = new Set(['Program']);
    if (node.Declarations) {
      console.log('decl', node.Type, node.Type && declDeep.has(node.Type));
      if (node.Type && declDeep.has(node.Type))
        for (const sub of node.Declarations) data = revisit(sub);
    }
    if (node.Type === 'CompositeDeclaration') {
      for (const sub of node.Members.Declarations) data = revisit(sub);
    }

    if (context.root) return context;
    return data;
  }
  return visit(data, ast.program);
}

module.exports = { parseCadence, filterVarsWithScope };

