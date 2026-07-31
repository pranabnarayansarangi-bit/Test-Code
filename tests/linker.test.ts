import { EdgeSuggestion, LinkEngine } from "../src/linker";
import { assert, assertDeepEqual, assertEqual, run, test } from "./harness";
import { FakeNote, makeVault, settings } from "./vault";
import { GraphDeclutterSettings } from "../src/settings";

const FUZZY = { linkFuzzy: true } as Partial<GraphDeclutterSettings>;

async function scan(
	notes: FakeNote[],
	overrides: Partial<GraphDeclutterSettings> = {}
): Promise<EdgeSuggestion[]> {
	const vault = makeVault(notes);
	const engine = new LinkEngine(vault.app, settings(overrides));
	return engine.scan();
}

async function scanAndApply(
	notes: FakeNote[],
	overrides: Partial<GraphDeclutterSettings> = {}
): Promise<Map<string, string>> {
	const vault = makeVault(notes);
	const engine = new LinkEngine(vault.app, settings(overrides));
	const suggestions = await engine.scan();
	await engine.apply(suggestions);
	return vault.contents;
}

/** Compact "source → [[target|text]]" form, for readable assertions. */
function describe(suggestions: EdgeSuggestion[]): string[] {
	return suggestions.map(
		(s) =>
			`${s.file.basename} → ${s.target}` +
			`|${s.matchedText}${s.fuzzy ? ` ~${Math.round(s.similarity * 100)}` : ""}`
	);
}

// --- the literal pass is untouched ---------------------------------------

test("exact mentions still link with fuzzy off", async () => {
	const found = await scan([
		{ path: "Machine Learning.md", content: "About models." },
		{ path: "Notes.md", content: "I read about Machine Learning today." },
	]);
	assertDeepEqual(describe(found), ["Notes → Machine Learning|Machine Learning"], "suggestions");
	assertEqual(found[0].fuzzy, false, "not flagged fuzzy");
});

test("fuzzy is off by default", async () => {
	const found = await scan([
		{ path: "Neural Network.md", content: "About models." },
		{ path: "Notes.md", content: "I like neural networks a lot." },
	]);
	assertDeepEqual(describe(found), [], "no suggestions without opting in");
});

// --- canonical-variant matching -------------------------------------------

test("fuzzy links a plural mention to a singular title", async () => {
	const found = await scan(
		[
			{ path: "Neural Network.md", content: "About models." },
			{ path: "Notes.md", content: "I like neural networks a lot." },
		],
		FUZZY
	);
	assertDeepEqual(describe(found), ["Notes → Neural Network|neural networks ~100"], "suggestions");
	assertEqual(found[0].fuzzy, true, "flagged fuzzy");
});

test("fuzzy links across punctuation and casing", async () => {
	const found = await scan(
		[
			{ path: "Machine Learning.md", content: "About models." },
			{ path: "Notes.md", content: "Reading up on machine-learning now." },
		],
		FUZZY
	);
	assertDeepEqual(describe(found), ["Notes → Machine Learning|machine-learning ~100"], "suggestions");
});

test("fuzzy links across accents", async () => {
	const found = await scan(
		[
			{ path: "Café Culture.md", content: "About coffee." },
			{ path: "Notes.md", content: "A piece on cafe culture in Vienna." },
		],
		FUZZY
	);
	assertDeepEqual(describe(found), ["Notes → Café Culture|cafe culture ~100"], "suggestions");
});

test("fuzzy matches frontmatter aliases too", async () => {
	// Misspelled, so the case-insensitive literal pass cannot claim it first.
	const found = await scan(
		[
			{ path: "K8s.md", content: "About orchestration.", aliases: ["Kubernetes"] },
			{ path: "Notes.md", content: "Deploying with Kubernets here." },
		],
		FUZZY
	);
	assertDeepEqual(describe(found), ["Notes → K8s|Kubernets ~89"], "suggestions");
	assertEqual(found[0].fuzzy, true, "flagged fuzzy");
});

// --- typo matching --------------------------------------------------------

test("fuzzy links an outright misspelling", async () => {
	const found = await scan(
		[
			{ path: "Kubernetes.md", content: "About orchestration." },
			{ path: "Notes.md", content: "We run Kubernets in production." },
		],
		FUZZY
	);
	assertDeepEqual(describe(found), ["Notes → Kubernetes|Kubernets ~89"], "suggestions");
});

test("a threshold of 1 keeps variants but drops misspellings", async () => {
	const notes: FakeNote[] = [
		{ path: "Kubernetes.md", content: "About orchestration." },
		{ path: "Neural Network.md", content: "About models." },
		{ path: "Notes.md", content: "We run Kubernets beside neural networks." },
	];
	const strict = await scan(notes, { linkFuzzy: true, linkFuzzyThreshold: 1 });
	assertDeepEqual(
		describe(strict),
		["Notes → Neural Network|neural networks ~100"],
		"only the plural survives"
	);
});

test("short titles are never matched approximately", async () => {
	const found = await scan(
		[
			{ path: "Rust.md", content: "About the language." },
			{ path: "Notes.md", content: "There was rest on the beam." },
		],
		{ linkFuzzy: true, linkFuzzyThreshold: 0.7, linkMinTitleLength: 3 }
	);
	assertDeepEqual(describe(found), [], "no four-letter near-misses");
});

// --- interaction with the rest of the engine ------------------------------

test("fuzzy never links inside code, existing links or URLs", async () => {
	const content = [
		"```",
		"neural networks",
		"```",
		"`neural networks`",
		"[[Neural Network]] already linked",
		"https://example.com/neural-networks",
		"[neural networks](https://example.com)",
	].join("\n");
	const found = await scan(
		[
			{ path: "Neural Network.md", content: "About models." },
			{ path: "Notes.md", content },
		],
		FUZZY
	);
	assertDeepEqual(describe(found), [], "every mention is protected");
});

test("a literal match wins over an approximate one for the same note", async () => {
	const found = await scan(
		[
			{ path: "Neural Network.md", content: "About models." },
			{ path: "Notes.md", content: "First neural networks, then Neural Network." },
		],
		FUZZY
	);
	assertDeepEqual(
		describe(found),
		["Notes → Neural Network|Neural Network"],
		"the exact mention is the one linked"
	);
});

test("the longest matching phrase wins", async () => {
	const found = await scan(
		[
			{ path: "Learning.md", content: "About study." },
			{ path: "Machine Learning.md", content: "About models." },
			{ path: "Notes.md", content: "Notes on machine-learnings today." },
		],
		FUZZY
	);
	assertDeepEqual(
		describe(found),
		["Notes → Machine Learning|machine-learnings ~100"],
		"the two-word title beats the one-word title"
	);
});

test("a note never links to itself", async () => {
	const found = await scan(
		[{ path: "Neural Network.md", content: "All about neural networks." }],
		FUZZY
	);
	assertDeepEqual(describe(found), [], "self-mention ignored");
});

test("only one edge per note pair", async () => {
	const found = await scan(
		[
			{ path: "Neural Network.md", content: "About models." },
			{ path: "Notes.md", content: "neural networks, then neural network again." },
		],
		FUZZY
	);
	assertEqual(found.length, 1, "one suggestion");
});

test("the per-note cap counts literal and approximate matches together", async () => {
	const found = await scan(
		[
			{ path: "Alpha Topic.md", content: "x" },
			{ path: "Beta Topic.md", content: "x" },
			{ path: "Gamma Topic.md", content: "x" },
			{ path: "Notes.md", content: "Alpha Topic, beta topics, gamma topics." },
		],
		{ linkFuzzy: true, linkMaxPerNote: 2 }
	);
	assertEqual(found.length, 2, "capped at two");
	assertEqual(found.filter((s) => !s.fuzzy).length, 1, "the literal match is kept");
});

test("spans that would break a wikilink are skipped", async () => {
	const found = await scan(
		[
			{ path: "Machine Learning.md", content: "About models." },
			{ path: "Notes.md", content: "A table cell: | machine | learning | here." },
		],
		FUZZY
	);
	assert(
		found.every((s) => !s.matchedText.includes("|")),
		`no suggestion may span a pipe, got ${JSON.stringify(describe(found))}`
	);
});

test("suggestions report the line they were found on", async () => {
	const found = await scan(
		[
			{ path: "Neural Network.md", content: "About models." },
			{ path: "Notes.md", content: "one\ntwo\nabout neural networks\nfour" },
		],
		FUZZY
	);
	assertEqual(found[0].line, 3, "line number");
});

// --- applying -------------------------------------------------------------

test("applying a fuzzy suggestion writes an aliased wikilink", async () => {
	const contents = await scanAndApply(
		[
			{ path: "Neural Network.md", content: "About models." },
			{ path: "Notes.md", content: "I like neural networks a lot." },
		],
		FUZZY
	);
	assertEqual(
		contents.get("Notes.md"),
		"I like [[Neural Network|neural networks]] a lot.",
		"rewritten note"
	);
});

test("applying a subset leaves the other mentions alone", async () => {
	const vault = makeVault([
		{ path: "Neural Network.md", content: "About models." },
		{ path: "Machine Learning.md", content: "About models." },
		{ path: "Notes.md", content: "Both neural networks and machine-learning matter." },
	]);
	const engine = new LinkEngine(vault.app, settings(FUZZY));
	const found = await engine.scan();
	assertEqual(found.length, 2, "two suggestions offered");

	const chosen = found.filter((s) => s.target === "Machine Learning");
	await engine.apply(chosen);
	assertEqual(
		vault.contents.get("Notes.md"),
		"Both neural networks and [[Machine Learning|machine-learning]] matter.",
		"only the accepted edge is inserted"
	);
});

test("applying several edges to one note keeps every offset valid", async () => {
	const contents = await scanAndApply(
		[
			{ path: "Neural Network.md", content: "x" },
			{ path: "Machine Learning.md", content: "x" },
			{ path: "Gradient Descent.md", content: "x" },
			{
				path: "Notes.md",
				content: "neural networks, machine-learnings and gradient descents.",
			},
		],
		FUZZY
	);
	assertEqual(
		contents.get("Notes.md"),
		"[[Neural Network|neural networks]], [[Machine Learning|machine-learnings]] and " +
			"[[Gradient Descent|gradient descents]].",
		"all three inserted"
	);
});

test("applying is idempotent — a second run finds nothing new", async () => {
	const vault = makeVault([
		{ path: "Neural Network.md", content: "About models." },
		{ path: "Notes.md", content: "I like neural networks a lot." },
	]);
	const engine = new LinkEngine(vault.app, settings(FUZZY));
	await engine.apply(await engine.scan());
	const after = vault.contents.get("Notes.md");
	await engine.apply(await engine.scan());
	assertEqual(vault.contents.get("Notes.md"), after, "second run is a no-op");
});

export default run;
