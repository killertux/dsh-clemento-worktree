import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export type { WorktreeInjected, WorktreeHeaderProps } from './contract/slots.ts';
/** Required services (cordis fiber inject). */
export declare const inject: string[];
/**
 * Mount the worktree remote and register the header entries.
 * @param ctx - client cordis context.
 * @returns disposer unwinding remote + registrations in reverse order.
 */
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
