export const BOT_COMMUNICATION_POLICY: string;
export function friendlyComponent(component?: string): string;
export function technicalDetailsRequested(prompt?: string): boolean;
export function hasTechnicalLanguage(text?: string): boolean;
export function humanIncident(incident?: any): string;
export function incidentRecords(data: any): any[];
export function humanSourceSummary(data: any): string;
export function communicationSafe(text: string, sources?: any[], technical?: boolean): boolean;
export function humanFallback(sources?: any[]): string;
