import Foundation

/// What kind of asset the prompt is being crafted for.
enum PromptMode: String, Codable, CaseIterable, Identifiable {
    case image
    case video

    var id: String { rawValue }

    var title: String {
        switch self {
        case .image: return "Image"
        case .video: return "Video"
        }
    }

    var systemImage: String {
        switch self {
        case .image: return "photo.artframe"
        case .video: return "film.stack"
        }
    }
}

/// A single generated prompt, persisted locally.
struct GeneratedPrompt: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var text: String
    var mode: PromptMode
    var subject: String
    var createdAt: Date = Date()
    var isFavorite: Bool = false
}

/// The dials the user can turn before generating.
/// Every field is optional/free — nothing here is filtered or moderated; the
/// app runs entirely on-device and never contacts a server.
struct PromptSettings: Codable, Equatable {
    var mode: PromptMode = .image
    var subject: String = ""

    /// 0 = sparse, 1 = balanced, 2 = maximalist "god mode"
    var intensity: Int = 1

    var includeStyle: Bool = true
    var includeLighting: Bool = true
    var includeComposition: Bool = true
    var includeColor: Bool = true
    var includeMood: Bool = true
    var includeCamera: Bool = true
    var includeDetailBoosters: Bool = true

    // Video-only dials
    var includeMotion: Bool = true
    var includeCameraMove: Bool = true
}
