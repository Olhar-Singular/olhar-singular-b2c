/**
 * no-sync-effect
 *
 * Flags useEffect bodies that synchronously propagate state upward or laterally
 * — the class of bug that produced the cursor-jumping regression fixed in the
 * Phase 3 wizard refactor. The root cause: effects reacting to parent-owned
 * state by calling back into the parent create feedback loops React cannot
 * reconcile.
 *
 * Rejected patterns inside a useEffect callback:
 *   - Call to a prop that looks like a callback: onFoo, onChange, onNext, ...
 *   - Call to updateData (the wizard state mutator, by convention)
 *
 * Explicitly NOT flagged:
 *   - Local useState setters (setX where [x, setX] = useState) — these are
 *     legitimate in async-load effects and don't cross the parent boundary.
 *   - setTimeout/setInterval — timers, not state.
 *
 * Escape hatch: `// eslint-disable-next-line local/no-sync-effect` with a
 * comment explaining why (e.g., one-shot mount effect seeding).
 */

function isEffectHook(callee) {
  if (!callee) return false;
  if (callee.type === "Identifier") {
    return callee.name === "useEffect" || callee.name === "useLayoutEffect";
  }
  if (callee.type === "MemberExpression" && callee.property?.type === "Identifier") {
    return (
      callee.property.name === "useEffect" ||
      callee.property.name === "useLayoutEffect"
    );
  }
  return false;
}

function classifyCallee(name) {
  if (!name || typeof name !== "string") return null;
  if (name === "updateData") return "wizard-state";
  if (/^on[A-Z]/.test(name)) return "callback-prop";
  return null;
}

function messageFor(kind, name) {
  if (kind === "wizard-state") {
    return `Evite chamar \`${name}\` dentro de useEffect. Propague estado via handlers do usuário (onClick, onChange) ou derive durante render. Efeitos sincronizantes reintroduzem o bug de corrida que o refactor de fev/abr eliminou.`;
  }
  return `Evite chamar a prop \`${name}\` dentro de useEffect. Callbacks de pai devem disparar por interação direta, não por reação a mudanças de estado — isso cria loops de render difíceis de rastrear.`;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow synchronous state propagation inside useEffect (calling parent callbacks, updateData, or setters)",
    },
    schema: [],
    messages: {
      syncEffect: "{{detail}}",
    },
  },
  create(context) {
    const effectStack = [];

    function enterEffectCallback(callbackNode) {
      effectStack.push(callbackNode);
    }
    function exitEffectCallback() {
      effectStack.pop();
    }

    function insideEffect() {
      return effectStack.length > 0;
    }

    return {
      CallExpression(node) {
        // Detect entry: useEffect(() => {...}, deps)
        if (isEffectHook(node.callee) && node.arguments.length > 0) {
          const cb = node.arguments[0];
          if (cb.type === "ArrowFunctionExpression" || cb.type === "FunctionExpression") {
            enterEffectCallback(cb);
          }
        }

        // Check the call itself when inside an effect
        if (insideEffect() && node.callee.type === "Identifier") {
          const kind = classifyCallee(node.callee.name);
          if (kind) {
            context.report({
              node,
              messageId: "syncEffect",
              data: { detail: messageFor(kind, node.callee.name) },
            });
          }
        }
      },
      "CallExpression:exit"(node) {
        if (isEffectHook(node.callee) && node.arguments.length > 0) {
          const cb = node.arguments[0];
          if (
            (cb.type === "ArrowFunctionExpression" || cb.type === "FunctionExpression") &&
            effectStack[effectStack.length - 1] === cb
          ) {
            exitEffectCallback();
          }
        }
      },
    };
  },
};

export default {
  rules: {
    "no-sync-effect": rule,
  },
};
