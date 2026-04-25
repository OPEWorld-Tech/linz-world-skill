"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSession = runSession;
const promises_1 = require("node:timers/promises");
const nats_client_1 = require("../clients/nats-client");
function normalizeSubjects(subjects) {
    return [...new Set((subjects ?? []).map(String).filter(Boolean))];
}
function resolveEventType(payload) {
    if (!payload || typeof payload !== "object") {
        return "";
    }
    return String(payload.event_type ?? payload.eventType ?? "");
}
async function runSession(options) {
    const client = options.client ?? new nats_client_1.NatsClient(options.nats_url);
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 60_000;
    const reconnectDelayMs = options.reconnectDelayMs ?? 500;
    const heartbeatSubject = options.heartbeatSubject ?? "sys.heartbeat";
    const refreshEventType = options.refreshEventType ?? "wsp.sys.subject.changed";
    const signal = options.signal;
    const maxRuntimeMs = options.maxRuntimeMs ?? Number.POSITIVE_INFINITY;
    const startedAt = Date.now();
    let stopRequested = false;
    let sessionError = null;
    let reconnectCount = 0;
    let activeSubjects = normalizeSubjects(options.subjects);
    let unsubscribers = [];
    let controlChain = Promise.resolve();
    const isStopped = () => stopRequested || signal?.aborted === true || Date.now() - startedAt >= maxRuntimeMs;
    const cleanupSubscriptions = () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        unsubscribers = [];
    };
    const stopWithError = (error) => {
        stopRequested = true;
        if (!sessionError) {
            sessionError = error instanceof Error ? error : new Error(String(error));
        }
    };
    const subscribeSubjects = (subjects) => {
        cleanupSubscriptions();
        activeSubjects = normalizeSubjects(subjects);
        unsubscribers = activeSubjects.map((subject) => client.subscribe(subject, (payload) => {
            options.onMessage?.(subject, payload);
            if (resolveEventType(payload) === refreshEventType) {
                controlChain = controlChain
                    .then(async () => {
                    await refreshAuthorizationView("subject_changed");
                })
                    .catch((error) => {
                    stopWithError(error);
                });
            }
        }));
    };
    const refreshAuthorizationView = async (reason) => {
        if (!options.refreshAuthorizationView) {
            return activeSubjects;
        }
        const refreshedView = await options.refreshAuthorizationView(reason);
        const nextSubjects = normalizeSubjects(refreshedView?.allowedSubjects ?? activeSubjects);
        if (options.validateAuthorization) {
            const isValid = await options.validateAuthorization(refreshedView, reason);
            if (!isValid) {
                stopRequested = true;
                await options.onAuthorizationInvalid?.(reason);
                return activeSubjects;
            }
        }
        subscribeSubjects(nextSubjects);
        await options.onSubjectsChanged?.(nextSubjects, reason, refreshedView ?? null);
        return nextSubjects;
    };
    const recoverConnection = async () => {
        reconnectCount += 1;
        await (0, promises_1.setTimeout)(reconnectDelayMs);
        await client.reconnect();
        await refreshAuthorizationView("reconnect");
        await options.onReconnect?.(reconnectCount, activeSubjects);
    };
    await client.connect();
    subscribeSubjects(activeSubjects);
    await options.onStarted?.(activeSubjects);
    try {
        while (!isStopped()) {
            try {
                await client.publish(heartbeatSubject, {
                    ...options.heartbeatPayload,
                    emittedAt: new Date().toISOString()
                });
                await options.onHeartbeat?.();
            }
            catch (error) {
                await recoverConnection();
                if (sessionError) {
                    break;
                }
                continue;
            }
            await (0, promises_1.setTimeout)(heartbeatIntervalMs);
            await controlChain;
        }
    }
    finally {
        cleanupSubscriptions();
        await client.disconnect();
        await options.onStopped?.();
    }
    if (sessionError) {
        throw sessionError;
    }
    return {
        online: false,
        reconnectCount,
        subjects: activeSubjects
    };
}
