(function (global) {
  'use strict';

  class CalcError extends Error {}

  const CONSTANTS = Object.freeze({
    pi: Math.PI,
    e: Math.E,
    tau: Math.PI * 2
  });

  function toRadians(value, angle) {
    return angle === 'DEG' ? (value * Math.PI) / 180 : value;
  }

  function fromRadians(value, angle) {
    return angle === 'DEG' ? (value * 180) / Math.PI : value;
  }

  function snapTrig(value) {
    return Math.abs(value) < 1e-12 ? 0 : value;
  }

  function factorial(value) {
    if (!Number.isFinite(value)) throw new CalcError('Undefined factorial');
    if (value < 0) throw new CalcError('Factorial of a negative number');
    if (!Number.isInteger(value)) throw new CalcError('Factorial needs a whole number');
    if (value > 170) throw new CalcError('Number too large');
    let total = 1;
    for (let i = 2; i <= value; i += 1) total *= i;
    return total;
  }

  function applyFunction(name, value, ctx) {
    switch (name) {
      case 'sin':
        return snapTrig(Math.sin(toRadians(value, ctx.angle)));
      case 'cos':
        return snapTrig(Math.cos(toRadians(value, ctx.angle)));
      case 'tan': {
        const angle = toRadians(value, ctx.angle);
        if (Math.abs(Math.cos(angle)) < 1e-12) throw new CalcError('Tangent is undefined here');
        return snapTrig(Math.tan(angle));
      }
      case 'asin':
        if (value < -1 || value > 1) throw new CalcError('Inverse sine needs a value from -1 to 1');
        return fromRadians(Math.asin(value), ctx.angle);
      case 'acos':
        if (value < -1 || value > 1) throw new CalcError('Inverse cosine needs a value from -1 to 1');
        return fromRadians(Math.acos(value), ctx.angle);
      case 'atan':
        return fromRadians(Math.atan(value), ctx.angle);
      case 'sinh':
        return Math.sinh(value);
      case 'cosh':
        return Math.cosh(value);
      case 'tanh':
        return Math.tanh(value);
      case 'asinh':
        return Math.asinh(value);
      case 'acosh':
        if (value < 1) throw new CalcError('Inverse cosh needs a value of at least 1');
        return Math.acosh(value);
      case 'atanh':
        if (value <= -1 || value >= 1) throw new CalcError('Inverse tanh needs a value between -1 and 1');
        return Math.atanh(value);
      case 'sqrt':
        if (value < 0) throw new CalcError('Square root of a negative number');
        return Math.sqrt(value);
      case 'cbrt':
        return Math.cbrt(value);
      case 'ln':
        if (value <= 0) throw new CalcError('Logarithm needs a positive number');
        return Math.log(value);
      case 'log':
      case 'log10':
        if (value <= 0) throw new CalcError('Logarithm needs a positive number');
        return Math.log10(value);
      case 'log2':
        if (value <= 0) throw new CalcError('Logarithm needs a positive number');
        return Math.log2(value);
      case 'inv':
        if (value === 0) throw new CalcError('Cannot divide by zero');
        return 1 / value;
      case 'abs':
        return Math.abs(value);
      case 'exp':
        return Math.exp(value);
      case 'floor':
        return Math.floor(value);
      case 'ceil':
        return Math.ceil(value);
      case 'round':
        return Math.round(value);
      case 'trunc':
        return Math.trunc(value);
      case 'sign':
        return Math.sign(value);
      default:
        throw new CalcError('Unknown function');
    }
  }

  function tokenize(source) {
    const input = source
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/[−–—]/g, '-')
      .replace(/π/g, 'pi')
      .replace(/√/g, 'sqrt');

    const tokens = [];
    let i = 0;

    while (i < input.length) {
      const ch = input[i];

      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }

      if (/[0-9.]/.test(ch)) {
        let j = i;
        let dots = 0;
        while (j < input.length && /[0-9.]/.test(input[j])) {
          if (input[j] === '.') dots += 1;
          j += 1;
        }
        if (dots > 1) throw new CalcError('Malformed number');

        if (input[j] === 'e' || input[j] === 'E') {
          let k = j + 1;
          if (input[k] === '+' || input[k] === '-') k += 1;
          if (/[0-9]/.test(input[k] || '')) {
            while (k < input.length && /[0-9]/.test(input[k])) k += 1;
            j = k;
          }
        }

        const raw = input.slice(i, j);
        const value = Number(raw);
        if (!Number.isFinite(value)) throw new CalcError('Malformed number');

        tokens.push({ type: 'number', value });
        i = j;
        continue;
      }

      if (/[a-zA-Z]/.test(ch)) {
        let j = i;
        while (j < input.length && /[a-zA-Z]/.test(input[j])) j += 1;
        let name = input.slice(i, j).toLowerCase();
        if (name === 'log' && input[j] === '2') {
          name = 'log2';
          j += 1;
        }
        tokens.push({ type: 'name', value: name });
        i = j;
        continue;
      }

      if ('+-*/^%!()'.includes(ch)) {
        tokens.push({ type: 'symbol', value: ch });
        i += 1;
        continue;
      }

      throw new CalcError('Unexpected character');
    }

    return tokens;
  }

  function parseTokens(tokens, ctx) {
    let pos = 0;

    const peek = () => tokens[pos];
    const next = () => tokens[pos++];

    const expect = (symbol) => {
      const token = tokens[pos];
      if (!token || token.type !== 'symbol' || token.value !== symbol) {
        throw new CalcError(`Missing "${symbol}"`);
      }
      pos += 1;
    };

    const startsPrimary = (token) =>
      Boolean(token) &&
      (token.type === 'number' ||
        (token.type === 'name' && token.value !== 'mod') ||
        (token.type === 'symbol' && token.value === '('));

    function parseExpression() {
      let value = parseTerm();
      while (peek() && peek().type === 'symbol' && (peek().value === '+' || peek().value === '-')) {
        const operator = next().value;
        const right = parseTerm();
        value = operator === '+' ? value + right : value - right;
      }
      return value;
    }

    function parseTerm() {
      let value = parseUnary();
      for (;;) {
        const token = peek();
        if (!token) break;

        if (token.type === 'symbol' && (token.value === '*' || token.value === '/')) {
          next();
          const right = parseUnary();
          if (token.value === '/') {
            if (right === 0) throw new CalcError('Cannot divide by zero');
            value /= right;
          } else {
            value *= right;
          }
          continue;
        }

        if (token.type === 'name' && token.value === 'mod') {
          next();
          const right = parseUnary();
          if (right === 0) throw new CalcError('Cannot divide by zero');
          value %= right;
          continue;
        }

        if (startsPrimary(token)) {
          value *= parseUnary();
          continue;
        }

        break;
      }
      return value;
    }

    function parseUnary() {
      const token = peek();
      if (token && token.type === 'symbol' && (token.value === '-' || token.value === '+')) {
        next();
        const value = parseUnary();
        return token.value === '-' ? -value : value;
      }
      return parsePower();
    }

    function parsePower() {
      const base = parsePostfix();
      if (peek() && peek().type === 'symbol' && peek().value === '^') {
        next();
        const exponent = parseUnary();
        const result = Math.pow(base, exponent);
        if (Number.isNaN(result)) throw new CalcError('Undefined power');
        return result;
      }
      return base;
    }

    function parsePostfix() {
      let value = parsePrimary();
      while (peek() && peek().type === 'symbol' && (peek().value === '!' || peek().value === '%')) {
        const operator = next().value;
        value = operator === '!' ? factorial(value) : value / 100;
      }
      return value;
    }

    function parsePrimary() {
      const token = next();
      if (!token) throw new CalcError('Incomplete expression');

      if (token.type === 'number') return token.value;

      if (token.type === 'symbol' && token.value === '(') {
        const value = parseExpression();
        expect(')');
        return value;
      }

      if (token.type === 'name') {
        const name = token.value;
        if (name === 'ans') return ctx.ans;
        if (name === 'mem') return ctx.memory;
        if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return CONSTANTS[name];
        const argument = parsePrimary();
        return applyFunction(name, argument, ctx);
      }

      throw new CalcError('Unexpected symbol');
    }

    const value = parseExpression();
    if (pos < tokens.length) throw new CalcError('Unexpected input');
    return value;
  }

  function evaluate(expression, context) {
    const ctx = {
      angle: context && context.angle === 'RAD' ? 'RAD' : 'DEG',
      ans: context && Number.isFinite(context.ans) ? context.ans : 0,
      memory: context && Number.isFinite(context.memory) ? context.memory : 0
    };

    const tokens = tokenize(expression);
    if (tokens.length === 0) throw new CalcError('Empty expression');

    const value = parseTokens(tokens, ctx);
    if (Number.isNaN(value)) throw new CalcError('Undefined result');
    return value;
  }

  function formatNumber(value) {
    if (Number.isNaN(value)) return 'Error';
    if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
    if (value === 0) return '0';

    const abs = Math.abs(value);
    if (abs >= 1e12 || abs < 1e-9) {
      return value.toExponential(8).replace(/\.?0+(e)/, '$1');
    }

    return String(Number.parseFloat(value.toPrecision(12)));
  }

  global.Calc = { evaluate, formatNumber, CalcError };
})(typeof window !== 'undefined' ? window : globalThis);
