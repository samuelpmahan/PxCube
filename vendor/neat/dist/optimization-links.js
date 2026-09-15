/**
 * Additive references for neat work/evidence. The reusable store is JSON and
 * remains advisory; neat's existing item schema and board are unchanged.
 */
export function optimizationReference(id, reason) {
    return { id, ...(reason ? { reason } : {}) };
}
