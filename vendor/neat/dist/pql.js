import { MissingPartError, calculationId, invokeCalculation, readPart, writePart, } from "./pxc.js";
export function part(address) {
    return { kind: "part", address };
}
/** Programmatic constructor for the existing `call/with/args/into` shape. */
export function call(calculation, withOrArgs, into) {
    if (withOrArgs !== undefined && withOrArgs !== null && typeof withOrArgs === "object" &&
        !Array.isArray(withOrArgs) && !isPartReference(withOrArgs)) {
        return { call: calculation, with: withOrArgs, into };
    }
    return { call: calculation, args: withOrArgs, into };
}
export function tick(name, calculations) {
    if (!name.trim())
        throw new Error("Tick identity cannot be empty");
    return { name, Calculations: [...calculations] };
}
export function program(PrincipleComponentRender, Ticks) {
    if (!PrincipleComponentRender.trim())
        throw new Error("PrincipleComponentRender identity cannot be empty");
    const ids = new Set();
    Ticks.forEach((item) => {
        if (ids.has(item.name))
            throw new Error(`Duplicate Tick identity: ${item.name}`);
        ids.add(item.name);
    });
    return { PrincipleComponentRender, Ticks: [...Ticks] };
}
function isPartReference(value) {
    return !!value && typeof value === "object" && value.kind === "part" &&
        typeof value.address === "string";
}
function resolveValue(pxc, value, stringsAsParts = false) {
    if (isPartReference(value))
        return readPart(pxc, value.address);
    // In ChainSpot's `with` form, values name Parts directly (for example
    // `px.neat.items`). Positional `args` retain ordinary literal strings.
    if (stringsAsParts && typeof value === "string")
        return readPart(pxc, value);
    if (Array.isArray(value)) {
        let current = pxc;
        const result = value.map((item) => {
            const resolved = resolveValue(current, item, stringsAsParts);
            current = resolved.pxc;
            return resolved.value;
        });
        return { pxc: current, value: result };
    }
    if (value && typeof value === "object") {
        let current = pxc;
        const result = {};
        Object.keys(value).forEach((key) => {
            const resolved = resolveValue(current, value[key], stringsAsParts);
            current = resolved.pxc;
            result[key] = resolved.value;
        });
        return { pxc: current, value: result };
    }
    return { pxc, value };
}
function combinedInput(pxc, step) {
    if (step.with === undefined)
        return resolveValue(pxc, step.args, false);
    const bound = resolveValue(pxc, step.with, true);
    if (step.args === undefined)
        return bound;
    if (!step.args || typeof step.args !== "object" || Array.isArray(step.args)) {
        throw new Error(`Calculation ${step.call}: args must be a mapping when with is present`);
    }
    const literals = step.args;
    for (const name of Object.keys(literals)) {
        if (Object.hasOwn(bound.value, name)) {
            throw new Error(`Calculation ${step.call}: '${name}' appears in both with and args`);
        }
    }
    return { pxc: bound.pxc, value: { ...bound.value, ...literals } };
}
export function runPql(initial, query) {
    let current = initial;
    const results = [];
    for (const definition of query.Ticks) {
        const calculations = [];
        const materializations = [];
        let tickError;
        for (const step of definition.Calculations) {
            try {
                const resolved = combinedInput(current, step);
                current = resolved.pxc;
                const result = invokeCalculation(current, calculationId(String(step.call)), resolved.value);
                current = result.pxc;
                calculations.push({
                    calculation: result.invocation.id,
                    value: result.value,
                    into: step.into,
                    status: result.invocation.status,
                });
                if (result.error) {
                    tickError = result.error;
                    break;
                }
                if (step.into) {
                    current = writePart(current, step.into, result.value);
                    materializations.push({ address: step.into, value: result.value });
                }
            }
            catch (error) {
                if (error instanceof MissingPartError)
                    current = error.pxc;
                tickError = error;
                break;
            }
        }
        results.push({
            id: definition.name,
            status: tickError ? "failed" : "completed",
            calculations,
            materializations,
            ...(tickError ? { error: tickError } : {}),
        });
        if (tickError) {
            return {
                programId: query.PrincipleComponentRender,
                status: "failed",
                ticks: results,
                pxc: current,
                telemetry: current.telemetry,
                error: tickError,
            };
        }
    }
    return {
        programId: query.PrincipleComponentRender,
        status: "completed",
        ticks: results,
        pxc: current,
        telemetry: current.telemetry,
    };
}
export const composePql = program;
export const executePql = runPql;
export const defineProgram = program;
export const defineTick = tick;
export const partRef = part;
export const invoke = call;
