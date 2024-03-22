/* eslint-disable */
const { isString } = require('util');
const commentRegex = /\/\/.*?$/gimu;
const lineCommentRegex = /^\/\/.*?$/gimu;
const blockCommentRegex = /\*[^*]*\*+(?:[^/*][^*]*\*+)*/gimu;
const quoteRegex = /\\"|"(?:\\"|[^"])*"|(\+)/gimu;

const pubPrivRegex =
  /(pub|priv)\s+(contract|resource|struct|event|enum|case|entitlement|view|fun|var|let)/gimu;

// Doh...
const importTokenPart = `("[\\w\\d]+?")|('[\\w\\d]+?')|([\\w\\d]+)`;
const importRegex = new RegExp(
  `^\\s*import\\s+((:?${importTokenPart}\\s*,\\s*)*${importTokenPart})\\s*?(?!from)[^\\n]*?$`,
  'gium',
);
const importFromRegex = new RegExp(
  `^\\s*import\\s+((:?${importTokenPart}\\s*,\\s*)*${importTokenPart})\\s*?from`,
  'gium',
);

function blankRegex(str, regex) {
  let searchData = str;
  const matches = searchData.matchAll(regex);
  for (const match of matches) {
    const len = match[0].length;
    searchData =
      searchData.slice(0, Math.max(0, match.index)) +
      ' '.repeat(len) +
      searchData.substring(match.index + len, searchData.length);
  }
  return searchData;
}

function replaceSubstituted(data, searchData, regex, replace) {
  const matches = searchData.matchAll(regex);
  let res = data;
  let pad = 0;
  for (const match of matches) {
    const len = match[0].length;
    const index = match.index + pad;
    const replaced = isString(replace) ? replace : replace(match);
    pad += replaced.length - len;
    res =
      res.slice(0, Math.max(0, index)) +
      replaced +
      res.substring(index + len, res.length);
  }
  return res;
}
function replaceSubstitutedEscaped(data, regex, replace) {
  let searchData = blankRegex(data, lineCommentRegex);
  searchData = blankRegex(searchData, blockCommentRegex);
  searchData = blankRegex(searchData, quoteRegex);
  searchData = blankRegex(searchData, commentRegex);
  return replaceSubstituted(data, searchData, regex, replace);
}

String.prototype.splice = function(index, count, add) {
  if (index < 0) {
    index += this.length;
    if (index < 0)
      index = 0;
  }
  return this.slice(0, index) + (add || "") + this.slice(index + count);
}


const collapseSpaces = function collapseSpaces(input) {
  return input.replace(/\s+/g, " ");
};
const removeSpaces = function removeSpaces(input) {
  return input.replace(/\s+/g, "");
};

const stripParen = function stripParen(code, prefix) {
  const quoteRegex = new RegExp(`${prefix?`${prefix}\\s*`:''}\\([^)]*?\\)` ,"gimu");
  return code.replace(quoteRegex, "");
}
const stripComments = function stripComments(code) {
  let commentsRegExp = /(\/\*[\s\S]*?\*\/)|(\/\/.*)/g;
  return code.replace(commentsRegExp, "");
};
const stripStrings = function stripStrings(code) {
  // replace all strings with ""
  let inString = false;
  let res = "";

  for (const i = 0; i < code.length; i++) {
    if (code[i] === '"') {
      if (inString && code[i - 1] !== "\\") {
        inString = false;
        res += code[i];
      } else inString = true;
    }

    if (!inString) {
      res += code[i];
    }
  }

  return res;
};
const generateSchema = function generateSchema(argsDefinition) {
  return stripParen(argsDefinition, 'auth').split(",").map(function (item) {
    return item.replace(/\s*/g, "");
  }).filter(function (item) {
    return item !== "";
  });
};
const extract = function extract(code, keyWord) {
  const noComments = stripComments(code);
  const target = collapseSpaces(noComments.replace(/[\n\r]/g, ""));

  if (target) {
    const regexp = new RegExp(keyWord, "g");
    const match = regexp.exec(target);

    if (match) {
      if (match[1] === "") {
        return [];
      }

      return generateSchema(match[1]);
    }
  }

  return [];
};

const extractSigners = function extractSigners(code) {
  return extract(code, "(?:prepare\\s*\\(\\s*)(.+)(?:\\)\\s*?{)");
};
module.exports = {extract, extractSigners, blankRegex, replaceSubstituted, replaceSubstitutedEscaped}
