/**
 * A test harness small enough not to need a dependency. Test files register
 * cases at import time and export `run` as their default; `scripts/test.mjs`
 * bundles each file and awaits it.
 */

type TestFn = () => void | Promise<void>;

interface Case {
	name: string;
	fn: TestFn;
}

const cases: Case[] = [];

export function test(name: string, fn: TestFn): void {
	cases.push({ name, fn });
}

function show(value: unknown): string {
	if (typeof value === "string") return JSON.stringify(value);
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

export function assert(condition: unknown, message: string): void {
	if (!condition) throw new Error(message);
}

export function assertEqual(actual: unknown, expected: unknown, message: string): void {
	if (!Object.is(actual, expected)) {
		throw new Error(`${message}\n  expected: ${show(expected)}\n  actual:   ${show(actual)}`);
	}
}

export function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
	const a = show(actual);
	const b = show(expected);
	if (a !== b) throw new Error(`${message}\n  expected: ${b}\n  actual:   ${a}`);
}

export function assertClose(actual: number, expected: number, message: string): void {
	if (Math.abs(actual - expected) > 1e-9) {
		throw new Error(`${message}\n  expected: ${expected}\n  actual:   ${actual}`);
	}
}

/** Deterministic PRNG, so a randomised failure can always be reproduced. */
export function makeRandom(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export async function run(): Promise<number> {
	let failed = 0;
	for (const c of cases) {
		try {
			await c.fn();
			console.log(`  ✓ ${c.name}`);
		} catch (e) {
			failed++;
			const detail = e instanceof Error ? e.message : String(e);
			console.log(`  ✗ ${c.name}`);
			console.log(`      ${detail.split("\n").join("\n      ")}`);
		}
	}
	return failed;
}
