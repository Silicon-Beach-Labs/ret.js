var util = require('./util')
  , types = require('./types')
  , classes = require('./classes')
  , positions = require('./positions')
  ;


var error = function(regexp, msg) {
  throw new Error('Invalid regular expression: /' + regexp + '/: ' + msg);
};

module.exports = function(regexpStr) {
  var i = 0, l, c,
      start = { type: types.ROOT, stack: []},

      // keep track of last clause/group and stack
      lastGroup = start,
      last = start.stack,
      groupStack = [];


  var repeatErr = function(i) {
    error(regexpStr, 'Nothing to repeat at column ' + (i - 1));
  };

  // decode a few escaped characters
  str = util.strToChars(regexpStr);
  l = str.length;

  // iterate through each character in string
  while (i < l) {
    c = str[i++];

    switch (c) {
      // handle escaped characters, inclues a few classes
      case '\\':
        c = str[i++];

        switch (c) {
          case 'b':
            last.push(positions.wordBoundary());
            break;

          case 'B':
            last.push(positions.nonWordBoundary());
            break;

          case 'w':
            last.push(classes.words());
            break;

          case 'W':
            last.push(classes.notWords());
            break;

          case 'd':
            last.push(classes.ints());
            break;

          case 'D':
            last.push(classes.notInts());
            break;

          case 's':
            last.push(classes.whitespace());
            break;

          case 'S':
            last.push(classes.notWhitespace());
            break;

          default:
            // check if c is integer
            // in which case it's a reference
            if (/\d/.test(c)) {
              last.push({ type: types.REFERENCE, value: parseInt(c) });

            // escaped character
            } else {
              last.push({ type: types.CHAR, value: c.charCodeAt(0) });
            }
        }

        break;


      // positionals
      case '^':
          last.push(positions.begin());
        break;

      case '$':
          last.push(positions.end());
        break;


      // handle classes
      case '[':
        // check if this class is 'anti' i.e. [^abc]
        if (str[i] === '^') {
          var not = true;
          i++;
        } else {
          var not = false;
        }

        // get all the characters in class
        var classTokens = util.tokenizeClass(str.slice(i));

        // increase index by length of class
        i += classTokens[1];
        last.push({
            type: types.CLASS
          , set: classTokens[0]
          , not: not
        });

        break;


      // class of any character except \n
      case '.':
        last.push(classes.anyChar());
        break;


      // push group onto stack
      case '(':
        // create group
        var group = {
            type: types.GROUP
          , stack: []
          , remember: true
        };

        c = str[i];

        // if if this is a special kind of group
        if (c === '?') {
          c = str[i + 1];
          i += 2;

          // match if followed by
          if (c === '=') {
            group.followedBy = true;

          // match if not followed by
          } else if (c === '!') {
            group.notFollowedBy = true;

          } else if (c !== ':') {
            error(regexpStr,
                'Invalid character \'' + c + '\' after \'?\' at column ' +
                (i - 1));
          }

          group.remember = false;
        }

        // insert subgroup into current group stack
        last.push(group);

        // remember the current group for when the group closes
        groupStack.push(lastGroup);

        // make this new group the current group
        lastGroup = group;
        last = group.stack;
        break;


      // pop group out of stack
      case ')':
        if (groupStack.length === 0) {
          error(regexpStr, 'Unmatched ) at column ' + (i - 1));
        }
        lastGroup = groupStack.pop();

        // check if this group has a PIPE
        // to get back the correct last stack
        last = lastGroup.options ? lastGroup.options[lastGroup.options.length - 1] : lastGroup.stack;
        break;


      // use pipe character to give more choices
      case '|':
        // create array where options are if this is the first PIPE
        // in this clause
        if (!lastGroup.options) {
          lastGroup.options = [lastGroup.stack];
          delete lastGroup.stack;
        }

        // create a new stack and add to options for rest of clause
        var stack = [];
        lastGroup.options.push(stack);
        last = stack;
        break;


      // repetition
      // for every repetition, remove last element from last stack
      // then insert back a RANGE object
      // this design is chosen because there could be more than
      // one repetition symbols in a regex i.e. a?+{2,3}
      case '{':
        var rs = /^(\d+)(,(\d+)?)?\}/.exec(str.slice(i)), min, max;
        if (rs !== null) {
          min = parseInt(rs[1])
          max = rs[2] ? rs[3] ? parseInt(rs[3]) : Infinity : min
          i += rs[0].length;

          last.push({
              type: types.REPETITION
            , min: min
            , max: max
            , value: last.pop()
          });
        } else {
          last.push({
              type: types.CHAR
            , value: 123
          });
        }
        break;

      case '?':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
            type: types.REPETITION
          , min: 0
          , max: 1
          , value: last.pop()
        });
        break;

      case '+':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
            type: types.REPETITION
          , min: 1
          , max: Infinity
          , value: last.pop()
        });
        break;

      case '*':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
            type: types.REPETITION
          , min: 0
          , max: Infinity
          , value: last.pop()
        });
        break;


      // default is a character that is not \[](){}?+*^$
      default:
        last.push({
            type: types.CHAR
          , value: c.charCodeAt(0)
        });
    }

  }


  return start;
};

module.exports.types = types;