import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'ws_' });

export const connectionsGauge = new client.Gauge({ name: 'ws_connections', help: 'Open WebSocket connections on this instance', registers: [registry] });
export const frameCounter = new client.Counter({ name: 'ws_frames_received_total', help: 'Client frames by type', labelNames: ['type'] as const, registers: [registry] });
export const rejectedCounter = new client.Counter({ name: 'ws_connections_rejected_total', help: 'Rejected upgrade attempts', labelNames: ['reason'] as const, registers: [registry] });
export const broadcastCounter = new client.Counter({ name: 'ws_broadcasts_delivered_total', help: 'Frames delivered to local sockets from Redis', registers: [registry] });
