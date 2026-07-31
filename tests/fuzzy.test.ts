import {
	FuzzyIndex,
	boundedLevenshtein,
	canonicalKey,
	singularize,
} from "../src/fuzzy";
import {
	assert,
	assertClose,
	assertDeepEqual,
	assertEqual,
	makeRandom,
	run,
	test,
} from "./harness";

/** Textbook full-matrix Levenshtein, used as the reference implementation. */
function naiveLevenshtein(a: string, b: string): number {
	const rows: number[][] = [];
	for (let i = 0; i <= a.length; i++) rows.push(new Array<number>(b.length + 1).fill(0));
	for (let i = 0; i <= a.length; i++) rows[i][0] = i;
	for (let j = 0; j <= b.length; j++) rows[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
		}
	}
	return rows[a.length][b.length];
}

// --- canonical keys -------------------------------------------------------

test("canonicalKey folds case, accents and punctuation", () => {
	assertEqual(canonicalKey("Machine Learning"), "machine learning", "title");
	assertEqual(canonicalKey("machine-learning"), "machine learning", "hyphenated");
	assertEqual(canonicalKey("  MACHINE   LEARNING!  "), "machine learning", "noisy");
	assertEqual(canonicalKey("Café"), "cafe", "precomposed accent");
	assertEqual(canonicalKey("Café"), "cafe", "decomposed accent");
});

test("canonicalKey collapses plurals onto singulars", () => {
	assertEqual(canonicalKey("Neural Networks"), canonicalKey("neural network"), "regular -s");
	assertEqual(canonicalKey("Categories"), canonicalKey("category"), "-ies");
	assertEqual(canonicalKey("Boxes"), canonicalKey("box"), "-es after x");
});

test("singularize is stable when applied twice", () => {
	for (const word of ["notes", "category", "categories", "boxes", "status", "analysis", "css"]) {
		assertEqual(singularize(singularize(word)), singularize(word), `idempotent for ${word}`);
	}
});

test("singularize leaves non-plural endings alone", () => {
	assertEqual(singularize("status"), "status", "-us");
	assertEqual(singularize("analysis"), "analysis", "-is");
	assertEqual(singularize("css"), "css", "-ss");
	assertEqual(singularize("cat"), "cat", "too short to touch");
});

// --- bounded levenshtein --------------------------------------------------

test("boundedLevenshtein matches the naive implementation on known pairs", () => {
	const pairs: [string, string, number][] = [
		["", "", 0],
		["a", "", 1],
		["kitten", "sitting", 3],
		["kubernet", "kubernete", 1],
		["flaw", "lawn", 2],
		["abcdef", "abcdef", 0],
	];
	for (const [a, b, expected] of pairs) {
		assertEqual(boundedLevenshtein(a, b, 10), expected, `d(${a}, ${b})`);
		assertEqual(naiveLevenshtein(a, b), expected, `reference d(${a}, ${b})`);
	}
});

test("boundedLevenshtein agrees with the naive implementation on random strings", () => {
	const rand = makeRandom(20260731);
	const alphabet = "abcdefgh ";
	const pick = (n: number) => {
		let s = "";
		for (let i = 0; i < n; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
		return s;
	};

	for (let trial = 0; trial < 4000; trial++) {
		const a = pick(Math.floor(rand() * 14));
		const b = pick(Math.floor(rand() * 14));
		const expected = naiveLevenshtein(a, b);
		for (let max = 0; max <= 6; max++) {
			const got = boundedLevenshtein(a, b, max);
			if (expected <= max) {
				assertEqual(got, expected, `d(${a}, ${b}) within max=${max}`);
			} else {
				assertEqual(got, max + 1, `d(${a}, ${b}) should exceed max=${max}`);
			}
		}
	}
});

test("boundedLevenshtein is symmetric", () => {
	const rand = makeRandom(7);
	const pick = (n: number) => {
		let s = "";
		for (let i = 0; i < n; i++) s += "abcde"[Math.floor(rand() * 5)];
		return s;
	};
	for (let trial = 0; trial < 500; trial++) {
		const a = pick(Math.floor(rand() * 12));
		const b = pick(Math.floor(rand() * 12));
		assertEqual(
			boundedLevenshtein(a, b, 4),
			boundedLevenshtein(b, a, 4),
			`symmetry for (${a}, ${b})`
		);
	}
});

// --- the index ------------------------------------------------------------

const MAX_EDITS = 3;

function indexOf(titles: string[], threshold: number, minKeyLength = 5): FuzzyIndex<string> {
	const index = new FuzzyIndex<string>({ threshold, minKeyLength, maxEdits: MAX_EDITS });
	for (const t of titles) index.add(t, t);
	return index;
}

test("index matches canonical variants at full strictness", () => {
	const index = indexOf(["Neural Network", "Machine Learning"], 1);
	assertEqual(index.lookup(canonicalKey("neural networks"))?.value, "Neural Network", "plural");
	assertEqual(index.lookup(canonicalKey("MACHINE-LEARNING"))?.value, "Machine Learning", "punct");
	assertEqual(index.lookup(canonicalKey("neural netwrk")), null, "typo rejected at 1.0");
});

test("index admits typos below full strictness", () => {
	const index = indexOf(["Kubernetes"], 0.85);
	const hit = index.lookup(canonicalKey("Kubernets"));
	assert(hit !== null, "expected a match for the misspelling");
	assertEqual(hit?.value, "Kubernetes", "matched value");
	assertClose(hit ? hit.similarity : 0, 1 - 1 / 9, "similarity");
});

test("index reports exact canonical hits as similarity 1", () => {
	const index = indexOf(["Neural Network"], 0.85);
	assertEqual(index.lookup(canonicalKey("neural networks"))?.similarity, 1, "plural is not a typo");
});

test("index ignores keys below the minimum length", () => {
	const index = indexOf(["Cat", "Elephant"], 0.85);
	assertEqual(index.size, 1, "only the long title is indexed");
	assertEqual(index.lookup(canonicalKey("Cat")), null, "short query rejected");
});

test("index keeps the first value added for a canonical key", () => {
	const index = indexOf(["Neural Networks", "neural network"], 0.85);
	assertEqual(index.size, 1, "both titles share one canonical key");
	assertEqual(index.lookup("neural network")?.value, "Neural Networks", "first writer wins");
});

test("the edit cap bounds long near-misses the threshold would otherwise allow", () => {
	// At 0.7 a 30-character key would nominally allow 9 edits; the cap says 3.
	const title = "aaaaaaaaaabbbbbbbbbbcccccccccc";
	const index = indexOf([title], 0.7);
	assertEqual(index.lookup("zzaaaaaaaabbbbbbbbbbcccccccccc")?.value, title, "2 edits match");
	assertEqual(index.lookup("zzzaaaaaaabbbbbbbbbbcccccccccc")?.value, title, "3 edits match");
	assertEqual(index.lookup("zzzzaaaaaabbbbbbbbbbcccccccccc"), null, "4 edits rejected");
});

test("index tracks the widest title in words", () => {
	assertEqual(indexOf(["Alpha", "Alpha Beta Gamma"], 0.85).maxWords, 3, "maxWords");
});

test("repeated lookups are stable", () => {
	const index = indexOf(["Kubernetes", "Kubernetes Operator"], 0.8);
	const key = canonicalKey("Kubernets");
	const first = index.lookup(key);
	for (let i = 0; i < 5; i++) {
		assertDeepEqual(index.lookup(key), first, `lookup ${i} matches the first`);
	}
});

test("pruning never changes the answer a brute-force scan would give", () => {
	const rand = makeRandom(99);
	const alphabet = "abcdefghijklm";
	const word = (n: number) => {
		let s = "";
		for (let i = 0; i < n; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
		return s;
	};

	// 0.8 in particular lands on a rounding boundary: 1 - 0.8 is not 0.2.
	for (const threshold of [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1]) {
		const titles: string[] = [];
		for (let i = 0; i < 300; i++) {
			const words = 1 + Math.floor(rand() * 3);
			const parts: string[] = [];
			for (let w = 0; w < words; w++) parts.push(word(3 + Math.floor(rand() * 8)));
			titles.push(parts.join(" "));
		}

		const index = indexOf(titles, threshold);
		// Mirror what the index itself indexed: canonical, long enough, deduped.
		const keys: string[] = [];
		const seen = new Set<string>();
		for (const t of titles) {
			const k = canonicalKey(t);
			if (k.length < 5 || seen.has(k)) continue;
			seen.add(k);
			keys.push(k);
		}

		for (let q = 0; q < 400; q++) {
			// Half the queries are perturbations of a real title, half are noise,
			// so both the hit and the miss paths get exercised.
			let query: string;
			if (rand() < 0.5) {
				const base = keys[Math.floor(rand() * keys.length)];
				const at = Math.floor(rand() * base.length);
				const roll = rand();
				if (roll < 0.34) query = base.slice(0, at) + base.slice(at + 1);
				else if (roll < 0.67) query = base.slice(0, at) + word(1) + base.slice(at);
				else query = base.slice(0, at) + word(1) + base.slice(at + 1);
			} else {
				query = word(3 + Math.floor(rand() * 10));
			}
			if (query.length < 5) continue;

			let expectedKey: string | null = null;
			let expectedSim = 0;
			for (const k of keys) {
				const maxLen = Math.max(k.length, query.length);
				const d = naiveLevenshtein(query, k);
				if (d > MAX_EDITS) continue;
				const sim = 1 - d / maxLen;
				if (sim < threshold) continue;
				if (expectedKey === null || sim > expectedSim || (sim === expectedSim && k < expectedKey)) {
					expectedKey = k;
					expectedSim = sim;
				}
			}

			const got = index.lookup(query);
			if (expectedKey === null) {
				assertEqual(got, null, `t=${threshold} query=${query} should miss`);
			} else {
				assert(got !== null, `t=${threshold} query=${query} should hit ${expectedKey}`);
				assertClose(got ? got.similarity : -1, expectedSim, `t=${threshold} query=${query} sim`);
				assertEqual(
					got ? canonicalKey(got.value) : null,
					expectedKey,
					`t=${threshold} query=${query} winner`
				);
			}
		}
	}
});

export default run;
