import Foundation
import Combine

/// Persists generated prompts locally as JSON in the app's Documents directory.
/// No network, no cloud, no account — everything stays on the device.
@MainActor
final class PromptStore: ObservableObject {
    @Published private(set) var history: [GeneratedPrompt] = []

    private let fileURL: URL
    private let maxHistory = 200

    var favorites: [GeneratedPrompt] {
        history.filter { $0.isFavorite }
    }

    init(filename: String = "promptgod_history.json") {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        self.fileURL = docs.appendingPathComponent(filename)
        load()
    }

    func add(_ prompt: GeneratedPrompt) {
        history.insert(prompt, at: 0)
        if history.count > maxHistory {
            // Keep favorites even past the cap; trim the oldest non-favorites.
            let favs = history.filter { $0.isFavorite }
            let rest = history.filter { !$0.isFavorite }.prefix(maxHistory - favs.count)
            history = (favs + rest).sorted { $0.createdAt > $1.createdAt }
        }
        save()
    }

    func toggleFavorite(_ prompt: GeneratedPrompt) {
        guard let idx = history.firstIndex(where: { $0.id == prompt.id }) else { return }
        history[idx].isFavorite.toggle()
        save()
    }

    func delete(_ prompt: GeneratedPrompt) {
        history.removeAll { $0.id == prompt.id }
        save()
    }

    func clearAll() {
        history.removeAll()
        save()
    }

    // MARK: - Persistence

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        if let decoded = try? JSONDecoder().decode([GeneratedPrompt].self, from: data) {
            history = decoded
        }
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(history) else { return }
        try? data.write(to: fileURL, options: [.atomic])
    }
}
