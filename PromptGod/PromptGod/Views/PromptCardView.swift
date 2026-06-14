import SwiftUI

/// Compact row used in History and Favorites lists.
struct PromptCardView: View {
    let prompt: GeneratedPrompt
    let onToggleFavorite: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(prompt.mode.title, systemImage: prompt.mode.systemImage)
                    .font(.caption.bold())
                    .foregroundStyle(.purple)
                Spacer()
                Text(prompt.createdAt, format: .dateTime.month().day().hour().minute())
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(prompt.text)
                .font(.subheadline)
                .textSelection(.enabled)

            HStack(spacing: 16) {
                Button {
                    Clipboard.copy(prompt.text)
                    Haptics.light()
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
                ShareLink(item: prompt.text) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                Spacer()
                Button(action: onToggleFavorite) {
                    Image(systemName: prompt.isFavorite ? "star.fill" : "star")
                        .foregroundStyle(prompt.isFavorite ? .yellow : .secondary)
                }
            }
            .font(.caption.bold())
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
    }
}
