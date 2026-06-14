import Foundation

/// Builds prompts by combining the curated library according to the user's
/// settings. Deterministic given a seed, fully offline, no moderation layer.
struct PromptGenerator {

    /// Generate a single prompt from the given settings.
    func generate(from settings: PromptSettings) -> GeneratedPrompt {
        let subject = resolvedSubject(settings.subject)
        var parts: [String] = [subject]

        // How many options to draw per active category, based on intensity.
        let picks: Int
        switch settings.intensity {
        case 0: picks = 1
        case 2: picks = 3
        default: picks = 2
        }

        func add(_ enabled: Bool, _ bank: [String], count: Int = picks) {
            guard enabled else { return }
            parts.append(contentsOf: sample(bank, count: count))
        }

        if settings.mode == .video {
            add(settings.includeMotion, PromptLibrary.motion, count: max(1, picks - 1))
            add(settings.includeCameraMove, PromptLibrary.cameraMoves, count: 1)
        }

        add(settings.includeStyle, PromptLibrary.styles, count: 1)
        add(settings.includeComposition, PromptLibrary.composition)
        add(settings.includeLighting, PromptLibrary.lighting)
        add(settings.includeColor, PromptLibrary.colors, count: 1)
        add(settings.includeMood, PromptLibrary.moods, count: 1)
        add(settings.includeCamera, PromptLibrary.cameras)
        add(settings.includeDetailBoosters, PromptLibrary.detailBoosters)

        if settings.mode == .video {
            parts.append(contentsOf: sample(PromptLibrary.pacing, count: 1))
            if let duration = PromptLibrary.durations.randomElement() {
                parts.append(duration)
            }
        }

        let text = parts
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .joined(separator: ", ")

        return GeneratedPrompt(text: text, mode: settings.mode, subject: subject)
    }

    /// "God Mode": everything maxed, ignores toggles, pure chaos energy.
    func godMode(mode: PromptMode, subject: String) -> GeneratedPrompt {
        var settings = PromptSettings()
        settings.mode = mode
        settings.subject = subject
        settings.intensity = 2
        return generate(from: settings)
    }

    // MARK: - Helpers

    private func resolvedSubject(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return PromptLibrary.subjects.randomElement() ?? "a striking scene"
        }
        return trimmed
    }

    /// Pick `count` unique elements at random.
    private func sample(_ bank: [String], count: Int) -> [String] {
        guard count > 0, !bank.isEmpty else { return [] }
        return Array(bank.shuffled().prefix(count))
    }
}
